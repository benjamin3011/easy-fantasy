// src/leagues.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// Import shared config/secrets
import { leagueOptions, config } from './config'; // Use league specific options
import { calculateCurrentNFLWeek } from './common';

// Import what we need for odds fetching
import axios from 'axios';
import { hosts, secrets } from './config';

// Get db instance (initialized in index.ts)
const db = admin.firestore();

// --- Helper Functions ---

// --- Types for Odds Fetching (copied from gameTips.ts) ---
interface BettingOdds {
  sportsBook: string;
  odds: {
    awayTeamMLOdds: string;
    homeTeamMLOdds: string;
    awayTeamSpread: string;
    homeTeamSpread: string;
    totalOver: string;
    totalUnder: string;
    impliedTotals?: {
      awayTotal: string;
      homeTotal: string;
    };
  };
}

interface BettingOddsResponse {
  statusCode: number;
  body: {
    gameID: string;
    gameDate: string;
    teamIDHome: string;
    teamIDAway: string;
    homeTeam: string;
    awayTeam: string;
    sportsBooks: BettingOdds[];
  };
}

interface TippableGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  gameTime: number;
  homeWinProbability: number;
  awayWinProbability: number;
  spread: number;
  total: number;
  gameDate: string;
}

// --- Odds Fetching Functions (copied from gameTips.ts) ---

const getTank01Headers = () => ({
  'x-rapidapi-key': secrets.TANK01_KEY.value(),
  'x-rapidapi-host': hosts.TANK01_NFL_API,
});

function moneylineToWinProbability(odds: string): number {
  const cleanOdds = odds.replace(/[+\s]/g, '');
  const numericOdds = parseFloat(cleanOdds);
  
  if (isNaN(numericOdds)) return 50;
  
  if (numericOdds > 0) {
    return (100 / (numericOdds + 100)) * 100;
  } else {
    return (Math.abs(numericOdds) / (Math.abs(numericOdds) + 100)) * 100;
  }
}

function calculateAverageSpread(sportsBooks: BettingOdds[]): number {
  const spreads = sportsBooks
    .map(book => parseFloat(book.odds.homeTeamSpread))
    .filter(spread => !isNaN(spread));
  
  if (spreads.length === 0) return 0;
  return spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length;
}

function calculateAverageTotal(sportsBooks: BettingOdds[]): number {
  const totals = sportsBooks
    .map(book => parseFloat(book.odds.totalOver))
    .filter(total => !isNaN(total));
  
  if (totals.length === 0) return 45;
  return totals.reduce((sum, total) => sum + total, 0) / totals.length;
}

function calculateConsensusWinProbabilities(sportsBooks: BettingOdds[]): { home: number; away: number } {
  const homeProbs = sportsBooks
    .map(book => moneylineToWinProbability(book.odds.homeTeamMLOdds))
    .filter(prob => !isNaN(prob) && prob > 0);
  
  const awayProbs = sportsBooks
    .map(book => moneylineToWinProbability(book.odds.awayTeamMLOdds))
    .filter(prob => !isNaN(prob) && prob > 0);
  
  const avgHomeProb = homeProbs.length > 0 
    ? homeProbs.reduce((sum, prob) => sum + prob, 0) / homeProbs.length 
    : 50;
  
  const avgAwayProb = awayProbs.length > 0 
    ? awayProbs.reduce((sum, prob) => sum + prob, 0) / awayProbs.length 
    : 50;
  
  const total = avgHomeProb + avgAwayProb;
  return {
    home: Math.round((avgHomeProb / total) * 100),
    away: Math.round((avgAwayProb / total) * 100)
  };
}

