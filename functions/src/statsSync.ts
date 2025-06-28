// src/statsSync.ts
import axios from "axios";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import config, helpers, types
import { statsSyncOptions, secrets, hosts, config } from './config';
import { safeParseFloat, safeParseInt, calculateCurrentNFLWeek } from './common';
import {
    BoxScoreResponse, BoxScoreBody, GameInfoForWeek,
    FirestoreWeeklySchedule, FirestorePlayerGameStat, FirestoreTeamGameStat,
    PlayerPosition, TeamGameStatsForCalc // Only need team calc type
} from './types';
// Import TEAM Calculators & Aggregators
import {
    calculatePassingOffensePoints, calculateRushingOffensePoints,
    calculateDefensePoints, calculateSpecialTeamsPoints
} from './pointsCalculator'; // Player calc removed
import {
    aggregatePassingStats, aggregateRushingStats,
    aggregateKickingStats, aggregateSpecialTeamsReturnStats
} from './statsAggregators';

const db = admin.firestore();
const getTank01Headers = () => ({
    "x-rapidapi-key": secrets.TANK01_KEY.value(),
    "x-rapidapi-host": hosts.TANK01_NFL_API,
});
const getCurrentSeason = (): number => parseInt(config.CURRENT_NFL_SEASON, 10) || new Date().getFullYear();

// Cache for player positions during a single function run
const playerPositionCache = new Map<string, PlayerPosition | undefined>();

// Process and store game score data in Firestore (consolidated with game stats)
async function processAndStoreGameScore(gameId: string, week: number, season: number, apiResponse: BoxScoreResponse): Promise<boolean> {
  try {
    const apiBody = apiResponse.body;
    
    // Parse scores - try multiple sources in order of preference
    let homeScore = 0;
    let awayScore = 0;
    let homeTeam = 'Unknown';
    let awayTeam = 'Unknown';

    // First try lineScore (most reliable for completed games)
    if (apiBody.lineScore?.home?.totalPts && apiBody.lineScore?.away?.totalPts) {
      homeScore = parseInt(apiBody.lineScore.home.totalPts, 10) || 0;
      awayScore = parseInt(apiBody.lineScore.away.totalPts, 10) || 0;
      homeTeam = apiBody.lineScore.home.teamAbv || apiBody.home || 'Unknown';
      awayTeam = apiBody.lineScore.away.teamAbv || apiBody.away || 'Unknown';
    } 
    // Fallback to body-level scores
    else if (apiBody.homePts !== undefined && apiBody.awayPts !== undefined) {
      homeScore = typeof apiBody.homePts === 'string' ? parseInt(apiBody.homePts, 10) : (apiBody.homePts || 0);
      awayScore = typeof apiBody.awayPts === 'string' ? parseInt(apiBody.awayPts, 10) : (apiBody.awayPts || 0);
      homeTeam = apiBody.home || apiBody.teamIDHome || 'Unknown';
      awayTeam = apiBody.away || apiBody.teamIDAway || 'Unknown';
    }
    // Final fallback to team IDs if team names not available
    else {
      homeTeam = apiBody.home || apiBody.teamIDHome || 'Unknown';
      awayTeam = apiBody.away || apiBody.teamIDAway || 'Unknown';
    }
    
    // Parse game status code from body
    const gameStatusCode = typeof apiBody.gameStatusCode === 'string' 
      ? parseInt(apiBody.gameStatusCode, 10) 
      : (apiBody.gameStatusCode || 0);

    // Determine game status - prefer lineScore period, then currentPeriod, then gameStatus
    let gameStatus = 'Scheduled';
    if (apiBody.lineScore?.period) {
      gameStatus = apiBody.lineScore.period;
    } else if (apiBody.currentPeriod) {
      gameStatus = apiBody.currentPeriod;
    } else if (apiBody.gameStatus) {
      gameStatus = apiBody.gameStatus;
    } else if (apiBody.period) {
      gameStatus = apiBody.period;
    }

    // Create Firestore document for game scores
    const gameScoreDoc: {
      gameId: string;
      season: number;
      week: number;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      gameStatus: string;
      gameStatusCode: number;
      timeRemaining?: string;
      quarter?: number;
      lastUpdated: admin.firestore.Timestamp;
    } = {
      gameId,
      season,
      week,
      homeTeam,
      awayTeam,
      homeScore: isNaN(homeScore) ? 0 : homeScore,
      awayScore: isNaN(awayScore) ? 0 : awayScore,
      gameStatus,
      gameStatusCode: isNaN(gameStatusCode) ? 0 : gameStatusCode,
      lastUpdated: admin.firestore.Timestamp.now()
    };

    // Only include timeRemaining if we have a valid value
    const gameClock = apiBody.lineScore?.gameClock || apiBody.gameClock;
    if (gameClock && gameClock.trim() !== '') {
      gameScoreDoc.timeRemaining = gameClock;
    }

    // Only include quarter if we have a valid value and game is not final
    const currentPeriod = apiBody.lineScore?.currentPeriod || apiBody.currentPeriod;
    if (currentPeriod && currentPeriod !== 'Final' && !currentPeriod.toLowerCase().includes('final')) {
      // Try to extract quarter number from currentPeriod (e.g., "Q1" -> 1)
      const quarterMatch = currentPeriod.match(/Q(\d+)/);
      if (quarterMatch) {
        gameScoreDoc.quarter = parseInt(quarterMatch[1], 10);
      }
    }

    // Store in gameScores collection
    await db.collection('gameScores').doc(gameId).set(gameScoreDoc);
    
    logger.info(`Successfully stored game score for ${gameId}: ${gameScoreDoc.awayTeam} ${gameScoreDoc.awayScore} - ${gameScoreDoc.homeScore} ${gameScoreDoc.homeTeam} (${gameScoreDoc.gameStatus})`);
    return true;
  } catch (error) {
    logger.error(`Error processing game score for ${gameId}:`, error);
    return false;
  }
}

