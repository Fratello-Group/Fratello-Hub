const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_ACCOUNT_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const DEFAULT_SITE_URL = 'https://fratello-hub.netlify.app';
const FIREBASE_WEB_API_KEY =
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyDBZSpwGy2MifMmoKzIz_HYbVEceo2qK7Q';

let cachedServiceAccount;
let cachedToken;
let cachedAdminApp;

function json(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...headers
        },
        body: JSON.stringify(body)
    };
}

function text(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            ...headers
        },
        body
    };
}

function parseBody(event) {
    try {
        return JSON.parse(event.body || '{}');
    } catch (error) {
        return {};
    }
}

function requireMethod(event, allowed) {
    if (allowed.includes(event.httpMethod)) return null;
    return json(405, { error: 'Method not allowed' });
}

function siteOrigin(event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || process.env.URL || DEFAULT_SITE_URL;
    return String(origin || DEFAULT_SITE_URL).replace(/\/$/, '');
}

function absoluteUrl(event, targetPath) {
    if (/^https?:\/\//i.test(String(targetPath || ''))) return targetPath;
    const cleanPath = String(targetPath || '/').startsWith('/') ? targetPath : `/${targetPath}`;
    return `${siteOrigin(event)}${cleanPath}`;
}

function parseServiceAccount() {
    if (cachedServiceAccount) return cachedServiceAccount;

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured.');
    }

    const trimmed = raw.trim();
    let decoded = trimmed;
    if (!trimmed.startsWith('{')) {
        decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    }

    const account = JSON.parse(decoded);
    if (account.private_key) {
        account.private_key = account.private_key.replace(/\\n/g, '\n');
    }
    if (!account.client_email || !account.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT must include client_email and private_key.');
    }

    cachedServiceAccount = account;
    return account;
}

function adminApp() {
    if (cachedAdminApp) return cachedAdminApp;

    let firebaseAdmin;
    try {
        firebaseAdmin = require('firebase-admin/app');
    } catch (error) {
        throw new Error('firebase-admin is required for authenticated server actions. Run npm install after pulling this update.');
    }

    const { cert, getApps, initializeApp } = firebaseAdmin;
    cachedAdminApp = getApps()[0] || initializeApp({
        credential: cert(parseServiceAccount()),
        projectId: projectId()
    });
    return cachedAdminApp;
}

function projectId() {
    return process.env.FIREBASE_PROJECT_ID || parseServiceAccount().project_id;
}

function base64UrlJson(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createGoogleJwt() {
    const account = parseServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: account.client_email,
        scope: FIRESTORE_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600
    };
    const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
    return `${unsigned}.${signature}`;
}

function request(method, url, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const payload = body === undefined || typeof body === 'string' ? body : JSON.stringify(body);
        const options = {
            method,
            hostname: parsed.hostname,
            path: `${parsed.pathname}${parsed.search}`,
            headers: {
                ...headers
            }
        };

        if (payload !== undefined) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                let parsedBody = data;
                try {
                    parsedBody = data ? JSON.parse(data) : null;
                } catch (error) {
                    parsedBody = data;
                }

                if (res.statusCode >= 400) {
                    const message = typeof parsedBody === 'string'
                        ? parsedBody
                        : (parsedBody && parsedBody.error && (parsedBody.error.message || parsedBody.error)) || `HTTP ${res.statusCode}`;
                    const err = new Error(message);
                    err.statusCode = res.statusCode;
                    err.responseBody = parsedBody;
                    reject(err);
                    return;
                }

                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsedBody
                });
            });
        });

        req.on('error', reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

async function googleAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
        return cachedToken.value;
    }

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: createGoogleJwt()
    }).toString();

    const response = await request('POST', GOOGLE_TOKEN_URL, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    cachedToken = {
        value: response.body.access_token,
        expiresAt: Date.now() + ((response.body.expires_in || 3600) * 1000)
    };
    return cachedToken.value;
}

async function verifyFirebaseTokenWithRest(token) {
    if (!FIREBASE_WEB_API_KEY) {
        throw new Error('FIREBASE_WEB_API_KEY is not configured.');
    }

    const response = await request('POST', `${FIREBASE_ACCOUNT_LOOKUP_URL}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`, {
        headers: {
            'Content-Type': 'application/json'
        },
        body: {
            idToken: token
        }
    });

    const account = response.body && Array.isArray(response.body.users) ? response.body.users[0] : null;
    if (!account || !account.email) {
        throw new Error('Firebase token lookup did not return a user.');
    }

    return {
        uid: account.localId || '',
        email: account.email || '',
        name: account.displayName || account.email || '',
        email_verified: account.emailVerified === true
    };
}

async function firestoreFetch(resourcePath, options = {}) {
    const tokenValue = await googleAccessToken();
    const id = projectId();
    if (!id) throw new Error('FIREBASE_PROJECT_ID is not configured.');

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(id)}/databases/(default)/documents${resourcePath}`;
    const response = await request(options.method || 'GET', url, {
        headers: {
            Authorization: `Bearer ${tokenValue}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body
    });
    return response.body;
}

