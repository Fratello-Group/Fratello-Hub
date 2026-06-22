# Fratello Ops Hub Status Report

Date: 2026-05-20  
Repo checked: `/Users/chris/Desktop/Fratello/Fratello-Hub-codex`  
Live site checked: `https://fratello-ops-hub.netlify.app`

## Executive Summary

The public Hub site is live and serving the current Hub pages. The homepage includes the newer Hub items such as Time Off, Wholesale Proposal Builder, and the Fratello Design Skill.

The server-side setup is not complete yet. A live request to the calendar Netlify Function returned:

`FIREBASE_SERVICE_ACCOUNT is not configured.`

That means the Netlify Functions that need server access to Firestore cannot work correctly yet. The Firebase web login/config is in code, but the private Firebase service account is missing from Netlify.

I could not verify private Netlify deploy logs or Netlify environment variables directly from this workspace because:

- The local repo is not linked to Netlify with a `.netlify` folder.
- The Netlify CLI is not installed in this terminal.
- No Netlify auth/session metadata is available here.

## Live Site Check

Public checks completed:

| Check | Result |
| --- | --- |
| `https://fratello-ops-hub.netlify.app` | Live, `HTTP 200` |
| Homepage includes newer Hub items | Yes |
| `hr/time-off/vacation-tracker.html` | Live, `HTTP 200` |
| `/.netlify/functions/firestore-smoke-test` without login | Deployed, returned `HTTP 403` owner access required |
| `/api/calendar.ics?token=audit-not-a-real-token` | Deployed, returned `HTTP 500` because `FIREBASE_SERVICE_ACCOUNT` is missing |

What this tells us:

- The public site is deployed.
- Netlify Functions are deployed.
- The latest private deploy logs were not available from this workspace.
- The live server-side Firebase configuration is incomplete.

## Netlify Environment Variables

### Firebase / Firestore

| Variable | Status |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Missing on the live Netlify site, confirmed by live function error |
| `FIREBASE_PROJECT_ID` | Not confirmed from Netlify; code can also read project ID from the service account |

The public Firebase browser config exists in code at `system/firebase-config.js`. That is different from the private service account needed by Netlify Functions.

### Resend / Email

| Variable | Status |
| --- | --- |
| `RESEND_API_KEY` | Not verified from Netlify |
| `EMAIL_FROM_ADDRESS` | Not verified from Netlify; code falls back to `hub@fratellocoffee.com` |
| `EMAIL_FROM_NAME` | Not verified from Netlify; code falls back to `Fratello Hub` |

Because `FIREBASE_SERVICE_ACCOUNT` is missing, the email notification functions cannot get far enough to prove whether Resend is configured.

## Staff Emails in `scripts/seed-firestore.js`

These are the staff records that would currently be seeded:

| Name | Email |
| --- | --- |
| Chris Prefontaine | `prefontainech@gmail.com` |
| Russ Prefontaine | `russ@fratellocoffee.com` |
| Chris McGhee | `controller@fratellocoffee.com` |
| Kyle Park | `kyle@fratellocoffee.com` |
| Mateo Corredor | `mateo@fratellocoffee.com` |
| Joel May | `joel.may@fratellocoffee.com` |
| D'arcy Watsham | `darcy.watsham@fratellocoffee.com` |
| Allana Contois | `allana.contois@fratellocoffee.com` |
| Jaleisy Quintero | `jaleisy.quintero@fratellocoffee.com` |
| Nancy Gibb | `nancy.gibb@fratellocoffee.com` |
| Luke Prefontaine | `luke.prefontaine@fratellocoffee.com` |
| Sandra Mestre | `sandra.mestre@fratellocoffee.com` |
| Monica Banman | `monica.banman@fratellocoffee.com` |
| Oleksandr Svyrydov | `oleksandr.svyrydov@fratellocoffee.com` |
| Sungjoo Hong | `sungjoo.hong@fratellocoffee.com` |
| Tatum Olsen | `tatum.olsen@fratellocoffee.com` |
| Olena Zaitseva | `olena.zaitseva@fratellocoffee.com` |
| Yerly Camacho | `yerly.camacho@fratellocoffee.com` |

