const BODY_ALLOWANCE = 20;
const COVER_ALLOWANCE = 22;
const KG_PER_M2_PER_MM = 8;

function bodyWidth(W, H) {
  return W + 2 * H + BODY_ALLOWANCE;
}

function coverWidth(W) {
  return W + COVER_ALLOWANCE;
}

function addDemand(map, width, qty, origin) {
  if (!map.has(width)) map.set(width, { width, qty: 0, origins: [] });
  const entry = map.get(width);
  entry.qty += qty;
  entry.origins.push(origin);
}

function buildDemand(orders, pool) {
  const map = new Map();
  for (const order of orders) {
    const wantsBody = order.mode !== 'cover-only';
    const wantsCover = order.mode !== 'body-only';
    if (pool !== 'cover' && wantsBody) {
      addDemand(map, bodyWidth(order.W, order.H), order.qty, { orderNo: order.no, kind: 'body' });
    }
    if (pool !== 'body' && wantsCover) {
      addDemand(map, coverWidth(order.W), order.qty, { orderNo: order.no, kind: 'cover' });
    }
  }
  return [...map.values()].sort((a, b) => b.width - a.width);
}

function expand(demand) {
  const pieces = [];
  for (const item of demand) {
    for (let i = 0; i < item.qty; i += 1) pieces.push({ width: item.width });
  }
  return pieces.sort((a, b) => b.width - a.width);
}

function packSingle(demand, motherWidth, kerf) {
  const sheets = [];
  for (const piece of expand(demand)) {
    if (piece.width > motherWidth) throw new Error(`Strip width ${piece.width}mm exceeds mother sheet width ${motherWidth}mm`);
    let best = -1;
    let bestRemaining = Infinity;
    sheets.forEach((sheet, index) => {
      const required = piece.width + (sheet.cuts.length ? kerf : 0);
      if (sheet.remaining >= required && sheet.remaining < bestRemaining) {
        best = index;
        bestRemaining = sheet.remaining;
      }
    });
    if (best >= 0) {
      sheets[best].remaining -= piece.width + kerf;
      sheets[best].cuts.push(piece);
    } else {
      sheets.push({ motherWidth, remaining: motherWidth - piece.width, cuts: [piece] });
    }
  }
  return sheets;
}

function packMixed(demand, widths, kerf) {
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const sheets = [];
  for (const piece of expand(demand)) {
    let best = -1;
    let bestRemaining = Infinity;
    sheets.forEach((sheet, index) => {
      const required = piece.width + (sheet.cuts.length ? kerf : 0);
      if (sheet.remaining >= required && sheet.remaining < bestRemaining) {
        best = index;
        bestRemaining = sheet.remaining;
      }
    });
    if (best >= 0) {
      sheets[best].remaining -= piece.width + kerf;
      sheets[best].cuts.push(piece);
    } else {
      const motherWidth = sortedWidths.find(width => width >= piece.width);
      if (!motherWidth) throw new Error(`Strip width ${piece.width}mm exceeds the largest enabled mother width`);
      sheets.push({ motherWidth, remaining: motherWidth - piece.width, cuts: [piece] });
    }
  }
  return sheets;
}

function stats(sheets, sheetLength, thickness) {
  const byWidth = {};
  let totalWidthWaste = 0;
  let usedArea = 0;
  let totalArea = 0;
  let totalWeightKg = 0;
  sheets.forEach(sheet => {
    byWidth[sheet.motherWidth] = (byWidth[sheet.motherWidth] || 0) + 1;
    totalWidthWaste += sheet.remaining;
    usedArea += sheet.cuts.reduce((sum, cut) => sum + cut.width, 0) * sheetLength;
    totalArea += sheet.motherWidth * sheetLength;
    totalWeightKg += (sheet.motherWidth / 1000) * (sheetLength / 1000) * thickness * KG_PER_M2_PER_MM;
  });
  return {
    totalSheets: sheets.length,
    byWidth,
    totalWidthWaste,
    areaWaste: totalArea - usedArea,
    totalArea,
    utilization: totalArea ? (usedArea / totalArea) * 100 : 0,
    totalWeightKg
  };
}

function createPlans(demand, widths, sheetLength, kerf, thickness) {
  const plans = [];
  widths.forEach(motherWidth => {
    if (demand.every(item => item.width <= motherWidth)) {
      const sheets = packSingle(demand, motherWidth, kerf);
      plans.push({ label: `Single ${motherWidth} mm`, kind: 'single', motherWidth, sheets, stats: stats(sheets, sheetLength, thickness) });
    }
  });
  if (widths.length > 1) {
    const sheets = packMixed(demand, widths, kerf);
    plans.push({ label: `Mixed (${widths.join(' / ')} mm)`, kind: 'mixed', motherWidth: null, sheets, stats: stats(sheets, sheetLength, thickness) });
  }
  plans.sort((a, b) => (
    a.stats.totalSheets - b.stats.totalSheets ||
    a.stats.areaWaste - b.stats.areaWaste ||
    a.stats.totalWidthWaste - b.stats.totalWidthWaste
  ));
  return { plans, bestIndex: 0 };
}

function optimize({ orders, widths, sheetLength, kerf, thickness, mode }) {
  const demand = buildDemand(orders, mode === 'combined' ? 'both' : mode);
  if (!demand.length) return { demand, plans: [], bestIndex: 0 };
  if (!widths.length) throw new Error('Select at least one mother sheet width.');
  if (!(sheetLength > 0) || !(thickness > 0) || kerf < 0) throw new Error('Sheet length and thickness must be positive; kerf cannot be negative.');
  return { demand, ...createPlans(demand, widths, sheetLength, kerf, thickness) };
}

const optimizerApi = { bodyWidth, coverWidth, buildDemand, optimize };
if (typeof module !== 'undefined' && module.exports) module.exports = optimizerApi;
if (typeof window !== 'undefined') window.GIOptimizer = optimizerApi;
