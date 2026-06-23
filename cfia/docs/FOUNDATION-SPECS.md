# CFIA Foundation — Vetted Design Specs

_Generated 2026-06-23 by the foundation design+harden workflow (design → hostile review per component). Drop-in specs for integration into firestore.rules / storage.rules / cfia-core.js. One review (training-acks) failed on an API overload and needs a re-vet before wiring._

## records-validation
**Review verdict:** needs-fix

Today /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore.rules (lines 276-286) validates only 4 of the ~16 fields that cfia-core.js createRecord() actually writes (submitted_by_uid, submitted_by_email, submitted_at, created_via). Everything else — values{}, the form_* identity fields, performed_by_*, supersedes, department — is unvalidated, so a malformed/partial record can be permanently written and, because update:false/delete:false, can NEVER be corrected. A bad write is forever. This spec adds field-level validation to the create rule: an exact key set (hasOnly + hasAll, so no extra and no missing keys), correct types, allowed enums/shape, while keeping read by owner-or-controller-or-self and update/delete hard-false. I verified the enforced shape against the real writer (cfia/system/cfia-core.js:65-83) so the rule matches exactly what the app sends — nothing more, nothing less. Helpers reused as-is: signedIn(), signedInEmail(), isOwnerOrController(). I add three CFIA-local helper functions (cfiaRecordKeysOk, cfiaRecordTypesOk, cfiaRecordSubmitterOk) to keep the create condition readable. NOTE: I did not edit firestore.rules — this is a spec; the snippet below is drop-in to replace the existing cfia_records block.

**Data shape**

```
cfia_records/{recordId} — the EXACT 16 top-level keys written by cfia-core.js createRecord() (cfia/system/cfia-core.js:65-83). No more, no fewer:

- form_code: string, non-empty (e.g. "6.3a")
- form_title: string, non-empty (e.g. "Pre-Operational Inspection Log")
- sop_code: string — MAY be "" (schema allows empty via form.sopCode || ''); do NOT require non-empty
- form_version: string — may be "" today; versions are STRINGS per PLAN-OF-ATTACK §1 (e.g. "1","2")
- record_id: string, non-empty (human id like "6.3A-20260623-4821" from buildRecordId(); NOT the Firestore doc id)
- values: map, non-empty (dynamic per-form keys = field ids from form-schemas.js, e.g. {date,area,shift,chem,product,...}; values currently strings. Keys are open-ended, so the rule only asserts it IS a non-empty map — see edge cases for why per-key validation is deferred)
- performed_by_name: string, non-empty (WHO physically did the task; defaults to account name, editable on shared stations)
- performed_by_is_self: bool (true unless someone-else flag set in the signoff)
- submitted_by_uid: string == request.auth.uid (the logged-in account; unforgeable)
- submitted_by_email: string == signedInEmail()
- submitted_by_name: string, non-empty
- submitted_at: timestamp == request.time (server-stamped via serverTimestamp(); equals request.time at write)
- department: string — MAY be "" today (currentRole.user.department || ''); do NOT require non-empty until profiles carry department
- supersedes: null OR string (recordId of the record this one corrects; null for an original entry)
- created_via: string, fixed == "cfia-hub"

Type-rule mapping (Firestore rules type predicates):
string → x is string; bool → x is bool; map → x is map; timestamp → x is timestamp; null-or-string → x == null || x is string. "non-empty string" → x is string && x.size() > 0. "non-empty map" → x is map && x.size() > 0.
```
**Rules / code snippet**

```
// ── place these 3 helpers next to the existing helpers (top of the
//    match /databases/{database}/documents block), so the create rule reads cleanly ──

// 1) Exact key set: every required key present, and NO unexpected keys.
//    hasAll => no missing; hasOnly => no extras (blocks smuggling junk into an immutable doc).
function cfiaRecordKeysOk(d) {
  return d.keys().hasOnly([
      'form_code','form_title','sop_code','form_version','record_id','values',
      'performed_by_name','performed_by_is_self','submitted_by_uid','submitted_by_email',
      'submitted_by_name','submitted_at','department','supersedes','created_via'
    ])
    && d.keys().hasAll([
      'form_code','form_title','sop_code','form_version','record_id','values',
      'performed_by_name','performed_by_is_self','submitted_by_uid','submitted_by_email',
      'submitted_by_name','submitted_at','department','supersedes','created_via'
    ]);
}

// 2) Types + enums/shape. Strings that must carry meaning are length-checked;
//    sop_code/form_version/department may be "" today (string, any length).
function cfiaRecordTypesOk(d) {
  return d.form_code is string && d.form_code.size() > 0
    && d.form_title is string && d.form_title.size() > 0
    && d.sop_code is string
    && d.form_version is string
    && d.record_id is string && d.record_id.size() > 0
    && d.values is map && d.values.size() > 0
    && d.performed_by_name is string && d.performed_by_name.size() > 0
    && d.performed_by_is_self is bool
    && d.submitted_by_uid is string && d.submitted_by_uid.size() > 0
    && d.submitted_by_email is string && d.submitted_by_email.size() > 0
    && d.submitted_by_name is string && d.submitted_by_name.size() > 0
    && d.submitted_at is timestamp
    && d.department is string
    && (d.supersedes == null || d.supersedes is string)
    && d.created_via == 'cfia-hub';
}

// 3) Provenance: the logged-in account stamps ITSELF and the SERVER time
//    (unchanged from the current rule, just factored out).
function cfiaRecordSubmitterOk(d) {
  return d.submitted_by_uid == request.auth.uid
    && d.submitted_by_email == signedInEmail()
    && d.submitted_at == request.time;
}

// ── CFIA / HACCP food-safety records (immutable, audit-grade) ──
// A completed form is a permanent record: create-only, NEVER edited, NEVER
// deleted. The submitter stamps THEMSELVES and the SERVER time so a client
// (or page tampering) cannot forge who/when. Field-level validation guarantees
// a malformed or partial record can never be committed — because once written
// it can never be fixed (update/delete are false). Corrections are filed as a
// NEW record linked via `supersedes`.
match /cfia_records/{recordId} {
  allow get, list: if isOwnerOrController()
    || (signedIn() && resource.data.submitted_by_email == signedInEmail());

  allow create: if signedIn()
    && cfiaRecordKeysOk(request.resource.data)
    && cfiaRecordTypesOk(request.resource.data)
    && cfiaRecordSubmitterOk(request.resource.data);

  allow update: if false;   // immutable — corrections are new superseding records
  allow delete: if false;   // append-only — retained >=2 years, never auto-deleted
}
```
**Edge cases**
- values{} keys are dynamic per form (field ids from form-schemas.js differ for every form), so the rule can only assert `values is map && size()>0`. It CANNOT enforce that the right per-form keys exist or that required checklist items were answered. That gap stays in the client (fh-render-form.js collect() already pushes errors for required fields). Deep per-form key validation in rules would require embedding each form schema in firestore.rules — rejected as unmaintainable. Open question flags a server-side alternative.
- hasOnly + hasAll together pin the key set exactly. Listing the 15 keys twice is verbose; hasOnly([...]) + keys().size()==15 is equivalent and shorter, but hasAll is the clearest audit statement of 'these must all be present'. Both are equivalent; pick one.
- serverTimestamp(): at create, request.resource.data.submitted_at == request.time holds because Firestore resolves the sentinel to the request time. This is the existing, working behavior — keep both `submitted_at is timestamp` AND `== request.time` so a client can't pass a literal/forged timestamp.
- Empty-string fields today: sop_code, form_version, and department can legitimately be '' (cfia-core.js uses `|| ''`). The rule must NOT length-check these or every current submission breaks. Type-only (is string) is correct now; tighten later once profiles carry department and forms always carry a version.
- supersedes is validated as shape-only (null | string). It does NOT yet verify the target record exists, is the same form_code, or isn't itself superseded. A separate component (correction/supersede flow, GAP-BACKLOG High) should add exists(/databases/$(database)/documents/cfia_records/$(d.supersedes)) and same-form checks. Note: a get()/exists() in the create rule adds a document read and cost per write.
- Type coercion: without `is bool`, a client could send performed_by_is_self:'false' (a string, which is truthy in JS) and silently misrepresent self-attestation in an audit. Explicit `is bool` blocks this; same logic motivates `is timestamp` and `is map`.
- performed_by_is_self == false is a meaningful audit signal (someone entered on a shared/kiosk account). The rule allows both true/false but does NOT require performed_by_name to differ when false — that cross-field consistency is a client/UX concern, optionally promotable to a rule later.
- Future fields (photo-evidence URLs/paths, equipmentId per the foundation backlog) are NOT in the 16-key set. The moment the form engine writes them, this exact-key list will REJECT every write until the keys are added here. This is intentional fail-closed behavior, but means the rule and cfia-core.js must change together (see integration notes).
- Owners/controllers are NOT exempt from validation — there is no bypass branch. Even an owner cannot write a malformed immutable record. Deliberate: the rules are the boundary, with no privileged escape hatch.
**Integration notes**

FRONT END / cfia-core.js: The writer at cfia/system/cfia-core.js:65-83 already produces exactly these 16 keys with these types, so NO front-end change is required for the rule to pass today — this validation simply locks in the current contract. Critical coupling: the exact-key list in cfiaRecordKeysOk is now a hard contract. Any future field added to the `record` object in createRecord() (photo evidence, equipmentId, cadence, etc.) MUST be added to BOTH key arrays in cfiaRecordKeysOk AND given a type clause in cfiaRecordTypesOk in the same change, or every write is rejected (fail-closed). Add a comment in cfia-core.js pointing at the rule and vice-versa.

TESTING: Mirror these helpers in /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore-rules.test.js as the file already mirrors avatar/time-off helpers. Add canCreateCfiaRecord(requestAuth, data, nowMs) and assert: (a) a complete valid record passes; (b) missing any required key fails; (c) an extra key fails; (d) performed_by_is_self as a string fails; (e) created_via != 'cfia-hub' fails; (f) supersedes as a number fails while null and string pass; (g) empty values map fails; (h) submitted_by_uid != auth.uid fails. The file runs as a plain node assert script (see its run()); keep that pattern.

DEPLOY: No firebase.json change needed — firestore.rules already auto-deploys via .github/workflows/deploy-firestore-rules.yml on push to main (confirmed in the file header and in firebase.json, which registers only firestore.rules). This change ships by committing firestore.rules to main; no manual console paste. Storage rules are a SEPARATE, not-yet-existing concern (storage.rules is not in firebase.json and not auto-deployed) — out of scope here but required before photo-evidence lands (GAP-BACKLOG High).

ROLLOUT SAFETY: Validation is additive and matches the current writer, so in-flight submissions keep working. But run the one-time admin reset of cfia_records BEFORE go-live (BLUEPRINT §9) so the official immutable history starts clean — test entries can't be deleted afterward.
**Open questions**
- Per-form values{} validation: rules can't see the per-form schema. Acceptable to leave deep field validation (required keys answered; enum values like status in [Pass,Fail,Not in use]) to the client for now, or do you want a Cloud Function (onCreate, or a callable that writes server-side) that validates values against form-schemas.js before the doc is final? A Function is the only true server boundary for per-form rules.
- supersedes integrity: should the create rule enforce that supersedes points to an EXISTING cfia_records doc of the SAME form_code (via exists()/get())? Adds a per-write document read (cost) but closes a real audit gap. Pairs with the separate correction/supersede-flow component — confirm whether to fold the existence check here or there.
- Tighten currently-empty-allowed fields: require form_version non-empty now (every form in form-schemas.js carries a version), and require department once profiles carry it? If yes we add size()>0 to those clauses — but only after confirming no live form omits them.
- performed_by_name when performed_by_is_self == false: require it non-empty (already is) and optionally require it to DIFFER from submitted_by_name, making 'someone else did it' a stronger attested signal? A cross-field rule we can add.
- Strictness model: confirm you want strict hasOnly (reject unknown keys) over a permissive 'required present, extras allowed' model. Strict is safer for an immutable audit collection but couples the rule to cfia-core.js on every new field — that lockstep is the tradeoff.
- Key-set encoding: keep hasOnly + hasAll (explicit, audit-readable) or switch to hasOnly([...]) + keys().size()==15 (shorter, one list)? Purely stylistic; both enforce the exact set.
**Hardening (reviewer findings → fixes)**
- **[High]** NO authorization gate on create — only signedIn(). The proposed rule keeps `allow create: if signedIn() && ...`. ANY authenticated Firebase account can write a permanent, never-deletable cfia_record: a hubProfiles user whose status is 'disabled', a non-CFIA staffer, or anyone who can obtain a Firebase Auth token for this project (self sign-up / leaked token). The app's ALLOWED=new Set(['owner']) gate in cfia-core.js:12 is FRONT-END ONLY and enforces nothing — 'the rules ARE the security boundary; the static front end enforces nothing.' Result: an unauthorized but authenticated party permanently pollutes the immutable audit collection (it can never be deleted, update/delete=false), and they stamp their own real uid/email so it looks legitimate. This is the single biggest CFIA-integrity hole and the validation spec does not touch it.  
  _fix:_ Gate create on an active, authorized profile, not bare signedIn(). Add a helper canSubmitCfiaRecord() = signedIn() && hasActiveProfile(...) for whatever roles are permitted (owner/production/staff per the pilot plan), e.g. `signedIn() && exists(profilePath(request.auth.uid)) && get(profilePath(request.auth.uid)).data.status=='active' && get(...).data.profile in ['owner','controller','production','staff']`. Replace `allow create: if signedIn()` with `allow create: if canSubmitCfiaRecord()`. A disabled account MUST NOT be able to write to a permanent collection.
