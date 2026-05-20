const ACTIVITY_ENDPOINT = '/.netlify/functions/log-activity';
const SESSION_KEY = 'fratello-session';
const ROLE_KEY = 'fratello-role';

function sessionToken() {
    try {
        return localStorage.getItem(SESSION_KEY) || '';
    } catch (error) {
        return '';
    }
}

async function firebaseToken() {
    try {
        const authModule = await import('../fratello-auth.js');
        const state = authModule.initFirebase();
        if (!state.ready || !state.auth || !state.auth.currentUser) return '';
        return state.auth.currentUser.getIdToken();
    } catch (error) {
        return '';
    }
}

function currentRole() {
    try {
        return JSON.parse(localStorage.getItem(ROLE_KEY) || 'null');
    } catch (error) {
        return null;
    }
}

function currentUserId() {
    const role = currentRole();
    return role && role.user ? (role.user.id || role.user.email || '') : '';
}

function pageDetails(extraDetails) {
    return {
        path: window.location.pathname,
        title: document.title,
        ...extraDetails
    };
}

function toolNameFromPage() {
    const explicit = document.body && document.body.dataset ? document.body.dataset.toolName : '';
    return explicit || document.title || window.location.pathname;
}

export async function logActivity(eventType, options = {}) {
    const token = sessionToken() || await firebaseToken();
    if (!token) return false;

    const payload = {
        event_type: eventType,
        tool_name: options.toolName || options.tool_name || toolNameFromPage(),
        user_id: options.userId || options.user_id || currentUserId(),
        details: pageDetails(options.details || {})
    };

    try {
        const response = await fetch(ACTIVITY_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload),
            keepalive: Boolean(options.keepalive)
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

export function trackToolOpen(toolName, details = {}) {
    return logActivity('tool_open', { toolName, details });
}

export function trackFormSubmit(toolName, details = {}) {
    return logActivity('form_submit', { toolName, details });
}

export function trackApprovalAction(toolName, details = {}) {
    return logActivity('approval_action', { toolName, details });
}

export function trackDataEdit(toolName, details = {}) {
    return logActivity('data_edit', { toolName, details });
}

export function trackLogout(toolName, details = {}) {
    return logActivity('logout', { toolName, details, keepalive: true });
}

export function installActivityLogger(toolName = toolNameFromPage(), options = {}) {
    if (options.trackOpen !== false) {
        trackToolOpen(toolName, options.details || {});
    }

    if (options.trackForms) {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!form || !form.matches('form')) return;
            trackFormSubmit(toolName, {
                form_id: form.id || '',
                form_name: form.getAttribute('name') || ''
            });
        }, true);
    }
}

export default {
    installActivityLogger,
    logActivity,
    trackApprovalAction,
    trackDataEdit,
    trackFormSubmit,
    trackLogout,
    trackToolOpen
};
