const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let getStore;
try {
    ({ getStore } = require('@netlify/blobs'));
} catch (e) {
    getStore = null;
}

const STORE_NAME = 'fratello-hub-auth';
const USERS_KEY = 'users.json';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 48 * 60 * 60 * 1000;

const EMPLOYEE_RESOURCES = ['employee-resources'];

const PROFILES = {
    owner: {
        key: 'owner',
        label: 'Owner',
        sections: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'marketing', 'hr-people', ...EMPLOYEE_RESOURCES, 'time-off', 'owner-admin', 'settings'],
        areas: ['Finance', 'Roasting', 'Packaging', 'Warehouse', 'Sales', 'Marketing', 'HR & People', 'Resources', 'Time Off', 'Owner/Admin', 'Settings']
    },
    controller: {
        key: 'controller',
        label: 'Controller',
        sections: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'hr-people', ...EMPLOYEE_RESOURCES, 'time-off'],
        areas: ['Finance', 'Roasting', 'Packaging', 'Warehouse', 'Sales', 'HR & People', 'Resources', 'Time Off']
    },
    production: {
        key: 'production',
        label: 'Production',
        sections: ['production-roasting', 'production-packaging', 'production-warehouse', 'hr-people', ...EMPLOYEE_RESOURCES, 'time-off'],
        areas: ['Roasting', 'Packaging', 'Warehouse', 'HR & People', 'Resources', 'Time Off']
    },
    marketing: {
        key: 'marketing',
        label: 'Marketing',
        sections: ['marketing', 'hr-people', ...EMPLOYEE_RESOURCES, 'time-off'],
        areas: ['Marketing', 'HR & People', 'Resources', 'Time Off']
    },
    sales: {
        key: 'sales',
        label: 'Sales',
        sections: ['sales', 'marketing', ...EMPLOYEE_RESOURCES, 'time-off'],
        areas: ['Sales', 'Marketing', 'Resources', 'Time Off']
    },
    staff: {
        key: 'staff',
        label: 'Staff',
        sections: [...EMPLOYEE_RESOURCES, 'time-off'],
        areas: ['Resources', 'Time Off']
    }
};

const DEFAULT_USERS = [
    { id: 'chris-prefontaine', name: 'Chris Prefontaine', email: 'prefontainech@gmail.com', title: 'CEO', profile: 'owner', status: 'invited' },
    { id: 'russ-prefontaine', name: 'Russ Prefontaine', email: 'russ@fratellocoffee.com', title: 'President', profile: 'owner', status: 'invited' },
    { id: 'chris-mcghee', name: 'Chris McGhee', email: 'chris.mcghee@fratellocoffee.com', title: 'Controller', profile: 'controller', status: 'invited' },
    { id: 'kyle-park', name: 'Kyle Park', email: 'kyle.park@fratellocoffee.com', title: 'Production & Operations Manager', profile: 'production', status: 'invited' },
    { id: 'mateo-corredor', name: 'Mateo Corredor', email: 'mateo.corredor@fratellocoffee.com', title: 'Marketing & Brand Manager', profile: 'marketing', status: 'invited' }
];

function nowIso() {
    return new Date().toISOString();
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function makeId(value) {
    const base = String(value || crypto.randomBytes(8).toString('hex'))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return base || crypto.randomBytes(8).toString('hex');
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(body)
    };
}

function parseBody(event) {
    try {
        return JSON.parse(event.body || '{}');
    } catch (e) {
        return {};
    }
}

// The signing secret must come from configuration. There is deliberately no
// hardcoded fallback: a guessable default would let anyone forge a valid
// session token. If nothing is configured, getSecret() returns '' and
// sign()/verifySessionToken() below fail closed (no token can be minted or
// verified) rather than trusting a well-known string.
function getSecret() {
    return process.env.AUTH_SESSION_SECRET || process.env.AUTH_OWNER || process.env.SITE_ID || '';
}

function base64url(input) {
    return Buffer.from(input).toString('base64url');
}

