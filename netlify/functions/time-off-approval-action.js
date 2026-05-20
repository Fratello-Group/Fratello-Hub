const {
    absoluteUrl,
    authenticateRequest,
    createDocument,
    findUser,
    getDocument,
    getSettings,
    humanDateRange,
    isOwnerOrController,
    json,
    listDocuments,
    notificationEmailsEnabled,
    parseBody,
    patchDocument,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    requireMethod,
    sendLoggedEmail,
    userMatchesId
} = require('./templates/_runtime');

const ACTIONS = new Set(['approved', 'denied', 'cancelled']);

function titleCase(value) {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function canAct(sessionUser, request) {
    return isOwnerOrController(sessionUser) ||
        userMatchesId(sessionUser, request.approver_id) ||
        (String(request.status || '').toLowerCase() === 'escalated' && String(sessionUser.role_tier || '').toLowerCase() === 'owner');
}

async function maybeNotifyRequester({ event, request, requester, users, status, comment, emailsEnabled }) {
    if (!emailsEnabled || !requester || !requester.email) return false;

    const requesterName = requestUserName(request, users);
    const statusLabel = titleCase(status);
    const dateRange = humanDateRange(request.start_date, request.end_date);
    const actionUrl = absoluteUrl(event, '/hr/time-off/vacation-tracker.html?view=my-requests');
    const subject = `Your time-off request was ${status}`;

    const html = renderHtmlTemplate('status-change', {
        subject,
        logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
        requester_name: requesterName,
        date_range: dateRange,
        status_label: statusLabel,
        comment: comment || 'No comment provided.',
        action_url: actionUrl
    });

    const messageText = plainText([
        `Your time-off request was ${status}.`,
        `Dates: ${dateRange}`,
        `Approver comment: ${comment || 'No comment provided.'}`,
        `Open Vacation Tracker: ${actionUrl}`
    ]);

    await sendLoggedEmail({
        to: requester.email,
        subject,
        html,
        text: messageText,
        templateId: 'vacation_status_changed',
        relatedRequestId: request.id
    });

    return true;
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        if (!session || !session.user) return json(401, { error: 'Authentication required' });

        const body = parseBody(event);
        const status = String(body.action || body.status || '').trim().toLowerCase();
        const requestId = String(body.request_id || body.requestId || body.id || '').trim();
        const comment = String(body.comment || '').trim().slice(0, 500);

        if (!ACTIONS.has(status)) return json(400, { error: 'Use approved, denied, or cancelled.' });
        if (!requestId) return json(400, { error: 'request_id is required.' });

        const [request, users, settings] = await Promise.all([
            getDocument('time_off_requests', requestId),
            listDocuments('users'),
            getSettings()
        ]);
        request.id = request.id || requestId;

        if (request.type !== 'vacation') {
            return json(400, { error: 'Only vacation requests can be approved or denied.' });
        }

        if (!canAct(session.user, request)) {
            return json(403, { error: 'This request is not assigned to you.' });
        }

        const now = new Date();
        const updated = await patchDocument('time_off_requests', request.id, {
            status,
            approver_id: session.user.id || session.user.email || request.approver_id || '',
            approver_comment: comment,
            decided_at: now,
            updated_at: now
        });

        await createDocument('approvals', {
            request_id: request.id,
            approver_id: session.user.id || session.user.email || '',
            action: status,
            comment,
            timestamp: now
        });

        await createDocument('activity_log', {
            user_id: session.user.id || session.user.email || '',
            event_type: 'approval_action',
            tool_name: 'Vacation Approval',
            details: {
                request_id: request.id,
                action: status
            },
            timestamp: now,
            user_agent: String((event.headers && (event.headers['user-agent'] || event.headers.UserAgent)) || '').slice(0, 500)
        });

        const requester = findUser(users, request.user_id);
        const notified = await maybeNotifyRequester({
            event,
            request: { ...request, ...updated, id: request.id },
            requester,
            users,
            status,
            comment,
            emailsEnabled: notificationEmailsEnabled(settings)
        });

        return json(200, { request: updated, notified });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Approval action failed' });
    }
};
