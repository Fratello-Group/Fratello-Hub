// ── Field Sales Tool: secure READ-ONLY Odoo proxy ────────────────────────────
// The Odoo API key lives ONLY here (Netlify env vars), never in the browser.
// Every request is authenticated against the Hub (Firebase) and authorized to
// sales/owner/controller. A sales rep can only read THEIR OWN book; owners and
// controllers can read any rep or "all". Named actions only — the model, fields,
// and domain are hardcoded server-side, so a client can never query arbitrary data.
//
// Loads progressively so a rep's full book stays fast no matter how big it gets:
//   • list   — every account (name/contact/channel only) for the chosen scope
//   • agg    — 12-mo $, last order, order count for a batch of ids (background)
//   • detail — order history + line items + chart + top products (on tap)
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ READ-ONLY — A HARD GUARANTEE, NOT A CONVENTION.                            │
// │ Defense in depth, three layers:                                            │
// │  1. Named actions only — the client picks list/agg/detail, never a model  │
// │     or method, so it can't ask Odoo to do anything but these three reads.  │
// │  2. READ_ONLY_METHODS firewall — kw() throws before calling Odoo if any    │
// │     code (now or later) names a method that isn't a non-mutating read.     │
// │  3. Recommended: give the ODOO_API_KEY user read-only rights in Odoo so    │
// │     the server itself would refuse a write even if something tried.        │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Required Netlify environment variables:
//   ODOO_URL=https://fratello.odoo.com
//   ODOO_DB=fratello-main-10408462
//   ODOO_USERNAME=<service login email>
//   ODOO_API_KEY=<the Odoo API key>
const { authenticateRequest, json, parseBody, requireMethod, roleTier } = require('./templates/_runtime');

const ODOO_URL = String(process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USERNAME;
const ODOO_KEY = process.env.ODOO_API_KEY || process.env.ODOO_PASSWORD;

// Hub login email -> Odoo salesperson id. (A rep is locked to their own book.)
const REP_BY_EMAIL = {
  'joel.may@fratellocoffee.com': 11,
  'darcy.watsham@fratellocoffee.com': 9,
  'russ@fratellocoffee.com': 10,
  'russ.prefontaine@fratellocoffee.com': 10,
};
const FIELD_REP_IDS = [9, 10, 11];
const CONFIRMED = ['sale', 'done'];
const RPC_TIMEOUT_MS = 20000;
const ONLINE = ['online', 'shopify', 'e-com', 'ecom', 'webshop', 'website'];
const isEcom = ch => ONLINE.some(k => String(ch || '').toLowerCase().includes(k));
const m2o = v => (Array.isArray(v) ? v[1] : '');           // many2one display name
const m2oId = v => (Array.isArray(v) ? v[0] : (v || null)); // many2one id
const ymd = s => (s ? String(s).slice(0, 10) : '');

// Trailing-12-month window start (first day of the month 11 months back), live.
function windowStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ── Odoo JSON-RPC (server-side; the key never leaves this function) ──
async function rpc(service, method, args) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(ODOO_URL + '/jsonrpc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Odoo request timed out.' : ('Could not reach Odoo: ' + e.message));
  } finally { clearTimeout(t); }
  const j = await r.json().catch(() => { throw new Error('Odoo returned a non-JSON response.'); });
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'Odoo error');
  return j.result;
}

let _uid = null;
async function uid() {
  if (_uid) return _uid;
  _uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_KEY, {}]);
  if (!_uid) throw new Error('Odoo authentication failed — check the service login / API key.');
  return _uid;
}

// The ONLY Odoo methods this proxy may ever invoke — every one a non-mutating
// read. create / write / unlink / copy / action_* are deliberately absent, so
// kw() throws before reaching Odoo if any code tries to use one (layer 2 above).
const READ_ONLY_METHODS = new Set(['search_read', 'read', 'search', 'search_count', 'fields_get', 'name_get', 'read_group']);
async function kw(model, method, args, kwargs) {
  if (!READ_ONLY_METHODS.has(method)) {
    throw new Error(`Blocked "${method}" on ${model}: odoo-read is strictly read-only.`);
  }
  return rpc('object', 'execute_kw', [ODOO_DB, await uid(), ODOO_KEY, model, method, args, kwargs || {}]);
}

