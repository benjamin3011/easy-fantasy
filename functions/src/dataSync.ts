// src/dataSync.ts
import axios from "axios";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import shared config/secrets
import { dataSyncOptions, secrets, hosts, config } from './config';

// Get db instance (initialized in index.ts)
const db = admin.firestore();

// --- Interfaces for API Data ---
interface Tank01ApiTeam { /* ... as defined before ... */
    teamID: string; teamAbv: string; teamCity: string; teamName: string;
    conferenceAbv: string; division: string; espnLogo1?: string;
    byeWeeks?: { [season: string]: string[] };
    teamStats?: { [key: string]: any }; // Adjust as per actual structure
    wins?: number; losses?: number; ties?: number;
}
interface Tank01ApiPlayer { /* ... as defined before ... */
    playerID: string; espnID?: string; longName: string; firstName?: string; lastName?: string;
    pos: string; teamID: string; team: string; jerseyNum?: string; status?: string;
    injury?: string; espnHeadshot?: string;
}
interface Tank01ApiRosterResponse { body: { roster: { [id: string]: Tank01ApiPlayer } }; }
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
            params: { teamID: teamId, teamAbv: teamAbv, getStats: 'true', fantasyPoints: 'true' }, headers: getTank01Headers(),
        });
        if (!response.data?.body?.roster) return [];
        return Object.values(response.data.body.roster);
    } catch (error: unknown) {
        const axiosError = error as import("axios").AxiosError;
        logger.error(`Error fetching roster for ${teamAbv}:`, { status: axiosError.response?.status, data: axiosError.response?.data, msg: axiosError.message });
        return []; // Continue with other teams
    }
}

// --- Core Update Logic ---
async function updateTeamsAndPlayers() {
    logger.info("Starting updateTeamsAndPlayers process...");
    const activePlayerIds = new Set<string>();
    const batch = db.batch();
    const now = Timestamp.now();

    // 1. Fetch Teams
    let teams: Tank01ApiTeam[] = [];
    try {
        const teamsResponse = await axios.request<Tank01ApiTeamsResponse>({
            method: 'GET', url: `https://${hosts.TANK01_NFL_API}/getNFLTeams`,
            params: { schedules: 'true', rosters: 'false', teamStats: 'true', teamStatsSeason: '2024' }, headers: getTank01Headers(),
        });
        if (!teamsResponse.data?.body) throw new Error("Invalid team data from API.");
        teams = teamsResponse.data.body;
        logger.info(`Fetched ${teams.length} teams.`);
    } catch (error: unknown) { /* ... error handling, throw HttpsError ... */
        const axiosError = error as import("axios").AxiosError;
        logger.error("Fatal Error fetching teams list.", { status: axiosError.response?.status, data: axiosError.response?.data, msg: axiosError.message });
        throw new HttpsError('internal', 'Failed to fetch team list.');
    }

    // 2. Process Teams & Rosters
    for (const team of teams) { /* ... loop logic as defined before ... */
        if (!team.teamID || !team.teamAbv) continue;
        const teamRef = db.collection('teams').doc(team.teamID);
        const byeWeekStr = team.byeWeeks?.[config.CURRENT_NFL_SEASON]?.[0];
        const teamData = {
            teamId: team.teamID, abbreviation: team.teamAbv, city: team.teamCity, name: team.teamName,
            fullName: `${team.teamCity} ${team.teamName}`, conference: team.conferenceAbv, division: team.division,
            logoUrl: team.espnLogo1 ?? null, byeWeek: byeWeekStr ? parseInt(byeWeekStr, 10) : null, lastUpdated: now,
            teamStats: team.teamStats, wins: team.wins, losses: team.losses, ties: team.ties
        };
        batch.set(teamRef, teamData, { merge: true });

        const rosterPlayers = await fetchTeamRosterFromApi(team.teamID, team.teamAbv);
        for (const player of rosterPlayers) { /* ... process player logic as defined before ... */
            if (!player.playerID || !player.pos || !player.longName) continue;
            if (!config.RELEVANT_PLAYER_POSITIONS.includes(player.pos)) continue;
            activePlayerIds.add(player.playerID);
            const nameParts = player.longName.split(' ');
            const firstName = nameParts[0] ?? player.longName;
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            const playerRef = db.collection('players').doc(player.playerID);
            const playerData = {
                playerId: player.playerID, espnId: player.espnID ?? null, fullName: player.longName,
                firstName: firstName, lastName: lastName, position: player.pos as 'QB' | 'RB' | 'WR' | 'TE',
                nflTeamId: player.teamID, nflTeamAbbreviation: player.team, jerseyNumber: player.jerseyNum ?? null,
                status: player.status ?? null, injuryStatus: player.injury ?? null, headshotUrl: player.espnHeadshot ?? null,
                isActive: true, lastUpdated: now,
            };
            batch.set(playerRef, playerData, { merge: true });
        }
        // Optional: Add a small delay if hitting API rate limits
        // await new Promise(resolve => setTimeout(resolve, 200)); // e.g., 200ms delay
    }

    // 3. Mark Inactive
    logger.info(`Checking ${activePlayerIds.size} active players for inactivity...`);
    const playersToMarkInactiveRef = db.collection('players').where('isActive', '==', true);
    try { /* ... query and batch update logic as defined before ... */
        const snapshot = await playersToMarkInactiveRef.get(); let inactiveCount = 0;
        snapshot.forEach((doc) => { if (!activePlayerIds.has(doc.id)) { batch.update(doc.ref, { isActive: false, lastUpdated: now }); inactiveCount++; } });
        logger.info(`Marked ${inactiveCount} players inactive.`);
    } catch(error: unknown) { /* ... error logging ... */
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Error updating inactive players:", { error: errorMessage, detail: error });
    }

    // 4. Commit
    try { /* ... batch commit logic as defined before ... */
        await batch.commit();
        logger.info(`Batch commit successful.`);
    } catch (error: unknown) { /* ... error handling, throw HttpsError ... */
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("FATAL: Batch commit failed:", { error: errorMessage, detail: error });
        throw new HttpsError('internal', 'Failed to commit Firestore updates.');
    }
}

// --- Scheduled Function (Exported) ---
export const scheduledUpdateTeamsAndPlayers = onSchedule(
  {
    schedule: "every 24 hours", // Daily
    timeZone: "Europe/Berlin",
    ...dataSyncOptions, // Spread common options + secrets + specific overrides
  },
  async () => {
    logger.info("Running scheduledUpdateTeamsAndPlayers...");
    try { await updateTeamsAndPlayers(); logger.info("scheduledUpdateTeamsAndPlayers success."); }
    catch (error: unknown) { logger.error("scheduledUpdateTeamsAndPlayers failed.", { error }); }
  }
);

// --- Manual Trigger Function (Exported) ---
export const manualUpdateTeamsAndPlayers = onCall(
  { ...dataSyncOptions }, // Spread common options + secrets + specific overrides
  async (request) => {
    logger.info("manualUpdateTeamsAndPlayers called...");
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }
    logger.info(`Admin ${request.auth?.uid} triggering update...`);
    try {
      await updateTeamsAndPlayers();
      return { success: true, message: "Teams & players update done." };
    } catch (error: unknown) { /* ... error handling, re-throw HttpsError ... */
      if (error instanceof HttpsError) { throw error; }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("manualUpdateTeamsAndPlayers failed.", { error: errorMessage, detail: error });
      throw new HttpsError('internal', 'Update failed. Check logs.');
    }
  }
);
