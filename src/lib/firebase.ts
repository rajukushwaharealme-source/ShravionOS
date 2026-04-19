import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyAfxDI6uW7tTeZ22WxJOHLGD3B1R09HwuE",
  authDomain: "productivity-db1fa.firebaseapp.com",
  projectId: "productivity-db1fa",
  storageBucket: "productivity-db1fa.firebasestorage.app",
  messagingSenderId: "659529902523",
  appId: "1:659529902523:web:63dbcb468e6a1842cb3c9e",
  measurementId: "G-FT0XJWTWRW"
};

const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};
