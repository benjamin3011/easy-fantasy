// src/lineupProcessing.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
// Import config, helpers, types
import { lineupProcessingOptions, config } from './config';
import { safeParseInt } from './common';
import {
    FirestorePlayerGameStat, FirestoreTeamGameStat,
    FirestoreWeeklyLineup, LineupPick, LineupPosition,
    FirestoreLeagueUsageCount,
    FirestoreWeeklySchedule, // FirestoreGameSchedule was removed as it's not defined/used
    FirestoreLeague,
    // PlayerPosition removed as it was unused after corrections
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
    captainPlayerId?: string | null;
}

/**
 * Saves a user's weekly lineup picks and updates usage counts.
 */
export const saveWeeklyLineup = onCall(
    { ...lineupProcessingOptions },
    async (request): Promise<GenericResult> => {
        if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'User must be logged in to save lineup.');
        }
        const userId = request.auth.uid;
        const { leagueId, week, picks: newPicksPayload, captainPlayerId: rawCaptainPlayerId } = request.data as SaveLineupPayload;

        // Fetch League Settings first
        let leagueDataFromDb;
        try {
            const leagueDoc = await db.collection('leagues').doc(leagueId).get();
            if (!leagueDoc.exists) {
                throw new HttpsError('not-found', `League with ID ${leagueId} not found.`);
            }
            leagueDataFromDb = leagueDoc.data();
            if (!leagueDataFromDb) {
                throw new HttpsError('internal', `Could not read data for league ${leagueId}.`);
            }
        } catch (error) {
            logger.error(`Failed to fetch league ${leagueId} for settings:`, error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', 'Could not retrieve league settings.');
        }

        const enableCaptainFeature = leagueDataFromDb.enableCaptainFeature === true; // Default to false if undefined
        let validatedCaptainPlayerId: string | null = null;

        // 2. Input Validation
        if (typeof leagueId !== 'string' || !leagueId) {
             throw new HttpsError('invalid-argument', 'Valid leagueId required.');
        }
        if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
             throw new HttpsError('invalid-argument', `Valid week (1-${config.MAX_NFL_WEEKS}) required.`);
        }
        if (typeof newPicksPayload !== 'object' || newPicksPayload === null) {
             throw new HttpsError('invalid-argument', 'Picks object required.');
        }
        const validPositions = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
        for (const pos in newPicksPayload) {
            if (!validPositions.includes(pos) || typeof newPicksPayload[pos as LineupPosition]?.id !== 'string' || !['player', 'team'].includes(newPicksPayload[pos as LineupPosition]?.type ?? '')) {
                throw new HttpsError('invalid-argument', `Invalid pick format for position ${pos}.`);
            }
        }
        logger.info(`User ${userId} saving lineup for league ${leagueId}, week ${week}. Raw picks payload:`, JSON.stringify(newPicksPayload)); // Log raw picks
        logger.info(`Captain feature for league ${leagueId} is ${enableCaptainFeature ? 'ENABLED' : 'DISABLED'}. Raw captainPlayerId: ${rawCaptainPlayerId}`);

        const scheduleDocRef = db.collection('nfl_schedules').doc(`${currentSeason}_week_${week}`);
        let scheduleData: FirestoreWeeklySchedule | undefined;
        try {
             const scheduleDoc = await scheduleDocRef.get();
             if (!scheduleDoc.exists) {
                 logger.error(`Schedule not found for ${currentSeason}_week_${week}`);
                 throw new HttpsError('not-found', `Schedule for week ${week} not available. Cannot save lineup.`);
             }
             scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
             logger.info(`Fetched schedule data for week ${week}:`, JSON.stringify(scheduleData?.games?.slice(0, 5))); // Log first 5 games
             if (!scheduleData.games || scheduleData.games.length === 0) {
                logger.warn(`No games found in schedule for week ${week}. Cannot validate pick locks.`);
                throw new HttpsError('failed-precondition', `Schedule games for week ${week} are missing. Cannot save lineup.`);
             }
        } catch (schedError) {
             logger.error(`Error fetching schedule for deadline check:`, schedError);
             if (schedError instanceof HttpsError) throw schedError;
             throw new HttpsError('internal', 'Could not verify lineup deadline.');
        }
        const nowEpoch = Math.floor(Date.now() / 1000);
        logger.info(`Current epoch for lock check: ${nowEpoch}`);

        // Fetch player details to get their current team IDs for game lookup
        const playerIdsToFetch: string[] = [];
        for (const pos in newPicksPayload) {
            const pick = newPicksPayload[pos as LineupPosition];
            if (pick?.type === 'player') {
                playerIdsToFetch.push(pick.id);
            }
        }
        logger.info(`Player IDs to fetch for team map: ${JSON.stringify(playerIdsToFetch)}`);

        const playerTeamMap: Record<string, string> = {}; // playerId -> teamId
        if (playerIdsToFetch.length > 0) {
            const playerDocsRefs = playerIdsToFetch.map(playerId => db.collection('players').doc(playerId));
            try {
                const playerDocsSnapshots = await db.getAll(...playerDocsRefs);
                playerDocsSnapshots.forEach(docSnap => {
                    if (docSnap.exists) {
                        const playerData = docSnap.data();
                        if (playerData) { 
                            logger.info(`Processing player doc ${docSnap.id} from 'players' collection. Has nflTeamId: ${playerData.nflTeamId}`);
                        } else {
                            logger.warn(`Player data for ${docSnap.id} from 'players' collection is undefined.`);
                        }
                        const teamId = playerData?.nflTeamId || playerData?.currentTeamId || playerData?.team_id || playerData?.teamId;
                        logger.info(`Player ${docSnap.id} - Extracted teamId: ${teamId} from 'players' collection.`);
                        if (teamId) {
                            playerTeamMap[docSnap.id] = teamId;
                        } else {
                            logger.warn(`Player ${docSnap.id} from 'players' collection is missing a usable teamId.`);
             }
        } else {
                        logger.warn(`Player document ${docSnap.id} not found in 'players' collection during teamId fetch.`); 
                    }
                });
            } catch (playerFetchError) {
                logger.error('Error fetching player details for team ID lookup from \'players\' collection:', playerFetchError);
                throw new HttpsError('internal', 'Could not fetch player details to validate lineup locks.');
        }
        }
        logger.info(`Constructed playerTeamMap (from 'players' collection): ${JSON.stringify(playerTeamMap)}`);

        const lineupDocId = `${leagueId}_${currentSeason}_${week}`;
        const lineupDocRef = db.collection('users').doc(userId).collection('weeklyLineups').doc(lineupDocId);
        const usageCollectionPath = `users/${userId}/leagueUsage/${leagueId}_${currentSeason}/usageCounts`;

        try {
            await db.runTransaction(async (transaction) => {
                const now = Timestamp.now(); // Firestore timestamp for writes
                // const nowEpoch = Math.floor(Date.now() / 1000); // Moved up for earlier logging

                // 1. Get existing lineup for this week (if any) to determine changes
                const oldLineupDoc = await transaction.get(lineupDocRef);
                const oldPicks: Partial<Record<LineupPosition, LineupPick>> = oldLineupDoc.exists ? (oldLineupDoc.data() as FirestoreWeeklyLineup)?.picks || {} : {};

                // *** NEW: Perform Per-Pick Lock Check ***
                for (const pos in newPicksPayload) {
                    const newPickDetails = newPicksPayload[pos as LineupPosition];
                    if (!newPickDetails) continue; 

                    const entityId = newPickDetails.id;
                    const entityType = newPickDetails.type;
                    let gameTimeEpoch: number | undefined = undefined;
                    let teamIdForLookup: string | undefined;

                    // ***** START DEBUG LOGGING FOR PICK PROCESSING *****
                    logger.info(`DEBUG: Checking lock for position ${pos}, entityId: ${entityId}, entityType: ${entityType}`);
                    // ***** END DEBUG LOGGING FOR PICK PROCESSING *****

                    if (entityType === 'team') {
                        teamIdForLookup = entityId;
                        logger.info(`DEBUG: Team pick. teamIdForLookup: ${teamIdForLookup}`);
                    } else if (entityType === 'player') {
                        teamIdForLookup = playerTeamMap[entityId];
                        // ***** START DEBUG LOGGING FOR PLAYER TEAM LOOKUP *****
                        logger.info(`DEBUG: Player pick. Looked up teamId for ${entityId} in playerTeamMap. Result: ${teamIdForLookup}`);
                        // ***** END DEBUG LOGGING FOR PLAYER TEAM LOOKUP *****
                        if (!teamIdForLookup) {
                            logger.warn(`Cannot find team for player ${entityId} in playerTeamMap for lock check. This pick might be implicitly locked if game started.`);
                        }
                    }

                    if (teamIdForLookup && scheduleData?.games) {
                        // ***** START DEBUG LOGGING FOR GAME SEARCH *****
                        logger.info(`DEBUG: Searching for game with teamIdForLookup: ${teamIdForLookup} in scheduleData.games (first 5 games shown earlier).`);
                        // ***** END DEBUG LOGGING FOR GAME SEARCH *****
                        const gameForEntity = scheduleData.games.find(g => 
                            g.teamIDHome === teamIdForLookup || g.teamIDAway === teamIdForLookup
                        );
                        // ***** START DEBUG LOGGING FOR FOUND GAME *****
                        if (gameForEntity) {
                            logger.info(`DEBUG: Found gameForEntity:`, JSON.stringify(gameForEntity));
                            if (gameForEntity.gameTime_epoch) {
                                gameTimeEpoch = safeParseInt(gameForEntity.gameTime_epoch);
                                logger.info(`DEBUG: Parsed gameTimeEpoch: ${gameTimeEpoch} from raw ${gameForEntity.gameTime_epoch}. Current nowEpoch: ${nowEpoch}.`);
                            } else {
                                logger.warn(`DEBUG: gameForEntity found, but gameTime_epoch is missing or undefined.`);
                            }
                        } else {
                            logger.warn(`DEBUG: No gameForEntity found for teamIdForLookup: ${teamIdForLookup}.`);
                        }
                        // ***** END DEBUG LOGGING FOR FOUND GAME *****
                    } else if (!teamIdForLookup) {
                        logger.warn(`DEBUG: Skipping game search because teamIdForLookup is undefined for entity ${entityId}.`);
                    } else if (!scheduleData?.games) {
                        logger.warn(`DEBUG: Skipping game search because scheduleData.games is undefined or empty.`);
                    }

                    if (gameTimeEpoch && gameTimeEpoch <= nowEpoch) { // Game has started
                        logger.info(`DEBUG: Game for ${entityType} ${entityId} HAS STARTED (gameTime: ${gameTimeEpoch} <= now: ${nowEpoch}).`);
                        const oldPickForPos = oldPicks[pos as LineupPosition];
                        const isNewOrChangedPick = !oldPickForPos || 
                                                 oldPickForPos.id !== entityId || 
                                                 oldPickForPos.type !== entityType;
                        
                        if (isNewOrChangedPick) {
                            logger.error(`Lock violation: User ${userId} tried to change pick for ${pos} (Entity: ${entityType}_${entityId}) after game start.`);
                            throw new HttpsError('failed-precondition', 
                                `Cannot save lineup. The game for your selection at ${pos} (${entityId}) has started, and this pick has been changed. Unchanged locked picks are allowed.`
                            );
                        } else {
                            logger.info(`DEBUG: Pick for ${entityType} ${entityId} is the same as old pick and game has started. Allowed.`);
                        }
                    } else if (gameTimeEpoch) {
                        logger.info(`DEBUG: Game for ${entityType} ${entityId} HAS NOT started (gameTime: ${gameTimeEpoch} > now: ${nowEpoch}). No lock.`);
                    } else {
                         logger.info(`DEBUG: No gameTimeEpoch determined for ${entityType} ${entityId}. No lock applied based on time.`);
                    }
                }
                // *** END: Per-Pick Lock Check ***

                // Captain Player ID Validation (only if feature is enabled)
                if (enableCaptainFeature) {
                    if (rawCaptainPlayerId) {
                        if (typeof rawCaptainPlayerId !== 'string') {
                            throw new HttpsError('invalid-argument', 'Captain player ID must be a string.');
                        }
                        // Check if the captain is actually a player in the newPicksPayload
                        let captainFoundInPicks = false;
                        for (const pos in newPicksPayload) {
                            const pick = newPicksPayload[pos as LineupPosition];
                            if (pick && pick.type === 'player' && pick.id === rawCaptainPlayerId) {
                                captainFoundInPicks = true;
                                break;
                            }
                        }
                        if (!captainFoundInPicks) {
                            throw new HttpsError('invalid-argument', `Selected captain (ID: ${rawCaptainPlayerId}) is not a player in the current lineup.`);
                        }
                        validatedCaptainPlayerId = rawCaptainPlayerId;
                        logger.info(`Validated captain for user ${userId}, league ${leagueId}, week ${week}: ${validatedCaptainPlayerId}`);
                    } else {
                        validatedCaptainPlayerId = null; // Explicitly setting to null if not provided
                        logger.info(`No captain selected by user ${userId} for league ${leagueId}, week ${week}, or feature enabled but ID is null/undefined.`);
                    }
                } else {
                    // If feature is disabled, captain ID should be null, regardless of input
                    validatedCaptainPlayerId = null;
                    if (rawCaptainPlayerId) {
                        logger.warn(`Captain feature is disabled for league ${leagueId}, but captainPlayerId (${rawCaptainPlayerId}) was provided. It will be ignored.`);
                    }
                }

                const oldEntityIds = new Set<string>();
                for (const pos in oldPicks) {
                    const pick = oldPicks[pos as LineupPosition];
                    if (pick) oldEntityIds.add(`${pick.type}_${pick.id}`);
                }

                // 2. Prepare new lineup data and identify new entity IDs
                const newLineupPicksWithTimestamp: Partial<Record<LineupPosition, LineupPick>> = {};
                const newEntityIds = new Set<string>();
                const entityIdsToFetchUsage = new Set<string>();

                for (const position in newPicksPayload) {
                    if (Object.prototype.hasOwnProperty.call(newPicksPayload, position)) {
                        const pick = newPicksPayload[position as LineupPosition];
                        if (pick) {
                            newLineupPicksWithTimestamp[position as LineupPosition] = {
                                id: pick.id, type: pick.type, selectedAt: now,
                            };
                            const entityId = `${pick.type}_${pick.id}`;
                            newEntityIds.add(entityId);
                            entityIdsToFetchUsage.add(entityId); 
                        }
                    }
                }
                
                oldEntityIds.forEach(id => entityIdsToFetchUsage.add(id));
                
                const usageDocsToGetRefs: admin.firestore.DocumentReference[] = [];
                entityIdsToFetchUsage.forEach(entityId => {
                    usageDocsToGetRefs.push(db.doc(`${usageCollectionPath}/${entityId}`));
                });
                
                const currentUsageDocs = usageDocsToGetRefs.length > 0 ? await transaction.getAll(...usageDocsToGetRefs) : [];
                const currentUsages: { [entityId: string]: number } = {};
                currentUsageDocs.forEach(docSnap => {
                    if (docSnap.exists) {
                        currentUsages[docSnap.id.split('/').pop()!] = (docSnap.data() as FirestoreLeagueUsageCount)?.count ?? 0;
                     } else {
                        currentUsages[docSnap.id.split('/').pop()!] = 0;
                     }
                });

                const entitiesToIncrement = new Set<string>();
                const entitiesToDecrement = new Set<string>();

                newEntityIds.forEach(entityId => {
                    if (!oldEntityIds.has(entityId)) {
                        entitiesToIncrement.add(entityId);
                    }
                });

                oldEntityIds.forEach(entityId => {
                    if (!newEntityIds.has(entityId)) {
                        entitiesToDecrement.add(entityId);
                    }
                });

                for (const entityId of Array.from(entitiesToIncrement)) {
                     const currentCount = currentUsages[entityId] ?? 0;
                     if (currentCount >= MAX_USAGE_COUNT) {
                          logger.error(`Usage limit exceeded for entity ${entityId} by user ${userId}, league ${leagueId}. Current: ${currentCount}`);
                        throw new HttpsError('failed-precondition', `Usage limit (${MAX_USAGE_COUNT}) reached for one or more new selections.`);
                     }
                }

                const lineupData: FirestoreWeeklyLineup = {
                    userId, leagueId, season: currentSeason, week,
                    picks: newLineupPicksWithTimestamp,
                    isComplete: Object.keys(newLineupPicksWithTimestamp).length === validPositions.length, // Keep for backwards compatibility, but don't enforce
                    lastUpdated: now,
                    totalActualPoints: null, 
                    captainPlayerId: validatedCaptainPlayerId, // Store validated captain ID
                };
                transaction.set(lineupDocRef, lineupData); 

                entitiesToIncrement.forEach(entityId => {
                    const usageDocRef = db.doc(`${usageCollectionPath}/${entityId}`);
                    const type = entityId.startsWith('player_') ? 'player' : 'team';
                    transaction.set(usageDocRef, {
                        entityId: entityId, type: type,
                        count: FieldValue.increment(1),
                        lastUsedWeek: week, 
                        lastUsedTimestamp: now 
                    }, { merge: true }); 
                });

                entitiesToDecrement.forEach(entityId => {
                    const usageDocRef = db.doc(`${usageCollectionPath}/${entityId}`);
                    if ((currentUsages[entityId] ?? 0) > 0) {
                         const type = entityId.startsWith('player_') ? 'player' : 'team';
                         transaction.set(usageDocRef, {
                            entityId: entityId, type: type,
                            count: FieldValue.increment(-1)
                    }, { merge: true });
                    } else {
                        logger.warn(`Attempted to decrement usage for ${entityId} but current usage is ${currentUsages[entityId] ?? 0}. Skipping decrement.`);
                }
                });
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
        const allBatchCommitPromises: Promise<admin.firestore.WriteResult[]>[] = [];
        let processedCount = 0;
        let errorCount = 0;
        let currentBatch = db.batch();
        let operationsInCurrentBatch = 0;
        const MAX_OPERATIONS_PER_BATCH = 490; // Firestore limit is 500

        // Cache for league settings to avoid multiple fetches for the same league
        const leagueSettingsCache: Record<string, { enableCaptainFeature: boolean; captainPointMultiplier: number }> = {};

        for (const lineupDoc of lineupSnapshots.docs) {
                 const lineupData = lineupDoc.data();
                 const lineupRef = lineupDoc.ref;
                 let weeklyTotalPoints = 0;
                 let lineupProcessingError = false;

                 // Fetch league settings if not already cached
                 let currentLeagueSettings = leagueSettingsCache[lineupData.leagueId];
                 if (!currentLeagueSettings) {
                     try {
                         const leagueSettingsDoc = await db.collection('leagues').doc(lineupData.leagueId).get();
                         if (leagueSettingsDoc.exists) {
                             const settings = leagueSettingsDoc.data();
                             currentLeagueSettings = {
                                 enableCaptainFeature: settings?.enableCaptainFeature === true, // Default to false
                                 captainPointMultiplier: typeof settings?.captainPointMultiplier === 'number' ? settings.captainPointMultiplier : 1.0, // Default to 1.0 if not set or invalid
                             };
                             leagueSettingsCache[lineupData.leagueId] = currentLeagueSettings;
                             logger.info(`Fetched and cached settings for league ${lineupData.leagueId}: Captain Feature ${currentLeagueSettings.enableCaptainFeature}, Multiplier ${currentLeagueSettings.captainPointMultiplier}`);
                         } else {
                             logger.warn(`League settings not found for league ${lineupData.leagueId}. Captain feature will be disabled for this lineup.`);
                             currentLeagueSettings = { enableCaptainFeature: false, captainPointMultiplier: 1.0 }; // Default if league not found
                             leagueSettingsCache[lineupData.leagueId] = currentLeagueSettings; 
                         }
                     } catch (e) {
                         logger.error(`Error fetching settings for league ${lineupData.leagueId}:`, e);
                         lineupProcessingError = true; // Consider this an error for the lineup
                         currentLeagueSettings = { enableCaptainFeature: false, captainPointMultiplier: 1.0 }; // Default on error
                         // leagueSettingsCache[lineupData.leagueId] = currentLeagueSettings; // Optionally cache error state too
                     }
                 }

                 if (!lineupData?.picks || Object.keys(lineupData.picks).length === 0) {
                     logger.warn(`Skipping lineup ${lineupDoc.id} - No picks found.`);
                // If totalActualPoints is not null or 0, set it to 0
                if (lineupData.totalActualPoints !== null && lineupData.totalActualPoints !== 0) {
                    currentBatch.update(lineupRef, { totalActualPoints: 0, lastUpdated: Timestamp.now() });
                    operationsInCurrentBatch++;
                 }
                // No further processing for this lineup, but check batch commit condition below
            } else {
                // This map call needs to be awaited if game stat fetching is async
                const pointFetchResults = await Promise.all(
                    Object.entries(lineupData.picks).map(async ([position, pick]) => {
                     if (!pick) return { points: 0, isCaptain: false };
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
                            lineupProcessingError = true; // Mark error for this lineup
                     }
                     // Determine if this pick is the captain
                     const isCaptain = currentLeagueSettings.enableCaptainFeature && 
                                       pick.type === 'player' && 
                                       lineupData.captainPlayerId === entityId;
                     if (isCaptain) {
                        logger.info(`Player ${entityId} is captain for lineup ${lineupDoc.id}. Original points: ${points}, Multiplier: ${currentLeagueSettings.captainPointMultiplier}`);
                     }
                     return { points, isCaptain };
                    })
                );

                 if (!lineupProcessingError) {
                    weeklyTotalPoints = pointFetchResults.reduce((sum, result) => {
                        let effectivePoints = result.points;
                        if (result.isCaptain) {
                            effectivePoints = result.points * currentLeagueSettings.captainPointMultiplier;
                            // Ensure points are rounded to avoid floating point issues if necessary, e.g., Math.round(effectivePoints * 100) / 100
                        }
                        return sum + effectivePoints;
                    }, 0);

                    weeklyTotalPoints = Math.round(weeklyTotalPoints * 100) / 100; // Round final total

                    // Update only if the score is different or was null
                    if (lineupData.totalActualPoints !== weeklyTotalPoints) {
                        currentBatch.update(lineupRef, { totalActualPoints: weeklyTotalPoints, lastUpdated: Timestamp.now() });
                        operationsInCurrentBatch++;
                    }
                         processedCount++;
                } else {
                     errorCount++; // Increment error count for lineups that had issues fetching points
                }
            }

            // Commit batch if it's full
            if (operationsInCurrentBatch >= MAX_OPERATIONS_PER_BATCH) {
                logger.info(`Committing batch of ${operationsInCurrentBatch} lineup score updates...`);
                allBatchCommitPromises.push(currentBatch.commit());
                currentBatch = db.batch(); // Start a new batch
                operationsInCurrentBatch = 0;
            }
        }

        // Commit any remaining operations in the last batch
        if (operationsInCurrentBatch > 0) {
             logger.info(`Committing final batch of ${operationsInCurrentBatch} lineup score updates...`);
             allBatchCommitPromises.push(currentBatch.commit());
        }

        // Wait for all batch commits to complete
        try {
            await Promise.all(allBatchCommitPromises);
        } catch (batchCommitError) {
            logger.error("Error committing one or more batches:", batchCommitError);
            // Depending on requirements, you might want to increase errorCount or throw
            // For now, we'll log and the summary message will reflect processed vs. errors
        }

        // 5. Return Summary Response
        const finalMessage = `Score calculation finished for week ${week}, season ${season}. Lineups Successfully Scored: ${processedCount}, Errors Encountered: ${errorCount}.`;
        logger.info(finalMessage);
        return { success: errorCount === 0, message: finalMessage };
    }
);

