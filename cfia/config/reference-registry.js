// ═══════════════════════════════════════════════════════════════
// reference-registry.js — the document-control register (seed).
// Every reference document (SOP, policy, plan) keeps its OWN Fratello
// code (e.g. SOP 6.3) — that stable code is what powers permalinks and
// the automatic cross-links between documents.
// To add a doc: add an entry. `href` is its permanent page address.
// ═══════════════════════════════════════════════════════════════
export const REFERENCE_DOCS = {
    '6.3': {
        code: '6.3',
        type: 'SOP',
        title: 'Pre-Operational Inspection Procedure',
        section: 'Section 6 — Sanitation & Biosecurity',
        owner: 'Kyle Park',
        approvedBy: 'Russ Prefontaine',
        version: '2',
        effectiveDate: 'April 1, 2025',
        supersedes: 'February 26, 2021',
        nextReviewDate: 'April 1, 2026',
        status: 'Controlled',
        href: '/cfia/reference/sop-6-3.html',
        // The matching fillable record (the daily log) for this procedure.
        forms: ['6.3a'],
        // Related documents referenced inside this SOP (built-in hyperlinks).
        related: ['6.1', '6.4', '9.1', '1.5']
    }
};

export function getRef(code) { return REFERENCE_DOCS[code] || null; }
