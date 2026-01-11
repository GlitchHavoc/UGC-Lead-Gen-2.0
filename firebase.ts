
// Use Firebase compat imports to resolve named export issues in the environment
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyCmvsAHT1U_sltwSuG25aazyqvPo50vS-E",
  authDomain: "ugc-leadgen.firebaseapp.com",
  projectId: "ugc-leadgen",
  storageBucket: "ugc-leadgen.firebasestorage.app",
  messagingSenderId: "809170233408",
  appId: "1:809170233408:web:ea22a7dc560037d05c97a5",
  measurementId: "G-VFZ3XDYRNN"
};

let auth: any;
let db: any;

try {
  // Initialize Firebase using the compat API which is more resilient to environment-specific module resolution
  const existingApps = firebase.apps;
  const app = existingApps.length === 0 ? firebase.initializeApp(firebaseConfig) : firebase.app();
  if (app) {
    // Exporting as 'any' to ensure maximum compatibility with modular functions in other files
    auth = firebase.auth(app);
    db = firebase.firestore(app);
  }
} catch (error) {
  console.error("Firebase failed to initialize. Check your config in firebase.ts.", error);
}

export { auth, db };
