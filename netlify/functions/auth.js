const {
    INVITE_TTL_MS,
    PROFILES,
    RESET_TTL_MS,
    buildInviteUrl,
    createSession,
    findUserBySession,
    hashPassword,
    hashToken,
    json,
    legacyCodeRole,
    makeId,
    normalizeEmail,
    nowIso,
    parseBody,
    publicUser,
    randomToken,
    readUsers,
    requireOwner,
    roleFromUser,
    verifyPassword,
    writeUsers
} = require('./auth-lib');

function withSession(user) {
    return {
        sessionToken: createSession(user),
        role: roleFromUser(user)
    };
}

function findByEmail(users, email) {
    return users.find(user => normalizeEmail(user.email) === normalizeEmail(email));
}

function isActiveOwner(user) {
    return user.profile === 'owner' && user.status === 'active';
}

function isOnlyActiveOwner(users, user) {
    return isActiveOwner(user) && !users.some(item => item.id !== user.id && isActiveOwner(item));
}

function scrubExpiredTokens(user) {
    const now = Date.now();
    const inviteExpired = user.inviteExpiresAt && new Date(user.inviteExpiresAt).getTime() < now;
    const resetExpired = user.resetExpiresAt && new Date(user.resetExpiresAt).getTime() < now;
    return {
        ...user,
        inviteTokenHash: inviteExpired ? '' : user.inviteTokenHash,
        resetTokenHash: resetExpired ? '' : user.resetTokenHash,
        inviteExpiresAt: user.inviteExpiresAt || '',
        resetExpiresAt: user.resetExpiresAt || ''
    };
}

async function login(event) {
    const body = parseBody(event);

    if (body.code && !body.email && !body.password) {
        const role = await legacyCodeRole(body.code);
        if (!role) return json(401, { error: 'Invalid access code' });

        const users = await readUsers();
        const setupUser = users.find(user => user.profile === role.key);
        if (setupUser) {
            setupUser.status = 'active';
            setupUser.updatedAt = nowIso();
            await writeUsers(users);
            return json(200, { ...withSession(setupUser), legacy: true });
        }
        return json(200, { role, legacy: true });
    }

    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) return json(400, { error: 'Email and password are required' });

    const users = await readUsers();
    const user = findByEmail(users, email);
    if (!user || user.status !== 'active' || !verifyPassword(password, user)) {
        return json(401, { error: 'Invalid email or password' });
    }

    user.lastLoginAt = nowIso();
    user.updatedAt = nowIso();
    await writeUsers(users);

    return json(200, withSession(user));
}

async function session(event) {
    const sessionUser = await findUserBySession(event);
    if (!sessionUser) return json(401, { error: 'Session expired' });
    return json(200, { role: roleFromUser(sessionUser.user) });
}

async function listUsers(event) {
    const owner = await requireOwner(event);
    if (!owner) return json(403, { error: 'Owner access required' });
    const users = (await readUsers()).map(scrubExpiredTokens);
    await writeUsers(users);
    return json(200, { users: users.map(publicUser) });
}

async function inviteUser(event) {
    const owner = await requireOwner(event);
    if (!owner) return json(403, { error: 'Owner access required' });

    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim();
    const title = String(body.title || '').trim();
    const profile = String(body.profile || 'staff').trim();

    if (!email || !name) return json(400, { error: 'Name and email are required' });
    if (!PROFILES[profile]) return json(400, { error: 'Invalid access profile' });

    const users = await readUsers();
    const existing = findByEmail(users, email);
    const token = randomToken();
    const stamp = nowIso();
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const nextUser = {
        id: existing ? existing.id : makeId(email),
        name,
        email,
        title,
        profile,
        status: existing && existing.status === 'active' ? 'active' : 'invited',
        inviteTokenHash: hashToken(token),
        inviteExpiresAt,
        resetTokenHash: '',
        resetExpiresAt: '',
        createdAt: existing ? existing.createdAt : stamp,
        updatedAt: stamp,
        invitedAt: stamp,
        acceptedAt: existing ? existing.acceptedAt || '' : '',
        invitedBy: owner.user.id,
        passwordHash: existing ? existing.passwordHash : '',
        passwordSalt: existing ? existing.passwordSalt : '',
        passwordChangedAt: existing ? existing.passwordChangedAt || '' : '',
        resetCreatedAt: existing ? existing.resetCreatedAt || '' : '',
        lastLoginAt: existing ? existing.lastLoginAt || '' : '',
        disabledAt: ''
    };

    if (existing) {
        Object.assign(existing, nextUser);
    } else {
        users.push(nextUser);
    }

    await writeUsers(users);
    return json(200, {
        user: publicUser(nextUser),
        inviteUrl: buildInviteUrl(event, token)
    });
}

