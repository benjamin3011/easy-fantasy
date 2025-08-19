import axios from 'axios';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Import shared config/secrets
import { secrets, hosts, config, functionOptions } from './config';
import { calculateCurrentNFLWeek, safeParseFloat } from './common';

const db = admin.firestore();

// --- Types ---
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
  homeTeam: string; // Keep for backwards compatibility
  awayTeam: string; // Keep for backwards compatibility
  homeTeamId: string; // NEW: Team ID for direct Firestore access
  awayTeamId: string; // NEW: Team ID for direct Firestore access
  gameTime: number; // epoch
  homeWinProbability: number; // 0-100
  awayWinProbability: number; // 0-100
  spread: number; // positive means home team favored
  total: number; // over/under total points
  gameDate: string;
}

interface WeeklyTipsPoll {
  leagueId: string;
  season: number;
  week: number;
  games: TippableGame[];
  isLocked: boolean;
  lockTime: Timestamp;
  createdAt: Timestamp;
  lastUpdated: Timestamp;
}

interface UserTip {
  gameId: string;
  pick: 'home' | 'away';
  pickedTeamId?: string; // new: explicit team id for resilience
  pickedTeamAbbreviation?: string; // new: explicit team abbreviation for display
  submittedAt: Timestamp;
}

interface UserTipsSubmission {
  userId: string;
  leagueId: string;
  season: number;
  week: number;
  tips: UserTip[];
  totalGames: number;
  submittedAt: Timestamp;
}

interface ProphetLeaderboardEntry {
  userId: string;
  userName: string;
  teamName: string;
  weeklyPoints: number;
  totalPoints: number;
  accuracy: number; // percentage
  currentStreak: number;
  bestStreak: number;
  totalCorrect: number;
  totalPicks: number;
}

// --- API Headers ---
const getTank01Headers = () => ({
  'x-rapidapi-key': secrets.TANK01_KEY.value(),
  'x-rapidapi-host': hosts.TANK01_NFL_API,
});

// --- Utility Functions ---

/**
 * Convert moneyline odds to win probability
 * @param odds Moneyline odds (e.g., "+245", "-305")
 * @returns Win probability as percentage (0-100)
 */
function moneylineToWinProbability(odds: string): number {
  const cleanOdds = odds.replace(/[+\s]/g, '');
  const numericOdds = parseFloat(cleanOdds);
  
  if (isNaN(numericOdds)) return 50; // Default to 50% if invalid
  
  if (numericOdds > 0) {
    // Positive odds (underdog)
    return (100 / (numericOdds + 100)) * 100;
  } else {
    // Negative odds (favorite)
    return (Math.abs(numericOdds) / (Math.abs(numericOdds) + 100)) * 100;
  }
}

/**
 * Calculate average spread from multiple sportsbooks
 */
function calculateAverageSpread(sportsBooks: BettingOdds[]): number {
  const spreads = sportsBooks
    .map(book => safeParseFloat(book.odds.homeTeamSpread))
    .filter(spread => !isNaN(spread));
  
  if (spreads.length === 0) return 0;
  return spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length;
}

/**
 * Calculate average total from multiple sportsbooks
 */
function calculateAverageTotal(sportsBooks: BettingOdds[]): number {
  const totals = sportsBooks
    .map(book => safeParseFloat(book.odds.totalOver))
    .filter(total => !isNaN(total));
  
  if (totals.length === 0) return 45; // Default NFL total
  return totals.reduce((sum, total) => sum + total, 0) / totals.length;
}

/**
 * Calculate consensus win probabilities from multiple sportsbooks
 */
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
  
  // Normalize to ensure they add up to 100%
  const total = avgHomeProb + avgAwayProb;
  return {
    home: Math.round((avgHomeProb / total) * 100),
    away: Math.round((avgAwayProb / total) * 100)
  };
}

// --- Core Functions ---

