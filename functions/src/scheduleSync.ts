// src/scheduleSync.ts
import axios from "axios";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import config, helpers, types
import { scheduleSyncOptions, secrets, hosts, config } from './config';
import { calculateCurrentNFLWeek } from './common';
import { GamesForWeekResponse, GameInfoForWeek, FirestoreWeeklySchedule } from './types'; // Import Firestore type too

const db = admin.firestore();
const getTank01Headers = () => ({
    "x-rapidapi-key": secrets.TANK01_KEY.value(),
    "x-rapidapi-host": hosts.TANK01_NFL_API,
});

/**
 * Fetches the NFL game schedule for a specific week from the API.
 */
async function fetchNFLWeeklyGamesFromAPI(week: number, season: number): Promise<GameInfoForWeek[]> {
    logger.info(`Fetching NFL schedule from API for week ${week}, season ${season}...`);
    try {
        const response = await axios.request<GamesForWeekResponse>({
            method: 'GET', url: `https://${hosts.TANK01_NFL_API}/getNFLGamesForWeek`,
            params: { week: week.toString(), season: season.toString(), seasonType: 'reg' }, // Use correct season
            headers: getTank01Headers(),
        });
        if (!Array.isArray(response.data?.body)) {
            logger.error("Invalid response format from /getNFLGamesForWeek:", response.data);
            throw new Error('Invalid response format from /getNFLGamesForWeek');
        }
        // Filter out games without a valid gameID
        const validGames = response.data.body.filter(g => typeof g?.gameID === 'string' && g.gameID.length > 0);
        logger.info(`Fetched ${validGames.length} valid games from API for week ${week}.`);
        return validGames;
    } catch (error) {
        const axiosError = error as import("axios").AxiosError;
        logger.error(`Error fetching weekly NFL games API for week ${week}:`, { status: axiosError?.response?.status, msg: axiosError?.message });
        throw new Error(`Failed to fetch NFL games for week ${week}`);
    }
}

/**
 * Stores the weekly games schedule in Firestore.
 */
async function storeWeeklyGamesInFirestore(games: GameInfoForWeek[], week: number, season: number): Promise<void> {
    if (games.length === 0) {
        logger.warn(`No games to store for week ${week}, season ${season}.`);
        return;
    }
    // Use a more structured document ID including the season
    const weekDocRef = db.collection('nfl_schedules').doc(`${season}_week_${week}`);
    logger.info(`Storing schedule for ${games.length} games in Firestore at: ${weekDocRef.path}`);
    try {
        const dataToStore: FirestoreWeeklySchedule = {
             season, week, games, lastUpdated: Timestamp.now()
        };
        // Overwrite the document with the latest schedule for the week
        await weekDocRef.set(dataToStore);
        logger.info(`Stored schedule for week ${week}, season ${season} successfully.`);
        
        // After storing schedule, automatically create tips polls for leagues with tipping enabled
        await createTipsPollsForAllLeagues(week, season, games);
    } catch (error) {
        logger.error(`Error storing games for week ${week}, season ${season}:`, error);
        throw error; // Re-throw to indicate failure
    }
}

/**
 * Automatically create tips polls for all leagues that have weekly tipping enabled
 */
