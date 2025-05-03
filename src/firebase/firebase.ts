// src/firebase/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from "firebase/auth";
import {
    initializeFirestore, // Use this instead of getFirestore directly for config
    persistentLocalCache,
    persistentMultipleTabManager, // For multi-tab persistence
    // persistentSingleTabManager, // Alternative for single-tab
    // memoryLocalCache, // Explicitly use memory cache
    Firestore, // Import Firestore type
    doc, // Import doc and setDoc for use in initMessaging
    setDoc
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey:           import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:       import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:        import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:            import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// --- Initialize Firestore with Persistence Configuration ---
let db: Firestore; // Declare db with Firestore type
try {
     // Initialize Firestore using the new API, enabling persistent cache with multi-tab support
     db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        // Optionally: Add settings like ignoreUndefinedProperties if needed, but be cautious [5]
        // settings: { ignoreUndefinedProperties: true } // Use with care!
    });
    console.log("Firestore initialized with persistent multi-tab cache.");
} catch (error: unknown) {
    // Handle initialization errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to initialize Firestore with persistent cache, falling back to memory cache.", { error: errorMessage, detail: error });
    db = initializeFirestore(app, {});
}


// Export services
export const auth = getAuth(app);
export { db }; // Export the initialized db instance
export const messaging = getMessaging(app);
// Initialize Functions, match REGION from functions/index.ts
export const functions = getFunctions(app, 'europe-west3');

// --- Firebase Cloud Messaging Initialization & Token Management ---
export async function initMessaging(uid: string | null) {
  console.log("Attempting to initialize messaging...");
  try {
    if (!('Notification' in window)) {
        console.warn('This browser does not support desktop notification'); return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Notification permission granted.');
        const currentToken = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
        if (currentToken) {
          console.log('FCM Token obtained:', currentToken);
          if (uid && db) {
            try {
              // doc/setDoc are already imported at the top now
              const userDocRef = doc(db, "users", uid);
              await setDoc(userDocRef, { fcmToken: currentToken }, { merge: true });
              console.log("FCM Token saved to Firestore for user:", uid);
            } catch (saveError: unknown) {
                const errorMessage = saveError instanceof Error ? saveError.message : String(saveError);
                console.error("Failed to save FCM token to Firestore:", { error: errorMessage, detail: saveError });
            }
          } else {
            if (!uid) console.log("User not logged in, FCM token not saved to DB.");
            if (!db) console.warn("Firestore DB instance not available, FCM token not saved.");
          }
        } else { console.log('No registration token available.'); }
    } else { console.log('Unable to get permission to notify.'); }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('An error occurred while retrieving token/permission.', { error: errorMessage, detail: err });
  }

  onMessage(messaging, (payload) => {
    console.log('Foreground message received. ', payload);
    if (payload.notification) { /* Handle foreground message display */ }
  });
}
