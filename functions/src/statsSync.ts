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
    PlayerStatsForCalc, PlayerPosition, TeamGameStatsForCalc
} from './types';
// Import Calculators & Aggregators
import {
    calculatePlayerFantasyPoints, calculatePassingOffensePoints, calculateRushingOffensePoints,
    calculateDefensePoints, calculateSpecialTeamsPoints
} from './pointsCalculator';
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
 * Fetches, CALCULATES points, and stores box score data for a SINGLE game.
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
                fantasyPoints: 'true',
                twoPointConversions: '2',
                passYards: '.04',
                passAttempts: '0',
                passTD: '6',
                passCompletions: '0',
                passInterceptions: '-2',
                pointsPerReception: '0', // Assuming PPR
                carries: '0',
                rushYards: '.1',
                rushTD: '6',
                fumbles: '-2',
                receivingYards: '.1',
                receivingTD: '6',
                targets: '0',
                defTD: '6',
                fgMade: '3',
                fgMissed: '0',
                xpMade: '1',
                xpMissed: '0',
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
                const position = playerPositionCache.get(playerId); // Use cached position

                // Filter by relevant position
                if (!position || !rawStatsFromApi) continue;

                // Parse API's fantasy points
                const apiFPData = rawStatsFromApi.fantasyPointsDefault;
                const apiFantasyPoints = {
                    standard: safeParseFloat(apiFPData?.standard),
                    ppr: safeParseFloat(apiFPData?.PPR),
                    halfPpr: safeParseFloat(apiFPData?.halfPPR),
                };

                // Prepare stats structure for YOUR calculator
                const statsForCalc: PlayerStatsForCalc = {
                    Passing: rawStatsFromApi.Passing ? {
                        passYds: safeParseFloat(rawStatsFromApi.Passing.passYds),
                        passTD: safeParseInt(rawStatsFromApi.Passing.passTD),
                        twoPtPass: safeParseInt(rawStatsFromApi.Passing.twoPtPass), // Check if exists
                        int: safeParseInt(rawStatsFromApi.Passing.int),
                    } : undefined,
                    Rushing: rawStatsFromApi.Rushing ? {
                        rushYds: safeParseFloat(rawStatsFromApi.Rushing.rushYds),
                        rushTD: safeParseInt(rawStatsFromApi.Rushing.rushTD),
                        twoPtRush: safeParseInt(rawStatsFromApi.Rushing.twoPtRush), // Check if exists
                    } : undefined,
                    Receiving: rawStatsFromApi.Receiving ? {
                        recYds: safeParseFloat(rawStatsFromApi.Receiving.recYds),
                        recTD: safeParseInt(rawStatsFromApi.Receiving.recTD),
                        twoPtRec: safeParseInt(rawStatsFromApi.Receiving.twoPtRec), // Check if exists
                    } : undefined,
                    // Check both Defense and Fumbles category for fumblesLost
                    Defense: rawStatsFromApi.Defense ? { fumLost: safeParseInt(rawStatsFromApi.Defense.fumblesLost) } : undefined
                };

                // Calculate YOUR fantasy points
                const fantasyPoints = calculatePlayerFantasyPoints(statsForCalc, position);

                // Prepare Firestore data
                const gameStatsRef = db.collection('players').doc(playerId).collection('gamestats').doc(gameId);
                const statsData: FirestorePlayerGameStat = {
                    gameId: gameId, season: season, week: week,
                    nflTeamId: rawStatsFromApi.teamID,
                    rawBoxScoreStats: rawStatsFromApi, // Store raw
                    apiFantasyPoints: apiFantasyPoints,
                    fantasyPoints: fantasyPoints, // Store calculated points
                    lastUpdated: now,
                };
                gameBatch.set(gameStatsRef, statsData, { merge: true });
                operationsCount++;
            }
        }

        // --- Process Team Stats ---
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
                    defensiveInterceptions: safeParseInt(defStatsRaw.defensiveInterceptions), fumblesRecovered: safeParseInt(defStatsRaw.fumblesRecovered),
                    safeties: safeParseInt(defStatsRaw.safeties), defTD: safeParseInt(defStatsRaw.defTD),
                 },
                 specialTeamsStats: { // Use aggregated stats
                    xpMade: aggKicking.totalExtraPointsMade, fgMade: aggKicking.totalFieldGoalsMade,
                    kickReturnTD: aggReturns.totalKickReturnTDs, puntReturnTD: aggReturns.totalPuntReturnTDs, xpReturn: 0,
                 },
            };

            // Calculate YOUR fantasy points for each unit
            const fantasyPointsPassing = calculatePassingOffensePoints(gameStatsForCalc);
            const fantasyPointsRushing = calculateRushingOffensePoints(gameStatsForCalc);
            const fantasyPointsDefense = calculateDefensePoints(gameStatsForCalc);
            const fantasyPointsSpecialTeams = calculateSpecialTeamsPoints(gameStatsForCalc);

            // Prepare Firestore data
            const gameStatsRef = db.collection('teams').doc(teamId).collection('gamestats').doc(gameId);
            const statsData: FirestoreTeamGameStat = {
                gameId: gameId, season: season, week: week,
                rawTeamBoxScoreStats: teamStatsRaw, rawDefBoxScoreStats: defStatsRaw,
                aggregatedStatsForCalc: gameStatsForCalc, // Store inputs for debugging
                // Store calculated points
                fantasyPointsPassing, fantasyPointsRushing, fantasyPointsDefense, fantasyPointsSpecialTeams,
                lastUpdated: now,
            };
            gameBatch.set(gameStatsRef, statsData, { merge: true });
            operationsCount++;
        }

        // Commit batch
        if (operationsCount > 0) {
            await gameBatch.commit();
            logger.info(`Processed and stored stats/points for game ${gameId} (${operationsCount} docs).`);
            return true;
        } else {
            logger.info(`No relevant stats operations for game ${gameId}.`);
            return true;
        }

    } catch (error: unknown) {
        const axiosError = error as import("axios").AxiosError;
        logger.error(`Error fetching/processing box score for game ${gameId}:`, { status: axiosError?.response?.status, msg: axiosError?.message });
        return false;
    }
}

/**
 * Manually triggerable function to fetch game schedule, then fetch box scores,
 * calculate points, and store everything for a specific week.
 */
export const manualFetchAndProcessGameStatsForWeek = onCall(
    { ...statsSyncOptions }, // Use appropriate options
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

            logger.info(`Found ${gameIDs.length} games week ${week}. Fetching/Calculating stats...`);

            // Process each game sequentially for safety/rate limits
            let successCount = 0; let failureCount = 0;
            for (const gameId of gameIDs) {
                // Use the integrated fetch & process helper
                const success = await fetchAndProcessSingleGameStats(gameId, week, season);
                if (success) successCount++; else failureCount++;
                 // Optional delay
                 // await new Promise(resolve => setTimeout(resolve, 250)); // e.g., 250ms delay
            }

            // Return summary
            const summaryMessage = `Stats fetch & calculation completed week ${week}, season ${season}. Success: ${successCount}, Failures: ${failureCount}.`;
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

// --- Optional: Scheduled function to automatically process recent games ---
// import { onSchedule } from "firebase-functions/v2/scheduler";
// import { ScoresOnlyResponse, ScoreOnlyGameData } from './types';
// export const scheduledProcessRecentGameStats = onSchedule(
//   { schedule: 'every 30 minutes', /* ... other options ... */ },
//   async () => { /* ... fetch scores, filter for active/completed, call fetchAndProcessSingleGameStats ... */ }
// );

