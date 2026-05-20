const {
    authenticateRequest,
    createDocument,
    json,
    parseBody,
    requireMethod
} = require('./templates/_runtime');

const ALLOWED_EVENTS = new Set([
    'login',
    'logout',
    'tool_open',
    'form_submit',
    'approval_action',
    'data_edit'
]);

function sanitize(value, depth = 0) {
    if (depth > 4) return '[truncated]';
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitize(item, depth + 1));
    if (typeof value === 'object') {
        return Object.entries(value).slice(0, 50).reduce((data, [key, item]) => {
            data[String(key).slice(0, 80)] = sanitize(item, depth + 1);
            return data;
        }, {});
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value).slice(0, 1000);
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        if (!session) return json(401, { error: 'Authentication required' });

        const body = parseBody(event);
        const eventType = String(body.event_type || body.eventType || '').trim();
        if (!ALLOWED_EVENTS.has(eventType)) {
            return json(400, { error: 'Invalid activity event_type' });
        }

        const user = session.user || {};
        const details = sanitize(body.details || {});
        if (user.email && details && typeof details === 'object') {
            details.session_user_email = user.email;
        }

        await createDocument('activity_log', {
            user_id: String(body.user_id || body.userId || user.id || user.email || ''),
            event_type: eventType,
            tool_name: String(body.tool_name || body.toolName || '').slice(0, 120),
            details,
            timestamp: new Date(),
            user_agent: String((event.headers && (event.headers['user-agent'] || event.headers.UserAgent)) || '').slice(0, 500)
        });

        return json(200, { logged: true });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Activity logging failed' });
    }
};
