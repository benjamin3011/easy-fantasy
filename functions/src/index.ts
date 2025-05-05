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

// Game Stats Sync Triggers
export * from './statsSync';

// News Triggers & Callables
export * from './news';

// League Management Callables
export * from './leagues';

// Admin Callables
export * from './admin';

console.log("Firebase Functions initialized and exported."); // Log on deploy/cold start
