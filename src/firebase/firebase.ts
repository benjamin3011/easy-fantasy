// src/firebase/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from "firebase/auth";
// connectAuthEmulator removed as it wasn't used before, uncomment if needed
import { getFirestore /*, connectFirestoreEmulator*/ } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'; // Import Functions SDK

const firebaseConfig = {
  apiKey:           import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:       import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:        import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:            import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app); // Still needed for direct reads
export const messaging = getMessaging(app);
// Initialize Functions, match REGION from functions/index.ts
export const functions = getFunctions(app, 'europe-west3');

// Connect to emulators in development (optional)
if (import.meta.env.DEV) {
  try {
    // Make sure ports match your firebase.json emulator config
    // connectFirestoreEmulator(db, 'localhost', 8080);
    // connectAuthEmulator(auth, 'http://localhost:9099'); // Uncomment if using Auth emulator
    connectFunctionsEmulator(functions, 'localhost', 5001); // Default Functions port
    console.log("Connected to Firebase Emulators (Functions)");
  } catch (error) {
    console.error("Error connecting to Firebase Emulators:", error);
  }
}


// Request permission & get FCM token
export async function initMessaging() {
  try {
    // Make sure VAPID key is correctly set in your .env file
    const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
    console.log('FCM Token:', token);
    // TODO: Save this token to the user's Firestore profile if needed for notifications
  } catch (err) {
    console.error('Unable to get FCM token or permission denied.', err);
  }

  onMessage(messaging, (payload) => {
    console.log('Foreground message received. ', payload);
    // TODO: Handle foreground message display (e.g., toast notification)
  });
}