async function fetchDayBettingOdds(gameDate: string): Promise<Record<string, BettingOddsResponse> | null> {
  try {
    logger.info(`Fetching betting odds for all games on ${gameDate}`);
    
    const response = await axios.get<{ statusCode: number; body: Array<{
      gameID: string;
      gameDate: string;
      teamIDHome: string;
      teamIDAway: string;
      homeTeam: string;
      awayTeam: string;
      sportsBooks: BettingOdds[];
    }> }>(
      `https://${hosts.TANK01_NFL_API}/getNFLBettingOdds`,
      {
        params: {
          gameDate: gameDate.replace(/-/g, ''),
          itemFormat: 'list',
          impliedTotals: 'true'
        },
        headers: getTank01Headers(),
      }
    );

    if (response.data.statusCode !== 200) {
      logger.warn(`Betting odds API returned non-200 status for date ${gameDate}: ${response.data.statusCode}`);
      return null;
    }

    const oddsMap: Record<string, BettingOddsResponse> = {};
    
    if (Array.isArray(response.data.body)) {
      for (const gameOdds of response.data.body) {
        if (gameOdds.gameID) {
          const wrappedOdds: BettingOddsResponse = {
            statusCode: 200,
            body: gameOdds
          };
          oddsMap[gameOdds.gameID] = wrappedOdds;
        }
      }
      logger.info(`Fetched odds for ${Object.keys(oddsMap).length} games on ${gameDate}`);
    } else {
      const singleGameOdds = response.data.body as unknown as BettingOddsResponse['body'];
      if (singleGameOdds?.gameID) {
        const wrappedOdds: BettingOddsResponse = {
          statusCode: 200,
          body: singleGameOdds as BettingOddsResponse['body']
        };
        oddsMap[singleGameOdds.gameID] = wrappedOdds;
        logger.info(`Fetched odds for single game: ${singleGameOdds.gameID}`);
      }
    }

    return oddsMap;
  } catch (error) {
    logger.error(`Error fetching betting odds for date ${gameDate}:`, error);
    return null;
  }
}

/**
 * Create tips poll for the current week when a new league is created
 * Includes full betting odds fetching for immediate availability
 */