/**
 * Fetches box score data, stores raw stats, API player points,
 * and CALCULATES & stores team unit points for a SINGLE game.
 */
async function fetchAndProcessSingleGameStats(gameId: string, week: number, season: number): Promise<boolean> {
    logger.info(`Fetching/Processing box score for game: ${gameId}, week: ${week}, season: ${season}`);
    try {
        const response = await axios.request<BoxScoreResponse>({
            method: 'GET',
            url: `https://${hosts.TANK01_NFL_API}/getNFLBoxScore`,
            params: {
              gameID: gameId,
              playByPlay: 'false',
              // --- Pass your custom scoring rules to API ---
              fantasyPoints: 'true', // MUST be true to get calculated player points
              twoPointConversions: '2',
              passYards: '0.04',        // Fractional points per yard
              passAttempts: '0',
              passTD: '6',             // Check: Old params use 4, points.jpg implies 6? Use 6 if image is correct.
              passCompletions: '0',
              passInterceptions: '-2',
              pointsPerReception: '0',   // Set your PPR rule (0=Standard, 0.5=Half, 1=Full)
              carries: '0',
              rushYards: '0.1',         // Fractional points per yard
              rushTD: '6',
              fumbles: '-2',            // Fumble lost penalty
              receivingYards: '0.1',    // Fractional points per yard
              receivingTD: '6',
              targets: '0',
              // Team/Kicker points (used by API for kicker calcs, might not affect player FP directly)
              defTD: '6',
              fgMade: '3',
              fgMissed: '0',
              xpMade: '1',
              xpMissed: '0',
              // IDP params (Set to 0 if not using IDP)
              idpTotalTackles: '0', idpSoloTackles: '0', idpTFL: '0', idpQbHits: '0',
              idpInt: '0', idpSacks: '0', idpPassDeflections: '0', idpFumblesRecovered: '0'
            },
            headers: getTank01Headers(),
        });

        const apiBody: BoxScoreBody | undefined = response.data?.body;
        if (!apiBody?.playerStats || !apiBody?.teamStats || !apiBody?.DST) {
            logger.error(`Invalid body in box score response for game ${gameId}. Skipping.`);
            return false;
        }

        // *** CONSOLIDATED: Process game scores alongside game stats ***
        await processAndStoreGameScore(gameId, week, season, response.data);

        const now = Timestamp.now();
        const gameBatch = db.batch();
        let operationsCount = 0;

        // --- Pre-fetch relevant player positions (if cache empty) ---
        if (playerPositionCache.size === 0) {
            const relevantPlayersSnapshot = await db.collection('players')
                 .where('position', 'in', config.RELEVANT_PLAYER_POSITIONS)
                 .select('position').get();
            relevantPlayersSnapshot.forEach(doc => {
                 const pos = doc.data()?.position as PlayerPosition | undefined;
                 if (pos) playerPositionCache.set(doc.id, pos);
            });
            logger.debug(`Cached positions for ${playerPositionCache.size} relevant players.`);
        }

        // --- Process Player Stats ---
        for (const playerId in apiBody.playerStats) {
            if (Object.prototype.hasOwnProperty.call(apiBody.playerStats, playerId)) {
                const rawStatsFromApi = apiBody.playerStats[playerId];
                const position = playerPositionCache.get(playerId);

                // Filter by relevant position
                if (!position || !rawStatsFromApi) continue;

                // *** Get the API's calculated fantasy points (based on your params) ***
                const fantasyPointsFromApi = safeParseFloat(rawStatsFromApi.fantasyPoints); // Use the main field

                // Optional: Parse the API's default PPR/HalfPPR values if needed elsewhere
                const apiFantasyPointsDefault = {
                    standard: safeParseFloat(rawStatsFromApi.fantasyPointsDefault?.standard),
                    ppr: safeParseFloat(rawStatsFromApi.fantasyPointsDefault?.PPR),
                    halfPpr: safeParseFloat(rawStatsFromApi.fantasyPointsDefault?.halfPPR),
                };

                // Prepare Firestore data - NO custom player calculation needed
                const gameStatsRef = db.collection('players').doc(playerId).collection('gamestats').doc(gameId);
                const statsData: FirestorePlayerGameStat = {
                    gameId: gameId, season: season, week: week,
                    nflTeamId: rawStatsFromApi.teamID,
                    rawBoxScoreStats: rawStatsFromApi, // Store raw
                    fantasyPoints: fantasyPointsFromApi, // *** Store the API's calculated points ***
                    apiFantasyPointsDefault: apiFantasyPointsDefault, // Optional storage
                    // *** Store game status from API body ***
                    gameStatus: apiBody.gameStatus || apiBody.period || apiBody.currentPeriod || 'Scheduled',
                    gameStatusCode: safeParseInt(apiBody.gameStatusCode),
                    lastUpdated: now,
                };
                gameBatch.set(gameStatsRef, statsData, { merge: true });
                operationsCount++;

                // Atomically update season total fantasy points for the player
                const playerRef = db.collection('players').doc(playerId);
                gameBatch.update(playerRef, {
                    seasonFantasyPoints: admin.firestore.FieldValue.increment(fantasyPointsFromApi),
                    // gamesPlayed is managed by dataSync.ts from API stats for players
                });
                operationsCount++; // Increment for the update operation
            }
        }

        // --- Process Team Stats (Calculation needed here) ---
        for (const loc of ['home', 'away'] as const) {
            const teamStatsRaw = apiBody.teamStats[loc];
            const defStatsRaw = apiBody.DST[loc];
            const teamId = teamStatsRaw?.teamID;
            if (!teamId || !defStatsRaw) continue;

            // Aggregate and Prepare Stats for Team Calculation
            const aggPassing = aggregatePassingStats(apiBody.playerStats, teamId);
            const aggRushing = aggregateRushingStats(apiBody.playerStats, teamId);
            const aggKicking = aggregateKickingStats(apiBody.playerStats, teamId);
            const aggReturns = aggregateSpecialTeamsReturnStats(apiBody.playerStats, teamId);

            // parse raw DST fields
            const rawDefTDs      = safeParseInt(defStatsRaw.defTD);
            const totalReturnTDs = aggReturns.totalKickReturnTDs
                                + aggReturns.totalPuntReturnTDs
                                + aggReturns.totalFumbleReturnTDs;

            const gameStatsForCalc: TeamGameStatsForCalc = {
                 passingStats: aggPassing, rushingStats: aggRushing,
                 teamDefData: { // Parse raw DST stats
                    ptsAllowed: safeParseInt(defStatsRaw.ptsAllowed), sacks: safeParseFloat(defStatsRaw.sacks),
                    defInt: safeParseInt(defStatsRaw.defensiveInterceptions), fumRec: safeParseInt(defStatsRaw.fumblesRecovered), // Use fumRec from DST for fumble recovery points
                    safeties: safeParseInt(defStatsRaw.safeties), 
                    // subtract return TDs from total DST.defTD
                    defTD: Math.max(0, rawDefTDs - totalReturnTDs)
                 },
                 specialTeamsStats: { // Use aggregated stats
                    xpMade: aggKicking.totalExtraPointsMade, fgMade: aggKicking.totalFieldGoalsMade,
                    kickReturnTD: aggReturns.totalKickReturnTDs, puntReturnTD: aggReturns.totalPuntReturnTDs,
                    fumbleReturnTD: aggReturns.totalFumbleReturnTDs, xpReturn: 0,
                 },
            };

            // Calculate YOUR fantasy points for each team unit
            const fantasyPointsPassing = calculatePassingOffensePoints(gameStatsForCalc);
            const fantasyPointsRushing = calculateRushingOffensePoints(gameStatsForCalc);
            const fantasyPointsDefense = calculateDefensePoints(gameStatsForCalc);
            const fantasyPointsSpecialTeams = calculateSpecialTeamsPoints(gameStatsForCalc);

            // Prepare Firestore data
            const gameStatsRef = db.collection('teams').doc(teamId).collection('gamestats').doc(gameId);
            const statsData: FirestoreTeamGameStat = {
                gameId: gameId, season: season, week: week,
                rawTeamBoxScoreStats: teamStatsRaw, rawDefBoxScoreStats: defStatsRaw,
                aggregatedStatsForCalc: gameStatsForCalc,
                // Store calculated team points
                fantasyPointsPassing, fantasyPointsRushing, fantasyPointsDefense, fantasyPointsSpecialTeams,
                // *** Store game status from API body ***
                gameStatus: apiBody.gameStatus || apiBody.period || apiBody.currentPeriod || 'Scheduled',
                gameStatusCode: safeParseInt(apiBody.gameStatusCode),
                lastUpdated: now,
            };
            gameBatch.set(gameStatsRef, statsData, { merge: true });
            operationsCount++;

            // Atomically update season total fantasy points and games played for the team
            const teamRef = db.collection('teams').doc(teamId);
            gameBatch.update(teamRef, {
                seasonFP_Passing: admin.firestore.FieldValue.increment(fantasyPointsPassing),
                seasonFP_Rushing: admin.firestore.FieldValue.increment(fantasyPointsRushing),
                seasonFP_Defense: admin.firestore.FieldValue.increment(fantasyPointsDefense),
                seasonFP_ST: admin.firestore.FieldValue.increment(fantasyPointsSpecialTeams),
                // gamesPlayed: admin.firestore.FieldValue.increment(1) // Removed: gamesPlayed for teams is now managed by dataSync.ts from season record
            });
            operationsCount++; // Increment for the update operation
        }

        // Commit batch
        if (operationsCount > 0) {
            await gameBatch.commit();
            logger.info(`Processed stats & points for game ${gameId} (${operationsCount} docs).`);
            return true;
        } else {
            logger.info(`No relevant stats operations for game ${gameId}.`);
            return true;
        }

    } catch (error: unknown) {
        const axiosError = error as import("axios").AxiosError;
        logger.error(`Error fetching/processing box score for game ${gameId}:`, { status: axiosError?.response?.status, msg: axiosError?.message, data: axiosError?.response?.data });
        return false;
    }
}


