import {
    createEmailAccount,
    firebaseConfigured,
    friendlyAuthError,
    onHubAuthChange,
    sendResetEmail,
    signInWithApple,
    signInWithEmail,
    signInWithGoogle,
    signInWithMicrosoft,
    signOutHub
} from './fratello-auth.js';
import { logActivity, trackLogout } from './api/activity-logger.js';

const PROVIDER_LABELS = { google: 'Google', microsoft: 'Microsoft', apple: 'Apple' };

function recordLogin(role, method) {
    try {
        const user = (role && role.user) || {};
        logActivity('login', {
            toolName: 'Hub sign-in',
            userId: user.email || user.id || '',
            details: { name: user.name || '', email: user.email || '', method: method || user.provider || '' }
        });
    } catch (error) {
        // Logging is best-effort; never block sign-in.
    }
}

// ════════════════════════════════════════════════
// ROLE CONFIGURATION
// ════════════════════════════════════════════════
//
// Firebase Authentication is the professional login path. The older
// Netlify code-login path remains only as a fallback until Firebase
// project settings are pasted into system/firebase-config.js.
//

// ════════════════════════════════════════════════
// SECTION & CARD DEFINITIONS
// ════════════════════════════════════════════════

const SECTIONS = {

    // ── Department Tools ──

    finance: {
        group: 'Departments',
        label: 'Finance',
        menuParent: '',
        cards: [
            { title: 'Financial Dashboards', href: '#', badge: 'Coming Soon' },
            { title: 'Costing & Margins', href: '#', badge: 'Coming Soon' },
            { title: 'D2C Scenario Model', href: '#', badge: 'Coming Soon' }
        ]
    },

    'production-roasting': {
        group: 'Departments',
        label: 'Roasting',
        menuParent: 'Production',
        cards: [
            { title: 'Food Safety — Roasting', href: 'cfia/department.html?dept=roasting', badge: 'Live', quick: true },
            { title: 'Roast Schedule', href: '#', badge: 'Coming Soon' },
            { title: 'Batch Records', href: '#', badge: 'Coming Soon' },
            { title: 'Roast Profiles', href: '#', badge: 'Coming Soon' },
            { title: 'Quality Notes', href: '#', badge: 'Coming Soon' }
        ]
    },

    'production-packaging': {
        group: 'Departments',
        label: 'Packaging',
        menuParent: 'Production',
        cards: [
            { title: 'Food Safety — Packaging', href: 'cfia/department.html?dept=packaging', badge: 'Live', quick: true },
            { title: 'Packaging Schedule', href: '#', badge: 'Coming Soon' },
            { title: 'Build Assemblies', href: '#', badge: 'Coming Soon' },
            { title: 'Label & Material Checks', href: '#', badge: 'Coming Soon' }
        ]
    },

    'production-warehouse': {
        group: 'Departments',
        label: 'Warehouse',
        menuParent: 'Production',
        cards: [
            { title: 'Food Safety — Warehouse', href: 'cfia/department.html?dept=warehouse', badge: 'Live', quick: true },
            { title: 'Order Fulfillment', href: '#', badge: 'Coming Soon' },
            { title: 'Inventory Support', href: '#', badge: 'Coming Soon' },
            { title: 'Delivery Planning', href: '#', badge: 'Coming Soon' }
        ]
    },

    sales: {
        group: 'Departments',
        label: 'Sales',
        menuParent: '',
        cards: [
            { title: 'Wholesale Proposal Builder', href: 'sales/proposal-builder.html', badge: 'Live', quick: true },
            { title: 'Sales Intelligence', href: '#', badge: 'Coming Soon' },
            { title: 'Sales Forecasting', href: '#', badge: 'Coming Soon' }
        ]
    },

    marketing: {
        group: 'Departments',
        label: 'Marketing',
        menuParent: '',
        cards: [
            { title: 'Marketing Dashboard', href: 'marketing/dashboard.html', badge: 'Live', roles: ['owner', 'controller', 'marketing'], quick: true },
            { title: 'Avatar Builder', href: 'marketing/tools/avatar-builder.html', badge: 'Live', roles: ['owner', 'controller', 'marketing', 'sales'], quick: true },
            { title: 'Fratello Design Skill', href: 'system/skills/fratello-design-skill.html', badge: 'Brand', roles: ['owner', 'controller', 'production', 'marketing', 'sales'], quick: true },
            { title: 'Brand & Creative', href: '#', badge: 'Coming Soon' },
            { title: 'Product Catalogs', href: '#', badge: 'Coming Soon' },
            { title: 'Campaign Planning', href: '#', badge: 'Coming Soon' },
            { title: 'D2C Marketing Tools', href: '#', badge: 'Coming Soon' }
        ]
    },

    // Food Safety opens its own full dashboard (cfia/index.html) — no redundant
    // in-Hub section page. directLink makes the Departments row navigate straight there.
    'food-safety': {
        group: 'Departments',
        label: 'Food Safety',
        menuParent: '',
        directLink: 'cfia/index.html',
        cards: []
    },

    'employee-resources': {
        group: 'Resources',
        label: 'Resources',
        cards: [
            { title: 'Expense Reimbursement', href: 'operations/forms/expense-report.html', badge: 'Live', quick: true },
            { title: 'Staff Forms', href: '#', badge: 'Coming Soon' },
            { title: 'Employee Handbook', href: '#', badge: 'Coming Soon' },
            { title: 'HR Forms', href: '#', badge: 'Coming Soon' }
        ]
    },

    'time-off': {
        group: 'Time Off',
        label: 'Time Off',
        cards: [
            { title: 'Submit Vacation Request', href: 'hr/time-off/vacation-tracker.html?view=submit', badge: 'Time Off', quick: true },
            { title: 'Log Sick Day', href: 'hr/time-off/sick-day-logger.html', badge: 'Time Off', quick: true },
            { title: 'My Time Off', href: 'hr/time-off/vacation-tracker.html?view=my-requests', badge: 'Time Off', quick: true },
            { title: 'Calendar Subscriptions', href: 'hr/time-off/calendar-subscribe.html', badge: 'Calendar' },
            { title: 'Approvals Queue', href: 'hr/time-off/vacation-tracker.html?view=approvals', badge: 'Manager', roles: ['owner', 'controller', 'production', 'marketing', 'sales'], attention: true },
            { title: 'Team Calendar', href: 'hr/time-off/vacation-tracker.html?view=calendar', badge: 'Manager', roles: ['owner', 'controller', 'production', 'marketing', 'sales'] }
        ]
    },

    // ── HR & People (Hiring access excludes Sales) ──

    'hr-people': {
        group: 'Departments',
        label: 'HR & People',
        menuParent: '',
        cards: [
            {
                title: 'Hiring Document Generator',
                href: 'hr/hiring/hiring-document-generator.html',
                roles: ['owner', 'controller', 'production', 'marketing', 'sales'],
                managerOnly: true,
                badge: 'Live',
                quick: true
            },
            { title: 'Performance Reviews', href: '#', badge: 'Coming Soon', roles: ['owner', 'controller'] },
            { title: 'Wages & Compensation', href: '#', badge: 'Coming Soon', roles: ['owner', 'controller'] },
            { title: 'Employee Records', href: '#', badge: 'Coming Soon', roles: ['owner', 'controller'] }
        ]
    },

    // ── Owner/Admin Dashboard (Owner only) ──

    'owner-admin': {
        group: 'Owner/Admin',
        label: 'Owner/Admin Dashboard',
        cards: [
            { title: 'Vacation Approvals', href: 'hr/time-off/vacation-tracker.html?view=approvals', badge: 'Needs Attention', attention: true },
            { title: 'Sick Day Report', href: 'hr/time-off/sick-day-report.html', badge: 'Private', attention: true },
            { title: 'Team Calendar', href: 'hr/time-off/vacation-tracker.html?view=calendar', badge: 'Coverage' },
            { title: 'Hiring Documents', href: 'hr/hiring/hiring-document-generator.html', badge: 'People' },
            { title: 'Owner Notifications', href: '#', badge: 'Coming Soon', attention: true },
            { title: 'Expense Review', href: '#', badge: 'Coming Soon', attention: true }
        ]
    },

    settings: {
        group: 'Settings',
        label: 'Settings',
        cards: [
            { title: 'Manage People', href: 'system/permissions.html', badge: 'Owner' },
            { title: 'Hub Activity', href: 'system/admin/activity-log.html', badge: 'Owner' },
            { title: 'Email Notifications', href: '#', badge: 'Coming Soon' },
            { title: 'System Status', href: '#', badge: 'Coming Soon' }
        ]
    }
};