/**
 * Fetch betting odds for all games on a specific date
 */
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
          gameDate: gameDate.replace(/-/g, ''), // Convert YYYY-MM-DD to YYYYMMDD
          itemFormat: 'list',
          impliedTotals: 'true'
        },
        headers: getTank01Headers(),
      }
    );

    // Debug: Log basic response info
    logger.info(`API Response for ${gameDate}: statusCode=${response.data.statusCode}, games=${Array.isArray(response.data.body) ? response.data.body.length : 0}`);

    if (response.data.statusCode !== 200) {
      logger.warn(`Betting odds API returned non-200 status for date ${gameDate}: ${response.data.statusCode}`);
      return null;
    }

    // Convert array response to gameID-keyed object for easy lookup
    const oddsMap: Record<string, BettingOddsResponse> = {};
    
    if (Array.isArray(response.data.body)) {
      for (const gameOdds of response.data.body) {
        // The gameID is directly on the object, not nested in a "body" property
        if (gameOdds.gameID) {
          // Wrap the game data in the expected BettingOddsResponse format
          const wrappedOdds: BettingOddsResponse = {
            statusCode: 200,
            body: gameOdds
          };
          oddsMap[gameOdds.gameID] = wrappedOdds;
        }
      }
      logger.info(`Fetched odds for ${Object.keys(oddsMap).length} games on ${gameDate}`);
    } else {
      // Single game response (fallback) - when API returns single object instead of array
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
 * Create weekly tips poll for a league
 */
async function createWeeklyTipsPoll(leagueId: string, week: number, season: number): Promise<{ success: boolean; message: string; gamesCount?: number }> {
  try {
    logger.info(`Creating weekly tips poll for league ${leagueId}, week ${week}, season ${season}`);

    // Get weekly schedule
    const scheduleDoc = await db.collection('nfl_schedules').doc(`${season}_week_${week}`).get();
    
    if (!scheduleDoc.exists) {
      return { success: false, message: `No schedule found for week ${week}, season ${season}` };
    }

    const scheduleData = scheduleDoc.data();
    const games = scheduleData?.games || [];

    if (games.length === 0) {
      return { success: false, message: `No games found for week ${week}` };
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
      
      // Parse game time - if missing, use a future date (1 week from now) to prevent games from appearing as "live"
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
    const now = Timestamp.now();
    const lockTime = Timestamp.fromMillis(firstGameTime - (30 * 60 * 1000)); // Keep for reference, but don't globally lock

    const tipsPoll: WeeklyTipsPoll = {
      leagueId,
      season,
      week,
      games: tippableGames,
      isLocked: false, // Use per-game locking instead of global lock
      lockTime,
      createdAt: now,
      lastUpdated: now
    };

    const docId = `${leagueId}_week_${week}_season_${season}`;
    await db.collection('weeklyTips').doc(docId).set(tipsPoll);

    logger.info(`Created weekly tips poll with ${tippableGames.length} games for league ${leagueId}`);
    return { 
      success: true, 
      message: `Tips poll created with ${tippableGames.length} games`,
      gamesCount: tippableGames.length
    };

  } catch (error) {
    logger.error(`Error creating weekly tips poll:`, error);
    return { success: false, message: `Failed to create tips poll: ${error}` };
  }
}

/**
 * Submit user tips for a week
 */
async function submitUserTips(userId: string, leagueId: string, week: number, season: number, tips: Record<string, 'home' | 'away'>): Promise<{ success: boolean; message: string }> {
  try {
    const docId = `${leagueId}_week_${week}_season_${season}`;
    const tipsPollDoc = await db.collection('weeklyTips').doc(docId).get();

    if (!tipsPollDoc.exists) {
      return { success: false, message: 'Tips poll not found' };
    }

    const tipsPoll = tipsPollDoc.data() as WeeklyTipsPoll;

    // No global lock check - individual games will be validated below

    // Get existing user tips to check what has actually changed
    const existingTipsDoc = await db.collection('weeklyTips').doc(docId)
      .collection('userTips').doc(userId).get();
    
    const existingTips: Record<string, string> = {};
    if (existingTipsDoc.exists) {
      const existingData = existingTipsDoc.data() as UserTipsSubmission;
      for (const tip of existingData.tips || []) {
        existingTips[tip.gameId] = tip.pick;
      }
    }

    // Validate tips - only check games where the tip has actually changed
    const validGameIds = new Set(tipsPoll.games.map(game => game.gameId));
    const userTips: UserTip[] = [];

    for (const [gameId, pick] of Object.entries(tips)) {
      if (!validGameIds.has(gameId)) {
        return { success: false, message: `Invalid game ID: ${gameId}` };
      }
      if (pick !== 'home' && pick !== 'away') {
        return { success: false, message: `Invalid pick for game ${gameId}: ${pick}` };
      }
      
      // Only validate timing for CHANGED tips
      const existingPick = existingTips[gameId];
      const tipHasChanged = existingPick !== pick;
      
      if (tipHasChanged) {
        // Check if this specific game has started (only for changed tips)
        const gameInfo = tipsPoll.games.find(g => g.gameId === gameId);
        if (gameInfo && Date.now() > gameInfo.gameTime) {
          logger.info(`Tip change blocked for ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} - game started at ${new Date(gameInfo.gameTime)}`);
          return { success: false, message: `Cannot change tip for ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} - game has already started` };
        } else if (gameInfo) {
          logger.info(`Allowing tip change for ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} - game starts at ${new Date(gameInfo.gameTime)}`);
        }
      } else {
        logger.info(`Tip unchanged for game ${gameId}: ${pick}`);
      }
      
      // Enrich with picked team id/abbreviation for resilience
      const gameInfo = tipsPoll.games.find(g => g.gameId === gameId);
      const pickedTeamId = pick === 'home' ? (gameInfo?.homeTeamId || '') : (gameInfo?.awayTeamId || '');
      const pickedTeamAbbreviation = pick === 'home' ? (gameInfo?.homeTeam || '') : (gameInfo?.awayTeam || '');

      userTips.push({
        gameId,
        pick,
        pickedTeamId,
        pickedTeamAbbreviation,
        submittedAt: Timestamp.now()
      });
    }

    // Get league member info to validate user is in league
    const leagueDoc = await db.collection('leagues').doc(leagueId).get();
    const leagueData = leagueDoc.data();
    const member = leagueData?.members?.find((m: { uid: string }) => m.uid === userId);
    
    if (!member) {
      return { success: false, message: 'User not found in league' };
    }

    const userTipsSubmission: UserTipsSubmission = {
      userId,
      leagueId,
      season,
      week,
      tips: userTips,
      totalGames: tipsPoll.games.length,
      submittedAt: Timestamp.now()
    };

    // Store user tips in subcollection
    await db.collection('weeklyTips').doc(docId)
      .collection('userTips').doc(userId)
      .set(userTipsSubmission);

    logger.info(`User ${userId} submitted ${userTips.length} tips for week ${week}`);
    return { 
      success: true, 
      message: `Successfully submitted ${userTips.length} tips` 
    };

  } catch (error) {
    logger.error(`Error submitting user tips:`, error);
    return { success: false, message: `Failed to submit tips: ${error}` };
  }
}

/**
 * Calculate results and update leaderboard after games complete
 */
async function calculateWeeklyTipsResults(leagueId: string, week: number, season: number): Promise<{ 
  success: boolean; 
  message: string; 
  results?: Array<{
    userId: string;
    weeklyPoints: number;
    totalPicks: number;
    correctPicks: number;
    accuracy: number;
  }>;
}> {
  try {
    logger.info(`Calculating tips results for league ${leagueId}, week ${week}, season ${season}`);

    const docId = `${leagueId}_week_${week}_season_${season}`;
    
    // Get tips poll and game results
    const tipsPollDoc = await db.collection('weeklyTips').doc(docId).get();
    if (!tipsPollDoc.exists) {
      return { success: false, message: 'Tips poll not found' };
    }

    const tipsPoll = tipsPollDoc.data() as WeeklyTipsPoll;
    
    // Get actual game results from gameScores collection
    const gameResults: Record<string, 'home' | 'away'> = {};
    for (const game of tipsPoll.games) {
      const gameScoreDoc = await db.collection('gameScores').doc(game.gameId).get();
      if (gameScoreDoc.exists) {
        const gameScore = gameScoreDoc.data();
        if (gameScore && gameScore.gameStatusCode === 2) { // Final game
          const homeScore = gameScore.homeScore || 0;
          const awayScore = gameScore.awayScore || 0;
          gameResults[game.gameId] = homeScore > awayScore ? 'home' : 'away';
        }
      }
    }

    if (Object.keys(gameResults).length === 0) {
      return { success: false, message: 'No completed games found' };
    }

    // Get all user tips for this week
    const userTipsSnapshot = await db.collection('weeklyTips').doc(docId)
      .collection('userTips').get();

         const weeklyResults: Array<{
       userId: string;
       weeklyPoints: number;
       totalPicks: number;
       correctPicks: number;
       accuracy: number;
     }> = [];
     const batch = db.batch();

     for (const userTipDoc of userTipsSnapshot.docs) {
       const userTips = userTipDoc.data() as UserTipsSubmission;
      let correctPicks = 0;
      let totalPicks = 0;

      // Calculate weekly score
      for (const tip of userTips.tips) {
        if (gameResults[tip.gameId]) {
          totalPicks++;
          if (tip.pick === gameResults[tip.gameId]) {
            correctPicks++;
          }
        }
      }

      const weeklyPoints = correctPicks;
      const accuracy = totalPicks > 0 ? (correctPicks / totalPicks) * 100 : 0;

      weeklyResults.push({
        userId: userTips.userId,
        weeklyPoints,
        totalPicks,
        correctPicks,
        accuracy
      });

             // Update prophet leaderboard
       const prophetRef = db.collection('prophetLeaderboards')
         .doc(`${leagueId}_${season}`)
         .collection('members')
         .doc(userTips.userId);

       const existingData = await prophetRef.get();
       const currentData = existingData.exists ? existingData.data() : undefined;

       // Check if this week was already calculated
       const existingWeekResult = currentData?.weeklyResults?.[week];
       const weekAlreadyCalculated = existingWeekResult && 
         existingWeekResult.points === weeklyPoints && 
         existingWeekResult.correct === correctPicks && 
         existingWeekResult.total === totalPicks;

       if (weekAlreadyCalculated) {
         logger.info(`Week ${week} already calculated for user ${userTips.userId}, skipping...`);
         continue;
       }

       // Update weekly results
       const updatedWeeklyResults = {
         ...(currentData?.weeklyResults || {}),
         [week]: {
           points: weeklyPoints,
           correct: correctPicks,
           total: totalPicks,
           accuracy
         }
       };

       // Recalculate totals from all weekly results (instead of adding)
       let newTotalPoints = 0;
       let newTotalCorrect = 0;
       let newTotalPicks = 0;

       for (const weekResult of Object.values(updatedWeeklyResults)) {
         const result = weekResult as { points: number; correct: number; total: number; accuracy: number };
         newTotalPoints += result.points || 0;
         newTotalCorrect += result.correct || 0;
         newTotalPicks += result.total || 0;
       }

       batch.set(prophetRef, {
         userId: userTips.userId,
         leagueId,
         season,
         totalPoints: newTotalPoints,
         totalCorrect: newTotalCorrect,
         totalPicks: newTotalPicks,
         weeklyResults: updatedWeeklyResults,
         lastUpdated: Timestamp.now()
       }, { merge: true });

       logger.info(`Updated user ${userTips.userId} week ${week}: ${weeklyPoints} points (Total: ${newTotalPoints})`);
    }

    await batch.commit();

    logger.info(`Calculated results for ${weeklyResults.length} users`);
    return {
      success: true,
      message: `Results calculated for ${weeklyResults.length} users`,
      results: weeklyResults
    };

  } catch (error) {
    logger.error(`Error calculating tips results:`, error);
    return { success: false, message: `Failed to calculate results: ${error}` };
  }
}

// --- Exported Functions ---

/**
 * Manual function to create weekly tips poll
 */
export const createWeeklyTips = onCall(
  { ...functionOptions },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error('Authentication required');
    }

    const { leagueId, week, season } = request.data;

    if (!leagueId || !week) {
      throw new Error('League ID and week are required');
    }

    const currentSeason = season || parseInt(config.CURRENT_NFL_SEASON);
    return await createWeeklyTipsPoll(leagueId, week, currentSeason);
  }
);

