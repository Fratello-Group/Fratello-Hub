import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initFirebase, normalizeEmail } from '../fratello-auth.js';

const COLLECTIONS = {
    users: 'users',
    requests: 'time_off_requests',
    approvals: 'approvals',
    holidays: 'holidays',
    settings: 'settings',
    profiles: 'hubProfiles',
    avatarLogs: 'avatar_logs',
    timeClock: 'time_clock',
    directory: 'directory',
    peopleDrafts: 'people_drafts',
    timeSettings: 'settings',
    grades: 'time_grades',
    output: 'production_output'
};

const APPROVAL_ENDPOINT = '/.netlify/functions/time-off-approval-action';
const NOTIFY_REQUEST_ENDPOINT = '/.netlify/functions/notify-on-request-submit';
const NOTIFY_SICK_ENDPOINT = '/.netlify/functions/notify-on-sick-day';

function requireFirestore() {
    const state = initFirebase();
    if (!state.ready || !state.db) {
        throw new Error('Firebase is not configured for the Fratello Hub yet.');
    }
    return state;
}

// The Owner's "View as" preview is look-only. While it's active, block every
// write so previewing as a teammate can never create real data (e.g. a stray
// time-clock punch) under the Owner's account. Reads stay allowed so the
// previewed screens still render.
function previewActive() {
    try { return Boolean(localStorage.getItem('fratello-view-as')); } catch (e) { return false; }
}
function blockIfPreview() {
    if (previewActive()) {
        throw new Error('You’re previewing the Hub as someone else — changes are turned off here. Tap “Back to my view” to make real edits.');
    }
}

function requireCurrentFirebaseUser(auth) {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        const timer = window.setTimeout(() => {
            unsubscribe();
            reject(new Error('Please sign in before using the time-off tools.'));
        }, 4000);

        unsubscribe = onAuthStateChanged(auth, user => {
            window.clearTimeout(timer);
            unsubscribe();
            if (user) {
                resolve(user);
            } else {
                reject(new Error('Please sign in before using the time-off tools.'));
            }
        });
    });
}

function docIdForEmail(email) {
    return normalizeEmail(email);
}