/**
 * Manually triggerable function to fetch game schedule, then fetch box scores,
 * store raw stats & API player points, calculate & store team points for a specific week.
 */
export const manualFetchAndProcessGameStatsForWeek = onCall(
    { ...statsSyncOptions },
    async (request) => {
        if (request.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admin only.');
        const week = request.data.week;
        const season = getCurrentSeason();
        if (typeof week !== 'number' || week < 1 || week > config.MAX_NFL_WEEKS) {
             throw new HttpsError('invalid-argument', `Valid week required.`);
        }

        logger.info(`Admin ${request.auth?.uid} triggering FULL stats fetch & calc week ${week}, season ${season}...`);
        playerPositionCache.clear(); // Clear position cache for each manual run

        let gameIDs: string[] = [];

        try {
            // --- *** Fetch Game IDs from Firestore *** ---
            const scheduleDocId = `${season}_week_${week}`;
            const scheduleDocRef = db.collection('nfl_schedules').doc(scheduleDocId);
            logger.info(`Fetching schedule document from Firestore: ${scheduleDocRef.path}`);
            const scheduleDoc = await scheduleDocRef.get();

            if (!scheduleDoc.exists) {
                logger.error(`Schedule document not found in Firestore for ${scheduleDocId}. Run schedule fetch first?`);
                throw new HttpsError('not-found', `Schedule data not found for week ${week}, season ${season}. Please fetch the schedule first.`);
            }

            const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule | undefined;
            const gamesFromFirestore: GameInfoForWeek[] | undefined = scheduleData?.games;

            if (!Array.isArray(gamesFromFirestore) || gamesFromFirestore.length === 0) {
                 logger.warn(`No games found in Firestore schedule document ${scheduleDocId}.`);
                 return { success: true, message: `No games listed in Firestore schedule for week ${week}, season ${season}.` };
            }

            // Extract valid game IDs
            gameIDs = gamesFromFirestore
                .map(g => g?.gameID)
                .filter((id): id is string => typeof id === 'string' && id.length > 0);

            if (gameIDs.length === 0) {
                 logger.warn(`Extracted 0 valid game IDs from Firestore schedule ${scheduleDocId}.`);
                 return { success: true, message: `No valid game IDs found in Firestore schedule for week ${week}, season ${season}.` };
            }
            // --- *** End of Firestore Fetch *** ---

            logger.info(`Found ${gameIDs.length} games in Firestore schedule for week ${week}. Processing...`);

            // Process each game found in the Firestore schedule
            let successCount = 0; let failureCount = 0;
            for (const gameId of gameIDs) {
                // Use the integrated fetch & process helper
                const success = await fetchAndProcessSingleGameStats(gameId, week, season);
                if (success) successCount++; else failureCount++;
                 // Optional delay: await new Promise(resolve => setTimeout(resolve, 250));
            }

            // Return summary
            const summaryMessage = `Stats fetch & team point calculation completed week ${week}, season ${season}. Success: ${successCount}, Failures: ${failureCount}.`;
            logger.info(summaryMessage);
            return { success: failureCount === 0, message: summaryMessage };

        } catch (error: unknown) {
             // Catch errors from Firestore fetch or the processing loop
             if (error instanceof HttpsError) throw error; // Re-throw specific errors
             const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error(`Error manualFetchAndProcess week ${week}:`, { error: errorMessage, detail: error });
             throw new HttpsError('internal', `Failed processing week ${week}. Check logs.`);
        }
    }
);

// Optional: Scheduled function would call fetchAndProcessSingleGameStats for recent games

// Scheduled function to auto-sync both game stats and game scores during game days
// Run every 5 minutes during typical NFL game times (Thursday, Sunday, Monday)
export const scheduledGameStatsAndScoresSync = onSchedule(
  {
    ...statsSyncOptions,
    schedule: '*/5 * * * *', // Every 5 minutes
    timeZone: 'America/New_York', // NFL timezone
  },
  async () => {
    try {
      logger.info('Starting scheduled game stats and scores sync...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = getCurrentSeason();
      
      logger.info(`Auto-syncing game stats and scores for current week ${currentWeek}, season ${currentSeason}`);
      
      // Get the weekly schedule to find all games for this week
      const scheduleDocId = `${currentSeason}_week_${currentWeek}`;
      const scheduleDocRef = db.collection('nfl_schedules').doc(scheduleDocId);
      const scheduleDoc = await scheduleDocRef.get();
      
      if (!scheduleDoc.exists) {
        logger.warn(`No schedule found for week ${currentWeek}, season ${currentSeason}. Skipping scheduled sync.`);
        return;
      }

      const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule | undefined;
      const games = scheduleData?.games || [];
      
      if (games.length === 0) {
        logger.warn(`No games found in schedule for week ${currentWeek}. Skipping scheduled sync.`);
        return;
      }

      logger.info(`Found ${games.length} games to process for week ${currentWeek}`);

      // Process each game (this will update both game stats and game scores)
      let successCount = 0;
      let failureCount = 0;
      
      for (const game of games) {
        if (game.gameID) {
          try {
            const success = await fetchAndProcessSingleGameStats(game.gameID, currentWeek, currentSeason);
            if (success) {
              successCount++;
            } else {
              failureCount++;
            }
          } catch (error) {
            logger.error(`Error processing game ${game.gameID}:`, error);
            failureCount++;
          }
        }
      }

      logger.info(`Scheduled sync completed for week ${currentWeek}: ${successCount} successful, ${failureCount} failed`);
    } catch (error) {
      logger.error('Error in scheduled game stats and scores sync:', error);
    }
  }
);