async function createInitialTipsPollForLeague(leagueId: string): Promise<void> {
  try {
    const currentWeek = calculateCurrentNFLWeek();
    const currentSeason = parseInt(config.CURRENT_NFL_SEASON);
    
    logger.info(`Creating initial tips poll with betting odds for new league ${leagueId}, week ${currentWeek}, season ${currentSeason}`);
    
    // Check if tips poll already exists
    const tipsPollId = `${leagueId}_week_${currentWeek}_season_${currentSeason}`;
    const existingPoll = await db.collection('weeklyTips').doc(tipsPollId).get();
    
    if (existingPoll.exists) {
      logger.info(`Tips poll already exists for league ${leagueId}, week ${currentWeek}, skipping creation`);
      return;
    }
    
    // Get weekly schedule
    const scheduleDoc = await db.collection('nfl_schedules').doc(`${currentSeason}_week_${currentWeek}`).get();
    
    if (!scheduleDoc.exists) {
      logger.warn(`No schedule found for week ${currentWeek}, season ${currentSeason} - cannot create tips poll for new league ${leagueId}`);
      return;
    }
    
    const scheduleData = scheduleDoc.data();
    const games = scheduleData?.games || [];
    
    if (games.length === 0) {
      logger.warn(`No games found for week ${currentWeek} - cannot create tips poll for new league ${leagueId}`);
      return;
    }
    
    // Group games by date for batch odds fetching
    const gamesByDate: Record<string, typeof games> = {};
    for (const game of games) {
      const gameDate = game.gameDate || new Date().toISOString().split('T')[0];
      if (!gamesByDate[gameDate]) {
        gamesByDate[gameDate] = [];
      }
      gamesByDate[gameDate].push(game);
    }

    // Fetch betting odds for all dates (batch approach)
    const allOddsMap: Record<string, BettingOddsResponse> = {};
    for (const gameDate of Object.keys(gamesByDate)) {
      logger.info(`Fetching odds for ${gamesByDate[gameDate].length} games on ${gameDate}`);
      const dayOdds = await fetchDayBettingOdds(gameDate);
      if (dayOdds) {
        Object.assign(allOddsMap, dayOdds);
      }
    }

    logger.info(`Total odds fetched for ${Object.keys(allOddsMap).length} games across ${Object.keys(gamesByDate).length} dates`);

    // Create tippable games using fetched odds
    const tippableGames: TippableGame[] = [];
    let firstGameTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // Default to 1 week from now

    for (const game of games) {
      const gameDate = game.gameDate || new Date().toISOString().split('T')[0];
      const bettingData = allOddsMap[game.gameID];
      
      // Parse game time
      let gameTime;
      if (game.gameTime_epoch) {
        const timeNum = parseInt(game.gameTime_epoch);
        gameTime = timeNum * 1000;
        logger.info(`DEBUG: Game ${game.gameID} - epoch: ${game.gameTime_epoch} -> ${timeNum} -> ${new Date(gameTime).toISOString()}`);
      } else {
        gameTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 1 week from now
        logger.warn(`DEBUG: Game ${game.gameID} has no gameTime_epoch, using far future: ${new Date(gameTime).toISOString()}`);
      }
      if (gameTime < firstGameTime) {
        firstGameTime = gameTime;
      }

      if (bettingData && bettingData.body.sportsBooks.length > 0) {
        const winProbs = calculateConsensusWinProbabilities(bettingData.body.sportsBooks);
        const avgSpread = calculateAverageSpread(bettingData.body.sportsBooks);
        const avgTotal = calculateAverageTotal(bettingData.body.sportsBooks);

        logger.info(`Using betting odds for game ${game.gameID}: spread=${avgSpread.toFixed(1)}, total=${avgTotal.toFixed(1)}, homeWin=${winProbs.home}%`);

        tippableGames.push({
          gameId: game.gameID,
          homeTeam: game.home || bettingData.body.homeTeam,
          awayTeam: game.away || bettingData.body.awayTeam,
          homeTeamId: game.teamIDHome || bettingData.body.teamIDHome || '',
          awayTeamId: game.teamIDAway || bettingData.body.teamIDAway || '',
          gameTime: gameTime,
          homeWinProbability: winProbs.home,
          awayWinProbability: winProbs.away,
          spread: avgSpread,
          total: avgTotal,
          gameDate: gameDate
        });
      } else {
        // Create game without betting data (50/50 probability)
        logger.warn(`No betting odds found for game ${game.gameID}, using default probabilities`);
        tippableGames.push({
          gameId: game.gameID,
          homeTeam: game.home || 'HOME',
          awayTeam: game.away || 'AWAY',
          homeTeamId: game.teamIDHome || '',
          awayTeamId: game.teamIDAway || '',
          gameTime: gameTime,
          homeWinProbability: 50,
          awayWinProbability: 50,
          spread: 0,
          total: 45,
          gameDate: gameDate
        });
      }
    }

    // Create the tips poll document
    const now = admin.firestore.Timestamp.now();
    const lockTime = admin.firestore.Timestamp.fromMillis(firstGameTime - (30 * 60 * 1000));

    const tipsPoll = {
      leagueId,
      season: currentSeason,
      week: currentWeek,
      games: tippableGames,
      isLocked: false,
      lockTime,
      createdAt: now,
      lastUpdated: now,
      totalGames: tippableGames.length
    };

    await db.collection('weeklyTips').doc(tipsPollId).set(tipsPoll);

    logger.info(`Successfully created initial tips poll for league ${leagueId} with ${tippableGames.length} games and real betting odds`);
  } catch (error) {
    logger.error(`Error creating initial tips poll for league ${leagueId}:`, error);
    // Don't throw error - league creation should still succeed even if tips poll creation fails
  }
}

// --- Callable Functions (Exported) ---

