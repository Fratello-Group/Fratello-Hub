// Fratello Hub Firebase configuration.
//
// These values are public Firebase web-app identifiers, not passwords.
// Real security comes from Firebase Authentication and Firestore Rules.
//
// To turn on professional Hub login, create a Firebase web app for Fratello,
// paste its config values below, and set enabled to true.
window.FRATELLO_FIREBASE_CONFIG = {
    enabled: true,
    apiKey: 'AIzaSyDBZSpwGy2MifMmoKzIz_HYbVEceo2qK7Q',
    authDomain: 'fratello-hub.firebaseapp.com',
    projectId: 'fratello-hub',
    storageBucket: 'fratello-hub.firebasestorage.app',
    messagingSenderId: '117664640429',
    appId: '1:117664640429:web:64bcbe431db7995c8d4524',
    measurementId: ''
};

// Microsoft 365 "Directory (tenant) ID" for Fratello. When set, only accounts
// from this company tenant can sign in with Microsoft (no personal/outside
// accounts). Ask ShiftIT for the Directory (tenant) ID and paste it here.
window.FRATELLO_MICROSOFT_TENANT = '';

window.FRATELLO_OWNER_EMAILS = [
    'prefontainech@gmail.com',
    'russ@fratellocoffee.com'
];

// Microsoft is temporarily OFF until the Microsoft 365 (Entra) app registration
// is connected to Firebase. Re-enable by setting microsoft: true once that's done.
window.FRATELLO_AUTH_PROVIDERS = {
    email: true,
    google: true,
    microsoft: false,
    apple: false
};

// This only controls the Hub screen. The real signup lock is the Firebase
// Console setting: Authentication > Settings > User actions > disable create.
window.FRATELLO_AUTH_ALLOW_PUBLIC_SIGNUP = false;
