// src/dataSync.ts
import axios from "axios";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import shared config/secrets
import { dataSyncOptions, secrets, hosts, config } from './config';
// Import common helpers
import { calculateCurrentNFLWeek, removeUndefinedFields, safeParseFloat, safeParseInt } from './common';

const db = admin.firestore();

// --- Interfaces for API Data (Refined, avoiding 'any') ---

interface Tank01ApiInjury {
    injReturnDate?: string; description?: string; injDate?: string; designation?: string;
}

// Use Record<string, unknown> for nested stats objects for flexibility
interface Tank01ApiPlayerStats {
    gamesPlayed?: string;
    Defense?: Record<string, unknown>;
    Rushing?: Record<string, unknown>;
    Passing?: Record<string, unknown>;
    Receiving?: Record<string, unknown>;
    fantasyPointsDefault?: { standard?: string; PPR?: string; halfPPR?: string; };
}

interface Tank01ApiPlayer {
    playerID: string; espnID?: string; espnName?: string; longName: string;
    firstName?: string; lastName?: string; pos: string; teamID: string;
    team: string; // Abbreviation
    jerseyNum?: string;
    injury?: Tank01ApiInjury | string; // API might return object or string
    espnHeadshot?: string; weight?: string; age?: string; espnLink?: string;
    bDay?: string; isFreeAgent?: string; // 'True' or 'False'
    school?: string; height?: string;
    lastGamePlayed?: string; exp?: string;
    stats?: Tank01ApiPlayerStats; // Nested stats object
}

interface Tank01ApiGameSchedule {
    gameWeek: string; seasonType: string; home: string; away: string;
}

interface Tank01ApiTeam {
    teamID: string; teamAbv: string; teamCity?: string; teamName?: string; // Made optional
    conferenceAbv?: string; division?: string; espnLogo1?: string;
    byeWeeks?: { [season: string]: string[] };
    teamSchedule?: { [gameId: string]: Tank01ApiGameSchedule };
    teamStats?: Record<string, unknown>; // Raw team stats object
    wins?: string | number; loss?: string | number; tie?: string | number; // Optional
}

// Define more specific response types
interface Tank01ApiRosterResponse { body: { roster: Tank01ApiPlayer[] }; } // Sample shows array
interface Tank01ApiTeamsResponse { body: Tank01ApiTeam[]; }

// --- Axios Helper ---
const getTank01Headers = () => ({
    "x-rapidapi-key": secrets.TANK01_KEY.value(),
    "x-rapidapi-host": hosts.TANK01_NFL_API,
});

// --- Fetch Roster Helper ---
async function fetchTeamRosterFromApi(teamId: string, teamAbv: string): Promise<Tank01ApiPlayer[]> {
    try {
        const response = await axios.request<Tank01ApiRosterResponse>({
            method: 'GET', url: `https://${hosts.TANK01_NFL_API}/getNFLTeamRoster`,
            params: {
                teamID: teamId, teamAbv: teamAbv,
                getStats: 'true', // Request player season stats
                fantasyPoints: 'true' // Request API default fantasy points
            },
            headers: getTank01Headers(),
        });
        if (!response.data?.body?.roster || !Array.isArray(response.data.body.roster)) {
            logger.warn(`Roster data missing/not array for ${teamAbv}`); return [];
        }
        return response.data.body.roster;
    } catch (error: unknown) {
        const axiosError = error as import("axios").AxiosError;
        logger.error(`Error fetching roster ${teamAbv}:`, { status: axiosError.response?.status, msg: axiosError.message });
        return [];
    }
}

