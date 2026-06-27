#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');

const DEFAULT_OWNER_ID = 'prefontainech@gmail.com';

const TEAM_MEMBERS = [
    {
        id: DEFAULT_OWNER_ID,
        email: DEFAULT_OWNER_ID,
        name: 'Chris Prefontaine',
        department: 'Management',
        title: 'CEO',
        role_tier: 'Owner',
        profile: 'owner',
        manager_id: null,
        seed_invite: false
    },
    {
        id: 'chris@fratellocoffee.com',
        email: 'chris@fratellocoffee.com',
        name: 'Chris Prefontaine',
        department: 'Management',
        title: 'CEO',
        role_tier: 'Owner',
        profile: 'owner',
        manager_id: null
    },
    {
        id: 'russ@fratellocoffee.com',
        email: 'russ@fratellocoffee.com',
        name: 'Russ Prefontaine',
        department: 'Management',
        title: 'President',
        role_tier: 'Owner',
        profile: 'owner',
        manager_id: null
    },
    {
        id: 'chris.mcghee@fratellocoffee.com',
        email: 'chris.mcghee@fratellocoffee.com',
        name: 'Chris McGhee',
        department: 'Finance',
        title: 'Controller',
        role_tier: 'Controller',
        profile: 'controller',
        manager_id: DEFAULT_OWNER_ID
    },
    {
        id: 'nancy.gibb@fratellocoffee.com',
        email: 'nancy.gibb@fratellocoffee.com',
        name: 'Nancy Gibb',
        department: 'Finance',
        title: 'Bookkeeper & Customer Service Coordinator',
        role_tier: 'Staff',
        profile: 'staff',
        manager_id: 'chris.mcghee@fratellocoffee.com'
    },
    {
        id: 'kyle.park@fratellocoffee.com',
        email: 'kyle.park@fratellocoffee.com',
        name: 'Kyle Park',
        department: 'Production',
        title: 'Production & Operations Manager',
        role_tier: 'Manager',
        profile: 'production',
        manager_id: DEFAULT_OWNER_ID
    },
    {
        id: 'mateo.corredor@fratellocoffee.com',
        email: 'mateo.corredor@fratellocoffee.com',
        name: 'Mateo Corredor',
        department: 'Marketing',
        title: 'Marketing & Brand Manager',
        role_tier: 'Manager',
        profile: 'marketing',
        manager_id: DEFAULT_OWNER_ID
    },
    {
        id: 'joel.may@fratellocoffee.com',
        email: 'joel.may@fratellocoffee.com',
        name: 'Joel May',
        department: 'Sales',
        title: 'Key Account Manager',
        role_tier: 'Staff',
        profile: 'sales',
        manager_id: 'russ@fratellocoffee.com'
    },
    {
        id: 'darcy.watsham@fratellocoffee.com',
        email: 'darcy.watsham@fratellocoffee.com',
        name: "D'arcy Watsham",
        department: 'Sales',
        title: 'Customer Care Specialist',
        role_tier: 'Staff',
        profile: 'sales',
        manager_id: 'russ@fratellocoffee.com'
    },
    {
        id: 'allana.contois@fratellocoffee.com',
        email: 'allana.contois@fratellocoffee.com',
        name: 'Allana Contois',
        department: 'Warehouse',
        title: 'Warehouse Team Member',
        role_tier: 'Staff',
        profile: 'production',
        manager_id: 'kyle.park@fratellocoffee.com'
    },
    {
        id: 'jaleisy.quintero@fratellocoffee.com',
        email: 'jaleisy.quintero@fratellocoffee.com',
        name: 'Jaleisy Quintero',
        department: 'Packaging',
        title: 'Packaging Team Member',
        role_tier: 'Staff',
        profile: 'production',
        manager_id: 'kyle.park@fratellocoffee.com'
    },
    {
        id: 'luke@fratellocoffee.com',
        email: 'luke@fratellocoffee.com',
        name: 'Luke Prefontaine',
        department: 'Marketing',
        title: 'Copywriter',
        role_tier: 'Staff',
        profile: 'marketing',
        manager_id: 'mateo.corredor@fratellocoffee.com'
    },
    {
        id: 'oleksandr.svyrydov@fratellocoffee.com',
        email: 'oleksandr.svyrydov@fratellocoffee.com',
        name: 'Oleksandr Svyrydov',
        department: 'Roasting',
        title: 'Coffee Roaster',
        role_tier: 'Staff',
        profile: 'production',
        manager_id: 'kyle.park@fratellocoffee.com'
    },
    {
        id: 'samantha-stewart',
        email: '',
        name: 'Samantha Stewart',
        department: 'Roasting',
        title: 'Roasting Manager',
        role_tier: 'Manager',
        profile: 'production',
        manager_id: 'kyle.park@fratellocoffee.com',
        seed_user: false,
        seed_invite: false,
        note: 'Email not set up yet in EmployeeContacts.xlsx'
    }
];

