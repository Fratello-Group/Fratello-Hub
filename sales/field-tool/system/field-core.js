// ═══════════════════════════════════════════════════════════════
// Field Sales Tool core: auth gate + data layer.
// READS account/order data from the committed Odoo snapshot (snapshot.js).
// WRITES new activity to Firestore (sales_activities / sales_followups /
// sales_settings) — mirrors the CFIA immutable, self-stamped pattern.
// Reps see only their own book; owners/controllers can pick any rep or "All".
// Falls back to localStorage when not signed in (local UX preview only).
// Swap-in for live Odoo: replace snapshotAccounts() with a fetch to the
// odoo-read Netlify function once the API key is set — nothing else changes.
// ═══════════════════════════════════════════════════════════════
import { firebaseConfigured, onHubAuthChange, initFirebase, normalizeEmail, currentIdToken } from '/system/fratello-auth.js';
import {
  collection, addDoc, getDocs, query, where, serverTimestamp, doc, setDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const SALES_ROLES = new Set(['owner', 'controller', 'sales']);
const MANAGERS = new Set(['owner', 'controller']);
// Hub login email -> Odoo salesperson id (the snapshot is keyed by repId).
// Temporary client map for snapshot mode; moves server-side with the live Odoo key.
const REP_BY_EMAIL = {
  'joel.may@fratellocoffee.com': 11,
  'darcy.watsham@fratellocoffee.com': 9,
  'russ@fratellocoffee.com': 10,
  'russ.prefontaine@fratellocoffee.com': 10,
};

const SNAP = (window.FRATELLO_SNAPSHOT || { reps: [], accounts: [] });
const ALL_REP = { id: 'all', name: 'All customers', slug: 'all', email: '*' };
let currentRole = null;

function roleFromLocalStorage() {
  try { return JSON.parse(localStorage.getItem('fratello-role') || 'null'); }
  catch (e) { return null; }
}
export function guardSalesPage(cb) {
  const apply = (role) => {
    currentRole = (role && SALES_ROLES.has(role.key)) ? role : null;
    document.body.classList.remove('ft-checking');
    document.body.classList.toggle('ft-denied', !currentRole);
    cb(currentRole);
  };
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') apply(roleFromLocalStorage());
  else if (firebaseConfigured()) onHubAuthChange(role => apply(role));
  else apply(roleFromLocalStorage());
}
export function isManager() { return !!(currentRole && MANAGERS.has(currentRole.key)); }

// Which reps this user may view. Managers get "All customers" + every rep; a rep sees only themselves.
export function visibleReps() {
  if (isManager()) return [ALL_REP, ...SNAP.reps];
  const email = currentRole && currentRole.user ? normalizeEmail(currentRole.user.email) : '';
  const r = SNAP.reps.find(x => x.id === REP_BY_EMAIL[email]);
  return r ? [r] : [];
}
// Accounts for a view. "all" = everything incl. the house/ecom bucket (managers only).
export function snapshotAccounts(repId) {
  return repId === 'all' ? SNAP.accounts.slice() : SNAP.accounts.filter(a => a.repId === repId);
}
// ── Live Odoo (via the secure /api/odoo/read function) with snapshot fallback ──
const isLocal = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export function useLive() { return !isLocal(); }
async function odoo(action, payload) {
  const tok = await currentIdToken();
  const r = await fetch('/api/odoo/read', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tok || '') }, body: JSON.stringify(Object.assign({ action }, payload)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
// All accounts for a view — live from Odoo, or the committed snapshot on localhost / before the key is set.
export async function listAccounts(rep) {
  if (useLive()) {
    try {
      const all = []; let offset = 0;
      for (;;) {                                   // page through so a big book is never truncated at one server page
        const { accounts = [], more } = await odoo('list', { rep: rep.id, limit: 4000, offset });
        all.push(...accounts);
        if (!more || !accounts.length) break;
        offset += accounts.length;
      }
      return all;                                  // success (even if empty) — only a throw falls through to the snapshot
    } catch (e) { console.warn('Odoo list failed; snapshot fallback:', e.message); }
  }
  return snapshotAccounts(rep.id);
}
// Fill in 12-mo $ + last-order in the background (live only — snapshot already has them).
export async function enrichAggregates(accounts, onProgress) {
  if (!useLive()) return;
  const byId = {}; accounts.forEach(a => { byId[a.id] = a; });
  const todo = accounts.filter(a => a.ytd == null).map(a => a.id).slice(0, 6000);
  for (let i = 0; i < todo.length; i += 300) {
    const batch = todo.slice(i, i + 300);
    try {
      const { agg } = await odoo('agg', { ids: batch });
      batch.forEach(id => { const a = byId[id]; if (a) { const g = agg[id] || {}; a.ytd = g.ytd || 0; a.lastOrder = g.lastOrder || ''; a.orders = g.orders || 0; } });
    } catch (e) { break; }
    if (onProgress) onProgress();
  }
}
// Per-account detail (orders + line items + graph + products) — live on tap, or already in the snapshot.
export function needsDetail(a) { return useLive() && a && !a.recentOrders; }
export async function loadDetail(a) {
  if (!needsDetail(a)) return a;
  try { const { detail } = await odoo('detail', { id: a.id }); Object.assign(a, detail); }
  catch (e) { a.recentOrders = a.recentOrders || []; a.months = a.months || []; a.topProducts = a.topProducts || []; }
  return a;
}

function repForAccount(account) {
  return SNAP.reps.find(r => r.id === account.repId)
    || { id: account.repId || 'house', name: 'House', email: 'house@fratellocoffee.com' };
}

// ─── Firestore vs local fallback ───────────────────────────────
function fs() { const s = initFirebase(); return (s && s.ready) ? s : null; }
function liveUser() { const s = fs(); return (s && s.auth && s.auth.currentUser) ? s.auth.currentUser : null; }
function useFirestore() { return !!(fs() && liveUser()); }
const lsKey = repId => `ft_local_${repId}`;
function lsRead(repId) { try { return JSON.parse(localStorage.getItem(lsKey(repId)) || 'null'); } catch (e) { return null; } }
function lsWrite(repId, st) { localStorage.setItem(lsKey(repId), JSON.stringify(st)); }
const mapAct = r => ({ id: r.id, acctId: r.account_id, acctName: r.account_name, type: r.type, date: r.date, vstate: r.vstate, note: r.note || '' });
const mapFu = r => ({ id: r.id, acctId: r.account_id, acctName: r.account_name, due: r.due, reason: r.reason, type: r.type, done: r.status !== 'pending' });

// Load working state for a view: {activities, followups, settings}. rep.id 'all' loads the whole team.
export async function loadState(rep) {
  if (useFirestore()) {
    const d = fs().db; const filt = rep.id === 'all' ? null : rep.email;
    const get = coll => filt ? getDocs(query(collection(d, coll), where('rep_email', '==', filt))) : getDocs(collection(d, coll));
    const [actS, fuS, setS] = await Promise.all([get('sales_activities'), get('sales_followups'), get('sales_settings')]);
    const settings = {};
    setS.docs.forEach(x => { const r = x.data(); settings[r.account_id] = { importance: r.importance, cadence: r.cadence, customerType: r.customerType, brands: r.brands || [], waterFilterLast: r.waterFilterLast || '' }; });
    return { activities: actS.docs.map(x => mapAct({ id: x.id, ...x.data() })), followups: fuS.docs.map(x => mapFu({ id: x.id, ...x.data() })), settings, _live: true };
  }
  if (rep.id === 'all') {
    const m = { activities: [], followups: [], settings: {}, _live: false };
    [...SNAP.reps.map(r => r.id), 'house'].forEach(rid => {
      let st = lsRead(rid);
      if (!st && rid !== 'house') { st = seedLocal(SNAP.reps.find(r => r.id === rid)); lsWrite(rid, st); }
      if (st) { m.activities.push(...st.activities); m.followups.push(...st.followups); Object.assign(m.settings, st.settings); }
    });
    return m;
  }
  let st = lsRead(rep.id);
  if (!st) { st = seedLocal(rep); lsWrite(rep.id, st); }
  return { ...st, _live: false };
}

function liveStamp() { const u = liveUser(); return { created_by_uid: u.uid, created_by_email: normalizeEmail(u.email), created_at: serverTimestamp() }; }

// Writes derive the territory (rep) from the ACCOUNT, so they're correct whether a
// rep logs their own or a manager logs from the "All" view. The writer is always the signed-in user.
export async function logActivity(account, a) {
  const rep = repForAccount(account);
  const rec = { rep_id: rep.id, rep_email: rep.email, rep_name: rep.name, account_id: account.id, account_name: account.name, type: a.type, date: a.date, vstate: a.vstate, note: a.note || '', created_via: 'sales-field-tool' };
  if (useFirestore()) { const r = await addDoc(collection(fs().db, 'sales_activities'), { ...rec, ...liveStamp() }); return mapAct({ id: r.id, ...rec }); }
  return localAppend(rep.id, 'activities', { id: 'a' + Date.now(), acctId: account.id, acctName: account.name, type: a.type, date: a.date, vstate: a.vstate, note: a.note });
}
export async function addFollowup(account, f) {
  const rep = repForAccount(account);
  const rec = { rep_id: rep.id, rep_email: rep.email, account_id: account.id, account_name: account.name, due: f.due, reason: f.reason, type: f.type, status: 'pending', created_via: 'sales-field-tool' };
  if (useFirestore()) { const r = await addDoc(collection(fs().db, 'sales_followups'), { ...rec, ...liveStamp() }); return { id: r.id, acctId: account.id, acctName: account.name, due: f.due, reason: f.reason, type: f.type, done: false }; }
  return localAppend(rep.id, 'followups', { id: 'f' + Date.now(), acctId: account.id, acctName: account.name, due: f.due, reason: f.reason, type: f.type, done: false });
}
export async function completeFollowup(id) {
  if (useFirestore()) { await updateDoc(doc(fs().db, 'sales_followups', id), { status: 'completed', completed_at: serverTimestamp() }); return; }
  for (const rid of [...SNAP.reps.map(r => r.id), 'house']) { const st = lsRead(rid); if (st) { const f = st.followups.find(x => x.id === id); if (f) { f.done = true; lsWrite(rid, st); return; } } }
}
export async function saveSetting(account, patch) {
  const rep = repForAccount(account);
  if (useFirestore()) { await setDoc(doc(fs().db, 'sales_settings', rep.id + '__' + account.id), { rep_id: rep.id, rep_email: rep.email, account_id: account.id, ...patch, updated_at: serverTimestamp() }, { merge: true }); return; }
  const st = lsRead(rep.id) || { activities: [], followups: [], settings: {} };
  st.settings[account.id] = { ...(st.settings[account.id] || {}), ...patch }; lsWrite(rep.id, st);
}

export async function rescheduleFollowup(id, patch) {
  if (useFirestore()) { await updateDoc(doc(fs().db, 'sales_followups', id), { due: patch.due, reason: patch.reason, type: patch.type }); return; }
  for (const rid of [...SNAP.reps.map(r => r.id), 'house']) { const st = lsRead(rid); if (st) { const f = st.followups.find(x => x.id === id); if (f) { Object.assign(f, patch); lsWrite(rid, st); return; } } }
}
export async function cancelFollowup(id) {
  if (useFirestore()) { await updateDoc(doc(fs().db, 'sales_followups', id), { status: 'cancelled' }); return; }
  for (const rid of [...SNAP.reps.map(r => r.id), 'house']) { const st = lsRead(rid); if (st) { const i = st.followups.findIndex(x => x.id === id); if (i > -1) { st.followups.splice(i, 1); lsWrite(rid, st); return; } } }
}
function localAppend(repId, key, item) { const st = lsRead(repId) || { activities: [], followups: [], settings: {} }; st[key].push(item); lsWrite(repId, st); return item; }

// Demo seed for local preview only (never runs against Firestore).
function seedLocal(rep) {
  const A = snapshotAccounts(rep.id), acts = [], settings = {};
  const P = new Set([5, 12]), L = new Set([9]);
  const BR = [['coffee', 'syrups', 'oatmilk'], ['coffee', 'idletea'], ['coffee', 'syrups', 'chai', 'frappe'], ['coffee'], ['coffee', 'oatmilk', 'idletea']];
  A.forEach((a, i) => { settings[a.id] = { importance: ['med', 'high', 'med', 'low', 'high'][i % 5], cadence: [2, 3, 4, 2, 6][i % 5], customerType: L.has(i) ? 'Lead' : P.has(i) ? 'Prospect' : 'Customer', brands: BR[i % 5], waterFilterLast: i % 3 === 0 ? '2026-03-15' : '' }; });
  let n = 0; const add = (i, t, day, v, note) => { const a = A[i]; if (a) acts.push({ id: 's' + (n++), acctId: a.id, acctName: a.name, type: t, date: '2026-06-' + String(day).padStart(2, '0'), vstate: v, note: note || '' }); };
  A.slice(0, 10).forEach((a, i) => add(i, 'Drop In', (i * 2) % 26 + 2, i % 5 !== 0 ? 'Verified' : 'No', 'Dropped samples, checked stock.'));
  add(0, 'QA Inspection', 6, 'Verified', 'Calibrated espresso.'); add(3, 'Training', 9, 'Verified', 'Barista refresher.');
  add(7, 'Cold Call', 5, 'No', 'First intro — new cafe.'); add(8, 'Cold Call', 11, 'No', 'Dropped a card.');
  A.slice(0, 12).forEach((a, i) => add(i, ['Email', 'Phone Call', 'Text'][i % 3], (i + 3) % 26 + 2, 'NA', ''));
  const fu = A[4] ? [{ id: 'f0', acctId: A[4].id, acctName: A[4].name, due: '2026-06-30', reason: 'Trial the new Ethiopia', type: 'Drop In', done: false }] : [];
  return { activities: acts, followups: fu, settings };
}
