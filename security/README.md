# Fratello Hub Security Test

This is a Fratello-specific security smoke test. It is not a full professional penetration test, but it gives us a repeatable way to check the basics after Hub changes.

It checks:

- Hub can be reached over HTTPS
- Browser security headers are present
- Firestore profile and invite records are not publicly readable or writable
- Protected Hub pages include access guards
- Old Netlify auth function rejects unauthenticated admin actions
- Optional: whether Firebase public signup is open

## Run The Normal Safe Test

From the repo folder:

```bash
python3 security/fratello_hub_security_test.py
```

It creates:

- `security/reports/fratello-security-results.json`
- `security/reports/fratello-security-report.html`

Open the HTML file in a browser to read the report.

## Run The Optional Signup Check

This creates and deletes a temporary Firebase account to see whether public email signup is open:

```bash
python3 security/fratello_hub_security_test.py --active-signup-check
```

If this fails, it does not mean Hub data is exposed. It means anyone can create a Firebase Auth account, which we may want to tighten once the Hub moves from prototype to real internal system.

To fix that failed item in Firebase:

1. Open Firebase Console.
2. Go to Authentication.
3. Open Settings.
4. Open User actions.
5. Disable end-user account creation.

After that, owners need to create/invite accounts intentionally instead of letting anyone self-create one from the public login screen.

## Test A Different URL

```bash
python3 security/fratello_hub_security_test.py --url https://fratello-ops-hub.netlify.app
```

## Notes

The test is intentionally Fratello-specific. Do not use the Godspeed pentest script directly against this Hub because that script is hard-coded for a different Firebase project and different app endpoints.
