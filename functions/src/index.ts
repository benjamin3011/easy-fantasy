/* ───────── imports ───────── */
import axios, { AxiosRequestConfig } from "axios";
import * as admin from "firebase-admin";
// import cors from "cors"; // Consider removing if not used by onRequest with cors:true
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
const TANK01_KEY = defineSecret("TANK01_KEY");
const AWS_ID = defineSecret("AWS_SES_KEY_ID");
const AWS_SECRET = defineSecret("AWS_SES_KEY_SECRET");
const AWS_REGION = defineSecret("AWS_SES_REGION");
const MAIL_FROM = defineSecret("MAIL_FROM");

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
            "x-rapidapi-key": TANK01_KEY.value(),
            "x-rapidapi-host": TANK01_HOST,
        },
    };
    // Type assertion might be needed if axios types aren't specific enough for data.body
    const { data } = await axios.request<{ body?: Tank01News[] }>(cfg);
    return data.body ?? [];
}

async function loadNews(): Promise<Tank01News[]> {
    const doc = db.doc("apiCache/nflNews");
    const snap = await doc.get();

    if (snap.exists) {
        // Use explicit type, avoid 'as' cast if possible by defining the shape
        interface NewsCacheData {
            data: Tank01News[];
            fetchedAt: admin.firestore.Timestamp;
        }
        const cacheData = snap.data() as NewsCacheData; // 'as' might still be needed here depending on Firestore typing
        const ageMin = (Date.now() - cacheData.fetchedAt.toMillis()) / 60000;
        if (ageMin < 5) return cacheData.data; // cached copy
    }

    const fresh = await getFreshNews();
    await doc.set({
        data: fresh,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return fresh;
}

// Using v2 onRequest
export const getNFLNews = onRequest(
  { region: REGION, cors: true, secrets: [TANK01_KEY] },
  async (req, res) => {
      try {
        const items = await loadNews();
        res.status(200).json({ data: items });
      } catch (err: unknown) { // Catch as unknown
        // Type check before logging
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error("getNFLNews error", { error: errorMessage, detail: err }); // Log full error object too
        res.status(500).json({ error: "Failed to load news" });
      }
  }
);

/* Cloud-scheduler: every 15 min refresh (v2 syntax is correct) */
export const refreshNFLNews = onSchedule( /* ... unchanged ... */
  {
    schedule: "every 15 minutes",
    region  : REGION,
    secrets : [TANK01_KEY],
  },
  async () => {
    try { // Add try/catch for robustness
        await loadNews();
        logger.log("News cache refreshed successfully.");
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to refresh news cache.", { error: errorMessage, detail: error });
    }
  }
);

/* ╭───────────────────────────────────────────────────────────────╮
   │  2.  AWS SES helper (Unchanged)                               │
   ╰───────────────────────────────────────────────────────────────╯ */

function ses(): SESv2Client { /* ... unchanged ... */
    return new SESv2Client({
        region: AWS_REGION.value(),
        credentials: {
            accessKeyId: AWS_ID.value(),
            secretAccessKey: AWS_SECRET.value(),
        },
    });
}
async function sendMail(to: string, subject: string, html: string) { /* ... unchanged ... */
    const params: SendEmailCommandInput = {
        FromEmailAddress: MAIL_FROM.value(),
        Destination: { ToAddresses: [to] },
        Content: {
            Simple: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: { Html: { Data: html, Charset: "UTF-8" } },
            },
        },
    };
    // Add try/catch for robustness
    try {
        await ses().send(new SendEmailCommand(params));
        logger.log(`Email sent successfully to ${to} with subject "${subject}"`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to send email to ${to}`, { error: errorMessage, detail: error });
        // Decide if you want to throw or just log
        // throw new Error(`Failed to send email: ${errorMessage}`);
    }
}

/* ╭───────────────────────────────────────────────────────────────╮
   │  3.  Firestore triggers (v2 syntax is correct, added try/catch) │
   ╰───────────────────────────────────────────────────────────────╯ */

/* league **created** → mail admin */
export const mailLeagueCreated = onDocumentCreated( /* ... unchanged structure ... */
    {
        document: "leagues/{leagueId}", region: REGION,
        secrets: [AWS_ID, AWS_SECRET, AWS_REGION, MAIL_FROM], memory: "256MiB",
    },
    async (event) => {
        try { // Wrap in try/catch
            const lg = event.data?.data();
            if (!lg) {
                logger.warn("League data missing in mailLeagueCreated trigger.");
                return;
            }

            const userSnap = await db.doc(`users/${lg.adminUid}`).get();
            const email = userSnap.data()?.email;
            if (!email) {
                logger.warn(`Email not found for admin user ${lg.adminUid} in mailLeagueCreated.`);
                return;
            }

            await sendMail(
                email,
                `Your new league "${lg.name}" is live!`,
                `<p>You created <b>${lg.name}</b> 🎉<br/>Share this code with friends: <b>${lg.code}</b></p>`
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error("Error in mailLeagueCreated trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
        }
    }
);

/* league **member added** → mail new member */
export const mailLeagueJoined = onDocumentUpdated( /* ... unchanged structure, improved member detection ... */
    {
        document: "leagues/{leagueId}", region: REGION,
        secrets: [AWS_ID, AWS_SECRET, AWS_REGION, MAIL_FROM],
    },
    async (event) => {
        try { // Wrap in try/catch
            const before = event.data?.before.data();
            const after = event.data?.after.data();
            if (!before || !after) {
                logger.warn("Before or after data missing in mailLeagueJoined trigger.");
                return;
            }

            // Define expected shape for Member for type safety
            interface MemberData { uid: string; teamName: string; }

            // Type assertions might be needed if Firestore types aren't specific enough
            const beforeMembers = (before.members ?? []) as MemberData[];
            const afterMembers = (after.members ?? []) as MemberData[];
            const beforeMemberUids = (before.memberUids ?? []) as string[];
            const afterMemberUids = (after.memberUids ?? []) as string[];

            if (afterMembers.length <= beforeMembers.length) return; // No new member added

            const newMemberUid = afterMemberUids.find(uid => !beforeMemberUids.includes(uid));
            if (!newMemberUid) {
                logger.warn(`Could not determine new member UID for league ${event.data?.after.id}`);
                return;
            }

            const newMember = afterMembers.find(m => m.uid === newMemberUid);
            if (!newMember) {
                logger.warn(`Could not find member data for new UID ${newMemberUid} in league ${event.data?.after.id}`);
                return;
            }

            const userSnap = await db.doc(`users/${newMember.uid}`).get();
            const email = userSnap.data()?.email;
            if (!email) {
                 logger.warn(`Email not found for new member ${newMember.uid} in mailLeagueJoined.`);
                return;
            }

            await sendMail(
                email,
                `Welcome to "${after.name}"`,
                `<p>Hey ${newMember.teamName}, you joined <b>${after.name}</b>.</p>`
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error("Error in mailLeagueJoined trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
        }
    }
);


/* ╭───────────────────────────────────────────────────────────────╮
   │  4.  League Management Callable Functions (Using v2 onCall)   │
   │      (Updated Error Handling - No 'any')                      │
   ╰───────────────────────────────────────────────────────────────╯ */

// --- Create League ---
export const createLeague = onCall({ region: REGION }, async (request) => {
  // Auth and input validation unchanged...
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
    // Log the specific internal error
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error creating league in DB:", { error: errorMessage, detail: error, userId: uid });
    // Throw a generic error to the client
    throw new HttpsError('internal', 'Failed to create the league due to a server error.');
  }
});

// --- Join League by Code ---
export const joinLeagueByCode = onCall({ region: REGION }, async (request) => {
  // Auth and input validation unchanged...
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
      const leagueData = leagueDoc.data()!; // Assume data exists if doc exists
      if (!Array.isArray(leagueData.memberUids) || !Array.isArray(leagueData.members)) {
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
    // If it's an HttpsError we already created, re-throw it
    if (error instanceof HttpsError) { throw error; }

    // Otherwise, log internal error and throw generic HttpsError
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error joining league by code ${code}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not join league by code due to a server error.');
  }
});

// --- Join League by ID ---
export const joinLeagueById = onCall({ region: REGION }, async (request) => {
  // Auth and input validation unchanged...
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
      const leagueData = leagueDoc.data()!;
      if (!Array.isArray(leagueData.memberUids) || !Array.isArray(leagueData.members)) {
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
    if (error instanceof HttpsError) { throw error; }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error joining league by ID ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not join league by ID due to a server error.');
  }
});

// --- Toggle League Visibility ---
export const toggleLeagueVisibility = onCall({ region: REGION }, async (request) => {
  // Auth and input validation unchanged...
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { leagueId, isPublic } = request.data;
  if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
  if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic must be boolean.'); }
  const uid = request.auth.uid;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League not found.'); }
    const leagueData = leagueDoc.data()!;
    if (leagueData.adminUid !== uid) { throw new HttpsError('permission-denied', 'Only the admin can change visibility.'); }

    await leagueRef.update({ isPublic });
    logger.log(`League ${leagueId} visibility set to ${isPublic} by admin ${uid}`);
    return { success: true };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error toggling visibility for league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not toggle visibility due to a server error.');
  }
});

// --- Rename League ---
export const renameLeague = onCall({ region: REGION }, async (request) => {
  // Auth and input validation unchanged...
  if (!request.auth) { throw new HttpsError('unauthenticated', 'User must be logged in.'); }
  const { leagueId, newName } = request.data;
  if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
  if (!newName || typeof newName !== 'string' || newName.trim() === '') { throw new HttpsError('invalid-argument', 'New league name required.'); }
  const uid = request.auth.uid;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) { throw new HttpsError('not-found', 'League not found.'); }
    const leagueData = leagueDoc.data()!;
    if (leagueData.adminUid !== uid) { throw new HttpsError('permission-denied', 'Only the admin can rename.'); }

    await leagueRef.update({ name: newName.trim() });
    logger.log(`League ${leagueId} renamed to "${newName.trim()}" by admin ${uid}`);
    return { success: true };
  } catch (error: unknown) { // Catch as unknown
    if (error instanceof HttpsError) { throw error; }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error renaming league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'Could not rename league due to a server error.');
  }
});