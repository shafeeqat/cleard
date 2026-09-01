// Fill these in with your own Firebase project's web config (Project
// Settings > General > Your apps > SDK setup and configuration) before
// deploying. This value is not a secret — Firebase web API keys are
// intentionally public; real protection comes from firestore.rules, which
// restrict every read/write to the authenticated user's own uid. See
// README.md for full setup steps (enable Google sign-in, create the
// Firestore database, publish firestore.rules).
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';
