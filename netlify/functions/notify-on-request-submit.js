const {
    absoluteUrl,
    authenticateRequest,
    durationDays,
    findUser,
    getDocument,
    getSettings,
    humanDateRange,
    isOwnerOrController,
    json,
    listDocuments,
    notificationEmailsEnabled,
    overlaps,
    parseBody,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    requireMethod,
    sendLoggedEmail,
    userMatchesId
} = require('./templates/_runtime');

const TEMPLATE_ID = 'vacation_request_submitted';

function conflictSummary(request, requests, users) {
    const conflicts = requests.filter(item =>
        item.id !== request.id &&
        item.type === 'vacation' &&
        item.status === 'approved' &&
        overlaps(item.start_date, item.end_date, request.start_date, request.end_date)
    );

    if (!conflicts.length) return 'No approved vacation conflicts found.';

    return conflicts
        .map(item => `${requestUserName(item, users)} (${humanDateRange(item.start_date, item.end_date)})`)
        .join('; ');
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

        if (request.type !== 'vacation' || request.status !== 'pending') {
            return json(200, {
                sent: false,
                reason: 'Only pending vacation requests trigger approver notifications.'
            });
        }

        // Only the requester (or an owner/controller) may trigger this email.
        if (!isOwnerOrController(session.user) && !userMatchesId(session.user, request.user_id)) {
            return json(403, { error: 'You are not allowed to trigger this notification.' });
        }

        const [settings, users, requests] = await Promise.all([
            getSettings(),
            listDocuments('users'),
            listDocuments('time_off_requests')
        ]);

        if (!notificationEmailsEnabled(settings)) {
            return json(200, { sent: false, reason: 'Notification emails are disabled in settings.' });
        }

        const requesterName = requestUserName(request, users);
        const approver = findUser(users, request.approver_id);
        if (!approver || !approver.email) {
            return json(404, { error: 'Approver email was not found.' });
        }

        const dateRange = humanDateRange(request.start_date, request.end_date);
        const duration = durationDays(request) || 'Not specified';
        const notes = request.notes || 'No notes provided.';
        const conflicts = conflictSummary(request, requests, users);
        const actionUrl = absoluteUrl(event, `/hr/time-off/review.html?id=${encodeURIComponent(request.id)}`);
        const subject = `${requesterName} has requested time off \u2014 your approval needed`;

        const html = renderHtmlTemplate('request-submitted', {
            subject,
            logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
            requester_name: requesterName,
            date_range: dateRange,
            duration,
            notes,
            conflicts,
            action_url: actionUrl
        });

        const messageText = plainText([
            `${requesterName} has requested time off.`,
            `Dates: ${dateRange}`,
            `Duration: ${duration}`,
            `Notes: ${notes}`,
            `Calendar conflicts: ${conflicts}`,
            `Review request: ${actionUrl}`
        ]);

        await sendLoggedEmail({
            to: approver.email,
            subject,
            html,
            text: messageText,
            templateId: TEMPLATE_ID,
            relatedRequestId: request.id
        });

        return json(200, { sent: true, to: approver.email });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Notification failed' });
    }
};
