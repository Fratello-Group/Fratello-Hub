// Server-side user deletion. Runs with the Firebase Admin SDK, so it bypasses
// Firestore security rules (no console rules-paste required) and can also remove
// the person's Firebase sign-in account. Owner-only.
const {
    adminApp,
    authenticateRequest,
    json,
    parseBody,
    requireMethod,
    roleTier
} = require('./templates/_runtime');

const OWNER_EMAILS = new Set([
    'prefontainech@gmail.com',
    'russ@fratellocoffee.com'
]);

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function isOwner(session) {
    const user = session && session.user;
    if (!user) return false;
    const email = normalizeEmail(user.email);
    return roleTier(user) === 'owner' || OWNER_EMAILS.has(email);
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        if (!isOwner(session)) return json(403, { error: 'Owner access required.' });

        const body = parseBody(event);
        const email = normalizeEmail(body.email);
        const uid = String(body.uid || '').trim();
        if (!email && !uid) return json(400, { error: 'A user email or id is required.' });

        const selfEmail = normalizeEmail(session.user && session.user.email);
        if (email && email === selfEmail) {
            return json(400, { error: 'You cannot delete your own account.' });
        }

        const { getFirestore } = require('firebase-admin/firestore');
        const { getAuth } = require('firebase-admin/auth');
        const app = adminApp();
        const db = getFirestore(app);
        const auth = getAuth(app);

        const deleted = { hubProfiles: 0, hubInvites: false, users: false, authAccount: false };

        // hubProfiles can be keyed by uid; also match any keyed by a different id
        // that carry this email.
        const profileIds = new Set();
        if (uid) profileIds.add(uid);
        if (email) {
            const snap = await db.collection('hubProfiles').where('email', '==', email).get();
            snap.forEach(docSnap => profileIds.add(docSnap.id));
        }
        for (const id of profileIds) {
            await db.collection('hubProfiles').doc(id).delete();
            deleted.hubProfiles += 1;
        }

        if (email) {
            await db.collection('hubInvites').doc(email).delete();
            deleted.hubInvites = true;
            await db.collection('users').doc(email).delete();
            deleted.users = true;
        }

        // Remove their Firebase sign-in account so they can no longer log in.
        try {
            let authUid = uid;
            if (!authUid && email) {
                const record = await auth.getUserByEmail(email);
                authUid = record.uid;
            }
            if (authUid) {
                await auth.deleteUser(authUid);
                deleted.authAccount = true;
            }
        } catch (authError) {
            // No sign-in account (or already removed) — that's fine.
        }

        return json(200, { ok: true, email, uid, deleted });
    } catch (error) {
        console.error('hub-delete-user failed', error);
        return json(500, { error: error.message || 'Could not delete the user.' });
    }
};
