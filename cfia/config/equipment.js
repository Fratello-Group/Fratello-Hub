// ═══════════════════════════════════════════════════════════════
// equipment.js — seed equipment registry (first-class machines).
// Records and maintenance logs reference an equipmentId (not a free-text
// area), so you can pull a full per-machine history and attach the right
// manual. Drawn from the roasting/packaging SOPs. id is stable; name can change.
// (Becomes Firestore collection cfia_equipment once the foundation is wired.)
// ═══════════════════════════════════════════════════════════════
export const EQUIPMENT = [
    // ── Roasting ──
    { id: 'EQ-G90', name: 'Probat G90 Roaster', type: 'roaster', department: 'roasting', manualCode: '3.5', cadence: 'weekly', active: true },
    { id: 'EQ-G120', name: 'Probat G120 Roaster', type: 'roaster', department: 'roasting', manualCode: '3.6', cadence: 'weekly', active: true },
    { id: 'EQ-L12', name: 'Probat L12 Roaster', type: 'roaster', department: 'roasting', manualCode: '3.7', cadence: 'weekly', active: true },
    { id: 'EQ-ROEST', name: 'Roest Sample Roaster', type: 'roaster', department: 'roasting', manualCode: '3.8', cadence: 'weekly', active: true },
    { id: 'EQ-GRIND-700FX', name: '700 FX Granulizer (Grinder)', type: 'grinder', department: 'roasting', manualCode: '3.9', cadence: 'monthly', active: true },

    // ── Packaging ──
    { id: 'EQ-COPILOT500', name: 'CoPilot-500 Packaging Machine', type: 'packaging-line', department: 'packaging', manualCode: '5.4', cadence: 'weekly', active: true },
    { id: 'EQ-ACTIONPAK', name: 'ActionPak Packaging Line', type: 'packaging-line', department: 'packaging', manualCode: '5.8', cadence: 'weekly', active: true },

    // ── Shared / measurement (calibration-controlled) ──
    { id: 'EQ-SCALE', name: 'Production Scales', type: 'scale', department: 'company', manualCode: '7.2', cadence: 'quarterly', active: true },
    { id: 'EQ-TEMP-PROBE', name: 'Roast Temperature Probe', type: 'probe', department: 'roasting', manualCode: '7.2', cadence: 'quarterly', active: true },

    // ── Whole-area sentinels (for area-level records not tied to one machine) ──
    { id: 'roasting-area', name: 'Roasting area (whole)', type: 'area', department: 'roasting', manualCode: '', cadence: '', active: true },
    { id: 'packaging-area', name: 'Packaging area (whole)', type: 'area', department: 'packaging', manualCode: '', cadence: '', active: true },
    { id: 'warehouse-area', name: 'Warehouse area (whole)', type: 'area', department: 'warehouse', manualCode: '', cadence: '', active: true },
    { id: 'facility-all', name: 'Whole facility', type: 'area', department: 'company', manualCode: '', cadence: '', active: true }
];

export function equipmentForDepartment(deptKey) {
    return EQUIPMENT.filter(e => e.department === deptKey || e.department === 'company');
}
