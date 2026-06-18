const assert = require('assert');

const USERS = {
    'prefontainech@gmail.com': {
        email: 'prefontainech@gmail.com',
        name: 'Chris Prefontaine',
        role_tier: 'Owner',
        active: true
    },
    'russ@fratellocoffee.com': {
        email: 'russ@fratellocoffee.com',
        name: 'Russ Prefontaine',
        role_tier: 'Owner',
        active: true
    },
    'controller@fratellocoffee.com': {
        email: 'controller@fratellocoffee.com',
        name: 'Chris McGhee',
        role_tier: 'Controller',
        active: true
    },
    'kyle@fratellocoffee.com': {
        email: 'kyle@fratellocoffee.com',
        name: 'Kyle Park',
        role_tier: 'Manager',
        active: true
    },
    'mateo@fratellocoffee.com': {
        email: 'mateo@fratellocoffee.com',
        name: 'Mateo Corredor',
        role_tier: 'Manager',
        active: true
    },
    'allana.contois@fratellocoffee.com': {
        email: 'allana.contois@fratellocoffee.com',
        name: 'Allana Contois',
        role_tier: 'Manager',
        active: true
    },
    'jaleisy.quintero@fratellocoffee.com': {
        email: 'jaleisy.quintero@fratellocoffee.com',
        name: 'Jaleisy Quintero',
        role_tier: 'Manager',
        active: true
    },
    'sungjoo.hong@fratellocoffee.com': {
        email: 'sungjoo.hong@fratellocoffee.com',
        name: 'Sungjoo Hong',
        role_tier: 'Staff',
        active: true
    },
    'olena.zaitseva@fratellocoffee.com': {
        email: 'olena.zaitseva@fratellocoffee.com',
        name: 'Olena Zaitseva',
        role_tier: 'Staff',
        active: true
    }
};

const HUB_PROFILES = {
    owner: { email: 'prefontainech@gmail.com', profile: 'owner', status: 'active' },
    russ: { email: 'russ@fratellocoffee.com', profile: 'owner', status: 'active' },
    controller: { email: 'controller@fratellocoffee.com', profile: 'controller', status: 'active' },
    kyle: { email: 'kyle@fratellocoffee.com', profile: 'production', status: 'active' },
    mateo: { email: 'mateo@fratellocoffee.com', profile: 'marketing', status: 'active' },
    allana: { email: 'allana.contois@fratellocoffee.com', profile: 'production', status: 'active' },
    jaleisy: { email: 'jaleisy.quintero@fratellocoffee.com', profile: 'production', status: 'active' },
    sungjoo: { email: 'sungjoo.hong@fratellocoffee.com', profile: 'staff', status: 'active' },
    olena: { email: 'olena.zaitseva@fratellocoffee.com', profile: 'staff', status: 'active' }
};

function auth(uid) {
    const profile = HUB_PROFILES[uid];
    return profile ? { uid, email: profile.email } : null;
}

function profileFor(requestAuth) {
    return requestAuth ? HUB_PROFILES[requestAuth.uid] : null;
}

function isOwner(requestAuth) {
    const profile = profileFor(requestAuth);
    return isBootstrapOwner(requestAuth) || Boolean(profile && profile.profile === 'owner' && profile.status === 'active');
}

function isBootstrapOwner(requestAuth) {
    return Boolean(requestAuth && ['prefontainech@gmail.com', 'russ@fratellocoffee.com'].includes(requestAuth.email));
}

function isController(requestAuth) {
    const profile = profileFor(requestAuth);
    return Boolean(profile && profile.profile === 'controller' && profile.status === 'active');
}

function isOwnerOrController(requestAuth) {
    return isOwner(requestAuth) || isController(requestAuth);
}

function hasActiveProfile(requestAuth, profileKey) {
    const profile = profileFor(requestAuth);
    return Boolean(profile && profile.profile === profileKey && profile.status === 'active');
}

function canUseAvatarBuilder(requestAuth) {
    return isOwnerOrController(requestAuth)
        || hasActiveProfile(requestAuth, 'marketing')
        || hasActiveProfile(requestAuth, 'sales');
}

function isSelfUserId(requestAuth, userId) {
    const user = USERS[userId];
    return Boolean(requestAuth && user && user.email === requestAuth.email && user.active === true);
}

function isSelfUserRecord(requestAuth, data) {
    return Boolean(requestAuth && data.email === requestAuth.email && data.active === true);
}

function isRequester(requestAuth, data) {
    return Boolean(data.user_id && isSelfUserId(requestAuth, data.user_id));
}

function isVacation(data) {
    return data.type === 'vacation';
}

function isSickDay(data) {
    return data.type === 'sick';
}

function isVacationApprover(requestAuth, data) {
    return isVacation(data) && data.approver_id && isSelfUserId(requestAuth, data.approver_id);
}

