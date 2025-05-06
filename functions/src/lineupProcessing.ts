// src/lineupProcessing.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
// Import config, helpers, types
import { lineupProcessingOptions, config } from './config';
import { safeParseInt } from './common';
import {
    FirestorePlayerGameStat, FirestoreTeamGameStat,
    FirestoreWeeklyLineup, LineupPick, LineupPosition,
    FirestoreLeagueUsageCount,
    FirestoreWeeklySchedule // Needed for deadline check
} from './types';

// *** Define GenericResult locally ***
interface GenericResult {
    success: boolean;
    message: string;
}
// *** End Definition ***

const db = admin.firestore();
const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
const MAX_USAGE_COUNT = 5; // Define the usage limit

interface SaveLineupPayload {
    leagueId: string;
    week: number;
    picks: Partial<Record<LineupPosition, Omit<LineupPick, 'selectedAt'>>>;
}

/**
 * Saves a user's weekly lineup picks and updates usage counts.
 */
export const saveWeeklyLineup = onCall(
    { ...lineupProcessingOptions },
    async (request): Promise<GenericResult> => { // Now uses the defined GenericResult
        // 1. Authentication
        if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'User must be logged in to save lineup.');
        }
        const userId = request.auth.uid;

        // 2. Input Validation
        const { leagueId, week, picks } = request.data as SaveLineupPayload;
        if (typeof leagueId !== 'string' || !leagueId) {
             throw new HttpsError('invalid-argument', 'Valid leagueId required.');
        }
        if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
             throw new HttpsError('invalid-argument', `Valid week (1-${config.MAX_NFL_WEEKS}) required.`);
        }
        if (typeof picks !== 'object' || picks === null || Object.keys(picks).length === 0) {
             throw new HttpsError('invalid-argument', 'Picks object with at least one selection required.');
        }
        const validPositions = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
        for (const pos in picks) {
            if (!validPositions.includes(pos) || typeof picks[pos as LineupPosition]?.id !== 'string' || !['player', 'team'].includes(picks[pos as LineupPosition]?.type ?? '')) {
                throw new HttpsError('invalid-argument', `Invalid pick format for position ${pos}.`);
            }
        }

        logger.info(`User ${userId} saving lineup for league ${leagueId}, week ${week}.`);

        // --- Deadline Check ---
        const scheduleDocRef = db.collection('nfl_schedules').doc(`${currentSeason}_week_${week}`);
        let scheduleData: FirestoreWeeklySchedule | undefined;
        try {
             const scheduleDoc = await scheduleDocRef.get();
             if (!scheduleDoc.exists) {
                 logger.error(`Deadline check failed: Schedule not found for ${currentSeason}_week_${week}`);
                 throw new HttpsError('not-found', `Schedule for week ${week} not available. Cannot save lineup.`);
             }
             scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
        } catch (schedError) {
             logger.error(`Error fetching schedule for deadline check:`, schedError);
             throw new HttpsError('internal', 'Could not verify lineup deadline.');
        }

        const nowEpoch = Math.floor(Date.now() / 1000);
        let earliestGameEpoch = Number.MAX_SAFE_INTEGER;
        let deadlinePassed = false;

        // SIMPLIFIED APPROACH: Check against the first game of the week
        if (scheduleData?.games && scheduleData.games.length > 0) {
             scheduleData.games.forEach(game => {
                 const gameEpoch = safeParseInt(game.gameTimeEpoch);
                 if (gameEpoch > 0 && gameEpoch < earliestGameEpoch) {
                     earliestGameEpoch = gameEpoch;
                 }
             });

             if (earliestGameEpoch > 0 && nowEpoch >= earliestGameEpoch) {
                 deadlinePassed = true;
                 logger.warn(`Deadline check failed for user ${userId}, week ${week}. Current time ${nowEpoch} >= earliest game ${earliestGameEpoch}`);
             }
        } else {
             logger.warn(`No games found in schedule for week ${week} to check deadline.`);
             // Decide how to handle - allow saving or block? Blocking is safer.
             throw new HttpsError('failed-precondition', `Cannot determine deadline for week ${week}. Schedule might be missing.`);
        }

        if (deadlinePassed) {
             throw new HttpsError('failed-precondition', `The deadline for week ${week} (first game kickoff) has passed. Lineup cannot be saved.`);
        }
        // --- End Deadline Check ---


        const lineupDocId = `${leagueId}_${currentSeason}_${week}`;
        const lineupDocRef = db.collection('users').doc(userId).collection('weeklyLineups').doc(lineupDocId);
        const usageCollectionPath = `users/${userId}/leagueUsage/${leagueId}_${currentSeason}/usageCounts`;

        // Use a transaction to save lineup and update usage counts atomically
        try {
            await db.runTransaction(async (transaction) => {
                // --- Prepare data and fetch usage counts within transaction ---
                const now = Timestamp.now();
                const lineupPicksWithTimestamp: Partial<Record<LineupPosition, LineupPick>> = {};
                const entityIdsToUpdate: string[] = [];
                const usageDocsToGet: admin.firestore.DocumentReference[] = [];

                for (const position in picks) {
                    if (Object.prototype.hasOwnProperty.call(picks, position)) {
                        const pick = picks[position as LineupPosition];
                        if (pick) {
                            lineupPicksWithTimestamp[position as LineupPosition] = {
                                id: pick.id, type: pick.type, selectedAt: now,
                            };
                            const entityId = `${pick.type}_${pick.id}`;
                            entityIdsToUpdate.push(entityId);
                            usageDocsToGet.push(db.doc(`${usageCollectionPath}/${entityId}`));
                        }
                    }
                }

                // Get current usage counts for selected entities
                const usageDocs = usageDocsToGet.length > 0 ? await transaction.getAll(...usageDocsToGet) : [];
                const currentUsages: { [entityId: string]: number } = {};
                usageDocs.forEach(doc => {
                     if (doc.exists) {
                         currentUsages[doc.id] = (doc.data() as FirestoreLeagueUsageCount)?.count ?? 0;
                     } else {
                         currentUsages[doc.id] = 0;
                     }
                });

                // --- Validate Usage Limits ---
                for (const entityId of entityIdsToUpdate) {
                     const currentCount = currentUsages[entityId] ?? 0;
                     if (currentCount >= MAX_USAGE_COUNT) {
                          logger.error(`Usage limit exceeded for entity ${entityId} by user ${userId}, league ${leagueId}. Current: ${currentCount}`);
                          throw new HttpsError('failed-precondition', `Usage limit (${MAX_USAGE_COUNT}) reached for one or more selections.`);
                     }
                }

                // --- Perform Writes ---
                const lineupData: FirestoreWeeklyLineup = {
                    userId, leagueId, season: currentSeason, week,
                    picks: lineupPicksWithTimestamp,
                    isComplete: Object.keys(lineupPicksWithTimestamp).length === 8,
                    lastUpdated: now,
                    totalPoints: null, // Reset points on save
                };
                transaction.set(lineupDocRef, lineupData, { merge: true });

                // Increment usage counts
                for (const entityId of entityIdsToUpdate) {
                    const usageDocRef = db.doc(`${usageCollectionPath}/${entityId}`);
                    const type = entityId.startsWith('player_') ? 'player' : 'team';
                    transaction.set(usageDocRef, {
                        entityId: entityId, type: type,
                        count: FieldValue.increment(1)
                    }, { merge: true });
                }
            });

            logger.info(`Successfully saved lineup and updated usage for user ${userId}, league ${leagueId}, week ${week}.`);
            return { success: true, message: 'Lineup saved successfully!' };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error(`Transaction failed for saveWeeklyLineup user ${userId}, league ${leagueId}, week ${week}:`, error);
            throw new HttpsError('internal', 'Failed to save lineup due to a server error. Please try again.');
        }
    }
);


