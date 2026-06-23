# How to add or change a document (no coding)

The Food Safety module is **config-driven**: documents, forms, departments and people
are *data*, not code. To add or change something you edit one small file and push —
the page builds itself. This guide is written for a non-developer.

> Everything lives under `cfia/config/` (the data) and `cfia/reference/content/` (the
> readable text of each SOP). You never need to touch the page code.

---

## A) Add a reference document (an SOP, policy, or plan you read)

1. **Register it.** Open `cfia/config/document-register.js` and add one line to the list:
   ```js
   { code:"6.14", title:"New Sanitation Step", docType:"SOP", departments:["packaging"],
     version:"1.0", approvedBy:"Russ Prefontaine", effectiveDate:"June 1, 2026",
     cadence:"", fillable:false, related:["6.1"], href:"/cfia/reference/view.html?code=6.14" },
   ```
   - `code` — its real Fratello number (e.g. `6.14`). This is also its web address.
   - `departments` — who it applies to: `roasting`, `packaging`, `warehouse`, or `company` (everyone).
   - `docType` — `SOP`, `Policy`, or `Plan`.
   - `related` — codes of related docs (these become clickable links).
2. **Add its text.** Create a file `cfia/reference/content/6.14.html` with the body
   (headings `<h2>`, paragraphs `<p>`, lists `<ul><li>`, tables `<table class="doc-table">`).
   Tip: copy an existing file from that folder and edit it.
3. Done. It now appears in its department page, the System Map, and the Document Control
   Register, and opens in the viewer.

## B) Add a form (a record people fill in)

1. **Add its schema** in `cfia/config/form-schemas.js`:
   ```js
   "6.14a": {
     code:"6.14a", title:"New Sanitation Log", sopCode:"6.14", version:"1.0",
     frequency:"Daily", intro:"Complete before the line starts.",
     sections:[ { title:"Checks", help:"", fields:[
       { id:"date", label:"Date", type:"date", required:true, options:[], help:"", placeholder:"" },
       { id:"drum", label:"Drum clean", type:"status", required:true, options:[], help:"", placeholder:"" }
     ]}]
   },
   ```
   Field `type` is one of: `date`, `text`, `select` (give `options:[...]`), `textarea`,
   `status` (a Pass / Fail / Not-in-use check).
2. **Register it** in `document-register.js` like a reference doc, but
   `docType:"Form"`, `fillable:true`, and `href:"/cfia/forms/form.html?code=6.14a"`.
3. Done. It renders on a phone, saves a permanent record, and shows in **Records**.

## C) Replace a document with a new version

- Bump `version` and `effectiveDate` in `document-register.js`, and update the text in
  `cfia/reference/content/<code>.html`. (When the audit foundation is wired, this also
  asks staff to re-acknowledge the new version.)

## D) Link to an existing Hub tool instead of building a new form

- Set `rebuild:false` and `link:"/hr/time-off/vacation-tracker.html"` on the register entry
  (this is how Vacation & Leave points at the existing Time Off tool).

## E) Restyle everything (colours, fonts)

- Edit **`cfia/system/cfia-tokens.css`** — the single control file. Change the teal, swap the
  font, and every document and form updates at once.

---

**Always test before publishing** (the site auto-deploys on push to `main`):
- Run the register check: `bash /tmp/validate_register.sh cfia/config/document-register.js`
  (or have Claude run it) — it confirms the file is valid and flags duplicate codes.
- After deploy, open the page and the System Map to confirm it appears.
