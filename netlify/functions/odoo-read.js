// ═══════════════════════════════════════════════════════════════
// odoo-read — live account feed for the Field Sales Tool.
//
// Reads EVERY customer (and their order history) straight from Odoo
// via the JSON-RPC external API, and returns them in the exact shape
// the field tool already expects (see sales/field-tool/snapshot.js).
// This is the "go live" swap described in field-core.js: the tool
// stops reading the frozen snapshot and starts reading the real book,
// 100% of each salesperson's customers, current as of right now.
//
// Credentials live ONLY as Netlify environment variables — never in
// the repo. Set these in Netlify › Site settings › Environment:
//   ODOO_URL       e.g. https://fratello.odoo.com   (https required)
//   ODOO_DB        the Odoo database name
//   ODOO_USERNAME  the integration user's login/email
//   ODOO_API_KEY   that user's API key  (Odoo › Preferences › Account Security)
//
// If any are missing the function returns 503 and the tool quietly
// falls back to the committed snapshot, so nothing ever breaks.
//
// ┌───────────────────────────────────────────────────────────────┐
// │ READ-ONLY — THIS IS A HARD GUARANTEE, NOT A CONVENTION.        │
// │ This function NEVER creates, writes, updates, deletes, moves,  │
// │ or otherwise changes ANYTHING in Odoo. Every call goes through │
// │ call(), which refuses any method not on READ_ONLY_METHODS      │
// │ below (search_read / read / fields_get / search_count / …).    │
// │ A write/create/unlink call THROWS before it can reach Odoo —   │
// │ so even a future edit can't silently make this destructive.    │
// │ Defense in depth: also give the ODOO_API_KEY user read-only    │
// │ access rights in Odoo so the server itself would reject writes.│
// └───────────────────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════
const https = require('https');
const { authenticateRequest, json, requireMethod, roleTier } = require('./templates/_runtime');

const ODOO_URL = String(process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB = process.env.ODOO_DB || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME || '';
const ODOO_API_KEY = process.env.ODOO_API_KEY || process.env.ODOO_PASSWORD || '';

const MONTHS_WINDOW = 12;   // trailing months counted toward 12-mo $ / chart
const RECENT_ORDERS = 5;    // order-history depth shown per account
const SALES_TIERS = new Set(['owner', 'controller', 'sales']);
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── tiny JSON-RPC client over https (no extra dependency) ──────────
function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const body = JSON.stringify(payload);
        const req = https.request({
            method: 'POST',
            hostname: u.hostname,
            port: u.port || 443,
            path: `${u.pathname}${u.search}`,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data || '{}')); }
                catch (e) { reject(new Error('Odoo returned a non-JSON response.')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => req.destroy(new Error('Odoo request timed out.')));
        req.write(body);
        req.end();
    });
}

