// Canonical role / permission definitions for the Fratello Hub.
//
// SINGLE SOURCE OF TRUTH for browser code. ESM consumers (system/hub-app.js,
// system/fratello-auth.js, system/permissions.html) should import from here so
// the role model is defined exactly once.
//
// Netlify Functions are CommonJS and cannot import this ESM file directly; their
// mirror lives in netlify/functions/auth-lib.js and is kept honest by
// scripts/check-roles.js (a node assertion that the two agree).
//
// SAFE-CHANGE RULE: edits should be ADDITIVE. Removing a section from a role can
// silently break downstream pages (CFIA module, time-off pages, embed guards)
// that read the cached `fratello-role` object from localStorage.

export const EMPLOYEE_RESOURCES = ['employee-resources'];

// Section key -> human-facing "area" label (used by the dashboard and the
// permissions tool's area filter).
export const SECTION_TO_AREA = {
    'finance': 'Finance',
    'production-roasting': 'Roasting',
    'production-packaging': 'Packaging',
    'production-warehouse': 'Warehouse',
    'sales': 'Sales',
    'marketing': 'Marketing',
    'food-safety': 'Food Safety',
    'hr-people': 'HR & People',
    'employee-resources': 'Resources',
    'time-off': 'Time Off',
    'owner-admin': 'Owner/Admin',
    'settings': 'Settings'
};

// Per-role visible sections. Seeded from the de-facto runtime truth the Hub
// already writes to localStorage (note: every role includes 'food-safety').
const SECTIONS_BY_ROLE = {
    owner: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'marketing', 'food-safety', 'hr-people', 'employee-resources', 'time-off', 'owner-admin', 'settings'],
    controller: ['finance', 'production-roasting', 'production-packaging', 'production-warehouse', 'sales', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    production: ['production-roasting', 'production-packaging', 'production-warehouse', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    marketing: ['marketing', 'food-safety', 'hr-people', 'employee-resources', 'time-off'],
    sales: ['sales', 'marketing', 'food-safety', 'employee-resources', 'time-off'],
    staff: ['food-safety', 'employee-resources', 'time-off']
};

const LABELS = {
    owner: 'Owner',
    controller: 'Controller',
    production: 'Production',
    marketing: 'Marketing',
    sales: 'Sales',
    staff: 'Staff'
};

// Derive the deduped area-label list for a set of section keys (in section order).
export function accessFromSections(sections) {
    const seen = new Set();
    const areas = [];
    for (const key of sections) {
        const area = SECTION_TO_AREA[key];
        if (area && !seen.has(area)) {
            seen.add(area);
            areas.push(area);
        }
    }
    return areas;
}

function buildRole(key) {
    const sections = SECTIONS_BY_ROLE[key];
    return {
        key,
        label: LABELS[key],
        sections,
        areas: accessFromSections(sections)
    };
}

export const ROLE_DEFINITIONS = {
    owner: buildRole('owner'),
    controller: buildRole('controller'),
    production: buildRole('production'),
    marketing: buildRole('marketing'),
    sales: buildRole('sales'),
    staff: buildRole('staff')
};

// Convenience: role key -> sections (drop-in for the old ROLE_SECTION_MAP).
export const ROLE_SECTION_MAP = Object.fromEntries(
    Object.values(ROLE_DEFINITIONS).map(role => [role.key, role.sections])
);