// import { CallableRequest } from 'firebase-functions/v2/https'; // Not strictly needed if we define the type inline

interface UpdateUserWeeklyLineupScoreData {
    userId: string;
    leagueId: string;
    season: number;
    week: number;
}

export const updateUserWeeklyLineupScore = onCall(async (request: CallableRequest<UpdateUserWeeklyLineupScoreData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required.");
    }
  
    const { userId, leagueId, season, week } = request.data;
  
    if (!userId || !leagueId || !season || !week) {
      throw new HttpsError("invalid-argument", "Missing params.");
    }
  
    const userWeeklyLineupDocId = `${userId}_${leagueId}_${season}_${week}`;
    const lineupDocRef = db.collection("users_weekly_lineups").doc(userWeeklyLineupDocId);
  
    try {
      const lineupSnap = await lineupDocRef.get();
      if (!lineupSnap.exists) {
        console.log("Lineup doc not found");
        return { success: false, message: "Lineup not found." };
      }
  
      const lineupData = lineupSnap.data() as FirestoreWeeklyLineup | undefined;
      if (!lineupData || !lineupData.picks) {
        console.log("Lineup data missing");
        return { success: false, message: "Lineup data missing." };
      }
  
      const leagueDocRef = db.collection("leagues").doc(leagueId);
      const leagueSnap = await leagueDocRef.get();
      if (!leagueSnap.exists) {
          console.error("League not found");
          throw new HttpsError("not-found", "League not found.");
      }
      const leagueConfig = leagueSnap.data() as FirestoreLeague | undefined;
      if (!leagueConfig) {
          console.error("League data missing");
          throw new HttpsError("internal", "League data missing.");
      }
  
      let calculatedTotalPoints = 0;
      const pickPromises = [];
  
      for (const positionKeyStr in lineupData.picks) {
        const positionKey = positionKeyStr as LineupPosition;
        const pick = lineupData.picks[positionKey];
  
        if (pick) {
          const promise = (async () => {
            let pointsForPick = 0;
            const gameIdForPick = pick.gameIdForWeek;
  
            if (!gameIdForPick) {
              console.warn("Missing gameIdForWeek");
              return 0;
            }
  
            if (pick.type === "player") {
              const playerGameStatRef = db.collection("players").doc(pick.id).collection("gamestats").doc(gameIdForPick);
              const playerStatSnap = await playerGameStatRef.get();
              if (playerStatSnap.exists) {
                const statData = playerStatSnap.data() as FirestorePlayerGameStat | undefined;
                pointsForPick = statData?.fantasyPoints ?? 0;
                if (leagueConfig.enableCaptainFeature && lineupData.captainPlayerId === pick.id) {
                  pointsForPick *= (leagueConfig.captainPointMultiplier ?? 1);
                }
              }
            } else if (pick.type === "team") {
              const teamGameStatRef = db.collection("teams").doc(pick.id).collection("gamestats").doc(gameIdForPick);
              const teamStatSnap = await teamGameStatRef.get();
              if (teamStatSnap.exists) {
                const statData = teamStatSnap.data() as FirestoreTeamGameStat | undefined;
                switch (positionKey) {
                  case "PassingOffense": pointsForPick = statData?.fantasyPointsPassing ?? 0; break;
                  case "RushingOffense": pointsForPick = statData?.fantasyPointsRushing ?? 0; break;
                  case "Defense": pointsForPick = statData?.fantasyPointsDefense ?? 0; break;
                  case "SpecialTeams": pointsForPick = statData?.fantasyPointsSpecialTeams ?? 0; break;
                  default: 
                    // If positionKey is a PlayerPosition but pick type is team (which shouldn't happen with correct lineup structure)
                    // or if it's an unexpected LineupPosition for a team.
                    logger.warn(`Unexpected team position: ${positionKey} for pick type team.`);
                    pointsForPick = 0;
                }
              }
            }
            return pointsForPick;
          })();
          pickPromises.push(promise);
        }
      }
  
      const allPickPoints = await Promise.all(pickPromises);
      calculatedTotalPoints = allPickPoints.reduce((sum, points) => sum + points, 0);
      calculatedTotalPoints = parseFloat(calculatedTotalPoints.toFixed(2));
  
      await lineupDocRef.update({
        totalActualPoints: calculatedTotalPoints,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
  
      return { success: true, message: "Scores updated." };
  
    } catch (error) {
      logger.error("Error updating scores:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to update scores.", error);
    }
  });

