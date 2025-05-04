// src/leagues.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// Import shared config/secrets
import { leagueOptions } from './config'; // Use league specific options

// Get db instance (initialized in index.ts)
const db = admin.firestore();

// --- Callable Functions (Exported) ---

// Create League
export const createLeague = onCall({ ...leagueOptions }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
  const { name, teamName, isPublic = false } = request.data;
  if (!name || typeof name !== 'string' || name.trim() === '') { throw new HttpsError('invalid-argument', 'League name required.'); }
  if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
  if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic must be boolean.'); }
  const uid = request.auth.uid;
  const sixDigitCode = () => Math.floor(100_000 + Math.random() * 900_000).toString();
  try {
    const leagueRef = await db.collection('leagues').add({
      name: name.trim(), adminUid: uid, code: sixDigitCode(), isPublic,
      members: [{ uid, teamName: teamName.trim() }], memberUids: [uid],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.log(`League created: ${leagueRef.id} by ${uid}`); return { id: leagueRef.id };
  } catch (error: unknown) { /* ... error handling ... */
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Internal error creating league:", { error: errorMessage, detail: error, userId: uid });
      throw new HttpsError('internal', 'Server error creating league.');
  }
});

// Join League by Code
export const joinLeagueByCode = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { code, teamName } = request.data;
    if (!code || typeof code !== 'string' || code.trim() === '') { throw new HttpsError('invalid-argument', 'Code required.'); }
    if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
    const uid = request.auth.uid; const q = db.collection('leagues').where("code", "==", code.trim()).limit(1);
    try { /* ... transaction logic as before ... */
        const snap = await q.get(); if (snap.empty) { throw new HttpsError('not-found', 'Code not found.'); }
        const leagueDocSnap = snap.docs[0]; const leagueId = leagueDocSnap.id; const leagueRef = leagueDocSnap.ref;
        await db.runTransaction(async (t) => { const doc = await t.get(leagueRef); if (!doc.exists) throw new HttpsError('not-found', 'League disappeared.'); const data = doc.data(); if (!data || !Array.isArray(data.memberUids) || !Array.isArray(data.members)) throw new HttpsError('internal', 'Invalid league data.'); if (data.memberUids.includes(uid)) throw new HttpsError('already-exists', 'Already member.'); const newM = [...data.members, { uid, teamName: teamName.trim() }]; const newU = [...data.memberUids, uid]; t.update(leagueRef, { members: newM, memberUids: newU }); });
        logger.log(`User ${uid} joined ${leagueId} via code`); return { success: true, leagueId: leagueId };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error join by code ${code}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error joining league.');
    }
});

// Join League by ID
export const joinLeagueById = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, teamName } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
    if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... transaction logic as before ... */
        await db.runTransaction(async (t) => { const doc = await t.get(leagueRef); if (!doc.exists) throw new HttpsError('not-found', 'League not found.'); const data = doc.data(); if (!data || !Array.isArray(data.memberUids) || !Array.isArray(data.members)) throw new HttpsError('internal', 'Invalid league data.'); if (data.memberUids.includes(uid)) throw new HttpsError('already-exists', 'Already member.'); const newM = [...data.members, { uid, teamName: teamName.trim() }]; const newU = [...data.memberUids, uid]; t.update(leagueRef, { members: newM, memberUids: newU }); });
        logger.log(`User ${uid} joined ${leagueId} by ID`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error join by ID ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error joining league.');
    }
});

// Toggle Visibility
export const toggleLeagueVisibility = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, isPublic } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'ID required.'); }
    if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic boolean required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... logic as before ... */
        const doc = await leagueRef.get(); if (!doc.exists) throw new HttpsError('not-found', 'Not found.'); const data = doc.data(); if (!data || typeof data.adminUid !== 'string') throw new HttpsError('internal', 'Invalid data.'); if (data.adminUid !== uid) throw new HttpsError('permission-denied', 'Admin only.'); await leagueRef.update({ isPublic }); logger.log(`League ${leagueId} visibility set ${isPublic} by ${uid}`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error toggling visibility ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error toggling visibility.');
    }
});

// Rename League
export const renameLeague = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, newName } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'ID required.'); }
    if (!newName || typeof newName !== 'string' || newName.trim() === '') { throw new HttpsError('invalid-argument', 'Name required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... logic as before ... */
        const doc = await leagueRef.get(); if (!doc.exists) throw new HttpsError('not-found', 'Not found.'); const data = doc.data(); if (!data || typeof data.adminUid !== 'string') throw new HttpsError('internal', 'Invalid data.'); if (data.adminUid !== uid) throw new HttpsError('permission-denied', 'Admin only.'); await leagueRef.update({ name: newName.trim() }); logger.log(`League ${leagueId} renamed by ${uid}`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
         if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error renaming league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error renaming league.');
    }
});
