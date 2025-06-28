import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { FirestoreLeague, FirestoreLeagueMember, FirestoreWeeklyLineup } from "./types";

const db = admin.firestore();

/**
 * Triggered when a user's weekly lineup score (totalActualPoints) is updated.
 * This function updates the corresponding member's points in the league document.
 */
export const onUserWeeklyLineupScoreUpdate = onDocumentUpdated(
    "users/{userId}/weeklyLineups/{lineupDocId}", // lineupDocId is typically ${leagueId}_${season}_${week}
    async (event) => {
        const snap = event.data;
        if (!snap) {
            logger.info("No data associated with the event for onUserWeeklyLineupScoreUpdate trigger.");
            return;
        }

        const beforeData = snap.before.data() as FirestoreWeeklyLineup | undefined;
        const afterData = snap.after.data() as FirestoreWeeklyLineup | undefined;

        if (!afterData) {
            logger.info(`Document users/${event.params.userId}/weeklyLineups/${event.params.lineupDocId} was deleted. No action needed for league points update.`);
            return;
        }

        const oldTotalPoints = beforeData?.totalActualPoints;
        const newTotalPoints = afterData.totalActualPoints;

        // Only proceed if totalActualPoints has meaningfully changed and is a valid number
        if (newTotalPoints === null || newTotalPoints === undefined || newTotalPoints === oldTotalPoints) {
            logger.info(`totalActualPoints for ${event.params.lineupDocId} for user ${event.params.userId} did not change meaningfully or is null/undefined. Old: ${oldTotalPoints}, New: ${newTotalPoints}. No update to league points needed.`);
            return;
        }

        // Essential data from the lineup document itself
        const { leagueId, userId, season, week } = afterData;

        if (!leagueId || !userId || typeof season !== 'number' || typeof week !== 'number') {
            logger.error("Lineup data (afterData) is missing crucial fields (leagueId, userId, season, or week) for league points update.", { afterData });
            return;
        }
        
        logger.info(`Processing score update for user ${userId}, league ${leagueId}, season ${season}, week ${week}. New points: ${newTotalPoints}`);

        const leagueRef = db.collection("leagues").doc(leagueId);

        try {
            await db.runTransaction(async (transaction) => {
                const leagueDoc = await transaction.get(leagueRef);
                if (!leagueDoc.exists) {
                    logger.error(`League ${leagueId} not found. Cannot update member points for user ${userId}.`);
                    return; // Exit transaction
                }

                const leagueData = leagueDoc.data() as FirestoreLeague;
                const members = leagueData.members || [];
                let memberFound = false;
                let updatedTotalSeasonPointsForMember = 0;

                const updatedMembers = members.map((member: FirestoreLeagueMember) => {
                    if (member.uid === userId) {
                        memberFound = true;
                        const weeklyPoints = member.weeklyPoints || {};
                        weeklyPoints[String(week)] = newTotalPoints; // Update points for the specific week

                        // Recalculate totalSeasonPoints for this member
                        updatedTotalSeasonPointsForMember = Object.values(weeklyPoints).reduce((sum, points) => sum + (points || 0), 0);
                        
                        return {
                            ...member,
                            weeklyPoints,
                            totalSeasonPoints: updatedTotalSeasonPointsForMember,
                            lastUpdated: admin.firestore.Timestamp.now() // Update member's lastUpdated timestamp
                        };
                    }
                    return member;
                });

                if (!memberFound) {
                    logger.warn(`User ${userId} not found in league ${leagueId} members list. Points not updated for this user in the league.`);
                    // Depending on desired behavior, you might consider if this case needs special handling.
                    // For now, we just log and don't update the league if the member isn't found.
                    return; // Exit transaction
                }
                
                // Optionally, sort members by totalSeasonPoints descending if needed for leaderboards directly in league doc
                // updatedMembers.sort((a, b) => (b.totalSeasonPoints || 0) - (a.totalSeasonPoints || 0));

                transaction.update(leagueRef, { 
                    members: updatedMembers,
                    // lastLeagueActivity: admin.firestore.Timestamp.now() // Optionally update a league-level timestamp
                });
                logger.info(`Successfully updated points for user ${userId} in league ${leagueId}. Week ${week} points: ${newTotalPoints}, New total season points for member: ${updatedTotalSeasonPointsForMember}`);
            });
        } catch (error) {
            logger.error(`Transaction to update points for user ${userId} in league ${leagueId} (season ${season}, week ${week}) failed:`, error);
            // Rethrowing the error will cause Firebase to retry the function if it's a transient issue.
            // For permanent errors (like data integrity issues caught above), retrying might not help.
            throw error; 
        }
    }
); 