const ROLE_SECTION_MAP = {
    owner: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'marketing', 'food-safety', 'hr-people', 'employee-resources', 'time-off', 'owner-admin', 'settings'],
    controller: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    marketing: ['marketing', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    production: ['production-roasting', 'production-packaging', 'production-warehouse', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    sales: ['sales', 'marketing', 'food-safety', 'employee-resources', 'time-off'],
    staff: ['food-safety', 'employee-resources', 'time-off']
};

const FALLBACK_HUB_DATA = {
    attention: [],
    notes: [],
    quickActions: [
        { id: 'qa_vacation', label: 'Submit vacation', icon: 'plane', href: '/hr/time-off/vacation-tracker.html?view=submit', group: 'submit', tiers: ['staff', 'manager', 'owner'], order: { staff: 1, manager: 1, owner: 1 } },
        { id: 'qa_sick', label: 'Log a sick day', icon: 'thermometer', href: '/hr/time-off/sick-day-logger.html', group: 'submit', tiers: ['staff', 'manager', 'owner'], order: { staff: 2, manager: 2, owner: 2 } },
        { id: 'qa_expense', label: 'Submit an expense', icon: 'dollar', href: '/operations/forms/expense-report.html', group: 'submit', tiers: ['staff', 'manager', 'owner'], order: { staff: 3, manager: 3, owner: 3 } },
        { id: 'qa_calendar', label: 'Calendar', icon: 'calendar', href: '/hr/time-off/vacation-tracker.html?view=my-requests', group: 'review', tiers: ['staff', 'manager', 'owner'], order: { staff: 1, manager: 2, owner: 2 } },
        { id: 'qa_approvals', label: 'Approvals queue', icon: 'check-square', href: '/hr/time-off/vacation-tracker.html?view=approvals', group: 'review', tiers: ['manager', 'owner'], order: { manager: 1, owner: 1 } }
    ],
    users: {
        roleDefaults: {
            owner: { name: 'Chris Prefontaine', firstName: 'Chris', initials: 'CP', email: 'prefontainech@gmail.com' },
            controller: { name: 'Chris McGhee', firstName: 'Chris', initials: 'CM', email: 'chris.mcghee@fratellocoffee.com' },
            marketing: { name: 'Mateo Corredor', firstName: 'Mateo', initials: 'MC', email: 'mateo.corredor@fratellocoffee.com' },
            production: { name: 'Kyle Park', firstName: 'Kyle', initials: 'KP', email: 'kyle.park@fratellocoffee.com' },
            sales: { name: 'Joel May', firstName: 'Joel', initials: 'JM', email: 'joel.may@fratellocoffee.com' },
            staff: { name: 'Team Member', firstName: 'Team', initials: 'TM', email: null }
        }
    }
};

let hubData = FALLBACK_HUB_DATA;
let hubDataPromise = null;

function normalizeRole(role) {
    if (!role || !role.label) return role;

    const key = role.key || role.label.toLowerCase();
    const sections = ROLE_SECTION_MAP[key];
    if (!sections) return role;

    return {
        ...role,
        key,
        sections
    };
}

async function fetchJson(path, fallback) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Could not load ${path}`);
        return await response.json();
    } catch (error) {
        return fallback;
    }
}

function loadHubData() {
    if (!hubDataPromise) {
        hubDataPromise = Promise.all([
            fetchJson('/data/attention.json', FALLBACK_HUB_DATA.attention),
            fetchJson('/data/notes.json', FALLBACK_HUB_DATA.notes),
            fetchJson('/data/quick-actions.json', FALLBACK_HUB_DATA.quickActions),
            fetchJson('/data/users.json', FALLBACK_HUB_DATA.users)
        ]).then(([attention, notes, quickActions, users]) => {
            hubData = { attention, notes, quickActions, users };
            return hubData;
        });
    }

    return hubDataPromise;
}

function tierOf(role) {
    const key = role?.key || role;
    if (key === 'owner' || key === 'controller') return 'owner';
    if (['marketing', 'production', 'sales'].includes(key)) return 'manager';
    return 'staff';
}

function personForRole(role) {
    const fallback = hubData.users?.roleDefaults?.[role.key] || FALLBACK_HUB_DATA.users.roleDefaults.staff;
    const user = role.user || {};
    const name = user.name || fallback.name;
    const firstName = user.firstName || fallback.firstName || String(name).split(' ')[0] || 'Team';
    const initials = user.initials || fallback.initials || String(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('');

    return {
        name,
        firstName,
        initials: initials || 'TM',
        email: user.email || fallback.email || ''
    };
}

function storeRoleSession(role, person) {
    // TODO: session expiry
    localStorage.setItem('fratello_session', JSON.stringify({
        role: role.key,
        name: person.name,
        firstName: person.firstName,
        initials: person.initials,
        signedInAt: new Date().toISOString()
    }));
}

// ════════════════════════════════════════════════
// LOGIN LOGIC
// ════════════════════════════════════════════════

const USE_FIREBASE_AUTH = firebaseConfigured();

function finishAuthCheck() {
    document.body.classList.remove('auth-checking');
}

function cachedHubRole() {
    try {
        return JSON.parse(localStorage.getItem('fratello-role') || 'null');
    } catch (error) {
        return null;
    }
}

function setLoginError(message) {
    const error = document.getElementById('loginError');
    error.textContent = message;
    error.classList.add('visible');
    setTimeout(() => {
        error.classList.remove('visible');
    }, 4200);
}

function setupAuthModeUi() {
    if (!USE_FIREBASE_AUTH) return;

    const providers = window.FRATELLO_AUTH_PROVIDERS || {};
    document.getElementById('providerGrid').classList.add('visible');
    document.getElementById('loginDivider').classList.add('visible');
    document.getElementById('googleProviderBtn').style.display = providers.google === false ? 'none' : '';
    document.getElementById('microsoftProviderBtn').style.display = providers.microsoft === true ? '' : 'none';
    document.getElementById('appleProviderBtn').style.display = providers.apple === true ? '' : 'none';
    const allowPublicSignup = window.FRATELLO_AUTH_ALLOW_PUBLIC_SIGNUP === true;
    if (allowPublicSignup) document.getElementById('createAccountToggle').classList.add('visible');
    document.getElementById('setupCodeToggle').classList.add('hidden');
    document.getElementById('loginBtn').textContent = 'Sign In';
    document.getElementById('loginHelper').textContent = 'Sign in with your Google account, or your Hub email and password. Tap the eye icon to check your password.';
    document.getElementById('resetCopy').textContent = 'Enter your email above and Firebase will email you a private password reset link.';
    document.getElementById('resetBtn').textContent = 'Email Reset Link';
}

function toggleSetupCode() {
    const wrap = document.getElementById('setupCodeWrap');
    wrap.classList.toggle('visible');
    if (wrap.classList.contains('visible')) {
        document.getElementById('accessCode').focus();
    }
}

function toggleResetPanel() {
    const panel = document.getElementById('resetPanel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) {
        document.getElementById('loginEmail').focus();
    }
}

async function handlePasswordReset() {
    const emailInput = document.getElementById('loginEmail');
    const email = emailInput.value.trim();
    const btn = document.getElementById('resetBtn');
    const message = document.getElementById('resetMessage');

    if (!email) {
        message.textContent = 'Enter your email first, then create a reset link.';
        emailInput.classList.add('error');
        setTimeout(() => emailInput.classList.remove('error'), 400);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';
    message.textContent = '';

    if (USE_FIREBASE_AUTH) {
        try {
            await sendResetEmail(email);
            message.textContent = 'Password reset email sent. Check your inbox and spam folder.';
        } catch (error) {
            message.textContent = friendlyAuthError(error);
        }

        btn.disabled = false;
        btn.textContent = 'Email Reset Link';
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'password:forgot', email })
        });
        const data = await response.json();

        if (response.ok && data.resetUrl) {
            message.innerHTML = `Reset link created: <a href="${data.resetUrl}">open reset page</a>`;
        } else if (response.ok) {
            message.textContent = data.message || 'If this email has Hub access, a reset link can be created.';
        } else {
            message.textContent = data.error || 'Could not create a reset link.';
        }
    } catch (error) {
        message.textContent = 'Connection error - try again.';
    }

    btn.disabled = false;
    btn.textContent = 'Create Reset Link';
}

async function handleProviderLogin(provider) {
    if (!USE_FIREBASE_AUTH) return;

    try {
        const role = provider === 'apple'
            ? await signInWithApple()
            : provider === 'microsoft'
                ? await signInWithMicrosoft()
                : await signInWithGoogle();
        localStorage.setItem('fratello-role', JSON.stringify(role));
        localStorage.removeItem('fratello-session');
        showDashboard(role);
        recordLogin(role, PROVIDER_LABELS[provider] || 'Google');
    } catch (error) {
        setLoginError(friendlyAuthError(error));
    }
}

async function handleCreateAccount() {
    if (!USE_FIREBASE_AUTH) return;
    if (window.FRATELLO_AUTH_ALLOW_PUBLIC_SIGNUP !== true) {
        setLoginError('Ask an Owner to add your Hub account first.');
        return;
    }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        setLoginError('Enter your email and a password, then create the account.');
        return;
    }

    try {
        const role = await createEmailAccount(email, password);
        localStorage.setItem('fratello-role', JSON.stringify(role));
        localStorage.removeItem('fratello-session');
        showDashboard(role);
        recordLogin(role, 'Email & password');
    } catch (error) {
        setLoginError(friendlyAuthError(error));
    }
}

// Force the password field back to hidden + reset the toggle (used on logout).
function setPasswordHidden() {
    const input = document.getElementById('loginPassword');
    const btn = document.getElementById('pwToggle');
    const eye = document.getElementById('pwEye');
    if (input) input.type = 'password';
    if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Show password');
    }
    if (eye) eye.innerHTML = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
}

// Show / hide the typed password so a user can check for typos.
function togglePasswordVisibility() {
    const input = document.getElementById('loginPassword');
    const btn = document.getElementById('pwToggle');
    const eye = document.getElementById('pwEye');
    if (!input || !eye) return;
    if (input.type !== 'password') { setPasswordHidden(); return; }
    input.type = 'text';
    if (btn) {
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', 'Hide password');
    }
    eye.innerHTML = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a16.3 16.3 0 0 1-3.4 4M6.6 6.6A16.4 16.4 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 3.2-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
}

// ── Brute-force protection: lock an email's sign-in after repeated failures ──
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 30 * 60 * 1000; // 30 minutes
const LOGIN_ATTEMPTS_KEY = 'fratello-login-attempts';
let loginLockTimer = null;

function readLoginAttempts() {
    try { return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}'); }
    catch (e) { return {}; }
}
function writeLoginAttempts(map) {
    try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(map)); } catch (e) { /* storage best-effort */ }
}
function loginEmailKey(email) { return String(email || '').trim().toLowerCase(); }

function loginLockRemaining(email) {
    const rec = readLoginAttempts()[loginEmailKey(email)];
    return rec && rec.lockedUntil ? Math.max(0, rec.lockedUntil - Date.now()) : 0;
}
function noteLoginFailure(email) {
    const key = loginEmailKey(email);
    if (!key) return;
    const map = readLoginAttempts();
    const rec = map[key] || { count: 0, lockedUntil: 0 };
    rec.count = (rec.count || 0) + 1;
    if (rec.count >= LOGIN_MAX_ATTEMPTS) { rec.lockedUntil = Date.now() + LOGIN_LOCK_MS; rec.count = 0; }
    map[key] = rec;
    writeLoginAttempts(map);
}
function clearLoginFailures(email) {
    const key = loginEmailKey(email);
    const map = readLoginAttempts();
    if (map[key]) { delete map[key]; writeLoginAttempts(map); }
}
function loginAttemptsLeft(email) {
    const rec = readLoginAttempts()[loginEmailKey(email)];
    return LOGIN_MAX_ATTEMPTS - ((rec && rec.count) || 0);
}
function fmtLockClock(ms) {
    const total = Math.ceil(ms / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}
function clearLoginLockTimer() {
    if (loginLockTimer) { clearInterval(loginLockTimer); loginLockTimer = null; }
}

// Disable the button and show a live countdown until the lock expires.
function showLoginLock(email) {
    const btn = document.getElementById('loginBtn');
    const error = document.getElementById('loginError');
    clearLoginLockTimer();
    const tick = () => {
        const ms = loginLockRemaining(email);
        if (ms <= 0) {
            clearLoginLockTimer();
            btn.disabled = false;
            btn.textContent = USE_FIREBASE_AUTH ? 'Sign In' : 'Enter';
            error.classList.remove('visible');
            return;
        }
        btn.disabled = true;
        btn.textContent = `Locked ${fmtLockClock(ms)}`;
        error.textContent = `Too many failed attempts. Try again in ${fmtLockClock(ms)}.`;
        error.classList.add('visible');
    };
    tick();
    loginLockTimer = setInterval(tick, 1000);
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const code = document.getElementById('accessCode').value.trim();
    const btn = document.getElementById('loginBtn');

    if ((!email || !password) && !code) return;

    // Brute-force lock: if this email is cooling down, block before trying.
    if (email && loginLockRemaining(email) > 0) {
        showLoginLock(email);
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    if (USE_FIREBASE_AUTH && email && password) {
        try {
            const role = await signInWithEmail(email, password);
            clearLoginFailures(email);
            localStorage.setItem('fratello-role', JSON.stringify(role));
            localStorage.removeItem('fratello-session');
            showDashboard(role);
            recordLogin(role, 'Email & password');
        } catch (error) {
            const input = document.getElementById('loginEmail');
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 400);
            noteLoginFailure(email);
            if (loginLockRemaining(email) > 0) {
                showLoginLock(email);
                return;
            }
            const left = loginAttemptsLeft(email);
            const base = friendlyAuthError(error);
            setLoginError(left <= 2 ? `${base} ${left} attempt${left === 1 ? '' : 's'} left before a 30-minute lock.` : base);
        }

        btn.disabled = false;
        btn.textContent = 'Sign In';
        return;
    }

    try {
        const body = email && password
            ? { action: 'login', email, password }
            : { action: 'login', code };

        const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const data = await response.json();
            const role = normalizeRole(data.role);
            if (email) clearLoginFailures(email);
            if (data.sessionToken) localStorage.setItem('fratello-session', data.sessionToken);
            localStorage.setItem('fratello-role', JSON.stringify(role));
            showDashboard(role);
        } else {
            if (email) {
                noteLoginFailure(email);
                if (loginLockRemaining(email) > 0) {
                    showLoginLock(email);
                    return;
                }
            }
            const input = email ? document.getElementById('loginEmail') : document.getElementById('accessCode');
            const error = document.getElementById('loginError');
            const left = email ? loginAttemptsLeft(email) : 99;
            const baseMsg = email ? 'Invalid email or password. Use Forgot password if needed.' : 'Invalid login';
            error.textContent = (email && left <= 2) ? `${baseMsg} ${left} attempt${left === 1 ? '' : 's'} left before a 30-minute lock.` : baseMsg;
            input.classList.add('error');
            error.classList.add('visible');
            setTimeout(() => input.classList.remove('error'), 400);
            setTimeout(() => error.classList.remove('visible'), 2500);
        }
    } catch (e) {
        const error = document.getElementById('loginError');
        error.textContent = 'Connection error — try again';
        error.classList.add('visible');
        setTimeout(() => {
            error.textContent = 'Invalid login';
            error.classList.remove('visible');
        }, 3000);
    }

    btn.disabled = false;
    btn.textContent = 'Enter';
}

// ════════════════════════════════════════════════
// DASHBOARD RENDERING
// ════════════════════════════════════════════════

function formatDateEyebrow(now = new Date()) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${days[now.getDay()]} \u00B7 ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`.toUpperCase();
}

