import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

function isPlaceholder(value) {
  if (!value) return true;
  const v = value.toLowerCase();
  return v.startsWith('your_') || v.includes('your_project');
}

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured =
  !isPlaceholder(envConfig.apiKey) && !isPlaceholder(envConfig.projectId);

const firebaseConfig = isFirebaseConfigured
  ? envConfig
  : {
      apiKey: 'demo-key-not-configured',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo-project',
      storageBucket: 'demo.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:000000000000',
    };

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (isFirebaseConfigured) {
  setPersistence(auth, browserLocalPersistence).catch(console.error);
}
