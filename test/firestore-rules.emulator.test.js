// ─────────────────────────────────────────────────────────────────────────────
// Firestore rules test — runs against the REAL firestore.rules in the emulator.
//
// Unlike the fast logic simulation in ../firestore-rules.test.js, this file loads
// the actual rules file and exercises it through the Firestore emulator, so it
// proves the deployed behaviour rather than a hand-written copy of it.
//
// Run it with:
//   npm run test:rules:emulator
// which is: firebase emulators:exec --only firestore "node test/firestore-rules.emulator.test.js"
// (needs the Firebase CLI + a JRE for the emulator, and `npm install` for the
// @firebase/rules-unit-testing + firebase dev dependencies.)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'fratello-hub-rules-test';
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let passed = 0;
async function check(label, promise) {
    await promise;
    passed += 1;
    console.log(`  ok  ${label}`);
}

async function main() {
    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: RULES }
    });

    // Seed the world with rules disabled (acts like the Admin SDK / a trusted seed).
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'hubProfiles', 'owner-uid'), { email: 'prefontainech@gmail.com', profile: 'owner', status: 'active' });
        await setDoc(doc(db, 'hubProfiles', 'controller-uid'), { email: 'controller@fratellocoffee.com', profile: 'controller', status: 'active' });
        await setDoc(doc(db, 'hubProfiles', 'staff-uid'), { email: 'staff@fratellocoffee.com', profile: 'staff', status: 'active' });

        await setDoc(doc(db, 'users', 'controller@fratellocoffee.com'), { email: 'controller@fratellocoffee.com', name: 'Chris McGhee', role_tier: 'Controller', department: 'Finance', active: true });
        await setDoc(doc(db, 'users', 'staff@fratellocoffee.com'), { email: 'staff@fratellocoffee.com', name: 'Sam Staff', role_tier: 'Staff', department: 'Packaging', active: true });
        await setDoc(doc(db, 'users', 'other@fratellocoffee.com'), { email: 'other@fratellocoffee.com', name: 'Olena', role_tier: 'Staff', department: 'Roasting', active: true });

        // A private sick day belonging to "other".
        await setDoc(doc(db, 'time_off_requests', 'sick-1'), {
            user_id: 'other@fratellocoffee.com', type: 'sick', status: 'approved', vacation_team: '', created_via: 'hub'
        });
    });

    const owner = testEnv.authenticatedContext('owner-uid', { email: 'prefontainech@gmail.com', email_verified: true }).firestore();
    const controller = testEnv.authenticatedContext('controller-uid', { email: 'controller@fratellocoffee.com', email_verified: true }).firestore();
    const staff = testEnv.authenticatedContext('staff-uid', { email: 'staff@fratellocoffee.com', email_verified: true }).firestore();
    const anon = testEnv.unauthenticatedContext().firestore();

    console.log('users: access-field escalation guard (the fix)');
    // A Controller may edit ordinary roster fields on a users record...
    await check('controller edits a title', assertSucceeds(updateDoc(doc(controller, 'users', 'staff@fratellocoffee.com'), { title: 'Packer II' })));
    // ...but may NOT grant Owner via role_tier — on themselves or anyone.
    await check('controller cannot set own role_tier=Owner', assertFails(updateDoc(doc(controller, 'users', 'controller@fratellocoffee.com'), { role_tier: 'Owner' })));
    await check('controller cannot set another role_tier=Owner', assertFails(updateDoc(doc(controller, 'users', 'staff@fratellocoffee.com'), { role_tier: 'Owner' })));
    await check('controller cannot flip active', assertFails(updateDoc(doc(controller, 'users', 'staff@fratellocoffee.com'), { active: false })));
    await check('controller cannot create an Owner-tier user', assertFails(setDoc(doc(controller, 'users', 'new@fratellocoffee.com'), { email: 'new@fratellocoffee.com', role_tier: 'Owner', active: true })));
    await check('controller can create a Staff-tier user', assertSucceeds(setDoc(doc(controller, 'users', 'new2@fratellocoffee.com'), { email: 'new2@fratellocoffee.com', role_tier: 'Staff', active: true })));
    // An Owner still can.
    await check('owner can set role_tier=Owner', assertSucceeds(updateDoc(doc(owner, 'users', 'controller@fratellocoffee.com'), { role_tier: 'Owner' })));

    console.log('users: self-service is contact-only');
    await check('self can edit own name', assertSucceeds(updateDoc(doc(staff, 'users', 'staff@fratellocoffee.com'), { name: 'Sam S.' })));
    await check('self cannot escalate own role_tier', assertFails(updateDoc(doc(staff, 'users', 'staff@fratellocoffee.com'), { role_tier: 'Owner' })));

    console.log('users: read scoping');
    await check('staff cannot read another users record', assertFails(getDoc(doc(staff, 'users', 'controller@fratellocoffee.com'))));
    await check('owner can read any users record', assertSucceeds(getDoc(doc(owner, 'users', 'staff@fratellocoffee.com'))));
    await check('unauthenticated cannot read users', assertFails(getDoc(doc(anon, 'users', 'staff@fratellocoffee.com'))));

    console.log('time_off: sick days stay private');
    await check('teammate cannot read another sick day', assertFails(getDoc(doc(staff, 'time_off_requests', 'sick-1'))));
    await check('owner can read a sick day', assertSucceeds(getDoc(doc(owner, 'time_off_requests', 'sick-1'))));

    await testEnv.cleanup();
    console.log(`\nAll ${passed} emulator rule checks passed.`);
}

main().catch((error) => {
    console.error('\nEmulator rule test FAILED:', error && error.message ? error.message : error);
    process.exit(1);
});