- **[High]** Separation of duties (the #1 locked decision) is entirely absent — and the spec gives no indication a verification field even exists. Locked design: '3-tier verification (staff completes record → department head signs off it was done properly → Kyle/QA oversight)' and 'SEPARATION OF DUTIES (a person may not verify their own record).' The 16-key schema has NO verification/signoff/verified_by fields and no rule preventing a person from verifying their own work. Because records are immutable (update:false), verification cannot be added to an existing record at all under this model — so as written, the design makes the mandated 3-tier verification structurally impossible without a separate verification collection. The spec frames itself as 'locking in the current contract,' but the current contract omits the core CFIA control.  
  _fix:_ Decide and document the verification representation NOW, before this immutable contract is frozen. Verification cannot live on the immutable record (can't be updated). Use a separate append-only collection, e.g. cfia_verifications/{id} with {record_id, verifier_uid, verifier_email, tier ('dept_head'|'qa'), verified_at==request.time}, and a rule that enforces verifier_uid != the record's submitted_by_uid AND != performed_by (no self-verify), verifier is isDeptHead(dept) or isSafetyOfficer(). Add the isSafetyOfficer()/isDeptHead(dept) helpers per the memory note. The records-validation spec should explicitly state SoD is out of scope and is a blocking dependency, not silently omit it.
- **[Medium]** performed_by_name is fully client-controlled and only type/length-checked, while performed_by_is_self can be set true alongside ANY name. cfia-core.js:73-74 sets performed_by_name from client signoff.performedByName and performed_by_is_self from client signoff.someoneElse. The rule asserts only `performed_by_name is string && size()>0` and `performed_by_is_self is bool`. A submitter can permanently record 'performed_by_name: Kyle Park, performed_by_is_self: true' while stamping their own uid — forging WHO physically did a food-safety task in an immutable audit record. The edgeCases note even acknowledges no cross-field rule ties these together but treats it as optional.  
  _fix:_ Add the cross-field rule the edge case waves off: `request.resource.data.performed_by_is_self == false || request.resource.data.performed_by_name == request.resource.data.submitted_by_name`. i.e. if the submitter claims they did it themselves (is_self=true), performed_by_name MUST equal submitted_by_name. Only when is_self=false may a different name appear (a genuinely attested 'someone else' entry). This closes the forge-self-attestation hole.
- **[Medium]** submitted_by_name is client-controlled and NOT bound to the account, unlike uid/email. The rule checks `submitted_by_name is string && size()>0` only. An attacker stamps the honest submitted_by_uid/submitted_by_email (forced by the rule) but sets submitted_by_name to a colleague's name. An auditor scanning the human-readable name column sees the wrong person. submitted_by_name should be derived from a trusted source, not free text.  
  _fix:_ Either drop submitted_by_name from the record and resolve the display name at read time from hubProfiles (single source of truth), or bind it: `request.resource.data.submitted_by_name == get(profilePath(request.auth.uid)).data.name`. Do not let the human-facing identity field be arbitrary client text on an immutable audit record.
- **[Medium]** supersedes is validated as shape-only (null|string), so the correction chain is forgeable and the forgery is permanent. A submitter can set supersedes to: an arbitrary/garbage id, a record of a DIFFERENT form_code, a record they don't own, an already-superseded record, or the new record's own future id. The 'correction = new superseding record' model is a locked decision, but with no integrity check a malicious or careless write can permanently corrupt the audit trail's correction lineage — and it can never be fixed (immutable). The spec defers this to a future component, but it ships the supersedes field in the frozen contract today.  
  _fix:_ At minimum, if supersedes != null, require the target to exist and match form_code: `request.resource.data.supersedes == null || (exists(/databases/$(database)/documents/cfia_records/$(request.resource.data.supersedes)) && get(...).data.form_code == request.resource.data.form_code)`. Yes it costs one read per superseding write (rare). Also consider requiring the superseder be the original submitter or a manager. Without this, do not advertise supersede as an integrity feature.
- **[Low]** The proposed read (get/list) rule lets every signed-in user list and read every record they submitted via a single-doc condition applied to list — and more importantly, the read rule unchanged still exposes records by email match without an active-profile check, so a DISABLED former employee with a still-valid token can read their historical records. Also: list with `resource.data.submitted_by_email == signedInEmail()` only works if the client query is constrained to that email (as listRecords does), but the rule does not itself scope a list — a broad list() by a non-owner is denied per-doc which is fine, but a disabled account still passes the per-doc self branch. Confidentiality of food-safety records to deactivated accounts is a gap.  
  _fix:_ Add active-profile to the read self-branch: `|| (hasActiveProfile-any() && resource.data.submitted_by_email == signedInEmail())`, or at least `signedIn() && get(profilePath(request.auth.uid)).data.status=='active'`. Keep owner/controller full read for audit.
- **[Low]** Content date / record_id are client-set, so records can carry a back-dated or mismatched human date even though submitted_at is honest. submitted_at==request.time is correctly enforced (good), but values.date and record_id (which embeds the date, buildRecordId cfia-core.js:106-110) are free client input. A submitter can record values.date='2026-01-01' on a doc actually written in June. For CFIA, the discrepancy between server submit time and claimed activity date is itself an audit signal, but the rule never asserts any relationship, so silent back-dating of the activity date is unconstrained.  
  _fix:_ Accept that activity date can legitimately differ from submit time (late entry), but make the gap auditable: keep submitted_at==request.time (done) and ensure the read/export surfaces BOTH. Optionally bound it: reject values.date in the future relative to request.time if values has a 'date' key (can't enforce the dynamic key generically, so this is a client+export concern — note it explicitly rather than implying records are tamper-evident on date).

---

## signoffs
**Review verdict:** needs-fix

Spec for cfia_signoffs: a create-only, never-edited, never-deleted collection where a department head ("supervisor" tier) or Kyle/QA/owner ("qa" tier) attests that a scoped set of cfia_records — by department + optional formCode over a date or date-range — were done properly (status verified | flagged), with a scopeNote and server-stamped signedAt/signedBy. It is the audit evidence of "documented supervisory oversight" CFIA/SFCR expects, and is the structural counterpart to the existing immutable cfia_records (firestore.rules lines 270-286). Two hard problems drive the design: (1) SEPARATION OF DUTIES — the signer must not be a submitter of the records being signed — must be enforced in rules that allow only ~10 get()/exists() lookups per evaluation and cannot range-query the covered records; (2) WHO may sign requires a dept-head / safety-officer concept that does not exist in the rules today. Recommendation: enforce SoD structurally in rules (a denormalized, length-capped recordSubmitterUids[] the client must declare; signedBy must not appear in it; per-record cross-check via get() only when recordIds is short), backed by a Cloud Function / scheduled audit re-verification for large scopes. Everything immutable: update=false, delete=false; signedBy + signedAt + tier are self-/server-stamped and frozen. firestore.rules auto-deploys on push to main, so no firebase.json change is required — the only deploy add is one composite index for the dashboard read queries. PREREQUISITE: hubProfiles must gain department, role_tier, and safetyOfficer fields; that profile change is the top decision for Chris.

**Data shape**

```
cfia_signoffs/{signoffId} — one immutable doc per supervisory verification event. Fields (Firestore types):

- tier: string, REQUIRED, enum 'supervisor' | 'qa'. 'supervisor' = department head verifying their own dept (tier 2). 'qa' = Kyle (safetyOfficer) or owner oversight across any dept (tier 3).
- department: string, REQUIRED, enum from departments.js keys: 'company' | 'roasting' | 'packaging' | 'warehouse'. Use the same keyspace cfia_records.department uses (cfia-core stamps department from the profile today).
- formCode: string | null. e.g. '6-3a'. null = covers ALL forms for that department in the date scope (blanket daily/weekly verification); a value = scoped to one form type.
- coversDate: string (YYYY-MM-DD) | null. Single-day scope (the common daily Pre-Op case). Exactly one of coversDate OR (coversFrom+coversTo) must be set.
- coversFrom: string (YYYY-MM-DD) | null. Inclusive start of a date-range scope (weekly/monthly).
- coversTo: string (YYYY-MM-DD) | null. Inclusive end of a date-range scope; coversTo >= coversFrom.
- recordIds: array<string>, REQUIRED (may be empty). The cfia_records document IDs this sign-off explicitly covers. Cap length (recommend <= 200).
- recordSubmitterUids: array<string>, REQUIRED. DENORMALIZED set of distinct submitted_by_uid across the covered records (client computes it from the records it listed). This is what makes separation-of-duties checkable in rules without range queries. Cap length (recommend <= 25).
- recordCount: number (int), REQUIRED; must equal recordIds.size(). Stored so an auditor sees scope size and a later query can detect in-scope records that were not covered.
- status: string, REQUIRED, enum 'verified' | 'flagged'. 'verified' = all reviewed records done properly. 'flagged' = problems found (explained in scopeNote/flaggedRecordIds; later spawns a CAPA).
- flaggedRecordIds: array<string>, OPTIONAL (default []). Subset of recordIds with issues when status='flagged'.
- scopeNote: string, REQUIRED when status='flagged', else OPTIONAL. Attestation text: what was checked, sample notes, exceptions. Cap ~2000 chars. (GAP-BACKLOG: a bare one-tap OK is weak audit evidence — this is the meaningful-attestation field.)
- signedBy: map, REQUIRED, exactly { uid: string, email: string, name: string }. uid must == request.auth.uid; email must == signedInEmail(); name is display only.
- signerTierAtSigning: string, OPTIONAL snapshot (e.g. role_tier at sign time) denormalized so a later profile change doesn't rewrite history.
- signedAt: timestamp, REQUIRED, must == request.time (serverTimestamp() from client). Unforgeable when it happened.
- workCompletedAt: timestamp | null, OPTIONAL. Latest submitted_at among covered records; lets the system compute verification latency (GAP-BACKLOG wants this).
- created_via: string, REQUIRED, must == 'cfia-hub' (mirrors cfia_records).
- supersedes: string | null. A corrected/superseding sign-off links to the prior signoffId (never edit — same correction model as cfia_records).

PREREQUISITE additions to hubProfiles/{uid} (rules already reference role_tier, manager_id, department at lines 157-159; add the data + meanings):
- department: string, a departments.js key (or 'company' for cross-dept staff like owners/QA).
- role_tier: string, enum 'staff' | 'lead' | 'dept_head' | 'qa' | 'owner' (supervisory rank, independent of the existing profile field {owner,controller,marketing,production,sales,staff}).
- safetyOfficer: boolean. true for Kyle Park (QA over ALL departments). Distinct from role_tier so QA authority is an explicit flag, not inferred.
- (existing) manager_id, status, email, profile unchanged.
```
**Rules / code snippet**

```
// ── NEW shared helpers (add near the other functions; reuse signedIn/signedInEmail/profilePath/isOwner/isOwnerOrController) ──

function myProfile() {
  return get(profilePath(request.auth.uid)).data;
}
function hasProfileDoc() {
  return signedIn() && exists(profilePath(request.auth.uid));
}
// Kyle / QA over ALL departments — explicit boolean flag on the profile.
function isSafetyOfficer() {
  return hasProfileDoc()
    && myProfile().status == 'active'
    && myProfile().safetyOfficer == true;
}
// Department head (supervisor) of a specific department.
function isDeptHead(dept) {
  return hasProfileDoc()
    && myProfile().status == 'active'
    && myProfile().role_tier == 'dept_head'
    && myProfile().department == dept;
}
// Anyone who may exercise supervisory authority over a department.
function isManagerOf(dept) {
  return isDeptHead(dept) || isSafetyOfficer() || isOwner();
}

// exactly one of coversDate OR (coversFrom + coversTo); range ordered
function exactlyOneDateScope(d) {
  return (
      (d.coversDate != null && d.coversFrom == null && d.coversTo == null)
      || (d.coversDate == null && d.coversFrom != null && d.coversTo != null
          && d.coversFrom <= d.coversTo)
    );
}
function recordPath(id) {
  return /databases/$(database)/documents/cfia_records/$(id);
}
// A covered record must exist, be a real cfia-hub record, and NOT be self-submitted.
function recordOk(id) {
  return exists(recordPath(id))
    && get(recordPath(id)).data.submitted_by_uid != request.auth.uid
    && get(recordPath(id)).data.created_via == 'cfia-hub';
}
// Per-record SoD cross-check, ONLY for small scopes (get()/exists() budget ~10;
// recordOk does up to 2 get()s each, so keep the unrolled count small — tune in emulator).
function signerNotSubmitterOfAny(ids) {
  return ids.size() == 0
    || ( recordOk(ids[0])
      && (ids.size() < 2 || recordOk(ids[1]))
      && (ids.size() < 3 || recordOk(ids[2]))
      && (ids.size() < 4 || recordOk(ids[3]))
      && (ids.size() < 5 || recordOk(ids[4]))
      && (ids.size() < 6 || recordOk(ids[5]))
      && (ids.size() < 7 || recordOk(ids[6]))
      && (ids.size() < 8 || recordOk(ids[7])) );
}

// ── cfia_signoffs: immutable supervisory verification (tiers 2 & 3) ──
match /cfia_signoffs/{signoffId} {

  // READ: owners/controllers + QA see all; a dept head sees their dept;
  // the signer can always read their own.
  allow get, list: if isOwnerOrController()
    || isSafetyOfficer()
    || (signedIn() && resource.data.signedBy.email == signedInEmail())
    || (signedIn() && isDeptHead(resource.data.department));

  // CREATE: who may sign + identity/time stamping + separation of duties.
  allow create: if signedIn()
    // identity self-stamped and unforgeable
    && request.resource.data.signedBy.uid == request.auth.uid
    && request.resource.data.signedBy.email == signedInEmail()
    && request.resource.data.signedAt == request.time
    && request.resource.data.created_via == 'cfia-hub'
    // well-formed scope
    && request.resource.data.tier in ['supervisor', 'qa']
    && request.resource.data.status in ['verified', 'flagged']
    && request.resource.data.department in ['company','roasting','packaging','warehouse']
    && request.resource.data.recordCount == request.resource.data.recordIds.size()
    && request.resource.data.recordIds.size() <= 200
    && request.resource.data.recordSubmitterUids.size() <= 25
    && exactlyOneDateScope(request.resource.data)
    // WHO may create — authority must match the claimed tier
    && (
        (request.resource.data.tier == 'supervisor'
          && isDeptHead(request.resource.data.department))
        || (request.resource.data.tier == 'qa'
          && (isSafetyOfficer() || isOwner()))
       )
    // SEPARATION OF DUTIES (primary, O(1)): signer not in declared submitter set
    && !(request.auth.uid in request.resource.data.recordSubmitterUids)
    // SoD defence-in-depth (small scopes only): actually fetch each record
    && (
        request.resource.data.recordIds.size() > 8
        || signerNotSubmitterOfAny(request.resource.data.recordIds)
       );

  // APPEND-ONLY: a sign-off is permanent. Corrections = a NEW doc with supersedes set.
  allow update: if false;
  allow delete: if false;
}
```
**Edge cases**
- Separation of duties is only PARTIALLY enforceable in rules. The denormalized recordSubmitterUids[] check is the real always-on guard, but the client supplies that array, so a malicious client could omit its own uid. The in-rules per-record get() cross-check (signerNotSubmitterOfAny) only runs for small scopes (<=8) because of the ~10 get()/exists() per-request budget, and recordOk() itself does up to 2 get()s per record. For larger daily/weekly sign-offs, SoD truthfulness must be re-verified by a Cloud Function or scheduled audit job reading the records server-side. Decide whether that backstop is acceptable for go-live, or whether scopes must be capped so rules fully enforce SoD.
- get()/exists() budget collision: isDeptHead/isSafetyOfficer/isOwner each call get(profilePath(...)). On a 'supervisor' create with the per-record cross-check you pay profile get()s PLUS up to 2*N record get()s. With profile lookups already consuming several, the SAFE in-rules record cap is realistically ~3-4, not 8 — measure in the emulator and tune the unrolled count down. The structural recordSubmitterUids check has zero get() cost and should be the load-bearing rule.
- Kyle-as-submitter conflict: if Kyle (safetyOfficer) fills out a record, he cannot self-verify it (signer-not-in-recordSubmitterUids covers it). Operationally his own records need a DIFFERENT verifier (an owner, or another QA). Same for an owner's own records.
- A record exists in the date/dept scope but is NOT in recordIds (a missed/omitted record). Rules cannot detect this — they only see the ids handed in. recordCount plus a dashboard/server query comparing covered ids against ALL records in scope is required so a sign-off can't silently skip the one bad record. flaggedRecordIds must be a subset of recordIds.
- Multi-department staff: a record's department is stamped from the submitter's profile.department, but a person may work across roasting/packaging. A dept head signing for 'packaging' might cover a record whose submitter's home dept is 'roasting'. Decide whether department on the record (and on the sign-off) is the WORK's department or the PERSON's department; both must use the same definition.
- Dept-head absence / single point of failure (GAP-BACKLOG High): if the only dept head is on vacation/sick/offboarded, no one can create the supervisor-tier sign-off. Need a backup verifier or auto-fallback to QA/owner (tie to the Hub Time Off tool). isManagerOf already lets QA/owner sign, but they'd file tier='qa', not tier='supervisor' — decide if a QA-filed sign-off satisfies the tier-2 requirement when the head is away.
- 'company' department sign-offs: tier='supervisor' for department='company' has no single dept head (isDeptHead('company') would need someone with department=='company' AND role_tier=='dept_head'). Likely company-wide verification should be qa-tier only; consider rejecting tier='supervisor' when department=='company'.
- Date-string trust: coversDate/coversFrom/coversTo are client strings, not server time. A signer could claim the wrong covered date. signedAt==request.time anchors WHEN they signed, but the COVERED dates are self-asserted — acceptable for attestation, but the dashboard should flag sign-offs whose coversDate is far from signedAt (stale or pre-dated verification).
- Timezone: 'today'/due computations must use America/Edmonton (locked). coversDate is a wall-clock date; the client must compute it in Edmonton time, not UTC, or a late-night sign-off lands on the wrong day.
- Disabled signer: isDeptHead/isSafetyOfficer require status=='active', so a disabled supervisor correctly cannot sign NEW records, but their PAST sign-offs must stay readable. The read rules key off signedBy.email and department (not the signer's current active status), so historical reads survive — confirm owners/QA retain read after a signer is disabled.
- Supersede integrity: a corrected sign-off sets supersedes=priorId but the prior doc stays (update/delete=false). Nothing forces the new doc to point at a real prior sign-off or be created by an authorized signer of the same scope — optionally validate supersedes via exists() if the get() budget allows.
**Integration notes**

Front end / cfia-core.js (/Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/system/cfia-core.js): add createSignoff(scope) and listSignoffs(opts) mirroring the existing createRecord()/listRecords() (lines 56-104). createSignoff must (1) list the in-scope records first (reuse listRecords with formCode/date filters) to derive recordIds, recordSubmitterUids = distinct submitted_by_uid, recordCount, and workCompletedAt = max(submitted_at); (2) drop the signer's OWN records from the set OR refuse to sign if the signer submitted any covered record (mirror the rule's SoD so the UI fails fast); (3) stamp signedBy {uid,email,name} from auth.currentUser, signedAt: serverTimestamp(), created_via:'cfia-hub', tier from the signer's role_tier/safetyOfficer; (4) addDoc to a new const SIGNOFFS='cfia_signoffs'. The pilot gates ALLOWED (line 12, owner-only) and MANAGERS (line 14) must be extended so dept heads and QA can reach the verification dashboard; today the module is owner-only, so the signing UI stays gated until role_tier/safetyOfficer are present in the role object onHubAuthChange returns. The three dashboards in PLAN-OF-ATTACK (self / dept-head / QA) read this collection: dept-head = listSignoffs filtered to their department; QA/owner = all. The front end enforces nothing — every check above is duplicated in rules.

Profiles: the role object (currentRole.user) must carry department, role_tier, safetyOfficer so cfia-core can set tier and pre-check SoD, and that data must be written into hubProfiles/{uid} for the rules to read. selfProfileFieldsDoNotEscalate() (rules lines 150-160) already freezes role_tier/department/manager_id on self-update, so only an owner can set department/role_tier — good (a staffer can't self-promote to dept_head and self-verify). ADD safetyOfficer to that frozen list so a user can't self-grant QA.

Deploy: firestore.rules auto-deploys via .github/workflows/deploy-firestore-rules.yml on push to main (header comment lines 4-5) — no manual paste, and firebase.json (which only maps firestore.rules) needs no change for the rules. The ONE deploy addition: the dashboard list queries (where department==X, where formCode==Y, orderBy signedAt desc) will need a composite index — either add firestore.indexes.json plus an "indexes" entry under "firestore" in firebase.json and let the Action deploy it (preferred, keeps it in git) or create it from the console link Firestore prints on first query. Storage rules are NOT auto-deployed, but cfia_signoffs stores no files (photo evidence lives on cfia_records via Firebase Storage), so no Storage rule change here. If the Cloud-Function SoD backstop is adopted, that is a separate Functions deploy and adds a new dependency to a repo that is currently static + rules only.
**Open questions**
- hubProfiles schema: confirm adding department, role_tier ('staff'|'lead'|'dept_head'|'qa'|'owner'), and safetyOfficer:boolean. role_tier is separate from the existing profile field {owner,controller,marketing,production,sales,staff}. Is that two-axis model (profile = Hub access role, role_tier = CFIA supervisory rank) what you want, or should CFIA authority fold into the single profile field?
- Separation-of-duties strength: accept the structural recordSubmitterUids[] check (client-declared, O(1)) as the primary guard with a Cloud-Function re-verification backstop for large sign-offs, OR cap every sign-off at a few records so the rules can fully cross-check each via get() with no trusted-client assumption? This is the central security trade-off and it becomes real rules.
- Who verifies QA's and the owner's own records, since no one may self-verify? (e.g. Kyle's records signed by an owner; an owner's records signed by Kyle.)
- When the only dept head is away (vacation/sick/offboarded), is a QA-tier sign-off an acceptable stand-in for the missing tier-2 supervisor sign-off, or do you want a named backup dept head per department? Should this tie into the Hub Time Off tool to auto-route?
- Department semantics on a record: is cfia_records.department the WORK's department or the SUBMITTER's home department? The sign-off scope must key off the same definition; it matters for multi-department staff. cfia-core stamps it from the submitter's profile.department today.
- Can a tier='supervisor' sign-off ever have department='company'? There is no single dept head for company-wide; propose restricting company-wide verification to tier='qa'. Confirm.
- Scope granularity: should one sign-off be allowed to span multiple departments or multiple form codes (formCode=null already allows all-forms), or do you want one sign-off per (department, formCode, date) for cleaner audit slicing?
- Flag/CAPA flow: should status='flagged' require flaggedRecordIds, and should closing the resulting CAPA produce a NEW 'verified' sign-off that supersedes the flagged one, or a separate CAPA-closure record? Determines whether supersedes is used here or left null.
**Hardening (reviewer findings → fixes)**
- **[High]** role_tier ENUM COLLISION (design built on a wrong assumption about live data). The design's isDeptHead() checks `myProfile().role_tier == 'dept_head'` and proposes role_tier enum {staff|lead|dept_head|qa|owner}. But role_tier ALREADY EXISTS in production with totally different values: 'Owner','Controller','Manager','Staff' (capitalized). Evidence: system/fratello-auth.js:248,276 writes role_tier:'Owner' / timeOffRoleTier(...); scripts/seed-firestore.js:15-146 seeds 'Owner'/'Controller'/'Manager'/'Staff'; system/api/firestore-client.js:105,109 reads role_tier==='Owner'/'Controller' for Hub admin checks; firestore-rules.test.js:7-55 uses the same. Result: isDeptHead() NEVER matches any real profile, so NO supervisor-tier sign-off can ever be created — the whole tier-2 chain is dead on arrival. If you instead repurpose role_tier to the new enum, you SILENTLY BREAK the Time Off admin gate in firestore-client.js (role_tier==='Owner' stops being true → owners lose admin) and the netlify approval flow.  
  _fix:_ Do NOT overload role_tier. Add a SEPARATE field for CFIA supervisory rank, e.g. cfia_tier with enum {staff|lead|dept_head|qa}. Rewrite isDeptHead(dept) to read myProfile().cfia_tier=='dept_head'. Add cfia_tier (and safetyOfficer) to BOTH the create-rule frozen set and selfProfileFieldsDoNotEscalate(). Leave the existing role_tier {Owner/Controller/Manager/Staff} untouched.
- **[High]** DEPARTMENT KEYSPACE MISMATCH — sign-off validation can never line up with the records it covers. The rule requires `request.resource.data.department in ['company','roasting','packaging','warehouse']` (lowercase departments.js keys) and isDeptHead compares myProfile().department to that lowercase set. But hubProfiles.department is stored CAPITALIZED / free-text: fratello-auth.js:247 sets department:'Leadership'; timeOffDepartment() yields 'Roasting' etc. AND cfia_records.department is stamped from currentRole.user.department (cfia-core.js:80) — i.e. the SAME capitalized value ('Roasting'). So real records carry department 'Roasting' while the signoff rule only accepts 'roasting'. Either signoff creation is rejected, or the dept-head's profile.department ('Roasting') never equals the rule's 'roasting' and isDeptHead is always false. Cross-tier semantics are broken end to end.  
  _fix:_ Pick ONE canonical department keyspace (the lowercase departments.js keys) and normalize it everywhere: change cfia-core.js to stamp the normalized key, normalize hubProfiles.department to departments.js keys (migrate existing 'Leadership'/'Roasting' → 'company'/'roasting'), or add a normalize step. The signoff rule, cfia_records.department, and hubProfiles.department MUST use byte-identical values. Add an emulator test asserting a record's department equals an accepted signoff department.
- **[High]** SEPARATION-OF-DUTIES BYPASS via client-controlled recordSubmitterUids[]. The primary always-on guard is `!(request.auth.uid in request.resource.data.recordSubmitterUids)`, but that array is supplied by the client. A malicious dept head opens devtools and submits a sign-off that COVERS their own records while OMITTING their own uid from recordSubmitterUids (and/or omits their own recordIds). recordCount==recordIds.size() still passes. The per-record get() cross-check (signerNotSubmitterOfAny) ONLY runs for size()<=8, and even then the design itself admits the get()/exists() budget forces it down to ~3-4 records — so for any realistic daily/weekly scope it does NOTHING. Net: a supervisor can self-verify their own work, defeating the locked SEPARATION OF DUTIES requirement, and the rules cannot detect it.  
  _fix:_ Rules cannot enforce SoD over an unbounded, client-declared set. Two viable paths: (A) HARD-CAP every sign-off at N records (N small enough that the get() budget fully cross-checks each via recordOk(), measured in the emulator — likely ~5), making recordIds the authority and removing reliance on the trusted recordSubmitterUids array entirely; OR (B) keep large scopes but make the sign-off PROVISIONAL until a Cloud Function re-reads every covered record server-side, confirms signer != each submitter, and flips a server-only verified flag (clients can't write that flag). Do not ship the client-declared array as the load-bearing SoD control. Treat (A) as go-live; (B) only if a Functions deploy is accepted (new dependency for a static+rules repo).
- **[High]** PROFILE ESCALATION: self-granting safetyOfficer (QA-over-all-departments). The design adds safetyOfficer:boolean to hubProfiles and gates QA-tier sign-offs on it (isSafetyOfficer → myProfile().safetyOfficer==true). But selfProfileFieldsDoNotEscalate() (firestore.rules:150-160) freezes only email/profile/status/role_tier/manager_id/department — NOT safetyOfficer. allow update at line 192 lets a user self-update as long as those listed fields are unchanged. So any active user can PATCH their own hubProfiles doc setting safetyOfficer:true, becoming QA over ALL departments, then file qa-tier sign-offs across every department. Same gap exists on the new cfia_tier field if added without freezing it.  
  _fix:_ Add `&& request.resource.data.safetyOfficer == resource.data.safetyOfficer` (and the same for cfia_tier) to selfProfileFieldsDoNotEscalate(). Also tighten the hubProfiles CREATE rule (lines 175-190): it does not constrain safetyOfficer/cfia_tier at all, so a newly-invited user could set safetyOfficer:true on first profile creation — force safetyOfficer to default false on create unless isOwner()/isBootstrapOwner().
- **[Medium]** COMPOSITE-INDEX DEPLOY CLAIM IS FALSE — dashboards silently fail or the listSignoffs queries error in prod. The design says add an 'indexes' entry to firebase.json + firestore.indexes.json 'and let the Action deploy it (preferred)'. The Action (.github/workflows/deploy-firestore-rules.yml:32) runs `firebase deploy --only firestore:rules` — RULES ONLY. It will never deploy indexes, and the path filter (lines 9-10) only triggers on changes to firestore.rules, so editing firestore.indexes.json won't even run the workflow. The where(department)+where(formCode)+orderBy(signedAt) queries will throw FAILED_PRECONDITION at runtime with no index.  
  _fix:_ Either (a) change the workflow to `firebase deploy --only firestore` (rules+indexes), add 'indexes':'firestore.indexes.json' to firebase.json, and broaden the workflow path filter to include firestore.indexes.json and firebase.json; or (b) explicitly create the composite index from the console link Firestore prints on first failed query and document it as a manual step. Do not state the current Action deploys indexes — it does not.
- **[Medium]** MISSED/OMITTED IN-SCOPE RECORD — a sign-off can launder a bad record by simply not listing it. Rules only see recordIds handed in; they cannot range-query 'all records in dept X on date Y'. A signer (or a colluding submitter) creates a daily 'verified' sign-off that lists every clean record but omits the one with a failed temperature, leaving the bad record permanently unverified yet making the day LOOK verified to an auditor. recordCount records scope size but proves nothing about completeness. This undermines the CFIA 'documented supervisory oversight' the collection exists to provide.  
  _fix:_ Completeness cannot live in rules. Add a server/dashboard reconciliation: a scheduled job (or the QA dashboard) queries ALL cfia_records in (department,date[/formCode]) scope and compares against the union of recordIds across sign-offs, surfacing any in-scope record with no covering sign-off as an exception. Make 'uncovered record older than N hours' an audit alert. Until that exists, do not claim the sign-off proves the day was fully reviewed.
- **[Medium]** BACK-DATED / FALSE-SCOPE attestation. coversDate/coversFrom/coversTo are client strings; signedAt==request.time only anchors WHEN the click happened, not what was actually covered. A signer can sign today and claim coversDate of a past day they never reviewed (papering over a gap before an audit), or claim a wide range to manufacture the appearance of oversight. exactlyOneDateScope only checks shape/ordering, not truthfulness vs the covered records' submitted_at.  
  _fix:_ In rules, when the scope is small enough to get() the records, assert each covered record's submitted_at (or its values.date) falls within [coversFrom,coversTo]/==coversDate so the declared scope can't diverge from the evidence. For large scopes, have the server/dashboard flag any sign-off whose coversDate is far from signedAt (computed in America/Edmonton, the locked tz) as stale/pre-dated. Document that covered-date is self-asserted for large scopes.
- **[Low]** COMPANY-DEPARTMENT supervisor sign-off is unsignable / ambiguous. tier='supervisor' with department='company' requires isDeptHead('company') = someone with cfia_tier=='dept_head' AND department=='company'. No such single person exists, so company-wide tier-2 sign-offs are impossible, yet the rule's department enum allows 'company' for tier='supervisor' — a latent dead path and an auditor-confusing gap (company-wide forms get no tier-2 coverage).  
  _fix:_ In the create rule, reject tier=='supervisor' when department=='company' (require company-wide verification to be tier=='qa'). Add: `&& !(request.resource.data.tier=='supervisor' && request.resource.data.department=='company')`.
- **[Low]** flaggedRecordIds not constrained to recordIds, and scopeNote not required on flag at the RULE level (only described as 'REQUIRED when flagged'). A 'flagged' sign-off could list flaggedRecordIds outside the covered set, or carry no scopeNote, weakening the CAPA trail and producing incoherent audit evidence.  
  _fix:_ Add rule clauses: when status=='flagged', require scopeNote is a non-empty string (size()>0) and require flaggedRecordIds to be a subset of recordIds (enforceable for small scopes via the same unrolled check, or at minimum flaggedRecordIds.size() <= recordIds.size()). Enforce status=='verified' implies flaggedRecordIds is empty.
- **[Low]** SUPERSEDE integrity not validated. supersedes can point at a non-existent or unauthorized prior sign-off; nothing requires the superseding doc to be created by an authorized signer of the same scope. A correction trail can therefore be fabricated or broken.  
  _fix:_ If get() budget allows, when supersedes != null require exists() on the prior signoff and (optionally) that prior.department == this.department. At minimum document that supersede linkage is validated by the dashboard, and ensure the prior doc remains (update/delete=false already guarantees this).

---

## equipment
**Review verdict:** needs-fix

A new top-level Firestore collection cfia_equipment makes machines first-class so cfia_records.values references a stable equipmentId instead of a free-text "area". Registry docs are READABLE by any signed-in active staffer (so a floor operator can pick the machine they're inspecting) and WRITABLE only by QA (Kyle) or an owner. Equipment is NEVER hard-deleted: retirement is a soft update (active:false, status:"retired") so historical records keep resolving and the audit trail stays intact.

Two findings shaped this spec:
(1) The QA/safety-officer helpers this registry wants to lean on do NOT yet exist in /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore.rules — only signedIn(), signedInEmail(), isOwner(), isController(), isOwnerOrController(), hasActiveProfile() are defined (lines 9-59). So the rulesSnippet ships its own QA gate, isCfiaEquipmentAdmin(), built from existing helpers, with a clearly marked one-line swap point for the future isSafetyOfficer(). Until isSafetyOfficer() lands, equipment admin = owner only (Kyle can't yet be distinguished from other production staff by the rules — see openQuestions).
(2) The immutable cfia_records create rule (lines 279-283) does NOT validate values{} at all today, so "records reference an equipmentId" is only truly enforceable if you add a write-time check — shown as optional hardening, since it's a tightening that could reject in-flight clients and is a decision for Chris.

Doc ID == equipmentId (a human-readable slug like "copilot-500"), so references are legible in records and collisions are impossible. Files of interest (absolute): firestore.rules (add match block + helper), cfia/system/cfia-core.js (add listEquipment/getEquipment + admin write helpers), cfia/config/equipment-registry.js (NEW seed file, matches the existing config/*.js pattern), cfia/config/form-schemas.js (replace the free-text/select 'area' field at line 22 with an equipment select).

**Data shape**

```
Collection: cfia_equipment/{equipmentId}  — the doc ID IS the equipmentId (a lowercase slug). No random auto-IDs.

Fields (Firestore types):
- equipmentId   string    REQUIRED, immutable. MUST equal the doc ID. Pattern: ^[a-z0-9-]{2,40}$ . This is the value cfia_records.values stores.
- name          string    REQUIRED, 1-120 chars. Human label, e.g. "CoPilot-500 Bagger".
- code          string    REQUIRED, 1-40 chars. Fratello asset/short code shown on the floor, e.g. "PKG-CP500".
- department    string    REQUIRED. Enum, must match cfia/config/departments.js keys: 'roasting' | 'packaging' | 'warehouse' | 'company'.
- type          string    REQUIRED. Equipment class enum: 'bagger' | 'sealer' | 'scale' | 'filler' | 'conveyor' | 'roaster' | 'grinder' | 'metal-detector' | 'date-coder' | 'other'.
- manualDocCode string?   OPTIONAL. Links to a reference doc / manual code in reference-registry.js (e.g. "7.1"); null if none.
- serial        string?   OPTIONAL. Manufacturer serial; null if unknown.
- active        bool       REQUIRED. true = in service, false = retired (soft-delete flag).
- status        string    REQUIRED. Lifecycle enum: 'in-service' | 'maintenance' | 'retired'. Invariant: status=='retired' iff active==false.
- created_by_uid    string   REQUIRED on create == request.auth.uid (provenance).
- created_by_email  string   REQUIRED on create == signedInEmail().
- created_at        timestamp REQUIRED on create == request.time (server-stamped, like cfia_records.submitted_at).
- updated_by_email  string?  set on every update == signedInEmail().
- updated_at        timestamp? set on every update == request.time.

cfia_records linkage (no schema migration of existing records — additive):
- cfia_records.values.equipmentId  string  — NEW. Replaces the free-text "area" string. Stores the slug, e.g. "copilot-500". For a whole-line/whole-facility inspection use a sentinel registry doc (e.g. equipmentId "packaging-line-all", type:'other') rather than null, so every record still resolves to a registry entry.
- The denormalized human label (name/code) is NOT copied into the record; the record is immutable and the registry is the lookup. (Optional: also store values.equipment_name_snapshot for human-readable audit export so a retired/renamed machine still prints its name-at-time-of-record — decision in openQuestions.)
```
**Rules / code snippet**

```
// ── ADD near the other helpers (after hasActiveProfile, ~line 59) ──
// QA / safety-officer gate for the equipment registry.
// NOTE: there is no isSafetyOfficer() helper yet. Until one exists, equipment
// admin == owner only. When you add Kyle as QA (profile field safetyOfficer
// or a dedicated role_tier), swap the marked line for: || isSafetyOfficer()
function isCfiaEquipmentAdmin() {
  return isOwner()
    /* || isSafetyOfficer() */ ;   // <-- enable once Kyle/QA is representable in rules
}

// Slug must equal the doc id, lowercase a-z0-9-, 2..40 chars.
function validEquipmentId(id, data) {
  return data.equipmentId == id
    && data.equipmentId.matches('^[a-z0-9-]{2,40}$');
}

function validEquipmentDept(data) {
  return data.department in ['roasting', 'packaging', 'warehouse', 'company'];
}

function validEquipmentType(data) {
  return data.type in ['bagger','sealer','scale','filler','conveyor',
                       'roaster','grinder','metal-detector','date-coder','other'];
}

function validEquipmentStatus(data) {
  return data.status in ['in-service','maintenance','retired']
    // active and status must agree: retired iff not active.
    && (data.status == 'retired') == (data.active == false);
}

function validEquipmentShape(id, data) {
  return validEquipmentId(id, data)
    && data.name is string && data.name.size() > 0 && data.name.size() <= 120
    && data.code is string && data.code.size() > 0 && data.code.size() <= 40
    && data.active is bool
    && validEquipmentDept(data)
    && validEquipmentType(data)
    && validEquipmentStatus(data);
}

// ── ADD as a sibling of the cfia_records match block (~line 286) ──
// CFIA equipment registry (first-class machines).
//  read   : any signed-in active staffer (floor operator picks the machine)
//  create : QA / owner only, server-stamped provenance, valid shape
//  update : QA / owner only; equipmentId & created_* are FROZEN; retire via active=false
//  delete : NEVER (retire instead — preserves the audit trail & old record links)
match /cfia_equipment/{equipmentId} {
  allow get, list: if signedIn();

  allow create: if isCfiaEquipmentAdmin()
    && validEquipmentShape(equipmentId, request.resource.data)
    && request.resource.data.created_by_uid == request.auth.uid
    && request.resource.data.created_by_email == signedInEmail()
    && request.resource.data.created_at == request.time;

  allow update: if isCfiaEquipmentAdmin()
    && validEquipmentShape(equipmentId, request.resource.data)
    // immutable identity & provenance — cannot be rewritten:
    && request.resource.data.equipmentId == resource.data.equipmentId
    && request.resource.data.created_by_uid == resource.data.created_by_uid
    && request.resource.data.created_by_email == resource.data.created_by_email
    && request.resource.data.created_at == resource.data.created_at
    // every edit is attributed & server-stamped:
    && request.resource.data.updated_by_email == signedInEmail()
    && request.resource.data.updated_at == request.time;

  allow delete: if false;   // hard-delete forbidden; retire via active=false
}

// ── OPTIONAL HARDENING — tighten cfia_records.create so the equipmentId
// reference is validated at write time (records are immutable & forever).
// Replace the existing create at lines 279-283 with this stricter version.
// CAUTION: this REJECTS any record whose values.equipmentId is missing or
// points at a non-existent registry doc — only ship after the front end is
// updated to send equipmentId, or it will break in-flight submissions.
allow create: if signedIn()
  && request.resource.data.submitted_by_uid == request.auth.uid
  && request.resource.data.submitted_by_email == signedInEmail()
  && request.resource.data.submitted_at == request.time
  && request.resource.data.created_via == 'cfia-hub'
  && request.resource.data.values.equipmentId is string
  && exists(/databases/$(database)/documents/cfia_equipment/$(request.resource.data.values.equipmentId));
  // NB: this does NOT require active==true, so a record can still be filed
  // against a machine retired earlier the same day (intentional — see edge cases).
```
**Edge cases**
- Hard-delete must be impossible (delete:false). If a registry doc were deleted, every historical cfia_records pointing at that equipmentId would dangle and the audit trail would break. Retirement is active=false / status=retired only.
- active vs status drift: the rule enforces (status=='retired') == (active==false) so the two can never disagree. A machine in 'maintenance' is still active==true (it exists, just not running) and remains selectable / readable.
- Records against retired equipment: the optional create-hardening uses exists() NOT a active==true check, on purpose. A staffer must still be able to file (or supersede) a record for a machine that was retired earlier the same shift. The UI should hide active==false machines from NEW dropdowns but the rule must not block the write.
- Whole-line / whole-facility inspections: the old form had area options like 'Whole facility'. There is no single machine, so do NOT allow null equipmentId — seed sentinel registry docs (e.g. 'packaging-line-all', 'facility-all', type:'other') so every record still resolves to a registry entry and per-area history stays queryable.
- equipmentId must equal the doc ID. Enforced in validEquipmentId. Without it a client could create cfia_equipment/copilot-500 whose .equipmentId field says 'roaster-g120', poisoning every lookup. The id IS the key.
- Slug immutability on rename: name/code/serial are freely editable by QA, but equipmentId is frozen on update. If a machine is genuinely replaced (not renamed), create a NEW registry doc with a new slug and retire the old one — old records keep pointing at the old slug, new records at the new one. This is the intended replace path.
- Provenance fields are frozen on update (created_by_uid/email/created_at) so an editor cannot rewrite who first registered the asset; only updated_by_email/updated_at change.
- QA gate gap (current reality): with no isSafetyOfficer() helper, isCfiaEquipmentAdmin() resolves to owner-only. Kyle (production profile) currently CANNOT manage equipment via the rules even though policy says he's QA over all departments. This is a known gap, surfaced in openQuestions — do not silently widen to all 'production' staff, that would let any operator edit the registry.
- Storage note: equipment manuals are PDFs in Firebase Storage, governed by storage.rules which are NOT auto-deployed (only firestore.rules auto-deploys via .github/workflows). If you later attach manual files, that deploy step must be done manually — flagged in integrationNotes.
- Reusing 'department' enum: keep it identical to cfia/config/departments.js keys (roasting/packaging/warehouse/company). If the two drift, department pages and the equipment filter silently disagree. Single source of truth = departments.js.
**Integration notes**

FRONT END / cfia-core.js (/Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/system/cfia-core.js):
- Add a constant EQUIPMENT = 'cfia_equipment' next to RECORDS (line 16).
- Add read helpers mirroring listRecords()/the existing Firestore imports (collection, getDocs, query, where already imported):
    export async function listEquipment({ department, activeOnly = true } = {}) -> getDocs(collection(d,'cfia_equipment')), map {id, ...data}, filter by department and (activeOnly ? active===true : true), sort by name. Used to populate the form dropdown.
    export async function getEquipment(equipmentId) -> single doc fetch for resolving a record's machine to name/code.
- Add admin write helpers (owner/QA only; the rules are the real gate, this is just UX): saveEquipment(equipmentId, data) using setDoc(doc(d,'cfia_equipment',equipmentId), {...}) — use setDoc with the slug as the id, NOT addDoc, because the doc ID must equal equipmentId. On create, stamp created_by_uid/email + created_at: serverTimestamp(); on update stamp updated_by_email + updated_at. retireEquipment(equipmentId) = update {active:false, status:'retired', updated_*}.
- createRecord() (lines 56-87): the record already carries values{} = fields. No change needed to stamp equipmentId — it flows through as fields.equipmentId once the form schema provides it. If you adopt the snapshot option, also write values.equipment_name_snapshot from the selected registry entry at submit time.

FORM SCHEMA (/Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/config/form-schemas.js):
- Replace the free-text/select 'area' field (line 22, form 6.3a) with an equipment-backed field. Two options: (a) extend fh-render-form.js with a new field type 'equipment' that calls listEquipment({department}) at render time and renders a <select> of {value:equipmentId, label:`${name} (${code})`}; or (b) keep type:'select' but populate options dynamically. Type (a) is cleaner and reusable across forms.
- fh-render-form.js (/Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/system/fh-render-form.js) must learn to await the async option list for the equipment field before rendering.

SEED FILE (NEW: /Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/config/equipment-registry.js) — follows the existing config/*.js export pattern (departments.js, reference-registry.js):
  export const EQUIPMENT_SEED = {
    'copilot-500':       { equipmentId:'copilot-500',       name:'CoPilot-500 Bagger', code:'PKG-CP500', department:'packaging', type:'bagger',  manualDocCode:null, serial:null, active:true, status:'in-service' },
    'actionpak-line':    { equipmentId:'actionpak-line',    name:'ActionPak Packaging Line', code:'PKG-AP', department:'packaging', type:'filler', manualDocCode:null, serial:null, active:true, status:'in-service' },
    'actionpak-sealer':  { equipmentId:'actionpak-sealer',  name:'ActionPak Heat Sealer', code:'PKG-AP-SEAL', department:'packaging', type:'sealer', manualDocCode:null, serial:null, active:true, status:'in-service' },
    'packaging-scale':   { equipmentId:'packaging-scale',   name:'Packaging Bench Scale', code:'PKG-SCALE', department:'packaging', type:'scale', manualDocCode:'7.2', serial:null, active:true, status:'in-service' },
    'packaging-line-all':{ equipmentId:'packaging-line-all',name:'Packaging — whole line', code:'PKG-ALL', department:'packaging', type:'other', manualDocCode:null, serial:null, active:true, status:'in-service' }
  };
  (Source: CFIA Section 12 tea packaging confirms a sealer + scale on the packaging line; CoPilot-500 and ActionPak are the canonical line machines.)
- Seeding is an owner-authenticated write (one-off): a small script or admin button calls saveEquipment() per entry. Because doc IDs are deterministic slugs, re-running the seed is idempotent (overwrites, never duplicates).

DEPLOY:
- firestore.rules auto-deploys on push to main via /Users/chris/Desktop/Fratello/Fratello-Hub-codex/.github/workflows/deploy-firestore-rules.yml — the new match block ships automatically, NO manual console paste. firebase.json (rules: firestore.rules) needs no change.
- NO Storage change is required for the registry itself (it's pure Firestore). Only if/when you attach manual PDFs do you touch storage.rules, which is NOT auto-deployed yet and would need a manual firebase deploy --only storage.
- Recommend adding a cfia_equipment block to /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore-rules.test.js (the suite already models owner/controller/kyle/staff users): assert staff can read, owner can create/update, staff cannot write, nobody can delete, and equipmentId!=docId is rejected.
**Open questions**
- QA representation: isCfiaEquipmentAdmin() is owner-only until the rules can identify Kyle as QA/safety-officer. Do you want me to land the isSafetyOfficer() helper now (e.g. profile field safetyOfficer:true on hubProfiles, or a role_tier) so Kyle can manage equipment, or keep equipment admin owner-only for the pilot and add Kyle later? This is the same helper several other foundation items need.
- Name snapshot in records: store values.equipment_name_snapshot at submit time (so an audit export of an old record still prints the machine's name-as-it-was, even after rename/retire), or always resolve live via the registry? Snapshot is safer for true immutability/audit; live is simpler. Recommendation: snapshot.
- Enforce the equipmentId reference in the immutable cfia_records create rule now (the optional hardening), or after the form UI is updated? Turning it on before the form sends equipmentId would reject submissions. Recommendation: ship registry + form change first, flip the hardening second.
- Whole-line sentinel naming: OK to seed 'packaging-line-all' (and later 'roasting-line-all', 'facility-all') as registry docs of type 'other' to cover whole-area inspections, instead of allowing a null machine? Recommendation: yes.
- type enum coverage: is the proposed type list (bagger/sealer/scale/filler/conveyor/roaster/grinder/metal-detector/date-coder/other) complete enough for Packaging + the eventual Roasting/Warehouse rollout, or are there machine classes (destoner, magnet/screen, pallet wrapper) you want first-class now so CCP monitoring can hang off them later?
- Should retired equipment be hidden from managers/QA in admin views too, or only from the floor's NEW-record dropdown? (Rules allow read of retired docs to everyone; this is purely a UI filter decision.)
**Hardening (reviewer findings → fixes)**
- **[High]** OVER-BROAD READ / info disclosure. The match block ships `allow get, list: if signedIn()`. I read firestore.rules: `signedIn()` (lines 9-11) only checks `request.auth != null && request.auth.token.email != null` — it does NOT require an active hubProfile. The Hub's auth (system/fratello-auth.js lines 299-326) exposes open self-service account creation via `createUserWithEmailAndPassword`, Google, Apple AND Microsoft sign-in. So ANY person on the internet who creates a Firebase Auth account against this project (no invite, no hubProfile, profile status irrelevant) can `getDocs(collection('cfia_equipment'))` and enumerate the ENTIRE asset registry: every machine name, internal Fratello asset code (PKG-CP500 etc.), serial number, manufacturer, department layout, and maintenance state. A disabled ex-employee (hubProfiles.status=='disabled') retains full read too, because the rule never checks status. The proposal's own summary claims 'READABLE by any signed-in active staffer' — the rule does not implement 'active staffer', it implements 'anyone with a Google account'. This is a real disclosure of plant inventory to unauthenticated-in-practice outsiders.  
  _fix:_ Gate reads on an actual active staff identity, not bare auth. Replace `allow get, list: if signedIn();` with a real membership check, e.g. add helper `function hasAnyActiveProfile() { return signedIn() && exists(profilePath(request.auth.uid)) && get(profilePath(request.auth.uid)).data.status == 'active'; }` and use `allow get, list: if hasAnyActiveProfile();`. This matches the stated intent (active staffer can pick a machine), excludes random internet accounts AND disabled ex-employees, and reuses existing profilePath()/get() machinery already in the file.
- **[Medium]** QA GATE IS A NO-OP FOR THE INTENDED ADMIN. `isCfiaEquipmentAdmin()` resolves to `isOwner()` only (the `|| isSafetyOfficer()` line is commented out and no such helper exists). I confirmed in firestore-rules.test.js that Kyle Park's hubProfile is `profile:'production'` — identical to Allana and Jaleisy. So the person whose entire job is QA/safety officer over all departments CANNOT register, edit, or retire a single piece of equipment via the rules; only the two bootstrap owners can. Operationally this means owners become the bottleneck for all equipment lifecycle changes, OR (the dangerous failure mode) someone 'temporarily' widens the gate to `hasActiveProfile('production')` — which would let EVERY production operator (Allana, Jaleisy, and any future floor hire) rewrite the registry, poison equipmentId lookups, and silently retire machines. The design ships a security control that does not actually authorize the one role it was designed for.  
  _fix:_ Land a precise QA identity BEFORE shipping the registry, not after. Add a `safetyOfficer:true` boolean (or `role_tier:'qa'`) field on hubProfiles and a helper `function isSafetyOfficer() { return signedIn() && exists(profilePath(request.auth.uid)) && get(profilePath(request.auth.uid)).data.status == 'active' && get(profilePath(request.auth.uid)).data.safetyOfficer == true; }`, then `isCfiaEquipmentAdmin() { return isOwner() || isSafetyOfficer(); }`. Critically, set safetyOfficer ONLY on Kyle and freeze it as non-self-editable: extend selfProfileFieldsDoNotEscalate() (firestore.rules line 150-160) to also require `request.resource.data.safetyOfficer == resource.data.safetyOfficer`, or any staffer could self-grant QA admin via the existing self-update path. Do NOT fall back to widening to all 'production'.
- **[Medium]** SELF-PROFILE ESCALATION INTO QA ADMIN. firestore.rules line 192 allows a user to update their own hubProfile via selfProfileFieldsDoNotEscalate(), which freezes email/profile/status/role_tier/manager_id/department (lines 154-159) but NOTHING else. If the QA fix above introduces a new field (safetyOfficer or a new role_tier value) and that field is not added to the frozen list, a regular active staffer can PATCH their own hubProfiles/{uid} to set safetyOfficer:true and instantly become equipment admin — forging the exact role the registry trusts. This is an escalation the registry design relies on but does not close.  
  _fix:_ Whatever field encodes QA (safetyOfficer bool or a privileged role_tier) MUST be frozen in selfProfileFieldsDoNotEscalate(): add `&& request.resource.data.safetyOfficer == resource.data.safetyOfficer` (and, since role_tier is the escalation vector, keep the existing role_tier freeze). Only isOwner() may set it. Add a rules test asserting a 'production'/'staff' user CANNOT self-set safetyOfficer.
- **[Medium]** OPTIONAL HARDENING WEAKENS, NOT STRENGTHENS, THE IMMUTABLE RECORD GATE — and risks a production lockout. The proposal says 'Replace the existing create at lines 279-283 with this stricter version.' I read the live create rule (lines 279-283): it currently has four conjuncts (uid, email, submitted_at==request.time, created_via). The replacement snippet as written ONLY lists submitted_by_uid/email/submitted_at/created_via PLUS the two new equipmentId conjuncts — it is presented as a full replacement, so if pasted verbatim it does not change behavior much, BUT (a) it adds an exists() lookup to EVERY record write (latency + cost on the hot path of the whole module), and (b) cfia-core.js createRecord() (lines 56-87) does NOT currently write values.equipmentId — it writes the free-text `area` from form-schemas.js line 22. So flipping this hardening before the form/UI is updated will reject EVERY pre-operational inspection submission (the only form that exists today), a hard denial-of-service on the audit log. The proposal flags the ordering risk in openQuestions but still presents the snippet as a drop-in 'replace lines 279-283', which is a foot-gun.  
  _fix:_ Do NOT touch lines 279-283 in the same change as the registry. Sequence: (1) ship registry match block + read fix; (2) update form-schemas.js line 22 from the free-text `area` select to an equipment field and update cfia-core.js createRecord() to write values.equipmentId; (3) only after the form is live and emitting equipmentId, add the exists() hardening as a SEPARATE conjunction appended to the existing rule, and add a rules test that a record with a non-existent equipmentId is rejected and one with a valid (even retired) equipmentId is accepted. Also confirm Firestore allows exists() against another collection in a create rule (it does, but it counts as a billed read and contributes to the 10-document-access limit per evaluation).
- **[Medium]** SOFT-DELETE IS REVERSIBLE AND UNAUDITED — registry mutation can rewrite operational history of an asset. The update rule freezes equipmentId and the created_* provenance (good), but lets an admin flip active/status arbitrarily in BOTH directions and overwrite name/code/serial with no append-only trail. A machine can be retired (active:false) then silently un-retired (active:true) with only the latest updated_by_email/updated_at surviving — the prior values are gone. For CFIA/SFCR, the EQUIPMENT a CCP was monitored on is part of the audit story; if 'PKG-CP500 Bagger' is renamed or re-pointed, old immutable records still resolve their slug to whatever the registry NOW says, so the human-readable name an auditor sees for a 2-year-old record can silently differ from reality at time-of-record. The registry is mutable lookup state that immutable records depend on — that is an integrity gap the immutable cfia_records were specifically designed to avoid.  
  _fix:_ Adopt the name-snapshot recommendation as MANDATORY, not optional: cfia-core.js createRecord() must copy values.equipment_name_snapshot AND values.equipment_code_snapshot from the selected registry entry at submit time, so each immutable record carries the machine's identity AS-OF that record and never re-resolves through mutable state. Separately, treat registry edits as audit-relevant: either forbid un-retire (status 'retired' is terminal: in update, `resource.data.status != 'retired'` required to change fields), or write an append-only cfia_equipment_history/{autoId} entry on each change (create-only, like cfia_records). At minimum require updated_by_email/updated_at on EVERY update (the rule does require these — verify cfia-core.js never omits them, or the write silently fails).
- **[Low]** WHOLE-FACILITY SENTINEL + retired-equipment write path lets a record be filed against a meaningless or stale machine, undermining the 'every record resolves to a real machine' guarantee the registry is sold on. The exists()-not-active design (intentional) means a record can be filed against a machine retired earlier — fine — but combined with the 'packaging-line-all' / 'facility-all' type:'other' sentinels, the equipmentId field degrades back toward the free-text `area` it replaced: 'facility-all' carries no more audit precision than the old 'Whole facility' option. An operator (or a future widened-write actor) can also point new records at any existing slug regardless of department, since cfia_records.create hardening only checks exists(), never that values.equipmentId's department matches the record's department field.  
  _fix:_ Acceptable to keep sentinels, but (1) constrain sentinel use to forms/sections that genuinely have no single machine, and (2) if you want per-area integrity, add to the cfia_records hardening a cross-check that the referenced equipment's department equals the record's department: `get(/databases/$(database)/documents/cfia_equipment/$(request.resource.data.values.equipmentId)).data.department == request.resource.data.department` (note: adds a second cross-collection read). Document that sentinels are equivalent-precision to the old free-text and are not a CCP-grade reference.
- **[Low]** SEPARATION-OF-DUTIES / 3-TIER VERIFICATION IS ENTIRELY ABSENT — and this registry does nothing to enable it. The locked design requires staff completes → dept head signs off → Kyle/QA oversight, AND a person may not verify their own record. I read the live cfia_records block (lines 276-286): create-only, update:false, so there is currently NO verification field, NO sign-off write path, and NO separation-of-duties enforcement at all. The equipment proposal is scoped to the registry and explicitly does not touch this — but it is being presented as a CFIA foundation item, and an auditor will note that 'verification' is claimed but unenforceable: there is no rule that a sign-off's actor != the record's submitted_by_uid, and update:false means sign-offs cannot even be appended to a record. This is a gap the equipment work neither creates nor closes, but it must not be mistaken as covered.  
  _fix:_ Out of scope for the registry, but flag explicitly: the verification/SoD model needs its own design (likely a separate append-only cfia_verifications/{id} collection with rules `allow create: if isDeptHead/isSafetyOfficer && request.resource.data.verified_record_submitted_by_uid != request.auth.uid` to enforce no-self-verify, since cfia_records itself is update:false). Do not let the equipment registry's completion imply CFIA verification is in place.

---

## training-acks
**Review verdict:** NO REVIEW — re-vet needed

Store training completions and document acknowledgements as two NEW immutable, append-only collections, never embedded in the mutable hubProfiles doc. Each doc is a raw EVENT: "uid X passed module Y v=V at server-time T, expires E" or "uid X acknowledged doc D v=V at T". A person may create ONLY their own self-stamped, server-time-stamped event; nobody (not the author, a manager, or the owner) may ever update or delete one. Reads: a person reads their own; a department head / safety officer (Kyle/QA) / owner / controller reads their team. Compliance state (done / due-soon / overdue / never-done) is COMPUTED at read time from the latest event per (uid, code) against the document-register's required version + cadence, deliberately NOT stored. That is what keeps the collection append-only and audit-truthful: the event log is the truth, status is just a view of it.

Two foundational gaps had to be resolved to write real rules. (1) hubProfiles has NO safetyOfficer or dept-head concept yet. The profile already carries department, role_tier, manager_id (confirmed in system/fratello-auth.js and referenced by selfProfileFieldsDoNotEscalate in firestore.rules lines 150-160). Minimal additive change: add safetyOfficer:bool and deptHeadOf:list<string> to hubProfiles, and add helpers isSafetyOfficer(), isDeptHead(dept), isManagerOf(dept). (2) The existing self-write idiom only get()s the WRITER's profile; to let a manager read a teammate's record the rule must also get() the SUBJECT's profile at hubProfiles/{subjectUid}. I add subjectProfilePath(uid)/subjectDept(uid) for that.

This mirrors the existing immutable cfia_records block (firestore.rules lines 270-286) exactly: self-uid, self-email, takenAt/readAt == request.time, created_via literal, update:false, delete:false. Files grounding this: /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore.rules, /Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/system/cfia-core.js, /Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/config/document-register.js, /Users/chris/Desktop/Fratello/Fratello-Hub-codex/cfia/config/departments.js, /Users/chris/Desktop/Fratello/Fratello-Hub-codex/system/fratello-auth.js.

**Data shape**

```
COLLECTION cfia_training_completions/{autoId} — one immutable doc per persisted attempt. Doc-id is autoId so a person accumulates a full attempt history (append-only). Recommend persisting passes always; see Open Questions re: persisting fails.
  uid: string            REQUIRED, == request.auth.uid. The subject IS the writer.
  email: string          REQUIRED, == request.auth.token.email (lower-cased via normalizeEmail() like cfia-core.js).
  moduleCode: string     REQUIRED, non-empty. document-register code of the Quiz/Training, e.g. "8.4" (HACCP Training Quiz), "8.5" (Personal Hygiene Quiz). Note register has both Quiz and Training docType; this collection covers both.
  moduleTitle: string    snapshot of the title at completion time (audit denormalization — register may change later).
  version: string        REQUIRED. The version the person was tested on, copied from the register entry (e.g. "1.0"). Drives "you passed an OLD version" recompute.
  score: number          REQUIRED, 0..100 (percent). Integer or float.
  passThreshold: number  REQUIRED, the threshold in force at the time (locked decision = 90). Stored so a later policy change does not retroactively invalidate/validate past attempts.
  passed: bool           REQUIRED, must == (score >= passThreshold). Enforced in rules so the client cannot mark a fail as a pass.
  takenAt: timestamp     REQUIRED, == request.time (serverTimestamp()). Unforgeable "when".
  expiresAt: timestamp   REQUIRED for a pass. = takenAt + annual expiry (locked: annual). Stored, not derived, so the expiry policy at completion time is frozen into the record. Rules cannot do calendar math, so the client computes it and the rule sanity-checks expiresAt > takenAt. For a fail, expiresAt may be null.
  department: string     OPTIONAL snapshot of the subject's department at completion (from hubProfiles.department). Aids the manager team-view query and audit.
  created_via: string    REQUIRED, == "cfia-hub" (same literal guard as cfia_records).
  (NO status / NO compliant field — computed downstream.)

COLLECTION cfia_acknowledgements/{autoId} — one immutable doc per "I have read and understood doc D at version V".
  uid: string            REQUIRED, == request.auth.uid.
  email: string          REQUIRED, == request.auth.token.email (normalized).
  docCode: string        REQUIRED, non-empty. document-register code, e.g. "8.1" (Hygiene & GMP Policy), "6.1" (Sanitation). NOTE: several register rows have code:"" (policies with no code) — for those the front end must pass a stable synthetic key (e.g. a slug of the title); see Edge Cases.
  docTitle: string       snapshot of the title at ack time.
  version: string        REQUIRED. The exact document version acknowledged (e.g. "Mar 2025", "2", "1.0"). A new version REQUIRES a new ack — old ack does not satisfy the new version.
  readAt: timestamp      REQUIRED, == request.time (serverTimestamp()).
  department: string     OPTIONAL snapshot of subject's department.
  created_via: string    REQUIRED, == "cfia-hub".
  (NO status — computed.)

ADDITIVE FIELDS ON hubProfiles/{uid} (new):
  department: string     ALREADY EXISTS (e.g. "Roasting"/"Packaging"/"Warehouse"/"Leadership"). Reused as the team key. NOTE a normalization gap: departments.js uses keys roasting/packaging/warehouse but fratello-auth.js seeds Title-Case "Roasting"/"Packaging"/"Warehouse" — pick ONE canonical form (see Open Questions).
  safetyOfficer: bool    NEW. true for Kyle Park (QA over ALL departments). Defaults false/absent.
  deptHeadOf: list<string>  NEW. departments this person is the supervisor/head of, e.g. ["packaging"]. Empty/absent for non-heads. (A list, not a single value, so one supervisor can head multiple departments.)

COMPUTED, NOT STORED (front end derives, e.g. in a new cfia-compliance.js):
  For each required (uid, code): latestEvent = max takenAt/readAt among events matching code AND current required version. status =
    never-done   -> no event at the required version,
    overdue      -> training: now > expiresAt, OR ack: required version != acknowledged version; 
    due-soon     -> training: expiresAt within N days (e.g. 30),
    done         -> otherwise (passed && not expired && version current).
  "Required set" per person = document-register rows of docType in {Quiz, Training} (training) or the policies/SOPs the dept requires (acks), filtered by docInDepartment(doc, personDept) from departments.js.
```
**Rules / code snippet**

```
// ── Add these helpers ALONGSIDE the existing ones (near isController, line ~43-59).
// They reuse signedIn(), signedInEmail(), profilePath(uid) already in firestore.rules.

// The CALLER's own profile data (writer). Mirrors isController()'s get() pattern.
function myProfile() {
  return get(profilePath(request.auth.uid)).data;
}
function myProfileActive() {
  return signedIn()
    && exists(profilePath(request.auth.uid))
    && myProfile().status == 'active';
}

// Kyle / QA: oversight over EVERY department.
function isSafetyOfficer() {
  return myProfileActive() && myProfile().safetyOfficer == true;
}

// Department head (supervisor) of a specific department.
function isDeptHead(dept) {
  return myProfileActive()
    && (dept in myProfile().get('deptHeadOf', []));   // .get() => safe if field absent
}

// "Manager of this department" = owner/controller (all depts) OR QA OR that dept's head.
function isManagerOf(dept) {
  return isOwnerOrController() || isSafetyOfficer() || isDeptHead(dept);
}

// The SUBJECT's profile (the person the record is about) — needed for team reads.
function subjectProfilePath(uid) {
  return /databases/$(database)/documents/hubProfiles/$(uid);
}
function subjectDept(uid) {
  return exists(subjectProfilePath(uid))
    ? get(subjectProfilePath(uid)).data.department
    : '';
}

// Shared write guards for both append-only collections.
function isSelfStampedEvent(d, stampField) {
  return signedIn()
    && d.uid == request.auth.uid
    && d.email == signedInEmail()
    && d[stampField] == request.time          // server time, unforgeable "when"
    && d.created_via == 'cfia-hub'
    && d.version is string && d.version.size() > 0;
}

// ── Match blocks (place next to the cfia_records block, ~line 286). ──

match /cfia_training_completions/{completionId} {
  // A person reads their OWN; a manager/QA/dept-head reads their TEAM; owner/controller read all.
  allow get, list: if signedIn()
    && (
      resource.data.uid == request.auth.uid
      || isManagerOf(resource.data.department)        // dept snapshot stored on the doc
      || isManagerOf(subjectDept(resource.data.uid))  // fallback to live subject dept
    );

  // Create-only, self + server stamped, append-only. score/passed/threshold validated.
  allow create: if isSelfStampedEvent(request.resource.data, 'takenAt')
    && request.resource.data.moduleCode is string
    && request.resource.data.moduleCode.size() > 0
    && request.resource.data.score is number
    && request.resource.data.score >= 0 && request.resource.data.score <= 100
    && request.resource.data.passThreshold is number
    && request.resource.data.passed is bool
    // client cannot lie about pass/fail:
    && request.resource.data.passed == (request.resource.data.score >= request.resource.data.passThreshold)
    // a PASS must carry a future expiry; a FAIL may have null expiry:
    && (
      (request.resource.data.passed == true
        && request.resource.data.expiresAt is timestamp
        && request.resource.data.expiresAt > request.time)
      || (request.resource.data.passed == false
        && (!('expiresAt' in request.resource.data) || request.resource.data.expiresAt == null))
    );

  // IMMUTABLE: never edit, never delete — not author, not manager, not owner.
  allow update: if false;
  allow delete: if false;
}

match /cfia_acknowledgements/{ackId} {
  allow get, list: if signedIn()
    && (
      resource.data.uid == request.auth.uid
      || isManagerOf(resource.data.department)
      || isManagerOf(subjectDept(resource.data.uid))
    );

  allow create: if isSelfStampedEvent(request.resource.data, 'readAt')
    && request.resource.data.docCode is string
    && request.resource.data.docCode.size() > 0;

  allow update: if false;
  allow delete: if false;
}

// NOTE on hubProfiles: selfProfileFieldsDoNotEscalate(uid) (lines 150-160) pins the
// fields a user may not change on themselves. Add safetyOfficer + deptHeadOf to that
// pin list so a staffer cannot self-promote to dept head / QA:
//   && request.resource.data.safetyOfficer == resource.data.safetyOfficer
//   && request.resource.data.deptHeadOf == resource.data.deptHeadOf
```
**Edge cases**
- Self-promotion via profile edit: a staffer must NOT be able to set their own safetyOfficer=true or add themselves to deptHeadOf. The current self-update path selfProfileFieldsDoNotEscalate() (firestore.rules 150-160) pins profile/status/role_tier/department/manager_id but does NOT yet pin the two NEW fields. You MUST add safetyOfficer and deptHeadOf to that pin, or owner-only update is bypassed.
- list-query vs get-rule mismatch: rules evaluate per-document, but a manager's team query needs a server-side filter (e.g. where('department','==', dept)) or it will be rejected/expensive. The stored department snapshot on each event doc exists precisely so the client can run where('department','==', myDept) and have every returned doc pass isManagerOf(resource.data.department). Relying on subjectDept(uid) alone forces a get() per doc (read amplification + cost) and cannot back a list query.
- Department key normalization: departments.js uses lower-case keys (roasting/packaging/warehouse/company) but fratello-auth.js seeds Title-Case hubProfiles.department ('Roasting','Packaging','Warehouse','Leadership','Finance'). deptHeadOf, the stored event.department, and isManagerOf() comparisons must all use ONE canonical casing or every manager read silently returns nothing. Recommend lower-case register keys everywhere; normalize on write.
- pass==fail forgery: without the rule check passed == (score >= passThreshold), a tampered client could write score:10, passed:true. The rule enforces the relationship so the boolean cannot contradict the number. passThreshold is also stored per-record so changing the policy from 90 later does not retroactively flip historical passes/fails.
- expiresAt cannot be computed in rules: Firestore rules have no date arithmetic, so annual expiry is computed client-side. The rule can only sanity-check expiresAt is a timestamp strictly after takenAt; it cannot verify it is exactly +1 year. A malicious client could set a far-future expiry. Mitigation options: accept (low risk, audit log is immutable and timestamps are server-stamped), or add an upper bound like expiresAt < request.time + duration.value(400,'d') if rules duration math is acceptable.
- Version supersession for acks: a NEW document version must require a NEW acknowledgement. Because each ack stores the exact version string, compliance recompute marks an ack stale when register.version != ack.version. There is no edit path, so re-acknowledging is simply a new append-only doc — consistent with the supersede-link philosophy of cfia_records.
- Codeless documents: several document-register rows have code:'' (e.g. Drug and Alcohol Policy, Harassment Policy, job descriptions). docCode must be non-empty in the rules, so the front end must supply a stable synthetic code (e.g. slug of title) for these, and that same key must be used in the required-set recompute. Decide the slug scheme once and freeze it (changing it later orphans past acks).
- Separation of duties is NOT this collection's job: training/acks are self-attestations (you can record your own training), which is correct. The 3-tier verification + 'cannot verify your own record' rule lives on cfia_records / a future verification collection, not here. Be careful not to accidentally let a person's manager status leak into write permission — writes are self-only by design.
- Disabled / departed staff: a person who leaves keeps an active immutable training/ack history (records retained >= 2 years, never auto-deleted). If their hubProfiles doc is deleted, subjectDept(uid) returns '' and only the stored event.department snapshot can authorize manager reads — another reason the snapshot must be stored on the event.
- Time zone: expiry and due-soon are conceptually America/Edmonton (locked), but Firestore timestamps are UTC instants. takenAt/expiresAt are stored as instants; the due-soon/overdue boundary should be computed against Edmonton local calendar days in the front end to avoid off-by-one-day audit disputes.
- Self-read of own department on the event: isManagerOf(subjectDept) does a get() on the subject's profile every evaluation; for a person reading their OWN record the cheaper resource.data.uid == request.auth.uid branch must be listed FIRST (it is) so the expensive get() is short-circuited.
**Integration notes**

FRONT END (new module, e.g. cfia/system/cfia-compliance.js, sibling to cfia-core.js):
- Reuse the exact auth + Firestore wiring from cfia-core.js: initFirebase()/db(), authState().currentUser for uid, normalizeEmail(u.email) for email, and serverTimestamp() for takenAt/readAt. Do NOT invent a second auth path.
- recordCompletion(module, score): builds { uid, email, moduleCode: module.code, moduleTitle: module.title, version: module.version, score, passThreshold: 90, passed: score>=90, takenAt: serverTimestamp(), expiresAt: <takenAt + 1yr computed client-side>, department: role.user.department, created_via:'cfia-hub' } then addDoc(collection(db,'cfia_training_completions'), ...). Mirror createRecord() in cfia-core.js.
- recordAcknowledgement(doc): { uid, email, docCode: doc.code || slug(doc.title), docTitle, version: doc.version, readAt: serverTimestamp(), department, created_via:'cfia-hub' } then addDoc to cfia_acknowledgements.
- computeCompliance(personDept, events): pure client function. Build required set from DOCUMENT_REGISTER (config/document-register.js) filtered by docInDepartment(doc, personDept) (config/departments.js); for training require docType in {Quiz, Training}; for acks require Policy/SOP/Plan as the program dictates. For each, find latest matching-version event, derive done/due-soon/overdue/never-done. This is the ONLY place status exists — it is never written back.
- Manager/QA team view: query where('department','==', dept) (and optionally where('uid','==', x)) so the list-rule passes per doc via the stored department snapshot. Do not attempt an unfiltered getDocs of the whole collection for non-owners.

DEPLOY / CONFIG:
- firestore.rules auto-deploys: the GitHub Action .github/workflows/deploy-firestore-rules.yml triggers ONLY on changes to firestore.rules (paths filter). Adding these match blocks to firestore.rules will auto-deploy on push to main. No firebase.json change needed for Firestore (firebase.json currently has only the firestore.rules entry).
- Composite indexes: queries like where('department','==',x) + orderBy('takenAt','desc') will need a Firestore composite index. firebase.json has NO firestore.indexes.json entry today; add one (and an indexes file) or create the index from the console link Firestore emits on first query. Flag this so the manager view does not 'work in dev, fail in prod'.
- hubProfiles seeding: update system/fratello-auth.js (profileForUser / invite path) to default safetyOfficer:false and deptHeadOf:[] so existing/new profiles have the fields; set Kyle Park's safetyOfficer:true and each supervisor's deptHeadOf via the Manage People admin UI (owner-only update path).
- STORAGE RULES (photo evidence, locked decision): NOT in scope of this collection AND not auto-deployed. firebase.json has no 'storage' block and there is no storage.rules file in the repo. When photo evidence lands, you must (a) add a storage.rules file, (b) add a 'storage' entry to firebase.json, and (c) either extend the GitHub Action to run firebase deploy --only storage (its paths filter currently watches firestore.rules only) or deploy Storage rules manually. Document this as a required deploy step.
- Tests: firestore-rules.test.js has NO cfia coverage yet. Add @firebase/rules-unit-testing cases: self can create own pass; cannot create for another uid; cannot forge passed=true with low score; cannot set takenAt != request.time; update/delete always denied; dept head reads team, other dept head denied; safety officer reads all; staffer cannot self-set safetyOfficer.
**Open questions**
- Persist failed attempts? Storing fails gives a richer audit trail (who keeps failing the HACCP quiz) but adds noise. If yes, the create rule already allows passed=false with null expiry. If no, the front end simply does not write fails. Decision affects whether 'attempts' analytics are possible.
- Canonical department casing: standardize on lower-case keys (roasting/packaging/warehouse/company, matching departments.js) everywhere — hubProfiles.department, deptHeadOf, event.department snapshots — and migrate the Title-Case values fratello-auth.js currently seeds? Without one canonical form, manager team-reads silently return nothing.
- deptHeadOf as a list vs single department: I modeled it as a list so one supervisor can head multiple departments. Confirm that matches reality, or simplify to a single string deptHead.
- Synthetic codes for codeless docs: what slug scheme for the code:'' register rows (Drug & Alcohol Policy, Harassment Policy, job descriptions) that must be acknowledged? It must be stable forever (changing it orphans past acks). Proposal: lower-kebab slug of the exact title.
- Due-soon window: how many days before expiresAt counts as 'due-soon' (proposed 30)? And is the boundary evaluated in America/Edmonton local days (recommended for audit clarity)?
- Expiry tamper bound: accept that a malicious client could write a far-future expiresAt (rules cannot do exact calendar math, only expiresAt > takenAt), or add an upper bound like expiresAt < takenAt + ~400 days in rules? Low real-world risk given server-stamped immutable log, but it is a real gap.
- Do acknowledgements cover SOPs/Plans or only Policies? The required-set recompute depends on which docType(s) demand a sign-off. Define the program's list (e.g. all Policy + safety-critical SOPs) so 'overdue' is meaningful.
- Should QA/owner be able to read across ALL departments via list without a department filter? Current rules require a per-doc department match for the list query to be cheap; an unfiltered all-records audit export for owner/QA may need a separate allowance or a Cloud Function with admin credentials.
- Who maintains the safetyOfficer flag and deptHeadOf assignments — only owners through Manage People, or also controllers? This determines whether to gate those two fields behind isOwner() specifically rather than isOwnerOrController() in the profile update path.

---

## storage-photos
**Review verdict:** needs-fix

Design for storing CFIA evidence photos and versioned reference PDFs in Firebase Storage, with each resulting Storage path written IMMUTABLY onto the cfia_records doc.

LOAD-BEARING CONSTRAINT (verified): Firebase Storage security rules CANNOT call Firestore get()/exists() — there is no cross-service lookup in Storage rules v2. Storage rules see only request.auth (signed-in, token.email, custom claims), NOT the hubProfiles doc that firestore.rules reads via get(profilePath(uid)). So the role/department gating that firestore.rules performs cannot be reproduced inside storage.rules today. This drives the whole design: Storage enforces coarse, content-shape gating (signed-in to read; signed-in + correct content-type + size cap + immutable/no-overwrite path to write; nobody deletes), and the strongly role-gated Firestore cfia_records doc remains the authoritative audit artifact. The binary is evidence; the record is the legal object.

MODEL: Storage objects are write-once and NEVER deleted (no delete for anyone, including owner). Evidence photos live at cfia/records/{recordId}/{file}. Versioned reference PDFs live at cfia/reference/{sopCode}/v{version}/{file}. recordId must be generated BEFORE the photo upload so the same id names both the Storage path and the doc; the full path(s) are then written into an immutable photos[] array on the cfia_records doc. The existing Firestore create rule already forbids update + delete, so once written the path is permanent and tamper-evident.

REPO FACTS that shape this (absolute paths):
- /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore.rules has helpers signedIn(), signedInEmail(), isOwner(), isController(), isOwnerOrController(), hasActiveProfile(profile). It does NOT yet contain isSafetyOfficer()/isDeptHead() (memory describes them as proposed, not present). The cfia_records create rule today validates only submitted_by_uid, submitted_by_email, submitted_at==request.time, created_via=='cfia-hub' — it does NOT yet constrain a photos field.
- /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firebase.json contains only {"firestore":{"rules":"firestore.rules"}} — no storage block, no bucket.
- /Users/chris/Desktop/Fratello/Fratello-Hub-codex/.github/workflows/deploy-firestore-rules.yml triggers only on path firestore.rules and runs `firebase deploy --only firestore:rules`. Storage rules are NOT auto-deployed.
- /Users/chris/Desktop/Fratello/Fratello-Hub-codex/system/fratello-auth.js: initFirebase() returns {ready, auth, db} only — NO storage handle; window.FRATELLO_FIREBASE_CONFIG has no storageBucket key visible (must be added).
- Form engine field types in cfia/system/fh-render-form.js are date/text/select/textarea/status; a new 'photo' type slots in cleanly. createRecord() in cfia/system/cfia-core.js builds the doc and calls buildRecordId() internally — that id must be hoisted out so it exists before upload.

**Data shape**

```
Firestore: cfia_records/{recordId} gains an immutable photos array (append-only at create; update/delete already false). Each element:

photos: array<map> (default []), where each map =
  path:        string   // full Storage object path, e.g. "cfia/records/REC6-3A-20260623-4821/chem-01.jpg". REQUIRED, immutable.
  field_id:    string   // which form field captured it, e.g. "chem" (ties photo to the failed checklist line). REQUIRED.
  content_type:string   // "image/jpeg" | "image/png" | "image/webp" | "application/pdf". REQUIRED.
  size_bytes:  number   // client-reported size for cross-check vs Storage metadata. REQUIRED, > 0.
  sha256:      string   // hex digest computed client-side over the bytes — tamper-evidence linking doc<->object. OPTIONAL but recommended for audit.
  caption:     string   // optional human note, e.g. "residue on roaster chute". default "".
  captured_at: timestamp// serverTimestamp() at submit (same instant as submitted_at). REQUIRED.

Reference PDFs (separate, low-churn collection cfia_reference_docs/{autoId}) — versioned source-of-truth pointers:
  sop_code:    string   // "6.3"
  title:       string   // "Pre-Operational Inspection Procedure"
  version:     string   // "2"  (matches the v{version} segment in the path)
  path:        string   // "cfia/reference/6.3/v2/sop-6-3.pdf"
  content_type:string   // "application/pdf"
  superseded_by: string|null // autoId of the doc that replaces this version (never edit; supersede)
  uploaded_by_uid:   string
  uploaded_by_email: string
  uploaded_at: timestamp // serverTimestamp

Storage object metadata (set at upload via uploadBytes customMetadata) — gives the audit a second, independent copy of provenance that lives ON the object:
  uploadedByUid:   request.auth.uid
  uploadedByEmail: token.email
  recordId:        the owning cfia_records id (for photos) — lets you walk object->record
  fieldId:         form field id
Storage also auto-records timeCreated, size, contentType, md5Hash — use these in the rules and as the audit cross-check.

TYPES NOTE: photos[].path is a plain string (NOT a Firestore reference) so it is portable and survives export; resolution to a download URL happens client-side via getDownloadURL(ref(storage, path)).
```
**Rules / code snippet**

```
// ── storage.rules (NEW FILE at repo root) ──
// rules_version 2. Firebase Storage rules CANNOT read Firestore, so these are
// content-shape + signed-in checks only; cfia_records (firestore.rules) is the
// authoritative role-gated audit object. NEVER delete; writes are no-overwrite.
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // mirror firestore.rules' signedIn(): a real account with an email
    function signedIn() {
      return request.auth != null && request.auth.token.email != null;
    }
    function isImageOrPdf() {
      return request.resource.contentType.matches('image/(jpeg|png|webp)')
          || request.resource.contentType == 'application/pdf';
    }
    function underSizeCap() {
      // 25 MB ceiling — phone photos + scanned PDFs, blocks abuse
      return request.resource.size > 0
          && request.resource.size < 25 * 1024 * 1024;
    }
    function isNewObject() {
      // resource == null means no existing object -> create-only, no overwrite
      return resource == null;
    }
    // provenance must be stamped on the object and match the caller
    function selfStamped() {
      return request.resource.metadata.uploadedByUid == request.auth.uid
          && request.resource.metadata.uploadedByEmail == request.auth.token.email;
    }

    // ── CFIA evidence photos: cfia/records/{recordId}/{file} ──
    match /cfia/records/{recordId}/{fileName} {
      allow read:   if signedIn();                 // any Hub user may view evidence
      allow create: if signedIn()
                    && isNewObject()               // write-once, never overwrite
                    && isImageOrPdf()
                    && underSizeCap()
                    && selfStamped()
                    && request.resource.metadata.recordId == recordId;
      allow update: if false;                       // immutable
      allow delete: if false;                       // NEVER, not even owner
    }

    // ── Versioned reference PDFs: cfia/reference/{sopCode}/v{version}/{file} ──
    // Locked to a fixed published version path; a new revision is a NEW v{n}
    // folder (supersede, never overwrite) — same append-only discipline.
    match /cfia/reference/{sopCode}/{versionDir}/{fileName} {
      allow read:   if signedIn();
      allow create: if signedIn()
                    && isNewObject()
                    && request.resource.contentType == 'application/pdf'
                    && underSizeCap()
                    && selfStamped()
                    && versionDir.matches('v[0-9]+');
      allow update: if false;
      allow delete: if false;
    }

    // Default deny everything else in the bucket.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}

// ── firestore.rules CHANGE: tighten cfia_records create so the immutable
// photos[] array is sane and self-stamped. Reuses existing signedIn()/
// signedInEmail(). Add INSIDE the existing match /cfia_records/{recordId}. ──
function photosWellFormed() {
  // photos is a list (default []); validate the common-case fields exist & types.
  // (Firestore rules can't iterate arbitrarily; cap count and type-check the array.)
  return request.resource.data.photos is list
      && request.resource.data.photos.size() <= 30;
}

match /cfia_records/{recordId} {
  allow get, list: if isOwnerOrController()
    || (signedIn() && resource.data.submitted_by_email == signedInEmail());
  allow create: if signedIn()
    && request.resource.data.submitted_by_uid == request.auth.uid
    && request.resource.data.submitted_by_email == signedInEmail()
    && request.resource.data.submitted_at == request.time
    && request.resource.data.created_via == 'cfia-hub'
    && photosWellFormed();                 // <-- new: array present & bounded
  allow update: if false;                  // photos[] is therefore permanent
  allow delete: if false;
}

// NEW collection: versioned reference PDFs. Read for all signed-in staff;
// upload restricted to owner/controller (managers curate the SOP library);
// never edit/delete — a new version supersedes via superseded_by.
match /cfia_reference_docs/{docId} {
  allow get, list: if signedIn();
  allow create: if isOwnerOrController()
    && request.resource.data.uploaded_by_uid == request.auth.uid
    && request.resource.data.uploaded_by_email == signedInEmail()
    && request.resource.data.uploaded_at == request.time;
  allow update, delete: if false;
}
```
**Edge cases**
- ATOMICITY GAP (most important): the photo upload to Storage and the cfia_records doc write are two operations with no transaction across services. If the upload succeeds but the doc write fails, you get an ORPHAN object (a photo in Storage referenced by no record); if the doc is written first with a path that never gets uploaded, you get a DANGLING reference (record points at a missing object). Mitigation: upload photos FIRST, collect their paths, then write the record last so the record never references a missing object; the only failure mode left is harmless orphan objects, which is acceptable for an append-only audit store (orphans are inert and never deleted). A periodic reconcile job can list orphans for review.
- recordId GENERATION ORDER: buildRecordId() currently runs INSIDE createRecord() in cfia/system/cfia-core.js, so the id does not exist until the doc is built. To name the Storage path BEFORE upload, buildRecordId must be hoisted (call it, hold the id, upload to cfia/records/{id}/..., then pass the SAME id when creating the doc). If two records collide on the random suffix the Storage path would collide — but isNewObject() (resource==null) makes the second upload fail closed rather than overwrite, surfacing the collision.
- STORAGE CANNOT VERIFY ROLE: because Storage rules can't read hubProfiles, a disabled (status!='active') or wrong-department user who is still signed in can technically upload an image to cfia/records/*. It is inert until a cfia_records doc references it, and the Firestore create rule is the real gate (it requires created_via, self-stamping, and is role-readable). Document this explicitly for the auditor: Storage is a content store, the record is the control.
- FILENAME / PATH INJECTION: a malicious client could pass '..' or odd unicode in {fileName}. Storage treats the path literally (no traversal), but the front end must sanitize filenames before upload and the rules pin contentType + size; never trust the client filename for anything but display.
- CONTENT-TYPE SPOOFING: request.resource.contentType comes from the upload, not from sniffing bytes. A client could mislabel a file. Rules cap size and restrict the declared type; for true assurance store the client-computed sha256 on the record and (optionally) a Cloud Function that re-checks magic bytes post-upload. Out of scope for v1 but note it.
- REFERENCE PDF VERSIONING: overwriting cfia/reference/{sop}/v2/file.pdf is blocked (isNewObject). A corrected SOP MUST go to v3 and the old cfia_reference_docs row gets superseded_by set — except update is false, so 'setting superseded_by' actually means creating the new version row and the OLD row stays as-is; resolve 'current version' by querying for the row with the highest version / null superseded_by chain, OR relax the reference-doc rule to allow ONLY a superseded_by transition. Decide (see openQuestions).
- RETENTION vs LIFECYCLE RULES: GCS bucket-level lifecycle/TTL rules can delete objects even though Storage SECURITY rules say delete:false (lifecycle bypasses security rules). For >=2-year, never-auto-delete retention you MUST ensure NO lifecycle delete rule is configured on the bucket, and ideally enable Bucket Lock / retention policy. Security rules alone do not guarantee retention.
- PHOTOS ARRAY UNBOUNDED VALIDATION: Firestore rules can't deep-validate every element of photos[]; the rule only checks it's a list and bounded (<=30). A client could write a photos entry whose path points at an object that doesn't exist or that belongs to another record. Because the doc is immutable this is permanent, so the front end must build photos[] only from paths it actually uploaded this submission. Auditors should treat sha256 (when present) as the integrity link.
- SIGNED-OUT / TOKEN EXPIRY MID-UPLOAD: large photo on slow plant wifi may outlast the auth token. uploadBytes will fail; the front end must catch and prompt re-sign-in, and must NOT write the record if any photo upload failed (else dangling reference).
**Integration notes**

DEPLOY (this is the part the existing Action does NOT cover):
1. firebase.json — add a storage block alongside firestore:
   {"firestore":{"rules":"firestore.rules"},"storage":{"rules":"storage.rules"}}
   File: /Users/chris/Desktop/Fratello/Fratello-Hub-codex/firebase.json
2. Create /Users/chris/Desktop/Fratello/Fratello-Hub-codex/storage.rules (content in rulesSnippet).
3. The Action /Users/chris/Desktop/Fratello/Fratello-Hub-codex/.github/workflows/deploy-firestore-rules.yml only triggers on path firestore.rules and runs `firebase deploy --only firestore:rules`. Storage rules will NOT auto-deploy. Two options: (a) MANUAL one-time-per-change deploy: `firebase deploy --only storage --project fratello-hub`; or (b) extend the Action — add 'storage.rules' to the paths: trigger and change the deploy step to `firebase deploy --only firestore:rules,storage --project fratello-hub`. Recommend (b) so Storage rules track the repo like Firestore rules do. (If renaming the workflow, also widen the path filter.)
4. The Storage BUCKET must exist and be wired into the client config: window.FRATELLO_FIREBASE_CONFIG needs a storageBucket key (e.g. fratello-hub.appspot.com) — it is not present in the visible config. Confirm the bucket and add it.

CLIENT WIRING (system/fratello-auth.js + cfia/system/cfia-core.js):
5. initFirebase() in /Users/chris/Desktop/Fratello/Fratello-Hub-codex/system/fratello-auth.js currently returns {ready, auth, db} only. Add getStorage(app) and return storage too (import { getStorage } from '.../firebase-storage.js'), so cfia-core can reach the bucket through the existing single app instance ('fratello-hub').
6. cfia/system/cfia-core.js createRecord(): import { ref, uploadBytes } from firebase-storage. NEW flow: (a) hoist const recordId = buildRecordId(form, fields) to the TOP of createRecord; (b) for each captured photo blob, path = `cfia/records/${recordId}/${safeName}`, await uploadBytes(ref(storage, path), blob, { contentType, customMetadata: { uploadedByUid: u.uid, uploadedByEmail: normalizeEmail(u.email), recordId, fieldId } }); (c) compute sha256 if feasible; (d) build photos[] = [{path, field_id, content_type, size_bytes, sha256, caption, captured_at: serverTimestamp()}]; (e) include record_id: recordId and photos in the addDoc payload. Upload photos BEFORE addDoc so the doc never references a missing object (see Atomicity edge case).

FORM ENGINE (cfia/system/fh-render-form.js):
7. Add a new field type 'photo' to the existing date/text/select/textarea/status set. renderField() renders <input type="file" accept="image/*" capture="environment" multiple?> (capture=environment opens the rear camera on phones at the plant). getValue() for a photo field returns the selected File/Blob list (NOT a string). collect() must surface these blobs separately so createRecord can upload them; the photos[] written to the doc is built in cfia-core, not here. A schema entry looks like { id:'chem_photo', label:'Photo of issue', type:'photo', requiredIf:'chem==Fail' } — i.e. photo capture is typically conditional on a Fail status, matching the form-6-3a checklist where a failed line needs evidence.
8. Reading evidence back (records.html / department.html): resolve each photos[].path with getDownloadURL(ref(storage, path)) at view time — do NOT store download URLs in the doc (they contain rotating tokens and would bloat the immutable record). Store only the stable path.
**Open questions**
- ROLE GATING IN STORAGE — accept coarse or invest in custom claims? Storage rules cannot read hubProfiles. Option A (recommended for v1): any signed-in Hub user can read/write evidence under cfia/records/*, and the Firestore record is the real audit gate. Option B: mint Firebase Auth custom claims (profile, department, status) via a Cloud Function / admin step so storage.rules can check request.auth.token.profile and gate per-role/per-department. B is more audit-defensible but needs a claims-setting backend that does not exist yet. Which way for launch?
- WHO MAY UPLOAD REFERENCE PDFs? Proposed: owner/controller only (managers curate the SOP library). Should Kyle Park (QA/safety officer) also be allowed once an isSafetyOfficer() helper / claim exists? Note isSafetyOfficer()/isDeptHead() are described in memory but are NOT in firestore.rules yet — they need to be added before any reference-doc rule can mention them.
- REFERENCE-DOC SUPERSEDE MECHANICS: with update:false on cfia_reference_docs, the old version's superseded_by can never be set after the fact. Either (a) resolve 'current version' purely by querying highest version with no successor (no field mutation needed), or (b) relax the rule to allow EXACTLY a null->docId transition on superseded_by only. Which model?
- SIZE CAP: 25 MB per object proposed. Confirm — plant phones can produce ~5-12 MB photos; multi-page scanned PDFs could exceed it. Also: do we cap total photos per record (rule currently <=30)?
- CLIENT-SIDE IMAGE COMPRESSION: should the front end downscale/recompress photos before upload (faster on plant wifi, smaller store) — or keep originals for maximum evidentiary fidelity? Affects size cap and the sha256 (compression changes the digest).
- SHA256 ON THE RECORD: compute and store a client-side sha256 of each photo for tamper-evidence (lets an auditor prove the stored object matches what was submitted)? Adds a little client work; strongly recommended for audit-grade but confirm.
- BUCKET RETENTION HARDENING: to honour 'never auto-delete, >=2 years', confirm NO GCS lifecycle delete rule exists on the bucket and decide whether to enable a Bucket Lock / retention policy (lifecycle bypasses security rules, so delete:false is not sufficient on its own).
- CROSS-DEPARTMENT READ: Option A lets ANY signed-in staffer view ANY evidence photo (Storage can't scope by department). Is open read of evidence photos acceptable, or is per-department confidentiality required (which forces Option B custom claims)?
- STORAGE EMULATOR / TESTS: do we want @firebase/rules-unit-testing coverage for storage.rules (create-only, no-overwrite, no-delete, content-type/size) added alongside any firestore rules tests, given these ARE the security boundary?
**Hardening (reviewer findings → fixes)**
- **[High]** GCS bucket lifecycle / TTL rules bypass Storage security rules entirely. An admin (or a careless default, or a future cost-cleanup) can configure an object-deletion lifecycle rule and the never-delete evidence photos and versioned SOP PDFs vanish, even though storage.rules says delete:false. This directly violates the locked '>=2 years, never auto-deleted' retention requirement and is exactly what a CFIA/SFCR auditor probes (can records be silently destroyed?). The design lists this only as an openQuestion, not a gate.  
  _fix:_ Make retention hardening a launch blocker, not a question: (1) verify NO lifecycle delete rule exists on the bucket; (2) enable a GCS bucket retention policy of >=2 years (ideally >=7) and LOCK it (Bucket Lock) so even project owners cannot shorten/remove it; (3) document the bucket name, retention policy, and lock state for the auditor. Do the same conceptually for cfia_records (Firestore has no lifecycle delete, but ensure no scheduled-delete Cloud Function exists). Treat delete:false in rules as defense-in-depth, never as the retention control.
- **[High]** Separation of duties is not enforced and the design does not fix it. The locked decision is 3-tier verification where a person may NOT verify their own record. The proposed cfia_records create rule (unchanged from today plus photosWellFormed) never constrains performed_by_*, supersedes, department, or any sign-off/verification field. A signed-in user can POST a record with performed_by_is_self:false naming someone else, set supersedes to ANY existing recordId (including one that isn't the same form, or someone else's correct record, effectively 'overriding' it in the chain), and set department to a department they don't belong to. Because the doc is immutable, this poisoned chain is permanent. GAP-BACKLOG.md itself marks the supersede flow and field-level validation as unbuilt [High].  
  _fix:_ Tighten the cfia_records create rule with field-level validation BEFORE shipping the photos work that depends on it: pin record_id==buildRecordId-shape, constrain supersedes to be null OR an existing same-form record via exists()/get() (and forbid superseding a record that is already superseded), constrain department to the submitter's own profile department (get(profilePath(uid)).data.department), and validate performed_by_is_self is a bool. Verification/sign-off must be a SEPARATE collection/doc written by a different uid than submitted_by_uid (enforce request.auth.uid != verifiedRecord.submitted_by_uid), gated by the not-yet-existing isDeptHead()/isSafetyOfficer() helpers. Until those helpers exist, the SoD claim is unmet.
- **[Medium]** Disabled and wrong-role users can still write evidence objects. storage.rules gates only on request.auth (signedIn + email + self-stamp + content-type + size). A user whose hubProfiles.status=='disabled' (offboarded, suspended) still holds a valid Firebase ID token until it expires (~1h) and can upload to cfia/records/* and cfia/reference/*. The design acknowledges objects are 'inert until referenced', but reference PDFs in particular have no gating beyond signedIn() + selfStamped() in Storage, and a disabled user could plant a malicious/incorrect PDF at a never-used v{n} path, or flood the bucket up to the 25MB*unbounded-count ceiling (no per-user/per-record object-count cap in Storage; the <=30 cap is only on the Firestore array).  
  _fix:_ For launch accept Option B for the reference library at minimum: mint Firebase Auth custom claims (profile, status, department) via the existing admin/Cloud-Function path used for user management, and gate storage.rules with request.auth.token.status=='active' (and profile in ['owner','controller'] for cfia/reference writes). If custom claims are deferred, explicitly document that disabled-user uploads are possible-but-inert and add an orphan/abuse reconcile job that lists objects with no referencing cfia_records doc. Also add a hard object-count or total-bytes guard for reference uploads.
- **[Medium]** No binding between a Storage object and the record at write time => forged/cross-linked evidence. selfStamped() checks metadata.uploadedByUid==auth.uid but the Firestore create rule (photosWellFormed only checks 'is list' && size<=30) never validates that each photos[].path actually starts with cfia/records/{this recordId}/, never checks content_type/size_bytes/sha256, and never checks the object exists. So a user can write a cfia_records doc whose photos[] points at another record's photo, a reference PDF, or a non-existent object, with a fabricated sha256 — permanently, since the doc is immutable. The sha256 'tamper-evidence' is self-asserted by the same client that uploaded, so it proves nothing against a malicious submitter.  
  _fix:_ In the create rule, validate the photos array shape as far as Firestore rules allow: require photos.size()<=30, and for the realistic small-N case assert each element's path matches ('^cfia/records/' + recordId + '/.*') and content_type in the allowed set and size_bytes>0 and captured_at==request.time. (Firestore rules can index fixed positions / use hasOnly on keys; enforce a key allow-list per element.) For true object<->doc integrity add a post-upload Cloud Function that reads the Storage object's customMetadata.recordId, recomputes sha256/md5, and writes a server-trusted verification doc; treat client sha256 as advisory only. Document that Storage contentType is client-declared (spoofable) and is not proof of file type.
- **[Low]** Atomicity / dangling-reference still possible despite 'upload first'. The mitigation (upload photos, then write doc) leaves orphans as the only failure (acceptable). BUT the client builds photos[] from what it 'thinks' it uploaded; on token expiry mid-upload, partial-failure, or a retried submit, the doc can be written referencing an object that failed to land, or two submit taps with the same hoisted recordId collide (isNewObject blocks the 2nd upload but the 2nd addDoc still succeeds because Firestore create allows a new auto-id doc). Result: a permanent record pointing at a missing/foreign object, indistinguishable from tampering to an auditor.  
  _fix:_ Make the client write the record ONLY after every upload promise resolves successfully (await all, abort doc on any rejection), disable the submit button after first tap, and prefer a deterministic doc id == record_id (setDoc(doc(db,RECORDS,recordId)) with create-only) so a double-submit fails closed instead of creating a duplicate. Pair with the path-prefix rule check above so a missing object at least can't be referenced by a wrong path, and run the orphan/dangling reconcile job periodically.
- **[Medium]** photosWellFormed() makes photos a REQUIRED list on every create, silently breaking existing submissions and enabling a trivial DoS-on-rollout. request.resource.data.photos is list returns false when the field is absent, so the moment this rule deploys, every current form (form-6-3a and the cfia-core createRecord payload, which today builds NO photos field) is rejected and all record creation stops until the client is also shipped. This is a self-inflicted availability break and, if deployed via the auto-deploy Action without the client change, takes production records offline.  
  _fix:_ Either make the field optional: (!('photos' in request.resource.data) || (request.resource.data.photos is list && request.resource.data.photos.size()<=30)); or update cfia-core.js createRecord to always include photos:[] in the payload AND coordinate the deploy so the client change lands before/with the rule (the Action auto-deploys firestore.rules on push to main — sequence the merges, or gate behind the firebase.json+client change). Add @firebase/rules-unit-testing coverage for create-with-no-photos, create-with-30+, and create-with-foreign-path before enabling.
- **[Low]** Reference-doc supersede chain cannot be maintained => 'current version' is ambiguous/forgeable. cfia_reference_docs has update:false, so superseded_by can never be set after creation. Any signed-in owner/controller can create a new row with arbitrary sop_code/version/path and superseded_by, including a row that claims to supersede the truly-current SOP or that points version 'current' at an old PDF. With no rule tying version to the v{n} path segment or forbidding duplicate (sop_code,version), the document-control register an auditor relies on can be muddied, and there's no enforced single source of truth for 'which SOP is in force'.  
  _fix:_ Pick the query-based current-version model and enforce it in the rule: require version to match the v{n} in path, forbid two active rows with the same (sop_code,version) where feasible, require uploaded_by_* self-stamp + uploaded_at==request.time (already proposed), and compute 'current' as the highest version with no successor rather than mutating superseded_by. If a supersede link is needed, relax update to allow EXACTLY a null->docId transition on superseded_by and nothing else. Restrict creation to owner/controller (and Kyle/QA once isSafetyOfficer() exists).

---

## timezone
**Review verdict:** needs-fix

The bug: cfia-core.js:114 isoToday() = new Date().toISOString().slice(0,10) returns the UTC calendar date, not Edmonton's. A Pre-Op 6.3a completed at 21:30 MST (= 04:30 UTC the next day) is stamped with tomorrow's date, so "due today"/overdue math can flip a day early or late, producing a false overdue on an audit-critical task.

Fix: a tiny no-dependency helper in cfia-core.js using Intl.DateTimeFormat with timeZone 'America/Edmonton' and locale 'en-CA' (which natively emits YYYY-MM-DD), plus pure cadence math computed from last-completed Edmonton calendar date + cadence.

Load-bearing design decision: "due"/"overdue" is a CLIENT-SIDE COMPUTATION over (a) the static schedule config already in the repo (document-register.js cadence strings + form-schemas) and (b) the immutable record history. It is NEVER a stored, writable field. Storing due-state would drift from the records and create an attack surface, so there is NO new schedule-state collection.

The security boundary stays the existing immutable cfia_records create rule, which I HARDEN: add a client-supplied business_date string and force it, in rules, to equal the Edmonton calendar date OF the server's request.time. The front end computes the date but cannot lie about it, because the rule re-derives it from request.time using fixed UTC offsets for America/Edmonton (accepting either the MST or MDT mapping so a DST instant can never reject a valid submission). A parallel append-only cfia_signoffs collection carries the same business_date binding plus separation-of-duties (a person may not sign off their own record). The IANA zone id is pinned in settings/cfia (server-readable) so rule and front end never disagree on the zone.

**Data shape**

```
No new "schedule" collection - due-state is DERIVED, not stored. Three touch-points:

(A) NEW field added to each immutable cfia_records doc (rule-validated). Append to the record object built in cfia-core.js createRecord():
- business_date: string  // 'YYYY-MM-DD'. The America/Edmonton CALENDAR DATE that the server's request.time falls on. Client sets it via edmontonDate(); the rule forces it to match request.time re-projected into Edmonton. This is the date all cadence math keys off - NOT submitted_at (a UTC instant) and NOT values.date (a user-typed field that can be back/forward dated).
Existing fields unchanged (form_code, sop_code, form_version, record_id, values{}, performed_by_name, performed_by_is_self, submitted_by_uid, submitted_by_email, submitted_by_name, submitted_at=serverTimestamp(), department, supersedes, created_via='cfia-hub').

(B) NEW append-only collection cfia_signoffs/{signoffId} (3-tier verification chain; immutable like records):
- record_id: string         // the cfia_records doc id this verifies
- record_business_date: string // copy of the verified record's business_date (audit denormalization)
- tier: string              // 'dept_head' | 'qa'  (staff completion IS the record itself)
- department: string        // dept being signed off
- verifier_uid: string      // == request.auth.uid (server-bound)
- verifier_email: string    // == signedInEmail()
- verifier_name: string
- verdict: string           // 'verified' | 'rejected'
- note: string              // required when verdict=='rejected'
- business_date: string     // 'YYYY-MM-DD' Edmonton date of THIS signoff's request.time (same binding as records)
- signed_at: timestamp       // == request.time (serverTimestamp())
- created_via: string        // == 'cfia-hub'

(C) NEW config doc settings/cfia (single source of truth for the zone, server-readable by rules and front end):
- timezone: string          // 'America/Edmonton' (IANA id - immutable once set)
- record_retention_days: number // >= 730 (>=2yr SFCR); informational, never triggers deletion

Schedule DEFINITIONS stay in static config (no Firestore): document-register.js already carries cadence strings ('Daily','Weekly'(future),'Monthly','Quarterly','Annual','As-needed',''). Normalize to a CADENCE enum {daily,weekly,monthly,quarterly,annual,as_needed,none} in cfia-core.js. Due/overdue per (form, department) = derived from cadence + the max business_date among that form's records (and, for verification tiers, the max business_date among matching cfia_signoffs).
```
**Rules / code snippet**

```
// Add to firestore.rules helper block (top of match /documents). Reuses
// signedIn(), signedInEmail(). America/Edmonton is UTC-7 (MST) or UTC-6 (MDT).
// We cannot run Intl in rules, so we ACCEPT the calendar date of request.time
// under EITHER offset; the 1-day spread only matters within the ~1h DST window
// and a 1-day-stale business_date is harmless (record is still immutable + time-
// stamped by request.time). The point is to block a client claiming a date that
// is NOT plausibly today in Edmonton (e.g. forging last week to dodge "overdue").

function edmDateFor(offsetHours) {
  // request.time shifted by the Edmonton UTC offset, then take the date.
  return request.time + duration.value(offsetHours, 'h');
}
function ymd(ts) {
  return string(ts.year())
    + '-' + (ts.month() < 10 ? '0' : '') + string(ts.month())
    + '-' + (ts.day()   < 10 ? '0' : '') + string(ts.day());
}
function isEdmontonBusinessDate(d) {
  // d is the client-claimed 'YYYY-MM-DD'. Must equal request.time's Edmonton
  // calendar date under MST (-7) or MDT (-6). request.time is UTC; subtracting
  // 6 or 7 hours yields local wall-clock, from which we read y/m/d.
  return d is string
    && (d == ymd(edmDateFor(-7)) || d == ymd(edmDateFor(-6)));
}

// ---- cfia_records: REPLACE the existing create rule body to add the binding ----
match /cfia_records/{recordId} {
  allow get, list: if isOwnerOrController()
    || (signedIn() && resource.data.submitted_by_email == signedInEmail());

  allow create: if signedIn()
    && request.resource.data.submitted_by_uid == request.auth.uid
    && request.resource.data.submitted_by_email == signedInEmail()
    && request.resource.data.submitted_at == request.time
    && request.resource.data.created_via == 'cfia-hub'
    // NEW: business_date must be the Edmonton calendar date of the server time.
    && isEdmontonBusinessDate(request.resource.data.business_date);

  allow update: if false;   // immutable
  allow delete: if false;   // append-only, never deleted (>=2yr retention)
}

// ---- cfia_signoffs: NEW append-only collection, separation of duties ----
match /cfia_signoffs/{signoffId} {
  // Read: managers see all; a verifier sees their own sign-offs.
  allow get, list: if isOwnerOrController()
    || (signedIn() && resource.data.verifier_email == signedInEmail());

  allow create: if signedIn()
    && request.resource.data.verifier_uid == request.auth.uid
    && request.resource.data.verifier_email == signedInEmail()
    && request.resource.data.signed_at == request.time
    && request.resource.data.created_via == 'cfia-hub'
    && request.resource.data.tier in ['dept_head', 'qa']
    && request.resource.data.verdict in ['verified', 'rejected']
    && isEdmontonBusinessDate(request.resource.data.business_date)
    // SEPARATION OF DUTIES: cannot verify a record you submitted yourself.
    && exists(/databases/$(database)/documents/cfia_records/$(request.resource.data.record_id))
    && get(/databases/$(database)/documents/cfia_records/$(request.resource.data.record_id))
         .data.submitted_by_email != signedInEmail();

  allow update: if false;   // immutable
  allow delete: if false;
}

// ---- settings/cfia: the pinned timezone constant ----
// Reuse the EXISTING settings/{settingId} block already in firestore.rules:
//   read: if signedIn();  create,update: if isOwner();  delete: if false;
// No new block needed - settings/cfia rides on it (owner-set, all-signed-in read).
```
**Edge cases**
- DST spring-forward / fall-back: at 02:00 local Edmonton clocks jump. The Intl-based edmontonDate() handles this correctly client-side (it uses the real tz database). In RULES we cannot run Intl, so isEdmontonBusinessDate() accepts BOTH the -7 and -6 projection of request.time; within the ~1h DST transition both map to the same date anyway, so there is no rejection of a valid same-day submission.
- UTC midnight boundary (the original bug): 21:30 MST is 04:30 UTC next day. isoToday() returned the wrong day; edmontonDate() returns the correct Edmonton day. All cadence math must key off business_date, never submitted_at.toMillis() and never values.date (user-typed).
- values.date vs business_date: the form 6.3a has a user-editable 'Inspection date' (default today). A worker can type any date there. business_date is the unforgeable server-anchored date; cadence/overdue and record_id MUST use business_date. Keep values.date as the human-stated inspection date but never trust it for scheduling.
- Clock skew on the kiosk/phone: the front end computing edmontonDate() from a wrong device clock would mislabel - but the RULE re-derives from request.time (server), so a skewed device that sends a wrong business_date is simply REJECTED, surfacing the problem instead of silently corrupting the record.
- Cadence arithmetic in Edmonton, not UTC: 'monthly' due = lastBusinessDate + 1 calendar month evaluated on the Edmonton calendar (Jan-31 + 1mo -> Feb-28/29, clamp end-of-month). 'weekly' = +7 calendar days; 'annual' = +1 year (Feb-29 anniversary clamps to Feb-28). Do day arithmetic on the YYYY-MM-DD parts, NOT on millisecond Date offsets, to avoid DST hour drift turning a +7d into 6d23h.
- as_needed / '' / blank cadence: NOT scheduled - never 'due' or 'overdue'. The normalizer must map these to none and the dashboard must exclude them from due/overdue counts (else every SOP shows overdue).
- Quarterly cadence exists in the register (7.2 Calibration, 1.3 Internal Audit) but is NOT in the locked daily/weekly/monthly/annual list - decide whether quarterly = +3 months or its own bucket (spec models it as +3 calendar months).
- Grace window vs hard overdue: 'due today' (business_date == today) vs 'overdue' (today > due AND no record with business_date in the period). Define whether a daily task done at 23:59 then next-day 00:05 counts as a miss; recommend day-granularity comparison on business_date strings (lexical compare works for YYYY-MM-DD).
- Leap second / far-future / pre-1970 are non-issues here (request.time is a normal server timestamp), but note ymd() relies on Firestore timestamp .year()/.month()/.day() returning the value in UTC of the SHIFTED timestamp - verify in the emulator that timestamp+duration arithmetic preserves the y/m/d accessors.
- Traveler / night-shift worker whose phone is in another tz: edmontonDate() ignores device tz (always passes timeZone:'America/Edmonton'), so the displayed 'today' is always plant-local - matches the audit expectation that the record reflects the facility's day.
**Integration notes**

cfia-core.js changes (the real surface):
1) ADD and EXPORT a deterministic helper, and REPLACE isoToday() so every caller is Edmonton-correct without touching them:
   const CFIA_TZ = 'America/Edmonton';
   const _edFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CFIA_TZ, year:'numeric', month:'2-digit', day:'2-digit' });
   export function edmontonDate(d = new Date()) { return _edFmt.format(d); }  // -> 'YYYY-MM-DD'
   export function isoToday() { return edmontonDate(); }  // keep name; now Edmonton-anchored
   This auto-fixes the two existing callers: buildRecordId() (cfia-core.js:107) and fh-render-form.js:97 (the 'today' default), with no edits there.
2) In createRecord() add one line to the record object:  business_date: edmontonDate(),  (sits beside submitted_at). The rule will reject if it ever disagrees with server time.
3) ADD pure cadence helpers (no Date-ms math; operate on the YYYY-MM-DD parts):
   - addCadence(ymd, cadence) -> next due 'YYYY-MM-DD' (daily +1d, weekly +7d, monthly +1mo clamp-eom, quarterly +3mo, annual +1yr clamp-feb29, as_needed/none -> null).
   - dueStatus(lastBusinessDate, cadence, todayYmd) -> 'not_started' | 'done_today' | 'due' | 'overdue' using lexical string compare on YYYY-MM-DD.
   - normalizeCadence(registerString) -> enum (map 'Daily'->daily, 'Annual'->annual, ''/'As-needed'->none, etc.).
4) Dashboards (3-tier) call dueStatus() over listRecords() + a new listSignoffs(); nothing about due-state is persisted.

Firestore rules / firebase.json / deploy:
- Edit firestore.rules: add edmDateFor/ymd/isEdmontonBusinessDate helpers, add business_date check to the existing cfia_records create rule, add the new cfia_signoffs match block. settings/cfia rides the EXISTING settings/{settingId} block (no change). This auto-deploys via .github/workflows/deploy-firestore-rules.yml on push to main - no manual console paste. firebase.json already points firestore.rules; no change.
- Seed settings/cfia once (owner action, allowed by existing rule): { timezone:'America/Edmonton', record_retention_days:730 }.
- Storage rules are NOT auto-deployed (only firestore.rules is) - irrelevant to this timezone component (no Storage touched here) but worth remembering when photo-evidence lands.
- Tests: firestore-rules.test.js currently has NO cfia coverage. Add emulator cases: (a) create with business_date == Edmonton(request.time) PASSES; (b) create with a forged earlier/later business_date FAILS; (c) signoff of own record FAILS (separation of duties); (d) signoff of another's record PASSES; (e) update/delete on both collections FAIL.
**Open questions**
- DST-window strictness: the rule accepts BOTH the -7 and -6 projection of request.time, so during the ~1h DST overlap a client could in theory claim either of two adjacent dates. That is harmless for immutability/overdue (request.time still pins the true instant) - OK to accept, or do you want a stricter single-offset check that risks rejecting a legitimate same-second submission?
- Quarterly cadence is in the register (Calibration 7.2, Internal Audit 1.3) but is NOT in your locked daily/weekly/monthly/annual list. Add 'quarterly' (+3 months) as a first-class cadence, or fold it into the equipment/audit scheduler later?
- Overdue grace window per cadence: should a daily Pre-Op be 'overdue' at 00:00 the next Edmonton day, or do you want a grace period (e.g. due by 10:00, overdue after) before it escalates? Day-granularity is simplest and audit-defensible; sub-day needs a per-form due-time field.
- Weekend/holiday handling: does a daily task become 'overdue' on days the plant is closed? You already have a holidays collection in the Hub - should CFIA cadence skip non-production days, or is daily literally every calendar day?
- settings/cfia.timezone is owner-editable via the existing settings rule. Acceptable, or should the timezone be hard-locked (e.g. a literal in rules) so not even an owner can change the audit anchor? Recommend keeping the IANA id in code as the source of truth and treating the Firestore copy as display-only.
- cfia_signoffs adds the dept_head/qa tiers now, anchored by the same business_date binding. Confirm the two tier values ('dept_head','qa') and that staff completion is represented by the cfia_records doc itself (no separate 'staff' signoff) - matches your locked 3-tier model.
- record_id currently uses values.date when present (cfia-core.js:107), which a user can type. Switch record_id to derive from business_date (server-anchored) so two records can't collide on a back-dated values.date, or keep values.date for human readability and rely on the random suffix?
**Hardening (reviewer findings → fixes)**
- **[High]** Separation-of-duties is only HALF enforced. The cfia_signoffs create rule blocks signing off a record you submitted, but does NOT verify the signer is actually a department head or QA. tier is only checked to be in ['dept_head','qa'] — a free-text claim. Any signed-in staffer (e.g. sungjoo, a 'staff' profile) can create {tier:'qa', verdict:'verified', record_id:<a coworker's record>} and the rule passes. The audit trail then shows QA oversight that never happened. This defeats the locked 3-tier verification model and is an audit-integrity fabrication, not just an access-control miss.  
  _fix:_ Add server-side role helpers and gate the tier. In firestore.rules add isSafetyOfficer() (reads hubProfiles/{uid}.safetyOfficer==true && status=='active') and isDeptHead(dept) (profile.role_tier=='dept_head' && profile.department==dept && status=='active'), then in the cfia_signoffs create rule require: (request.resource.data.tier=='qa' && isSafetyOfficer()) || (request.resource.data.tier=='dept_head' && isDeptHead(get(record).data.department)). Also require request.resource.data.department == get(record).data.department so a dept head can't sign records outside their department.
- **[Medium]** Verifiers cannot read the records they must verify, so the workflow is broken AND any attempt to make it work forces over-broad reads. cfia_records get/list = isOwnerOrController() OR own-record only. Kyle (QA, profile 'production') and dept heads are neither owner nor controller and did not submit the staffer's record, so they get PERMISSION_DENIED reading it. To verify, an implementer will be tempted to widen the read rule to 'any signed-in user', exposing every food-safety record (including who failed inspections) to all staff — a confidentiality regression.  
  _fix:_ Add scoped read access tied to the same role helpers: allow get,list on cfia_records if isOwnerOrController() || isSafetyOfficer() || isDeptHead(resource.data.department) || (signedIn() && resource.data.submitted_by_email==signedInEmail()). Mirror the same scoping on cfia_signoffs reads. Do NOT fall back to a blanket signedIn() read.
- **[Medium]** signoff create does not bind the signoff to an UNSUPERSEDED record, and never checks the record's department matches the signer. A user can sign off a record that has already been corrected/superseded, or (combined with break #1) attest to a record in a department they have no authority over. Auditor sees a 'verified' stamp on a record that was retracted.  
  _fix:_ In cfia_signoffs create, require record_business_date == get(record).data.business_date AND department == get(record).data.department (already implied by break #1's dept gate). Recommend also rejecting sign-off when the target record has been superseded by checking a server-derivable flag, or at minimum surfacing superseded state in the verifier UI; the supersede chain is currently only on the record, not reflected into signoff validity.
- **[Medium]** business_date is rule-validated but NOTHING forces cadence/record_id to actually USE it. buildRecordId() (cfia-core.js:107) still derives the id from the user-typed fields.date ('Inspection date', back/forward-datable), falling back to isoToday(). Two records with the same back-dated values.date differ only by a 4-digit random suffix (1-in-9000 collision per day), and overdue math that keys off values.date instead of business_date can be defeated by typing yesterday's date into the form. The rule hardening is real but the client code it is meant to protect ignores it.  
  _fix:_ Switch buildRecordId() to derive the date segment from edmontonDate() (the server-anchored business_date), not fields.date. Keep values.date as a human-stated inspection date only. Ensure every dueStatus()/addCadence() call keys off business_date, never values.date or submitted_at, and add an emulator/unit test asserting a forged earlier/later business_date is rejected (the design's test (b)).
- **[Low]** settings/cfia.timezone is owner-editable via the existing settings/{settingId} rule (create,update: if isOwner()). An owner — or anyone who compromises an owner account — can change the audit anchor zone, retroactively shifting how 'today'/overdue is computed for the whole module, with no immutable trail (settings has no append-only history). This silently mutates the meaning of every derived due/overdue judgment.  
  _fix:_ Treat the IANA zone in cfia-core.js (CFIA_TZ='America/Edmonton') as the single source of truth and make the Firestore copy display-only/informational; do NOT have rules or cadence math read settings/cfia.timezone. If a stored copy is kept, document that it is non-authoritative. Optionally hard-lock by validating in the settings rule that timezone, once set, cannot change (request.resource.data.timezone == resource.data.timezone on update).
- **[Low]** DST-window double-accept lets a client legitimately pick either of two adjacent dates during the ~1h fall-back overlap (rule accepts both -7 and -6 projections of request.time). Low impact because request.time still pins the true instant and records stay immutable, but it does mean business_date is not a single deterministic value the auditor can recompute from request.time alone.  
  _fix:_ Acceptable as-is for immutability, but document explicitly that during the DST overlap business_date may legitimately equal either of two dates and that submitted_at (request.time) is the authoritative instant. If strict single-value is desired later, store the resolved offset or compute business_date in a callable/Cloud Function with real tz data instead of in rules.

---

