const {
    absoluteUrl,
    adminApp,
    authenticateRequest,
    json,
    parseBody,
    requireMethod,
    roleTier,
    sendLoggedEmail
} = require('./templates/_runtime');

const OWNER_EMAILS = new Set([
    'prefontainech@gmail.com',
    'russ@fratellocoffee.com'
]);

const PROFILE_KEYS = new Set(['owner', 'controller', 'production', 'marketing', 'sales', 'staff']);

function clean(value) {
    return String(value || '').trim();
}

function normalizeEmail(value) {
    return clean(value).toLowerCase();
}

function displayNameFromEmail(email) {
    return clean(email).split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase()) || email;
}

function defaultManagerId(profileKey) {
    if (profileKey === 'owner') return null;
    if (profileKey === 'sales') return 'russ@fratellocoffee.com';
    return 'prefontainech@gmail.com';
}

function timeOffDepartment(profileKey) {
    if (profileKey === 'controller') return 'Finance';
    if (profileKey === 'production') return 'Production';
    if (profileKey === 'marketing') return 'Marketing';
    if (profileKey === 'sales') return 'Sales';
    if (profileKey === 'owner') return 'Leadership';
    return 'Staff';
}

function timeOffRoleTier(profileKey) {
    if (profileKey === 'owner') return 'owner';
    if (profileKey === 'controller') return 'controller';
    if (profileKey === 'production' || profileKey === 'marketing' || profileKey === 'sales') return 'manager';
    return 'staff';
}

function isOwner(session) {
    const user = session && session.user;
    if (!user) return false;
    const email = normalizeEmail(user && user.email);
    return roleTier(user) === 'owner' || OWNER_EMAILS.has(email);
}

function inviteText({ name, setupUrl, hubUrl }) {
    return [
        `Hi ${name},`,
        '',
        'You have been invited to the Fratello Ops Hub.',
        '',
        'Use this private setup link to create your password:',
        setupUrl,
        '',
        'After your password is set, you can sign in at:',
        hubUrl,
        '',
        'Fratello Group Inc.'
    ].join('\n');
}

function inviteHtml({ name, setupUrl, hubUrl }) {
    return `
        <p>Hi ${name},</p>
        <p>You have been invited to the Fratello Ops Hub.</p>
        <p><a href="${setupUrl}">Create your Hub password</a></p>
        <p>After your password is set, you can sign in at <a href="${hubUrl}">${hubUrl}</a>.</p>
        <p>Fratello Group Inc.</p>
    `;
}

async function upsertInviteDocs({ name, email, title, profile, ownerEmail }) {
    const { getFirestore, FieldValue } = require('firebase-admin/firestore');
    const db = getFirestore(adminApp());
    const stamp = FieldValue.serverTimestamp();

    await db.collection('hubInvites').doc(email).set({
        name,
        email,
        title,
        profile,
        status: 'invited',
        invitedBy: ownerEmail || '',
        invitedAt: stamp,
        updatedAt: stamp
    }, { merge: true });

    await db.collection('users').doc(email).set({
        email,
        name,
        department: timeOffDepartment(profile),
        title,
        role_tier: timeOffRoleTier(profile),
        manager_id: defaultManagerId(profile),
        backup_approver_id: null,
        active: true,
        updated_at: stamp
    }, { merge: true });

    const matchingProfiles = await db.collection('hubProfiles').where('email', '==', email).get();
    const updates = [];
    matchingProfiles.forEach(doc => {
        updates.push(doc.ref.set({
            name,
            email,
            title,
            profile,
            status: 'active',
            updatedAt: stamp
        }, { merge: true }));
    });
    await Promise.all(updates);
}

async function createOrUpdateAuthUser({ name, email }) {
    const { getAuth } = require('firebase-admin/auth');
    const auth = getAuth(adminApp());

    try {
        const existing = await auth.getUserByEmail(email);
        if (existing.disabled || existing.displayName !== name) {
            await auth.updateUser(existing.uid, {
                displayName: name,
                disabled: false
            });
        }
        return { uid: existing.uid, existed: true };
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        const created = await auth.createUser({
            email,
            displayName: name,
            emailVerified: false,
            disabled: false
        });
        return { uid: created.uid, existed: false };
    }
}

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        if (!isOwner(session)) return json(403, { error: 'Owner access required.' });

        const body = parseBody(event);
        const email = normalizeEmail(body.email);
        const name = clean(body.name) || displayNameFromEmail(email);
        const title = clean(body.title);
        const profile = PROFILE_KEYS.has(body.profile) ? body.profile : 'staff';

        if (!email || !email.includes('@')) return json(400, { error: 'Add a valid email before sending an invite.' });
        if (!name) return json(400, { error: 'Add the person’s full name before sending an invite.' });

        await upsertInviteDocs({
            name,
            email,
            title,
            profile,
            ownerEmail: session.user && session.user.email
        });

        const authUser = await createOrUpdateAuthUser({ name, email });
        const { getAuth } = require('firebase-admin/auth');
        const hubUrl = absoluteUrl(event, '/');
        const setupUrl = await getAuth(adminApp()).generatePasswordResetLink(email, {
            url: hubUrl,
            handleCodeInApp: false
        });

        let emailSent = false;
        let emailError = '';
        try {
            await sendLoggedEmail({
                to: email,
                subject: 'Set up your Fratello Hub login',
                html: inviteHtml({ name, setupUrl, hubUrl }),
                text: inviteText({ name, setupUrl, hubUrl }),
                templateId: 'hub-invite',
                relatedRequestId: email
            });
            emailSent = true;
        } catch (error) {
            emailError = error.message || 'Invite email could not be sent.';
        }

        return json(200, {
            user: {
                uid: authUser.uid,
                existed: authUser.existed,
                name,
                email,
                title,
                profile,
                status: 'invited'
            },
            setupUrl,
            inviteUrl: setupUrl,
            emailSent,
            emailError
        });
    } catch (error) {
        console.error(error);
        return json(500, { error: error.message || 'Could not send invite.' });
    }
};
