const { bodyWidth: optBodyWidth, coverWidth: optCoverWidth, optimize: runOptimizer } = window.GIOptimizer;
const { validateProject: validateProjectData, APP: PROJECT_APP, VERSION: PROJECT_VERSION } = window.GIProject;

const DEFAULT_WIDTHS = [1000, 1250, 1500, 1800, 2000];
const SAMPLE = [[50,50,350,'both'],[75,50,648,'both'],[100,50,35,'both'],[150,50,709,'both'],[300,50,7,'both'],[200,50,7,'both'],[300,100,26,'both'],[200,100,26,'both']];
const state = {
  activeTab: 1,
  tab1: { sheetLength: 2400, kerf: 0, thickness: 1.2, expandSpacing: false, widths: DEFAULT_WIDTHS.map(value => ({ value, checked:true })), orders: [] },
  tab2: { sheetLength: 2400, kerf: 0, bodyThickness: 1.2, coverThickness: 0.8, expandSpacing: false, widths: DEFAULT_WIDTHS.map(value => ({ value, checked:true })), orders: [] },
  results: {}
};

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function field(id, label, value, step='any') { return `<label>${label}<input id="${id}" type="number" step="${step}" value="${esc(value)}"></label>`; }
function settings(tab) {
  const s = state[tab];
  const thickness = tab === 'tab1' ? field(`${tab}-thickness`, 'Thickness (mm)', s.thickness, '0.1') : `${field(`${tab}-bodyThickness`, 'Body thickness (mm)', s.bodyThickness, '0.1')}${field(`${tab}-coverThickness`, 'Cover thickness (mm)', s.coverThickness, '0.1')}`;
  return `<div class="card"><h2>Inputs</h2>${field(`${tab}-sheetLength`, 'Mother sheet length (mm)', s.sheetLength, '0.1')}${field(`${tab}-kerf`, 'Kerf between cuts (mm)', s.kerf, '0.1')}${thickness}<label><input id="${tab}-expandSpacing" type="checkbox" ${s.expandSpacing?'checked':''}> Add extra spacing between strips</label><h3>Mother sheet widths (mm)</h3><div id="${tab}-widths" class="widths">${s.widths.map((w,i)=>`<label><input type="checkbox" data-width-index="${i}" ${w.checked?'checked':''}> ${w.value}</label>`).join('')}</div><div class="actions"><input id="${tab}-newWidth" type="number" placeholder="Custom width"><button class="secondary" data-action="add-width" data-tab="${tab}">Add width</button></div><div class="actions"><button class="primary" data-action="calculate" data-tab="${tab}">Calculate</button><button class="secondary" data-action="sample" data-tab="${tab}">Load Sample Data</button><button class="secondary" data-action="clear" data-tab="${tab}">Clear Orders</button></div></div>`;
}
function orderTable(tab) {
  const s = state[tab];
  const rows = s.orders.length ? s.orders : Array.from({length:5},()=>({W:'',H:'',qty:'',mode:'both'}));
  if (!s.orders.length) s.orders = rows;
  return `<div class="card orders"><h2>Orders</h2><table><thead><tr><th>#</th><th>W (mm)</th><th>H (mm)</th><th>Qty</th><th>Parts</th><th>Body strip</th><th>Cover strip</th><th></th></tr></thead><tbody>${rows.map((o,i)=>`<tr data-row="${i}"><td>${i+1}</td><td><input data-field="W" type="number" min="0" value="${esc(o.W)}"></td><td><input data-field="H" type="number" min="0" value="${esc(o.H)}" ${o.mode==='cover-only'?'disabled':''}></td><td><input data-field="qty" type="number" min="0" value="${esc(o.qty)}"></td><td><select data-field="mode"><option value="both" ${o.mode==='both'?'selected':''}>Body + Cover</option><option value="body-only" ${o.mode==='body-only'?'selected':''}>Body only</option><option value="cover-only" ${o.mode==='cover-only'?'selected':''}>Cover only</option></select></td><td>${o.mode==='cover-only'?'—':(o.W!==''&&o.H!==''?optBodyWidth(Number(o.W),Number(o.H)):'—')}</td><td>${o.mode==='body-only'?'—':(o.W!==''?optCoverWidth(Number(o.W)):'—')}</td><td><button class="danger" data-action="remove-row" data-tab="${tab}" data-row="${i}">×</button></td></tr>`).join('')}</tbody></table><div class="actions"><button class="secondary" data-action="add-row" data-tab="${tab}">Add order row</button></div></div>`;
}
function render(tab) {
  const title = tab === 'tab1' ? 'Combined optimization' : 'Separate body and cover optimization';
  document.getElementById(tab).innerHTML = `<div class="grid"><div>${settings(tab)}</div><div><div class="card"><h2>${title}</h2><div class="notice">Blank rows are allowed. They are saved but excluded from calculations until completed.</div></div>${orderTable(tab)}<div id="${tab}-results"></div></div></div>`;
}
function readState(tab) {
  const s = state[tab];
  s.sheetLength = Number(document.getElementById(`${tab}-sheetLength`).value);
  s.kerf = Number(document.getElementById(`${tab}-kerf`).value || 0);
  if (tab === 'tab1') s.thickness = Number(document.getElementById(`${tab}-thickness`).value);
  else { s.bodyThickness = Number(document.getElementById(`${tab}-bodyThickness`).value); s.coverThickness = Number(document.getElementById(`${tab}-coverThickness`).value); }
  s.expandSpacing = document.getElementById(`${tab}-expandSpacing`).checked;
  s.widths.forEach((width, i) => { const input = document.querySelector(`#${tab}-widths input[data-width-index="${i}"]`); if (input) width.checked = input.checked; });
  s.orders = [...document.querySelectorAll(`#${tab} tr[data-row]`)].map(row => {
    const get = name => row.querySelector(`[data-field="${name}"]`).value;
    return { W:get('W'), H:get('H'), qty:get('qty'), mode:get('mode') };
  });
}
function activeWidths(s) { return s.widths.filter(w=>w.checked).map(w=>w.value); }
function completedOrders(s) {
  return s.orders.map((o,i)=>({no:i+1,W:Number(o.W),H:o.mode==='cover-only'?0:Number(o.H),qty:Number(o.qty),mode:o.mode})).filter(o=>o.W>0&&o.qty>0&&(o.mode==='cover-only'||o.H>0));
}
function planHtml(plan, demand, sheetLength, thickness, best) {
  const strips = demand.reduce((sum,e)=>sum+e.qty,0);
  return `<div class="plan ${best?'best':''}"><div class="plan-title"><strong>${esc(plan.label)} ${best?'<span class="badge">RECOMMENDED</span>':''}</strong><span>${plan.stats.totalSheets} sheets</span></div><div class="summary"><div class="metric"><b>${strips}</b><span>Required strips</span></div><div class="metric"><b>${plan.stats.totalWidthWaste.toLocaleString()}</b><span>Width waste (mm)</span></div><div class="metric"><b>${Math.round(plan.stats.areaWaste).toLocaleString()}</b><span>Area waste (mm²)</span></div><div class="metric"><b>${plan.stats.utilization.toFixed(1)}%</b><span>Utilization</span></div></div>${plan.sheets.slice(0,30).map(sheet=>`<div class="bar">${sheet.cuts.map(c=>`<div class="cut" style="width:${(c.width/sheet.motherWidth)*100}%">${c.width}</div>`).join('')}<div class="waste"></div></div>`).join('')}<p><b>Sheets by width:</b> ${Object.entries(plan.stats.byWidth).map(([w,n])=>`${w} × ${n}`).join(', ')} &nbsp; <b>Estimated weight:</b> ${plan.stats.totalWeightKg.toFixed(1)} kg</p></div>`;
}
function calculate(tab) {
  readState(tab);
  const s = state[tab], orders = completedOrders(s);
  if (!orders.length) throw new Error('Add at least one completed order row.');
  const widths = activeWidths(s);
  if (tab === 'tab1') {
    state.results.tab1 = runOptimizer({orders,widths,sheetLength:s.sheetLength,kerf:s.kerf,thickness:s.thickness,mode:'combined'});
    document.getElementById(tab+'-results').innerHTML = `<div class="card"><h2>Recommended combined plan</h2>${state.results.tab1.plans.map((p,i)=>planHtml(p,state.results.tab1.demand,s.sheetLength,s.thickness,i===state.results.tab1.bestIndex)).join('')}</div>`;
  } else {
    const body = runOptimizer({orders,widths,sheetLength:s.sheetLength,kerf:s.kerf,thickness:s.bodyThickness,mode:'body'});
    const cover = runOptimizer({orders,widths,sheetLength:s.sheetLength,kerf:s.kerf,thickness:s.coverThickness,mode:'cover'});
    state.results.tab2 = {body,cover};
    document.getElementById(tab+'-results').innerHTML = `<div class="card"><h2>Recommended split plans</h2><h3>Body</h3>${body.plans.map((p,i)=>planHtml(p,body.demand,s.sheetLength,s.bodyThickness,i===body.bestIndex)).join('') || '<div class="empty">No body demand.</div>'}<h3>Cover</h3>${cover.plans.map((p,i)=>planHtml(p,cover.demand,s.sheetLength,s.coverThickness,i===cover.bestIndex)).join('') || '<div class="empty">No cover demand.</div>'}</div>`;
  }
}
function newProject() {
  state.activeTab = 1;
  state.tab1 = { sheetLength:2400,kerf:0,thickness:1.2,expandSpacing:false,widths:DEFAULT_WIDTHS.map(value=>({value,checked:true})),orders:[] };
  state.tab2 = { sheetLength:2400,kerf:0,bodyThickness:1.2,coverThickness:0.8,expandSpacing:false,widths:DEFAULT_WIDTHS.map(value=>({value,checked:true})),orders:[] };
  renderAll();
}
function renderAll() { render('tab1'); render('tab2'); switchTab(state.activeTab); }
function switchTab(tab) { state.activeTab=Number(tab); document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',Number(b.dataset.tab)===state.activeTab)); document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`tab${state.activeTab}`)); }
function projectNumber(value) {
  return value === '' || value === null ? '' : Number(value);
}
function projectTab(s, tab) {
  const orders = s.orders.map(order => ({
    W: projectNumber(order.W),
    H: projectNumber(order.H),
    qty: projectNumber(order.qty),
    mode: order.mode
  }));
  return {
    sheetLength:s.sheetLength,
    kerf:s.kerf,
    expandSpacing:s.expandSpacing,
    motherWidths:s.widths,
    orders,
    ...(tab===1?{thickness:s.thickness}:{bodyThickness:s.bodyThickness,coverThickness:s.coverThickness})
  };
}
window.getProjectData = () => ({app:PROJECT_APP,version:PROJECT_VERSION,savedAt:new Date().toISOString(),activeTab:state.activeTab,tab1:projectTab(state.tab1,1),tab2:projectTab(state.tab2,2)});
window.loadProjectData = data => { const valid=validateProjectData(data); state.activeTab=valid.activeTab; for (const [key,source] of [['tab1',valid.tab1],['tab2',valid.tab2]]) state[key]={...state[key],...source,widths:source.motherWidths,orders:source.orders}; renderAll(); };
document.addEventListener('input', () => window.desktop.markDirty());
document.addEventListener('change', () => window.desktop.markDirty());
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const tab=button.dataset.tab, action=button.dataset.action, s=state[tab];
  if (action==='add-row') { readState(tab); s.orders.push({W:'',H:'',qty:'',mode:'both'}); render(tab); switchTab(tab==='tab1'?1:2); }
  if (action==='remove-row') { readState(tab); s.orders.splice(Number(button.dataset.row),1); render(tab); switchTab(tab==='tab1'?1:2); window.desktop.markDirty(); }
  if (action==='clear') { readState(tab); s.orders=[]; render(tab); switchTab(tab==='tab1'?1:2); }
  if (action==='sample') { s.orders=SAMPLE.map(([W,H,qty,mode])=>({W,H,qty,mode})); render(tab); switchTab(tab==='tab1'?1:2); }
  if (action==='add-width') { readState(tab); const input=document.getElementById(`${tab}-newWidth`), value=Number(input.value); if (!(value>0)||s.widths.some(w=>w.value===value)) return; s.widths.push({value,checked:true}); input.value=''; render(tab); switchTab(tab==='tab1'?1:2); }
  if (action==='calculate') { try { calculate(tab); } catch(error) { alert(error.message); } }
});
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
window.desktop.onLoad(data => { try { window.loadProjectData(data); } catch(error) { alert(`Invalid GI Sheet Project file: ${error.message}`); } });
window.desktop.onNew(newProject);
renderAll();
