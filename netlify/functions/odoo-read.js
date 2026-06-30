// ── Field Sales Tool: secure READ-ONLY Odoo proxy ────────────────────────────
// The Odoo API key lives ONLY here (Netlify env vars), never in the browser.
// Every request is authenticated against the Hub (Firebase) and authorized to
// sales/owner/controller. A sales rep can only read THEIR OWN book; owners and
// controllers can read any rep or "all". Named actions only — the model, fields,
// and domain are hardcoded server-side, so a client can never query arbitrary data.
//
// Required Netlify environment variables:
//   ODOO_URL=https://fratello.odoo.com
//   ODOO_DB=fratello-main-10408462
//   ODOO_USERNAME=<service login email>
//   ODOO_API_KEY=<the Odoo API key>
const { authenticateRequest, json, parseBody, requireMethod } = require('./templates/_runtime');

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USERNAME;
const ODOO_KEY = process.env.ODOO_API_KEY;

// Hub login email -> Odoo salesperson id. (A rep is locked to their own book.)
const REP_BY_EMAIL = {
  'joel.may@fratellocoffee.com': 11,
  'darcy.watsham@fratellocoffee.com': 9,
  'russ@fratellocoffee.com': 10,
  'russ.prefontaine@fratellocoffee.com': 10,
};
const FIELD_REP_IDS = [9, 10, 11];
const CONFIRMED = ['sale', 'done'];
const SINCE = '2025-07-01';                 // ~12 months for the $ window
const ONLINE = ['online', 'shopify', 'e-com', 'ecom'];
const isEcom = ch => ONLINE.some(k => String(ch || '').toLowerCase().includes(k));

// ── Odoo JSON-RPC (server-side; the key never leaves this function) ──
let _uid = null;
async function rpc(service, method, args) {
  const r = await fetch(ODOO_URL + '/jsonrpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  const j = await r.json();
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'Odoo error');
  return j.result;
}
async function uid() {
  if (_uid) return _uid;
  _uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_KEY, {}]);
  if (!_uid) throw new Error('Odoo authentication failed — check the service login / API key.');
  return _uid;
}
async function kw(model, method, args, kwargs) {
  return rpc('object', 'execute_kw', [ODOO_DB, await uid(), ODOO_KEY, model, method, args, kwargs || {}]);
}

function roleTier(user) {
  return String((user && (user.role_tier || user.roleTier || user.profile)) || '').trim().toLowerCase();
}
function ymd(s) { return s ? String(s).slice(0, 10) : ''; }

// Resolve which accounts the caller may see. Returns an Odoo domain or null (denied).
function scopeDomain(tier, email, repParam) {
  const mgr = tier === 'owner' || tier === 'controller';
  if (mgr) {
    if (!repParam || repParam === 'all') return ['|', ['user_id', 'in', FIELD_REP_IDS], ['user_id', '=', false]];
    if (repParam === 'house') return [['user_id', '=', false]];
    const rid = Number(repParam);
    if (FIELD_REP_IDS.includes(rid)) return [['user_id', '=', rid]];
    return ['|', ['user_id', 'in', FIELD_REP_IDS], ['user_id', '=', false]];
  }
  if (tier === 'sales') {
    const rid = REP_BY_EMAIL[String(email || '').toLowerCase()];
    return rid ? [['user_id', '=', rid]] : null;   // unmapped sales rep -> no access
  }
  return null;
}

