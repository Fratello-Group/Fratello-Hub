const {
    absoluteUrl,
    chrisOwner,
    createDocument,
    durationDays,
    findUser,
    getSettings,
    humanDateRange,
    json,
    listDocuments,
    notificationEmailsEnabled,
    parseBody,
    patchDocument,
    plainText,
    renderHtmlTemplate,
    requestUserName,
    sendLoggedEmail
} = require('./templates/_runtime');

const REMINDER_TEMPLATE_ID = 'vacation_escalation_reminder';
const ESCALATED_TEMPLATE_ID = 'vacation_escalated';
const DEFAULT_REMINDER_HOURS = 72;
const ESCALATE_AFTER_HOURS = 96;

exports.config = {
    schedule: '0 */6 * * *'
};

function submittedAt(request) {
    const value = request.submitted_at || request.created_at || request.create_time;
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
}

function hoursWaiting(request, now = Date.now()) {
    const submitted = submittedAt(request);
    if (!submitted) return 0;
    return Math.floor((now - submitted) / (60 * 60 * 1000));
}

function reminderAlreadySent(notifications, requestId) {
    return notifications.some(item =>
        item.related_request_id === requestId &&
        item.template_id === REMINDER_TEMPLATE_ID &&
        item.status === 'sent'
    );
}

function compactEmailList(values) {
    return Array.from(new Set(values.filter(Boolean)));
}

async function sendReminder({ event, request, requesterName, approver, chris, hours }) {
    const dateRange = humanDateRange(request.start_date, request.end_date);
    const duration = durationDays(request) || 'Not specified';
    const notes = request.notes || 'No notes provided.';
    const actionUrl = absoluteUrl(event, `/hr/time-off/review.html?id=${encodeURIComponent(request.id)}`);
    const subject = `Reminder: ${requesterName}'s vacation request is waiting`;
    const to = approver && approver.email ? approver.email : chris && chris.email;
    const cc = compactEmailList([chris && chris.email]).filter(email => email !== to);

    if (!to) throw new Error('No approver or owner email found for escalation reminder.');

    const html = renderHtmlTemplate('escalation-reminder', {
        subject,
        logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
        requester_name: requesterName,
        hours_waiting: hours,
        date_range: dateRange,
        duration,
        notes,
        action_url: actionUrl
    });

    const messageText = plainText([
        `${requesterName}'s vacation request is waiting for review.`,
        `Waiting: ${hours} hours`,
        `Dates: ${dateRange}`,
        `Duration: ${duration}`,
        `Notes: ${notes}`,
        `Review request: ${actionUrl}`
    ]);

    await sendLoggedEmail({
        to,
        cc,
        subject,
        html,
        text: messageText,
        templateId: REMINDER_TEMPLATE_ID,
        relatedRequestId: request.id
    });
}

async function escalateRequest({ event, request, requesterName, approver, chris, hours, emailsEnabled }) {
    const now = new Date();
    await patchDocument('time_off_requests', request.id, {
        status: 'escalated',
        escalated_at: now,
        updated_at: now
    });

    await createDocument('approvals', {
        request_id: request.id,
        approver_id: chris ? chris.id : '',
        action: 'escalated',
        comment: `Automatically escalated after ${hours} hours without approval.`,
        timestamp: now
    });

    if (!emailsEnabled) return false;
    if (!chris || !chris.email) throw new Error('Chris Prefontaine owner email was not found for escalation.');

    const dateRange = humanDateRange(request.start_date, request.end_date);
    const notes = request.notes || 'No notes provided.';
    const approverName = approver && approver.name ? approver.name : 'No approver found';
    const actionUrl = absoluteUrl(event, `/hr/time-off/review.html?id=${encodeURIComponent(request.id)}`);
    const subject = `Escalated vacation request: ${requesterName}`;

    const html = renderHtmlTemplate('escalated', {
        subject,
        logo_url: absoluteUrl(event, '/assets/Fratello_Logo_White.png'),
        requester_name: requesterName,
        hours_waiting: hours,
        date_range: dateRange,
        approver_name: approverName,
        notes,
        action_url: actionUrl
    });

    const messageText = plainText([
        `${requesterName}'s vacation request has been escalated.`,
        `Waiting: ${hours} hours`,
        `Dates: ${dateRange}`,
        `Original approver: ${approverName}`,
        `Notes: ${notes}`,
        `Open request: ${actionUrl}`
    ]);

    await sendLoggedEmail({
        to: chris.email,
        subject,
        html,
        text: messageText,
        templateId: ESCALATED_TEMPLATE_ID,
        relatedRequestId: request.id
    });

    return true;
}

exports.handler = async (event) => {
    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return json(405, { error: 'Method not allowed' });
    }

    try {
        parseBody(event);

        const [settings, users, requests, notifications] = await Promise.all([
            getSettings(),
            listDocuments('users'),
            listDocuments('time_off_requests'),
            listDocuments('notifications').catch(() => [])
        ]);

        const reminderHours = Number(settings.escalation_hours || DEFAULT_REMINDER_HOURS);
        const emailsEnabled = notificationEmailsEnabled(settings);
        const chris = chrisOwner(users);
        const results = [];

        const pendingVacationRequests = requests.filter(item =>
            item.type === 'vacation' &&
            item.status === 'pending' &&
            hoursWaiting(item) >= reminderHours
        );

        for (const request of pendingVacationRequests) {
            try {
                const hours = hoursWaiting(request);
                const requesterName = requestUserName(request, users);
                const approver = findUser(users, request.approver_id);

                if (hours >= ESCALATE_AFTER_HOURS) {
                    const emailed = await escalateRequest({
                        event,
                        request,
                        requesterName,
                        approver,
                        chris,
                        hours,
                        emailsEnabled
                    });
                    results.push({ request_id: request.id, action: 'escalated', emailed });
                    continue;
                }

                if (!emailsEnabled) {
                    results.push({ request_id: request.id, action: 'reminder_skipped_emails_disabled' });
                    continue;
                }

                if (reminderAlreadySent(notifications, request.id)) {
                    results.push({ request_id: request.id, action: 'reminder_already_sent' });
                    continue;
                }

                await sendReminder({
                    event,
                    request,
                    requesterName,
                    approver,
                    chris,
                    hours
                });
                results.push({ request_id: request.id, action: 'reminder_sent' });
            } catch (error) {
                console.error(`Escalation check failed for ${request.id}`, error);
                results.push({ request_id: request.id, action: 'error', error: error.message });
            }
        }

        return json(200, { checked: pendingVacationRequests.length, results });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Escalation check failed' });
    }
};
