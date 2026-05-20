import {
    addDoc,
    collection,
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
import { initFirebase, normalizeEmail } from '../fratello-auth.js';

const COLLECTIONS = {
    users: 'users',
    requests: 'time_off_requests',
    approvals: 'approvals',
    holidays: 'holidays',
    settings: 'settings'
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

function requireCurrentFirebaseUser(auth) {
    if (!auth.currentUser) {
        throw new Error('Please sign in before using the time-off tools.');
    }
    return auth.currentUser;
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

async function getCurrentUserRecord() {
    const { auth } = requireFirestore();
    const currentUser = requireCurrentFirebaseUser(auth);
    const user = await getUserByEmail(currentUser.email);
    if (!user) {
        throw new Error('Your Hub login does not have a matching Firestore user record yet.');
    }
    return user;
}

async function fetchApprovalAction(action, requestId, comment = '') {
    const { auth } = requireFirestore();
    const currentUser = requireCurrentFirebaseUser(auth);
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
    const currentUser = requireCurrentFirebaseUser(auth);
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

export async function submitTimeOffRequest(input = {}) {
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

export async function getSickDays(options = {}) {
    if (options.mine) {
        return getMyRequests({ ...options, type: 'sick' });
    }
    return (await getTeamRequests({ ...options, include_sick: true }))
        .filter(item => item.type === 'sick');
}

export async function cancelRequest(requestId) {
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

export async function upsertUser(user = {}) {
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
        active: user.active !== false,
        hire_date: user.hire_date ? asTimestamp(user.hire_date) : null,
        vacation_days_allotted: user.vacation_days_allotted ?? null,
        vacation_days_used: user.vacation_days_used ?? null,
        calendar_tokens: user.calendar_tokens || {},
        updated_at: serverTimestamp()
    }, { merge: true });

    return getUserByEmail(id);
}

export const saveUser = upsertUser;
export const createUser = upsertUser;

export async function updateUser(userOrId, patch = {}) {
    if (typeof userOrId !== 'string') {
        return upsertUser(userOrId);
    }

    const { db } = requireFirestore();
    const updates = { updated_at: serverTimestamp() };
    if (patch.active !== undefined) updates.active = Boolean(patch.active);
    if (patch.manager_id !== undefined) updates.manager_id = cleanOptionalText(patch.manager_id);
    if (patch.role_tier !== undefined) updates.role_tier = cleanOptionalText(patch.role_tier);
    if (patch.department !== undefined) updates.department = cleanOptionalText(patch.department);
    if (patch.calendar_tokens !== undefined) updates.calendar_tokens = patch.calendar_tokens || {};

    const ref = doc(db, COLLECTIONS.users, userOrId);
    await updateDoc(ref, updates);
    return withId(await getDoc(ref));
}

export async function setUserActive(userId, { active } = {}) {
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