// --- Extract Player Data Helper (Stores Raw Stats Object, Parses API FP) ---
const extractPlayerData = (
    player: Tank01ApiPlayer,
    nextOpponent: string,
    nextGameId: string | null,
    byeWeek: number | null,
    now: Timestamp
): Record<string, unknown> | null => { // Return type avoids 'any'
    // Filter for relevant positions defined in config
    if (!config.RELEVANT_PLAYER_POSITIONS.includes(player.pos)) {
        return null;
    }
    const nameParts = player.longName.split(' ');
    const firstName = player.firstName ?? nameParts[0] ?? player.longName;
    const lastName = player.lastName ?? (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

    // Extract nested stats object from API response
    const seasonStatsApi = player.stats;

    // --- API's Default Fantasy Points (Parsed Safely) ---
    const apiSeasonFantasyPoints = {
        standard: safeParseFloat(seasonStatsApi?.fantasyPointsDefault?.standard),
        ppr: safeParseFloat(seasonStatsApi?.fantasyPointsDefault?.PPR),
        halfPpr: safeParseFloat(seasonStatsApi?.fantasyPointsDefault?.halfPPR),
    };

    // --- Build Final Player Document Data ---
    const playerData: Record<string, unknown> = {
        playerId: player.playerID,
        fullName: player.longName, firstName, lastName,
        position: player.pos as 'QB' | 'RB' | 'WR' | 'TE', // Already filtered
        nflTeamId: player.teamID, nflTeamAbbreviation: player.team,
        jerseyNumber: player.jerseyNum ?? null,
        injuryData: player.injury ?? null,
        headshotUrl: player.espnHeadshot ?? null,
        isActive: true, // Assume active when processing from roster
        lastUpdated: now, byeWeek, nextOpponent, nextGameId,
        // --- Store the RAW season stats object from the API ---
        rawSeasonStats: seasonStatsApi ?? {}, // Store the whole object, default to {}
        // Store API's FP calculation (already parsed)
        apiSeasonFantasyPoints: removeUndefinedFields(apiSeasonFantasyPoints),
        // Add gamesPlayed separately if needed for direct access/queries
        gamesPlayed: safeParseInt(seasonStatsApi?.gamesPlayed),
    };

    // Clean up top-level undefined fields before returning
    return removeUndefinedFields(playerData);
};


// --- Update Inactive Players Helper (Unchanged) ---
const updateInactivePlayers = async (activePlayerIds: Set<string>, batch: admin.firestore.WriteBatch, now: Timestamp) => {
    const playersCollectionRef = db.collection('players');
    const snapshot = await playersCollectionRef
        .where('isActive', '==', true)
        .where('pos', 'in', config.RELEVANT_PLAYER_POSITIONS) // Only check relevant players
        .get();
    let inactiveCount = 0;
    snapshot.forEach((doc) => {
        if (!activePlayerIds.has(doc.id)) {
            batch.update(doc.ref, { isActive: false, lastUpdated: now });
            inactiveCount++;
        }
    });
    logger.info(`Marked ${inactiveCount} relevant players inactive.`);
};

// --- Core Update Logic (Handles undefined wins/loss/tie, stores stats objects) ---
async function updateTeamsAndPlayers() {
    logger.info("Starting updateTeamsAndPlayers process...");
    const activePlayerIds = new Set<string>();
    const batch = db.batch();
    const now = Timestamp.now();
    const currentWeek = calculateCurrentNFLWeek();

    // 1. Fetch Teams (including schedule AND teamStats)
    let teams: Tank01ApiTeam[] = [];
    try {
        const teamsResponse = await axios.request<Tank01ApiTeamsResponse>({
            method: 'GET', url: `https://${hosts.TANK01_NFL_API}/getNFLTeams`,
            params: {
                schedules: 'true', rosters: 'false',
                teamStats: 'true', teamStatsSeason: config.CURRENT_NFL_SEASON
            },
            headers: getTank01Headers(),
        });
        if (!teamsResponse.data?.body || !Array.isArray(teamsResponse.data.body)) { // Check if body is array
            throw new Error("Invalid or missing team data array from API.");
        }
        teams = teamsResponse.data.body;
        logger.info(`Fetched ${teams.length} teams.`);
    } catch (error: unknown) {
        const axiosError = error as import("axios").AxiosError;
        logger.error("Fatal Error fetching teams list.", { status: axiosError.response?.status, msg: axiosError.message, data: axiosError.response?.data });
        throw new HttpsError('internal', 'Failed to fetch team list.');
    }

    // 2. Process Each Team and Fetch its Roster
    for (const team of teams) {
        // Add checks for essential team info
        if (!team || typeof team !== 'object' || !team.teamID || !team.teamAbv) {
            logger.warn("Skipping invalid team data received:", team);
            continue;
        };
        const teamRef = db.collection('teams').doc(team.teamID);

        // Find next game info
        let nextGame = null; let nextGameId: string | null = null;
        if (team.teamSchedule && typeof team.teamSchedule === 'object') { // Check if it's an object
           for (const gameId in team.teamSchedule) {
                // Ensure gameId is own property and game object exists
                if (Object.prototype.hasOwnProperty.call(team.teamSchedule, gameId)) {
                    const game = team.teamSchedule[gameId];
                    // Check game structure and properties
                    if (game && game.gameWeek && game.seasonType === "Regular Season") {
                        const gameWeekNumber = safeParseInt(game.gameWeek.split(' ')[1]);
                        if (gameWeekNumber === currentWeek) {
                            nextGame = game; nextGameId = gameId; break;
                        }
                    }
                }
            }
        }
        const nextOpponent = nextGame ? (nextGame.home === team.teamAbv ? `vs ${nextGame.away}` : `@ ${nextGame.home}`) : 'BYE / TBD';
        const byeWeekStr = team.byeWeeks?.[config.CURRENT_NFL_SEASON]?.[0];
        const byeWeek: number | null = byeWeekStr ? safeParseInt(byeWeekStr) : null; // Use safeParseInt

        // Prepare Team Data (Safely parse record, include teamStats)
        const teamData = {
            teamId: team.teamID,
            abbreviation: team.teamAbv,
            city: team.teamCity ?? null,
            name: team.teamName ?? null,
            fullName: (team.teamCity && team.teamName) ? `${team.teamCity} ${team.teamName}` : null,
            conference: team.conferenceAbv ?? null,
            division: team.division ?? null,
            logoUrl: team.espnLogo1 ?? null,
            byeWeek: byeWeek, // Already number or null
            nextOpponent: nextOpponent,
            nextGameId: nextGameId, // Already string or null
            lastUpdated: now,
            // Safely parse wins/losses/ties, default to 0
            seasonRecord: {
                wins: safeParseInt(team.wins),
                losses: safeParseInt(team.loss), // Check API: loss vs losses?
                ties: safeParseInt(team.tie),
            },
            // Store the raw season stats object, default to empty object
            seasonTeamStats: (team.teamStats && typeof team.teamStats === 'object') ? team.teamStats : {},
        };
        // removeUndefinedFields might not be needed if defaults cover all cases
        batch.set(teamRef, teamData, { merge: true });

        // Fetch Roster
        const rosterPlayers = await fetchTeamRosterFromApi(team.teamID, team.teamAbv);

        // Process Roster Players
        for (const player of rosterPlayers) {
            if (!player.playerID) continue;
            // extractPlayerData returns object or null
            const playerData = extractPlayerData(player, nextOpponent, nextGameId, byeWeek, now);
            if (playerData) { // Check if data was returned (relevant position)
                activePlayerIds.add(player.playerID);
                const playerRef = db.collection('players').doc(player.playerID);
                // playerData is already cleaned by removeUndefinedFields
                batch.set(playerRef, playerData, { merge: true });
            }
        }
        logger.debug(`Processed roster for ${team.teamAbv}.`);
    }

    // 3. Mark Inactive Players
    await updateInactivePlayers(activePlayerIds, batch, now);

    // 4. Commit Batch
    try {
        await batch.commit();
        logger.info(`Batch commit successful: Teams/Players updated.`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if ((error as { code?: string })?.code === 'invalid-argument' && errorMessage.includes('undefined')) {
             logger.error("FATAL: Commit failed - 'undefined' value detected. Check data prep.", { error: errorMessage, detail: error });
             throw new HttpsError('internal', `Firestore Error: Cannot save 'undefined'. ${errorMessage}`);
        } else {
             logger.error("FATAL: Batch commit failed:", { error: errorMessage, detail: error });
             throw new HttpsError('internal', 'Failed to commit updates. Check logs.');
        }
    }
}

// --- Scheduled Function (Exported - Unchanged structure) ---
export const scheduledUpdateTeamsAndPlayers = onSchedule(
  { schedule: "every 24 hours", timeZone: "Europe/Berlin", ...dataSyncOptions },
  async () => {
      logger.info("Running scheduledUpdateTeamsAndPlayers...");
      try { await updateTeamsAndPlayers(); logger.info("Scheduled update success."); }
      catch (error: unknown) { logger.error("Scheduled update failed.", { error }); }
  }
);

// --- Manual Trigger Function (Exported - Unchanged structure) ---
export const manualUpdateTeamsAndPlayers = onCall(
  { ...dataSyncOptions },
  async (request) => {
      logger.info("manualUpdateTeamsAndPlayers called...");
      if (request.auth?.token?.admin !== true) { throw new HttpsError('permission-denied', 'Admin only.'); }
      logger.info(`Admin ${request.auth?.uid} triggering update...`);
      try {
          await updateTeamsAndPlayers();
          return { success: true, message: "Teams & players update initiated." };
      } catch (error: unknown) {
          if (error instanceof HttpsError) { throw error; }
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("manualUpdateTeamsAndPlayers failed.", { error: errorMessage, detail: error });
          throw new HttpsError('internal', 'Update failed. Check logs.');
      }
  }
);