async function createTipsPollsForAllLeagues(week: number, season: number, games: GameInfoForWeek[]): Promise<void> {
    try {
        logger.info(`Creating tips polls for week ${week}, season ${season}...`);
        
        // Get all leagues that have weekly tipping enabled
        const leaguesSnapshot = await db.collection('leagues')
            .where('enableWeeklyTips', '==', true)
            .get();
        
        if (leaguesSnapshot.empty) {
            logger.info('No leagues have weekly tipping enabled, skipping tips poll creation');
            return;
        }
        
        logger.info(`Found ${leaguesSnapshot.size} leagues with tipping enabled`);
        
        // Calculate lock time - 30 minutes before first game
        const firstGameTime = Math.min(...games.map(game => 
            game.gameTime_epoch ? parseInt(String(game.gameTime_epoch)) * 1000 : Date.now()
        ));
        const lockTime = Timestamp.fromMillis(firstGameTime - (30 * 60 * 1000));
        
        const batch = db.batch();
        let createdCount = 0;
        
        for (const leagueDoc of leaguesSnapshot.docs) {
            const leagueId = leagueDoc.id;
            const tipsPollId = `${leagueId}_week_${week}_season_${season}`;
            
            // Check if tips poll already exists
            const existingPoll = await db.collection('weeklyTips').doc(tipsPollId).get();
            if (existingPoll.exists) {
                logger.info(`Tips poll already exists for league ${leagueId}, week ${week}`);
                continue;
            }
            
            // Create basic tippable games (we'll update odds separately)
            const tippableGames = games.map(game => ({
                gameId: game.gameID,
                homeTeam: game.home || 'HOME',
                awayTeam: game.away || 'AWAY', 
                gameTime: game.gameTime_epoch ? parseInt(String(game.gameTime_epoch)) * 1000 : Date.now(),
                homeWinProbability: 50, // Default 50/50, will be updated by daily odds sync
                awayWinProbability: 50,
                spread: 0, // Default, will be updated by daily odds sync
                total: 45, // Default, will be updated by daily odds sync
                gameDate: game.gameDate || new Date().toISOString().split('T')[0]
            }));
            
            const tipsPoll = {
                leagueId,
                season,
                week,
                games: tippableGames,
                isLocked: false,
                lockTime,
                createdAt: Timestamp.now(),
                lastUpdated: Timestamp.now()
            };
            
            batch.set(db.collection('weeklyTips').doc(tipsPollId), tipsPoll);
            createdCount++;
        }
        
        if (createdCount > 0) {
            await batch.commit();
            logger.info(`Successfully created ${createdCount} tips polls for week ${week}`);
        } else {
            logger.info('No new tips polls needed to be created');
        }
        
    } catch (error) {
        logger.error(`Error creating tips polls for week ${week}:`, error);
        // Don't throw - we don't want schedule storage to fail if tips creation fails
    }
}

/**
 * Scheduled function to fetch and store the schedule for the *next* week.
 * Runs early in the week (e.g., Tuesday) to ensure schedule is ready.
 */
export const scheduledFetchWeeklySchedule = onSchedule(
  // Run every Tuesday at 3 AM Europe/Berlin time
  { schedule: '0 3 * * 2', timeZone: 'Europe/Berlin', ...scheduleSyncOptions },
  async () => {
    // Calculate the week *starting* the next day (Wednesday)
    const nextWeek = calculateCurrentNFLWeek() + 1;
    const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);

    // Don't run if we're past the max weeks or before week 1
    if (nextWeek > config.MAX_NFL_WEEKS || nextWeek < 1) {
        logger.info(`Skipping scheduled schedule fetch for calculated week ${nextWeek}. Outside valid range (1-${config.MAX_NFL_WEEKS}).`);
        return;
    }

    logger.info(`Running scheduled schedule fetch for week ${nextWeek}, season ${currentSeason}...`);
    try {
        const games = await fetchNFLWeeklyGamesFromAPI(nextWeek, currentSeason);
        await storeWeeklyGamesInFirestore(games, nextWeek, currentSeason);
        logger.info(`Successfully fetched and stored schedule for week ${nextWeek}.`);
    } catch (error) {
        logger.error('Scheduled weekly schedule fetch failed:', error);
        // Consider adding alerting or retry logic here for production
    }
  }
);

/**
 * Manually triggerable function to fetch and store schedule for a specific week.
 */
export const manualFetchWeeklySchedule = onCall(
    { ...scheduleSyncOptions }, // Use specific options, including secrets
    async (request) => {
    // 1. Authentication/Authorization
    if (request.auth?.token?.admin !== true) {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    // 2. Input Validation
    const week = request.data.week;
    // Allow optional season override, default to config
    const season = request.data.season ?? parseInt(config.CURRENT_NFL_SEASON, 10);

    if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
         throw new HttpsError('invalid-argument', `Valid week number (1-${config.MAX_NFL_WEEKS}) required.`);
    }
     if (typeof season !== 'number' || season < 2000) { // Basic sanity check for season
         throw new HttpsError('invalid-argument', 'Valid season year required.');
    }

    logger.info(`Admin ${request.auth?.uid} triggering schedule fetch week ${week}, season ${season}...`);

    // 3. Core Logic
    try {
        const games = await fetchNFLWeeklyGamesFromAPI(week, season);
        await storeWeeklyGamesInFirestore(games, week, season);
        // 4. Response
        return { success: true, message: `Successfully fetched and stored schedule for week ${week}, season ${season}` };
    } catch (error: unknown) {
        // 5. Error Handling
        if (error instanceof HttpsError) throw error; // Re-throw specific errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error manualFetchWeeklySchedule week ${week}:`, { error: errorMessage });
        throw new HttpsError('internal', `Failed to fetch/store schedule week ${week}. Check logs.`);
    }
});

