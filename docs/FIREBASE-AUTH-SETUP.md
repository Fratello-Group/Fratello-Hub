# Fratello Hub Firebase Auth Setup

This replaces the prototype Hub password system with a normal app login:

- Google sign-in
- Apple sign-in
- Email and password sign-in
- Real password reset emails
- Staff access profiles stored in Firestore

The Firebase web config is public. It is not a password. The important protection is in Firebase Authentication and the Firestore rules in `firestore.rules`.

## 1. Create the Firebase Project

1. Go to `https://console.firebase.google.com`.
2. Create a project for `Fratello Hub`.
3. Add a Web app.
4. Copy the Firebase config values into `system/firebase-config.js`.
5. Set `enabled: true`.

## 2. Turn On Sign-In Methods

In Firebase Console, open Authentication, then Sign-in method.

Enable:

- Email/Password
- Google
- Apple, if you want Apple login on the web

Apple sign-in may require Apple developer setup before it works fully.

## 3. Add Authorized Domains

In Firebase Authentication settings, add:

- `fratello-ops-hub.netlify.app`
- any future custom Fratello domain

Firebase blocks sign-ins from domains that are not on this list.

## 4. Create Firestore

1. Open Firestore Database.
2. Create a database in production mode.
3. Open the Rules tab.
4. Replace the default rules with the contents of `firestore.rules`.
5. Publish the rules.

## 5. First Owner Login

The first owner accounts are bootstrapped by email:

- `prefontainech@gmail.com`
- `russ@fratellocoffee.com`

When either of those emails signs in successfully with Firebase, the Hub creates an Owner profile automatically.

## 6. Inviting Staff

After an Owner is signed in:

1. Open Owner/Admin, then Staff Permissions.
2. Add the person’s name, email, title, and access profile.
3. Send them the Hub link.
4. They sign in with Google, Apple, or email/password.
5. The Hub matches their email to the invite and shows only their assigned areas.

## Notes

- No passwords are stored in the Hub anymore.
- Password reset is handled by Firebase email.
- Disabling a user in Staff Permissions blocks Hub access, even if they can still sign into Firebase.
- Static pages still need Hub guards if they contain confidential information.

## References

- Firebase Web Auth: `https://firebase.google.com/docs/auth/web/start`
- Firebase Apple Auth: `https://firebase.google.com/docs/auth/web/apple`
- Firestore role-based access: `https://firebase.google.com/docs/firestore/solutions/role-based-access`
- Firebase custom claims option for later: `https://firebase.google.com/docs/auth/admin/custom-claims`