function formatHubTime(now = new Date()) {
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase() + ' \u00B7 CALGARY';
}

function greetingWord(now = new Date()) {
    const hour = now.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function isManagerRole(role) {
    return Boolean(role) && (role.key === 'owner' || role.key === 'controller' || String(role.roleTier || '').toLowerCase() === 'manager');
}

function cardIsVisible(card, role) {
    if (card.roles && !card.roles.includes(role.key)) return false;
    if (card.managerOnly && !isManagerRole(role)) return false;
    return true;
}

function isActiveCard(card) {
    return Boolean(card.href && card.href !== '#');
}

let activeRole = null;

function visibleSectionsForRole(role) {
    return role.sections
        .map(sectionKey => {
            const section = SECTIONS[sectionKey];
            if (!section) return null;
            const cards = section.cards.filter(card => cardIsVisible(card, role));
            return { key: sectionKey, ...section, cards };
        })
        .filter(section => section && (section.cards.length || section.directLink));
}

function visibleSection(role, sectionKey) {
    return visibleSectionsForRole(role).find(section => section.key === sectionKey);
}

function sectionIsVisible(role, sectionKey) {
    return Boolean(visibleSection(role, sectionKey));
}

function setActiveNav(view, sectionKey = '') {
    const section = sectionKey ? SECTIONS[sectionKey] : null;
    document.querySelectorAll('.hub-nav-btn').forEach(btn => {
        const isDirectView = btn.dataset.view && btn.dataset.view === view;
        const isDepartmentSection = btn.dataset.view === 'departments' && section && section.group === 'Departments';
        const isResourceSection = btn.dataset.view === 'resources' && section && ['Resources', 'Time Off'].includes(section.group);
        const isOwnerHubSection = btn.dataset.view === 'owner-hub' && section && section.group === 'Owner/Admin';
        const isSection = btn.dataset.section && btn.dataset.section === sectionKey;
        btn.classList.toggle('active', isDirectView || isDepartmentSection || isResourceSection || isOwnerHubSection || isSection);
    });
}

function closeNavMenus() {
    document.querySelectorAll('.hub-nav-item.open').forEach(item => item.classList.remove('open'));
}

function toggleHubNav() {
    const masthead = document.querySelector('.masthead');
    if (!masthead) return;
    const open = masthead.classList.toggle('nav-open');
    const btn = document.getElementById('hubHamburger');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) closeProfileMenu();
    else closeNavMenus();
}

