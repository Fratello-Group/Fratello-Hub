# Firestore Setup for the Fratello Hub

This guide sets up Firestore as the database for the Hub time-off system.

## Decisions for Chris

Please confirm these before production launch:

- **Firebase project name:** use `fratello-hub`.
- **Billing:** Firestore and Firebase Auth can start on the free Spark plan. If the team later uses Firebase Cloud Functions, Firebase requires the Blaze billing plan. The current brief recommends Netlify Functions for server work, so Blaze is not required for this Agent 1 foundation.

## What This Adds

- A `users` directory with all 18 listed staff.
- A `time_off_requests` collection for vacation and sick days.
- Private sick day access rules.
- `approvals`, `activity_log`, `notifications`, `holidays`, and `settings`.
- Alberta and Canadian federal holidays for 2026, 2027, and 2028.

## 1. Open or Create the Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Open the existing `fratello-hub` project if it exists.
3. If it does not exist, create a new project named `fratello-hub`.
4. Disable Google Analytics if Firebase asks and you do not need it right now.

## 2. Enable Firestore

1. In Firebase Console, open **Build**, then **Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode**.
4. Choose a Canadian or nearby North American region if Firebase offers one. If not sure, choose the default.
5. Finish creating the database.

## 3. Publish the Security Rules

1. In Firestore Database, open the **Rules** tab.
2. Open `firestore.rules` in this repository.
3. Copy the full file contents into Firebase.
4. Click **Publish**.

These rules preserve the existing `hubProfiles` and `hubInvites` access rules, then add the new time-off collections.

## 4. Create a Service Account Key

This key lets trusted server scripts seed the database.

1. In Firebase Console, click the gear icon beside **Project Overview**.
2. Open **Project settings**.
3. Open the **Service accounts** tab.
4. Click **Generate new private key**.
5. Download the JSON file.
6. Keep this file private. Do not commit it to GitHub.

## 5. Add Netlify Environment Variables

In Netlify:

1. Open the Fratello Hub site.
2. Go to **Site configuration**.
3. Open **Environment variables**.
4. Add:

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `fratello-hub` |
| `FIREBASE_SERVICE_ACCOUNT` | The full service account JSON text |

For `FIREBASE_SERVICE_ACCOUNT`, paste the whole JSON file contents. Netlify can store this as one private value. Do not add this file to the repository.

## 6. Review Staff Emails Before Seeding

The existing Hub already had emails for:

- Chris Prefontaine: `prefontainech@gmail.com`
- Russ Prefontaine: `russ@fratellocoffee.com`
- Chris McGhee: `controller@fratellocoffee.com`
- Kyle Park: `kyle@fratellocoffee.com`
- Mateo Corredor: `mateo@fratellocoffee.com`

For the remaining staff, this foundation assumes `first.last@fratellocoffee.com`, with apostrophes removed. If those emails are wrong, update `scripts/seed-firestore.js` before running the seed.

## 7. Seed Firestore

Ask a technical helper to run these from the repository folder:

```sh
npm install
FIREBASE_PROJECT_ID=fratello-hub FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json npm run seed:firestore -- --dry-run
FIREBASE_PROJECT_ID=fratello-hub FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json npm run seed:firestore
```

The dry run should say:

- 18 users
- 36 holidays
- 1 settings document

After the real run, Firebase Console should show:

- `users`
- `holidays`
- `settings/global`

## 8. Verify Rules Locally

Ask a technical helper to run:

```sh
npm run test:firestore-rules
```

The important check is that managers cannot read sick day records for their teams. Kyle, Allana, Jaleisy, Mateo, and regular staff should all be blocked from other people's sick days.

## 9. Smoke Test the Server Connection

After Netlify has the environment variables, sign in to the Hub as an Owner and open:

```text
https://fratello-ops-hub.netlify.app/.netlify/functions/firestore-smoke-test
```

If everything is connected, the page returns a small JSON message with `connected: true`.
