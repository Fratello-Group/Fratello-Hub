// ═══════════════════════════════════════════════════════════════
// CFIA module core: auth gate + immutable record read/write.
// Reuses the Hub's existing Firebase + auth (system/fratello-auth.js).
// ═══════════════════════════════════════════════════════════════
import { firebaseConfigured, onHubAuthChange, initFirebase, normalizeEmail } from '/system/fratello-auth.js';
import {
    collection, addDoc, getDocs, query, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Pilot phase: owner-only. (Later, open this to production staff by adding
// 'production', 'staff', etc. — the Firestore rules already support them.)
const ALLOWED = new Set(['owner']);
// Who sees ALL submitted records (manager / audit view). Others see their own.
const MANAGERS = new Set(['owner', 'controller']);

const RECORDS = 'cfia_records';

let currentRole = null;

function roleFromLocalStorage() {
    try { return JSON.parse(localStorage.getItem('fratello-role') || 'null'); }
    catch (e) { return null; }
}

// Gate the page. Calls cb(role) once we know who (or null if not allowed in).
export function guardPage(cb) {
    const apply = (role) => {
        currentRole = (role && ALLOWED.has(role.key)) ? role : null;
        document.body.classList.remove('cfia-checking');
        if (!currentRole) {
            document.body.classList.add('cfia-denied');
            cb(null);
            return;
        }
        document.body.classList.remove('cfia-denied');
        cb(currentRole);
    };

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        apply(roleFromLocalStorage());
    } else if (firebaseConfigured()) {
        onHubAuthChange(role => apply(role));
    } else {
        apply(roleFromLocalStorage());
    }
}

export function getRole() { return currentRole; }
export function isManager() { return !!(currentRole && MANAGERS.has(currentRole.key)); }

function db() { const s = initFirebase(); return s && s.ready ? s.db : null; }
function authState() { const s = initFirebase(); return s && s.ready ? s.auth : null; }

// Create an IMMUTABLE record. The authenticated account is stamped server-side
// and can never be edited or deleted (enforced in firestore.rules).
export async function createRecord(form, fields, signoff) {
    const d = db();
    const a = authState();
    if (!d || !a || !a.currentUser) {
        throw new Error('Please sign in again before submitting.');
    }
    const u = a.currentUser;
    const accountName = (currentRole && currentRole.user && currentRole.user.name) || u.displayName || normalizeEmail(u.email);

    const record = {
        form_code: form.code,
        form_title: form.title,
        sop_code: form.sopCode || '',
        form_version: form.version || '',
        record_id: buildRecordId(form, fields),
        values: fields,
        // WHO ACTUALLY DID IT — defaults to the logged-in person, editable on shared stations.
        performed_by_name: (signoff && signoff.performedByName) || accountName,
        performed_by_is_self: !(signoff && signoff.someoneElse),
        // THE LOGGED-IN ACCOUNT — locked, server-stamped, unforgeable.
        submitted_by_uid: u.uid,
        submitted_by_email: normalizeEmail(u.email),
        submitted_by_name: accountName,
        submitted_at: serverTimestamp(),
        department: (currentRole && currentRole.user && currentRole.user.department) || '',
        supersedes: null,                 // correction model (a fix = a new linked record)
        created_via: 'cfia-hub'
    };

    const ref = await addDoc(collection(d, RECORDS), record);
    return { id: ref.id, ...record };
}

export async function listRecords(opts = {}) {
    const d = db();
    if (!d || !currentRole) return [];
    let snap;
    if (isManager() && !opts.mineOnly) {
        snap = await getDocs(collection(d, RECORDS));
    } else {
        snap = await getDocs(query(
            collection(d, RECORDS),
            where('submitted_by_email', '==', normalizeEmail(currentRole.user.email))
        ));
    }
    return snap.docs.map(x => ({ id: x.id, ...x.data() }))
        .filter(r => !opts.formCode || r.form_code === opts.formCode)
        .sort((a, b) => millis(b.submitted_at) - millis(a.submitted_at));
}

function buildRecordId(form, fields) {
    const date = (fields && fields.date) ? String(fields.date).replace(/-/g, '') : isoToday().replace(/-/g, '');
    const prefix = (form.code || 'REC').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${date}-${suffix}`;
}

// Record retention required (years) — CFIA / Fratello policy.
export const RETENTION_YEARS = 5;

function whoName(u) {
    return (currentRole && currentRole.user && currentRole.user.name) || u.displayName || normalizeEmail(u.email);
}

// ── Training completion (immutable; quiz pass/fail) ──
export async function recordTraining(quiz, score, passed) {
    const d = db(); const a = authState();
    if (!d || !a || !a.currentUser) throw new Error('Please sign in again before submitting.');
    const u = a.currentUser;
    const rec = {
        quiz_code: quiz.code, quiz_title: quiz.title || '',
        score: Math.round(score), pass_threshold: quiz.passThreshold || 90, passed: !!passed,
        recurrence: quiz.recurrence || 'annual', version: quiz.version || '1',
        uid: u.uid, email: normalizeEmail(u.email), name: whoName(u),
        taken_at: serverTimestamp(), created_via: 'cfia-hub-training'
    };
    const ref = await addDoc(collection(d, 'cfia_training_completions'), rec);
    return { id: ref.id, ...rec };
}

// ── Document acknowledgement ("I have read & understood SOP vX") ──
export async function recordAck(docMeta) {
    const d = db(); const a = authState();
    if (!d || !a || !a.currentUser) throw new Error('Please sign in again.');
    const u = a.currentUser;
    const rec = {
        doc_code: docMeta.code, doc_title: docMeta.title || '', version: docMeta.version || '',
        uid: u.uid, email: normalizeEmail(u.email), name: whoName(u),
        read_at: serverTimestamp(), created_via: 'cfia-hub-ack'
    };
    const ref = await addDoc(collection(d, 'cfia_acknowledgements'), rec);
    return { id: ref.id, ...rec };
}

// ── Manager / QA sign-off (immutable; separation of duties enforced in rules) ──
export async function createSignoff(opts) {
    const d = db(); const a = authState();
    if (!d || !a || !a.currentUser) throw new Error('Please sign in again.');
    const u = a.currentUser;
    const rec = {
        covers_form: opts.coversForm || '', covers_date: opts.coversDate || '', department: opts.department || '',
        record_ids: opts.recordIds || [], record_submitter_emails: opts.recordSubmitterEmails || [],
        status: opts.status || 'verified', scope_note: opts.scopeNote || '', tier: opts.tier || 'supervisor',
        signed_by_uid: u.uid, signed_by_email: normalizeEmail(u.email), signed_by_name: whoName(u),
        signed_at: serverTimestamp(), created_via: 'cfia-hub-signoff'
    };
    const ref = await addDoc(collection(d, 'cfia_signoffs'), rec);
    return { id: ref.id, ...rec };
}

export async function listSignoffs() {
    const d = db();
    if (!d || !currentRole) return [];
    const snap = await getDocs(collection(d, 'cfia_signoffs'));
    return snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => millis(b.signed_at) - millis(a.signed_at));
}

// America/Edmonton calendar date (YYYY-MM-DD) — the program timezone for "due today".
export function edmontonToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// ─── shared helpers ───
export function isoToday() { return new Date().toISOString().slice(0, 10); }
export function millis(t) {
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    const d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}
export function fmtDateTime(t) {
    const ms = millis(t);
    return ms ? new Date(ms).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
export function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-CA', { dateStyle: 'medium' });
}
export function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
