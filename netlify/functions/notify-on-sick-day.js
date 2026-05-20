const {
    absoluteUrl,
    authenticateRequest,
    controllerUsers,
    getDocument,
    getSettings,
    humanDateRange,
    json,
    listDocuments,
    notificationEmailsEnabled,
    ownerUsers,
    parseBody,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    requireMethod,
    sendLoggedEmail
} = require('./templates/_runtime');

const TEMPLATE_ID = 'sick_day_logged';

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

        if (request.type !== 'sick') {
            return json(200, { sent: false, reason: 'Only sick day records trigger this notification.' });
        }

        const [settings, users] = await Promise.all([
            getSettings(),
            listDocuments('users')
        ]);

        if (!notificationEmailsEnabled(settings)) {
            return json(200, { sent: false, reason: 'Notification emails are disabled in settings.' });
        }

        const recipients = [...ownerUsers(users), ...controllerUsers(users)]
            .map(user => user.email)
            .filter(Boolean);

        if (!recipients.length) {
            return json(404, { error: 'Owner or Controller recipients were not found.' });
        }

        const requesterName = requestUserName(request, users);
        const dateRange = humanDateRange(request.start_date, request.end_date);
        const category = request.reason_category || 'Not specified';
        const actionUrl = absoluteUrl(event, '/hr/time-off/sick-day-report.html');
        const subject = `${requesterName} logged a sick day for ${dateRange}`;

        const html = renderHtmlTemplate('sick-day', {
            subject,
            logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
            requester_name: requesterName,
            date_range: dateRange,
            category,
            action_url: actionUrl
        });

        const messageText = plainText([
            `${requesterName} logged a sick day.`,
            `Date: ${dateRange}`,
            `Category: ${category}`,
            `Open Sick Day Report: ${actionUrl}`
        ]);

        await sendLoggedEmail({
            to: recipients,
            subject,
            html,
            text: messageText,
            templateId: TEMPLATE_ID,
            relatedRequestId: request.id
        });

        return json(200, { sent: true, to: recipients });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Notification failed' });
    }
};
