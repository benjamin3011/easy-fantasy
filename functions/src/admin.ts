// src/admin.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// Import shared config/secrets
import { adminOptions } from './config';

// No db needed here, but admin.auth() is used

// --- Callable Function (Exported) ---
export const addAdminRole = onCall({ ...adminOptions }, async (request) => {
  // Check if the caller is already an admin
  if (request.auth?.token?.admin !== true) {
    logger.warn("Permission denied for addAdminRole.", { callerUid: request.auth?.uid });
    throw new HttpsError('permission-denied', 'Only admins can assign other admins.');
  }

  const targetUid = request.data.uid; // Expect UID in the 'data' object
  if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'Requires "uid" argument.');
  }

  try {
    // Set custom user claims on the target user
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    logger.info(`Admin role added to ${targetUid} by admin: ${request.auth?.uid}`);
    return { message: `Success! User ${targetUid} is now an admin.` };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error assigning admin role:', { targetUid: targetUid, error: errorMessage, detail: error });
    throw new HttpsError('internal', 'Error assigning admin role. Check logs.');
  }
});