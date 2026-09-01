// Fill these in with your own Firebase project's web config (Project
// Settings > General > Your apps > SDK setup and configuration) before
// deploying. This value is not a secret — Firebase web API keys are
// intentionally public; real protection comes from firestore.rules, which
// restrict every read/write to the authenticated user's own uid. See
// README.md for full setup steps (enable Google sign-in, create the
// Firestore database, publish firestore.rules).
export const firebaseConfig = {
  apiKey: 'AIzaSyB_ERmoUeczwDBOGXbdHhr5WnWmVYfL1PA',
  authDomain: 'cleard-492f1.firebaseapp.com',
  projectId: 'cleard-492f1',
  storageBucket: 'cleard-492f1.firebasestorage.app',
  messagingSenderId: '1040121476890',
  appId: '1:1040121476890:web:bec9924489a40d80d91ea3',
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';
