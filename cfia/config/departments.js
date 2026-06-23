// ═══════════════════════════════════════════════════════════════
// departments.js — the department dimension.
// Every document is tagged with the department(s) it applies to
// ('company' = applies to everyone). Department pages, the systems-map
// filter, and each person's required-set all read from this.
// ═══════════════════════════════════════════════════════════════
export const DEPARTMENTS = {
    company: { key: 'company', label: 'Company-wide', icon: 'ti-building', blurb: 'Policies and documents that apply to every department.' },
    roasting: { key: 'roasting', label: 'Roasting', icon: 'ti-flame', blurb: 'Green intake, roasting, grinding and cupping.' },
    packaging: { key: 'packaging', label: 'Packaging', icon: 'ti-package', blurb: 'Packaging, labelling, traceability and tea.' },
    warehouse: { key: 'warehouse', label: 'Warehouse', icon: 'ti-forklift', blurb: 'Receiving, shipping, storage and delivery.' }
};

// Display order of departments (company-wide first).
export const DEPARTMENT_ORDER = ['company', 'roasting', 'packaging', 'warehouse'];

// How documents are grouped on a department page (point 6).
// A group only appears if that department actually has documents of that type,
// so different departments can have different structures automatically.
export const DOC_TYPE_GROUPS = [
    { key: 'JobDescription', label: 'Job descriptions', icon: 'ti-id-badge-2' },
    { key: 'Policy', label: 'Policies', icon: 'ti-gavel' },
    { key: 'SOP', label: 'SOPs & procedures', icon: 'ti-book' },
    { key: 'Plan', label: 'Plans (HACCP / CCP)', icon: 'ti-sitemap' },
    { key: 'Form', label: 'Forms & logs', icon: 'ti-clipboard-check' },
    { key: 'Quiz', label: 'Quizzes', icon: 'ti-help-circle' },
    { key: 'Training', label: 'Training', icon: 'ti-school' },
    { key: 'Manual', label: 'Equipment manuals', icon: 'ti-tool' }
];

export function getDepartment(key) { return DEPARTMENTS[key] || null; }

// A doc belongs to a department view if it is tagged to that department
// or tagged 'company' (company-wide docs show in every department).
export function docInDepartment(doc, deptKey) {
    const tags = doc.departments || [];
    if (deptKey === 'company') return tags.includes('company');
    return tags.includes(deptKey) || tags.includes('company');
}