/**
 * Submit user tips
 */
export const submitTips = onCall(
  { ...functionOptions },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error('Authentication required');
    }

    const { leagueId, week, season, tips } = request.data;

    if (!leagueId || !week || !tips) {
      throw new Error('League ID, week, and tips are required');
    }

    const currentSeason = season || parseInt(config.CURRENT_NFL_SEASON);
    return await submitUserTips(request.auth.uid, leagueId, week, currentSeason, tips);
  }
);

/**
 * Repair prophet leaderboard totals by recalculating from weekly results
 */
export const repairProphetTotals = onCall(
  { ...functionOptions },
  async (request) => {
    const { leagueId, season } = request.data;
    
    if (!leagueId || !season) {
      throw new HttpsError('invalid-argument', 'Missing leagueId or season');
    }

    try {
      logger.info(`Repairing prophet totals for league ${leagueId}, season ${season}`);
      
      const leaderboardRef = db.collection('prophetLeaderboards')
        .doc(`${leagueId}_${season}`)
        .collection('members');
      
      const membersSnapshot = await leaderboardRef.get();
      const batch = db.batch();
      let repairedCount = 0;

      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data();
        const weeklyResults = memberData.weeklyResults || {};
        
        // Recalculate totals from weekly results
        let newTotalPoints = 0;
        let newTotalCorrect = 0;
        let newTotalPicks = 0;

        for (const weekResult of Object.values(weeklyResults)) {
          const result = weekResult as { points: number; correct: number; total: number; accuracy: number };
          newTotalPoints += result.points || 0;
          newTotalCorrect += result.correct || 0;
          newTotalPicks += result.total || 0;
        }

        // Check if repair is needed
        const needsRepair = memberData.totalPoints !== newTotalPoints ||
                           memberData.totalCorrect !== newTotalCorrect ||
                           memberData.totalPicks !== newTotalPicks;

        if (needsRepair) {
          logger.info(`Repairing user ${memberData.userId}: ${memberData.totalPoints} → ${newTotalPoints} points`);
          
          batch.update(memberDoc.ref, {
            totalPoints: newTotalPoints,
            totalCorrect: newTotalCorrect,
            totalPicks: newTotalPicks,
            lastUpdated: Timestamp.now()
          });
          
          repairedCount++;
        }
      }

      if (repairedCount > 0) {
        await batch.commit();
        logger.info(`Repaired ${repairedCount} prophet leaderboard entries`);
      } else {
        logger.info('No repairs needed - all totals are correct');
      }

      return {
        success: true,
        message: `Repaired ${repairedCount} entries`,
        repairedCount
      };
    } catch (error) {
      logger.error('Error repairing prophet totals:', error);
      throw new HttpsError('internal', 'Failed to repair prophet totals');
    }
  }
);

