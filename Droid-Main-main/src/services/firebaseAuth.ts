import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase app safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
];

const provider = new GoogleAuthProvider();
// Request Drive scope
DRIVE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
// Request additional profile scopes for avatar and user info
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');

// In-memory token cache
let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Subscribes to Firebase auth state changes, invoking `onAuthSuccess` when a
 * signed-in user has a cached Drive access token, or `onAuthFailure`
 * otherwise. Returns the unsubscribe function.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Opens the Google sign-in popup, caching and returning the resulting user
 * and Drive access token. Throws if no access token is obtained.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token from authentication result');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/** Returns the currently cached Google Drive access token, if any. */
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

/** Sets or clears the cached Google Drive access token. */
export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/** Signs the current user out of Firebase and clears the cached access token. */
export const logout = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};