function closeHubNav() {
    const masthead = document.querySelector('.masthead');
    if (masthead) masthead.classList.remove('nav-open');
    const btn = document.getElementById('hubHamburger');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function renderHub(role, view = 'dashboard', sectionKey = '', push = true) {
    activeRole = role;
    closeNavMenus();
    closeHubNav();
    setActiveNav(view, sectionKey);
    const hashTarget = sectionKey || view;
    const newHash = `#${hashTarget}`;
    // Each navigation is its own history entry, so the browser Back button
    // returns to the previous view (not a stale one). The first render replaces.
    if (location.hash !== newHash) {
        if (push) history.pushState({ view, sectionKey }, '', newHash);
        else history.replaceState({ view, sectionKey }, '', newHash);
    }

    if (view === 'departments') {
        renderDepartmentsIndex(role);
        return;
    }

    if (view === 'resources') {
        renderResourcesIndex(role);
        return;
    }

    if (sectionKey) {
        renderSectionPage(role, sectionKey);
        return;
    }

    renderDashboardHome(role);
}

// Back / Forward: re-render the view for the hash we landed on (no new entry).
if (!window.__fratelloHubPopBound) {
    window.addEventListener('popstate', () => {
        const dash = document.getElementById('dashboard');
        if (!activeRole || !dash || !dash.classList.contains('active')) return;
        const route = initialHubRoute(activeRole);
        renderHub(activeRole, route.view, route.sectionKey, false);
    });
    window.__fratelloHubPopBound = true;
}

function initialHubRoute(role) {
    const hash = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
    if (!hash || hash === 'dashboard') return { view: 'dashboard', sectionKey: '' };
    if (hash === 'departments') return { view: 'departments', sectionKey: '' };
    if (hash === 'resources') return { view: 'resources', sectionKey: '' };

    const sectionAliases = {
        'owner-hub': 'owner-admin'
    };
    const sectionKey = sectionAliases[hash] || hash;
    if (sectionIsVisible(role, sectionKey)) {
        return { view: 'section', sectionKey };
    }

    return { view: 'dashboard', sectionKey: '' };
}

function setupHubNav(role) {
    const departmentSections = visibleSectionsForRole(role).filter(section => section.group === 'Departments');
    const resourcesSections = ['time-off', 'employee-resources']
        .map(key => visibleSection(role, key))
        .filter(Boolean);
    const ownerSection = visibleSection(role, 'owner-admin');

    // Each menu button simply opens its own page — no dropdowns.
    function wireNav(selector, visible, handler) {
        const btn = document.querySelector(selector);
        if (!btn) return;
        btn.hidden = !visible;
        btn.onclick = handler;
    }

    wireNav('.hub-nav-btn[data-view="dashboard"]', true, () => renderHub(role, 'dashboard'));
    wireNav('.hub-nav-btn[data-view="departments"]', departmentSections.length > 0, () => renderHub(role, 'departments'));
    wireNav('.hub-nav-btn[data-view="resources"]', resourcesSections.length > 0, () => renderHub(role, 'resources'));
    wireNav('.hub-nav-btn[data-view="owner-hub"]', Boolean(ownerSection), () => renderHub(role, 'section', 'owner-admin'));

    document.querySelectorAll('.hub-nav-btn[data-section]').forEach(btn => {
        const key = btn.dataset.section;
        btn.hidden = !sectionIsVisible(role, key);
        btn.onclick = () => renderHub(role, 'section', key);
    });

    if (!window.__fratelloHubNavBound) {
        document.addEventListener('click', event => {
            if (!event.target.closest('.hub-nav') && !event.target.closest('.hub-hamburger')) closeHubNav();
        });
        window.__fratelloHubNavBound = true;
    }
}

function createSectionDropdownItem(section, subtitle) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hub-dropdown-item';
    item.dataset.section = section.key;
    item.innerHTML = `<span>${section.label}</span><span class="hub-dropdown-sub">${subtitle}</span>`;
    item.onclick = () => renderHub(activeRole, 'section', section.key);
    return item;
}