/**
 * Get prophet leaderboard for a league
 */
export const getProphetLeaderboard = onCall(
  { ...functionOptions },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error('Authentication required');
    }

    const { leagueId, season } = request.data;

    if (!leagueId) {
      throw new Error('League ID is required');
    }

    try {
      const currentSeason = season || parseInt(config.CURRENT_NFL_SEASON);
      
      // Get league data for member names
      const leagueDoc = await db.collection('leagues').doc(leagueId).get();
      if (!leagueDoc.exists) {
        throw new Error('League not found');
      }
      
      const leagueData = leagueDoc.data();
      const members = leagueData?.members || [];
      
      // Get prophet points for all members
      const leaderboardSnapshot = await db.collection('prophetLeaderboards')
        .doc(`${leagueId}_${currentSeason}`)
        .collection('members')
        .orderBy('totalPoints', 'desc')
        .get();

      const leaderboard: ProphetLeaderboardEntry[] = [];
      const currentWeek = calculateCurrentNFLWeek();
      
      // Create a map of existing prophet data
      const prophetDataMap = new Map();
      leaderboardSnapshot.docs.forEach((doc) => {
        prophetDataMap.set(doc.id, doc.data());
      });
      
      // Process ALL league members, not just those with prophet data
      members.forEach((member: { uid: string; teamName?: string }) => {
        const prophetData = prophetDataMap.get(member.uid);
        
        if (prophetData) {
          // User has prophet data
          const weeklyData = prophetData.weeklyResults?.[currentWeek] || { points: 0, correct: 0, total: 0 };
          
          const entry = {
            userId: member.uid,
            userName: member.teamName || 'Unknown',
            teamName: member.teamName || 'Unknown',
            weeklyPoints: weeklyData.points,
            totalPoints: prophetData.totalPoints || 0,
            accuracy: prophetData.totalPicks > 0 ? Math.round((prophetData.totalCorrect / prophetData.totalPicks) * 100) : 0,
            currentStreak: 0, // Could implement streak tracking
            bestStreak: 0,
            totalCorrect: prophetData.totalCorrect || 0,
            totalPicks: prophetData.totalPicks || 0
          };
          
          leaderboard.push(entry);
        } else {
          // User has no prophet data - show with zeros
          const entry = {
            userId: member.uid,
            userName: member.teamName || 'Unknown',
            teamName: member.teamName || 'Unknown',
            weeklyPoints: 0,
            totalPoints: 0,
            accuracy: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalCorrect: 0,
            totalPicks: 0
          };
          
          leaderboard.push(entry);
        }
      });
      
      // Sort by total points desc, then by accuracy desc
      leaderboard.sort((a, b) => (b.totalPoints - a.totalPoints) || (b.accuracy - a.accuracy));

      return { success: true, leaderboard };

    } catch (error) {
      logger.error('Error getting prophet leaderboard:', error);
      throw new Error(`Failed to get leaderboard: ${error}`);
    }
  }
);

