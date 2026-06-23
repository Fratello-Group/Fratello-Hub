# CFIA module — data model

How the Food Safety module is wired. Two kinds of data: **config** (static files in the
repo that define the program) and **records** (immutable entries in Firestore that people
create). Reference docs are read-mostly; records are append-only and never edited.

## Config files (`cfia/config/`) — the program definition
| File | Holds | Read by |
|---|---|---|
| `document-register.js` | Every document: `code, title, docType, departments[], version, approvedBy, effectiveDate, cadence, fillable, related[], href` (+ optional `rebuild/link`). | department pages, System Map, viewer, Document Control |
| `form-schemas.js` | Every form's field schema (`FORM_SCHEMAS[code]`). | the form engine / `form.html` |
| `departments.js` | Departments + the document-type grouping order. | department pages, filters |
| `people.js` | The roster + role model (`hubProfile`, `cfiaTier`, `safetyOfficer`, `reportsTo`) from the org chart. | role model / sign-off rules (when wired) |
| `equipment.js` | Machine registry seed (`EQUIPMENT[]`). | maintenance records, manuals (when wired) |
| `quizzes.js` | Training quiz content (`QUIZZES[code]`). | the training module (when wired) |

Reference document **text** lives separately as HTML fragments in
`cfia/reference/content/<code>.html`, loaded on demand by the viewer.

## Firestore collections — the records (immutable)
| Collection | What | Rule intent |
|---|---|---|
| `cfia_records` | **LIVE.** Every completed form. Fields: `form_code, form_title, sop_code, form_version, record_id, values{}, performed_by_name, performed_by_is_self, submitted_by_uid, submitted_by_email, submitted_by_name, submitted_at, department, supersedes, created_via`. | create-only; `update:false; delete:false`; submitter stamps self + server time. A correction is a NEW record with `supersedes` set. |
| `cfia_signoffs` | **STAGED.** Department-head / QA verification that a set of records was done properly. | create-only; separation of duties (signer ≠ submitter); append-only. |
| `cfia_equipment` | **STAGED.** First-class machines (per-machine history). | read by staff; write by QA/owner; never hard-delete (retire flag). |
| `cfia_training_completions` | **STAGED.** Quiz passes (score, date, version, expiresAt). | self-write only, immutable, append-only. |
| `cfia_acknowledgements` | **STAGED.** "I read SOP vX" receipts. | self-write only, immutable. |

"STAGED" = designed + hardened in `FOUNDATION-SPECS.md`, **not yet deployed** (security rules
can't be emulator-tested in this environment; they go live with Chris).

## Roles (from `people.js` / the 2026 org chart)
`owner` (Chris, Russ) → `qa` / safety officer (Kyle Park, over all production) →
`supervisor` / department head (Roasting = TBD, Packaging = Jaleisy, Warehouse = Allana) →
`staff`. Office/commercial are Hub users with company-wide training only.
Sign-off chain: **staff completes → department head signs off → Kyle (QA) oversight → owners see all.**

## Compliance is computed, never stored
"Due / overdue / done" is calculated from each item's `cadence` + the last matching record,
in `America/Edmonton` time. Change a requirement in config and every view updates — no migration.

## The load-bearing rule
The front end holds no secrets and enforces nothing. **All trust lives in the Firestore
security rules.** A no-build static site is safe for compliance data *provided the rules are
right* — which is why the rules are written and reviewed alongside every collection, never last.
