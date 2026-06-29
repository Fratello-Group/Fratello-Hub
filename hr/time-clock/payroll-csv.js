/*
 * payroll-csv.js — Stage-1 payroll "Hours by Day" CSV export (pure module).
 *
 * PAYROLL-CRITICAL: math and byte format must be exactly right.
 * This file is DOM-free, Firebase-free, and has ZERO imports so it can be
 * unit-tested in Node and imported directly by the browser (ESM).
 *
 * ASSUMPTIONS (confirm with the Controller later):
 *   - A full vacation day = 8 hours; a half day = 4 hours.
 *   - Weeks are Monday-start (Mon..Sun), matching the timesheet's existing
 *     week boundary.
 *   - Alberta overtime for a week = the GREATER of (a) daily OT (hours over 8
 *     per day) or (b) weekly OT (hours over 44 per week) — never both, never
 *     double-counted.
 *   - Vacation is skipped on weekends (Saturday/Sunday) — standard work week.
 *   - Vacation is separate from worked/overtime hours.
 */

// Round to 2 decimals, killing FP noise.
export function round2(n) {
    return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

// Minimal-decimal display: round to 2dp, strip trailing zeros + trailing dot.
export function fmtHours(n) {
    const r = Number((Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100).toFixed(2));
    return String(r);
}

export function normalizeEmail(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
}

// Monday (YYYY-MM-DD) of the week containing dateStr. Mon = 0.
export function mondayOf(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// All calendar dates from a..b inclusive, as YYYY-MM-DD strings.
export function datesInclusive(a, b) {
    const out = [];
    const start = new Date(`${a}T12:00:00`);
    const end = new Date(`${b}T12:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;
    const cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const day = String(cur.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${day}`);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
}

// Alberta OT split. workedDays: [{date, workedH}] -> [{date, regular, overtime}].
export function computeEmployeeDays(workedDays) {
    // Normalize + sort by date ascending.
    const days = (workedDays || [])
        .map(d => ({ date: d.date, workedH: round2(d.workedH) }))
        .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

    // Seed each day with daily OT (over 8h).
    const rec = {}; // date -> {date, workedH, regular, overtime}
    for (const d of days) {
        const dailyOT = Math.max(0, d.workedH - 8);
        rec[d.date] = {
            date: d.date,
            workedH: d.workedH,
            dailyOT,
            overtime: dailyOT,
            regular: d.workedH - dailyOT,
        };
    }

    // Group days into Monday-start weeks.
    const weeks = {}; // monday -> [date...]
    for (const d of days) {
        const wk = mondayOf(d.date);
        (weeks[wk] = weeks[wk] || []).push(d.date);
    }

    for (const wk of Object.keys(weeks)) {
        const dates = weeks[wk].slice().sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        let sumWorked = 0, sumDailyOT = 0;
        for (const dt of dates) {
            sumWorked += rec[dt].workedH;
            sumDailyOT += rec[dt].dailyOT;
        }
        const weeklyOT44 = Math.max(0, sumWorked - 44);
        const weekOT = Math.max(sumDailyOT, weeklyOT44);
        let remaining = weekOT - sumDailyOT; // extra OT to distribute, >= 0
        if (remaining > 1e-9) {
            // Move regular -> OT from latest date to earliest.
            for (let i = dates.length - 1; i >= 0 && remaining > 1e-9; i--) {
                const r = rec[dates[i]];
                const add = Math.min(r.regular, remaining);
                r.overtime += add;
                r.regular -= add;
                remaining -= add;
            }
        }
    }

    return days.map(d => {
        const r = rec[d.date];
        return { date: r.date, regular: round2(r.regular), overtime: round2(r.overtime) };
    });
}

// Expand approved vacation requests into per-day hours.
// requests: [{name, email, startDate, endDate, halfStart, halfEnd}]
// window (optional): {from, to} — skip dates outside [from, to].
// -> [{name, email, date, hours}]
export function expandVacation(requests, window) {
    const out = [];
    for (const req of (requests || [])) {
        const dates = datesInclusive(req.startDate, req.endDate);
        for (const date of dates) {
            const dow = new Date(`${date}T12:00:00`).getDay(); // 0=Sun, 6=Sat
            if (dow === 0 || dow === 6) continue; // skip weekends
            if (window && window.from && date < window.from) continue;
            if (window && window.to && date > window.to) continue;
            let hours = 8;
            if (date === req.startDate && req.halfStart) hours = 4;
            if (date === req.endDate && req.halfEnd) hours = 4;
            out.push({ name: req.name, email: req.email, date, hours });
        }
    }
    return out;
}

// Approval gate. clockDays: [{name, email, date, workedSeconds, status}]
// -> { ok, unapproved:[{name, date, status}] }
export function checkApproval(clockDays) {
    const unapproved = [];
    for (const d of (clockDays || [])) {
        if (d.status !== 'approved') {
            unapproved.push({ name: d.name, date: d.date, status: d.status });
        }
    }
    return { ok: unapproved.length === 0, unapproved };
}

// Build the payroll model from approved clock days + expanded vacation days.
// -> [{ name, email, days:[{date,regular,overtime,vacation,total}], totals }]
export function buildPayrollModel({ clockDays, vacationDays }) {
    const people = {}; // emailKey -> {name, email, worked:{date:H}, vac:{date:H}}

    function ensure(email, name) {
        const key = normalizeEmail(email);
        if (!people[key]) {
            people[key] = { key, email, name: name || '', worked: {}, vac: {} };
        }
        // Prefer a non-empty clock name; fill name if missing.
        if (name && !people[key].name) people[key].name = name;
        return people[key];
    }

    for (const d of (clockDays || [])) {
        const p = ensure(d.email, d.name);
        const h = round2((d.workedSeconds || 0) / 3600);
        p.worked[d.date] = round2((p.worked[d.date] || 0) + h);
    }
    for (const v of (vacationDays || [])) {
        const p = ensure(v.email, v.name);
        // Only fall back to vacation name if no clock name set yet.
        if (v.name && !p.name) p.name = v.name;
        p.vac[v.date] = round2((p.vac[v.date] || 0) + (v.hours || 0));
    }

    const model = [];
    for (const key of Object.keys(people)) {
        const p = people[key];
        const workedDays = Object.keys(p.worked).map(date => ({ date, workedH: p.worked[date] }));
        const otByDate = {};
        for (const r of computeEmployeeDays(workedDays)) {
            otByDate[r.date] = r;
        }

        // Union of dates with worked hours OR vacation hours.
        const dateSet = {};
        Object.keys(p.worked).forEach(dt => { dateSet[dt] = true; });
        Object.keys(p.vac).forEach(dt => { dateSet[dt] = true; });
        const dates = Object.keys(dateSet).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

        const days = [];
        const totals = { regular: 0, overtime: 0, vacation: 0, total: 0 };
        for (const date of dates) {
            const split = otByDate[date] || { regular: 0, overtime: 0 };
            const regular = round2(split.regular);
            const overtime = round2(split.overtime);
            const vacation = round2(p.vac[date] || 0);
            const total = round2(regular + overtime + vacation);
            days.push({ date, regular, overtime, vacation, total });
            totals.regular = round2(totals.regular + regular);
            totals.overtime = round2(totals.overtime + overtime);
            totals.vacation = round2(totals.vacation + vacation);
            totals.total = round2(totals.total + total);
        }

        model.push({
            name: p.name || p.email || key,
            email: p.email,
            days,
            totals,
        });
    }

    model.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return model;
}

function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build the exact CSV string from the model.
export function toCsv(model) {
    const lines = ['Employee,Date,Regular Hours,Overtime,Vacation,Total Hours', ''];
    for (const emp of (model || [])) {
        for (const d of emp.days) {
            lines.push([
                csvCell(emp.name),
                csvCell(d.date),
                fmtHours(d.regular),
                fmtHours(d.overtime),
                fmtHours(d.vacation),
                fmtHours(d.total),
            ].join(','));
        }
        lines.push([
            'Total Hours',
            '',
            fmtHours(emp.totals.regular),
            fmtHours(emp.totals.overtime),
            fmtHours(emp.totals.vacation),
            fmtHours(emp.totals.total),
        ].join(','));
        lines.push('');
    }
    return lines.join('\n');
}

/* ============================================================================
 * Stage 2–4 additions (pure). See LOCKED BUILD CONTRACT section 2.
 * ========================================================================== */

// "HH:MM" -> minutes since midnight (int). Bad input -> 0.
function parseHHMM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return 0;
    const h = Number(m[1]);
    const mins = Number(m[2]);
    if (isNaN(h) || isNaN(mins)) return 0;
    return h * 60 + mins;
}

// Normalized department key for lookups.
function deptKey(dept) {
    return String(dept == null ? '' : dept).trim().toLowerCase();
}

function clamp01(n) {
    const x = Number(n) || 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

// Is this YYYY-MM-DD a weekday (Mon..Fri)?
function isWeekday(dateStr) {
    const dow = new Date(`${dateStr}T12:00:00`).getDay(); // 0=Sun, 6=Sat
    return dow !== 0 && dow !== 6;
}

// --- 2a. Breaks -----------------------------------------------------------

// splitBreaks(breakSeconds, paidBreakMinutes) -> { paidH, unpaidH }
// paid = min(break, paidBreakMinutes*60); unpaid = remainder. In hours, round2.
export function splitBreaks(breakSeconds, paidBreakMinutes) {
    const total = Math.max(0, Number(breakSeconds) || 0);
    const paidCap = Math.max(0, Number(paidBreakMinutes) || 0) * 60;
    const paidSec = Math.min(total, paidCap);
    const unpaidSec = total - paidSec;
    return { paidH: round2(paidSec / 3600), unpaidH: round2(unpaidSec / 3600) };
}

// Treat a clock day as "worked / counted" — status done or approved.
function isWorkedStatus(status) {
    return status === 'done' || status === 'approved';
}

// --- 2b. Totals model + CSV ----------------------------------------------

export function buildTotalsModel({ clockDays, vacationDays, paidBreakMinutes }) {
    const paidMin = Math.max(0, Number(paidBreakMinutes) || 0);
    const people = {}; // emailKey -> aggregate

    function ensure(email, name, department, team) {
        const key = normalizeEmail(email);
        if (!people[key]) {
            people[key] = {
                key,
                email,
                name: name || '',
                department: department || '',
                team: team || '',
                worked: {},      // date -> workedH
                paidBreak: 0,    // hours (per-day allotment applied, then summed)
                unpaidBreak: 0,  // hours
                vac: {},         // date -> vacationH
            };
        }
        const p = people[key];
        if (name && !p.name) p.name = name;
        if (department && !p.department) p.department = department;
        if (team && !p.team) p.team = team;
        return p;
    }

    for (const d of (clockDays || [])) {
        const p = ensure(d.email, d.name, d.department, d.team);
        const h = round2((d.workedSeconds || 0) / 3600);
        p.worked[d.date] = round2((p.worked[d.date] || 0) + h);
        // paid allotment applied per WORKED DAY, then summed.
        const split = splitBreaks(d.breakSeconds || 0, paidMin);
        p.paidBreak = round2(p.paidBreak + split.paidH);
        p.unpaidBreak = round2(p.unpaidBreak + split.unpaidH);
    }
    for (const v of (vacationDays || [])) {
        const p = ensure(v.email, v.name);
        if (v.name && !p.name) p.name = v.name;
        p.vac[v.date] = round2((p.vac[v.date] || 0) + (v.hours || 0));
    }

    // Per-person rows.
    const rows = [];
    for (const key of Object.keys(people)) {
        const p = people[key];
        const workedDays = Object.keys(p.worked).map(date => ({ date, workedH: p.worked[date] }));
        let regular = 0, overtime = 0;
        for (const r of computeEmployeeDays(workedDays)) {
            regular = round2(regular + round2(r.regular));
            overtime = round2(overtime + round2(r.overtime));
        }
        let vacation = 0;
        for (const dt of Object.keys(p.vac)) vacation = round2(vacation + round2(p.vac[dt]));
        const daysWorked = Object.keys(p.worked).filter(dt => p.worked[dt] > 0).length;
        const paidBreak = round2(p.paidBreak);
        const unpaidBreak = round2(p.unpaidBreak);
        const totalPaid = round2(regular + overtime + vacation + paidBreak);
        rows.push({
            name: p.name || p.email || key,
            email: p.email,
            department: p.department || '',
            team: p.team || '',
            regular, overtime, vacation,
            paidBreak, unpaidBreak, totalPaid, daysWorked,
        });
    }

    // Group by department (alpha), people by name.
    const byDept = {};
    for (const r of rows) {
        (byDept[r.department] = byDept[r.department] || []).push(r);
    }
    const deptNames = Object.keys(byDept).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

    const emptySub = () => ({ regular: 0, overtime: 0, vacation: 0, paidBreak: 0, unpaidBreak: 0, totalPaid: 0, daysWorked: 0 });
    const addInto = (acc, r) => {
        acc.regular = round2(acc.regular + r.regular);
        acc.overtime = round2(acc.overtime + r.overtime);
        acc.vacation = round2(acc.vacation + r.vacation);
        acc.paidBreak = round2(acc.paidBreak + r.paidBreak);
        acc.unpaidBreak = round2(acc.unpaidBreak + r.unpaidBreak);
        acc.totalPaid = round2(acc.totalPaid + r.totalPaid);
        acc.daysWorked += r.daysWorked;
    };

    const groups = [];
    const grand = emptySub();
    for (const dept of deptNames) {
        const ppl = byDept[dept].slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const subtotal = emptySub();
        for (const r of ppl) {
            addInto(subtotal, r);
            addInto(grand, r);
        }
        groups.push({ department: dept, people: ppl, subtotal });
    }

    return { groups, grand };
}

export function toTotalsCsv(model) {
    const header = 'Employee,Department,Regular,Overtime,Vacation,Paid Break,Unpaid Break,Total Paid,Days Worked';
    const lines = [header, ''];
    const m = model || { groups: [], grand: { regular: 0, overtime: 0, vacation: 0, paidBreak: 0, unpaidBreak: 0, totalPaid: 0, daysWorked: 0 } };
    for (const g of (m.groups || [])) {
        for (const p of g.people) {
            lines.push([
                csvCell(p.name),
                csvCell(p.department),
                fmtHours(p.regular),
                fmtHours(p.overtime),
                fmtHours(p.vacation),
                fmtHours(p.paidBreak),
                fmtHours(p.unpaidBreak),
                fmtHours(p.totalPaid),
                String(p.daysWorked),
            ].join(','));
        }
        lines.push([
            csvCell(`Subtotal — ${g.department}`),
            '',
            fmtHours(g.subtotal.regular),
            fmtHours(g.subtotal.overtime),
            fmtHours(g.subtotal.vacation),
            fmtHours(g.subtotal.paidBreak),
            fmtHours(g.subtotal.unpaidBreak),
            fmtHours(g.subtotal.totalPaid),
            String(g.subtotal.daysWorked),
        ].join(','));
        lines.push('');
    }
    lines.push([
        'Grand Total',
        '',
        fmtHours(m.grand.regular),
        fmtHours(m.grand.overtime),
        fmtHours(m.grand.vacation),
        fmtHours(m.grand.paidBreak),
        fmtHours(m.grand.unpaidBreak),
        fmtHours(m.grand.totalPaid),
        String(m.grand.daysWorked),
    ].join(','));
    return lines.join('\n');
}

// --- 2c. Individual timesheets -------------------------------------------

export function buildIndividualModel({ clockDays, vacationDays }) {
    const people = {}; // emailKey -> aggregate

    function ensure(email, name, department, team) {
        const key = normalizeEmail(email);
        if (!people[key]) {
            people[key] = {
                key,
                email,
                name: name || '',
                department: department || '',
                team: team || '',
                worked: {},   // date -> {workedH, breakH, clockIn, clockOut, status}
                vac: {},      // date -> vacationH
            };
        }
        const p = people[key];
        if (name && !p.name) p.name = name;
        if (department && !p.department) p.department = department;
        if (team && !p.team) p.team = team;
        return p;
    }

    for (const d of (clockDays || [])) {
        const p = ensure(d.email, d.name, d.department, d.team);
        const h = round2((d.workedSeconds || 0) / 3600);
        const breakH = round2((d.breakSeconds || 0) / 3600);
        const ex = p.worked[d.date];
        if (ex) {
            ex.workedH = round2(ex.workedH + h);
            ex.breakH = round2(ex.breakH + breakH);
            if (!ex.clockIn && d.clockInLabel) ex.clockIn = d.clockInLabel;
            if (!ex.clockOut && d.clockOutLabel) ex.clockOut = d.clockOutLabel;
            if (d.status) ex.status = d.status;
        } else {
            p.worked[d.date] = {
                workedH: h,
                breakH,
                clockIn: d.clockInLabel || '',
                clockOut: d.clockOutLabel || '',
                status: d.status || '',
            };
        }
    }
    for (const v of (vacationDays || [])) {
        const p = ensure(v.email, v.name);
        if (v.name && !p.name) p.name = v.name;
        p.vac[v.date] = round2((p.vac[v.date] || 0) + (v.hours || 0));
    }

    const model = [];
    for (const key of Object.keys(people)) {
        const p = people[key];
        const workedDays = Object.keys(p.worked).map(date => ({ date, workedH: p.worked[date].workedH }));
        const otByDate = {};
        for (const r of computeEmployeeDays(workedDays)) otByDate[r.date] = r;

        const dateSet = {};
        Object.keys(p.worked).forEach(dt => { dateSet[dt] = true; });
        Object.keys(p.vac).forEach(dt => { dateSet[dt] = true; });
        const dates = Object.keys(dateSet).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

        const days = [];
        const totals = { worked: 0, breakH: 0, regular: 0, overtime: 0, vacation: 0, total: 0 };
        for (const date of dates) {
            const w = p.worked[date];
            const split = otByDate[date] || { regular: 0, overtime: 0 };
            const regular = round2(split.regular);
            const overtime = round2(split.overtime);
            const vacation = round2(p.vac[date] || 0);
            const worked = round2(w ? w.workedH : 0);
            const breakH = round2(w ? w.breakH : 0);
            const total = round2(regular + overtime + vacation);
            days.push({
                date,
                clockIn: w ? (w.clockIn || '') : '',
                clockOut: w ? (w.clockOut || '') : '',
                worked,
                breakH,
                vacation,
                regular,
                overtime,
                total,
                status: w ? (w.status || '') : '',
            });
            totals.worked = round2(totals.worked + worked);
            totals.breakH = round2(totals.breakH + breakH);
            totals.regular = round2(totals.regular + regular);
            totals.overtime = round2(totals.overtime + overtime);
            totals.vacation = round2(totals.vacation + vacation);
            totals.total = round2(totals.total + total);
        }

        model.push({
            name: p.name || p.email || key,
            email: p.email,
            department: p.department || '',
            days,
            totals,
        });
    }

    model.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return model;
}

export function toIndividualCsv(model) {
    const lines = [];
    const list = model || [];
    for (let i = 0; i < list.length; i++) {
        const emp = list[i];
        lines.push(csvCell(`${emp.name} — ${emp.department}`));
        lines.push('');
        lines.push('Date,Clock In,Clock Out,Worked,Break,Regular,Overtime,Vacation,Total');
        for (const d of emp.days) {
            lines.push([
                csvCell(d.date),
                csvCell(d.clockIn),
                csvCell(d.clockOut),
                fmtHours(d.worked),
                fmtHours(d.breakH),
                fmtHours(d.regular),
                fmtHours(d.overtime),
                fmtHours(d.vacation),
                fmtHours(d.total),
            ].join(','));
        }
        lines.push([
            'Total',
            '',
            '',
            fmtHours(emp.totals.worked),
            fmtHours(emp.totals.breakH),
            fmtHours(emp.totals.regular),
            fmtHours(emp.totals.overtime),
            fmtHours(emp.totals.vacation),
            fmtHours(emp.totals.total),
        ].join(','));
        lines.push('');
    }
    return lines.join('\n');
}

// --- 2d. Expected shift + KPIs -------------------------------------------

export function expectedShiftFor(person, settings) {
    const s = settings || {};
    const p = person || {};
    // Per-person override.
    if (p.expected_start != null && p.expected_start !== '' && p.expected_hours != null) {
        return { startMin: parseHHMM(p.expected_start), hours: Number(p.expected_hours) || 0 };
    }
    // Department shift.
    const shifts = s.department_shifts || {};
    const key = deptKey(p.department);
    if (key && shifts[key]) {
        return { startMin: parseHHMM(shifts[key].start), hours: Number(shifts[key].hours) || 0 };
    }
    // Default.
    const def = s.default_shift || { start: '08:00', hours: 8 };
    return { startMin: parseHHMM(def.start), hours: Number(def.hours) || 0 };
}

export function computeKpis({ clockDays, vacationDays, settings, period }) {
    const s = settings || {};
    const grace = Number(s.grace_minutes != null ? s.grace_minutes : 5) || 0;
    const paidBreakMin = Number(s.paid_break_minutes) || 0;
    const unpaidLunchMin = Number(s.unpaid_lunch_minutes != null ? s.unpaid_lunch_minutes : 30) || 0;
    const allottedBreak = paidBreakMin + unpaidLunchMin;
    const per = period || {};

    // expectedWorkdays = count of Mon–Fri dates in [from,to].
    let expectedWorkdays = 0;
    if (per.from && per.to) {
        for (const dt of datesInclusive(per.from, per.to)) {
            if (isWeekday(dt)) expectedWorkdays++;
        }
    }

    const people = {}; // emailKey -> aggregate

    function ensure(email, name, department, team, person) {
        const key = normalizeEmail(email);
        if (!people[key]) {
            people[key] = {
                key, email,
                name: name || '',
                department: department || '',
                team: team || '',
                person: person || {},
                byDate: {},   // date -> {workedSeconds, breakSeconds, clockInMin, clockOutMin}
                vac: {},      // date -> vacation hours
            };
        }
        const p = people[key];
        if (name && !p.name) p.name = name;
        if (department && !p.department) p.department = department;
        if (team && !p.team) p.team = team;
        return p;
    }

    for (const d of (clockDays || [])) {
        if (!isWorkedStatus(d.status)) continue;
        const p = ensure(d.email, d.name, d.department, d.team, d);
        const cur = p.byDate[d.date] || { workedSeconds: 0, breakSeconds: 0, clockInMin: null, clockOutMin: null };
        cur.workedSeconds += (d.workedSeconds || 0);
        cur.breakSeconds += (d.breakSeconds || 0);
        if (d.clockInMin != null) cur.clockInMin = cur.clockInMin == null ? d.clockInMin : Math.min(cur.clockInMin, d.clockInMin);
        if (d.clockOutMin != null) cur.clockOutMin = cur.clockOutMin == null ? d.clockOutMin : Math.max(cur.clockOutMin, d.clockOutMin);
        // carry per-person override fields onto person record
        if (d.expected_start != null && p.person.expected_start == null) p.person.expected_start = d.expected_start;
        if (d.expected_hours != null && p.person.expected_hours == null) p.person.expected_hours = d.expected_hours;
        p.byDate[d.date] = cur;
    }
    for (const v of (vacationDays || [])) {
        const p = ensure(v.email, v.name);
        if (v.name && !p.name) p.name = v.name;
        p.vac[v.date] = round2((p.vac[v.date] || 0) + (v.hours || 0));
    }

    const peopleOut = [];
    for (const key of Object.keys(people)) {
        const p = people[key];
        const personRec = Object.assign({ department: p.department }, p.person, { department: p.department });
        const shift = expectedShiftFor(personRec, s);
        const startMin = shift.startMin;
        const shiftHours = shift.hours;

        const workedDates = Object.keys(p.byDate).filter(dt => p.byDate[dt].workedSeconds > 0);
        const daysWorked = workedDates.length;

        let totalSeconds = 0;
        for (const dt of workedDates) totalSeconds += p.byDate[dt].workedSeconds;
        const totalHours = round2(totalSeconds / 3600);

        // regular/overtime from computeEmployeeDays
        const workedDays = workedDates.map(dt => ({ date: dt, workedH: round2(p.byDate[dt].workedSeconds / 3600) }));
        let regular = 0, overtime = 0;
        for (const r of computeEmployeeDays(workedDays)) {
            regular = round2(regular + round2(r.regular));
            overtime = round2(overtime + round2(r.overtime));
        }

        const otPct = totalHours > 0 ? round2(100 * overtime / totalHours) : 0;
        const avgHoursPerDay = daysWorked > 0 ? round2(totalHours / daysWorked) : 0;

        // vacationDays = distinct weekday dates with vacation hours>0 in period
        let vacDaysCount = 0;
        for (const dt of Object.keys(p.vac)) {
            if (p.vac[dt] > 0 && isWeekday(dt)) {
                if (!per.from || dt >= per.from) {
                    if (!per.to || dt <= per.to) vacDaysCount++;
                }
            }
        }

        const absences = Math.max(0, expectedWorkdays - daysWorked - vacDaysCount);

        // lateStarts / earlyOuts / onTimePct
        let lateStarts = 0, earlyOuts = 0;
        let daysWithIn = 0, daysWithInNotLate = 0;
        const endMin = startMin + shiftHours * 60;
        for (const dt of workedDates) {
            const rec = p.byDate[dt];
            if (rec.clockInMin != null) {
                daysWithIn++;
                const late = rec.clockInMin > startMin + grace;
                if (late) { lateStarts++; } else { daysWithInNotLate++; }
            }
            if (rec.clockOutMin != null && rec.clockOutMin < endMin - grace) {
                earlyOuts++;
            }
        }
        const onTimePct = daysWithIn > 0 ? round2(100 * daysWithInNotLate / daysWithIn) : 100;

        // avgBreakMin
        let totalBreakSec = 0;
        for (const dt of workedDates) totalBreakSec += p.byDate[dt].breakSeconds;
        const avgBreakMin = daysWorked > 0 ? round2((totalBreakSec / 60) / daysWorked) : 0;

        // breakAdherencePct: worked days where breakMinutes <= allottedBreak + grace, over worked days (100 if 0 worked)
        let adherent = 0;
        for (const dt of workedDates) {
            const breakMinutes = p.byDate[dt].breakSeconds / 60;
            if (breakMinutes <= allottedBreak + grace) adherent++;
        }
        const breakAdherencePct = daysWorked > 0 ? round2(100 * adherent / daysWorked) : 100;

        const attendanceRate = expectedWorkdays > 0 ? clamp01(1 - absences / expectedWorkdays) : 1;
        const reliability = Math.round(100 * (0.5 * onTimePct / 100 + 0.4 * attendanceRate + 0.1 * breakAdherencePct / 100));

        peopleOut.push({
            name: p.name || p.email || key,
            email: p.email,
            department: p.department || '',
            team: p.team || '',
            daysWorked,
            totalHours,
            regular,
            overtime,
            otPct,
            expectedWorkdays,
            vacationDays: vacDaysCount,
            absences,
            lateStarts,
            earlyOuts,
            onTimePct,
            avgHoursPerDay,
            avgBreakMin,
            breakAdherencePct,
            reliability,
        });
    }

    peopleOut.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // Team rollup.
    const headcount = peopleOut.length;
    let tTotalHours = 0, tRegular = 0, tOvertime = 0, tAbsences = 0, tOnTimeSum = 0, tReliabilitySum = 0;
    for (const p of peopleOut) {
        tTotalHours = round2(tTotalHours + p.totalHours);
        tRegular = round2(tRegular + p.regular);
        tOvertime = round2(tOvertime + p.overtime);
        tAbsences += p.absences;
        tOnTimeSum += p.onTimePct;
        tReliabilitySum += p.reliability;
    }
    const team = {
        totalHours: tTotalHours,
        regular: tRegular,
        overtime: tOvertime,
        otPct: tTotalHours > 0 ? round2(100 * tOvertime / tTotalHours) : 0,
        onTimePct: headcount > 0 ? round2(tOnTimeSum / headcount) : 0,
        absences: tAbsences,
        reliability: headcount > 0 ? round2(tReliabilitySum / headcount) : 0,
        headcount,
    };

    return { people: peopleOut, team };
}

// --- 2e. Productivity (Stage 4) ------------------------------------------

export function computeProductivity({ outputByTeam, labourHoursByTeam }) {
    const out = outputByTeam || {};
    const labour = labourHoursByTeam || {};
    const teamSet = {};
    Object.keys(out).forEach(t => { teamSet[t] = true; });
    Object.keys(labour).forEach(t => { teamSet[t] = true; });
    const teams = Object.keys(teamSet).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

    return teams.map(team => {
        const o = out[team] || {};
        const units = Number(o.units) || 0;
        const unitLabel = o.unitLabel || '';
        const labourHours = round2(Number(labour[team]) || 0);
        const perHour = labourHours > 0 ? round2(units / labourHours) : 0;
        return { team, units, unitLabel, labourHours, perHour };
    });
}
