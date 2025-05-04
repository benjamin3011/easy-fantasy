// src/email.ts
import { logger } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {
  SESv2Client,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
// Import shared config/secrets
import { emailOptions, secrets } from './config';

// Get db instance (initialized in index.ts)
const db = admin.firestore();

// --- AWS SES Helper ---
// Initialize client inside function for runtime secret access
async function sendMail(to: string, subject: string, html: string) {
    const sesClient = new SESv2Client({
        region: secrets.AWS_REGION.value(),
        credentials: {
            accessKeyId: secrets.AWS_ID.value(),
            secretAccessKey: secrets.AWS_SECRET.value(),
        },
    });
    const params: SendEmailCommandInput = {
        FromEmailAddress: secrets.MAIL_FROM.value(),
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Html: { Data: html, Charset: "UTF-8" }} }},
    };
    try {
        await sesClient.send(new SendEmailCommand(params));
        logger.log(`Email sent successfully to ${to}`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to send email to ${to}`, { error: errorMessage, detail: error });
        // Optional: throw new Error(`Failed to send email: ${errorMessage}`);
    }
}

// --- Firestore Triggers (Exported) ---

/* league **created** → mail admin */
export const mailLeagueCreated = onDocumentCreated(
    {
        document: "leagues/{leagueId}",
        ...emailOptions
    },
    async (event) => {
        try {
            const lg = event.data?.data();
            if (!lg || typeof lg.adminUid !== 'string' || typeof lg.name !== 'string' || typeof lg.code !== 'string') {
                 logger.warn("League data missing/invalid in mailLeagueCreated."); return;
            }
            const userSnap = await db.doc(`users/${lg.adminUid}`).get();
            const email = userSnap.data()?.email;
             if (!email || typeof email !== 'string') {
                 logger.warn(`Email missing/invalid for admin ${lg.adminUid}.`); return;
            }
            await sendMail( email, `Your new league "${lg.name}" is live!`, `<p>You created <b>${lg.name}</b> 🎉<br/>Share this code: <b>${lg.code}</b></p>` );
        } catch (error: unknown) {
             const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error("Error in mailLeagueCreated trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
        }
    }
);

/* league **member added** → mail new member */
export const mailLeagueJoined = onDocumentUpdated(
    {
        document: "leagues/{leagueId}",
        ...emailOptions
    },
    async (event) => {
        try {
            const before = event.data?.before.data(); const after = event.data?.after.data();
            if (!before || !after || typeof after.name !== 'string') { logger.warn("Before/after data missing in mailLeagueJoined."); return; }
            interface MemberData { uid: string; teamName: string; }
            const beforeMembers = (Array.isArray(before.members) ? before.members : []) as MemberData[];
            const afterMembers = (Array.isArray(after.members) ? after.members : []) as MemberData[];
            const beforeMemberUids = (Array.isArray(before.memberUids) ? before.memberUids : []) as string[];
            const afterMemberUids = (Array.isArray(after.memberUids) ? after.memberUids : []) as string[];
            if (afterMembers.length <= beforeMembers.length) return;
            const newMemberUid = afterMemberUids.find(uid => !beforeMemberUids.includes(uid));
            if (!newMemberUid) { logger.warn(`Could not find new member UID.`); return; }
            const newMember = afterMembers.find(m => m.uid === newMemberUid);
            if (!newMember || typeof newMember.teamName !== 'string') { logger.warn(`Could not find valid new member data.`); return; }
            const userSnap = await db.doc(`users/${newMember.uid}`).get();
            const email = userSnap.data()?.email;
             if (!email || typeof email !== 'string') { logger.warn(`Email missing/invalid for member ${newMember.uid}.`); return; }
            await sendMail( email, `Welcome to "${after.name}"`, `<p>Hey ${newMember.teamName}, you joined <b>${after.name}</b>.</p>` );
        } catch (error: unknown) {
             const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error("Error in mailLeagueJoined trigger:", { error: errorMessage, detail: error, leagueId: event.params.leagueId });
        }
    }
);
