// src/statsSync.ts
import axios from "axios";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import config, helpers, types
import { statsSyncOptions, secrets, hosts, config } from './config';
import { safeParseFloat, safeParseInt } from './common';
import {
    BoxScoreResponse, BoxScoreBody, GamesForWeekResponse,
    FirestorePlayerGameStat, FirestoreTeamGameStat,
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

        const now = Timestamp.now();
        const gameBatch = db.batch();
        let operationsCount = 0;

        // --- Pre-fetch relevant player positions ---
        if (playerPositionCache.size === 0) { /* ... unchanged caching logic ... */ }

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
                    lastUpdated: now,
                };
                gameBatch.set(gameStatsRef, statsData, { merge: true });
                operationsCount++;
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
            const gameStatsForCalc: TeamGameStatsForCalc = {
                 passingStats: aggPassing, rushingStats: aggRushing,
                 teamDefData: { // Parse raw DST stats
                    ptsAllowed: safeParseInt(defStatsRaw.ptsAllowed), sacks: safeParseFloat(defStatsRaw.sacks),
                    defInt: safeParseInt(defStatsRaw.defensiveInterceptions), fumRec: safeParseInt(defStatsRaw.fumblesRecovered), // Use fumRec from DST for fumble recovery points
                    safeties: safeParseInt(defStatsRaw.safeties), defTD: safeParseInt(defStatsRaw.defTD),
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
                lastUpdated: now,
            };
            gameBatch.set(gameStatsRef, statsData, { merge: true });
            operationsCount++;
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

        try {
            // Fetch Game IDs from API
            const gamesResponse = await axios.request<GamesForWeekResponse>({
                 method: 'GET', url: `https://${hosts.TANK01_NFL_API}/getNFLGamesForWeek`,
                 params: { week: week.toString(), season: season.toString(), seasonType: 'reg' },
                 headers: getTank01Headers(),
            });
            const gamesForWeek = gamesResponse.data?.body;
            if (!Array.isArray(gamesForWeek)) throw new HttpsError('internal', `Failed list week ${week}.`);
            const gameIDs: string[] = gamesForWeek.map(g => g?.gameID).filter((id): id is string => !!id);
            if (gameIDs.length === 0) return { success: true, message: `No games found week ${week}.` };

            logger.info(`Found ${gameIDs.length} games week ${week}. Processing...`);

            // Process each game
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
             if (error instanceof HttpsError) throw error;
             const errorMessage = error instanceof Error ? error.message : String(error);
             logger.error(`Error manualFetchAndProcess week ${week}:`, { error: errorMessage, detail: error });
             throw new HttpsError('internal', `Failed processing week ${week}.`);
        }
    }
);

// Optional: Scheduled function would call fetchAndProcessSingleGameStats for recent games