exports.handler = async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_KEY) {
    return json(503, { error: 'Odoo is not configured yet. Add ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY in Netlify.' });
  }
  try {
    const session = await authenticateRequest(event);
    const user = session && session.user;
    if (!user) return json(401, { error: 'Please sign in to the Hub again.' });
    const tier = roleTier(user);
    if (!['owner', 'controller', 'sales'].includes(tier)) return json(403, { error: 'The Field Sales Tool is for sales staff.' });

    const body = parseBody(event) || {};
    const action = body.action;

    if (action === 'list') {
      const domain = scopeDomain(tier, user.email, body.rep);
      if (!domain) return json(200, { accounts: [] });
      const fields = ['name', 'x_studio_sales_channel', 'city', 'street', 'state_id', 'phone', 'mobile', 'email', 'property_product_pricelist', 'user_id'];
      const limit = Math.min(Number(body.limit) || 4000, 6000);
      const offset = Number(body.offset) || 0;
      const rows = await kw('res.partner', 'search_read', [[['customer_rank', '>', 0]].concat(domain)], { fields, limit, offset, order: 'name' });
      const accounts = rows.map(a => ({
        id: a.id, repId: (a.user_id && a.user_id[0]) || 'house',
        name: a.name, channel: a.x_studio_sales_channel ? a.x_studio_sales_channel[1] : 'Uncategorized',
        ecom: isEcom(a.x_studio_sales_channel && a.x_studio_sales_channel[1]),
        priceLevel: a.property_product_pricelist ? a.property_product_pricelist[1] : 'Standard',
        city: a.city || '', street: a.street || '', province: a.state_id ? a.state_id[1] : '',
        phone: a.phone || a.mobile || '', email: a.email || '',
      }));
      return json(200, { accounts, more: rows.length === limit });
    }

    if (action === 'agg') {
      const ids = (body.ids || []).map(Number).filter(Boolean).slice(0, 500);
      if (!ids.length) return json(200, { agg: {} });
      const base = [['partner_id', 'in', ids], ['state', 'in', CONFIRMED]];
      const allTime = await kw('sale.order', 'read_group', [base, ['date_order:max'], ['partner_id']]);
      const yr = await kw('sale.order', 'read_group', [base.concat([['date_order', '>=', SINCE]]), ['amount_total'], ['partner_id']]);
      const out = {};
      allTime.forEach(g => { const pid = g.partner_id[0]; out[pid] = { lastOrder: ymd(g.date_order), orders: g.partner_id_count || 0, ytd: 0 }; });
      yr.forEach(g => { const pid = g.partner_id[0]; (out[pid] = out[pid] || { lastOrder: '', orders: 0 }).ytd = Math.round(g.amount_total || 0); });
      return json(200, { agg: out });
    }

    if (action === 'detail') {
      const id = Number(body.id);
      if (!id) return json(400, { error: 'Missing account id.' });
      const base = [['partner_id', '=', id], ['state', 'in', CONFIRMED]];
      const orders = await kw('sale.order', 'search_read', [base], { fields: ['name', 'date_order', 'amount_total'], limit: 6, order: 'date_order desc' });
      const oids = orders.map(o => o.id);
      const lines = oids.length ? await kw('sale.order.line', 'search_read', [[['order_id', 'in', oids]]], { fields: ['order_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'] }) : [];
      const byOrder = {}; const prodQty = {};
      lines.forEach(l => {
        const nm = String(l.name || '').split('\n')[0].slice(0, 40);
        (byOrder[l.order_id[0]] = byOrder[l.order_id[0]] || []).push({ product: nm, qty: l.product_uom_qty, price: l.price_unit, subtotal: l.price_subtotal });
        prodQty[nm] = (prodQty[nm] || 0) + (l.product_uom_qty || 0);
      });
      const recentOrders = orders.map(o => ({ name: o.name, date: ymd(o.date_order), amount: Math.round(o.amount_total * 100) / 100, lines: byOrder[o.id] || [] }));
      const topProducts = Object.entries(prodQty).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, qty]) => ({ name, qty: Math.round(qty * 10) / 10 }));
      const grp = await kw('sale.order', 'read_group', [base.concat([['date_order', '>=', SINCE]]), ['amount_total'], ['date_order:month']]);
      const months = grp.map(g => ({ label: String(g['date_order:month'] || '').slice(0, 3), amt: Math.round(g.amount_total || 0) }));
      return json(200, { detail: { recentOrders, topProducts, months } });
    }

    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    console.error('odoo-read error', e);
    return json(500, { error: e.message || 'Odoo read failed.' });
  }
};