// Create League
export const createLeague = onCall({ 
  ...leagueOptions,
  secrets: [secrets.TANK01_KEY] // Add TANK01 API access for odds fetching
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to create a league.');
  }

  const { 
    name, 
    teamName, 
    isPublic = false, 
    enableCaptainFeature = false, 
    captainPointMultiplier = 1.5, 
    enableWeeklyTips = false,
    autoLineup = { enabled: false },
    autoTips = { enabled: false }
  } = request.data;
  const uid = request.auth.uid;

  if (!name || typeof name !== 'string' || name.trim() === '') { throw new HttpsError('invalid-argument', 'League name required.'); }
  if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
  if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic must be boolean.'); }
  if (typeof enableCaptainFeature !== 'boolean') { throw new HttpsError('invalid-argument', 'enableCaptainFeature must be boolean.'); }
  if (typeof captainPointMultiplier !== 'number' || captainPointMultiplier < 1 || captainPointMultiplier > 3) {
    throw new HttpsError('invalid-argument', 'captainPointMultiplier must be a number between 1 and 3.');
  }

  const sixDigitCode = () => Math.floor(100_000 + Math.random() * 900_000).toString();
  try {
    const leagueRef = await db.collection('leagues').add({
      name: name.trim(),
      adminUid: uid,
      code: sixDigitCode(),
      isPublic,
      enableCaptainFeature, // Store this
      captainPointMultiplier, // Store this
      enableWeeklyTips, // Store this
      autoLineup, // Store auto-lineup settings
      autoTips, // Store auto-tips settings
      members: [{ uid, teamName: teamName.trim() }],
      memberUids: [uid],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    logger.log(`League created: ${leagueRef.id} by ${uid}`);
    
    // Create initial tips poll for current week if weekly tips are enabled
    if (enableWeeklyTips) {
      await createInitialTipsPollForLeague(leagueRef.id);
    }
    
    return { id: leagueRef.id };
  } catch (error: unknown) { /* ... error handling ... */
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Internal error creating league:", { error: errorMessage, detail: error, userId: uid });
      throw new HttpsError('internal', 'Server error creating league.');
  }
});

// Join League by Code
export const joinLeagueByCode = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { code, teamName } = request.data;
    if (!code || typeof code !== 'string' || code.trim() === '') { throw new HttpsError('invalid-argument', 'Code required.'); }
    if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
    const uid = request.auth.uid; const q = db.collection('leagues').where("code", "==", code.trim()).limit(1);
    try { /* ... transaction logic as before ... */
        const snap = await q.get(); if (snap.empty) { throw new HttpsError('not-found', 'Code not found.'); }
        const leagueDocSnap = snap.docs[0]; const leagueId = leagueDocSnap.id; const leagueRef = leagueDocSnap.ref;
        await db.runTransaction(async (t) => { const doc = await t.get(leagueRef); if (!doc.exists) throw new HttpsError('not-found', 'League disappeared.'); const data = doc.data(); if (!data || !Array.isArray(data.memberUids) || !Array.isArray(data.members)) throw new HttpsError('internal', 'Invalid league data.'); if (data.memberUids.includes(uid)) throw new HttpsError('already-exists', 'Already member.'); const newM = [...data.members, { uid, teamName: teamName.trim() }]; const newU = [...data.memberUids, uid]; t.update(leagueRef, { members: newM, memberUids: newU }); });
        logger.log(`User ${uid} joined ${leagueId} via code`); return { success: true, leagueId: leagueId };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error join by code ${code}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error joining league.');
    }
});

// Join League by ID
export const joinLeagueById = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, teamName } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'League ID required.'); }
    if (!teamName || typeof teamName !== 'string' || teamName.trim() === '') { throw new HttpsError('invalid-argument', 'Team name required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... transaction logic as before ... */
        await db.runTransaction(async (t) => { const doc = await t.get(leagueRef); if (!doc.exists) throw new HttpsError('not-found', 'League not found.'); const data = doc.data(); if (!data || !Array.isArray(data.memberUids) || !Array.isArray(data.members)) throw new HttpsError('internal', 'Invalid league data.'); if (data.memberUids.includes(uid)) throw new HttpsError('already-exists', 'Already member.'); const newM = [...data.members, { uid, teamName: teamName.trim() }]; const newU = [...data.memberUids, uid]; t.update(leagueRef, { members: newM, memberUids: newU }); });
        logger.log(`User ${uid} joined ${leagueId} by ID`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error join by ID ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error joining league.');
    }
});