function createActionDropdownItem(card, subtitle) {
    const active = isActiveCard(card);
    const item = document.createElement('a');
    item.className = 'hub-dropdown-item';
    item.href = active ? card.href : '#';
    item.innerHTML = `<span>${card.title}</span><span class="hub-dropdown-sub">${card.badge || subtitle}</span>`;

    if (!active) {
        item.addEventListener('click', event => event.preventDefault());
        return item;
    }

    const isExternal = /^https?:\/\//.test(card.href);
    item.target = isExternal ? '_blank' : '_self';
    if (isExternal) item.rel = 'noopener noreferrer';
    item.addEventListener('click', () => {
        try {
            logActivity('tool_open', { toolName: card.title, details: { section: subtitle || '', href: card.href || '' }, keepalive: true });
        } catch (error) {
            // tool-open logging is best-effort
        }
    });
    return item;
}

function createToolLink(card, sectionLabel) {
    const active = isActiveCard(card);
    const link = document.createElement('a');
    link.className = 'tool ' + (active ? 'active' : 'inactive');
    link.href = card.href || '#';

    if (active) {
        const isExternal = /^https?:\/\//.test(card.href);
        link.target = isExternal ? '_blank' : '_self';
        if (isExternal) link.rel = 'noopener noreferrer';
        link.addEventListener('click', () => {
            try {
                logActivity('tool_open', { toolName: card.title, details: { section: sectionLabel || '', href: card.href || '' }, keepalive: true });
            } catch (error) {
                // tool-open logging is best-effort
            }
        });
    } else {
        link.addEventListener('click', event => event.preventDefault());
    }

    const copy = document.createElement('span');
    copy.className = 'tool-copy';

    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = card.title;
    copy.appendChild(name);

    if (card.desc) {
        const desc = document.createElement('span');
        desc.className = 'tool-desc';
        desc.textContent = card.desc;
        copy.appendChild(desc);
    }

    const status = document.createElement('span');
    status.className = 'tool-status';
    status.textContent = card.badge || (active ? sectionLabel : 'Planned');

    link.appendChild(copy);
    link.appendChild(status);
    return link;
}

function addGreeting(main, role, person, counts) {
    const now = new Date();
    const intro = greetingWord(now);
    const greetingBlock = document.createElement('div');
    greetingBlock.className = 'greeting-block fade-in';
    greetingBlock.innerHTML = `
        <div>
            <div class="dateline">${formatDateEyebrow(now)}</div>
            <h1 class="greeting">${intro}, <span class="greeting-name">${person.firstName}.</span></h1>
            <p class="greeting-note">${briefing(tierOf(role), counts)}</p>
        </div>
        <div class="time-label">${formatHubTime(now)}</div>
    `;
    main.appendChild(greetingBlock);
}

function cardsForDashboard(role, predicate) {
    const visibleSections = visibleSectionsForRole(role);
    const activeCards = [];
    visibleSections.forEach(section => {
        section.cards
            .filter(isActiveCard)
            .filter(predicate)
            .forEach(card => activeCards.push({ ...card, sectionLabel: section.label }));
    });
    return activeCards;
}

function visibleAttention(items, role) {
    return items.filter(item => {
        if (item.ownedBy) return item.ownedBy === role.key;
        return (item.visibleTo || []).includes(role.key);
    });
}

function visibleQuickActions(items, tier) {
    return items
        .filter(item => (item.tiers || []).includes(tier))
        .sort((a, b) => (a.order?.[tier] || 99) - (b.order?.[tier] || 99));
}

function visibleNotes(items) {
    return [...items]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
}

