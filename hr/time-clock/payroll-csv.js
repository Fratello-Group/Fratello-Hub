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