async function updateUser(event) {
    const owner = await requireOwner(event);
    if (!owner) return json(403, { error: 'Owner access required' });

    const body = parseBody(event);
    const users = await readUsers();
    const user = users.find(item => item.id === body.id);
    if (!user) return json(404, { error: 'User not found' });

    if (body.name !== undefined) user.name = String(body.name || '').trim();
    if (body.title !== undefined) user.title = String(body.title || '').trim();
    if (body.profile !== undefined) {
        const profile = String(body.profile || 'staff').trim();
        if (!PROFILES[profile]) return json(400, { error: 'Invalid access profile' });
        if (profile !== 'owner' && isOnlyActiveOwner(users, user)) {
            return json(400, { error: 'At least one active owner account must remain' });
        }
        user.profile = profile;
    }
    user.updatedAt = nowIso();

    await writeUsers(users);
    return json(200, { user: publicUser(user) });
}

async function disableUser(event) {
    const owner = await requireOwner(event);
    if (!owner) return json(403, { error: 'Owner access required' });

    const body = parseBody(event);
    const users = await readUsers();
    const user = users.find(item => item.id === body.id);
    if (!user) return json(404, { error: 'User not found' });
    if (user.profile === 'owner' && user.id === owner.user.id) {
        return json(400, { error: 'You cannot disable your own owner account' });
    }
    if (body.disabled && isOnlyActiveOwner(users, user)) {
        return json(400, { error: 'At least one active owner account must remain' });
    }

    user.status = body.disabled ? 'disabled' : 'active';
    user.disabledAt = body.disabled ? nowIso() : '';
    user.updatedAt = nowIso();
    await writeUsers(users);
    return json(200, { user: publicUser(user) });
}

async function createReset(event) {
    const owner = await requireOwner(event);
    if (!owner) return json(403, { error: 'Owner access required' });

    const body = parseBody(event);
    const users = await readUsers();
    const user = users.find(item => item.id === body.id);
    if (!user) return json(404, { error: 'User not found' });

    const token = randomToken();
    const stamp = nowIso();
    user.resetTokenHash = hashToken(token);
    user.resetExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    user.resetCreatedAt = stamp;
    user.updatedAt = stamp;
    await writeUsers(users);

    return json(200, {
        user: publicUser(user),
        resetUrl: buildInviteUrl(event, token)
    });
}

async function requestPasswordReset(event) {
    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    if (!email) return json(400, { error: 'Email is required' });

    const users = await readUsers();
    const user = findByEmail(users, email);

    if (!user || user.status !== 'active') {
        return json(200, {
            message: 'If this email has Hub access, a reset link can be created.'
        });
    }

    const token = randomToken();
    const stamp = nowIso();
    user.resetTokenHash = hashToken(token);
    user.resetExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    user.resetCreatedAt = stamp;
    user.updatedAt = stamp;
    await writeUsers(users);

    return json(200, {
        user: { name: user.name, email: user.email },
        resetUrl: buildInviteUrl(event, token)
    });
}

async function acceptInvite(event) {
    const body = parseBody(event);
    const tokenHash = hashToken(String(body.token || ''));
    const password = String(body.password || '');
    const name = String(body.name || '').trim();

    if (!body.token || password.length < 8) {
        return json(400, { error: 'Use the invite link and a password of at least 8 characters' });
    }

    const users = await readUsers();
    const user = users.find(item =>
        (item.inviteTokenHash === tokenHash || item.resetTokenHash === tokenHash) &&
        item.status !== 'disabled'
    );

    if (!user) return json(404, { error: 'Invite or reset link not found' });

    const isInvite = user.inviteTokenHash === tokenHash;
    const expiresAt = isInvite ? user.inviteExpiresAt : user.resetExpiresAt;
    if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
        return json(410, { error: 'This link has expired' });
    }

    const passwordParts = hashPassword(password);
    const stamp = nowIso();
    user.passwordHash = passwordParts.hash;
    user.passwordSalt = passwordParts.salt;
    user.status = 'active';
    if (name) user.name = name;
    if (isInvite || !user.acceptedAt) user.acceptedAt = stamp;
    user.inviteTokenHash = '';
    user.inviteExpiresAt = '';
    user.resetTokenHash = '';
    user.resetExpiresAt = '';
    user.passwordChangedAt = stamp;
    user.updatedAt = stamp;
    await writeUsers(users);

    return json(200, withSession(user));
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const body = parseBody(event);
    const action = body.action || 'login';

    try {
        if (action === 'login') return login(event);
        if (action === 'session') return session(event);
        if (action === 'users:list') return listUsers(event);
        if (action === 'users:invite') return inviteUser(event);
        if (action === 'users:update') return updateUser(event);
        if (action === 'users:disable') return disableUser(event);
        if (action === 'users:reset') return createReset(event);
        if (action === 'password:forgot') return requestPasswordReset(event);
        if (action === 'invite:accept') return acceptInvite(event);
        return json(400, { error: 'Unknown action' });
    } catch (error) {
        console.error(error);
        return json(500, { error: 'Something went wrong' });
    }
};
