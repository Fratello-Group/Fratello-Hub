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
        sections: ['finance', 'production', 'sales', 'marketing', 'hr-people', ...EMPLOYEE_RESOURCES, 'owner-admin'],
        areas: ['Finance', 'Production', 'Sales', 'Marketing', 'HR & People', 'Shared Docs & Forms', 'Owner/Admin']
    },
    controller: {
        key: 'controller',
        label: 'Controller',
        sections: ['finance', 'production', 'sales', 'hr-people', ...EMPLOYEE_RESOURCES],
        areas: ['Finance', 'Production', 'Sales', 'HR & People', 'Shared Docs & Forms']
    },
    production: {
        key: 'production',
        label: 'Production',
        sections: ['production', 'hr-people', ...EMPLOYEE_RESOURCES],
        areas: ['Production', 'HR & People', 'Shared Docs & Forms']
    },
    marketing: {
        key: 'marketing',
        label: 'Marketing',
        sections: ['marketing', 'hr-people', ...EMPLOYEE_RESOURCES],
        areas: ['Marketing', 'HR & People', 'Shared Docs & Forms']
    },
    sales: {
        key: 'sales',
        label: 'Sales',
        sections: ['sales', 'marketing', ...EMPLOYEE_RESOURCES],
        areas: ['Sales', 'Marketing', 'Shared Docs & Forms']
    },
    staff: {
        key: 'staff',
        label: 'Staff',
        sections: EMPLOYEE_RESOURCES,
        areas: ['Shared Docs & Forms']
    }
};

const DEFAULT_USERS = [
    { id: 'chris-prefontaine', name: 'Chris Prefontaine', email: 'chris@fratellocoffee.com', title: 'CEO', profile: 'owner', status: 'invited' },
    { id: 'russ-prefontaine', name: 'Russ Prefontaine', email: 'russ@fratellocoffee.com', title: 'President', profile: 'owner', status: 'invited' },
    { id: 'chris-mcghee', name: 'Chris McGhee', email: 'controller@fratellocoffee.com', title: 'Controller', profile: 'controller', status: 'invited' },
    { id: 'kyle-park', name: 'Kyle Park', email: 'kyle@fratellocoffee.com', title: 'Production & Operations Manager', profile: 'production', status: 'invited' },
    { id: 'mateo-corredor', name: 'Mateo Corredor', email: 'mateo@fratellocoffee.com', title: 'Marketing & Brand Manager', profile: 'marketing', status: 'invited' }
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

function getSecret() {
    return process.env.AUTH_SESSION_SECRET || process.env.AUTH_OWNER || process.env.SITE_ID || 'fratello-dev-session-secret';
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
        lastLoginAt: user.lastLoginAt || '',
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
        updatedAt: stamp
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

    if (payload.sub === 'temporary-owner' && payload.profile === 'owner') {
        return {
            user: {
                id: 'temporary-owner',
                email: '',
                name: 'Temporary Owner Setup',
                title: 'Owner setup access',
                profile: 'owner',
                status: 'active'
            },
            users: await readUsers()
        };
    }

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

async function legacyCodeRole(code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!normalized) return null;

    const roles = [
        { password: process.env.AUTH_OWNER, profile: 'owner' },
        { password: process.env.AUTH_CONTROLLER, profile: 'controller' },
        { password: process.env.AUTH_MARKETING, profile: 'marketing' },
        { password: process.env.AUTH_PRODUCTION, profile: 'production' },
        { password: process.env.AUTH_SALES, profile: 'sales' },
        { password: process.env.AUTH_STAFF, profile: 'staff' }
    ];

    const match = roles.find(item => item.password && item.password.toLowerCase() === normalized);
    if (!match) return null;

    const profile = PROFILES[match.profile];
    return {
        key: profile.key,
        label: profile.label,
        sections: profile.sections
    };
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
