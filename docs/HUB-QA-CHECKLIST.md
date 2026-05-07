# Fratello HUB QA Checklist

Use this after changes to login, invites, permissions, or protected tools.

## Owner Account

1. Open `https://fratello-ops-hub.netlify.app`.
2. Log in with the Owner email and password.
3. Confirm the HUB shows:
   - Finance
   - Production
   - Sales
   - Marketing
   - HR & People
   - Shared Docs & Forms
   - Permissions & System
4. Open `Permissions & System` > `Staff Permissions`.
5. Confirm the user list loads.

## Staff Test User

1. In Staff Permissions, invite a test user with the `Staff` profile.
2. Open the invite link in a private/incognito browser window.
3. Create a password.
4. Log in as that test user.
5. Confirm the HUB shows only:
   - Shared Docs & Forms
6. Confirm the user cannot open:
   - `https://fratello-ops-hub.netlify.app/system/permissions.html`
   - `https://fratello-ops-hub.netlify.app/hr/hiring/hiring-document-generator.html`

## Sales Test User

1. Invite a test user with the `Sales` profile.
2. Create the password from the invite link.
3. Log in as that user.
4. Confirm the HUB shows:
   - Sales
   - Marketing
   - Shared Docs & Forms
5. Confirm the Hiring Document Generator is not visible.
6. Confirm direct access to the Hiring Document Generator is blocked.

## Hiring Access Test

1. Invite or update a test user to `Production` or `Marketing`.
2. Log in as that user.
3. Confirm the HUB shows `HR & People`.
4. Open the Hiring Document Generator from HR & People.
5. Confirm it opens.

## Disabled User

1. Disable a test user from Staff Permissions.
2. Try logging in as that user.
3. Confirm login is blocked.
4. Enable the user again.
5. Confirm login works again.

## Password Reset

1. Use Staff Permissions to create a reset link for a test user.
2. Open the reset link in a private/incognito browser window.
3. Set a new password.
4. Confirm the old password no longer works.
5. Confirm the new password works.

## After Testing

Delete or disable any fake test users that should not keep access.