/**
 * Manual function to calculate weekly results
 */
export const calculateTipsResults = onCall(
  { ...functionOptions },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error('Authentication required');
    }

    const { leagueId, week, season } = request.data;

    if (!leagueId || !week) {
      throw new Error('League ID and week are required');
    }

    const currentSeason = season || parseInt(config.CURRENT_NFL_SEASON);
    return await calculateWeeklyTipsResults(leagueId, week, currentSeason);
  }
);

/**
 * Manual function to update betting odds for existing tips polls
 */
export const updateTipsOdds = onCall(
  { 
    ...functionOptions,
    secrets: [secrets.TANK01_KEY]
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error('Authentication required');
    }

    const { week, season } = request.data;
    const currentWeek = week || calculateCurrentNFLWeek();
    const currentSeason = season || parseInt(config.CURRENT_NFL_SEASON);

    try {
      logger.info(`Manually updating tips odds for week ${currentWeek}, season ${currentSeason}`);

      // Get all tips polls for the specified week
      const tipsSnapshot = await db.collection('weeklyTips')
        .where('season', '==', currentSeason)
        .where('week', '==', currentWeek)
        .get();

      if (tipsSnapshot.empty) {
        return { success: false, message: `No tips polls found for week ${currentWeek}` };
      }

      logger.info(`Found ${tipsSnapshot.size} tips polls to update`);

      // Group all games by date for batch odds fetching
      const gamesByDate: Record<string, Array<{ gameId: string; gameDate: string }>> = {};
      
      for (const doc of tipsSnapshot.docs) {
        const tipsPoll = doc.data();
        logger.info(`Processing tips poll with ${tipsPoll.games?.length || 0} games`);
        
        for (const game of tipsPoll.games || []) {
          const gameDate = game.gameDate;
          
          if (!gameDate) {
            logger.warn(`Game ${game.gameId} has no gameDate field`);
            continue;
          }
          
          if (!gamesByDate[gameDate]) {
            gamesByDate[gameDate] = [];
          }
          gamesByDate[gameDate].push({ gameId: game.gameId, gameDate });
        }
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

      logger.info(`Total odds fetched for ${Object.keys(allOddsMap).length} games`);

      // Update all tips polls with new odds
      const batch = db.batch();
      let updatedCount = 0;

      for (const doc of tipsSnapshot.docs) {
        const tipsPoll = doc.data();
        const updatedGames = tipsPoll.games.map((game: TippableGame) => {
          const bettingData = allOddsMap[game.gameId];
          
          if (bettingData && bettingData.body.sportsBooks.length > 0) {
            const winProbs = calculateConsensusWinProbabilities(bettingData.body.sportsBooks);
            const avgSpread = calculateAverageSpread(bettingData.body.sportsBooks);
            const avgTotal = calculateAverageTotal(bettingData.body.sportsBooks);

            logger.info(`Updating odds for game ${game.gameId}: spread=${avgSpread.toFixed(1)}, total=${avgTotal.toFixed(1)}, homeWin=${winProbs.home}%`);

            return {
              ...game,
              homeWinProbability: winProbs.home,
              awayWinProbability: winProbs.away,
              spread: avgSpread,
              total: avgTotal
            };
          }
          
          return game; // Keep original if no odds found
        });

        batch.update(doc.ref, {
          games: updatedGames,
          lastUpdated: Timestamp.now()
        });
        updatedCount++;
      }

      await batch.commit();

      return {
        success: true,
        message: `Successfully updated betting odds for ${updatedCount} tips polls with ${Object.keys(allOddsMap).length} games`
      };

    } catch (error) {
      logger.error('Error updating tips odds:', error);
      throw new Error(`Failed to update odds: ${error}`);
    }
  }
);