Dry-run result:

```text
Dry run: 18 users, 36 holidays, 1 settings document.
Sample holiday: {
  id: '2026-12-26-boxing-day',
  date: '2026-12-26',
  name: 'Boxing Day',
  jurisdiction: 'federal',
  observed_date: '2026-12-28'
}
```

Note: the exact `npm run seed:firestore -- --dry-run` command could not be run because `npm` is not available on this terminal path. The same seed script was run directly with Node in dry-run mode and produced the output above.

## Firestore Rules

Local file checked: `firestore.rules`

Status: this is the current rules file that should be published for the Hub concept.

It includes rules for:

- Existing Hub profiles and invites
- Staff user records
- Time-off requests
- Approval records
- Activity logs
- Notification logs
- Holidays
- Global settings

Local rules simulation passed:

```text
Firestore rules policy simulation passed.
```

I did not verify the Firebase Console directly from this workspace, so this confirms the local rules file and local simulation, not the live Firebase published rules screen.

## Netlify Functions in Code

Function files found:

| Function | Purpose | Live test status |
| --- | --- | --- |
| `auth.js` | Older Hub auth/session flow | Not tested in this audit |
| `firestore-smoke-test.js` | Owner-only Firestore connection check | Live function exists; unauthenticated request returned `403` |
| `calendar-ics.js` | Calendar feed for time-off records | Live request failed because `FIREBASE_SERVICE_ACCOUNT` is missing |
| `log-activity.js` | Activity log write endpoint | Not tested with a real authenticated request |
| `notify-on-request-submit.js` | Email approver when vacation is submitted | Not tested with a real authenticated request |
| `notify-on-status-change.js` | Email requester when vacation status changes | Not tested with a real authenticated request |
| `notify-on-sick-day.js` | Email/log sick-day notice | Not tested with a real authenticated request |
| `check-escalations.js` | Finds overdue pending requests and sends reminders | Not tested with a real request |
| `time-off-approval-action.js` | Server approval/denial action endpoint | Not tested with a real authenticated request |

Supporting files:

- `netlify/functions/templates/_runtime.js`
- `netlify/functions/templates/*.html`
- `netlify/functions/auth-lib.js`

## Coded But Not Fully Configured

These pieces exist in code but are not fully live/configured yet:

1. Server Firestore access through Netlify Functions
   - Blocked by missing `FIREBASE_SERVICE_ACCOUNT`.

2. Email notification functions
   - Code exists.
   - Resend configuration could not be verified.
   - These functions also depend on working Firebase service credentials.

3. Calendar feed
   - Code exists.
   - Public redirect exists: `/api/calendar.ics`.
   - Live request proves the function is deployed, but it fails until Firebase service credentials are configured.

4. Activity logging
   - Code exists.
   - Not tested live with a real logged-in user request.

5. Time-off approval server action
   - Code exists.
   - Not tested live with a real approval request.

6. Some server fallback URLs still say `https://fratello-hub.netlify.app`
   - Found in server helper fallback code.
   - Netlify usually provides the correct site URL at runtime, and browser-origin requests can also supply the right origin.
   - Still worth cleaning up later so all fallbacks say `https://fratello-ops-hub.netlify.app`.

## Missing / Needs Setup

Before this can behave like a professional live app, these need to be finished:

1. Add the private Firebase service account to Netlify as `FIREBASE_SERVICE_ACCOUNT`.
2. Add or confirm `FIREBASE_PROJECT_ID` in Netlify.
3. Add or confirm `RESEND_API_KEY` in Netlify.
4. Add or confirm `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME` in Netlify.
5. Re-test `/.netlify/functions/firestore-smoke-test` while logged in as an owner.
6. Re-test calendar feed with a real calendar token.
7. Re-test vacation submit, approval, sick-day logging, notification email, and activity logging end to end.
8. Confirm the live Firebase rules in the Firebase Console match the local `firestore.rules`.

## Recommended Next Step

The next practical step is to configure the missing Netlify environment variables, starting with `FIREBASE_SERVICE_ACCOUNT`. Once that is set, the first test should be the Firestore smoke-test function. After that passes, test email and time-off workflows.
