const {
    addDays,
    dateOnly,
    findUser,
    humanDateRange,
    isOwnerOrController,
    json,
    listDocuments,
    requestUserName,
    text,
    userMatchesId
} = require('./templates/_runtime');

const CACHE_HEADERS = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, max-age=14400, stale-while-revalidate=3600'
};

function addToken(tokens, user, type, value) {
    if (!value) return;
    if (typeof value === 'object') {
        addToken(tokens, user, value.type || type, value.token || value.value || value.secret);
        return;
    }
    tokens.push({
        user,
        type,
        value: String(value)
    });
}

function calendarTokensForUser(user) {
    const tokens = [];
    [
        'calendar_token',
        'calendarToken',
        'ics_token',
        'icsToken',
        'team_calendar_token',
        'teamCalendarToken',
        'time_off_calendar_token',
        'timeOffCalendarToken'
    ].forEach(field => addToken(tokens, user, 'team', user[field]));

    [
        'personal_calendar_token',
        'personalCalendarToken',
        'personal_ics_token',
        'personalIcsToken'
    ].forEach(field => addToken(tokens, user, 'personal', user[field]));

    [
        'admin_calendar_token',
        'adminCalendarToken',
        'owner_calendar_token',
        'ownerCalendarToken',
        'controller_calendar_token',
        'controllerCalendarToken'
    ].forEach(field => addToken(tokens, user, 'admin', user[field]));

    if (user.calendar_tokens && typeof user.calendar_tokens === 'object') {
        Object.entries(user.calendar_tokens).forEach(([type, value]) => addToken(tokens, user, type, value));
    }

    return tokens;
}

function findCalendarToken(users, token) {
    for (const user of users) {
        const match = calendarTokensForUser(user).find(entry => entry.value === token);
        if (match) return match;
    }
    return null;
}

function icsDate(value) {
    return dateOnly(value).replace(/-/g, '');
}

function icsTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

function foldLine(line) {
    const limit = 74;
    if (line.length <= limit) return [line];
    const lines = [];
    let remaining = line;
    while (remaining.length > limit) {
        lines.push(remaining.slice(0, limit));
        remaining = ` ${remaining.slice(limit)}`;
    }
    lines.push(remaining);
    return lines;
}

function vevent({ uid, summary, start, end, description }) {
    const lines = [
        'BEGIN:VEVENT',
        `UID:${escapeIcs(uid)}`,
        `DTSTAMP:${icsTimestamp()}`,
        `DTSTART;VALUE=DATE:${icsDate(start)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(end || start, 1))}`,
        `SUMMARY:${escapeIcs(summary)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
    ];
    return lines.flatMap(foldLine);
}

function approved(request) {
    return String(request.status || '').toLowerCase() === 'approved';
}

function vacationEvents(requests, users, personalUser) {
    return requests
        .filter(request => request.type === 'vacation' && approved(request))
        .filter(request => !personalUser || userMatchesId(personalUser, request.user_id))
        .map(request => {
            const name = requestUserName(request, users);
            return {
                start: dateOnly(request.start_date),
                end: dateOnly(request.end_date || request.start_date),
                lines: vevent({
                    uid: `vacation-${request.id}@fratello-hub`,
                    summary: `${name} \u2014 Vacation`,
                    start: request.start_date,
                    end: request.end_date || request.start_date,
                    description: `Approved vacation for ${name}: ${humanDateRange(request.start_date, request.end_date)}`
                })
            };
        });
}

function sickEvents(requests, users, options) {
    const { personalUser, includeAllSick } = options;
    return requests
        .filter(request => request.type === 'sick' && approved(request))
        .filter(request => includeAllSick || (personalUser && userMatchesId(personalUser, request.user_id)))
        .map(request => {
            const name = requestUserName(request, users);
            const personal = personalUser && userMatchesId(personalUser, request.user_id) && !includeAllSick;
            return {
                start: dateOnly(request.start_date),
                end: dateOnly(request.end_date || request.start_date),
                lines: vevent({
                    uid: `sick-${request.id}@fratello-hub`,
                    summary: personal ? 'Sick Day' : `${name} \u2014 Sick`,
                    start: request.start_date,
                    end: request.end_date || request.start_date,
                    description: personal ? 'Your sick day record.' : `Sick day record for ${name}.`
                })
            };
        });
}

function holidayEvents(holidays) {
    return holidays
        .map(holiday => {
            const start = dateOnly(holiday.observed_date || holiday.date);
            if (!start) return null;
            return {
                start,
                end: start,
                lines: vevent({
                    uid: `holiday-${holiday.id || start}@fratello-hub`,
                    summary: holiday.name || 'Holiday',
                    start,
                    end: start,
                    description: `${holiday.jurisdiction || 'Stat'} holiday`
                })
            };
        })
        .filter(Boolean);
}

function calendarBody({ name, events }) {
    const sortedEvents = events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Fratello Coffee Roasters//Fratello Hub//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeIcs(name)}`,
        `X-WR-CALDESC:${escapeIcs('Fratello Hub time-off calendar')}`,
        ...sortedEvents.flatMap(event => event.lines),
        'END:VCALENDAR'
    ];
    return `${lines.flatMap(foldLine).join('\r\n')}\r\n`;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }

    try {
        const params = event.queryStringParameters || {};
        const token = String(params.token || '').trim();
        if (!token) return text(401, 'Calendar token is required.');

        const [users, requests, holidays] = await Promise.all([
            listDocuments('users'),
            listDocuments('time_off_requests').catch(() => []),
            listDocuments('holidays').catch(() => [])
        ]);

        const tokenMatch = findCalendarToken(users, token);
        if (!tokenMatch) return text(401, 'Calendar token was not found.');

        const requestedScope = String(params.scope || params.type || params.token_type || tokenMatch.type || 'team').toLowerCase();
        const personal = requestedScope === 'personal' || tokenMatch.type === 'personal';
        const tokenOwner = tokenMatch.user;
        const adminToken = ['admin', 'owner', 'controller'].includes(String(tokenMatch.type || '').toLowerCase()) ||
            ['admin', 'owner', 'controller'].includes(requestedScope);
        const includeAllSick = !personal && isOwnerOrController(tokenOwner) && (adminToken || requestedScope === 'team');

        const events = [
            ...holidayEvents(holidays),
            ...vacationEvents(requests, users, personal ? tokenOwner : null),
            ...sickEvents(requests, users, {
                personalUser: personal ? tokenOwner : null,
                includeAllSick
            })
        ];

        const calendarName = personal
            ? `Fratello Time Off - ${tokenOwner.name || tokenOwner.email || 'Personal'}`
            : 'Fratello Team Time Off';

        return {
            statusCode: 200,
            headers: CACHE_HEADERS,
            body: calendarBody({ name: calendarName, events })
        };
    } catch (error) {
        console.error(error);
        return text(500, error.message || 'Calendar feed failed.');
    }
};
