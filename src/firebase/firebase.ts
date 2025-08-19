// src/firebase/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from "firebase/auth";
import {
    getFirestore, // Use getFirestore instead of initializeFirestore for stability
    enableMultiTabIndexedDbPersistence,
    doc,
    setDoc
} from 'firebase/firestore';
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

// --- Initialize Firestore with optimized configuration ---
const db = getFirestore(app);

// Enable offline persistence with stable multi-tab support
// Wrap in async function to avoid blocking initialization
const initializePersistence = async () => {
  try {
    await enableMultiTabIndexedDbPersistence(db);
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Multiple tabs open, persistence only enabled in one tab');
    } else if (error.code === 'unimplemented') {
      // The current browser doesn't support all features required to enable persistence
      console.warn('Current browser doesn\'t support persistence');
    } else {
      console.warn('Failed to enable Firestore persistence:', err);
    }
  }
};

// Initialize persistence without blocking
initializePersistence();

// Export services
export const auth = getAuth(app);
export { db }; // Export the initialized db instance
export const functions = getFunctions(app, 'europe-west3');

// --- Firebase Cloud Messaging Initialization & Token Management ---
export async function initMessaging(uid: string | null) {
  try {
    // Lazy load messaging modules only when needed
    const { getMessaging, getToken } = await import('firebase/messaging');
    
    if (!('Notification' in window)) {
        return;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        const messagingInstance = getMessaging(app);
        const currentToken = await getToken(messagingInstance, { 
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
        });
        
        if (currentToken && uid && db) {
          try {
            const userDocRef = doc(db, "users", uid);
            await setDoc(userDocRef, { fcmToken: currentToken }, { merge: true });
          } catch (saveError: unknown) {
              console.error('Failed to save FCM token to Firestore:', saveError);
          }
        }
    }
  } catch (err: unknown) {
    console.error('Error initializing messaging:', err);
  }

  // Set up foreground message listener (only when app is open/focused)
  try {
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const messagingInstance = getMessaging(app);
    onMessage(messagingInstance, (payload) => {
      console.log('Received foreground message:', payload);
      
      // Show notification when app is in foreground
      // Only show if the page is NOT visible (to avoid duplication with service worker)
      if (payload.notification && Notification.permission === 'granted' && document.hidden) {
        const notificationTitle = payload.notification.title || 'Easy Fantasy';
        const notificationOptions = {
          body: payload.notification.body || 'You have a new notification',
          icon: '/icons/favicon-96x96.png',
          badge: '/icons/favicon-96x96.png',
          tag: payload.data?.type || 'general',
          requireInteraction: true,
          data: payload.data
        };
        
        // Create and show the notification
        const notification = new Notification(notificationTitle, notificationOptions);
        
        // Handle notification click
        notification.onclick = function(event) {
          event.preventDefault();
          
          // Focus the window
          window.focus();
          
          // Handle deep linking based on notification type
          const data = payload.data;
          if (data?.type === 'lineup_deadline' && data?.leagueId && data?.week) {
            window.location.href = `/lineup?league=${data.leagueId}&week=${data.week}`;
          } else if (data?.type === 'achievement') {
            window.location.href = '/profile';
          } else {
            window.location.href = '/notifications';
          }
          
          notification.close();
        };
        
        // Auto-close after 8 seconds
        setTimeout(() => {
          notification.close();
        }, 8000);
      }
    });
  } catch (msgError) {
    console.warn('Failed to set up foreground message listener:', msgError);
  }
}