/**
 * Updates game statuses in the schedule collection for live games.
 * This provides fast access to current game states without querying individual game stats.
 */
async function updateGameStatusesInSchedule(week: number, season: number): Promise<void> {
    logger.info(`Updating game statuses in schedule for week ${week}, season ${season}...`);
    
    try {
        // Fetch current schedule from Firestore
        const scheduleDocRef = db.collection('nfl_schedules').doc(`${season}_week_${week}`);
        const scheduleDoc = await scheduleDocRef.get();
        
        if (!scheduleDoc.exists) {
            logger.warn(`No schedule document found for week ${week}, season ${season}. Skipping status update.`);
            return;
        }
        
        const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
        const games = scheduleData.games;
        
        if (!Array.isArray(games) || games.length === 0) {
            logger.warn(`No games found in schedule for week ${week}, season ${season}.`);
            return;
        }
        
        // Update each game's status via API
        const updatedGames = await Promise.all(
            games.map(async (game) => {
                try {
                    // Fetch current game status from Tank01 API
                    const response = await axios.request({
                        method: 'GET',
                        url: `https://${hosts.TANK01_NFL_API}/getNFLBoxScore`,
                        params: {
                            gameID: game.gameID,
                            playByPlay: 'false', // We only need status, not full stats
                            fantasyPoints: 'false' // Speed up the request
                        },
                        headers: getTank01Headers(),
                    });
                    
                    const apiBody = response.data?.body;
                    if (apiBody?.gameStatus && apiBody?.gameStatusCode) {
                        // Update the game with fresh status
                        return {
                            ...game,
                            gameStatus: apiBody.gameStatus,
                            gameStatusCode: apiBody.gameStatusCode
                        };
                    }
                } catch (error) {
                    logger.warn(`Failed to update status for game ${game.gameID}:`, error);
                }
                
                // Return original game if update failed
                return game;
            })
        );
        
        // Update the schedule document with fresh statuses
        const updatedScheduleData: FirestoreWeeklySchedule = {
            ...scheduleData,
            games: updatedGames,
            lastUpdated: Timestamp.now()
        };
        
        await scheduleDocRef.set(updatedScheduleData);
        logger.info(`Successfully updated game statuses for ${updatedGames.length} games in week ${week}.`);
        
    } catch (error) {
        logger.error(`Error updating game statuses for week ${week}, season ${season}:`, error);
        throw error;
    }
}

/**
 * Checks if there are any live games in the current week that need status updates.
 * Returns true if we should proceed with status updates.
 */
async function shouldUpdateGameStatuses(week: number, season: number): Promise<boolean> {
    try {
        // First check our schedule to see if any games should be live based on time
        const scheduleDocRef = db.collection('nfl_schedules').doc(`${season}_week_${week}`);
        const scheduleDoc = await scheduleDocRef.get();
        
        if (!scheduleDoc.exists) {
            logger.info(`No schedule found for week ${week}, skipping status update.`);
            return false;
        }
        
        const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
        const games = scheduleData.games;
        
        if (!Array.isArray(games) || games.length === 0) {
            return false;
        }
        
        const now = Date.now() / 1000; // Current time in seconds
        
        // Check if any game should be in progress or recently finished (within 6 hours)
        const gamesNeedingUpdate = games.filter(game => {
            const gameTime = typeof game.gameTime_epoch === 'string' 
                ? parseInt(game.gameTime_epoch, 10) 
                : game.gameTime_epoch;
            
            if (typeof gameTime !== 'number' || isNaN(gameTime)) return false;
            
            // Game window: 30 minutes before start to 4 hours after start
            const gameStart = gameTime;
            const gameEnd = gameStart + (4 * 60 * 60); // 4 hours after start
            const preGameBuffer = gameStart - (30 * 60); // 30 minutes before start
            
            // Update if game is in the active window or if status might be stale
            return now >= preGameBuffer && now <= gameEnd;
        });
        
        const shouldUpdate = gamesNeedingUpdate.length > 0;
        logger.info(`Found ${gamesNeedingUpdate.length} games needing status updates for week ${week}`);
        
        return shouldUpdate;
        
    } catch (error) {
        logger.error(`Error checking if game status updates needed:`, error);
        return false; // Don't update on error
    }
}