function seedableUsers() {
    return TEAM_MEMBERS.filter(member => member.seed_user !== false && member.email);
}

function seedableInvites() {
    return TEAM_MEMBERS.filter(member => member.seed_invite !== false && member.email);
}

function profileFor(member) {
    if (member.profile) return member.profile;
    if (member.role_tier === 'Owner') return 'owner';
    if (member.role_tier === 'Controller') return 'controller';
    if (member.department === 'Sales') return 'sales';
    if (member.department === 'Marketing') return 'marketing';
    if (['Production', 'Roasting', 'Packaging', 'Warehouse'].includes(member.department)) return 'production';
    return 'staff';
}

function userPayload(member, stamp) {
    return {
        email: member.email.toLowerCase(),
        name: member.name,
        department: member.department,
        title: member.title,
        role_tier: member.role_tier,
        manager_id: member.manager_id,
        backup_approver_id: backupApproverFor(member),
        active: true,
        hire_date: null,
        vacation_days_allotted: null,
        vacation_days_used: null,
        calendar_tokens: {
            team: crypto.randomBytes(24).toString('base64url'),
            personal: crypto.randomBytes(24).toString('base64url'),
            admin: ['Owner', 'Controller'].includes(member.role_tier)
                ? crypto.randomBytes(24).toString('base64url')
                : ''
        },
        created_at: stamp,
        updated_at: stamp
    };
}

function invitePayload(member, stamp) {
    return {
        email: member.email.toLowerCase(),
        name: member.name,
        title: member.title,
        profile: profileFor(member),
        status: 'invited',
        department: member.department,
        role_tier: member.role_tier,
        createdAt: stamp,
        updatedAt: stamp
    };
}

function two(value) {
    return String(value).padStart(2, '0');
}

function isoFromDate(date) {
    return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
}

function dateFromIso(value) {
    return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value, days) {
    const date = typeof value === 'string' ? dateFromIso(value) : new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
}

function nthWeekday(year, monthIndex, weekday, nth) {
    const date = new Date(Date.UTC(year, monthIndex, 1));
    const offset = (weekday - date.getUTCDay() + 7) % 7;
    date.setUTCDate(1 + offset + ((nth - 1) * 7));
    return isoFromDate(date);
}

function mondayOnOrBefore(year, monthIndex, day) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(day - offset);
    return isoFromDate(date);
}

