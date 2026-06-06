import './auth.css';
import { isFirebaseConfigured } from './firebase';
import {
  signIn,
  signUp,
  signInWithGoogle,
  getCurrentUser,
} from './services/userAuth';

const params = new URLSearchParams(window.location.search);
const redirectTo = params.get('redirect') || '/';

const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmit = document.getElementById('authSubmit');
const authToggleBtn = document.getElementById('authToggleBtn');
const authToggleText = document.getElementById('authToggleText');
const authError = document.getElementById('authError');
const nameGroup = document.getElementById('nameGroup');
const googleSignIn = document.getElementById('googleSignIn');

let isSignUp = false;

if (getCurrentUser()) {
  window.location.href = redirectTo;
}

if (isFirebaseConfigured) {
  googleSignIn.style.display = 'block';
  googleSignIn.addEventListener('click', async () => {
    authError.textContent = '';
    try {
      await signInWithGoogle();
      finishLogin();
    } catch (err) {
      authError.textContent = err.message || 'Google sign-in failed.';
    }
  });
}

authToggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp;
  authTitle.textContent = isSignUp ? 'Create Account' : 'Welcome Back';
  authSubtitle.textContent = isSignUp
    ? 'Sign up to book tours and track your journeys.'
    : 'Sign in to book tours and manage your journeys.';
  authSubmit.textContent = isSignUp ? 'Create Account' : 'Sign In';
  authToggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  authToggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
  nameGroup.style.display = isSignUp ? 'block' : 'none';
  authError.textContent = '';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value.trim();

  try {
    if (isSignUp) {
      await signUp(email, password, name);
    } else {
      await signIn(email, password);
    }
    finishLogin();
  } catch (err) {
    authError.textContent =
      err.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : err.message || 'Authentication failed.';
  }

  authSubmit.disabled = false;
});

function finishLogin() {
  window.location.href = redirectTo;
}