function withId(snapshot) {
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function asDate(value, fallback = null) {
    if (!value) return fallback;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00.000Z`);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function asTimestamp(value) {
    const date = asDate(value);
    if (!date) throw new Error('A valid date is required.');
    return Timestamp.fromDate(date);
}

function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    return asDate(value, new Date(0)).getTime();
}

function overlapsRange(item, startDate, endDate) {
    if (!startDate && !endDate) return true;
    const start = startDate ? asDate(startDate, new Date(0)).getTime() : 0;
    const end = endDate ? asDate(endDate, new Date('9999-12-31T00:00:00.000Z')).getTime() : Infinity;
    return timestampMillis(item.start_date) <= end && timestampMillis(item.end_date) >= start;
}

function sortNewestFirst(items) {
    return items.sort((a, b) => timestampMillis(b.submitted_at || b.start_date) - timestampMillis(a.submitted_at || a.start_date));
}

function isOwnerOrController(user) {
    return user && (user.role_tier === 'Owner' || user.role_tier === 'Controller');
}

function isOwner(user) {
    return user && user.role_tier === 'Owner';
}

function cleanOptionalText(value) {
    return String(value || '').trim();
}

// Per-person shift overrides. expected_start is "HH:MM" (or null to clear);
// expected_hours is a positive number (or null). Anything unparseable -> null.
function normalizeExpectedStart(value) {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    return /^\d{2}:\d{2}$/.test(text) ? text : null;
}
function normalizeExpectedHours(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
}

function validAvatarStatus(status) {
    return ['Untested', 'Live', 'Worked', 'Flopped'].includes(status);
}

function roleTierFromProfile(profileKey) {
    if (profileKey === 'owner') return 'Owner';
    if (profileKey === 'controller') return 'Controller';
    if (['production', 'marketing', 'sales'].includes(profileKey)) return 'Manager';
    return 'Staff';
}

function departmentFromProfile(profileKey) {
    if (profileKey === 'owner') return 'Management';
    if (profileKey === 'controller') return 'Admin';
    if (profileKey === 'production') return 'Production';
    if (profileKey === 'marketing') return 'Marketing';
    if (profileKey === 'sales') return 'Sales';
    return 'Staff';
}

function managerForProfile(profileKey) {
    if (profileKey === 'owner') return null;
    if (profileKey === 'sales') return 'russ@fratellocoffee.com';
    return 'prefontainech@gmail.com';
}

function ownerEmails() {
    return (window.FRATELLO_OWNER_EMAILS || []).map(normalizeEmail);
}

async function bootstrapUserFromHubProfile(currentUser) {
    const { db } = requireFirestore();
    const profile = withId(await getDoc(doc(db, COLLECTIONS.profiles, currentUser.uid)));
    const email = normalizeEmail(profile?.email || currentUser.email);
    const bootstrapOwner = ownerEmails().includes(email);
    if ((!profile && !bootstrapOwner) || profile?.status === 'disabled') return null;

    const profileKey = profile?.profile || (bootstrapOwner ? 'owner' : 'staff');
    if (!['owner', 'controller'].includes(profileKey)) return null;

    const ref = doc(db, COLLECTIONS.users, email);
    const user = {
        email,
        name: cleanOptionalText(profile?.name || currentUser.displayName) || email,
        department: cleanOptionalText(profile?.department || departmentFromProfile(profileKey)),
        title: cleanOptionalText(profile?.title),
        role_tier: roleTierFromProfile(profileKey),
        manager_id: managerForProfile(profileKey),
        backup_approver_id: null,
        active: true,
        hire_date: null,
        vacation_days_allotted: null,
        vacation_days_used: null,
        calendar_tokens: {},
        updated_at: serverTimestamp()
    };

    await setDoc(ref, user, { merge: true });
    return { id: email, ...user };
}

async function getCurrentUserRecord() {
    const { auth } = requireFirestore();
    const currentUser = await requireCurrentFirebaseUser(auth);
    const user = await getUserByEmail(currentUser.email);
    if (user) return user;

    const bootstrapped = await bootstrapUserFromHubProfile(currentUser);
    if (bootstrapped) return bootstrapped;

    throw new Error('Your Hub login does not have a matching Firestore user record yet.');
}

async function fetchApprovalAction(action, requestId, comment = '') {
    blockIfPreview();
    const { auth } = requireFirestore();
    const currentUser = await requireCurrentFirebaseUser(auth);
    const token = await currentUser.getIdToken();
    const response = await fetch(APPROVAL_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action,
            request_id: requestId,
            comment: cleanOptionalText(comment)
        })
    });

    if (!response.ok) {
        let message = `Approval action failed with status ${response.status}.`;
        try {
            const body = await response.json();
            message = body.error || message;
        } catch (error) {
            // Keep the HTTP fallback message.
        }
        throw new Error(message);
    }

    return response.json();
}

async function firebaseAuthHeader() {
    const { auth } = requireFirestore();
    const currentUser = await requireCurrentFirebaseUser(auth);
    return `Bearer ${await currentUser.getIdToken()}`;
}

async function postFunction(endpoint, payload = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: await firebaseAuthHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let message = `${endpoint} failed with status ${response.status}.`;
        try {
            const body = await response.json();
            message = body.error || message;
        } catch (error) {
            // Keep the HTTP fallback.
        }
        throw new Error(message);
    }

    return response.json();
}

export async function getUserByEmail(email) {
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.users, docIdForEmail(email));
    return withId(await getDoc(ref));
}

export async function getCurrentUser() {
    return getCurrentUserRecord();
}

export async function getUsers() {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, COLLECTIONS.users));
    return snapshot.docs.map(withId).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveUsers() {
    return (await getUsers()).filter(user => user.active);
}

export async function getRequestById(requestId) {
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.requests, requestId);
    return withId(await getDoc(ref));
}

export const getTimeOffRequestById = getRequestById;
export const getTimeOffRequest = getRequestById;

// Roasting / Packaging / Warehouse roll up to one "Production" team for coverage.
// Must stay in sync with teamGroup() in firestore.rules.
export function teamGroupOf(department) {
    const raw = String(department || '').trim();
    const d = raw.toLowerCase();
    if (['production', 'roasting', 'packaging', 'warehouse'].includes(d)) return 'Production';
    return raw;
}

export async function submitTimeOffRequest(input = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const user = input.user || await getCurrentUserRecord();
    const type = input.type || 'vacation';
    if (!['vacation', 'sick'].includes(type)) {
        throw new Error('Time-off type must be vacation or sick.');
    }
    const sickDay = type === 'sick';
    const ownerAutoApproved = type === 'vacation' && isOwner(user);
    const useBackupApprover = Boolean(input.use_backup_approver && user.backup_approver_id);
    const approverId = sickDay || ownerAutoApproved
        ? null
        : cleanOptionalText(input.approver_id) || (useBackupApprover ? user.backup_approver_id : user.manager_id);
    const now = new Date();
    const editLock = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    const request = {
        user_id: user.id,
        type,
        start_date: asTimestamp(input.start_date),
        end_date: asTimestamp(input.end_date || input.start_date),
        half_day_start: Boolean(input.half_day_start),
        half_day_end: Boolean(input.half_day_end),
        reason_category: sickDay ? cleanOptionalText(input.reason_category || 'Other') : '',
        notes: cleanOptionalText(input.notes),
        status: sickDay || ownerAutoApproved ? 'approved' : 'pending',
        submitted_at: serverTimestamp(),
        approver_id: approverId || null,
        created_via: 'hub',
        // Denormalized so teammates can see WHO is on vacation without reading each
        // other's user records. vacation_team scopes who may read it (same team only;
        // empty for sick days, which stay private to the person + owner/controller).
        user_name: cleanOptionalText(user.name) || '',
        vacation_team: sickDay ? '' : teamGroupOf(user.department),
        edit_locked_at: sickDay ? Timestamp.fromDate(editLock) : null
    };

    if (!sickDay && !request.approver_id && !ownerAutoApproved && !isOwnerOrController(user)) {
        throw new Error('This user does not have an approver set.');
    }

    const ref = await addDoc(collection(db, COLLECTIONS.requests), request);
    const saved = { id: ref.id, ...request };

    try {
        if (sickDay) {
            await postFunction(NOTIFY_SICK_ENDPOINT, { request_id: ref.id });
        } else if (saved.status === 'pending') {
            await postFunction(NOTIFY_REQUEST_ENDPOINT, { request_id: ref.id });
        }
    } catch (error) {
        saved.notification_error = error.message || 'Notification could not be sent.';
    }

    return saved;
}

export async function getMyRequests(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const snapshot = await getDocs(query(
        collection(db, COLLECTIONS.requests),
        where('user_id', '==', user.id)
    ));
    const items = snapshot.docs
        .map(withId)
        .filter(item => !options.type || item.type === options.type)
        .filter(item => !options.status || item.status === options.status)
        .filter(item => overlapsRange(item, options.start_date, options.end_date));
    return sortNewestFirst(items);
}

export async function getRequestsForApproval(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const snapshot = await getDocs(query(
        collection(db, COLLECTIONS.requests),
        where('approver_id', '==', user.id)
    ));
    const items = snapshot.docs
        .map(withId)
        .filter(item => item.type === 'vacation')
        .filter(item => !options.status || item.status === options.status)
        .filter(item => overlapsRange(item, options.start_date, options.end_date));
    return sortNewestFirst(items);
}

export async function getTeamRequests(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();

    if (!isOwnerOrController(user)) {
        return getRequestsForApproval({ ...options, user });
    }

    const snapshot = await getDocs(collection(db, COLLECTIONS.requests));
    const includeSick = Boolean(options.include_sick && isOwnerOrController(user));
    const items = snapshot.docs
        .map(withId)
        .filter(item => includeSick || item.type === 'vacation')
        .filter(item => !options.status || item.status === options.status)
        .filter(item => overlapsRange(item, options.start_date, options.end_date));
    return sortNewestFirst(items);
}

// Vacation for the viewer's own team (Production = all three sub-teams), so staff
// and managers can avoid two people on the same team being away at once. The query
// is constrained to the viewer's team so every returned doc passes the security rule.
export async function getTeamVacation(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const team = teamGroupOf(user.department);
    if (!team) return [];
    const snapshot = await getDocs(query(
        collection(db, COLLECTIONS.requests),
        where('vacation_team', '==', team)
    ));
    const items = snapshot.docs
        .map(withId)
        .filter(item => item.status !== 'cancelled')
        .filter(item => !options.status || item.status === options.status)
        .filter(item => overlapsRange(item, options.start_date, options.end_date));
    return sortNewestFirst(items);
}

export async function getSickDays(options = {}) {
    if (options.mine) {
        return getMyRequests({ ...options, type: 'sick' });
    }
    return (await getTeamRequests({ ...options, include_sick: true }))
        .filter(item => item.type === 'sick');
}

export async function cancelRequest(requestId) {
    blockIfPreview();
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.requests, requestId);
    await updateDoc(ref, {
        status: 'cancelled',
        updated_at: serverTimestamp()
    });
    return getRequestById(requestId);
}

export async function approveRequest(requestId, comment = '') {
    return fetchApprovalAction('approved', requestId, comment);
}

export async function denyRequest(requestId, comment = '') {
    return fetchApprovalAction('denied', requestId, comment);
}

export const approveTimeOffRequest = approveRequest;
export const denyTimeOffRequest = denyRequest;

export async function getHolidays(options = {}) {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, COLLECTIONS.holidays));
    return snapshot.docs
        .map(withId)
        .filter(item => overlapsRange({
            start_date: item.date,
            end_date: item.date
        }, options.start_date, options.end_date))
        .sort((a, b) => timestampMillis(a.date) - timestampMillis(b.date));
}

// ════════════════════════════════════════════════
// EMPLOYEE DIRECTORY
// ════════════════════════════════════════════════
// A company-wide, all-readable projection of the live roster (name + position
// only). Read by every signed-in person for the dashboard directory; written
// only by Owner/Controller, kept in sync from Manage People.

export async function getDirectory() {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, COLLECTIONS.directory));
    return snapshot.docs
        .map(withId)
        .filter(Boolean)
        .filter(entry => entry.active !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function upsertDirectoryEntry(entry = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const id = docIdForEmail(entry.email || entry.id);
    if (!id) return null;
    await setDoc(doc(db, COLLECTIONS.directory, id), {
        email: id,
        name: cleanOptionalText(entry.name),
        title: cleanOptionalText(entry.title),
        department: cleanOptionalText(entry.department),
        role_tier: cleanOptionalText(entry.role_tier),
        active: entry.active !== false,
        updated_at: serverTimestamp()
    }, { merge: true });
    return id;
}

export async function removeDirectoryEntry(emailOrId) {
    blockIfPreview();
    const { db } = requireFirestore();
    const id = docIdForEmail(emailOrId);
    if (!id) return;
    await deleteDoc(doc(db, COLLECTIONS.directory, id));
}

// Make the directory exactly match a roster of live people: upsert everyone
// present, drop anyone who's gone. Called from Manage People (Owner/Controller).
export async function syncDirectory(people = []) {
    blockIfPreview();
    const { db } = requireFirestore();
    const wanted = new Map();
    people.forEach(person => {
        const id = docIdForEmail(person.email || person.id);
        if (!id) return;
        wanted.set(id, {
            email: id,
            name: cleanOptionalText(person.name),
            title: cleanOptionalText(person.title),
            department: cleanOptionalText(person.department),
            role_tier: cleanOptionalText(person.role_tier),
            active: person.active !== false && person.status !== 'disabled',
            updated_at: serverTimestamp()
        });
    });
    const snapshot = await getDocs(collection(db, COLLECTIONS.directory));
    const ops = [];
    wanted.forEach((data, id) => ops.push(setDoc(doc(db, COLLECTIONS.directory, id), data, { merge: true })));
    snapshot.docs.forEach(snap => { if (!wanted.has(snap.id)) ops.push(deleteDoc(doc(db, COLLECTIONS.directory, snap.id))); });
    await Promise.all(ops);
    return wanted.size;
}

// ── People drafts ──
// Employees the Owner is configuring but hasn't invited yet (no account/email
// required). Owner/Controller only. Keyed by a slug so the same draft can be
// edited repeatedly without piling up duplicates.

function slugForDraft(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

export async function getPeopleDrafts() {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, COLLECTIONS.peopleDrafts));
    return snapshot.docs
        .map(withId)
        .filter(Boolean)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function savePeopleDraft(draft = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const id = draft.id ? slugForDraft(draft.id)
        : slugForDraft(draft.email || draft.name);
    if (!id) return null;
    await setDoc(doc(db, COLLECTIONS.peopleDrafts, id), {
        name: cleanOptionalText(draft.name),
        title: cleanOptionalText(draft.title),
        department: cleanOptionalText(draft.department),
        role_tier: cleanOptionalText(draft.role_tier),
        email: cleanOptionalText(draft.email),
        manager_id: cleanOptionalText(draft.manager_id),
        hourly: draft.hourly === true,
        created_via: 'hub-draft',
        updated_at: serverTimestamp()
    }, { merge: true });
    return id;
}

export async function deletePeopleDraft(id) {
    blockIfPreview();
    const { db } = requireFirestore();
    const key = slugForDraft(id);
    if (!key) return;
    await deleteDoc(doc(db, COLLECTIONS.peopleDrafts, key));
}

export async function getGlobalSettings() {
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.settings, 'global');
    return withId(await getDoc(ref));
}

export async function getApprovalsForRequest(requestId) {
    const { db } = requireFirestore();
    const user = await getCurrentUserRecord();
    const constraints = [where('request_id', '==', requestId)];
    if (!isOwnerOrController(user)) {
        constraints.push(where('approver_id', '==', user.id));
    }
    const snapshot = await getDocs(query(
        collection(db, COLLECTIONS.approvals),
        ...constraints
    ));
    return snapshot.docs
        .map(withId)
        .sort((a, b) => timestampMillis(a.timestamp) - timestampMillis(b.timestamp));
}

// ════════════════════════════════════════════════
// HOURLY TIME CLOCK
// ════════════════════════════════════════════════
// One document per person-day (id = email_YYYY-MM-DD). Staff punch only their
// own day; Production managers + Owner + Controller read, edit and approve their
// team. clock_in / clock_out are server timestamps; worked + break seconds are
// stamped so the export to the Controller is a real, timestamped audit trail.

function clockDateKey(value) {
    const d = value ? asDate(value, new Date()) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function clockDocId(email, dateKey) {
    return `${docIdForEmail(email)}_${dateKey}`;
}

function elapsedSeconds(fromValue) {
    const from = asDate(fromValue);
    if (!from) return 0;
    return Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
}

export async function getMyClockDay(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const dateKey = options.date ? clockDateKey(options.date) : clockDateKey();
    const ref = doc(db, COLLECTIONS.timeClock, clockDocId(user.id, dateKey));
    return withId(await getDoc(ref));
}

export async function clockIn(options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const dateKey = clockDateKey();
    const ref = doc(db, COLLECTIONS.timeClock, clockDocId(user.id, dateKey));
    const existing = withId(await getDoc(ref));
    // Already punched in (and not yet finished) today — just return it.
    if (existing && existing.status !== 'done' && existing.status !== 'approved') {
        return existing;
    }
    const record = {
        user_id: user.id,
        user_email: normalizeEmail(user.email || user.id),
        user_name: cleanOptionalText(user.name) || '',
        department: cleanOptionalText(user.department) || '',
        team: teamGroupOf(user.department) || '',
        date: dateKey,
        status: 'active',
        clock_in: serverTimestamp(),
        clock_out: null,
        break_started_at: null,
        break_seconds: 0,
        breaks_count: 0,
        worked_seconds: 0,
        note: '',
        approver_id: cleanOptionalText(user.manager_id) || null,
        approved_by: null,
        approved_by_name: '',
        approved_at: null,
        edited_by: '',
        edited_at: null,
        created_via: 'hub-timeclock'
    };
    await setDoc(ref, record);
    return withId(await getDoc(ref));
}

export async function startBreak(options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const day = options.day || await getMyClockDay(options);
    if (!day || day.status !== 'active') throw new Error('You are not clocked in.');
    const ref = doc(db, COLLECTIONS.timeClock, day.id);
    await updateDoc(ref, {
        status: 'break',
        break_started_at: serverTimestamp(),
        breaks_count: (day.breaks_count || 0) + 1
    });
    return withId(await getDoc(ref));
}

export async function endBreak(options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const day = options.day || await getMyClockDay(options);
    if (!day || day.status !== 'break') throw new Error('You are not on a break.');
    const ref = doc(db, COLLECTIONS.timeClock, day.id);
    const added = elapsedSeconds(day.break_started_at);
    await updateDoc(ref, {
        status: 'active',
        break_started_at: null,
        break_seconds: (day.break_seconds || 0) + added
    });
    return withId(await getDoc(ref));
}

export async function clockOut(options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const day = options.day || await getMyClockDay(options);
    if (!day || (day.status !== 'active' && day.status !== 'break')) {
        throw new Error('You are not clocked in.');
    }
    const ref = doc(db, COLLECTIONS.timeClock, day.id);
    let breakSeconds = day.break_seconds || 0;
    if (day.status === 'break') breakSeconds += elapsedSeconds(day.break_started_at);
    const worked = Math.max(0, elapsedSeconds(day.clock_in) - breakSeconds);
    await updateDoc(ref, {
        status: 'done',
        clock_out: serverTimestamp(),
        break_started_at: null,
        break_seconds: breakSeconds,
        worked_seconds: worked
    });
    return withId(await getDoc(ref));
}

// Team timesheet for a Production manager (their team) or Owner/Controller (all).
export async function getTeamClock(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const constraints = [];
    if (!isOwnerOrController(user)) {
        // Scope a manager's query to their own team so every doc passes the rule.
        const team = teamGroupOf(user.department) || 'Production';
        constraints.push(where('team', '==', team));
    }
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.timeClock), ...constraints));
    let items = snapshot.docs.map(withId).filter(Boolean);
    if (options.date) {
        const key = clockDateKey(options.date);
        items = items.filter(item => item.date === key);
    } else if (options.start_date || options.end_date) {
        const start = options.start_date ? clockDateKey(options.start_date) : '0000-00-00';
        const end = options.end_date ? clockDateKey(options.end_date) : '9999-99-99';
        items = items.filter(item => item.date >= start && item.date <= end);
    }
    if (options.status) items = items.filter(item => item.status === options.status);
    return items.sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : String(a.user_name || '').localeCompare(String(b.user_name || '')));
}

export async function approveClockDay(dayId, options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const approver = options.user || await getCurrentUserRecord();
    const ref = doc(db, COLLECTIONS.timeClock, dayId);
    const updates = {
        status: 'approved',
        approved_by: normalizeEmail(approver.email || approver.id),
        approved_by_name: cleanOptionalText(approver.name) || '',
        approved_at: serverTimestamp(),
        edited_by: normalizeEmail(approver.email || approver.id),
        edited_at: serverTimestamp()
    };
    if (options.note !== undefined) updates.note = cleanOptionalText(options.note);
    await updateDoc(ref, updates);
    return withId(await getDoc(ref));
}

export async function unapproveClockDay(dayId, options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const editor = options.user || await getCurrentUserRecord();
    const ref = doc(db, COLLECTIONS.timeClock, dayId);
    await updateDoc(ref, {
        status: 'done',
        approved_by: null,
        approved_by_name: '',
        approved_at: null,
        edited_by: normalizeEmail(editor.email || editor.id),
        edited_at: serverTimestamp()
    });
    return withId(await getDoc(ref));
}

// Manager fixes the numbers (forgotten clock-out, etc.) and/or adds a note.
export async function editClockDay(dayId, patch = {}, options = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const editor = options.user || await getCurrentUserRecord();
    const ref = doc(db, COLLECTIONS.timeClock, dayId);
    const updates = {
        edited_by: normalizeEmail(editor.email || editor.id),
        edited_at: serverTimestamp()
    };
    if (patch.clock_in !== undefined) updates.clock_in = patch.clock_in ? asTimestamp(patch.clock_in) : null;
    if (patch.clock_out !== undefined) updates.clock_out = patch.clock_out ? asTimestamp(patch.clock_out) : null;
    if (patch.break_seconds !== undefined) updates.break_seconds = Math.max(0, Math.round(Number(patch.break_seconds) || 0));
    if (patch.worked_seconds !== undefined) updates.worked_seconds = Math.max(0, Math.round(Number(patch.worked_seconds) || 0));
    if (patch.note !== undefined) updates.note = cleanOptionalText(patch.note);
    await updateDoc(ref, updates);
    return withId(await getDoc(ref));
}

// ════════════════════════════════════════════════
// TIME SETTINGS · GRADES · PRODUCTION OUTPUT
// ════════════════════════════════════════════════
// Settings (settings/time) are read by managers/owner/controller and written
// only by owner/controller. time_grades is a manager's per-period scorecard
// (one doc per person per pay period). production_output is the Stage-4 light
// output log (one doc per team per day). All writes are preview-safe and the
// writer is resolved from the live Firestore user record.

// Sane defaults for settings/time — getTimeSettings merges the stored doc over
// these so missing fields never break callers, and a missing doc returns these.
const TIME_SETTINGS_DEFAULTS = {
    paid_break_minutes: 0,
    unpaid_lunch_minutes: 30,
    grace_minutes: 5,
    department_shifts: {
        roasting: { start: '06:00', hours: 8 },
        packaging: { start: '07:00', hours: 8 },
        warehouse: { start: '07:00', hours: 8 }
    },
    default_shift: { start: '08:00', hours: 8 }
};

function clonedTimeSettingsDefaults() {
    return {
        ...TIME_SETTINGS_DEFAULTS,
        department_shifts: Object.fromEntries(
            Object.entries(TIME_SETTINGS_DEFAULTS.department_shifts)
                .map(([k, v]) => [k, { ...v }])
        ),
        default_shift: { ...TIME_SETTINGS_DEFAULTS.default_shift }
    };
}

function clampScore(value) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num)) return 1;
    return Math.min(5, Math.max(1, num));
}

export async function getTimeSettings() {
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.timeSettings, 'time');
    let stored = null;
    try {
        stored = withId(await getDoc(ref));
    } catch (error) {
        stored = null;
    }
    const defaults = clonedTimeSettingsDefaults();
    if (!stored) return defaults;
    return {
        ...defaults,
        ...stored,
        department_shifts: { ...defaults.department_shifts, ...(stored.department_shifts || {}) },
        default_shift: { ...defaults.default_shift, ...(stored.default_shift || {}) }
    };
}

export async function saveTimeSettings(patch = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const writer = await getCurrentUserRecord();
    if (!isOwnerOrController(writer)) {
        throw new Error('Only the Owner or Controller can change time settings.');
    }
    const ref = doc(db, COLLECTIONS.timeSettings, 'time');
    await setDoc(ref, {
        ...patch,
        updated_at: serverTimestamp(),
        updated_by: normalizeEmail(writer.email || writer.id)
    }, { merge: true });
    return getTimeSettings();
}

// Grades the viewer may see: owner/controller see all; a manager is scoped to
// their team via teamGroupOf so every returned doc passes the security rule.
export async function getTeamGrades(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const constraints = [];
    if (!isOwnerOrController(user)) {
        const team = teamGroupOf(user.department) || 'Production';
        constraints.push(where('team', '==', team));
    }
    const snapshot = await getDocs(query(collection(db, COLLECTIONS.grades), ...constraints));
    let items = snapshot.docs.map(withId).filter(Boolean);
    if (options.team) items = items.filter(item => teamGroupOf(item.team) === teamGroupOf(options.team));
    const start = options.start_date ? clockDateKey(options.start_date) : '0000-00-00';
    const end = options.end_date ? clockDateKey(options.end_date) : '9999-99-99';
    items = items.filter(item => String(item.period_start || '') >= start && String(item.period_start || '') <= end);
    return items.sort((a, b) =>
        String(b.period_start || '').localeCompare(String(a.period_start || ''))
        || String(a.user_name || '').localeCompare(String(b.user_name || '')));
}

export async function saveGrade(input = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const writer = await getCurrentUserRecord();
    const userId = normalizeEmail(input.user_id);
    const periodStart = cleanOptionalText(input.period_start);
    if (!userId) throw new Error('A person is required to save a grade.');
    if (!periodStart) throw new Error('A pay-period start is required to save a grade.');

    const rawScores = input.scores || {};
    const scores = {
        attendance: clampScore(rawScores.attendance),
        punctuality: clampScore(rawScores.punctuality),
        quality: clampScore(rawScores.quality),
        attitude: clampScore(rawScores.attitude)
    };

    const record = {
        user_id: userId,
        user_name: cleanOptionalText(input.user_name) || '',
        team: cleanOptionalText(input.team) || '',
        department: cleanOptionalText(input.department) || '',
        period_start: periodStart,
        period_end: cleanOptionalText(input.period_end) || '',
        scores,
        note: cleanOptionalText(input.note),
        graded_by: normalizeEmail(writer.email || writer.id),
        graded_by_name: cleanOptionalText(writer.name) || '',
        graded_at: serverTimestamp(),
        created_via: 'hub-insights'
    };

    // Mirror the security rule (validGradeWrite) in the data layer so the
    // preview-safe boundary authorizes the writer rather than relying solely on
    // Firestore rules: owner/controller may grade anyone; a production manager
    // may grade a person whose team rolls up to Production.
    if (!isOwnerOrController(writer)) {
        const isManager = String(writer.role_tier || '').toLowerCase() === 'manager';
        const writerTeam = teamGroupOf(writer.department);
        const gradeTeam = teamGroupOf(record.team);
        if (!(isManager && writerTeam === 'Production' && gradeTeam === 'Production')) {
            throw new Error('Only the Owner, Controller, or the team\'s manager can grade.');
        }
    }

    const id = `${docIdForEmail(userId)}_${periodStart}`;
    const ref = doc(db, COLLECTIONS.grades, id);
    await setDoc(ref, record, { merge: true });
    return withId(await getDoc(ref));
}

export async function getProductionOutput(options = {}) {
    const { db } = requireFirestore();
    const user = options.user || await getCurrentUserRecord();
    const snapshot = await getDocs(collection(db, COLLECTIONS.output));
    let items = snapshot.docs.map(withId).filter(Boolean);
    if (options.team) items = items.filter(item => teamGroupOf(item.team) === teamGroupOf(options.team));
    const start = options.start_date ? clockDateKey(options.start_date) : '0000-00-00';
    const end = options.end_date ? clockDateKey(options.end_date) : '9999-99-99';
    items = items.filter(item => String(item.date || '') >= start && String(item.date || '') <= end);
    return items.sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
        || String(a.team || '').localeCompare(String(b.team || '')));
}

export async function saveProductionOutput(input = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const writer = await getCurrentUserRecord();
    const team = cleanOptionalText(input.team);
    const date = cleanOptionalText(input.date);
    if (!team) throw new Error('A team is required to log output.');
    if (!date) throw new Error('A date is required to log output.');

    const record = {
        team,
        date,
        units: Math.max(0, Number(input.units) || 0),
        unit_label: cleanOptionalText(input.unit_label),
        note: cleanOptionalText(input.note),
        logged_by: normalizeEmail(writer.email || writer.id),
        logged_by_name: cleanOptionalText(writer.name) || '',
        logged_at: serverTimestamp(),
        created_via: 'hub-insights'
    };

    const id = `${team.toLowerCase()}_${date}`;
    const ref = doc(db, COLLECTIONS.output, id);
    await setDoc(ref, record, { merge: true });
    return withId(await getDoc(ref));
}

export async function upsertUser(user = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const id = docIdForEmail(user.email || user.id);
    if (!id) throw new Error('User email is required.');

    const ref = doc(db, COLLECTIONS.users, id);
    await setDoc(ref, {
        email: normalizeEmail(user.email || id),
        name: cleanOptionalText(user.name),
        department: cleanOptionalText(user.department || 'Production'),
        title: cleanOptionalText(user.title),
        role_tier: cleanOptionalText(user.role_tier || user.roleTier || 'Staff'),
        manager_id: cleanOptionalText(user.manager_id || user.managerId),
        backup_approver_id: cleanOptionalText(user.backup_approver_id || user.backupApproverId),
        hourly: Boolean(user.hourly),
        phone: cleanOptionalText(user.phone),
        address: cleanOptionalText(user.address),
        active: user.active !== false,
        hire_date: user.hire_date ? asTimestamp(user.hire_date) : null,
        vacation_days_allotted: user.vacation_days_allotted ?? null,
        vacation_days_used: user.vacation_days_used ?? null,
        expected_start: normalizeExpectedStart(user.expected_start),
        expected_hours: normalizeExpectedHours(user.expected_hours),
        calendar_tokens: user.calendar_tokens || {},
        updated_at: serverTimestamp()
    }, { merge: true });

    return getUserByEmail(id);
}

export const saveUser = upsertUser;
export const createUser = upsertUser;

export async function updateUser(userOrId, patch = {}) {
    blockIfPreview();
    if (typeof userOrId !== 'string') {
        return upsertUser(userOrId);
    }

    const { db } = requireFirestore();
    const updates = { updated_at: serverTimestamp() };
    if (patch.active !== undefined) updates.active = Boolean(patch.active);
    if (patch.manager_id !== undefined) updates.manager_id = cleanOptionalText(patch.manager_id);
    if (patch.role_tier !== undefined) updates.role_tier = cleanOptionalText(patch.role_tier);
    if (patch.department !== undefined) updates.department = cleanOptionalText(patch.department);
    if (patch.hourly !== undefined) updates.hourly = Boolean(patch.hourly);
    if (patch.phone !== undefined) updates.phone = cleanOptionalText(patch.phone);
    if (patch.address !== undefined) updates.address = cleanOptionalText(patch.address);
    if (patch.expected_start !== undefined) updates.expected_start = normalizeExpectedStart(patch.expected_start);
    if (patch.expected_hours !== undefined) updates.expected_hours = normalizeExpectedHours(patch.expected_hours);
    if (patch.calendar_tokens !== undefined) updates.calendar_tokens = patch.calendar_tokens || {};

    const ref = doc(db, COLLECTIONS.users, userOrId);
    await updateDoc(ref, updates);
    return withId(await getDoc(ref));
}

export async function setUserActive(userId, { active } = {}) {
    blockIfPreview();
    const { db } = requireFirestore();
    const ref = doc(db, COLLECTIONS.users, userId);
    await updateDoc(ref, {
        active: Boolean(active),
        updated_at: serverTimestamp()
    });
    return withId(await getDoc(ref));
}

export async function getActivityLog(options = {}) {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, 'activity_log'));
    return snapshot.docs
        .map(withId)
        .filter(item => !options.event_type || item.event_type === options.event_type)
        .filter(item => !options.tool_name || item.tool_name === options.tool_name)
        .filter(item => overlapsRange({
            start_date: item.timestamp,
            end_date: item.timestamp
        }, options.start_date, options.end_date))
        .sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
}

function calendarToken(user, key) {
    const tokens = user.calendar_tokens || {};
    return tokens[key] || user[`${key}_calendar_token`] || user[`${key}CalendarToken`] || '';
}

function calendarUrl(scope, token) {
    const url = new URL('/.netlify/functions/calendar-ics', window.location.origin);
    url.searchParams.set('scope', scope);
    url.searchParams.set('token', token || 'firestore-token-required');
    return url.href;
}

export async function getCalendarSubscriptions(role) {
    const user = await getCurrentUserRecord();
    return {
        team: calendarUrl('team', calendarToken(user, 'team') || calendarToken(user, 'time_off')),
        personal: calendarUrl('personal', calendarToken(user, 'personal')),
        sick: calendarUrl('admin', calendarToken(user, 'admin') || calendarToken(user, 'sick'))
    };
}

export async function regenerateCalendarToken() {
    const user = await getCurrentUserRecord();
    const token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextTokens = {
        ...(user.calendar_tokens || {}),
        personal: token
    };
    await updateUser(user.id, { calendar_tokens: nextTokens });
    return getCalendarSubscriptions();
}

export async function createAvatarLog(input = {}) {
    const { auth, db } = requireFirestore();
    const currentUser = await requireCurrentFirebaseUser(auth);
    const avatarName = cleanOptionalText(input.avatar_name || input.avatarName || input.name);
    if (!avatarName) throw new Error('Avatar name is required.');

    const status = validAvatarStatus(input.status) ? input.status : 'Untested';
    const payload = {
        avatar_name: avatarName,
        campaign: cleanOptionalText(input.campaign),
        status,
        result_notes: cleanOptionalText(input.result_notes || input.result),
        sub_avatar: cleanOptionalText(input.sub_avatar || input.subAvatar),
        best_hook: cleanOptionalText(input.best_hook || input.bestHook),
        belief: cleanOptionalText(input.belief),
        brief: cleanOptionalText(input.brief),
        fields: input.fields || {},
        angles: Array.isArray(input.angles) ? input.angles : [],
        built: Array.isArray(input.built) ? input.built : [],
        batch_no: Number(input.batch_no || input.batchNo || 0),
        date_label: cleanOptionalText(input.date_label || input.dateLabel),
        legacy_id: cleanOptionalText(input.legacy_id || input.legacyId),
        record: input.record || null,
        created_by_uid: currentUser.uid,
        created_by_email: normalizeEmail(currentUser.email),
        created_by_name: cleanOptionalText(input.created_by_name || input.createdByName || currentUser.displayName) || normalizeEmail(currentUser.email),
        created_via: 'hub-avatar-builder',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
    };

    const ref = await addDoc(collection(db, COLLECTIONS.avatarLogs), payload);
    return { id: ref.id, ...payload };
}

export async function getAvatarLogs(options = {}) {
    const { db } = requireFirestore();
    const snapshot = await getDocs(collection(db, COLLECTIONS.avatarLogs));
    const search = cleanOptionalText(options.search).toLowerCase();
    const creator = normalizeEmail(options.creator || options.created_by_email);
    const status = cleanOptionalText(options.status);

    return snapshot.docs
        .map(withId)
        .filter(Boolean)
        .filter(item => !status || item.status === status)
        .filter(item => !creator || normalizeEmail(item.created_by_email) === creator)
        .filter(item => overlapsRange({
            start_date: item.created_at,
            end_date: item.created_at
        }, options.start_date, options.end_date))
        .filter(item => {
            if (!search) return true;
            const haystack = [
                item.avatar_name,
                item.campaign,
                item.created_by_name,
                item.created_by_email,
                item.status,
                item.sub_avatar,
                item.best_hook,
                item.belief,
                item.brief
            ].join(' ').toLowerCase();
            return haystack.includes(search);
        })
        .sort((a, b) => timestampMillis(b.created_at) - timestampMillis(a.created_at));
}

export async function updateAvatarLog(avatarId, patch = {}) {
    const { db } = requireFirestore();
    if (!avatarId) throw new Error('Avatar log id is required.');

    const updates = { updated_at: serverTimestamp() };
    if (patch.status !== undefined) {
        if (!validAvatarStatus(patch.status)) throw new Error('Unknown avatar status.');
        updates.status = patch.status;
    }
    if (patch.result_notes !== undefined || patch.result !== undefined) {
        updates.result_notes = cleanOptionalText(patch.result_notes ?? patch.result);
    }
    if (patch.avatar_name !== undefined || patch.avatarName !== undefined) {
        updates.avatar_name = cleanOptionalText(patch.avatar_name ?? patch.avatarName);
    }
    if (patch.best_hook !== undefined || patch.bestHook !== undefined) {
        updates.best_hook = cleanOptionalText(patch.best_hook ?? patch.bestHook);
    }
    if (patch.sub_avatar !== undefined || patch.subAvatar !== undefined) {
        updates.sub_avatar = cleanOptionalText(patch.sub_avatar ?? patch.subAvatar);
    }
    if (patch.belief !== undefined) {
        updates.belief = cleanOptionalText(patch.belief);
    }
    if (patch.brief !== undefined) {
        updates.brief = cleanOptionalText(patch.brief);
    }
    if (patch.fields !== undefined) {
        updates.fields = patch.fields || {};
    }
    if (patch.angles !== undefined) {
        updates.angles = Array.isArray(patch.angles) ? patch.angles : [];
    }
    if (patch.built !== undefined) {
        updates.built = Array.isArray(patch.built) ? patch.built : [];
    }
    if (patch.record !== undefined) {
        updates.record = patch.record || null;
    }

    const ref = doc(db, COLLECTIONS.avatarLogs, avatarId);
    await updateDoc(ref, updates);
    return withId(await getDoc(ref));
}

export async function deleteAvatarLog(avatarId) {
    const { db } = requireFirestore();
    if (!avatarId) throw new Error('Avatar log id is required.');
    await deleteDoc(doc(db, COLLECTIONS.avatarLogs, avatarId));
    return true;
}
