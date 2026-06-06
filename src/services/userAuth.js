import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase';
import { APP_CONFIG } from '../config';

const DEMO_USERS_KEY = 'aman_demo_users';
const DEMO_SESSION_KEY = 'aman_user_session';
export const PENDING_BOOKING_KEY = 'aman_pending_booking';

function readDemoUsers() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeDemoUsers(users) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

function saveDemoSession(user) {
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
}

function clearDemoSession() {
  localStorage.removeItem(DEMO_SESSION_KEY);
}

function getDemoSession() {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isAdminEmail(email) {
  return email?.toLowerCase() === APP_CONFIG.adminEmail.toLowerCase();
}

export function savePendingBooking(tourData) {
  sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(tourData));
}

export function consumePendingBooking() {
  const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_BOOKING_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  if (isFirebaseConfigured && auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName || auth.currentUser.email,
    };
  }
  return getDemoSession();
}

export function isUserLoggedIn() {
  return Boolean(getCurrentUser());
}

export function onUserAuthChanged(callback) {
  if (isFirebaseConfigured) {
    return onAuthStateChanged(auth, (user) => {
      if (user && !isAdminEmail(user.email)) {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email,
        });
      } else if (user && isAdminEmail(user.email)) {
        callback(null);
      } else {
        callback(getDemoSession());
      }
    });
  }

  callback(getDemoSession());
  return () => {};
}

export async function signUp(email, password, displayName) {
  if (isAdminEmail(email)) {
    throw new Error('This email is reserved for admin use.');
  }

  if (isFirebaseConfigured) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    return { uid: cred.user.uid, email: cred.user.email, displayName: displayName || email };
  }

  const users = readDemoUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('An account with this email already exists.');
  }

  const user = {
    uid: `demo-${Date.now()}`,
    email,
    password,
    displayName: displayName || email,
  };
  users.push(user);
  writeDemoUsers(users);
  const session = { uid: user.uid, email: user.email, displayName: user.displayName };
  saveDemoSession(session);
  return session;
}

export async function signIn(email, password) {
  if (isFirebaseConfigured) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (isAdminEmail(cred.user.email)) {
      await signOut(auth);
      throw new Error('Please use the admin panel for admin login.');
    }
    return {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || cred.user.email,
    };
  }

  const users = readDemoUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) throw new Error('Invalid email or password.');

  const session = { uid: user.uid, email: user.email, displayName: user.displayName };
  saveDemoSession(session);
  return session;
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    throw new Error('Google sign-in requires Firebase configuration.');
  }

  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  if (isAdminEmail(cred.user.email)) {
    await signOut(auth);
    throw new Error('Please use the admin panel for admin login.');
  }

  return {
    uid: cred.user.uid,
    email: cred.user.email,
    displayName: cred.user.displayName || cred.user.email,
  };
}

export async function logOut() {
  if (isFirebaseConfigured && auth.currentUser) {
    await signOut(auth);
  }
  clearDemoSession();
}

export function redirectToLogin(returnPath = '/') {
  const path = returnPath || window.location.pathname + window.location.hash;
  window.location.href = `/login.html?redirect=${encodeURIComponent(path)}`;
}

export function requireUserForBooking(tourData) {
  const user = getCurrentUser();
  if (user) return user;

  savePendingBooking(tourData);
  redirectToLogin(window.location.pathname + window.location.hash);
  return null;
}
