import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    OAuthProvider,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
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
    return String(email || '').trim().toLowerCase();
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
    if (profileKey === 'owner') return 'Management';
    if (profileKey === 'controller') return 'Admin';
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

async function upsertTimeOffUserFromAccess({ name, email, title, profile, status = 'active' }) {
    initFirebase();
    const normalized = normalizeEmail(email);
    const profileKey = PROFILE_DEFINITIONS[profile] ? profile : 'staff';
    if (!normalized) return;

    await setDoc(doc(db, 'users', normalized), {
        email: normalized,
        name: String(name || '').trim() || displayNameFromEmail(normalized),
        department: timeOffDepartment(profileKey),
        title: String(title || '').trim(),
        role_tier: timeOffRoleTier(profileKey),
        manager_id: defaultManagerId(profileKey),
        backup_approver_id: null,
        active: status !== 'disabled',
        updated_at: serverTimestamp()
    }, { merge: true });
}

function roleFromProfile(id, data) {
    const profileKey = data.profile || 'staff';
    const profile = PROFILE_DEFINITIONS[profileKey] || PROFILE_DEFINITIONS.staff;
    return {
        key: profile.key,
        label: profile.label,
        sections: profile.sections,
        user: {
            id,
            name: data.name || displayNameFromEmail(data.email),
            email: data.email,
            title: data.title || '',
            status: data.status || 'active'
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
        status: data.status || 'active',
        lastLoginAt: data.lastLoginAt || '',
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

export async function signInWithGoogle() {
    initFirebase();
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    return profileForUser(credential.user);
}

export async function signInWithApple() {
    initFirebase();
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const credential = await signInWithPopup(auth, provider);
    return profileForUser(credential.user);
}

export async function sendResetEmail(email) {
    initFirebase();
    await sendPasswordResetEmail(auth, email);
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
    const profiles = new Map();
    const profileSnap = await getDocs(collection(db, 'hubProfiles'));
    profileSnap.forEach(item => {
        profiles.set(normalizeEmail(item.data().email), publicUserFromProfile(item.id, { ...item.data(), uid: item.id }));
    });

    const inviteSnap = await getDocs(collection(db, 'hubInvites'));
    inviteSnap.forEach(item => {
        const invite = item.data();
        const email = normalizeEmail(invite.email || item.id);
        if (!profiles.has(email)) {
            profiles.set(email, publicUserFromProfile(item.id, { ...invite, email, status: invite.status || 'invited' }));
        }
    });

    return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveHubInvite({ name, email, title, profile }) {
    initFirebase();
    const normalized = normalizeEmail(email);
    const profileKey = PROFILE_DEFINITIONS[profile] ? profile : 'staff';
    const payload = {
        name: String(name || '').trim(),
        email: normalized,
        title: String(title || '').trim(),
        profile: profileKey,
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
        await updateDoc(doc(db, 'hubProfiles', person.uid), {
            profile: profileKey,
            updatedAt: serverTimestamp()
        });
    }
    await setDoc(doc(db, 'hubInvites', normalizeEmail(person.email)), {
        name: person.name,
        email: normalizeEmail(person.email),
        title: person.title || '',
        profile: profileKey,
        status: person.status === 'disabled' ? 'disabled' : 'invited',
        updatedAt: serverTimestamp()
    }, { merge: true });

    await upsertTimeOffUserFromAccess({
        name: person.name,
        email: person.email,
        title: person.title || '',
        profile: profileKey,
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
        status: disabled ? 'disabled' : 'active'
    });
}

export function friendlyAuthError(error) {
    const code = error && error.code;
    if (code === 'auth/popup-closed-by-user') return 'The sign-in window was closed before login finished.';
    if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow popups and try again.';
    if (code === 'auth/invalid-email') return 'That email address does not look right.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return 'Email or password is incorrect. Use Forgot password if needed.';
    }
    if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
    if (code === 'auth/weak-password') return 'Use a password with at least 6 characters.';
    if (code === 'auth/unauthorized-domain') return 'This domain has not been added to Firebase authorized domains yet.';
    return (error && error.message) || 'Something went wrong. Please try again.';
}
