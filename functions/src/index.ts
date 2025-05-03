/* ───────── imports ───────── */
import axios, { AxiosRequestConfig } from "axios";
import * as admin from "firebase-admin";
// import cors from "cors"; // Likely not needed with v2 onRequest({ cors: true })
import { defineSecret } from "firebase-functions/params";
// Use v2 specific imports
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https"; // v2 imports
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import {
  SESv2Client,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";

/* ───────── init ───────── */
admin.initializeApp();
const db = admin.firestore();
const REGION = "europe-west3"; // Ensure this matches client and deployment

/* ───────── secrets ───────── */
// Define secrets (values accessed only at runtime)
const AWS_ID = defineSecret("AWS_SES_KEY_ID");
const AWS_SECRET = defineSecret("AWS_SES_KEY_SECRET");
const AWS_REGION = defineSecret("AWS_SES_REGION");
const MAIL_FROM = defineSecret("MAIL_FROM");
const TANK01_KEY = defineSecret("TANK01_KEY");

/* ───────── constants ───────── */
const TANK01_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

/* ╭───────────────────────────────────────────────────────────────╮
   │  1.  NFL News cache + HTTPS endpoint (Using v2 onRequest)     │
   ╰───────────────────────────────────────────────────────────────╯ */

interface Tank01News {
  title: string;
  link : string;
  updated?: string;
  published?: string;
}

async function getFreshNews(): Promise<Tank01News[]> {
    const cfg: AxiosRequestConfig = {
        method: "GET",
        url: `https://${TANK01_HOST}/getNFLNews`,
        params: { recentNews: true, maxItems: 50 },
        headers: {
            "x-rapidapi-key": TANK01_KEY.value(), // .value() OK here, called at runtime
            "x-rapidapi-host": TANK01_HOST,
        },
    };
    // Type assertion for expected response structure
    const { data } = await axios.request<{ body?: Tank01News[] }>(cfg);
    return data.body ?? [];
}

async function loadNews(): Promise<Tank01News[]> {
    const doc = db.doc("apiCache/nflNews");
    const snap = await doc.get();

    if (snap.exists) {
        // Define expected structure for type safety
        interface NewsCache {
            data: Tank01News[];
            fetchedAt: admin.firestore.Timestamp;
        }
        const cacheData = snap.data() as NewsCache; // 'as' might still be needed
        const ageMin = (Date.now() - cacheData.fetchedAt.toMillis()) / 60000;
        if (ageMin < 5) {
             logger.info("Serving cached news data.");
             return cacheData.data;
        }
    }

    logger.info("Fetching fresh news data.");
    const fresh = await getFreshNews();
    await doc.set({
        data: fresh,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return fresh;
}

// Using v2 onRequest
export const getNFLNews = onRequest(
  { region: REGION, cors: true, secrets: [TANK01_KEY] }, // Ensure cors: true handles your needs
  async (req, res) => {
      try {
        const items = await loadNews();
        res.status(200).json({ data: items });
      } catch (err: unknown) { // Catch as unknown
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error("getNFLNews error", { error: errorMessage, detail: err });
        res.status(500).json({ error: "Failed to load news" });
      }
  }
);

/* Cloud-scheduler: every 15 min refresh */
export const refreshNFLNews = onSchedule(
  {
    schedule: "every 15 minutes",
    region  : REGION,
    secrets : [TANK01_KEY], // Secret needed for loadNews -> getFreshNews
  },
  async () => {
    // Added try/catch for robustness
    try {
        await loadNews();
        logger.log("News cache refreshed successfully.");
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to refresh news cache.", { error: errorMessage, detail: error });
        // Depending on importance, you might want to alert/monitor this failure
    }
  }
);

/* ╭───────────────────────────────────────────────────────────────╮
   │  2.  AWS SES helper (CORRECTED Secret Handling)              │
   ╰───────────────────────────────────────────────────────────────╯ */
async function sendMail(to: string, subject: string, html: string) {
    // CORRECTION: Initialize SES client INSIDE the function at runtime
    const sesClient = new SESv2Client({
        region: AWS_REGION.value(), // .value() OK here - runtime access
        credentials: {
            accessKeyId: AWS_ID.value(),
            secretAccessKey: AWS_SECRET.value(),
        },
    });

    const params: SendEmailCommandInput = {
        FromEmailAddress: MAIL_FROM.value(), // .value() OK here - runtime access
        Destination: { ToAddresses: [to] },
        Content: { Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
        }},
    };
    // Added try/catch and uses locally initialized sesClient
    try {
        await sesClient.send(new SendEmailCommand(params));
        logger.log(`Email sent successfully to ${to} with subject "${subject}"`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to send email to ${to}`, { error: errorMessage, detail: error });
        // Decide whether to throw or just log
        // throw new Error(`Failed to send email: ${errorMessage}`);
    }
}

/* ╭───────────────────────────────────────────────────────────────╮
   │  3.  Firestore triggers (v2 syntax, ensure secrets declared)  │
   ╰───────────────────────────────────────────────────────────────╯ */

// Secrets needed by sendMail must be declared in trigger options
const emailSecrets = [AWS_ID, AWS_SECRET, AWS_REGION, MAIL_FROM];

/* league **created** → mail admin */
export const mailLeagueCreated = onDocumentCreated(
    {
        document: "leagues/{leagueId}", region: REGION,
        secrets: emailSecrets, // Declare secrets needed by sendMail
        memory: "256MiB",
    },
    async (event) => {
        // Wrap trigger logic in try/catch
        try {
            const lg = event.data?.data();
            // Add type check for safety
            if (!lg || typeof lg.adminUid !== 'string' || typeof lg.name !== 'string' || typeof lg.code !== 'string') {
                logger.warn("League data missing or invalid in mailLeagueCreated trigger.", { leagueId: event.params.leagueId });
                return;
            }

            const userSnap = await db.doc(`users/${lg.adminUid}`).get();
            // Add type check
            const email = userSnap.data()?.email;
            if (!email || typeof email !== 'string') {
                logger.warn(`Email not found or invalid for admin user ${lg.adminUid}.`, { leagueId: event.params.leagueId });
                return;
            }

            // Using corrected template literal from user example
            await sendMail(
                email,
                `Your new league "${lg.name}" is live!`,
                `<p>You created <b>${lg.name}</b> 🎉<br/>Share this code with friends: <b>${lg.code}</b></p>`
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error("Error in mailLeagueCreated trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
            // Don't re-throw, just log, so trigger execution completes
        }
    }
);

/* league **member added** → mail new member */
export const mailLeagueJoined = onDocumentUpdated(
    {
        document: "leagues/{leagueId}", region: REGION,
        secrets: emailSecrets, // Declare secrets needed by sendMail
    },
    async (event) => {
        // Wrap trigger logic in try/catch
        try {
            const before = event.data?.before.data();
            const after = event.data?.after.data();
            // Add type checks
            if (!before || !after || typeof after.name !== 'string') {
                logger.warn("Before or after data missing in mailLeagueJoined trigger.", { leagueId: event.params.leagueId });
                return;
            }

            // Define expected shape for Member for type safety
            interface MemberData { uid: string; teamName: string; }

            // Use type guards or default values for safer access
            const beforeMembers = (Array.isArray(before.members) ? before.members : []) as MemberData[];
            const afterMembers = (Array.isArray(after.members) ? after.members : []) as MemberData[];
            const beforeMemberUids = (Array.isArray(before.memberUids) ? before.memberUids : []) as string[];
            const afterMemberUids = (Array.isArray(after.memberUids) ? after.memberUids : []) as string[];


            if (afterMembers.length <= beforeMembers.length) {
                 // logger.debug("No new member added, skipping email.", { leagueId: event.params.leagueId });
                 return; // No new member added
            }

            // Use robust member detection
            const newMemberUid = afterMemberUids.find(uid => !beforeMemberUids.includes(uid));
            if (!newMemberUid) {
                logger.warn(`Could not determine new member UID for league.`, { leagueId: event.params.leagueId, beforeUids: beforeMemberUids.length, afterUids: afterMemberUids.length });
                return;
            }

            const newMember = afterMembers.find(m => m.uid === newMemberUid);
            if (!newMember || typeof newMember.teamName !== 'string') {
                logger.warn(`Could not find valid member data for new UID ${newMemberUid}.`, { leagueId: event.params.leagueId });
                return;
            }

            const userSnap = await db.doc(`users/${newMember.uid}`).get();
            const email = userSnap.data()?.email;
            if (!email || typeof email !== 'string') {
                 logger.warn(`Email not found or invalid for new member ${newMember.uid}.`, { leagueId: event.params.leagueId });
                return;
            }

            // Using corrected template literal from user example
            await sendMail(
                email,
                `Welcome to "${after.name}"`,
                `<p>Hey ${newMember.teamName}, you joined <b>${after.name}</b>.</p>`
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error("Error in mailLeagueJoined trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
             // Don't re-throw
        }
    }
);


/* ╭───────────────────────────────────────────────────────────────╮
   │  4.  League Management Callable Functions (Using v2 onCall)   │
   │      (Corrected Error Handling - No 'any')                    │
   ╰───────────────────────────────────────────────────────────────╯ */

// Note: These callables do not directly use secrets, so they don't need the `secrets` array in their options.

// --- Create League ---
export const createLeague = onCall({
    region: REGION,
    // minInstances: 1, // Optional: Consider adding if frequently called
  }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
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
    logger.log(`League created: ${leagueRef.id} by user ${uid}`);
    return { id: leagueRef.id };
  } catch (error: unknown) { // Catch as unknown
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Internal error creating league:", { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Failed to create the league due to a server error.');
  }
});

// --- Join League by Code ---
export const joinLeagueByCode = onCall({
    region: REGION,
    // minInstances: 1, // Optional
  }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { code, teamName } = request.data;
  if (!code || typeof code !== 'string' || code.trim() === '') { throw new HttpsError('invalid-argument', 'League code required.'); }
  if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
  const uid = request.auth.uid;
  const q = db.collection('leagues').where("code", "==", code.trim()).limit(1);

  try {
    const snap = await q.get();
    if (snap.empty) { throw new HttpsError('not-found', 'League with this code not found.'); }
    const leagueDocSnap = snap.docs[0];
    const leagueId = leagueDocSnap.id;
    const leagueRef = leagueDocSnap.ref;

    await db.runTransaction(async (transaction) => {
      const leagueDoc = await transaction.get(leagueRef);
      if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League disappeared during transaction.'); }
      const leagueData = leagueDoc.data(); // Get data, check below
      // Validation for expected data structure
      if (!leagueData || !Array.isArray(leagueData.memberUids) || !Array.isArray(leagueData.members)) {
          logger.error("Invalid league data structure found in transaction.", { leagueId });
          throw new HttpsError('internal', 'League data structure is invalid.');
      }
      if (leagueData.memberUids.includes(uid)) { throw new HttpsError('already-exists', 'You are already a member.'); }

      const newMembers = [...leagueData.members, { uid, teamName: teamName.trim() }];
      const newMemberUids = [...leagueData.memberUids, uid];
      transaction.update(leagueRef, { members: newMembers, memberUids: newMemberUids });
    });

    logger.log(`User ${uid} joined league ${leagueId} using code`);
    return { success: true, leagueId: leagueId };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; } // Re-throw HttpsErrors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Internal error joining league by code ${code}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not join league by code due to a server error.');
  }
});

// --- Join League by ID ---
export const joinLeagueById = onCall({
    region: REGION,
    // minInstances: 1, // Optional
  }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { leagueId, teamName } = request.data;
  if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
  if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
  const uid = request.auth.uid;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    await db.runTransaction(async (transaction) => {
      const leagueDoc = await transaction.get(leagueRef);
      if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League not found.'); }
      const leagueData = leagueDoc.data(); // Get data, check below
      // Validation for expected data structure
      if (!leagueData || !Array.isArray(leagueData.memberUids) || !Array.isArray(leagueData.members)) {
          logger.error("Invalid league data structure found in transaction.", { leagueId });
          throw new HttpsError('internal', 'League data structure is invalid.');
      }
      if (leagueData.memberUids.includes(uid)) { throw new HttpsError('already-exists', 'You are already a member.'); }

      const newMembers = [...leagueData.members, { uid, teamName: teamName.trim() }];
      const newMemberUids = [...leagueData.memberUids, uid];
      transaction.update(leagueRef, { members: newMembers, memberUids: newMemberUids });
    });
    logger.log(`User ${uid} joined league ${leagueId} by ID`);
    return { success: true };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; } // Re-throw HttpsErrors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Internal error joining league by ID ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not join league by ID due to a server error.');
  }
});

// --- Toggle League Visibility ---
export const toggleLeagueVisibility = onCall({ region: REGION }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { leagueId, isPublic } = request.data;
  if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
  if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic must be boolean.'); }
  const uid = request.auth.uid;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League not found.'); }
    const leagueData = leagueDoc.data(); // Get data, check below
    // Validation
    if (!leagueData || typeof leagueData.adminUid !== 'string') {
        logger.error("Invalid league data structure found.", { leagueId });
        throw new HttpsError('internal', 'League data structure is invalid.');
    }
    if (leagueData.adminUid !== uid) { throw new HttpsError('permission-denied', 'Only the admin can change visibility.'); }

    await leagueRef.update({ isPublic });
    logger.log(`League ${leagueId} visibility set to ${isPublic} by admin ${uid}`);
    return { success: true };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; } // Re-throw HttpsErrors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Internal error toggling visibility for league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not toggle visibility due to a server error.');
  }
});

// --- Rename League ---
export const renameLeague = onCall({ region: REGION }, async (request) => {
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { leagueId, newName } = request.data;
  if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
  if (!newName || typeof newName !== 'string' || newName.trim() === '') { throw new HttpsError('invalid-argument', 'New league name required.'); }
  const uid = request.auth.uid;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League not found.'); }
    const leagueData = leagueDoc.data(); // Get data, check below
    // Validation
    if (!leagueData || typeof leagueData.adminUid !== 'string') {
        logger.error("Invalid league data structure found.", { leagueId });
        throw new HttpsError('internal', 'League data structure is invalid.');
    }
    if (leagueData.adminUid !== uid) { throw new HttpsError('permission-denied', 'Only the admin can rename.'); }

    await leagueRef.update({ name: newName.trim() });
    logger.log(`League ${leagueId} renamed to "${newName.trim()}" by admin ${uid}`);
    return { success: true };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; } // Re-throw HttpsErrors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Internal error renaming league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not rename league due to a server error.');
  }
});
