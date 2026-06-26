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
// accounts).
window.FRATELLO_MICROSOFT_TENANT = 'aa750b1e-939c-45e9-b883-4d95ae31b90f';

window.FRATELLO_OWNER_EMAILS = [
    'prefontainech@gmail.com',
    'russ@fratellocoffee.com'
];

// Microsoft is ON: the Entra app registration is connected to Firebase and
// sign-in is locked to the Fratello tenant (FRATELLO_MICROSOFT_TENANT above).
window.FRATELLO_AUTH_PROVIDERS = {
    email: true,
    google: true,
    microsoft: true,
    apple: false
};

// This only controls the Hub screen. The real signup lock is the Firebase
// Console setting: Authentication > Settings > User actions > disable create.
window.FRATELLO_AUTH_ALLOW_PUBLIC_SIGNUP = false;
