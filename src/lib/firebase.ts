
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCCjQGKqekOBnyqb_MS05MnFoDC3bl3l0o",
    authDomain: "sortvision-5751c.firebaseapp.com",
    projectId: "sortvision-5751c",
    storageBucket: "sortvision-5751c.firebasestorage.app",
    messagingSenderId: "1022238654449",
    appId: "1:1022238654449:web:d6fb77fe37b0be5fd98e50",
    measurementId: "G-X00Q5WXGEX"
};

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