/**
 * Scheduled function to update game statuses when games might be live.
 * Runs every 15 minutes but only makes API calls when games are actually happening.
 */
export const scheduledUpdateGameStatuses = onSchedule(
    // Run every 15 minutes every day during NFL season
    { schedule: '*/15 * * * *', timeZone: 'America/New_York', ...scheduleSyncOptions },
    async () => {
        const currentWeek = calculateCurrentNFLWeek();
        const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
        
        if (currentWeek < 1 || currentWeek > config.MAX_NFL_WEEKS) {
            logger.info(`Skipping game status update for week ${currentWeek}. Outside valid range.`);
            return;
        }
        
        // Smart check: only proceed if games might be live
        const shouldUpdate = await shouldUpdateGameStatuses(currentWeek, currentSeason);
        if (!shouldUpdate) {
            logger.info(`No games need status updates for week ${currentWeek}, skipping.`);
            return;
        }
        
        try {
            await updateGameStatusesInSchedule(currentWeek, currentSeason);
        } catch (error) {
            logger.error('Scheduled game status update failed:', error);
        }
    }
);

/**
 * Manual function to update game statuses (for testing/admin use).
 */
export const manualUpdateGameStatuses = onCall(
    { ...scheduleSyncOptions },
    async (request) => {
        if (request.auth?.token?.admin !== true) {
            throw new HttpsError('permission-denied', 'Admin privileges required.');
        }
        
        const week = request.data.week;
        const season = request.data.season ?? parseInt(config.CURRENT_NFL_SEASON, 10);
        
        if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
            throw new HttpsError('invalid-argument', `Valid week number required.`);
        }
        
        try {
            await updateGameStatusesInSchedule(week, season);
            return { success: true, message: `Successfully updated game statuses for week ${week}.` };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error updating game statuses for week ${week}:`, errorMessage);
            throw new HttpsError('internal', `Failed to update game statuses for week ${week}.`);
        }
    }
);

/**
 * Alternative approach: Check Tank01 API for live games in current week.
 * This could be more accurate than time-based detection.
 * Currently commented out - uncomment when switching to API-based detection.
 */
/*
async function hasLiveGamesFromAPI(week: number, season: number): Promise<boolean> {
    try {
        // Use Tank01's getNFLGamesForWeek to get current status of all games
        const response = await axios.request({
            method: 'GET',
            url: `https://${hosts.TANK01_NFL_API}/getNFLGamesForWeek`,
            params: { 
                week: week.toString(), 
                season: season.toString(), 
                seasonType: 'reg' 
            },
            headers: getTank01Headers(),
        });
        
        const games = response.data?.body;
        if (!Array.isArray(games)) {
            return false;
        }
        
        // Check if any games have live status codes (1 = live)
        const liveGames = games.filter(game => {
            const statusCode = game.gameStatusCode;
            return statusCode === '1' || statusCode === 1; // Live games
        });
        
        logger.info(`Found ${liveGames.length} live games from Tank01 API for week ${week}`);
        return liveGames.length > 0;
        
    } catch (error) {
        logger.warn(`Error checking live games from Tank01 API:`, error);
        return false; // Fallback to false on API error
    }
}
*/

// TODO: Alternative scheduled function using Tank01 live detection
// Uncomment the function above and this one, then comment the time-based one to use API-based detection
//
// export const scheduledUpdateGameStatusesAPI = onSchedule(
//     // Run every 10 minutes every day
//     { schedule: '*/10 * * * *', timeZone: 'America/New_York', ...scheduleSyncOptions },
//     async () => {
//         const currentWeek = calculateCurrentNFLWeek();
//         const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
//         
//         if (currentWeek < 1 || currentWeek > config.MAX_NFL_WEEKS) {
//             return;
//         }
//         
//         // API-based check: only proceed if Tank01 reports live games
//         const hasLiveGames = await hasLiveGamesFromAPI(currentWeek, currentSeason);
//         if (!hasLiveGames) {
//             logger.info(`No live games reported by Tank01 API for week ${currentWeek}, skipping.`);
//             return;
//         }
//         
//         try {
//             await updateGameStatusesInSchedule(currentWeek, currentSeason);
//         } catch (error) {
//             logger.error('API-based game status update failed:', error);
//         }
//     }
// );
