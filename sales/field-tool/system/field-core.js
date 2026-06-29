// ═══════════════════════════════════════════════════════════════
// Field Sales Tool core: auth gate + data layer.
// READS account/order data from the committed Odoo snapshot (snapshot.js).
// WRITES new activity to Firestore (sales_activities / sales_followups /
// sales_settings) — mirrors the CFIA immutable, self-stamped pattern.
// Falls back to localStorage when not signed in (local UX preview only).
// Swap-in for live Odoo: replace snapshotAccounts() with a fetch to the
// odoo-read Netlify function once the API key is set — nothing else changes.
// ═══════════════════════════════════════════════════════════════
import { firebaseConfigured, onHubAuthChange, initFirebase, normalizeEmail } from '/system/fratello-auth.js';
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
};

const SNAP = (window.FRATELLO_SNAPSHOT || { reps: [], accounts: [] });
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

// Which reps this user may view. Managers see all reps in the snapshot; a rep sees only themselves.
export function visibleReps() {
  if (isManager()) return SNAP.reps;
  const email = currentRole && currentRole.user ? normalizeEmail(currentRole.user.email) : '';
  const id = REP_BY_EMAIL[email];
  const r = SNAP.reps.find(x => x.id === id);
  return r ? [r] : [];
}
export function snapshotAccounts(repId) { return SNAP.accounts.filter(a => a.repId === repId); }

// ─── Firestore vs local fallback ───────────────────────────────
function fs() { const s = initFirebase(); return (s && s.ready) ? s : null; }
function liveUser() { const s = fs(); return (s && s.auth && s.auth.currentUser) ? s.auth.currentUser : null; }
function useFirestore() { return !!(fs() && liveUser()); }
const lsKey = repId => `ft_local_${repId}`;
function lsRead(repId) { try { return JSON.parse(localStorage.getItem(lsKey(repId)) || 'null'); } catch (e) { return null; } }
function lsWrite(repId, st) { localStorage.setItem(lsKey(repId), JSON.stringify(st)); }

// Load a rep's full working state: {activities, followups, settings}.
export async function loadState(rep) {
  if (useFirestore()) {
    const s = fs(); const d = s.db; const email = rep.email;
    const [actS, fuS, setS] = await Promise.all([
      getDocs(query(collection(d, 'sales_activities'), where('rep_email', '==', email))),
      getDocs(query(collection(d, 'sales_followups'), where('rep_email', '==', email))),
      getDocs(query(collection(d, 'sales_settings'), where('rep_email', '==', email))),
    ]);
    const activities = actS.docs.map(x => ({ id: x.id, ...x.data() }))
      .map(r => ({ id: r.id, acctId: r.account_id, acctName: r.account_name, type: r.type, date: r.date, vstate: r.vstate, note: r.note || '' }));
    const followups = fuS.docs.map(x => ({ id: x.id, ...x.data() }))
      .map(r => ({ id: r.id, acctId: r.account_id, acctName: r.account_name, due: r.due, reason: r.reason, type: r.type, done: r.status !== 'pending' }));
    const settings = {};
    setS.docs.forEach(x => { const r = x.data(); settings[r.account_id] = { importance: r.importance, cadence: r.cadence, customerType: r.customerType, loaner: r.loaner }; });
    return { activities, followups, settings, _live: true };
  }
  // Local preview fallback (not signed in): seed demo data once so the UX is alive.
  let st = lsRead(rep.id);
  if (!st) { st = seedLocal(rep); lsWrite(rep.id, st); }
  return { ...st, _live: false };
}