// Schema tolerance: only ask for partner fields this Odoo actually has, and pick
// whichever channel field exists (custom studio field first, then sales team),
// so a differently-configured Odoo returns data instead of 500-ing. Cached per
// warm invocation.
let _plan = null;
async function partnerPlan() {
  if (_plan) return _plan;
  const meta = await kw('res.partner', 'fields_get', [], { attributes: ['type'] });
  const has = f => !!(meta && meta[f]);
  const base = ['name', 'city', 'street', 'state_id', 'phone', 'mobile', 'email', 'property_product_pricelist', 'user_id'];
  const channelField = has('x_studio_sales_channel') ? 'x_studio_sales_channel' : (has('team_id') ? 'team_id' : null);
  const fields = base.filter(has);
  if (channelField) fields.push(channelField);
  if (has('customer_rank')) fields.push('customer_rank');
  _plan = { fields, channelField, hasRank: has('customer_rank') };
  return _plan;
}

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

// Of the partner ids the client asked about (agg/detail), the subset the caller
// is actually allowed to see — resolved server-side against the SAME ownership
// scope as `list`. This is what stops a rep from reading another rep's order
// history / revenue by passing arbitrary (enumerable) partner ids. Honest calls
// only ever pass ids from their own scoped list, so this never filters them.
async function allowedIds(tier, email, ids) {
  const scope = scopeDomain(tier, email, 'all');
  if (!scope) return [];
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  if (!uniq.length) return [];
  return kw('res.partner', 'search', [scope.concat([['id', 'in', uniq]])], { limit: uniq.length });
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
    const SINCE = windowStart();

    if (action === 'list') {
      const domain = scopeDomain(tier, user.email, body.rep);
      if (!domain) return json(200, { accounts: [] });
      const { fields, channelField, hasRank } = await partnerPlan();
      const limit = Math.min(Number(body.limit) || 4000, 6000);
      const offset = Number(body.offset) || 0;
      const filt = (hasRank ? [['customer_rank', '>', 0]] : []).concat(domain);
      const rows = await kw('res.partner', 'search_read', [filt], { fields, limit, offset, order: 'name' });
      const accounts = rows.map(a => {
        const channel = channelField ? (m2o(a[channelField]) || 'Uncategorized') : 'Uncategorized';
        return {
          id: a.id, repId: m2oId(a.user_id) || 'house', name: a.name,
          channel, ecom: isEcom(channel),
          priceLevel: m2o(a.property_product_pricelist) || 'Standard',
          city: a.city || '', street: a.street || '', province: m2o(a.state_id),
          phone: a.phone || a.mobile || '', email: a.email || '',
        };
      });
      return json(200, { accounts, more: rows.length === limit });
    }

    if (action === 'agg') {
      const ids = (body.ids || []).map(Number).filter(Boolean).slice(0, 500);
      if (!ids.length) return json(200, { agg: {} });
      const allowed = await allowedIds(tier, user.email, ids);   // never aggregate ids outside the caller's territory
      if (!allowed.length) return json(200, { agg: {} });
      const base = [['partner_id', 'in', allowed], ['state', 'in', CONFIRMED]];
      const allTime = await kw('sale.order', 'read_group', [base, ['date_order:max'], ['partner_id']]);
      const yr = await kw('sale.order', 'read_group', [base.concat([['date_order', '>=', SINCE]]), ['amount_total'], ['partner_id']]);
      const out = {};
      allTime.forEach(g => { const pid = m2oId(g.partner_id); out[pid] = { lastOrder: ymd(g.date_order), orders: g.partner_id_count || 0, ytd: 0 }; });
      yr.forEach(g => { const pid = m2oId(g.partner_id); (out[pid] = out[pid] || { lastOrder: '', orders: 0 }).ytd = Math.round(g.amount_total || 0); });
      return json(200, { agg: out });
    }

    if (action === 'detail') {
      const id = Number(body.id);
      if (!id) return json(400, { error: 'Missing account id.' });
      const allowed = await allowedIds(tier, user.email, [id]);   // a rep can only open accounts in their own territory
      if (!allowed.length) return json(403, { error: 'That account is not in your territory.' });
      const base = [['partner_id', '=', id], ['state', 'in', CONFIRMED]];
      const orders = await kw('sale.order', 'search_read', [base], { fields: ['name', 'date_order', 'amount_total'], limit: 6, order: 'date_order desc' });
      const oids = orders.map(o => o.id);
      const lines = oids.length ? await kw('sale.order.line', 'search_read', [[['order_id', 'in', oids], ['display_type', '=', false]]], { fields: ['order_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'] }) : [];
      const byOrder = {}; const prodQty = {};
      lines.forEach(l => {
        const nm = String(l.name || '').split('\n')[0].slice(0, 40);
        (byOrder[m2oId(l.order_id)] = byOrder[m2oId(l.order_id)] || []).push({ product: nm, qty: l.product_uom_qty, price: l.price_unit, subtotal: l.price_subtotal });
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