async function rpc(service, method, args) {
    const out = await postJson(`${ODOO_URL}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args }
    });
    if (out.error) {
        const e = out.error;
        throw new Error((e.data && e.data.message) || e.message || 'Odoo RPC error');
    }
    return out.result;
}

let _uid = null;
async function login() {
    if (_uid) return _uid;
    _uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
    if (!_uid) throw new Error('Odoo authentication failed — check ODOO_USERNAME / ODOO_API_KEY.');
    return _uid;
}
// The ONLY Odoo methods this function is ever allowed to invoke. All of them
// are non-mutating reads. Anything that could change Odoo data — create, write,
// unlink, copy, action_*, etc. — is deliberately absent, so call() throws if
// any code (now or later) tries to use one. This is the read-only firewall.
const READ_ONLY_METHODS = new Set([
    'search_read', 'read', 'search', 'search_count', 'fields_get', 'name_get', 'read_group'
]);
async function call(modelName, method, params, kwargs = {}) {
    if (!READ_ONLY_METHODS.has(method)) {
        throw new Error(`Blocked "${method}" on ${modelName}: odoo-read is strictly read-only and may only read from Odoo.`);
    }
    const uid = await login();
    return rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, modelName, method, params, kwargs]);
}

// Only request fields the live database actually has — keeps the function
// working across Odoo versions / custom configs instead of 500-ing on a
// field that doesn't exist here.
async function availableFields(modelName, wanted) {
    const meta = await call(modelName, 'fields_get', [], { attributes: ['type'] });
    return wanted.filter(f => meta && meta[f]);
}

// ── helpers ───────────────────────────────────────────────────────
const m2oName = v => (Array.isArray(v) ? v[1] : '');
const m2oId = v => (Array.isArray(v) ? v[0] : (v || null));
const dayOf = v => String(v || '').slice(0, 10);
const round = n => Math.round((Number(n) || 0));

function slugify(name) {
    return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function windowStart() {
    const d = new Date();
    d.setMonth(d.getMonth() - (MONTHS_WINDOW - 1));
    d.setDate(1);
    return d.toISOString().slice(0, 10);
}
function looksEcom(text) {
    return /e-?com|webshop|web ?site|online|shopify/i.test(String(text || ''));
}

// ── build the live snapshot ───────────────────────────────────────
async function buildSnapshot() {
    const since = windowStart();

    // 1) Every customer (customer_rank > 0 = "we sell to them").
    const partnerWanted = ['name', 'user_id', 'city', 'street', 'state_id', 'phone', 'mobile',
        'email', 'property_product_pricelist', 'team_id', 'customer_rank'];
    const pFields = await availableFields('res.partner', partnerWanted);
    const domain = pFields.includes('customer_rank') ? [['customer_rank', '>', 0]] : [];
    const partners = await call('res.partner', 'search_read', [domain], { fields: pFields, order: 'name asc' });

    // 2) Confirmed orders in the trailing window — drives $ / counts / chart.
    const orders = await call('sale.order', 'search_read',
        [[['date_order', '>=', `${since} 00:00:00`], ['state', 'in', ['sale', 'done']]]],
        { fields: ['name', 'partner_id', 'date_order', 'amount_total'], order: 'date_order desc' });

    const ordersByPartner = new Map();
    for (const o of orders) {
        const pid = m2oId(o.partner_id);
        if (!pid) continue;
        if (!ordersByPartner.has(pid)) ordersByPartner.set(pid, []);
        ordersByPartner.get(pid).push(o);
    }

    // 3) Line items — only for the few recent orders we actually display.
    const recentOrderIds = [];
    for (const list of ordersByPartner.values()) {
        list.slice(0, RECENT_ORDERS).forEach(o => recentOrderIds.push(o.id));
    }
    const linesByOrder = new Map();
    if (recentOrderIds.length) {
        const lines = await call('sale.order.line', 'search_read',
            [[['order_id', 'in', recentOrderIds], ['display_type', '=', false]]],
            { fields: ['order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'] });
        for (const l of lines) {
            const oid = m2oId(l.order_id);
            if (!linesByOrder.has(oid)) linesByOrder.set(oid, []);
            linesByOrder.get(oid).push(l);
        }
    }

    // 4) Stitch into the field-tool account shape.
    const repIds = new Set();
    const accounts = partners.map((p) => {
        const repId = m2oId(p.user_id) || 'house';
        if (typeof repId === 'number') repIds.add(repId);

        const myOrders = ordersByPartner.get(p.id) || [];
        const ytd = myOrders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
        const lastOrder = myOrders.length ? dayOf(myOrders[0].date_order) : '';

        // monthly buckets (only months with activity, oldest → newest)
        const buckets = new Map();
        for (const o of myOrders) {
            const key = dayOf(o.date_order).slice(0, 7);
            buckets.set(key, (buckets.get(key) || 0) + (Number(o.amount_total) || 0));
        }
        const months = [...buckets.keys()].sort().map(key => ({
            label: MONTH_LABELS[Number(key.slice(5, 7)) - 1] || key,
            amt: round(buckets.get(key))
        }));

        // recent orders + their lines
        const recentOrders = myOrders.slice(0, RECENT_ORDERS).map((o) => {
            const lines = (linesByOrder.get(o.id) || []).map(l => ({
                product: m2oName(l.product_id) || l.name || '',
                qty: Number(l.product_uom_qty) || 0,
                price: Number(l.price_unit) || 0,
                subtotal: Number(l.price_subtotal) || 0
            }));
            return { name: o.name || '', date: dayOf(o.date_order), amount: Number(o.amount_total) || 0, lines };
        });

        // top products, summed across those recent orders
        const prodQty = new Map();
        for (const ro of recentOrders) {
            for (const l of ro.lines) {
                if (!l.product) continue;
                prodQty.set(l.product, (prodQty.get(l.product) || 0) + l.qty);
            }
        }
        const topProducts = [...prodQty.entries()]
            .sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([name, qty]) => ({ name, qty }));

        const priceLevel = m2oName(p.property_product_pricelist);
        const channel = m2oName(p.team_id) || 'Uncategorized';

        return {
            id: p.id,
            repId,
            name: p.name || '(unnamed)',
            channel,
            ecom: looksEcom(`${channel} ${priceLevel}`),
            priceLevel,
            city: p.city || '',
            street: p.street || '',
            province: m2oName(p.state_id),
            phone: p.phone || p.mobile || '',
            email: p.email || '',
            lastOrder,
            ytd: round(ytd),
            orders: myOrders.length,
            months,
            topProducts,
            recentOrders
        };
    });

    // 5) Reps = the salespeople who actually own customers.
    let reps = [];
    if (repIds.size) {
        const users = await call('res.users', 'read', [[...repIds]], { fields: ['name', 'login', 'email'] });
        reps = users.map(u => ({
            id: u.id,
            name: u.name || u.login || `User ${u.id}`,
            slug: slugify(u.name || u.login),
            email: String(u.email || u.login || '').toLowerCase()
        }));
    }

    return {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: 'odoo-live',
        reps,
        accounts
    };
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['GET', 'POST']);
    if (methodError) return methodError;

    if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_API_KEY) {
        return json(503, { error: 'Odoo is not configured. Set ODOO_URL, ODOO_DB, ODOO_USERNAME and ODOO_API_KEY in Netlify.' });
    }

    try {
        const session = await authenticateRequest(event);
        if (!session) return json(401, { error: 'Authentication required.' });
        if (!SALES_TIERS.has(roleTier(session.user))) {
            return json(403, { error: 'Sales access required.' });
        }

        _uid = null; // fresh auth per cold-start invocation
        const snapshot = await buildSnapshot();
        return json(200, snapshot);
    } catch (error) {
        console.error('odoo-read failed', error);
        return json(502, { error: `Could not read from Odoo: ${error.message}` });
    }
};