function toFirestoreValue(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(toFirestoreValue) } };
    }
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    if (typeof value === 'object') {
        return { mapValue: { fields: toFirestoreFields(value) } };
    }
    return { stringValue: String(value) };
}

function toFirestoreFields(data) {
    return Object.entries(data || {}).reduce((fields, [key, value]) => {
        if (value !== undefined) fields[key] = toFirestoreValue(value);
        return fields;
    }, {});
}

function fromFirestoreValue(value) {
    if (!value || typeof value !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) {
        return value.referenceValue.split('/documents/').pop();
    }
    if (value.arrayValue) return (value.arrayValue.values || []).map(fromFirestoreValue);
    if (value.mapValue) return fromFirestoreFields(value.mapValue.fields || {});
    return undefined;
}

function fromFirestoreFields(fields) {
    return Object.entries(fields || {}).reduce((data, [key, value]) => {
        data[key] = fromFirestoreValue(value);
        return data;
    }, {});
}

function documentFromFirestore(doc) {
    const id = doc.name ? doc.name.split('/').pop() : '';
    return {
        id,
        path: doc.name || '',
        create_time: doc.createTime || '',
        update_time: doc.updateTime || '',
        ...fromFirestoreFields(doc.fields || {})
    };
}

async function getDocument(collection, id) {
    const doc = await firestoreFetch(`/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
    return documentFromFirestore(doc);
}

async function listDocuments(collection, pageSize = 500) {
    const docs = [];
    let pageToken = '';

    do {
        const query = new URLSearchParams({ pageSize: String(pageSize) });
        if (pageToken) query.set('pageToken', pageToken);
        const response = await firestoreFetch(`/${encodeURIComponent(collection)}?${query.toString()}`);
        docs.push(...(response.documents || []).map(documentFromFirestore));
        pageToken = response.nextPageToken || '';
    } while (pageToken);

    return docs;
}

async function createDocument(collection, data, documentId) {
    const query = documentId ? `?documentId=${encodeURIComponent(documentId)}` : '';
    const response = await firestoreFetch(`/${encodeURIComponent(collection)}${query}`, {
        method: 'POST',
        body: {
            fields: toFirestoreFields(data)
        }
    });
    return documentFromFirestore(response);
}

async function patchDocument(collection, id, data) {
    const query = new URLSearchParams();
    Object.keys(data).forEach(key => query.append('updateMask.fieldPaths', key));
    const response = await firestoreFetch(`/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${query.toString()}`, {
        method: 'PATCH',
        body: {
            fields: toFirestoreFields(data)
        }
    });
    return documentFromFirestore(response);
}

async function getSettings() {
    try {
        return await getDocument('settings', 'global');
    } catch (error) {
        const settings = await listDocuments('settings', 20);
        return settings[0] || {};
    }
}

function notificationEmailsEnabled(settings) {
    return !settings || settings.notification_emails_enabled !== false;
}

function emailFromAddress() {
    const address = process.env.EMAIL_FROM_ADDRESS || 'hub@fratellocoffee.com';
    const name = process.env.EMAIL_FROM_NAME || 'Fratello Hub';
    const safeName = name.replace(/"/g, '');
    return `${safeName} <${address}>`;
}

async function sendResendEmail({ to, cc, subject, html, text: plainText }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    const ccRecipients = Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean);
    if (!recipients.length) throw new Error('At least one email recipient is required.');

    const payload = {
        from: emailFromAddress(),
        to: recipients,
        subject,
        html,
        text: plainText
    };
    if (ccRecipients.length) payload.cc = ccRecipients;

    return request('POST', RESEND_EMAIL_URL, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: payload
    });
}

async function logNotification({ to, subject, templateId, relatedRequestId, status, errorMessage }) {
    return createDocument('notifications', {
        to_email: Array.isArray(to) ? to.join(', ') : String(to || ''),
        subject: subject || '',
        template_id: templateId || '',
        related_request_id: relatedRequestId || '',
        status,
        error_message: errorMessage || '',
        sent_at: new Date()
    });
}

async function sendLoggedEmail({ to, cc, subject, html, text: plainText, templateId, relatedRequestId }) {
    try {
        const response = await sendResendEmail({ to, cc, subject, html, text: plainText });
        await logNotification({
            to,
            subject,
            templateId,
            relatedRequestId,
            status: 'sent'
        });
        return response.body;
    } catch (error) {
        try {
            await logNotification({
                to,
                subject,
                templateId,
                relatedRequestId,
                status: 'failed',
                errorMessage: error.message
            });
        } catch (logError) {
            console.error('Notification failure could not be logged', logError);
        }
        throw error;
    }
}

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderHtmlTemplate(templateName, data) {
    const base = fs.readFileSync(path.join(__dirname, 'base.html'), 'utf8');
    const bodyTemplate = fs.readFileSync(path.join(__dirname, `${templateName}.html`), 'utf8');
    const escaped = Object.entries(data || {}).reduce((values, [key, value]) => {
        values[key] = escapeHtml(value);
        return values;
    }, {});
    const body = bodyTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => escaped[key] || '');
    return base
        .replace('{{body}}', body)
        .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => escaped[key] || '');
}

function plainText(lines) {
    return lines
        .filter(line => line !== undefined && line !== null && String(line).trim() !== '')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}

function dateOnly(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const match = value.match(/\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
    }
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function utcDate(dateString) {
    const [year, month, day] = dateOnly(dateString).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
}

function addDays(dateString, days) {
    const date = utcDate(dateString);
    if (!date) return '';
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function humanDate(value) {
    const clean = dateOnly(value);
    const date = utcDate(clean);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-CA', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(date);
}

function humanDateRange(start, end) {
    const startDate = dateOnly(start);
    const endDate = dateOnly(end) || startDate;
    if (!startDate) return '';
    if (startDate === endDate) return humanDate(startDate);
    return `${humanDate(startDate)} to ${humanDate(endDate)}`;
}

function durationDays(request) {
    const start = utcDate(request.start_date);
    const end = utcDate(request.end_date || request.start_date);
    if (!start || !end) return '';

    const dayMs = 24 * 60 * 60 * 1000;
    let days = Math.round((end - start) / dayMs) + 1;
    if (request.half_day_start) days -= 0.5;
    if (request.half_day_end) days -= 0.5;
    if (days < 0.5) days = 0.5;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function idCandidates(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const last = raw.split('/').filter(Boolean).pop();
    return Array.from(new Set([raw, last, raw.toLowerCase(), String(last || '').toLowerCase()]));
}

function userMatchesId(user, value) {
    const candidates = idCandidates(value);
    const userValues = [
        user.id,
        user.email,
        user.user_id,
        user.uid,
        user.path,
        `users/${user.id}`
    ].filter(Boolean);
    return userValues.some(item => candidates.includes(String(item).trim()) || candidates.includes(String(item).trim().toLowerCase()));
}

function findUser(users, value) {
    return (users || []).find(user => userMatchesId(user, value)) || null;
}

async function authenticateRequest(event) {
    const header = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);

    if (match) {
        const token = match[1].trim();

        try {
            const { getAuth } = require('firebase-admin/auth');
            const decoded = await getAuth(adminApp()).verifyIdToken(token);
            const email = decoded.email || '';
            const users = await listDocuments('users').catch(() => []);
            const user = findUser(users, email) || {
                id: email,
                email,
                name: decoded.name || email,
                role_tier: '',
                active: true
            };
            return { user, auth_type: 'firebase', decoded };
        } catch (error) {
            if (token.includes('.')) {
                try {
                    const decoded = await verifyFirebaseTokenWithRest(token);
                    const email = decoded.email || '';
                    const users = await listDocuments('users').catch(() => []);
                    const user = findUser(users, email) || {
                        id: email,
                        email,
                        name: decoded.name || email,
                        role_tier: '',
                        active: true
                    };
                    return { user, auth_type: 'firebase-rest', decoded };
                } catch (restError) {
                    console.error('Firebase token verification failed', {
                        adminError: error.message,
                        restError: restError.message
                    });
                    throw new Error('Firebase session could not be verified. Sign out and sign in again.');
                }
            }
        }

        try {
            const { findUserBySession } = require('../auth-lib');
            return await findUserBySession(event);
        } catch (error) {
            return null;
        }
    }

    try {
        const { findUserBySession } = require('../auth-lib');
        return await findUserBySession(event);
    } catch (error) {
        return null;
    }
}

function roleTier(user) {
    return String(user.role_tier || user.roleTier || user.profile || '').trim().toLowerCase();
}

function isOwnerOrController(user) {
    const tier = roleTier(user);
    return tier === 'owner' || tier === 'controller';
}

function ownerUsers(users) {
    return (users || []).filter(user => roleTier(user) === 'owner');
}

function controllerUsers(users) {
    return (users || []).filter(user => roleTier(user) === 'controller');
}

function chrisOwner(users) {
    return ownerUsers(users).find(user => /chris/i.test(user.name || '') || /chris/i.test(user.email || '')) || ownerUsers(users)[0] || null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
    const leftStart = dateOnly(aStart);
    const leftEnd = dateOnly(aEnd || aStart);
    const rightStart = dateOnly(bStart);
    const rightEnd = dateOnly(bEnd || bStart);
    if (!leftStart || !rightStart) return false;
    return leftStart <= rightEnd && rightStart <= leftEnd;
}

function requestUserName(request, users) {
    const user = findUser(users, request.user_id);
    return (user && user.name) || request.user_name || request.name || 'A team member';
}

module.exports = {
    absoluteUrl,
    addDays,
    adminApp,
    authenticateRequest,
    chrisOwner,
    controllerUsers,
    createDocument,
    dateOnly,
    durationDays,
    findUser,
    getDocument,
    getSettings,
    humanDate,
    humanDateRange,
    isOwnerOrController,
    json,
    listDocuments,
    logNotification,
    notificationEmailsEnabled,
    ownerUsers,
    overlaps,
    parseBody,
    patchDocument,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    requireMethod,
    roleTier,
    sendLoggedEmail,
    text,
    userMatchesId
};