// Toggle Visibility
export const toggleLeagueVisibility = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, isPublic } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'ID required.'); }
    if (typeof isPublic !== 'boolean') { throw new HttpsError('invalid-argument', 'isPublic boolean required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... logic as before ... */
        const doc = await leagueRef.get(); if (!doc.exists) throw new HttpsError('not-found', 'Not found.'); const data = doc.data(); if (!data || typeof data.adminUid !== 'string') throw new HttpsError('internal', 'Invalid data.'); if (data.adminUid !== uid) throw new HttpsError('permission-denied', 'Admin only.'); await leagueRef.update({ isPublic }); logger.log(`League ${leagueId} visibility set ${isPublic} by ${uid}`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
        if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error toggling visibility ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error toggling visibility.');
    }
});

// Rename League
export const renameLeague = onCall({ ...leagueOptions }, async (request) => {
    if (!request.auth) { throw new HttpsError('unauthenticated', 'Auth required.'); }
    const { leagueId, newName } = request.data;
    if (!leagueId || typeof leagueId !== 'string') { throw new HttpsError('invalid-argument', 'ID required.'); }
    if (!newName || typeof newName !== 'string' || newName.trim() === '') { throw new HttpsError('invalid-argument', 'Name required.'); }
    const uid = request.auth.uid; const leagueRef = db.doc(`leagues/${leagueId}`);
    try { /* ... logic as before ... */
        const doc = await leagueRef.get(); if (!doc.exists) throw new HttpsError('not-found', 'Not found.'); const data = doc.data(); if (!data || typeof data.adminUid !== 'string') throw new HttpsError('internal', 'Invalid data.'); if (data.adminUid !== uid) throw new HttpsError('permission-denied', 'Admin only.'); await leagueRef.update({ name: newName.trim() }); logger.log(`League ${leagueId} renamed by ${uid}`); return { success: true };
    } catch (error: unknown) { /* ... error handling ... */
         if (error instanceof HttpsError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Internal error renaming league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
        throw new HttpsError('internal', 'Server error renaming league.');
    }
});

// Update League Captain Settings
export const updateLeagueCaptainSettings = onCall({ ...leagueOptions }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to update league settings.');
  }
  const { leagueId, enableCaptainFeature, captainPointMultiplier } = request.data;
  const uid = request.auth.uid;

  // Validate payload
  if (!leagueId || typeof leagueId !== 'string') {
    throw new HttpsError('invalid-argument', 'League ID is required.');
  }
  if (typeof enableCaptainFeature !== 'boolean') {
    throw new HttpsError('invalid-argument', 'enableCaptainFeature must be a boolean value.');
  }
  if (typeof captainPointMultiplier !== 'number' || captainPointMultiplier < 1 || captainPointMultiplier > 3) {
    throw new HttpsError('invalid-argument', 'captainPointMultiplier must be a number between 1 and 3.');
  }

  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) {
      throw new HttpsError('not-found', 'League not found.');
    }

    const leagueData = leagueDoc.data();
    if (!leagueData || leagueData.adminUid !== uid) {
      throw new HttpsError('permission-denied', 'You must be the league admin to change these settings.');
    }

    // Update the league document
    await leagueRef.update({
      enableCaptainFeature,
      captainPointMultiplier,
    });

    logger.log(`League ${leagueId} captain settings updated by admin ${uid}: enabled=${enableCaptainFeature}, multiplier=${captainPointMultiplier}`);
    return { success: true, message: 'League captain settings updated successfully.' };
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating captain settings for league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'An internal error occurred while updating league settings.');
    }
});

