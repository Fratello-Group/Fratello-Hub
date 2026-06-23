# Fratello Food Safety (CFIA / HACCP) — Build Blueprint

_Generated 2026-06-23 from a full read of all 333 files in `~/Desktop/Fratello/CFIA/`._
_Companion data: [`document-inventory.json`](../config/document-inventory.json) (the machine-readable list)._

## 1. What we're building
One **Food Safety module inside the existing Fratello Ops Hub** — same login, brand, and header — that centralises the whole CFIA / SFCR program: reference documents you read, fillable records people complete, and training that must be passed. Every record is saved, time-stamped, locked, and exportable as clean PDF for an auditor.

## 2. The real numbers (from the catalogue)
- **333 files** on disk → **178 are department-binder copies/duplicates** → **155 unique documents.**
- Split: **67 reference** (SOP / policy / plan, read-only) · **40 "fillable"** · **13 training / quiz** · plus reports, org chart, HR agreements.
- **Important nuance:** that "40 fillable" includes ~22 HR / government items (employee agreements, TD1 tax forms, direct deposit, per-person "team expectations"). Those are **not food-safety records** and should **not** be rebuilt as native forms — we link or store them in HR. The **true CFIA record-forms to build natively are ~18–20**, e.g. Pre-Op 6.3a, Facility Inspections 6.9/6.10, Visitor Log 6.8a, HIRA 11.1a/11.2, Incoming Inspection 11.1c, Complaint 9.3a/9.3b, Hold 9.4, Disposition 9.2, Injury 8.6a, Training Acknowledgment 8.3a, Quizzes 8.4/8.5/GMP, Recall sheet, Program Review 1.2.
- This matches the handoff's "~150 docs" estimate. **No surprises — the scope is real and bounded.**

## 3. The two rules that never bend (audit spine)
1. **Records are immutable.** Once submitted, a log can never be edited or deleted (enforced in `firestore.rules`, not just the screen). A correction is a *new* record linked to the one it fixes.
2. **Reference docs are version-controlled.** Each SOP keeps an owner, version, effective date, and next-review date; revising one is a logged event that retains all prior versions.

## 4. Customisability — the part Chris cares about most
- **One control file = the whole look.** Fonts, colours, sizes, spacing live in a single design-tokens file (`/system/design-tokens/tokens.css`). Every document and form reads from it. Change it once → all ~155 update instantly. (Foundation task: consolidate the pilot's styles so this is literally true from doc #1.)
- **Content is config, not code.** Reference docs live in `config/reference-registry.js`; forms in `config/form-schemas.js`; the full list in `config/document-inventory.json`. **Adding doc #151 is a config entry, never a new coded page.**
- **Stable codes = permalinks + auto cross-links.** Every doc keeps its Fratello code (SOP 6.3, Form 6.3a) → a permanent web address → built-in clickable links between related docs (and from the systems map).

## 5. Screen types (six; build each once, reuse everywhere)
| Screen | Purpose | Status |
|---|---|---|
| Systems map / Document Hub | See & reach any doc, by section + type | map drafted (this turn) |
| Reading document | Read a controlled SOP/policy/plan | ✅ pilot (SOP 6.3) |
| Fillable form | Complete a record → immutable save | ✅ pilot (Form 6.3a) |
| Records / manager view | Review submissions, export PDF | ✅ pilot |
| Training module | Read + quiz, pass to complete | to build |
| Audit Mode | Filter + one-click PDF of any slice | to build |
| (Personal "what's due" dashboard) | Each person's overdue/upcoming | to build |

## 6. Roles
Owner-only now (pilot). Then: `staff → supervisor → manager → owner`, plus a `safetyOfficer` flag (Kyle) for Audit Mode and document revisions. The Firestore rules already allow signed-in staff to submit records; we widen the UI when ready.

## 7. Build order (do NOT crank out 150 at once)
1. **Lock the foundation** — consolidate to the one design-tokens file; confirm data shapes + rules (mostly done via the pilot).
2. **Section 6 daily records** end-to-end (Pre-Op done; add Facility Interior/Exterior, Sanitation) + their SOPs. Highest daily use = best test.
3. **Roll out reference SOPs section by section** as registered reading pages — fast, pure config (67 docs).
4. **Core CFIA record-forms** (the ~18–20): HIRA 11.x, complaints/hold 9.x, injury 8.6a, recall sheet, program review 1.2, incoming 11.1c.
5. **Training modules** (quiz-gated): HACCP 8.4, Hygiene 8.5, GMP.
6. **Audit Mode + personal dashboard.**
7. **HR / government forms:** keep as-is (link/store), do not rebuild.

## 8. Two cleanups the catalogue surfaced (quick, human)
- Separate blank **templates** from already-**filled instances** (e.g. the per-person "Team Expectations" and signed employee agreements are instances, not forms to digitise).
- Decide where HR/payroll docs live (likely the HR area, not CFIA).

## 9. Pre-launch
Before staff go live, do a **one-time admin reset** of `cfia_records` so the official history starts clean (test entries are immutable by design and can't be removed in-app).
