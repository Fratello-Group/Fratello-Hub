# Fratello Food Safety (CFIA / HACCP) module

A food-safety compliance module inside the Fratello Ops Hub. It centralises the entire
Preventive Control Plan: the reference library (SOPs, policies, plans), the records people
complete, and training — built to withstand a CFIA / SFCR audit.

**Live:** https://fratello-ops-hub.netlify.app/cfia/ · Owner-gated during the build-out.

## What it does
- **Reads:** 104 documents are registered and 67 reference docs are readable in the Hub, version-controlled and cross-linked.
- **Records:** forms are completed on a phone and saved as **immutable** records (who + when, server-stamped, never editable — corrections supersede).
- **Finds:** a department view (Roasting / Packaging / Warehouse / Company-wide), a searchable **System Map**, and a **Document Control Register** for audits.

## How it's built (and why)
- **Static HTML + vanilla JS, no build step.** Documents are pages; permalinks; print-friendly; a non-developer can maintain it file-by-file.
- **Config-driven.** Adding document #105 is a config entry, not new code — see `docs/ADDING-A-DOCUMENT.md`.
- **One design file.** Colours and fonts live in `system/cfia-tokens.css`; change it once, the whole module restyles.
- **Firebase Auth + Firestore**, with **security rules as the real access control** (the front end enforces nothing).

## Layout
```
cfia/
  index.html            Food Safety dashboard (department tiles + System Map + Records + Document Control)
  department.html       reusable department page (?dept=roasting|packaging|warehouse|company)
  map.html              System Map — every document, filterable
  records.html          submitted records (manager view) + PDF export
  document-control.html document control register (audit view)
  reference/
    view.html           generic reference viewer (?code=6.3)
    sop-6-3.html        hand-built Pre-Op SOP (the pilot)
    content/<code>.html the text of each reference document
  forms/
    form.html           generic form page (?code=9.3a)
    form-6-3a.html      hand-built Pre-Op log (the pilot)
  system/
    cfia-tokens.css     THE single restyle file
    cfia.css            component styles
    cfia-core.js        auth gate + immutable record read/write
    cfia-map.js         reusable search/filter map
    fh-render-form.js   schema-driven form engine
  config/               document-register, form-schemas, departments, people, equipment, quizzes
  docs/                 BLUEPRINT, PLAN-OF-ATTACK, GAP-BACKLOG, FOUNDATION-SPECS, DATA-MODEL,
                        ADDING-A-DOCUMENT, MORNING-BRIEF, OVERNIGHT-LOG, this README
```

## Status & what's next
Built and live: the document library (readable + cross-linked), 17 fillable forms, the
System Map, and the Document Control Register. **Next** (needs decisions + live-rule testing):
the audit **foundation** (immutable-record validation, the sign-off chain, equipment & training
records, the role model) — designed and hardened in `docs/FOUNDATION-SPECS.md`, then quizzes,
photo evidence, scheduling/reminders, and the personalised per-person dashboard.

Start here in the morning: `docs/MORNING-BRIEF.md`.
