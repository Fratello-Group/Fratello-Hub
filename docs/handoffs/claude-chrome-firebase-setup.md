# Claude in Chrome Handoff: Firebase Setup

Paste this prompt into Claude in Chrome.

---

You are helping Chris Prefontaine set up Firebase for the Fratello Hub. Chris is non-technical, so narrate each action plainly and pause before any billing or private-key step.

Goal: create or verify the Firebase project `fratello-hub`, enable Firestore in production mode, publish Firestore rules from the repository, create a service account JSON key, and add the Firebase service-account values to Netlify environment variables.

Important privacy note: do not paste the service account private key into chat. Help Chris store it in Netlify only, and remind him not to commit it to GitHub.

Steps:

1. Open `https://console.firebase.google.com/`.
2. Check whether a Firebase project named `fratello-hub` already exists.
3. If it exists, open it. If it does not exist, create a new project named `fratello-hub`.
4. If Firebase asks about Google Analytics, recommend leaving it off for now unless Chris wants analytics in Firebase.
5. If Firebase asks for billing, explain:
   - Firestore and Firebase Auth can start on the free Spark plan.
   - Firebase Cloud Functions require Blaze billing.
   - This project is planned to use Netlify Functions for server work, so Blaze is not required for this database setup.
   - Pause and let Chris decide before changing billing.
6. In the Firebase project, open **Build > Firestore Database**.
7. Click **Create database**.
8. Choose **Production mode**.
9. Choose a Canadian or nearby North American region if offered; otherwise use Firebase's default.
10. Finish creating Firestore.
11. Open the Firestore **Rules** tab.
12. Ask Chris to open this repository file: `/Users/chris/Desktop/Fratello/Fratello-Hub-codex/firestore.rules`.
13. Copy the full contents of `firestore.rules` into the Firebase Rules editor.
14. Click **Publish**.
15. Open the Firebase project gear icon, then **Project settings**.
16. Open **Service accounts**.
17. Click **Generate new private key**.
18. Pause and tell Chris this file is secret.
19. Download the JSON key file and keep it somewhere private, such as Downloads temporarily.
20. Open Netlify and go to the Fratello Hub site.
21. Open **Site configuration > Environment variables**.
22. Add `FIREBASE_PROJECT_ID` with value `fratello-hub`.
23. Add `FIREBASE_SERVICE_ACCOUNT` with the complete JSON contents of the downloaded service account key.
24. Save the environment variables.
25. Remind Chris that the service account JSON file should not be committed to GitHub and can be deleted from Downloads after the value is saved in Netlify and after the seed script has been run.
26. Tell Chris the next step is for a technical helper or Codex to seed the database using `scripts/seed-firestore.js`.

Success criteria:

- Firebase project is named `fratello-hub`.
- Firestore Database exists in production mode.
- Firestore rules from `firestore.rules` are published.
- Netlify has `FIREBASE_PROJECT_ID`.
- Netlify has `FIREBASE_SERVICE_ACCOUNT`.
- Chris understands that the private key is secret.
