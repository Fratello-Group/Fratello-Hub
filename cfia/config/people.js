// ═══════════════════════════════════════════════════════════════
// people.js — finalized roster + role model for the whole Fratello Hub,
// from the 2026 Organizational Chart. This is the source the role model
// (and onboarding assignments) read from.
//
// Fields per person:
//   name, title, dept, reportsTo (name | null)
//   hubProfile : existing Hub role  (owner | controller | marketing | sales | production | staff)
//   cfiaTier   : food-safety rank   (owner | qa | supervisor | staff | office)
//   safetyOfficer : true for the QA / food-safety officer over ALL departments
// Emails are filled where known; the rest are attached during onboarding.
// ═══════════════════════════════════════════════════════════════
export const PEOPLE = [
    // ── Leadership / owners ──
    { name: 'Chris Prefontaine', title: 'CEO', dept: 'leadership', reportsTo: null, email: 'prefontainech@gmail.com', hubProfile: 'owner', cfiaTier: 'owner', safetyOfficer: false },
    { name: 'Russ Prefontaine', title: 'President', dept: 'leadership', reportsTo: 'Chris Prefontaine', email: 'russ@fratellocoffee.com', hubProfile: 'owner', cfiaTier: 'owner', safetyOfficer: false },

    // ── Production & Operations (the food-safety chain) ──
    // Kyle is the PRODUCTION MANAGER over ALL production (roasting, packaging, warehouse)
    // AND the QA / food-safety officer over all departments. The three department
    // supervisors report to him.
    { name: 'Kyle Park', title: 'Production Manager (all production)', dept: 'production', reportsTo: 'Russ Prefontaine', email: 'kyle.park@fratellocoffee.com', hubProfile: 'production', cfiaTier: 'qa', safetyOfficer: true },

    { name: 'Roasting Supervisor (name TBD)', title: 'Roasting Supervisor', dept: 'roasting', reportsTo: 'Kyle Park', email: '', hubProfile: 'production', cfiaTier: 'supervisor', safetyOfficer: false },
    { name: 'Oleksandr Svyrydov', title: 'Production Coffee Roaster', dept: 'roasting', reportsTo: 'Roasting Supervisor (name TBD)', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },
    { name: 'Sungjoo Hong', title: 'Production Coffee Roaster', dept: 'roasting', reportsTo: 'Roasting Supervisor (name TBD)', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },
    { name: 'Sydney Penfold', title: 'Roasting Assistant', dept: 'roasting', reportsTo: 'Roasting Supervisor (name TBD)', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },

    { name: 'Jaleisy Quintero', title: 'Packaging Supervisor', dept: 'packaging', reportsTo: 'Kyle Park', email: '', hubProfile: 'production', cfiaTier: 'supervisor', safetyOfficer: false },
    { name: 'Olena Zaitseva', title: 'Packaging Team Member', dept: 'packaging', reportsTo: 'Jaleisy Quintero', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },
    { name: 'Yerly Camacho', title: 'Packaging Team Member', dept: 'packaging', reportsTo: 'Jaleisy Quintero', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },

    { name: 'Allana Contois', title: 'Warehouse Supervisor', dept: 'warehouse', reportsTo: 'Kyle Park', email: '', hubProfile: 'production', cfiaTier: 'supervisor', safetyOfficer: false },
    { name: 'Monica Lynn', title: 'Warehouse Team Member', dept: 'warehouse', reportsTo: 'Allana Contois', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },
    { name: 'Sandra Mestre', title: 'Warehouse Team Member', dept: 'warehouse', reportsTo: 'Allana Contois', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false },
    { name: 'Luke Prefontaine', title: 'Delivery Driver (name may change)', dept: 'warehouse', reportsTo: 'Allana Contois', email: '', hubProfile: 'staff', cfiaTier: 'staff', safetyOfficer: false }, // placeholder; Luke's primary role is Marketing (above)

    // ── Commercial & office (Hub users; not in the daily food-safety record chain,
    //    but do company-wide training + policy acknowledgements) ──
    { name: 'Chris McGhee', title: 'Controller', dept: 'finance', reportsTo: 'Russ Prefontaine', email: 'chris.mcghee@fratellocoffee.com', hubProfile: 'controller', cfiaTier: 'office', safetyOfficer: false },
    { name: 'Mateo Corredor', title: 'Marketing & Brand Manager', dept: 'marketing', reportsTo: 'Russ Prefontaine', email: 'mateo.corredor@fratellocoffee.com', hubProfile: 'marketing', cfiaTier: 'office', safetyOfficer: false },
    { name: 'Luke Prefontaine', title: 'Marketing', dept: 'marketing', reportsTo: 'Mateo Corredor', email: '', hubProfile: 'marketing', cfiaTier: 'office', safetyOfficer: false }, // also the Delivery Driver below (in two places)
    { name: 'Joel May', title: 'Key Account Manager', dept: 'sales', reportsTo: 'Russ Prefontaine', email: 'joel.may@fratellocoffee.com', hubProfile: 'sales', cfiaTier: 'office', safetyOfficer: false },
    { name: 'Nancy Gibb', title: 'Bookkeeper & Customer Service Coordinator', dept: 'finance', reportsTo: 'Chris McGhee', email: '', hubProfile: 'staff', cfiaTier: 'office', safetyOfficer: false },
    { name: "D'Arcy Watsham", title: 'Customer Care Specialist', dept: 'sales', reportsTo: 'Russ Prefontaine', email: '', hubProfile: 'staff', cfiaTier: 'office', safetyOfficer: false }
];

// Kyle (Production Manager) sits ABOVE the three department supervisors and below the owners.
export const PRODUCTION_MANAGER = 'Kyle Park';
export const DEPT_HEADS = { roasting: 'Roasting Supervisor (name TBD)', packaging: 'Jaleisy Quintero', warehouse: 'Allana Contois' };
export const SAFETY_OFFICER = 'Kyle Park';
