// Your Firebase project's web settings.
// Firebase console → Project settings → General → "Your apps" → Web app → SDK setup and configuration → Config.
// These values are not secret: the safety comes from firestore.rules, which only lets
// the two paired people read each other's data.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes('REPLACE_ME'));
