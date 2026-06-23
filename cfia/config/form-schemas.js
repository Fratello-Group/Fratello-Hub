// ═══════════════════════════════════════════════════════════════
// form-schemas.js — every fillable CFIA form, defined as data.
// The form engine (fh-render-form.js) builds the screen from this.
// To add a new form/log: add an entry here. No new page code needed.
// Field types: date · text · select · textarea · status (Pass/Fail/Not in use)
// ═══════════════════════════════════════════════════════════════
export const FORM_SCHEMAS = {
    '6.3a': {
        code: '6.3a',
        title: 'Pre-Operational Inspection Log',
        sopCode: '6.3',
        sopTitle: 'Pre-Operational Inspection Procedure',
        sopHref: '/cfia/reference/sop-6-3.html',
        version: '2',
        frequency: 'Daily — before production start',
        intro: 'Complete before production begins for any equipment in use today. Inspect with a flashlight and mark each item Pass, Fail, or Not in use.',
        sections: [
            {
                title: 'Inspection details',
                fields: [
                    { id: 'date', label: 'Inspection date', type: 'date', required: true, default: 'today' },
                    { id: 'area', label: 'Area / line inspected', type: 'select', required: true, options: ['Roasting', 'Packaging', 'Warehouse / Shipping', 'Whole facility'] },
                    { id: 'shift', label: 'Shift', type: 'select', options: ['Morning', 'Afternoon', 'Night'] }
                ]
            },
            {
                title: 'Inspection checklist',
                help: 'Inspect each item. Mark Not in use where equipment is not running today.',
                fields: [
                    { id: 'chem', label: 'Chemical residues', type: 'status', required: true, help: 'No soapy buildup or sanitizer residue' },
                    { id: 'product', label: 'Product residue', type: 'status', required: true, help: 'No coffee particles, debris, oils or dust' },
                    { id: 'grease', label: 'Excess grease or leaking', type: 'status', required: true, help: 'Check under and around equipment' },
                    { id: 'damage', label: 'Damage', type: 'status', required: true, help: 'No rust, broken welds, loose parts, or rough food-contact surfaces' },
                    { id: 'glass', label: 'Glass / brittle plastic', type: 'status', required: true, help: 'Intact; none over product zones' },
                    { id: 'blades', label: 'Knife / cutting blade condition', type: 'status', required: true, help: 'Blades intact and accounted for' },
                    { id: 'handwash', label: 'Handwashing stations', type: 'status', required: true, help: 'Warm water, soap, paper towels, signage, garbage bins' }
                ]
            },
            {
                title: 'Result & corrective action',
                fields: [
                    { id: 'cleared', label: 'Cleared to start production?', type: 'select', required: true, options: ['Yes — cleared', 'No — not cleared'] },
                    { id: 'corrective', label: 'Corrective actions taken / notes', type: 'textarea', placeholder: 'e.g. Re-cleaned roaster drum chute and re-inspected — passed.', help: 'Required if anything failed or production was not cleared. Note re-cleaning, repairs, holds, or Maintenance Work Requests.' }
                ]
            }
        ]
    }
};

export function getSchema(code) { return FORM_SCHEMAS[code] || null; }
