# CFIA Module — Plan of Attack (structural logic v2)

_Captures Chris's 9 structural requirements (2026-06-23) with the architecture decisions and the Packaging-first build. Builds on [BLUEPRINT.md](BLUEPRINT.md)._

---

## The big idea that ties it together
A document is stored **once** (single source of truth) and **tagged** with the departments it applies to, its type, its version, and its schedule. Everything else — the department binders, the systems map, each person's required list, the daily/weekly tasks, the manager sign-offs — is just a **view or a computation over that one tagged set**. Nothing is duplicated; nothing drifts.

---

## The 9 requirements → decisions

### 1. Version-control everything (+ "approved by")
Every reference doc and every form carries: `version` (everything today = **v1**), `effectiveDate`, `approvedBy` (a named person), `approvedDate`, `status: Controlled`, `nextReviewDate`. Future edits bump the version through a **logged revision event** that keeps all prior versions. Records already capture the `formVersion` in force when submitted; acknowledgements capture the doc `version` read — so when a doc is revised, the system knows who must **re-acknowledge**.

### 2. Onboarding wizard → personal dashboard
Flow (reuses the Hub's existing invite + Firebase login): **invite → person signs in / sets password → onboarding wizard → personal dashboard.** The wizard collects what we need (name, role, **department**, start date, acknowledgements) and lands them on a dashboard that explains what the system is and shows their tasks. Department + role chosen here **drive everything they see** (their required-set).

### 3. Training & retraining schedule + tracking
- A **training registry**: each module/quiz has who-it's-required-for (by dept/role), a **pass threshold (default 90%)**, and a **recurrence** (e.g. annual → `expiresAt`).
- Completions are **immutable**: quiz score + date + version, stored forever, auto-expiring on cadence. Reading docs records an **acknowledgement** (read + understood, dated, versioned).
- **Compliance is computed, never stored**: per person, each required item is `done / due-soon / overdue / not-started`.
- Visible on **three levels**: the person's own dashboard; the **department head's** team view; **Kyle (QA) + owners** see everyone. Kyle can spot who needs a module or is due to retrain and follow up.

### 4. One canonical doc, tagged by department (de-duplication)
The catalogue found **178 duplicate copies** across the department binders. Decision: **one record per code** (SOP 6.3 exists once), with `departments: [...]` ("all" = company-wide). The department binders become **filtered views**, not copies. The binder's Table of Contents literally **becomes that department's required-set** — one list driving both the binder view and the training requirements. This kills version drift, which is the #1 thing a CFIA auditor probes ("is this the current version everywhere?").

### 5. Department filtering — fast and obvious
The systems map (and a menu) filter by **department**. A roaster signs in → taps **Roasting** → sees only their docs, grouped by type. Every doc is one click from "company-wide / my department." This is the primary navigation for floor staff.

### 6. Document types within each department (the section structure)
Observed pattern (from the Packaging folder), used to auto-organize every department page:
- **Job descriptions** (role-specific)
- **Workplace conduct policies** (drug & alcohol, harassment — company-wide)
- **SOPs & procedures** (by PCP section)
- **Forms & logs** (the records)
- **Training** (quizzes + presentations)
- **Manuals** (machines — see #9)
- **HR forms** (vacation/leave — link to the existing Hub area)

A department only shows the type-groups it actually has (config-driven from tags) — so structures can differ (roasting has roaster manuals; warehouse has shipping logs) without separate code.

### 7. Table of contents + mini systems-map in every area
A **reusable component** baked into the page template: every department/section page opens with its **TOC + a mini search/filter map**. The same map component powers the whole-program view and each department — built once, present everywhere.

### 8. Scheduling + the verification chain (audit-critical)
Recurring items carry a **cadence** (daily / weekly / monthly / annual). The system computes what's **due** from cadence + last-completed (no stored state to drift). Three tiers, each an immutable record:
1. **Staff** — dashboard shows "due today" (e.g. Pre-Op 6.3a each morning); they complete + record, then work.
2. **Department head** — dashboard reminds them to **verify + sign off** that their team's records were done properly (daily/weekly). The sign-off is itself a permanent record.
3. **Kyle (QA) + owners** — an oversight dashboard folds it all together; weekly/monthly they confirm the dept heads verified, and see anything **undone or flagged**.

> Expert note: CFIA wants evidence of **documented supervisory oversight**, not just that a form was filled. This sign-off chain is exactly that evidence — so it's a first-class, structural feature, not a bolt-on.

### 9. Manuals — linked where needed + one searchable home
Manuals (machine/equipment) are a **document type**, tagged by department + equipment. They're **cross-linked from inside the relevant SOP** ("Probat G120 manual →") *and* collected in a dedicated **Manuals library**, searchable/filterable by department and machine.

---

## Data-model additions (on top of the pilot)
- **Reference registry** per doc: `departments[]`, `docType`, `version`, `approvedBy`, `effectiveDate`, `nextReviewDate`, `equipment?`, `manualUrl?`, `related[]`.
- **Forms**: `departments[]`, `cadence`, `requiredFor[]`.
- **Config**: `departments.js`, `required-sets.js` (per dept/role: read+acknowledge list, quizzes, recurring records), `training-registry.js`, `manuals` entries.
- **Firestore**: `cfia_records` (have) + manager **verification** sign-offs (own immutable records, linked to the records/day they cover); training completions + acknowledgements embedded in the user profile (timestamps, versions, scores) per handoff §5.1.
- **Profiles**: `department`, `role`, embedded compliance.
- A registry doc may carry `rebuild: false` + `link: '<hub url>'` — it then renders in the department view as a **link to an existing Hub tool**, not a native CFIA form.

## Reuse existing Hub tools — do NOT rebuild (Chris, 2026-06-23)
Some documents in the CFIA folder duplicate functionality the Fratello Hub already has. We **link** to the existing tool instead of rebuilding it:
- **Vacation & Leave Request Form** → the Hub's **Time Off** tool (`/hr/time-off/vacation-tracker.html`, `/hr/time-off/sick-day-logger.html`). Do not build a CFIA version.
- Likely also: **expense** anything → the Hub's Expense Reimbursement.
- **HR / government forms** (TD1, direct deposit, employee agreements, GroupSource) → stay in HR; link or store, don't rebuild.
- **Action for the build:** before creating any native form, check the inventory against existing Hub features; if it already exists, set `rebuild: false` + `link`. I'll run a one-pass redundancy sweep over the ~40 "fillable" items as part of the foundation.

## Dashboards (four lenses, one engine)
1. **Staff** — "what I must do today / this week" + my training status.
2. **Department head** — my team's completion + **what I must verify & sign off**.
3. **Kyle (QA / safety officer)** — everyone, every department: overdue, unverified, due-for-retraining.
4. **Owner** — the QA view plus program-level health.

---

## First full build-out: PACKAGING (the template for all departments)
Built in this order, piece by piece:

1. **Foundation reshape** — add `departments` + `docType` + version/`approvedBy` to the registry; create `departments.js`, `required-sets.js`; consolidate styling into the **one** design-tokens file (so a rebrand is one edit). Build the **canonical, de-duplicated Packaging set** from the binder TOC (~30 docs tagged `packaging`).
2. **Reusable department page** — `/cfia/department.html?dept=packaging`: header → TOC → mini search/filter map → type-grouped docs (job descriptions, conduct policies, SOPs, forms, training, manuals).
3. **Packaging reference docs** — register Packaging's SOPs/policies as controlled reading pages (config entries; SOP 6.3 already live).
4. **Packaging records** — the forms Packaging completes (Pre-Op 6.3a live; add the others they need).
5. **Onboarding wizard + Packaging team-member dashboard** — invite → wizard → personal dashboard showing required reading, quizzes, and daily tasks with status.
6. **Training** — Packaging quizzes (HACCP 8.4, Hygiene 8.5, GMP) quiz-gated at 90%, dated + recorded.
7. **Scheduling + verification** — daily Pre-Op due → staff completes → **Packaging dept head signs off** → **Kyle oversight**. Build the three dashboards.
8. **Manuals** — Packaging machine manuals, cross-linked from SOPs + in the Manuals library.

Once Packaging works end-to-end, Roasting and Warehouse are **config, not new code**.

## Defaults I'm assuming (tell me if any are wrong)
- Departments: **Roasting, Packaging, Warehouse** (+ "Company-wide"). Add Office/QA/Receiving later if needed.
- Quiz pass mark: **90%**.
- Conduct policies (drug/alcohol, harassment) live **inside the module** as company-wide required reading (acknowledged), not just HR.
- Department head for Packaging is its supervisor; **Kyle** is QA/safety-officer over all; owners see all.

## Newly contemplated elements (from the gap hunt — full list in [GAP-BACKLOG.md](GAP-BACKLOG.md): 26 High / 21 Medium / 4 Low)
Four expert lenses surfaced elements we hadn't planned. The **[foundation]** items must shape the data model *before/while* we build forms + scheduling (cheap now, expensive later):

- **[foundation] Equipment registry as a first-class entity** (`cfia_equipment`): records & manuals reference an `equipmentId`, not a free-text "area". Enables per-machine history, the right manual, retire/replace.
- **[foundation] Firebase Storage + `storage.rules` + photo-evidence field** in the form engine (camera → compressed image → immutable record). Add to the auto-deploy alongside firestore.rules.
- **[foundation] Sign-off / verification as its own immutable collection** (`cfia_signoffs`: tier supervisor|qa, covers date-range + form/dept, links recordIds) with rules — the 3-tier chain is a record type, not just a screen. Plus **separation of duties** (you can't verify your own record).
- **[foundation] Field-level validation in the create rule** (required keys/types/enums) — a malformed immutable record is forever; validate at write time.
- **[foundation] Timezone anchor (America/Edmonton)** for all "due today"/cadence math (replace browser-local `isoToday`).
- **[foundation] Training/acknowledgement storage** = a collection (immutable, score+date+version+expiresAt), not embedded in the mutable profile.
- **CCP critical-limit monitoring + deviation** record type (roast temp probe, magnet/screen, destoner) with automatic out-of-limit flagging.
- **CAPA register** (corrective/preventive actions) any record/complaint/deviation can spawn → owner, due date, verified close-out; overdue surfaces to QA/owner.
- **Supplier controls**: approved-supplier list + Letters of Guarantee / allergen statements / COAs with expiry auto-flagging; incoming inspection tied to lot numbers.
- **Equipment calibration & PM scheduling** as due/overdue (scale 7.2a quarterly, temp-probe verification, magnet monthly) — a CCP reading is only valid if the device is calibrated.
- **Internal-audit + management-review scheduler** (SOP 1.2/1.3); **document change-control workflow** (draft→review→approve→publish + reason) feeding **re-acknowledgement campaigns** when a version bumps.
- **Overdue escalation engine** + **department-head coverage/delegation** (route to backup/Kyle when away, tied to Time Off).
- **Notification delivery** wired to the existing Resend + cron (overdue, unverified sign-offs, re-ack required) — dashboards alone reach only those who log in.
- **Floor UX**: offline/weak-wifi queue+sync, **multi-language (English/Spanish)**, shared-station/kiosk staff-picker, bulk "all pass / not in use", accidental/double-submit safeguards, big glove-friendly targets, shift-start "today's forms" launcher, QR-to-SOP.
- **Records retention policy + export-all/backup**; **append-only system audit log** (revisions, exports, role changes); **offboarding** path; **server-paginated** records query; **contractor/visitor** lightweight model (Visitor Log 6.8a); **owner KPI/health report**.

These don't block steps 1–2 (navigation), but the **[foundation]** ones should be settled before the forms/scheduling build so we don't rework immutable data.
