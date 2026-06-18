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

window.FRATELLO_OWNER_EMAILS = [
    'prefontainech@gmail.com',
    'russ@fratellocoffee.com'
];

window.FRATELLO_AUTH_PROVIDERS = {
    email: true,
    google: true,
    microsoft: true,
    apple: false
};

// This only controls the Hub screen. The real signup lock is the Firebase
// Console setting: Authentication > Settings > User actions > disable create.
window.FRATELLO_AUTH_ALLOW_PUBLIC_SIGNUP = false;