function canReadUser(requestAuth, userDoc) {
    return isOwnerOrController(requestAuth) || isSelfUserRecord(requestAuth, userDoc);
}

function canListUsers(requestAuth) {
    return isOwnerOrController(requestAuth);
}

function canReadTimeOff(requestAuth, requestDoc) {
    return isOwnerOrController(requestAuth)
        || isRequester(requestAuth, requestDoc)
        || isVacationApprover(requestAuth, requestDoc);
}

function canCreateTimeOff(requestAuth, data) {
    if (isOwnerOrController(requestAuth)) return true;
    if (!['vacation', 'sick'].includes(data.type)) return false;
    if (!isRequester(requestAuth, data)) return false;
    if (data.created_via !== 'hub') return false;
    if (isVacation(data)) {
        return ['pending', 'approved'].includes(data.status)
            && (data.status === 'pending' || isOwner(requestAuth));
    }
    return isSickDay(data) && data.status === 'approved' && data.approver_id === null;
}

function canUpdateTimeOff(requestAuth, before, after, nowMs) {
    if (isOwnerOrController(requestAuth)) return true;
    if (!isRequester(requestAuth, before)) return false;
    if (before.user_id !== after.user_id) return false;
    if (before.type !== after.type) return false;
    if (before.created_via !== after.created_via) return false;
    if (isVacation(before)) {
        return before.status === 'pending' && ['pending', 'cancelled'].includes(after.status);
    }
    return isSickDay(before)
        && before.edit_locked_at
        && nowMs <= before.edit_locked_at
        && ['approved', 'cancelled'].includes(after.status);
}

function canReadApproval(requestAuth, approvalDoc) {
    return isOwnerOrController(requestAuth) || isSelfUserId(requestAuth, approvalDoc.approver_id);
}

function canReadActivity(requestAuth) {
    return isOwner(requestAuth);
}

function canReadNotification(requestAuth) {
    return isOwner(requestAuth);
}

function validAvatarStatus(data) {
    return ['Untested', 'Live', 'Worked', 'Flopped'].includes(data.status);
}

function isAvatarCreator(requestAuth, data) {
    return Boolean(requestAuth
        && data.created_by_uid === requestAuth.uid
        && data.created_by_email === requestAuth.email);
}

function canCreateAvatarLog(requestAuth, data) {
    return canUseAvatarBuilder(requestAuth)
        && isAvatarCreator(requestAuth, data)
        && validAvatarStatus(data)
        && data.created_via === 'hub-avatar-builder';
}

function canUpdateAvatarLog(requestAuth, before, after) {
    return canUseAvatarBuilder(requestAuth)
        && (isOwnerOrController(requestAuth) || isAvatarCreator(requestAuth, before))
        && after.created_by_uid === before.created_by_uid
        && after.created_by_email === before.created_by_email
        && after.created_via === before.created_via
        && validAvatarStatus(after);
}

function canDeleteAvatarLog(requestAuth, data) {
    return canUseAvatarBuilder(requestAuth)
        && (isOwnerOrController(requestAuth) || isAvatarCreator(requestAuth, data));
}

const sungjooVacation = {
    user_id: 'sungjoo.hong@fratellocoffee.com',
    type: 'vacation',
    status: 'pending',
    approver_id: 'kyle@fratellocoffee.com',
    created_via: 'hub'
};

const sungjooSickDay = {
    user_id: 'sungjoo.hong@fratellocoffee.com',
    type: 'sick',
    status: 'approved',
    approver_id: null,
    created_via: 'hub',
    edit_locked_at: Date.UTC(2026, 4, 20, 18)
};

const olenaSickDay = {
    user_id: 'olena.zaitseva@fratellocoffee.com',
    type: 'sick',
    status: 'approved',
    approver_id: null,
    created_via: 'hub',
    edit_locked_at: Date.UTC(2026, 4, 20, 18)
};

const mateoAvatar = {
    avatar_name: 'Freshness Skeptic',
    status: 'Untested',
    created_by_uid: 'mateo',
    created_by_email: 'mateo@fratellocoffee.com',
    created_via: 'hub-avatar-builder'
};

