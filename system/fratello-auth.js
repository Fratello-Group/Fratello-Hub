import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    OAuthProvider,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore,
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

export const PROFILE_DEFINITIONS = {
    owner: {
        key: 'owner',
        label: 'Owner',
        sections: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'marketing', 'hr-people', 'employee-resources', 'time-off', 'owner-admin', 'settings'],
        areas: ['Finance', 'Roasting', 'Packaging', 'Warehouse', 'Sales', 'Marketing', 'HR & People', 'Resources', 'Time Off', 'Owner/Admin', 'Settings']
    },
    controller: {
        key: 'controller',
        label: 'Controller',
        sections: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'hr-people', 'employee-resources', 'time-off'],
        areas: ['Finance', 'Roasting', 'Packaging', 'Warehouse', 'Sales', 'HR & People', 'Resources', 'Time Off']
    },
    production: {
        key: 'production',
        label: 'Production',
        sections: ['production-roasting', 'production-packaging', 'production-warehouse', 'hr-people', 'employee-resources', 'time-off'],
        areas: ['Roasting', 'Packaging', 'Warehouse', 'HR & People', 'Resources', 'Time Off']
    },
    marketing: {
        key: 'marketing',
        label: 'Marketing',
        sections: ['marketing', 'hr-people', 'employee-resources', 'time-off'],
        areas: ['Marketing', 'HR & People', 'Resources', 'Time Off']
    },
    sales: {
        key: 'sales',
        label: 'Sales',
        sections: ['sales', 'marketing', 'employee-resources', 'time-off'],
        areas: ['Sales', 'Marketing', 'Resources', 'Time Off']
    },
    staff: {
        key: 'staff',
        label: 'Staff',
        sections: ['employee-resources', 'time-off'],
        areas: ['Resources', 'Time Off']
    }
};

const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

let app;
let auth;
let db;