interface CalculateScoresPayload {
    week: number;
    season?: number;
    leagueId?: string; // Optional: Calculate for a specific league
}
/**
 * Calculates total points for user lineups for a specific week based on stored gamestats.
 */
export const calculateWeeklyScores = onCall(
    { ...lineupProcessingOptions, timeoutSeconds: 540, memory: "1GiB" },
    async (request): Promise<GenericResult> => { // Now uses the defined GenericResult
        // 1. Auth/Admin Check (Optional)
        // if (request.auth?.token?.admin !== true) { throw new HttpsError('permission-denied', 'Admin only.'); }

        // 2. Input Validation
        const { week, leagueId } = request.data as CalculateScoresPayload;
        const season = request.data.season ?? currentSeason;
        if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
             throw new HttpsError('invalid-argument', `Valid week (1-${config.MAX_NFL_WEEKS}) required.`);
        }
        logger.info(`Starting score calculation for week ${week}, season ${season}` + (leagueId ? ` for league ${leagueId}` : ` for all leagues`));

        // 3. Query Lineups
        let lineupQuery = db.collectionGroup('weeklyLineups')
                             .where('season', '==', season)
                             .where('week', '==', week) as admin.firestore.Query<FirestoreWeeklyLineup>;
        if (leagueId) {
            lineupQuery = lineupQuery.where('leagueId', '==', leagueId);
        }

        const lineupSnapshots = await lineupQuery.get();
        if (lineupSnapshots.empty) {
            return { success: true, message: `No lineups found to score for week ${week}, season ${season}` + (leagueId ? ` in league ${leagueId}` : '') };
        }
        logger.info(`Found ${lineupSnapshots.size} lineups to process for week ${week}.`);

        // 4. Process Each Lineup (Concurrently, potentially in batches)
        const batchSize = 200;
        let processedCount = 0;
        let errorCount = 0;
        //const allPromises: Promise<void>[] = [];
        let currentBatchPromises: Promise<void>[] = [];

        for (const lineupDoc of lineupSnapshots.docs) {
             const processLineupPromise = (async () => {
                 const lineupData = lineupDoc.data();
                 const lineupRef = lineupDoc.ref;
                 let weeklyTotalPoints = 0;
                 let lineupProcessingError = false;

                 if (!lineupData?.picks || Object.keys(lineupData.picks).length === 0) {
                     logger.warn(`Skipping lineup ${lineupDoc.id} - No picks found.`);
                     return;
                 }

                 const pointFetchPromises = Object.entries(lineupData.picks).map(async ([position, pick]) => {
                     if (!pick) return 0;
                     const collectionName = pick.type === 'player' ? 'players' : 'teams';
                     const entityId = pick.id;
                     let points = 0;
                     try {
                         const gameStatsQuery = db.collection(collectionName).doc(entityId).collection('gamestats')
                                                   .where('week', '==', week).where('season', '==', season).limit(1);
                         const gameStatsSnapshot = await gameStatsQuery.get();
                         if (!gameStatsSnapshot.empty) {
                             const gameStatDoc = gameStatsSnapshot.docs[0];
                             if (pick.type === 'player') {
                                 points = (gameStatDoc.data() as FirestorePlayerGameStat)?.fantasyPoints ?? 0;
                             } else {
                                 const teamGameStat = gameStatDoc.data() as FirestoreTeamGameStat;
                                 switch (position as LineupPosition) {
                                     case 'PassingOffense': points = teamGameStat?.fantasyPointsPassing ?? 0; break;
                                     case 'RushingOffense': points = teamGameStat?.fantasyPointsRushing ?? 0; break;
                                     case 'Defense': points = teamGameStat?.fantasyPointsDefense ?? 0; break;
                                     case 'SpecialTeams': points = teamGameStat?.fantasyPointsSpecialTeams ?? 0; break;
                                     default: logger.warn(`Unknown team unit position '${position}' for team pick ${entityId} in lineup ${lineupDoc.id}`);
                                 }
                             }
                         } else {
                              logger.warn(`No gamestat found for ${pick.type} ${entityId}, week ${week}, season ${season}. Assigning 0 points for lineup ${lineupDoc.id}.`);
                         }
                     } catch (fetchError) {
                         logger.error(`Error fetching gamestat for ${pick.type} ${entityId}, week ${week} (lineup ${lineupDoc.id}):`, fetchError);
                         lineupProcessingError = true;
                     }
                     return points;
                 });

                 const results = await Promise.all(pointFetchPromises);

                 if (!lineupProcessingError) {
                     weeklyTotalPoints = results.reduce((sum, pts) => sum + pts, 0);
                     weeklyTotalPoints = Math.round(weeklyTotalPoints * 100) / 100;
                     try {
                         await lineupRef.update({ totalPoints: weeklyTotalPoints, lastUpdated: Timestamp.now() });
                         processedCount++;
                     } catch (updateError) {
                         logger.error(`Error updating totalPoints for lineup ${lineupDoc.id}:`, updateError);
                         errorCount++;
                     }
                 } else {
                      errorCount++;
                 }
             })(); // End async IIFE

             currentBatchPromises.push(processLineupPromise);
             if (currentBatchPromises.length >= batchSize) {
                 await Promise.allSettled(currentBatchPromises);
                 logger.info(`Processed batch of ${currentBatchPromises.length} lineups...`);
                 currentBatchPromises = [];
             }
        }

        if (currentBatchPromises.length > 0) {
             await Promise.allSettled(currentBatchPromises);
             logger.info(`Processed final batch of ${currentBatchPromises.length} lineups.`);
        }

        // 5. Return Summary Response
        const finalMessage = `Score calculation finished for week ${week}, season ${season}. Lineups Successfully Scored: ${processedCount}, Errors Encountered: ${errorCount}.`;
        logger.info(finalMessage);
        return { success: errorCount === 0, message: finalMessage };
    }
);

