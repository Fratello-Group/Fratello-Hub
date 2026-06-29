# Time Tracker → Next Level: payroll-grade export + production KPIs

**Status:** Idea / scoping · **Owner:** Chris · **Replaces/augments:** QuickBooks Time (TSheets)
**Goal:** (1) let the Controller download a payroll CSV in the *exact* format he uses today, and
(2) give the Production Manager a way to see KPIs and grade/score his team.

---

## 1. The payroll CSV the Controller needs — match it EXACTLY

Sample: `employee_hours_by_day_20260608_thru_20260621.csv`

**Columns:** `Employee, Date, Regular Hours, Overtime, Vacation, Total Hours`

**Layout:**
- Header row, then a blank row.
- Per employee: one row per worked day (`Name, YYYY-MM-DD, regular, OT, vacation, total`).
- A subtotal row per employee: `Total Hours,,<regSum>,<otSum>,<vacSum>,<totalSum>`.
- A blank row between employees.

**Rules observed in the data:**
- `Total = Regular + Overtime + Vacation`.
- **Daily overtime:** regular is capped at 8.00/day; hours over 8 go to Overtime (e.g. Luke 06-08 = 8 reg + 0.63 OT = 8.63). (Alberta is the *greater of* daily >8 or weekly >44 — confirm which rule payroll wants.)
- **Vacation** comes from approved time off and shows on that day (e.g. Allana 06-19 = 4.11 worked + 4 vacation = 8.11).

**Build:** a "Payroll — Hours by Day (CSV)" export on the manager/Controller timesheet that produces this byte-for-byte for a chosen pay period. **Gate on approval** — QuickBooks blocks payroll export until everyone's time is approved ("Some team members have not had time approved… re-run to enable export"). We should do the same.

---

## 2. Extra nuance to capture (inspired by the QuickBooks Time payroll report)

The QB report tracks more than worked hours. Top-line tiles: **Straight, Regular, Time Off, Overtime, Total Paid Hours, Unpaid Time Off, Paid Breaks, Unpaid Breaks.** Per person it shows a department label (Warehouse/Admin/Packaging/Roasting) and four numbers (regular, time off, total, paid breaks). Three exports: **Payroll Totals · Payroll by Day (CSV) · Individual Timesheets (CSV).**

| Field | Have today | Add |
|---|---|---|
| Worked hours / clock in-out | ✅ | — |
| Breaks (time on break) | ✅ tracked | split **paid vs unpaid** |
| Overtime | ❌ | auto-calc (daily >8 / weekly >44) |
| Vacation / time off (paid + unpaid) | partial (time-off tool) | **merge into the timesheet** per day |
| Pay-period totals per person | ❌ | add |
| Department grouping + subtotals | ❌ | add |
| Approval gating before export | ✅ approve exists | **enforce** before payroll export |
| Export variants | 1 (per-punch CSV) | Payroll Totals · By Day · Individual |

---

## 3. Production Manager KPIs + grading (for Kyle)

Turn the punch data into management signal — a manager view (Kyle / Owner / Controller):

**Computed (objective), per person per period**
- Total hours · regular vs OT · **OT %**
- Days worked · **absences**
- **Late starts / early clock-outs** (needs an expected start — see dependency)
- **Break adherence** (over/under the allotted break)
- **Attendance/reliability score** (composite of the above)

**Manager grading (subjective)**
- Kyle rates each team member per pay period on a small rubric (e.g. attendance, punctuality, quality, attitude) — 1–5 or A–F — with a short note. Stored and trended over time, so reviews are data-backed.

**KPI tiles for Kyle's dashboard:** on-time %, avg hours/day, OT %, absences, team reliability — filterable by his three teams (Roasting / Packaging / Warehouse).

---

## Honest notes / dependencies

- **Punctuality needs an "expected start."** They don't use Schedule today. Rather than build a full scheduler, add a **lightweight "expected shift"** (start time + length) per person or per department — enough to flag late/early without scheduling overhead.
- **Productivity KPIs** (output per hour — bags packed, batches roasted) need production-output data we don't capture yet. Defer to a later stage / tie into a future production-log tool.
- **Reconcile names with payroll.** QuickBooks shows spellings/people that differ from our roster: `Jaeoh Park` (= Kyle Park?), `Christopher McGhee` (Chris McGhee), `Sandra Mestre Quintero` (Sandra Mestre), `Monica Banman` (vs Monica Lynn), and `Tatum Olsen` (not in our roster). Align the roster so the CSV matches payroll exactly.

---

## Suggested staging

1. **Stage 1 — the exact payroll CSV.** Hours-by-day export matching the sample + daily OT calc + vacation merge + approval gating. Solves the Controller's immediate need; lets us stop relying on QuickBooks for the export.
2. **Stage 2 — full payroll nuance.** Paid/unpaid breaks, paid/unpaid time off, per-department subtotals, the three export variants.
3. **Stage 3 — manager KPIs + grading.** Kyle's dashboard, computed attendance metrics, the grading rubric, and a light "expected shift" for punctuality.
4. **Stage 4 — productivity.** Output-based KPIs once we capture production output.
