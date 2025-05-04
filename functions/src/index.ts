// src/index.ts
import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: 'europe-west3' });

// Initialize admin SDK ONCE here
admin.initializeApp();


// --- Re-export functions from feature files ---

// Email Triggers
export * from './email';

// Data Sync Triggers & Callables
export * from './dataSync';

// News Triggers & Callables
export * from './news';

// League Management Callables
export * from './leagues';

// Admin Callables
export * from './admin';

// If you have functions defined directly in index.ts (avoid if possible), export them too
// export const myDirectFunction = ...

console.log("Firebase Functions initialized and exported."); // Log on deploy/cold start