function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = ((19 * a) + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
    const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
    const month = Math.floor((h + l - (7 * m) + 114) / 31);
    const day = ((h + l - (7 * m) + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function slug(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function observedDate(actualDate, usedObservedDates) {
    let date = dateFromIso(actualDate);
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6 || usedObservedDates.has(isoFromDate(date))) {
        date = addDays(date, 1);
    }
    const observed = isoFromDate(date);
    usedObservedDates.add(observed);
    return observed;
}

function makeHoliday(year, date, name, jurisdiction, usedObservedDates) {
    return {
        id: `${date}-${slug(name)}`,
        date,
        name,
        jurisdiction,
        observed_date: observedDate(date, usedObservedDates)
    };
}

function holidaysForYear(year) {
    const usedObservedDates = new Set();
    const goodFriday = isoFromDate(addDays(easterSunday(year), -2));

    return [
        makeHoliday(year, `${year}-01-01`, "New Year's Day", 'federal', usedObservedDates),
        makeHoliday(year, nthWeekday(year, 1, 1, 3), 'Family Day', 'AB', usedObservedDates),
        makeHoliday(year, goodFriday, 'Good Friday', 'federal', usedObservedDates),
        makeHoliday(year, mondayOnOrBefore(year, 4, 24), 'Victoria Day', 'federal', usedObservedDates),
        makeHoliday(year, `${year}-07-01`, 'Canada Day', 'federal', usedObservedDates),
        makeHoliday(year, nthWeekday(year, 7, 1, 1), 'Heritage Day', 'AB', usedObservedDates),
        makeHoliday(year, nthWeekday(year, 8, 1, 1), 'Labour Day', 'federal', usedObservedDates),
        makeHoliday(year, `${year}-09-30`, 'National Day for Truth and Reconciliation', 'federal', usedObservedDates),
        makeHoliday(year, nthWeekday(year, 9, 1, 2), 'Thanksgiving', 'federal', usedObservedDates),
        makeHoliday(year, `${year}-11-11`, 'Remembrance Day', 'federal', usedObservedDates),
        makeHoliday(year, `${year}-12-25`, 'Christmas Day', 'federal', usedObservedDates),
        makeHoliday(year, `${year}-12-26`, 'Boxing Day', 'federal', usedObservedDates)
    ];
}

function backupApproverFor(member) {
    if (!member.manager_id) return null;
    const manager = TEAM_MEMBERS.find(item => item.id === member.manager_id);
    if (!manager || !manager.manager_id) return DEFAULT_OWNER_ID;
    return manager.manager_id;
}

function loadServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
        const value = raw.trim();
        const jsonText = value.startsWith('{') ? value : fs.readFileSync(value, 'utf8');
        const serviceAccount = JSON.parse(jsonText);
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        return serviceAccount;
    }

    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialPath) {
        return JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    }

    throw new Error(
        'Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT to the JSON text or to the path of the JSON key file.'
    );
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const usersToSeed = seedableUsers();
    const invitesToSeed = seedableInvites();
    const skipped = TEAM_MEMBERS.filter(member => member.seed_user === false || !member.email);
    const holidays = [2026, 2027, 2028].flatMap(holidaysForYear);

    if (dryRun) {
        console.log(`Dry run: ${usersToSeed.length} time-off users, ${invitesToSeed.length} Hub invites, ${holidays.length} holidays, 1 settings document.`);
        console.table(invitesToSeed.map(member => ({
            name: member.name,
            email: member.email.toLowerCase(),
            profile: profileFor(member),
            department: member.department,
            manager_id: member.manager_id || ''
        })));
        if (skipped.length) {
            console.log('Skipped until email is ready:', skipped.map(member => member.name).join(', '));
        }
        console.log('Sample holiday:', holidays.find(item => item.id.includes('boxing-day')));
        return;
    }

    let admin;
    try {
        admin = {
            app: require('firebase-admin/app'),
            firestore: require('firebase-admin/firestore')
        };
    } catch (error) {
        console.error('This script needs the firebase-admin package.');
        console.error('Run: npm install');
        process.exit(1);
    }

    const serviceAccount = loadServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || 'fratello-hub';

    if (!admin.app.getApps().length) {
        admin.app.initializeApp({
            credential: admin.app.cert(serviceAccount),
            projectId
        });
    }

    const db = admin.firestore.getFirestore();
    const batch = db.batch();
    const stamp = admin.firestore.FieldValue.serverTimestamp();

    for (const member of usersToSeed) {
        const ref = db.collection('users').doc(member.id);
        batch.set(ref, userPayload(member, stamp), { merge: true });
    }

    for (const member of invitesToSeed) {
        const ref = db.collection('hubInvites').doc(member.email.toLowerCase());
        batch.set(ref, invitePayload(member, stamp), { merge: true });
    }

    for (const holiday of holidays) {
        const ref = db.collection('holidays').doc(holiday.id);
        batch.set(ref, {
            date: admin.firestore.Timestamp.fromDate(dateFromIso(holiday.date)),
            name: holiday.name,
            jurisdiction: holiday.jurisdiction,
            observed_date: admin.firestore.Timestamp.fromDate(dateFromIso(holiday.observed_date))
        }, { merge: true });
    }

    batch.set(db.collection('settings').doc('global'), {
        default_owner_approver: DEFAULT_OWNER_ID,
        notification_emails_enabled: false,
        escalation_hours: 72,
        feature_flags: {
            time_off_v1: true,
            email_notifications: false,
            calendar_feeds: false,
            activity_logging: false
        },
        updated_at: stamp
    }, { merge: true });

    await batch.commit();

    console.log(`Seeded ${usersToSeed.length} time-off users, ${invitesToSeed.length} Hub invites, ${holidays.length} holidays, and settings/global into ${projectId}.`);
    if (skipped.length) {
        console.log(`Skipped ${skipped.length} person without a ready email: ${skipped.map(member => member.name).join(', ')}.`);
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
