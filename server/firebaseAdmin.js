import admin from 'firebase-admin';
import { SERVER_CONFIG } from './config.js';

let db = null;
let storage = null;

function loadServiceAccount() {
  if (SERVER_CONFIG.firebase.serviceAccountJson) {
    return JSON.parse(SERVER_CONFIG.firebase.serviceAccountJson);
  }
  return null;
}

export function initFirebaseAdmin() {
  if (admin.apps.length) {
    db = admin.firestore();
    storage = admin.storage();
    return { db, storage, admin };
  }

  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    });
  } else if (SERVER_CONFIG.firebase.projectId) {
    admin.initializeApp({ projectId: SERVER_CONFIG.firebase.projectId });
  } else {
    return { db: null, storage: null, admin };
  }

  db = admin.firestore();
  storage = admin.storage();
  return { db, storage, admin };
}

export function getDb() {
  return db;
}

export function getStorage() {
  return storage;
}

export function getAdmin() {
  return admin;
}
