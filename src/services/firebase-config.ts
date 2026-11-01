// Firebase web app settings, read from the build environment instead of the source tree.
// Copy .env.example to .env.local and fill in the values from Firebase console > Project settings > Your apps.
// .env.local is git-ignored, so the values never land in the repository.
//
// A Firebase web key is an identifier rather than a secret: what actually protects the data is
// firestore.rules. Keeping it out of source still stops scrapers harvesting it from the repo, and lets you
// restrict the key by HTTP referrer in the Google Cloud console.
import type { FirebaseOptions } from 'firebase/app';

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
] as const satisfies readonly (keyof ImportMetaEnv)[];

const env = import.meta.env;

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

/** Names of the variables that are missing or still hold the placeholder text. */
export const missingConfigKeys = (): string[] =>
  REQUIRED.filter(k => {
    const v = env[k];
    return typeof v !== 'string' || v.trim() === '' || v.startsWith('PASTE');
  });

export const isConfigured = (): boolean => missingConfigKeys().length === 0;