/**
 * Scheduled function to auto-create tips polls for the upcoming week
 */
export const scheduledCreateTips = onSchedule(
  {
    ...functionOptions,
    schedule: '0 10 * * 2', // Every Tuesday at 10 AM (after previous week completes)
    timeZone: 'America/New_York'
  },
  async () => {
    try {
      logger.info('Running scheduled tips poll creation...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const nextWeek = currentWeek + 1;
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON);

      // Get all active leagues
      const leaguesSnapshot = await db.collection('leagues').get();
      
      for (const leagueDoc of leaguesSnapshot.docs) {
        const leagueId = leagueDoc.id;
        logger.info(`Creating tips poll for league ${leagueId}, week ${nextWeek}`);
        
        try {
          await createWeeklyTipsPoll(leagueId, nextWeek, currentSeason);
        } catch (error) {
          logger.error(`Failed to create tips poll for league ${leagueId}:`, error);
        }
      }

      logger.info('Scheduled tips poll creation completed');
    } catch (error) {
      logger.error('Error in scheduled tips poll creation:', error);
    }
  }
);

/**
 * Scheduled function to calculate results for completed weeks
 */
export const scheduledCalculateTipsResults = onSchedule(
  {
    ...functionOptions,
    schedule: '0 */2 * * *', // Every 2 hours for faster updates
    timeZone: 'America/New_York'
  },
  async () => {
    try {
      logger.info('Running scheduled tips results calculation...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON);

      // Get all active leagues
      const leaguesSnapshot = await db.collection('leagues').get();
      
      let totalCalculations = 0;
      
      for (const leagueDoc of leaguesSnapshot.docs) {
        const leagueId = leagueDoc.id;
        
        // Try current week first (for ongoing games that just finished)
        try {
          const currentWeekResult = await calculateWeeklyTipsResults(leagueId, currentWeek, currentSeason);
          if (currentWeekResult.success) {
            logger.info(`Calculated tips results for league ${leagueId}, week ${currentWeek}: ${currentWeekResult.message}`);
            totalCalculations++;
          }
        } catch {
          logger.info(`No completed games for league ${leagueId}, week ${currentWeek}`);
        }
        
        // Also try previous week (in case we missed it)
        const previousWeek = currentWeek - 1;
        if (previousWeek >= 1) {
          try {
            const previousWeekResult = await calculateWeeklyTipsResults(leagueId, previousWeek, currentSeason);
            if (previousWeekResult.success) {
              logger.info(`Calculated tips results for league ${leagueId}, week ${previousWeek}: ${previousWeekResult.message}`);
              totalCalculations++;
            }
          } catch {
            logger.info(`No additional results needed for league ${leagueId}, week ${previousWeek}`);
          }
        }
      }

      logger.info(`Scheduled tips results calculation completed. Processed ${totalCalculations} calculations.`);
    } catch (error) {
      logger.error('Error in scheduled tips results calculation:', error);
    }
  }
);

/**
 * Scheduled function to update betting odds daily for active tips polls
 */
export const scheduledUpdateTipsOdds = onSchedule(
  {
    ...functionOptions,
    schedule: '0 6 * * *', // Every day at 6 AM
    timeZone: 'America/New_York',
    secrets: [secrets.TANK01_KEY]  // Add missing secrets configuration
  },
  async () => {
    try {
      logger.info('Running scheduled tips odds update...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON);
      
      // Get all tips polls for current week
      const tipsSnapshot = await db.collection('weeklyTips')
        .where('season', '==', currentSeason)
        .where('week', '==', currentWeek)
        .get();
        
      if (tipsSnapshot.empty) {
        logger.info('No tips polls found for odds update');
        return;
      }
      
      logger.info(`Found ${tipsSnapshot.size} tips polls to update`);
      
      // Get unique game IDs from all polls
      const gameIds = new Set<string>();
      for (const doc of tipsSnapshot.docs) {
        const tipsPoll = doc.data();
        for (const game of tipsPoll.games) {
          gameIds.add(game.gameId);
        }
      }
      
      logger.info(`Fetching odds for ${gameIds.size} unique games`);
      
             // Fetch odds for all games
       const gameOdds: Record<string, BettingOddsResponse> = {};
       for (const gameId of gameIds) {
         try {
           const odds = await fetchBettingOddsForScheduledUpdate(gameId);
           if (odds) {
             gameOdds[gameId] = odds;
           }
         } catch (error) {
           logger.warn(`Failed to fetch odds for game ${gameId}:`, error);
         }
       }
       
       // Update all tips polls with new odds
       const batch = db.batch();
       for (const doc of tipsSnapshot.docs) {
         const tipsPoll = doc.data();
         const updatedGames = tipsPoll.games.map((game: TippableGame) => {
           const odds = gameOdds[game.gameId];
           if (odds && odds.body?.sportsBooks?.length > 0) {
             const winProbs = calculateConsensusWinProbabilities(odds.body.sportsBooks);
             const avgSpread = calculateAverageSpread(odds.body.sportsBooks);
             const avgTotal = calculateAverageTotal(odds.body.sportsBooks);
             
             return {
               ...game,
               homeWinProbability: winProbs.home,
               awayWinProbability: winProbs.away,
               spread: avgSpread,
               total: avgTotal
             };
           }
           return game;
         });
         
         batch.update(doc.ref, {
           games: updatedGames,
           lastUpdated: Timestamp.now()
         });
       }
      
      await batch.commit();
      logger.info('Successfully updated odds for all active tips polls');
      
    } catch (error) {
      logger.error('Error in scheduled tips odds update:', error);
    }
  }
);

/**
 * Helper function to fetch betting odds for scheduled updates (no date required)
 */
async function fetchBettingOddsForScheduledUpdate(gameId: string): Promise<BettingOddsResponse | null> {
  try {
    const response = await axios.get<BettingOddsResponse>(
      `https://${hosts.TANK01_NFL_API}/getNFLBettingOdds`,
      {
        params: {
          gameID: gameId,
          itemFormat: 'list',
          impliedTotals: 'true'
        },
        headers: getTank01Headers(),
      }
    );

    if (response.data.statusCode !== 200) {
      logger.warn(`Betting odds API returned non-200 status for game ${gameId}: ${response.data.statusCode}`);
      return null;
    }

    return response.data;
  } catch (error) {
    logger.error(`Error fetching betting odds for game ${gameId}:`, error);
    return null;
  }
} 