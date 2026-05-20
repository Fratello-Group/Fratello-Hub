const {
    absoluteUrl,
    authenticateRequest,
    findUser,
    getDocument,
    getSettings,
    humanDateRange,
    json,
    listDocuments,
    notificationEmailsEnabled,
    parseBody,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    requireMethod,
    sendLoggedEmail
} = require('./templates/_runtime');

const TEMPLATE_ID = 'vacation_status_changed';
const NOTIFIABLE_STATUSES = new Set(['approved', 'denied', 'cancelled']);

function titleCase(value) {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        if (!session) return json(401, { error: 'Authentication required' });

        const body = parseBody(event);
        const requestId = body.request_id || body.requestId || body.id;
        if (!requestId) return json(400, { error: 'request_id is required' });

        const request = await getDocument('time_off_requests', requestId);
        request.id = request.id || requestId;
        const status = String(request.status || body.status || '').toLowerCase();

        if (!NOTIFIABLE_STATUSES.has(status)) {
            return json(200, {
                sent: false,
                reason: 'Only approved, denied, or cancelled requests notify the requester.'
            });
        }

        const [settings, users] = await Promise.all([
            getSettings(),
            listDocuments('users')
        ]);

        if (!notificationEmailsEnabled(settings)) {
            return json(200, { sent: false, reason: 'Notification emails are disabled in settings.' });
        }

        const requester = findUser(users, request.user_id);
        if (!requester || !requester.email) {
            return json(404, { error: 'Requester email was not found.' });
        }

        const requesterName = requestUserName(request, users);
        const statusLabel = titleCase(status);
        const comment = body.comment || request.approver_comment || request.comment || request.status_comment || 'No comment provided.';
        const dateRange = humanDateRange(request.start_date, request.end_date);
        const actionUrl = absoluteUrl(event, '/hr/time-off/vacation-tracker.html');
        const subject = `Your time-off request was ${status}`;

        const html = renderHtmlTemplate('status-change', {
            subject,
            logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
            requester_name: requesterName,
            date_range: dateRange,
            status_label: statusLabel,
            comment,
            action_url: actionUrl
        });

        const messageText = plainText([
            `Your time-off request was ${status}.`,
            `Dates: ${dateRange}`,
            `Approver comment: ${comment}`,
            `Open Vacation Tracker: ${actionUrl}`
        ]);

        await sendLoggedEmail({
            to: requester.email,
            subject,
            html,
            text: messageText,
            templateId: TEMPLATE_ID,
            relatedRequestId: request.id
        });

        return json(200, { sent: true, to: requester.email });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Notification failed' });
    }
};