export async function logActivity(rep, a) {
  const rec = { rep_id: rep.id, rep_email: rep.email, rep_name: rep.name,
    account_id: a.acctId, account_name: a.acctName, type: a.type, date: a.date,
    vstate: a.vstate, note: a.note || '', created_via: 'sales-field-tool' };
  if (useFirestore()) { const u = liveUser(); const r = await addDoc(collection(fs().db, 'sales_activities'), { ...rec, created_by_uid: u.uid, created_by_email: normalizeEmail(u.email), created_at: serverTimestamp() }); return { id: r.id, acctId: a.acctId, acctName: a.acctName, type: a.type, date: a.date, vstate: a.vstate, note: a.note }; }
  return localAppend(rep, 'activities', { id: 'a' + Date.now(), acctId: a.acctId, acctName: a.acctName, type: a.type, date: a.date, vstate: a.vstate, note: a.note });
}
export async function addFollowup(rep, f) {
  const rec = { rep_id: rep.id, rep_email: rep.email, account_id: f.acctId, account_name: f.acctName,
    due: f.due, reason: f.reason, type: f.type, status: 'pending', created_via: 'sales-field-tool' };
  if (useFirestore()) { const u = liveUser(); const r = await addDoc(collection(fs().db, 'sales_followups'), { ...rec, created_by_uid: u.uid, created_by_email: normalizeEmail(u.email), created_at: serverTimestamp() }); return { id: r.id, acctId: f.acctId, acctName: f.acctName, due: f.due, reason: f.reason, type: f.type, done: false }; }
  return localAppend(rep, 'followups', { id: 'f' + Date.now(), acctId: f.acctId, acctName: f.acctName, due: f.due, reason: f.reason, type: f.type, done: false });
}
export async function completeFollowup(rep, id) {
  if (useFirestore()) { await updateDoc(doc(fs().db, 'sales_followups', id), { status: 'completed', completed_at: serverTimestamp() }); return; }
  const st = lsRead(rep.id); const f = st.followups.find(x => x.id === id); if (f) f.done = true; lsWrite(rep.id, st);
}
export async function saveSetting(rep, accountId, patch) {
  if (useFirestore()) { await setDoc(doc(fs().db, 'sales_settings', rep.id + '__' + accountId), { rep_id: rep.id, rep_email: rep.email, account_id: accountId, ...patch, updated_at: serverTimestamp() }, { merge: true }); return; }
  const st = lsRead(rep.id); st.settings[accountId] = { ...(st.settings[accountId] || {}), ...patch }; lsWrite(rep.id, st);
}

function localAppend(rep, key, item) { const st = lsRead(rep.id) || { activities: [], followups: [], settings: {} }; st[key].push(item); lsWrite(rep.id, st); return item; }

// Demo seed for local preview only (never runs against Firestore).
function seedLocal(rep) {
  const A = snapshotAccounts(rep.id), acts = [], settings = {};
  const P = new Set([5, 12]), L = new Set([9]), LO = new Set([0, 1, 3, 6, 8, 11]);
  A.forEach((a, i) => { settings[a.id] = { importance: ['med', 'high', 'med', 'low', 'high'][i % 5], cadence: [2, 3, 4, 2, 6][i % 5], customerType: L.has(i) ? 'Lead' : P.has(i) ? 'Prospect' : 'Customer', loaner: LO.has(i) }; });
  let n = 0; const add = (i, t, day, v, note) => { const a = A[i]; if (a) acts.push({ id: 's' + (n++), acctId: a.id, acctName: a.name, type: t, date: '2026-06-' + String(day).padStart(2, '0'), vstate: v, note: note || '' }); };
  A.slice(0, 10).forEach((a, i) => add(i, 'Drop In', (i * 2) % 26 + 2, i % 5 !== 0 ? 'Verified' : 'No', 'Dropped samples, checked stock.'));
  add(0, 'QA Inspection', 6, 'Verified', 'Calibrated espresso.'); add(3, 'Training', 9, 'Verified', 'Barista refresher.');
  add(7, 'Cold Call', 5, 'No', 'First intro — new cafe.'); add(8, 'Cold Call', 11, 'No', 'Dropped a card.');
  A.slice(0, 12).forEach((a, i) => add(i, ['Email', 'Phone Call', 'Text'][i % 3], (i + 3) % 26 + 2, 'NA', ''));
  const fu = A[4] ? [{ id: 'f0', acctId: A[4].id, acctName: A[4].name, due: '2026-06-30', reason: 'Trial the new Ethiopia', type: 'Drop In', done: false }] : [];
  return { activities: acts, followups: fu, settings };
}