function relativeTime(iso, now = new Date()) {
    const then = new Date(iso);
    const diffMin = Math.max(0, Math.floor((now - then) / 60000));
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNoteDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function briefing(tier, counts) {
    const { attentionOpen, notesNew } = counts;

    if (tier === 'staff') {
        if (notesNew === 0) return 'Your quick actions are ready. No company notes have been posted yet.';
        if (notesNew === 1) return 'One company note is posted. Your quick actions are ready.';
        return `${notesNew} company notes are posted. Your quick actions are ready.`;
    }

    if (tier === 'manager') {
        const attention = attentionOpen === 0 ? 'No live alerts need your attention right now' : `${attentionOpen === 1 ? '1 item' : `${attentionOpen} items`} need your attention`;
        if (notesNew === 0) return `${attention}. No company notes have been posted yet.`;
        return `${attention}. ${notesNew} company note${notesNew === 1 ? '' : 's'} posted.`;
    }

    const attention = attentionOpen === 0 ? 'No live alerts need your attention right now' : `${attentionOpen === 1 ? '1 item' : `${attentionOpen} items`} need your attention`;
    const notes = notesNew === 0 ? 'No company notes have been posted yet' : `${notesNew} company note${notesNew === 1 ? '' : 's'} posted`;
    return `${attention}. ${notes}.`;
}

function iconSvg(key) {
    const icons = {
        'calendar-plus': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v15H3V6a2 2 0 0 1 2-2z"/><path d="M12 14v5M9.5 16.5h5"/></svg>',
        thermometer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 14.76V5a4 4 0 0 0-8 0v9.76A6 6 0 1 0 14 14.76z"/><path d="M10 17V8"/></svg>',
        receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z"/><path d="M8 7h8M8 12h8M8 16h5"/></svg>',
        clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
        'check-square': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="m8 12 3 3 6-7"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v15H3V6a2 2 0 0 1 2-2z"/></svg>',
        finance: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.3 9.4c.2-1 1.3-1.6 2.7-1.6s2.5.7 2.5 1.8c0 2.3-5 1.3-5 3.7 0 1.1 1.1 1.7 2.5 1.7s2.5-.6 2.7-1.6"/></svg>',
        roasting: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h13v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M17 12h2a2 2 0 0 1 0 5h-2"/><path d="M8 3c0 1.2-1 1.5-1 2.7S8 7.5 8 8.5M12 3c0 1.2-1 1.5-1 2.7s1 1.8 1 2.8"/></svg>',
        packaging: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
        warehouse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13"/><path d="M3 21h18M9 21v-6h6v6"/></svg>',
        sales: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 7-7"/><path d="M17 8h4v4"/></svg>',
        marketing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7"/></svg>',
        people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18.5 20a5 5 0 0 0-3-4.6"/></svg>',
        plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7H9l2-7H6l-2 2H2l2-4-2-4h2l2 2h5L9 3h3z"/></svg>',
        dollar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        document: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
        book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4a2 2 0 0 1 2-2h12v17H7a2 2 0 0 0-2 2z"/><path d="M5 19a2 2 0 0 1 2-2h12"/></svg>',
        feed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.6"/></svg>',
        shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 2.5v5.2c0 4.4-3 7.6-7 9.3-4-1.7-7-4.9-7-9.3V5.5z"/><path d="M9 12l2 2 4-4"/></svg>'
    };
    return icons[key] || icons.calendar;
}

function createQuickActionCard(action, index, accent) {
    const card = document.createElement('a');
    card.className = 'qa-card fade-in' + (accent === 'gold' ? ' qa-card--gold' : '');
    card.href = action.href;
    card.innerHTML = `
        <span class="qa-top">
            <span class="qa-chip">${iconSvg(action.icon)}</span>
            <span class="qa-serial">${String(index + 1).padStart(2, '0')}</span>
        </span>
        <span class="qa-label">
            <span>${action.label}</span>
            <span class="qa-arrow">→</span>
        </span>
    `;
    return card;
}

function createAttentionRow(item) {
    const row = document.createElement('a');
    row.className = 'attention-row';
    row.href = item.action?.href || '#';
    row.innerHTML = `
        <span class="attention-bar" aria-hidden="true"></span>
        <span class="attention-tag">${item.tag}</span>
        <span>
            <span class="attention-title">${item.title}</span>
            ${item.meta ? `<span class="attention-meta">${item.meta}</span>` : ''}
        </span>
        <span class="attention-time">${relativeTime(item.timestamp).toUpperCase()}</span>
        <span class="attention-action">${item.action?.label || 'OPEN'} →</span>
    `;
    return row;
}

function createCompanyNote(note) {
    const element = document.createElement(note.href ? 'a' : 'div');
    element.className = 'company-note';
    if (note.href) element.href = note.href;
    element.innerHTML = `
        <span>
            <span class="note-date">${formatNoteDate(note.date)}</span>
            ${note.isNew ? '<span class="new-pill">New</span>' : ''}
        </span>
        <span>
            <span class="company-note-title">${note.title}</span>
            <span class="company-note-dek">${note.dek}</span>
            <span class="company-note-author">${note.author}</span>
        </span>
        ${note.href ? '<span class="note-read">Read →</span>' : '<span></span>'}
    `;
    return element;
}

function createToolPanel(title, countLabel, cards, emptyText) {
    const panel = document.createElement('section');
    panel.className = 'panel accent fade-in';
    panel.innerHTML = `
        <div class="panel-title-row">
            <h2 class="panel-title">${title}</h2>
            <span class="panel-count">${countLabel}</span>
        </div>
    `;

    if (cards.length) {
        const list = document.createElement('div');
        list.className = 'tool-list';
        cards.forEach(card => list.appendChild(createToolLink(card, card.sectionLabel)));
        panel.appendChild(list);
    } else {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<span class="empty-title">${emptyText}</span>`;
        panel.appendChild(empty);
    }

    return panel;
}

function renderDashboardHome(role) {
    const main = document.getElementById('mainContent');
    main.innerHTML = '';

    const tier = tierOf(role);
    const person = personForRole(role);
    const attentionItems = visibleAttention(hubData.attention || [], role);
    const notes = visibleNotes(hubData.notes || []);
    const quickActions = visibleQuickActions(hubData.quickActions || [], tier);
    const newNotesCount = notes.filter(note => note.isNew).length;

    addGreeting(main, role, person, {
        attentionOpen: attentionItems.length,
        notesNew: newNotesCount
    });

    if (tier !== 'staff' && attentionItems.length) {
        const section = document.createElement('section');
        section.className = 'workbench-section fade-in';
        section.innerHTML = `
            <div class="workbench-head">
                <h2 class="workbench-title with-accent">Needs You</h2>
                <span class="workbench-meta">${attentionItems.length} open</span>
            </div>
        `;
        const card = document.createElement('div');
        card.className = 'attention-card';
        attentionItems.forEach(item => card.appendChild(createAttentionRow(item)));
        section.appendChild(card);
        main.appendChild(section);
    }

    const submitActions = quickActions.filter(action => (action.group || 'submit') === 'submit');
    const reviewActions = quickActions.filter(action => action.group === 'review');

    const buildQuickSection = (title, meta, actions, accent) => {
        if (!actions.length) return;
        const section = document.createElement('section');
        section.className = 'workbench-section fade-in';
        section.innerHTML = `
            <div class="workbench-head">
                <h2 class="workbench-title">${title}</h2>
                <span class="workbench-meta">${meta}</span>
            </div>
        `;
        const grid = document.createElement('div');
        grid.className = 'qa-grid';
        grid.style.setProperty('--qa-columns', String(Math.min(Math.max(actions.length, 1), 6)));
        actions.forEach((action, index) => grid.appendChild(createQuickActionCard(action, index, accent)));
        section.appendChild(grid);
        main.appendChild(section);
    };

    buildQuickSection('Submit', 'Everyone', submitActions, 'teal');
    buildQuickSection('Review', 'View what’s there', reviewActions, 'gold');

    const notesSection = document.createElement('section');
    notesSection.className = 'workbench-section fade-in';
    const notesMeta = newNotesCount ? `${newNotesCount} posted` : 'None posted';
    notesSection.innerHTML = `
        <div class="workbench-head">
            <h2 class="workbench-title">Company Notes</h2>
            <span class="workbench-meta">${notesMeta}</span>
        </div>
    `;

    if (notes.length) {
        const list = document.createElement('div');
        list.className = 'notes-list';
        notes.forEach(note => list.appendChild(createCompanyNote(note)));
        notesSection.appendChild(list);
    } else {
        const empty = document.createElement('p');
        empty.className = 'greeting-note';
        empty.textContent = 'No company notes have been posted yet.';
        notesSection.appendChild(empty);
    }

    main.appendChild(notesSection);
}

function renderDepartmentsIndex(role) {
    const main = document.getElementById('mainContent');
    main.innerHTML = '';

    const departmentSections = visibleSectionsForRole(role).filter(section => section.group === 'Departments');
    const header = document.createElement('section');
    header.className = 'tool-view-header fade-in';
    header.innerHTML = `
        <div class="section-kicker">Departments</div>
        <h1 class="tool-view-title">Choose an area.</h1>
        <p class="tool-view-note">Departments are grouped the way the company actually works. Production is split into Roasting, Packaging, and Warehouse so each area can have its own tools.</p>
    `;
    main.appendChild(header);

    const deptIcons = {
        'finance': 'finance',
        'production-roasting': 'roasting',
        'production-packaging': 'packaging',
        'production-warehouse': 'warehouse',
        'sales': 'sales',
        'marketing': 'marketing',
        'food-safety': 'shield',
        'hr-people': 'people'
    };

    const list = document.createElement('div');
    list.className = 'dept-list';
    departmentSections.forEach(section => {
        const row = document.createElement('article');
        row.className = 'dept-row fade-in';
        row.tabIndex = 0;
        const subtitle = section.directLink
            ? 'Open the full dashboard'
            : `${section.cards.length} item${section.cards.length === 1 ? '' : 's'}`;
        row.innerHTML = `
            <span class="dept-icon">${iconSvg(deptIcons[section.key] || 'calendar')}</span>
            <span class="dept-copy">
                <span class="dept-title">${section.label}</span>
                <span class="dept-count">${subtitle}</span>
            </span>
            <span class="dept-arrow">→</span>
        `;
        const go = section.directLink
            ? () => { window.location.href = section.directLink; }
            : () => renderHub(role, 'section', section.key);
        row.onclick = go;
        row.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') go();
        };
        list.appendChild(row);
    });
    main.appendChild(list);
}

// Group + icon for each Resources tool, so the page reads like the dashboard:
// what you DO (Submit), what you CHECK (Review), and reference material (Forms).
const RESOURCE_META = {
    'Submit Vacation Request': { group: 'submit', icon: 'plane' },
    'Log Sick Day':            { group: 'submit', icon: 'thermometer' },
    'Expense Reimbursement':   { group: 'submit', icon: 'dollar' },
    'My Time Off':             { group: 'review', icon: 'calendar' },
    'Team Calendar':           { group: 'review', icon: 'people' },
    'Approvals Queue':         { group: 'review', icon: 'check-square' },
    'Calendar Subscriptions':  { group: 'review', icon: 'feed' },
    'Staff Forms':             { group: 'forms',  icon: 'document' },
    'SOPs & Manuals':          { group: 'forms',  icon: 'book' },
    'Employee Handbook':       { group: 'forms',  icon: 'book' },
    'HR Forms':                { group: 'forms',  icon: 'document' }
};
const RESOURCE_FALLBACK = { group: 'forms', icon: 'document' };

function createResourceCard(card, index, accent, icon) {
    const active = Boolean(card.href) && card.href !== '#';
    const el = document.createElement(active ? 'a' : 'div');
    el.className = 'qa-card fade-in' + (accent === 'gold' ? ' qa-card--gold' : '') + (active ? '' : ' qa-card--soon');
    if (active) el.href = card.href;
    el.innerHTML = `
        <span class="qa-top">
            <span class="qa-chip">${iconSvg(icon)}</span>
            <span class="qa-serial">${String(index + 1).padStart(2, '0')}</span>
        </span>
        <span class="qa-label">
            <span>${card.title}</span>
            ${active ? '<span class="qa-arrow">→</span>' : '<span class="qa-soon-tag">Soon</span>'}
        </span>
    `;
    if (active) {
        const isExternal = /^https?:\/\//.test(card.href);
        if (isExternal) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
        el.addEventListener('click', () => {
            try {
                logActivity('tool_open', { toolName: card.title, details: { section: 'Resources', href: card.href || '' }, keepalive: true });
            } catch (error) {
                // best-effort logging
            }
        });
    }
    return el;
}

function renderResourcesIndex(role) {
    const main = document.getElementById('mainContent');
    main.innerHTML = '';

    const allCards = ['time-off', 'employee-resources']
        .map(key => visibleSection(role, key))
        .filter(Boolean)
        .flatMap(section => section.cards.filter(card => cardIsVisible(card, role)));

    const header = document.createElement('section');
    header.className = 'tool-view-header fade-in';
    header.innerHTML = `
        <div class="section-kicker">Resources</div>
        <h1 class="tool-view-title">Resources.</h1>
        <p class="tool-view-note">Time off, calendars, and shared forms — grouped by what you're trying to do.</p>
    `;
    main.appendChild(header);

    const groups = [
        { key: 'submit', title: 'Submit', meta: 'Add or request', accent: 'teal' },
        { key: 'review', title: 'Review', meta: 'View what’s there', accent: 'gold' },
        { key: 'forms',  title: 'Forms & Docs', meta: 'Reference', accent: 'teal' }
    ];

    let rendered = 0;
    groups.forEach(group => {
        const cards = allCards.filter(card => (RESOURCE_META[card.title] || RESOURCE_FALLBACK).group === group.key);
        if (!cards.length) return;
        rendered += cards.length;

        const section = document.createElement('section');
        section.className = 'workbench-section fade-in';
        section.innerHTML = `
            <div class="workbench-head">
                <h2 class="workbench-title">${group.title}</h2>
                <span class="workbench-meta">${group.meta}</span>
            </div>
        `;
        const grid = document.createElement('div');
        grid.className = 'qa-grid';
        grid.style.setProperty('--qa-columns', String(Math.min(Math.max(cards.length, 1), 4)));
        cards.forEach((card, index) => {
            const icon = (RESOURCE_META[card.title] || RESOURCE_FALLBACK).icon;
            grid.appendChild(createResourceCard(card, index, group.accent, icon));
        });
        section.appendChild(grid);
        main.appendChild(section);
    });

    if (!rendered) {
        const empty = document.createElement('p');
        empty.className = 'tool-view-note fade-in';
        empty.textContent = 'No resources are available for your access level yet.';
        main.appendChild(empty);
    }
}

function renderSectionPage(role, sectionKey) {
    const section = visibleSection(role, sectionKey);
    if (section && section.directLink) { window.location.href = section.directLink; return; }
    const main = document.getElementById('mainContent');
    main.innerHTML = '';

    if (!section) {
        renderDashboardHome(role);
        return;
    }

    const notes = {
        'owner-admin': 'Owner dashboard for items that need attention, notifications, and day-to-day oversight.',
        settings: 'Back-end Hub controls. These are important, but not every-day dashboard items.',
        'time-off': 'Vacation, sick days, calendars, and manager review tools.',
        'employee-resources': 'Shared forms and everyday resources for the team.'
    };

    const header = document.createElement('section');
    header.className = 'tool-view-header fade-in';
    header.innerHTML = `
        <div class="section-kicker">${section.group}</div>
        <h1 class="tool-view-title">${section.label}</h1>
        <p class="tool-view-note">${notes[section.key] || 'Open a tool or resource from this area.'}</p>
    `;
    main.appendChild(header);

    const list = document.createElement('div');
    list.className = 'tool-view-list fade-in';
    section.cards.forEach(card => list.appendChild(createToolLink(card, section.label)));
    main.appendChild(list);
}

async function showDashboard(role) {
    clearLoginLockTimer();   // a lock countdown must never outlive the login screen
    role = normalizeRole(role);
    await loadHubData();
    const person = personForRole(role);
    storeRoleSession(role, person);

    document.getElementById('loginScreen').classList.add('hidden');

    const dashboard = document.getElementById('dashboard');
    dashboard.classList.add('active');

    document.getElementById('roleLabel').textContent = `${role.label} access`;
    document.getElementById('avatarInitials').textContent = person.initials;
    document.getElementById('avatarName').textContent = person.firstName;
    populateProfileMenu(role, person);
    setupHubNav(role);
    const route = initialHubRoute(role);
    renderHub(role, route.view, route.sectionKey, false);
}

// ════════════════════════════════════════════════
// SIGN OUT
// ════════════════════════════════════════════════

function populateProfileMenu(role, person) {
    const user = role.user || {};
    document.getElementById('profileMenuName').textContent = user.name || person.name || person.firstName;
    document.getElementById('profileMenuEmail').textContent = user.email || person.email || '—';
    document.getElementById('profileMenuRole').textContent = role.label || '—';
    document.getElementById('profileMenuProvider').textContent = user.provider || 'Email & password';
    document.getElementById('profileMenuManage').style.display = role.key === 'owner' ? '' : 'none';

    if (!window.__fratelloProfileMenuBound) {
        document.addEventListener('click', event => {
            if (event.target.closest('.profile-wrap')) return;
            closeProfileMenu();
        });
        window.__fratelloProfileMenuBound = true;
    }
}

function closeProfileMenu() {
    const menu = document.getElementById('profileMenu');
    if (menu && !menu.hidden) {
        menu.hidden = true;
        document.getElementById('profileChip').setAttribute('aria-expanded', 'false');
    }
}

function toggleProfileMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('profileMenu');
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    document.getElementById('profileChip').setAttribute('aria-expanded', String(willOpen));
    if (willOpen) closeHubNav();
}

async function signOut() {
    try {
        const user = (activeRole && activeRole.user) || {};
        await trackLogout('Hub sign-out', { name: user.name || '', email: user.email || '' });
    } catch (error) {
        // best-effort logging
    }
    if (USE_FIREBASE_AUTH) {
        await signOutHub();
    }
    localStorage.removeItem('fratello-role');
    localStorage.removeItem('fratello-session');
    localStorage.removeItem('fratello_session');
    localStorage.removeItem('fratello_tone');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('accessCode').value = '';
    document.getElementById('mainContent').innerHTML = '';
    // Reset the sign-in UI so the next login starts clean.
    clearLoginLockTimer();
    setPasswordHidden();
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = USE_FIREBASE_AUTH ? 'Sign In' : 'Enter'; }
    document.getElementById('loginError').classList.remove('visible');
}

// ════════════════════════════════════════════════
// SESSION RESTORE
// ════════════════════════════════════════════════

(async function init() {
    document.documentElement.dataset.tone = localStorage.getItem('fratello_tone') || 'offwhite';
    setupAuthModeUi();

    if (USE_FIREBASE_AUTH) {
        const cachedRole = cachedHubRole();
        let showedCachedRole = false;
        if (cachedRole && cachedRole.key) {
            showedCachedRole = true;
            showDashboard(cachedRole)
                .catch(() => {
                    showedCachedRole = false;
                })
                .finally(finishAuthCheck);
        }

        onHubAuthChange((role, error) => {
            if (role) {
                localStorage.setItem('fratello-role', JSON.stringify(role));
                localStorage.removeItem('fratello-session');
                showDashboard(role).finally(finishAuthCheck);
                return;
            }

            localStorage.removeItem('fratello-role');
            localStorage.removeItem('fratello_session');
            if (error) setLoginError(friendlyAuthError(error));
            if (showedCachedRole) {
                document.getElementById('loginScreen').classList.remove('hidden');
                document.getElementById('dashboard').classList.remove('active');
            }
            finishAuthCheck();
        });
        return;
    }

    const sessionToken = localStorage.getItem('fratello-session');
    if (sessionToken) {
        try {
            const response = await fetch('/.netlify/functions/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ action: 'session' })
            });
            if (response.ok) {
                const data = await response.json();
                const role = normalizeRole(data.role);
                localStorage.setItem('fratello-role', JSON.stringify(role));
                await showDashboard(role);
                finishAuthCheck();
                return;
            }
        } catch (e) {
            localStorage.removeItem('fratello-session');
        }
        localStorage.removeItem('fratello-session');
    }

    localStorage.removeItem('fratello-role');
    localStorage.removeItem('fratello_session');
    finishAuthCheck();
})();

window.toggleSetupCode = toggleSetupCode;
window.toggleResetPanel = toggleResetPanel;
window.handlePasswordReset = handlePasswordReset;
window.handleProviderLogin = handleProviderLogin;
window.handleCreateAccount = handleCreateAccount;
window.handleLogin = handleLogin;
window.togglePasswordVisibility = togglePasswordVisibility;
window.signOut = signOut;
window.toggleProfileMenu = toggleProfileMenu;
window.toggleHubNav = toggleHubNav;
