const APP = 'GI Sheet Optimizer';
const VERSION = 1;

function isNonNegative(value) {
  return value === '' || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function validateOrders(orders, label) {
  if (!Array.isArray(orders)) throw new Error(`${label}.orders must be an array.`);
  return orders.map((order, index) => {
    if (!order || typeof order !== 'object') throw new Error(`${label}, row ${index + 1}: order must be an object.`);
    for (const field of ['W', 'H', 'qty']) {
      if (!isNonNegative(order[field])) throw new Error(`${label}, row ${index + 1}: ${field} is not a number.`);
    }
    const mode = order.mode === undefined ? 'both' : order.mode;
    if (!['both', 'body-only', 'cover-only'].includes(mode)) throw new Error(`${label}, row ${index + 1}: invalid mode.`);
    return { W: order.W, H: order.H, qty: order.qty, mode };
  });
}

function validateProject(data) {
  if (!data || typeof data !== 'object') throw new Error('Project data must be an object.');
  if (data.app !== APP) throw new Error('Invalid GI Sheet Project file: wrong app name.');
  if (data.version !== VERSION) throw new Error('Invalid GI Sheet Project file: unsupported version.');
  if (![1, 2].includes(data.activeTab)) throw new Error('Invalid GI Sheet Project file: activeTab must be 1 or 2.');
  for (const key of ['tab1', 'tab2']) {
    if (!data[key] || typeof data[key] !== 'object') throw new Error(`Invalid GI Sheet Project file: ${key} is missing.`);
    if (!Array.isArray(data[key].motherWidths)) throw new Error(`Invalid GI Sheet Project file: ${key}.motherWidths must be an array.`);
    data[key].motherWidths.forEach((width, index) => {
      if (!width || typeof width.value !== 'number' || width.value <= 0 || typeof width.checked !== 'boolean') {
        throw new Error(`Invalid GI Sheet Project file: ${key}.motherWidths[${index}] is invalid.`);
      }
    });
    validateOrders(data[key].orders, key === 'tab1' ? 'Tab 1' : 'Tab 2');
  }
  return data;
}

const projectApi = { APP, VERSION, validateProject };
if (typeof module !== 'undefined' && module.exports) module.exports = projectApi;
if (typeof window !== 'undefined') window.GIProject = projectApi;
