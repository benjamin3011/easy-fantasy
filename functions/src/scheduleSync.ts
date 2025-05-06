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
    } catch (error) {
        logger.error(`Error storing games for week ${week}, season ${season}:`, error);
        throw error; // Re-throw to indicate failure
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