export function normalizeEmail(email) {
    return String(email || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

export function firebaseConfigured() {
    const config = window.FRATELLO_FIREBASE_CONFIG || {};
    return config.enabled === true && REQUIRED_CONFIG_KEYS.every(key => Boolean(config[key]));
}

export function initFirebase() {
    if (!firebaseConfigured()) {
        return { ready: false, auth: null, db: null };
    }

    if (!app) {
        app = getApps().find(item => item.name === 'fratello-hub') ||
            initializeApp(window.FRATELLO_FIREBASE_CONFIG, 'fratello-hub');
        auth = getAuth(app);
        db = getFirestore(app);
    }

    return { ready: true, auth, db };
}

function ownerEmails() {
    return (window.FRATELLO_OWNER_EMAILS || []).map(normalizeEmail);
}

function displayNameFromEmail(email) {
    return normalizeEmail(email)
        .split('@')[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Team Member';
}

function timeOffRoleTier(profileKey) {
    if (profileKey === 'owner') return 'Owner';
    if (profileKey === 'controller') return 'Controller';
    if (['production', 'marketing', 'sales'].includes(profileKey)) return 'Manager';
    return 'Staff';
}

function timeOffDepartment(profileKey) {
    if (profileKey === 'owner') return 'Leadership';
    if (profileKey === 'controller') return 'Finance';
    if (profileKey === 'production') return 'Production';
    if (profileKey === 'marketing') return 'Marketing';
    if (profileKey === 'sales') return 'Sales';
    return 'Staff';
}

function defaultManagerId(profileKey) {
    if (profileKey === 'owner') return null;
    if (profileKey === 'controller' || profileKey === 'production' || profileKey === 'marketing') {
        return 'prefontainech@gmail.com';
    }
    if (profileKey === 'sales') return 'russ@fratellocoffee.com';
    return 'prefontainech@gmail.com';
}

function dateToInputValue(value) {
    if (!value) return '';
    if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
    if (typeof value === 'string') {
        const match = value.match(/\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : '';
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function dateToTimestamp(value) {
    const clean = dateToInputValue(value);
    return clean ? Timestamp.fromDate(new Date(`${clean}T00:00:00.000Z`)) : null;
}

async function upsertTimeOffUserFromAccess({ name, email, title, profile, status = 'active', department, role_tier, manager_id, hire_date, active, phone, address }) {
    initFirebase();
    const normalized = normalizeEmail(email);
    const profileKey = PROFILE_DEFINITIONS[profile] ? profile : 'staff';
    if (!normalized) return;

    const record = {
        email: normalized,
        name: String(name || '').trim() || displayNameFromEmail(normalized),
        department: String(department || '').trim() || timeOffDepartment(profileKey),
        title: String(title || '').trim(),
        role_tier: String(role_tier || '').trim() || timeOffRoleTier(profileKey),
        manager_id: normalizeEmail(manager_id || defaultManagerId(profileKey) || ''),
        backup_approver_id: null,
        active: active !== undefined ? Boolean(active) : status !== 'disabled',
        hire_date: dateToTimestamp(hire_date),
        updated_at: serverTimestamp()
    };
    // Contact details are optional — only write them when provided so a blank
    // edit never wipes an existing phone/address.
    if (phone !== undefined) record.phone = String(phone || '').trim();
    if (address !== undefined) record.address = String(address || '').trim();

    await setDoc(doc(db, 'users', normalized), record, { merge: true });
}

function providerLabel(providerIds) {
    const ids = Array.isArray(providerIds) ? providerIds : [];
    if (ids.includes('microsoft.com')) return 'Microsoft';
    if (ids.includes('google.com')) return 'Google';
    if (ids.includes('apple.com')) return 'Apple';
    if (ids.includes('password')) return 'Email & password';
    return '';
}

function roleFromProfile(id, data) {
    const profileKey = data.profile || 'staff';
    const profile = PROFILE_DEFINITIONS[profileKey] || PROFILE_DEFINITIONS.staff;
    const tierLabel = data.role_tier || timeOffRoleTier(profileKey);
    return {
        key: profile.key,
        label: profile.label,
        sections: profile.sections,
        roleTier: tierLabel,
        // Two-axis access model: the hub derives what's visible from tier + department.
        tier: String(tierLabel).toLowerCase(),
        department: data.department || timeOffDepartment(profileKey),
        user: {
            id,
            name: data.name || displayNameFromEmail(data.email),
            email: data.email,
            title: data.title || '',
            phone: data.phone || '',
            address: data.address || '',
            status: data.status || 'active',
            provider: providerLabel(data.providerIds)
        }
    };
}

function publicUserFromProfile(id, data) {
    const profileKey = data.profile || 'staff';
    const profile = PROFILE_DEFINITIONS[profileKey] || PROFILE_DEFINITIONS.staff;
    return {
        id,
        uid: data.uid || id,
        source: data.uid ? 'profile' : 'invite',
        name: data.name || displayNameFromEmail(data.email),
        email: data.email,
        title: data.title || '',
        profile: profile.key,
        profileLabel: profile.label,
        areas: profile.areas,
        department: data.department || '',
        role_tier: data.role_tier || '',
        manager_id: data.manager_id || '',
        hourly: data.hourly === true,
        phone: data.phone || '',
        address: data.address || '',
        hire_date: dateToInputValue(data.hire_date),
        active: data.active !== false,
        status: data.status || 'active',
        lastLoginAt: data.lastLoginAt || '',
        created_at: (data.createdAt && typeof data.createdAt.toMillis === 'function') ? data.createdAt.toMillis() : 0,
        passwordChangedAt: '',
        resetStatus: 'firebase-email',
        inviteStatus: data.uid ? 'accepted' : 'pending'
    };
}

async function profileForUser(user) {
    initFirebase();
    const profileRef = doc(db, 'hubProfiles', user.uid);
    const profileSnap = await getDoc(profileRef);
    const email = normalizeEmail(user.email);

    if (profileSnap.exists()) {
        const profile = profileSnap.data();
        if (profile.status === 'disabled') throw new Error('This Hub account is disabled.');
        await updateDoc(profileRef, {
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return roleFromProfile(user.uid, { ...profile, email: profile.email || email });
    }

    if (ownerEmails().includes(email)) {
        const ownerProfile = {
            name: user.displayName || displayNameFromEmail(email),
            email,
        title: email === 'prefontainech@gmail.com' ? 'CEO' : 'Owner',
        profile: 'owner',
        department: 'Leadership',
        role_tier: 'Owner',
        manager_id: '',
        active: true,
        status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            providerIds: user.providerData.map(provider => provider.providerId)
        };
        await setDoc(profileRef, ownerProfile);
        return roleFromProfile(user.uid, ownerProfile);
    }

    const inviteRef = doc(db, 'hubInvites', email);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
        throw new Error('This email is signed in, but it has not been invited to the Hub yet.');
    }

    const invite = inviteSnap.data();
    if (invite.status === 'disabled') throw new Error('This Hub account is disabled.');

    const invitedProfile = {
        name: invite.name || user.displayName || displayNameFromEmail(email),
        email,
        title: invite.title || '',
        profile: invite.profile || 'staff',
        department: invite.department || timeOffDepartment(invite.profile || 'staff'),
        role_tier: invite.role_tier || timeOffRoleTier(invite.profile || 'staff'),
        manager_id: normalizeEmail(invite.manager_id || defaultManagerId(invite.profile || 'staff') || ''),
        hire_date: dateToInputValue(invite.hire_date) || null,
        active: invite.active !== false,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        invitedBy: invite.invitedBy || '',
        providerIds: user.providerData.map(provider => provider.providerId)
    };
    await setDoc(profileRef, invitedProfile);
    return roleFromProfile(user.uid, invitedProfile);
}

export async function signInWithEmail(email, password) {
    initFirebase();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return profileForUser(credential.user);
}

export async function createEmailAccount(email, password) {
    initFirebase();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return profileForUser(credential.user);
}

// Popup sign-in is unreliable on phones (it gets blocked or cancelled —
// "auth/cancelled-popup-request"). On touch devices we use a full-page redirect,
// and on desktop we fall back to redirect if the popup fails for any popup reason.
// A redirect navigates away and returns null; the result is then picked up by
// getRedirectResult()/onAuthStateChanged on the way back.
const POPUP_FALLBACK_CODES = new Set([
    'auth/cancelled-popup-request',
    'auth/popup-blocked',
    'auth/popup-closed-by-user',
    'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported'
]);

function prefersRedirectSignIn() {
    try {
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
        return !(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    } catch (error) {
        return false;
    }
}

// Running as an installed home-screen app (PWA standalone)? A full-page OAuth
// redirect leaves this app's storage context on iOS and never returns the
// session — the sign-in just loops. A popup stays in-context and posts back, so
// in standalone we use the popup and only fall back to redirect if it's blocked.
function isStandaloneApp() {
    try {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
    } catch (error) {
        return false;
    }
}

async function popupThenRedirect(provider) {
    try {
        const credential = await signInWithPopup(auth, provider);
        return profileForUser(credential.user);
    } catch (error) {
        if (error && POPUP_FALLBACK_CODES.has(error.code)) {
            await signInWithRedirect(auth, provider);
            return null;
        }
        throw error;
    }
}

async function authWithProvider(provider) {
    initFirebase();
    // Installed app: prefer the popup (redirect loops in iOS standalone).
    if (isStandaloneApp()) {
        return popupThenRedirect(provider);
    }
    if (prefersRedirectSignIn()) {
        await signInWithRedirect(auth, provider);
        return null;
    }
    return popupThenRedirect(provider);
}

export async function signInWithGoogle() {
    return authWithProvider(new GoogleAuthProvider());
}

export async function signInWithApple() {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return authWithProvider(provider);
}

export async function signInWithMicrosoft() {
    const provider = new OAuthProvider('microsoft.com');
    provider.addScope('email');
    provider.addScope('openid');
    provider.addScope('profile');
    // Lock sign-in to the company's Microsoft 365 tenant when its ID is set in
    // firebase-config.js (otherwise allow any work/school account, not personal).
    const tenant = String(window.FRATELLO_MICROSOFT_TENANT || '').trim();
    provider.setCustomParameters({ tenant: tenant || 'organizations' });
    return authWithProvider(provider);
}

export async function sendResetEmail(email) {
    initFirebase();
    await sendPasswordResetEmail(auth, email);
}

export async function currentIdToken() {
    initFirebase();
    if (!auth.currentUser) throw new Error('Sign in again before making this change.');
    return auth.currentUser.getIdToken(true);
}

export async function sendHubInviteEmail(payload = {}) {
    const token = await currentIdToken();
    const response = await fetch('/.netlify/functions/hub-invite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not send invite.');
    return data;
}

export async function deleteHubUserServer(person = {}) {
    const token = await currentIdToken();
    const response = await fetch('/.netlify/functions/hub-delete-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: person.email || '', uid: person.uid || '' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not delete the user.');
    return data;
}

export async function signOutHub() {
    initFirebase();
    await signOut(auth);
}

export function onHubAuthChange(callback) {
    const state = initFirebase();
    if (!state.ready) {
        callback(null);
        return () => {};
    }

    // Surface errors from a redirect sign-in (a successful one is delivered by
    // onAuthStateChanged below; this only reports failures like an unauthorized domain).
    getRedirectResult(auth).catch(error => callback(null, error));

    return onAuthStateChanged(auth, async user => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            callback(await profileForUser(user));
        } catch (error) {
            callback(null, error);
        }
    });
}

export async function currentHubRole() {
    const state = initFirebase();
    if (!state.ready || !auth.currentUser) return null;
    return profileForUser(auth.currentUser);
}

export async function listHubUsers() {
    initFirebase();
    const rosterByEmail = new Map();
    const userSnap = await getDocs(collection(db, 'users')).catch(() => ({ forEach: () => {} }));
    userSnap.forEach(item => {
        const data = item.data();
        const email = normalizeEmail(data.email || item.id);
        if (!email) return;
        rosterByEmail.set(email, {
            department: data.department || '',
            role_tier: data.role_tier || '',
            manager_id: normalizeEmail(data.manager_id || ''),
            hourly: data.hourly === true,
            phone: data.phone || '',
            address: data.address || '',
            hire_date: dateToInputValue(data.hire_date),
            active: data.active !== false
        });
    });

    const profiles = new Map();
    const profileSnap = await getDocs(collection(db, 'hubProfiles'));
    profileSnap.forEach(item => {
        const email = normalizeEmail(item.data().email);
        if (email) profiles.set(email, publicUserFromProfile(item.id, { ...item.data(), ...rosterByEmail.get(email), uid: item.id, email }));
    });

    const inviteSnap = await getDocs(collection(db, 'hubInvites'));
    inviteSnap.forEach(item => {
        const invite = item.data();
        const email = normalizeEmail(invite.email || item.id);
        if (email && !profiles.has(email)) {
            profiles.set(email, publicUserFromProfile(item.id, { ...invite, ...rosterByEmail.get(email), email, status: invite.status || 'invited' }));
        }
    });

    rosterByEmail.forEach((roster, email) => {
        if (!profiles.has(email)) {
            profiles.set(email, publicUserFromProfile(email, {
                ...roster,
                email,
                name: displayNameFromEmail(email),
                profile: 'staff',
                status: roster.active ? 'invited' : 'disabled'
            }));
        }
    });

    const deduped = new Map();
    Array.from(profiles.values()).forEach(person => {
        const email = normalizeEmail(person.email);
        if (!email) return;
        const existing = deduped.get(email);
        if (!existing || (person.source === 'profile' && existing.source !== 'profile')) {
            deduped.set(email, person);
        }
    });

    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Flag a person as paid hourly (shows them the dashboard time clock). Stored on
// the users record (merge), so it survives profile/department edits.
export async function setHubUserHourly(emailOrPerson, hourly) {
    initFirebase();
    const email = normalizeEmail(typeof emailOrPerson === 'string'
        ? emailOrPerson
        : (emailOrPerson && (emailOrPerson.email || emailOrPerson.id)));
    if (!email) throw new Error('A user email is required.');
    await setDoc(doc(db, 'users', email), {
        email,
        hourly: Boolean(hourly),
        updated_at: serverTimestamp()
    }, { merge: true });
    return { email, hourly: Boolean(hourly) };
}

// Stamp contact details (phone / address) onto a person's roster record. Used
// right after an invite so details captured on the form aren't lost server-side,
// and anywhere the Owner edits contact info. Merge-safe.
export async function setHubUserContact(emailOrPerson, { phone, address } = {}) {
    initFirebase();
    const email = normalizeEmail(typeof emailOrPerson === 'string'
        ? emailOrPerson
        : (emailOrPerson && (emailOrPerson.email || emailOrPerson.id)));
    if (!email) throw new Error('A user email is required.');
    const patch = { email, updated_at: serverTimestamp() };
    if (phone !== undefined) patch.phone = String(phone || '').trim();
    if (address !== undefined) patch.address = String(address || '').trim();
    await setDoc(doc(db, 'users', email), patch, { merge: true });
    return { email, phone: patch.phone, address: patch.address };
}

// Self-service: the signed-in person updates their OWN contact details only.
// Name / phone / address are not permission fields, so this never changes what
// they can see. Writes the profile (where the roster reads an accepted user's
// name) and the users record (directory + time-off), both guarded by rules.
export async function updateOwnProfile({ name, phone, address } = {}) {
    initFirebase();
    if (!auth.currentUser) throw new Error('Sign in again to update your profile.');
    const uid = auth.currentUser.uid;
    const email = normalizeEmail(auth.currentUser.email);
    const clean = value => (value === undefined ? undefined : String(value || '').trim());
    const nm = clean(name);
    const ph = clean(phone);
    const ad = clean(address);

    const profilePatch = { updatedAt: serverTimestamp() };
    if (nm !== undefined && nm) profilePatch.name = nm;
    if (ph !== undefined) profilePatch.phone = ph;
    if (ad !== undefined) profilePatch.address = ad;
    try { await updateDoc(doc(db, 'hubProfiles', uid), profilePatch); }
    catch (error) { /* profile may not exist yet (invited but not signed in) */ }

    if (email) {
        const userPatch = { email, updated_at: serverTimestamp() };
        if (nm !== undefined && nm) userPatch.name = nm;
        if (ph !== undefined) userPatch.phone = ph;
        if (ad !== undefined) userPatch.address = ad;
        try { await setDoc(doc(db, 'users', email), userPatch, { merge: true }); }
        catch (error) { /* best-effort; profile copy is the source of truth for name */ }
    }
    return { name: nm, phone: ph, address: ad };
}

export async function saveHubInvite({ name, email, title, profile, department, role_tier, manager_id, hire_date, active = true, phone, address }) {
    initFirebase();
    const normalized = normalizeEmail(email);
    const profileKey = PROFILE_DEFINITIONS[profile] ? profile : 'staff';
    const payload = {
        name: String(name || '').trim(),
        email: normalized,
        title: String(title || '').trim(),
        profile: profileKey,
        department: String(department || '').trim() || timeOffDepartment(profileKey),
        role_tier: String(role_tier || '').trim() || timeOffRoleTier(profileKey),
        manager_id: normalizeEmail(manager_id || defaultManagerId(profileKey) || ''),
        phone: String(phone || '').trim(),
        address: String(address || '').trim(),
        hire_date: dateToInputValue(hire_date),
        active: active !== false,
        status: 'invited',
        updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, 'hubInvites', normalized), {
        ...payload,
        createdAt: serverTimestamp()
    }, { merge: true });

    await upsertTimeOffUserFromAccess(payload);

    const existingProfiles = await getDocs(query(collection(db, 'hubProfiles'), where('email', '==', normalized)));
    const updates = [];
    existingProfiles.forEach(item => {
        updates.push(updateDoc(doc(db, 'hubProfiles', item.id), {
            name: payload.name,
            title: payload.title,
            profile: profileKey,
            department: payload.department,
            role_tier: payload.role_tier,
            manager_id: payload.manager_id,
            phone: payload.phone,
            address: payload.address,
            hire_date: payload.hire_date || null,
            status: 'active',
            updatedAt: serverTimestamp()
        }));
    });
    await Promise.all(updates);

    return {
        name: payload.name,
        email: normalized,
        profile: profileKey,
        inviteUrl: `${window.location.origin}/`
    };
}

export async function updateHubUser(person, profile) {
    initFirebase();
    const profileKey = PROFILE_DEFINITIONS[profile] ? profile : 'staff';
    if (person.uid && person.source === 'profile') {
        // Name + title also live on the profile (that's where the roster reads
        // an accepted user's name from), so an edit here must update them too —
        // otherwise renaming an existing account wouldn't stick.
        await updateDoc(doc(db, 'hubProfiles', person.uid), {
            name: person.name,
            title: person.title || '',
            profile: profileKey,
            department: person.department || timeOffDepartment(profileKey),
            role_tier: person.role_tier || timeOffRoleTier(profileKey),
            manager_id: normalizeEmail(person.manager_id || defaultManagerId(profileKey) || ''),
            phone: String(person.phone || '').trim(),
            address: String(person.address || '').trim(),
            hire_date: dateToInputValue(person.hire_date) || null,
            active: person.active !== false,
            updatedAt: serverTimestamp()
        });
    }
    await setDoc(doc(db, 'hubInvites', normalizeEmail(person.email)), {
        name: person.name,
        email: normalizeEmail(person.email),
        title: person.title || '',
        profile: profileKey,
        department: person.department || timeOffDepartment(profileKey),
        role_tier: person.role_tier || timeOffRoleTier(profileKey),
        manager_id: normalizeEmail(person.manager_id || defaultManagerId(profileKey) || ''),
        phone: String(person.phone || '').trim(),
        address: String(person.address || '').trim(),
        hire_date: dateToInputValue(person.hire_date) || null,
        active: person.active !== false,
        status: person.status === 'disabled' ? 'disabled' : 'invited',
        updatedAt: serverTimestamp()
    }, { merge: true });

    await upsertTimeOffUserFromAccess({
        name: person.name,
        email: person.email,
        title: person.title || '',
        profile: profileKey,
        department: person.department,
        role_tier: person.role_tier,
        manager_id: person.manager_id,
        phone: person.phone,
        address: person.address,
        hire_date: person.hire_date,
        active: person.active !== false,
        status: person.status
    });
}

export async function setHubUserDisabled(person, disabled) {
    initFirebase();
    const status = disabled ? 'disabled' : 'active';
    if (person.uid && person.source === 'profile') {
        await updateDoc(doc(db, 'hubProfiles', person.uid), {
            status,
            updatedAt: serverTimestamp()
        });
    }
    await setDoc(doc(db, 'hubInvites', normalizeEmail(person.email)), {
        name: person.name,
        email: normalizeEmail(person.email),
        title: person.title || '',
        profile: person.profile || 'staff',
        status: disabled ? 'disabled' : 'invited',
        updatedAt: serverTimestamp()
    }, { merge: true });

    await upsertTimeOffUserFromAccess({
        name: person.name,
        email: person.email,
        title: person.title || '',
        profile: person.profile || 'staff',
        department: person.department,
        role_tier: person.role_tier,
        manager_id: person.manager_id,
        hire_date: person.hire_date,
        status: disabled ? 'disabled' : 'active'
    });
}

export async function deleteHubUser(person) {
    initFirebase();
    const email = normalizeEmail(person.email);

    // Collect every hubProfiles doc tied to this person (by uid and by email).
    const profileIds = new Set();
    if (person.uid) profileIds.add(person.uid);
    if (email) {
        const matches = await getDocs(query(collection(db, 'hubProfiles'), where('email', '==', email)));
        matches.forEach(item => profileIds.add(item.id));
    }

    const tasks = [];
    profileIds.forEach(id => tasks.push(deleteDoc(doc(db, 'hubProfiles', id))));
    if (email) {
        tasks.push(deleteDoc(doc(db, 'hubInvites', email)));
        tasks.push(deleteDoc(doc(db, 'users', email)));
    }
    await Promise.all(tasks);
    // Note: the person's Firebase sign-in account (if any) is not removed here;
    // without their Hub profile/invite they can no longer access the Hub.
}

export function friendlyAuthError(error) {
    const code = error && error.code;
    if (code === 'auth/popup-closed-by-user') return 'The sign-in window was closed before login finished.';
    if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow popups and try again.';
    if (code === 'auth/invalid-email') return 'That email address does not look right.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return 'Email or password is incorrect. Use Forgot password if needed.';
    }
    if (code === 'auth/too-many-requests') {
        return 'Too many sign-in attempts. This account is temporarily locked — wait a few minutes or use Forgot password.';
    }
    if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
    if (code === 'auth/weak-password') return 'Use a password with at least 6 characters.';
    if (code === 'auth/unauthorized-domain') return 'This domain has not been added to Firebase authorized domains yet.';
    if (code === 'auth/operation-not-allowed') return 'This sign-in method is not switched on in Firebase yet.';
    if (code === 'auth/account-exists-with-different-credential') return 'This email already signs in with a different method. Use that method instead.';
    return (error && error.message) || 'Something went wrong. Please try again.';
}
