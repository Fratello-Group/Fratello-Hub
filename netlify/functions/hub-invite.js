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

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeEmail(value) {
    return clean(value).toLowerCase();
}

function validDateOnly(value) {
    const cleanValue = clean(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(cleanValue) ? cleanValue : '';
}

function normalizeActive(value) {
    if (value === false || value === 'false' || value === 'inactive' || value === 'disabled') return false;
    return true;
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
    if (profileKey === 'owner') return 'Owner';
    if (profileKey === 'controller') return 'Controller';
    if (profileKey === 'production' || profileKey === 'marketing' || profileKey === 'sales') return 'Manager';
    return 'Staff';
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
    const safeName = escapeHtml(name);
    const safeSetupUrl = escapeHtml(setupUrl);
    const safeHubUrl = escapeHtml(hubUrl);
    return `
        <p>Hi ${safeName},</p>
        <p>You have been invited to the Fratello Ops Hub.</p>
        <p><a href="${safeSetupUrl}">Create your Hub password</a></p>
        <p>After your password is set, you can sign in at <a href="${safeHubUrl}">${safeHubUrl}</a>.</p>
        <p>Fratello Group Inc.</p>
    `;
}

async function upsertInviteDocs({ name, email, title, profile, department, roleTier, managerId, hireDate, active, ownerEmail }) {
    const { getFirestore, FieldValue } = require('firebase-admin/firestore');
    const db = getFirestore(adminApp());
    const stamp = FieldValue.serverTimestamp();
    const hireDateValue = validDateOnly(hireDate);

    await db.collection('hubInvites').doc(email).set({
        name,
        email,
        title,
        profile,
        department,
        role_tier: roleTier,
        manager_id: managerId,
        hire_date: hireDateValue || null,
        active,
        status: 'invited',
        invitedBy: ownerEmail || '',
        invitedAt: stamp,
        updatedAt: stamp
    }, { merge: true });

    await db.collection('users').doc(email).set({
        email,
        name,
        department,
        title,
        role_tier: roleTier,
        manager_id: managerId,
        backup_approver_id: null,
        active,
        hire_date: hireDateValue ? new Date(`${hireDateValue}T00:00:00.000Z`) : null,
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
            department,
            role_tier: roleTier,
            manager_id: managerId,
            hire_date: hireDateValue || null,
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
        const department = clean(body.department) || timeOffDepartment(profile);
        const roleTier = clean(body.roleTier || body.role_tier) || timeOffRoleTier(profile);
        const managerId = normalizeEmail(body.managerId || body.manager_id) || defaultManagerId(profile) || '';
        const hireDate = validDateOnly(body.hireDate || body.hire_date);
        const active = normalizeActive(body.active);

        if (!email || !email.includes('@')) return json(400, { error: 'Add a valid email before sending an invite.' });
        if (!name) return json(400, { error: 'Add the person’s full name before sending an invite.' });

        await upsertInviteDocs({
            name,
            email,
            title,
            profile,
            department,
            roleTier,
            managerId,
            hireDate,
            active,
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
                department,
                roleTier,
                managerId,
                hireDate,
                active,
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