function run() {
    assert.equal(canReadUser(auth('sungjoo'), USERS['sungjoo.hong@fratellocoffee.com']), true);
    assert.equal(canReadUser(auth('sungjoo'), USERS['kyle@fratellocoffee.com']), false);
    assert.equal(canListUsers(auth('owner')), true);
    assert.equal(canListUsers(auth('controller')), true);
    assert.equal(canListUsers(auth('kyle')), false);
    assert.equal(canListUsers({ uid: 'new-chris-uid', email: 'prefontainech@gmail.com' }), true);

    assert.equal(canReadTimeOff(auth('owner'), sungjooSickDay), true);
    assert.equal(canReadTimeOff(auth('controller'), sungjooSickDay), true);
    assert.equal(canReadTimeOff(auth('sungjoo'), sungjooSickDay), true);
    assert.equal(canReadTimeOff(auth('kyle'), sungjooSickDay), false);
    assert.equal(canReadTimeOff(auth('allana'), sungjooSickDay), false);
    assert.equal(canReadTimeOff(auth('jaleisy'), olenaSickDay), false);
    assert.equal(canReadTimeOff(auth('mateo'), sungjooSickDay), false);

    assert.equal(canReadTimeOff(auth('kyle'), sungjooVacation), true);
    assert.equal(canReadTimeOff(auth('sungjoo'), sungjooVacation), true);
    assert.equal(canReadTimeOff(auth('mateo'), sungjooVacation), false);

    assert.equal(canCreateTimeOff(auth('sungjoo'), { ...sungjooVacation, status: 'pending' }), true);
    assert.equal(canCreateTimeOff(auth('sungjoo'), { ...sungjooVacation, status: 'approved' }), false);
    assert.equal(canCreateTimeOff(auth('sungjoo'), sungjooSickDay), true);
    assert.equal(canCreateTimeOff(auth('kyle'), { ...sungjooVacation, status: 'pending' }), false);
    assert.equal(canCreateTimeOff(auth('owner'), {
        user_id: 'prefontainech@gmail.com',
        type: 'vacation',
        status: 'approved',
        approver_id: null,
        created_via: 'hub'
    }), true);

    assert.equal(canUpdateTimeOff(auth('sungjoo'), sungjooVacation, {
        ...sungjooVacation,
        status: 'cancelled'
    }, Date.UTC(2026, 4, 20, 12)), true);
    assert.equal(canUpdateTimeOff(auth('kyle'), sungjooVacation, {
        ...sungjooVacation,
        status: 'approved'
    }, Date.UTC(2026, 4, 20, 12)), false);
    assert.equal(canUpdateTimeOff(auth('sungjoo'), sungjooSickDay, {
        ...sungjooSickDay,
        status: 'cancelled'
    }, Date.UTC(2026, 4, 20, 12)), true);
    assert.equal(canUpdateTimeOff(auth('sungjoo'), sungjooSickDay, {
        ...sungjooSickDay,
        status: 'cancelled'
    }, Date.UTC(2026, 4, 21, 12)), false);

    assert.equal(canReadApproval(auth('owner'), { approver_id: 'kyle@fratellocoffee.com' }), true);
    assert.equal(canReadApproval(auth('controller'), { approver_id: 'kyle@fratellocoffee.com' }), true);
    assert.equal(canReadApproval(auth('kyle'), { approver_id: 'kyle@fratellocoffee.com' }), true);
    assert.equal(canReadApproval(auth('sungjoo'), { approver_id: 'kyle@fratellocoffee.com' }), false);

    assert.equal(canReadActivity(auth('owner')), true);
    assert.equal(canReadActivity(auth('controller')), false);
    assert.equal(canReadNotification(auth('owner')), true);
    assert.equal(canReadNotification(auth('controller')), false);

    assert.equal(canUseAvatarBuilder(auth('owner')), true);
    assert.equal(canUseAvatarBuilder(auth('controller')), true);
    assert.equal(canUseAvatarBuilder(auth('mateo')), true);
    assert.equal(canUseAvatarBuilder(auth('kyle')), false);
    assert.equal(canUseAvatarBuilder(auth('sungjoo')), false);

    assert.equal(canCreateAvatarLog(auth('mateo'), mateoAvatar), true);
    assert.equal(canCreateAvatarLog(auth('sungjoo'), {
        ...mateoAvatar,
        created_by_uid: 'sungjoo',
        created_by_email: 'sungjoo.hong@fratellocoffee.com'
    }), false);
    assert.equal(canCreateAvatarLog(auth('mateo'), { ...mateoAvatar, status: 'Testing' }), false);

    assert.equal(canUpdateAvatarLog(auth('mateo'), mateoAvatar, { ...mateoAvatar, status: 'Worked' }), true);
    assert.equal(canUpdateAvatarLog(auth('controller'), mateoAvatar, { ...mateoAvatar, status: 'Flopped' }), true);
    assert.equal(canUpdateAvatarLog(auth('kyle'), mateoAvatar, { ...mateoAvatar, status: 'Live' }), false);
    assert.equal(canUpdateAvatarLog(auth('mateo'), mateoAvatar, {
        ...mateoAvatar,
        created_by_email: 'someoneelse@fratellocoffee.com',
        status: 'Worked'
    }), false);
    assert.equal(canDeleteAvatarLog(auth('mateo'), mateoAvatar), true);
    assert.equal(canDeleteAvatarLog(auth('controller'), mateoAvatar), true);
    assert.equal(canDeleteAvatarLog(auth('kyle'), mateoAvatar), false);
}

run();
console.log('Firestore rules policy simulation passed.');