function sign(data) {
    return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function createSession(user) {
    const profile = PROFILES[user.profile] || PROFILES.staff;
    const payload = {
        sub: user.id,
        email: user.email,
        profile: profile.key,
        exp: Date.now() + SESSION_TTL_MS
    };
    const encoded = base64url(JSON.stringify(payload));
    return `${encoded}.${sign(encoded)}`;
}

function verifySessionToken(token) {
    // Fail closed when no signing secret is configured: with no secret we cannot
    // distinguish a genuine token from a forged one, so trust nothing.
    if (!getSecret()) return null;
    if (!token || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    const expected = sign(encoded);
    if (!signature || signature.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
}

function getBearer(event) {
    const header = event.headers.authorization || event.headers.Authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, user) {
    if (!user.passwordHash || !user.passwordSalt) return false;
    const { hash } = hashPassword(password, user.passwordSalt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function isExpired(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) && time < Date.now();
}

function timestamp(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
}

function inviteStatus(user) {
    if (user.inviteExpiresAt) return isExpired(user.inviteExpiresAt) ? 'expired' : 'pending';
    if (user.acceptedAt || user.status === 'active') return user.invitedAt ? 'accepted' : 'none';
    if (user.status === 'invited') return 'pending';
    return user.invitedAt ? 'sent' : 'none';
}

function resetStatus(user) {
    if (user.resetExpiresAt) return isExpired(user.resetExpiresAt) ? 'expired' : 'pending';
    if (!user.resetCreatedAt) return 'none';
    const resetCreatedTime = timestamp(user.resetCreatedAt);
    if (resetCreatedTime && timestamp(user.passwordChangedAt) >= resetCreatedTime) return 'completed';
    return 'created';
}

function roleFromUser(user) {
    const profile = PROFILES[user.profile] || PROFILES.staff;
    return {
        key: profile.key,
        label: profile.label,
        sections: profile.sections,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            title: user.title || '',
            status: user.status
        }
    };
}

function publicUser(user) {
    const profile = PROFILES[user.profile] || PROFILES.staff;
    const lastLoginAt = user.lastLoginAt || '';
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title || '',
        profile: profile.key,
        profileLabel: profile.label,
        areas: profile.areas,
        status: user.status,
        createdAt: user.createdAt || '',
        updatedAt: user.updatedAt || '',
        invitedAt: user.invitedAt || '',
        acceptedAt: user.acceptedAt || '',
        resetCreatedAt: user.resetCreatedAt || '',
        passwordChangedAt: user.passwordChangedAt || '',
        disabledAt: user.disabledAt || '',
        lastLoginAt,
        lastLoginStatus: lastLoginAt ? 'logged-in' : 'never-logged-in',
        inviteStatus: inviteStatus(user),
        resetStatus: resetStatus(user),
        inviteExpiresAt: user.inviteExpiresAt || '',
        resetExpiresAt: user.resetExpiresAt || ''
    };
}

function localStorePath() {
    return path.join('/tmp', 'fratello-hub-users.json');
}

async function readUsers() {
    if (getStore) {
        try {
            const store = getStore(STORE_NAME);
            const entry = await store.get(USERS_KEY, { type: 'json', consistency: 'strong' });
            if (entry && Array.isArray(entry.users)) return entry.users;
        } catch (error) {
            console.error('Netlify Blobs read failed; using fallback store', error);
        }
    }

    if (fs.existsSync(localStorePath())) {
        return JSON.parse(fs.readFileSync(localStorePath(), 'utf8')).users || [];
    }

    const stamp = nowIso();
    return DEFAULT_USERS.map(user => ({
        ...user,
        createdAt: stamp,
        updatedAt: stamp,
        invitedAt: stamp
    }));
}

async function writeUsers(users) {
    const value = { users, updatedAt: nowIso() };
    if (getStore) {
        try {
            const store = getStore(STORE_NAME);
            await store.setJSON(USERS_KEY, value);
            return;
        } catch (error) {
            console.error('Netlify Blobs write failed; using fallback store', error);
        }
    }
    fs.writeFileSync(localStorePath(), JSON.stringify(value, null, 2));
}

async function findUserBySession(event) {
    const payload = verifySessionToken(getBearer(event));
    if (!payload) return null;

    const users = await readUsers();
    const user = users.find(item => item.id === payload.sub && item.email === payload.email);
    if (!user || user.status !== 'active') return null;
    return { user, users };
}

async function requireOwner(event) {
    const session = await findUserBySession(event);
    if (session && session.user.profile === 'owner') return session;

    const legacyRole = await legacyCodeRole(parseBody(event).code);
    if (legacyRole && legacyRole.key === 'owner') {
        return { user: { id: 'legacy-owner', email: '', name: 'Owner', profile: 'owner', status: 'active' }, users: await readUsers() };
    }

    return null;
}

// DISABLED: the shared "access code" login is a security backdoor — a single
// shared password (AUTH_OWNER / AUTH_CONTROLLER / …) granted a role to anyone
// who knew it, with no per-person identity. The Hub now authenticates every
// person individually through Firebase (see system/fratello-auth.js), so this
// path is permanently turned off. It is kept as a no-op (returning null) only so
// the callers that still reference it degrade cleanly to "access denied" instead
// of crashing. To re-enable real code login you would have to replace this with
// per-user credentials, not a shared secret.
async function legacyCodeRole(_code) {
    return null;
}

function buildInviteUrl(event, token) {
    const origin = event.headers.origin || process.env.URL || 'https://fratello-hub.netlify.app';
    return `${origin.replace(/\/$/, '')}/system/accept-invite.html?token=${encodeURIComponent(token)}`;
}

module.exports = {
    PROFILES,
    RESET_TTL_MS,
    INVITE_TTL_MS,
    buildInviteUrl,
    createSession,
    findUserBySession,
    hashPassword,
    hashToken,
    json,
    legacyCodeRole,
    makeId,
    normalizeEmail,
    nowIso,
    parseBody,
    publicUser,
    randomToken,
    readUsers,
    requireOwner,
    roleFromUser,
    verifyPassword,
    writeUsers
};