// Update League Weekly Tips Settings
export const updateLeagueWeeklyTipsSettings = onCall({ 
  ...leagueOptions,
  secrets: [secrets.TANK01_KEY] // Add TANK01 API access for odds fetching when enabling tips
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to update league settings.');
  }
  const { leagueId, enableWeeklyTips } = request.data;
  const uid = request.auth.uid;

  // Validate payload
  if (!leagueId || typeof leagueId !== 'string') {
    throw new HttpsError('invalid-argument', 'League ID is required.');
  }
  if (typeof enableWeeklyTips !== 'boolean') {
    throw new HttpsError('invalid-argument', 'enableWeeklyTips must be a boolean value.');
  }

  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) {
      throw new HttpsError('not-found', 'League not found.');
    }

    const leagueData = leagueDoc.data();
    if (!leagueData || leagueData.adminUid !== uid) {
      throw new HttpsError('permission-denied', 'You must be the league admin to change these settings.');
    }

    // Update the league document
    await leagueRef.update({
      enableWeeklyTips,
    });

    // If enabling weekly tips and tips weren't enabled before, create tips poll for current week
    if (enableWeeklyTips && !leagueData.enableWeeklyTips) {
      await createInitialTipsPollForLeague(leagueId);
    }

    logger.log(`League ${leagueId} weekly tips settings updated by admin ${uid}: enabled=${enableWeeklyTips}`);
    return { success: true, message: 'League weekly tips settings updated successfully.' };
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating weekly tips settings for league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'An internal error occurred while updating league settings.');
    }
});

// Update League Auto-Settings (Auto-Lineup & Auto-Tips)
export const updateLeagueAutoSettings = onCall({ ...leagueOptions }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to update league settings.');
  }
  const { leagueId, autoLineup, autoTips } = request.data;
  const uid = request.auth.uid;

  // Validate payload
  if (!leagueId || typeof leagueId !== 'string') {
    throw new HttpsError('invalid-argument', 'League ID is required.');
  }

  // Validate autoLineup if provided
  if (autoLineup !== undefined) {
    if (typeof autoLineup !== 'object' || autoLineup === null) {
      throw new HttpsError('invalid-argument', 'autoLineup must be an object.');
    }
    if (typeof autoLineup.enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'autoLineup.enabled must be a boolean.');
    }
  }

  // Validate autoTips if provided
  if (autoTips !== undefined) {
    if (typeof autoTips !== 'object' || autoTips === null) {
      throw new HttpsError('invalid-argument', 'autoTips must be an object.');
    }
    if (typeof autoTips.enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'autoTips.enabled must be a boolean.');
    }
  }

  const leagueRef = db.doc(`leagues/${leagueId}`);

  try {
    const leagueDoc = await leagueRef.get();
    if (!leagueDoc.exists) {
      throw new HttpsError('not-found', 'League not found.');
    }

    const leagueData = leagueDoc.data();
    if (!leagueData || leagueData.adminUid !== uid) {
      throw new HttpsError('permission-denied', 'You must be the league admin to change these settings.');
    }

    // Prepare update object
    const updateData: Partial<{ autoLineup: typeof autoLineup; autoTips: typeof autoTips }> = {};
    if (autoLineup !== undefined) {
      updateData.autoLineup = autoLineup;
    }
    if (autoTips !== undefined) {
      updateData.autoTips = autoTips;
    }

    // Update the league document
    await leagueRef.update(updateData);

    logger.log(`League ${leagueId} auto-settings updated by admin ${uid}:`, { autoLineup, autoTips });
    return { success: true, message: 'League auto-assistant settings updated successfully.' };
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating auto-settings for league ${leagueId}:`, { error: errorMessage, detail: error, userId: uid });
    throw new HttpsError('internal', 'An internal error occurred while updating league auto-settings.');
    }
});
