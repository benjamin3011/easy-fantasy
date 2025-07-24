import axios from 'axios';
import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
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
 * Fetch betting odds for a specific game
 */
async function fetchGameBettingOdds(gameId: string, gameDate: string): Promise<BettingOddsResponse | null> {
  try {
    const response = await axios.get<BettingOddsResponse>(
      `https://${hosts.TANK01_NFL_API}/getNFLBettingOdds`,
      {
        params: {
          gameDate: gameDate.replace(/-/g, ''), // Convert YYYY-MM-DD to YYYYMMDD
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

    // Fetch betting odds for each game and create tippable games
    const tippableGames: TippableGame[] = [];
    let firstGameTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // Default to 1 week from now

    for (const game of games) {
      const gameDate = game.gameDate || new Date().toISOString().split('T')[0];
      const bettingData = await fetchGameBettingOdds(game.gameID, gameDate);
      
      const gameTime = game.gameTime_epoch ? parseInt(game.gameTime_epoch) * 1000 : Date.now();
      if (gameTime < firstGameTime) {
        firstGameTime = gameTime;
      }

      if (bettingData && bettingData.body.sportsBooks.length > 0) {
        const winProbs = calculateConsensusWinProbabilities(bettingData.body.sportsBooks);
        const avgSpread = calculateAverageSpread(bettingData.body.sportsBooks);
        const avgTotal = calculateAverageTotal(bettingData.body.sportsBooks);

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
    const lockTime = Timestamp.fromMillis(firstGameTime - (30 * 60 * 1000)); // Lock 30 minutes before first game

    const tipsPoll: WeeklyTipsPoll = {
      leagueId,
      season,
      week,
      games: tippableGames,
      isLocked: Date.now() > firstGameTime - (30 * 60 * 1000),
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

    if (tipsPoll.isLocked || Date.now() > tipsPoll.lockTime.toMillis()) {
      return { success: false, message: 'Tips poll is locked - first game has started' };
    }

    // Validate tips
    const validGameIds = new Set(tipsPoll.games.map(game => game.gameId));
    const userTips: UserTip[] = [];

    for (const [gameId, pick] of Object.entries(tips)) {
      if (!validGameIds.has(gameId)) {
        return { success: false, message: `Invalid game ID: ${gameId}` };
      }
      if (pick !== 'home' && pick !== 'away') {
        return { success: false, message: `Invalid pick for game ${gameId}: ${pick}` };
      }
      userTips.push({
        gameId,
        pick,
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

       batch.set(prophetRef, {
         userId: userTips.userId,
         leagueId,
         season,
         totalPoints: (currentData?.totalPoints || 0) + weeklyPoints,
         totalCorrect: (currentData?.totalCorrect || 0) + correctPicks,
         totalPicks: (currentData?.totalPicks || 0) + totalPicks,
         weeklyResults: {
           ...(currentData?.weeklyResults || {}),
           [week]: {
             points: weeklyPoints,
             correct: correctPicks,
             total: totalPicks,
             accuracy
           }
         },
         lastUpdated: Timestamp.now()
       }, { merge: true });
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
      
             leaderboardSnapshot.docs.forEach((doc) => {
         const data = doc.data();
         const member = members.find((m: { uid: string; teamName?: string }) => m.uid === doc.id);
        
        if (member) {
          const currentWeek = calculateCurrentNFLWeek();
          const weeklyData = data.weeklyResults?.[currentWeek] || { points: 0, correct: 0, total: 0 };
          
          leaderboard.push({
            userId: doc.id,
            userName: member.teamName || 'Unknown',
            teamName: member.teamName || 'Unknown',
            weeklyPoints: weeklyData.points,
            totalPoints: data.totalPoints || 0,
            accuracy: data.totalPicks > 0 ? Math.round((data.totalCorrect / data.totalPicks) * 100) : 0,
            currentStreak: 0, // Could implement streak tracking
            bestStreak: 0,
            totalCorrect: data.totalCorrect || 0,
            totalPicks: data.totalPicks || 0
          });
        }
      });

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
    schedule: '0 8 * * 3', // Every Wednesday at 8 AM (after all games complete)
    timeZone: 'America/New_York'
  },
  async () => {
    try {
      logger.info('Running scheduled tips results calculation...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const previousWeek = currentWeek - 1;
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON);

      if (previousWeek < 1) {
        logger.info('No previous week to calculate results for');
        return;
      }

      // Get all active leagues
      const leaguesSnapshot = await db.collection('leagues').get();
      
      for (const leagueDoc of leaguesSnapshot.docs) {
        const leagueId = leagueDoc.id;
        logger.info(`Calculating tips results for league ${leagueId}, week ${previousWeek}`);
        
        try {
          await calculateWeeklyTipsResults(leagueId, previousWeek, currentSeason);
        } catch (error) {
          logger.error(`Failed to calculate tips results for league ${leagueId}:`, error);
        }
      }

      logger.info('Scheduled tips results calculation completed');
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
    timeZone: 'America/New_York'
  },
  async () => {
    try {
      logger.info('Running scheduled tips odds update...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON);
      
      // Get all active tips polls (not locked and for current week)
      const tipsSnapshot = await db.collection('weeklyTips')
        .where('season', '==', currentSeason)
        .where('week', '==', currentWeek)
        .where('isLocked', '==', false)
        .get();
        
      if (tipsSnapshot.empty) {
        logger.info('No active tips polls found for odds update');
        return;
      }
      
      logger.info(`Found ${tipsSnapshot.size} active tips polls to update`);
      
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
           if (odds && odds.body?.sportsBooks?.[0]?.odds) {
             const firstBook = odds.body.sportsBooks[0].odds;
             return {
               ...game,
               homeWinProbability: firstBook.homeTeamMLOdds ? moneylineToWinProbability(firstBook.homeTeamMLOdds) : game.homeWinProbability,
               awayWinProbability: firstBook.awayTeamMLOdds ? moneylineToWinProbability(firstBook.awayTeamMLOdds) : game.awayWinProbability,
               spread: firstBook.homeTeamSpread ? safeParseFloat(firstBook.homeTeamSpread) : game.spread,
               total: firstBook.totalOver ? safeParseFloat(firstBook.totalOver) : game.total
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