// functions/src/autoAssistant.ts
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { autoAssistantOptions } from './config'; // Use auto-assistant specific options
import { calculateCurrentNFLWeek } from './common';
import { config } from './config';
import { FirestoreWeeklySchedule, GameInfoForWeek, Player, Team } from './types';

// Get db instance (initialized in index.ts)
const db = admin.firestore();

// --- Helper Functions ---

/**
 * Helper function to get effective PPG with fallbacks (mirrors frontend logic)
 */
function getEffectivePPG(entity: Player | Team): number {
  // Primary: Use actual PPG if available
  if (entity.actualPPG > 0) {
    return entity.actualPPG;
  }
  
  // Fallback 1: Calculate from season stats
  if (entity.entityType === 'player' && entity.rawSeasonStats) {
    const seasonFPString = entity.rawSeasonStats.fantasyPointsDefault?.standard;
    const gamesPlayedString = entity.rawSeasonStats.gamesPlayed;
    
    if (seasonFPString && gamesPlayedString) {
      const seasonFP = typeof seasonFPString === 'string' ? parseFloat(seasonFPString) : Number(seasonFPString);
      const gamesPlayed = typeof gamesPlayedString === 'string' ? parseInt(gamesPlayedString) : Number(gamesPlayedString);
      
      if (seasonFP > 0 && gamesPlayed > 0) {
        return seasonFP / gamesPlayed;
      }
    }
  }
  
  // Fallback 2: Position-based defaults for Week 1
  if (entity.entityType === 'player') {
    const positionDefaults = {
      'QB': 18,
      'RB': 12,
      'WR': 10,
      'TE': 8
    };
    return positionDefaults[entity.position as keyof typeof positionDefaults] || 8;
  }
  
  // Fallback 3: Team defaults
  if (entity.entityType === 'team') {
    // Use season stats if available
    const seasonFP_Defense = entity.seasonFP_Defense || 0;
    const seasonFP_Passing = entity.seasonFP_Passing || 0;
    const seasonFP_Rushing = entity.seasonFP_Rushing || 0;
    const seasonFP_ST = entity.seasonFP_ST || 0;
    
    if (seasonFP_Defense > 0) return seasonFP_Defense / 17;
    if (seasonFP_Passing > 0) return seasonFP_Passing / 17;
    if (seasonFP_Rushing > 0) return seasonFP_Rushing / 17;
    if (seasonFP_ST > 0) return seasonFP_ST / 17;
    
    // Use team record to estimate quality
    if (entity.seasonRecord) {
      const wins = Number(entity.seasonRecord.wins) || 0;
      const losses = Number(entity.seasonRecord.losses) || 0;
      const ties = Number(entity.seasonRecord.ties) || 0;
      const totalGames = wins + losses + ties;
      
      if (totalGames > 0) {
        const winPct = wins / totalGames;
        return 6 + (winPct * 6); // 6-12 range based on win percentage
      }
    }
    
    return 8; // Final fallback
  }
  
  return 8; // Final fallback
}

/**
 * Check if current time is within user's quiet hours
 */
function isQuietHours(quietHours?: { enabled: boolean; start: string; end: string }): boolean {
  if (!quietHours?.enabled) {
    return false;
  }
  
  const now = new Date();
  const currentTime = now.getHours() * 100 + now.getMinutes(); // e.g., 1430 for 2:30 PM
  
  const startTime = parseInt(quietHours.start.replace(':', ''));
  const endTime = parseInt(quietHours.end.replace(':', ''));
  
  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime <= endTime;
  } else {
    return currentTime >= startTime && currentTime <= endTime;
  }
}

/**
 * Get leagues with auto-lineup enabled
 */
async function getLeaguesWithAutoLineup(): Promise<string[]> {
  const leaguesSnapshot = await db.collection('leagues')
    .where('autoLineup.enabled', '==', true)
    .get();
  
  return leaguesSnapshot.docs.map(doc => doc.id);
}

/**
 * Get leagues with auto-tips enabled
 */
async function getLeaguesWithAutoTips(): Promise<string[]> {
  const leaguesSnapshot = await db.collection('leagues')
    .where('autoTips.enabled', '==', true)
    .get();
  
  return leaguesSnapshot.docs.map(doc => doc.id);
}

/**
 * Check if user has incomplete lineup for the week and return missing positions
 */
async function getMissingLineupPositions(userId: string, leagueId: string, week: number, season: number): Promise<string[]> {
  const lineupDocId = `${leagueId}_${season}_${week}`;
  const lineupDoc = await db.collection('users')
    .doc(userId)
    .collection('weeklyLineups')
    .doc(lineupDocId)
    .get();
  
  const allPositions = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
  
  if (!lineupDoc.exists) {
    return allPositions; // No lineup = all positions missing
  }
  
  const lineupData = lineupDoc.data();
  const existingPicks = lineupData?.picks || {};
  
  // Return positions that don't have picks yet
  return allPositions.filter(position => !existingPicks[position]);
}

/**
 * Apply auto-lineup for a specific user using Quick Pick logic
 */
async function applyAutoLineupForUser(
  userId: string, 
  leagueId: string, 
  week: number, 
  season: number
): Promise<boolean> {
  try {
    logger.info(`Applying auto-lineup for user ${userId} in league ${leagueId}, week ${week}`);
    
    // 1. Check which positions are missing
    const missingPositions = await getMissingLineupPositions(userId, leagueId, week, season);
    
    if (missingPositions.length === 0) {
      logger.info(`User ${userId} already has complete lineup, skipping auto-lineup`);
      return true; // Not an error - lineup is already complete
    }
    
    logger.info(`User ${userId} missing ${missingPositions.length} positions: ${missingPositions.join(', ')}`);
    
    // 2. Get user's current usage counts for this league
    const usageCounts = await getUserUsageCounts(userId, leagueId, season);
    
    // 3. Get this week's schedule (for bye week checks)
    const scheduleData = await getWeeklySchedule(week, season);
    if (!scheduleData || scheduleData.games.length === 0) {
      logger.warn(`No schedule found for week ${week}, season ${season}`);
      return false;
    }
    
    // 4. Generate picks only for missing positions
    const newPicks = await generatePicksForPositions(missingPositions, usageCounts, scheduleData, week);
    
    if (Object.keys(newPicks).length === 0) {
      logger.warn(`Could not generate any picks for user ${userId}`);
      return false;
    }
    
    // 5. Save only the new picks (merge with existing lineup)
    const saveSuccess = await saveAutoLineup(userId, leagueId, week, newPicks);
    
    if (saveSuccess) {
      logger.info(`Auto-lineup applied successfully for user ${userId}: ${Object.keys(newPicks).length} positions filled`);
      
      // 6. Send notification to user
      await sendAutoLineupNotification(userId, leagueId, Object.keys(newPicks).length);
      
      return true;
    } else {
      logger.error(`Failed to save auto-lineup for user ${userId}`);
      return false;
    }
    
  } catch (error) {
    logger.error(`Failed to apply auto-lineup for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get user's usage counts for a specific league/season
 */
async function getUserUsageCounts(userId: string, leagueId: string, season: number): Promise<Record<string, number>> {
  const usageCounts: Record<string, number> = {};
  
  try {
    const usageCollectionPath = `users/${userId}/leagueUsage/${leagueId}_${season}/usageCounts`;
    const usageSnapshot = await db.collection(usageCollectionPath).get();
    
    usageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      usageCounts[data.entityId] = data.count || 0;
    });
    
    logger.info(`Retrieved ${usageSnapshot.docs.length} usage counts for user ${userId}`);
    return usageCounts;
    
  } catch (error) {
    logger.error(`Error fetching usage counts for user ${userId}:`, error);
    return {};
  }
}

/**
 * Get weekly schedule data
 */
async function getWeeklySchedule(week: number, season: number): Promise<FirestoreWeeklySchedule | null> {
  try {
    const scheduleDocId = `${season}_week_${week}`;
    const scheduleDoc = await db.collection('nfl_schedules').doc(scheduleDocId).get();
    
    if (!scheduleDoc.exists) {
      return null;
    }
    
    return scheduleDoc.data() as FirestoreWeeklySchedule;
    
  } catch (error) {
    logger.error(`Error fetching weekly schedule for week ${week}:`, error);
    return null;
  }
}

/**
 * Generate picks for specific positions using Quick Pick algorithm (highest effective PPG)
 */
async function generatePicksForPositions(
  positionsToFill: string[],
  usageCounts: Record<string, number>,
  scheduleData: FirestoreWeeklySchedule,
  week: number
): Promise<Record<string, { id: string; type: 'player' | 'team' }>> {
  const lineup: Record<string, { id: string; type: 'player' | 'team' }> = {};
  const selectedTeamIds = new Set<string>(); // Prevent duplicate team selections
  
  // Define all position configurations
  const allPositions = [
    { key: 'QB', type: 'player' },
    { key: 'RB', type: 'player' },
    { key: 'WR', type: 'player' },
    { key: 'TE', type: 'player' },
    { key: 'PassingOffense', type: 'team' },
    { key: 'RushingOffense', type: 'team' },
    { key: 'Defense', type: 'team' },
    { key: 'SpecialTeams', type: 'team' }
  ];
  
  // Filter to only positions we need to fill
  const positions = allPositions.filter(pos => positionsToFill.includes(pos.key));
  
  logger.info(`Generating picks for ${positions.length} positions: ${positions.map(p => p.key).join(', ')}`);
  
  for (const position of positions) {
    try {
      let availableEntities: (Player | Team)[] = [];
      
      if (position.type === 'player') {
        availableEntities = await fetchAvailablePlayers(position.key);
      } else {
        availableEntities = await fetchAvailableTeams(position.key, selectedTeamIds);
      }
      
      // Filter out entities with max usage (5) and those with bye weeks
      const eligibleEntities = availableEntities.filter(entity => {
        const entityId = entity.entityType === 'player' ? `player_${entity.id}` : `team_${entity.id}`;
        const currentUsage = usageCounts[entityId] || 0;
        
        if (currentUsage >= 5) return false; // Max usage reached
        if (entity.byeWeek === week) return false; // Bye week
        
        // For teams: prevent selecting the same team twice
        if (entity.entityType === 'team' && selectedTeamIds.has(entity.id)) {
          return false;
        }
        
        return true;
      });
      
      if (eligibleEntities.length > 0) {
        // Sort by effective PPG (highest first)
        eligibleEntities.sort((a, b) => getEffectivePPG(b) - getEffectivePPG(a));
        
        // Select the best available entity
        const selectedEntity = eligibleEntities[0];
        lineup[position.key] = {
          id: selectedEntity.id,
          type: position.type as 'player' | 'team'
        };
        
        // Track team ID to prevent duplicate selections
        if (selectedEntity.entityType === 'team') {
          selectedTeamIds.add(selectedEntity.id);
        }
        
        logger.info(`Selected ${selectedEntity.name} for ${position.key} (PPG: ${getEffectivePPG(selectedEntity).toFixed(2)})`);
      } else {
        logger.warn(`No eligible entities found for position ${position.key}`);
      }
      
    } catch (error) {
      logger.error(`Error processing position ${position.key}:`, error);
    }
  }
  
  return lineup;
}

/**
 * Fetch available players for a position (simplified version)
 */
async function fetchAvailablePlayers(position: string): Promise<Player[]> {
  try {
    // This is a simplified version - in reality, you'd fetch from the players collection
    // with the same logic as the frontend fetchSelectablePlayers function
    
    const playersSnapshot = await db.collection('players')
      .where('pos', '==', position)
      .where('isActive', '==', true)
      .get();
    
    return playersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            entityType: 'player',
            position: position,
            name: data.longName || `${data.firstName} ${data.lastName}`,
            actualPPG: data.actualPPG || 0,
            rawSeasonStats: data.rawSeasonStats,
            byeWeek: data.byeWeek,
            team: data.team,
            projectedPPG: 0,
        } as Player;
    });
    
  } catch (error) {
    logger.error(`Error fetching players for position ${position}:`, error);
    return [];
  }
}

/**
 * Fetch available teams for a position (simplified version)
 */
async function fetchAvailableTeams(position: string, selectedTeamIds: Set<string>): Promise<Team[]> {
  try {
    // This is a simplified version - in reality, you'd fetch from the teams collection
    // with the same logic as the frontend fetchSelectableTeams function
    
    const teamsSnapshot = await db.collection('teams')
      .where('isActive', '==', true)
      .get();
    
    return teamsSnapshot.docs
      .filter(doc => !selectedTeamIds.has(doc.id)) // Prevent duplicates
      .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            entityType: 'team',
            name: data.teamName || `${data.teamCity} ${data.teamName}`,
            actualPPG: data[`actualPPG_${position}`] || 0,
            seasonRecord: data.seasonRecord,
            seasonFP_Defense: data.seasonFP_Defense,
            seasonFP_Passing: data.seasonFP_Passing,
            seasonFP_Rushing: data.seasonFP_Rushing,
            seasonFP_ST: data.seasonFP_ST,
            byeWeek: data.byeWeek,
            position: position,
            projectedPPG: 0,
        } as Team;
    });
    
  } catch (error) {
    logger.error(`Error fetching teams for position ${position}:`, error);
    return [];
  }
}

/**
 * Save the auto-generated picks (merge with existing lineup)
 */
async function saveAutoLineup(
  userId: string,
  leagueId: string, 
  week: number,
  newPicks: Record<string, { id: string; type: 'player' | 'team' }>
): Promise<boolean> {
  try {
    const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
    const lineupDocId = `${leagueId}_${currentSeason}_${week}`;
    const lineupDocRef = db.collection('users').doc(userId).collection('weeklyLineups').doc(lineupDocId);
    
    // Get existing lineup data
    const existingDoc = await lineupDocRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : {};
    const existingPicks = existingData?.picks || {};
    
    // Convert new picks to Firestore format
    const newPicksFormatted = Object.fromEntries(
      Object.entries(newPicks).map(([pos, pick]) => [
        pos,
        {
          id: pick.id,
          type: pick.type,
          selectedAt: admin.firestore.Timestamp.now(),
          autoGenerated: true // Mark auto-generated picks
        }
      ])
    );
    
    // Merge with existing picks (existing picks take precedence)
    const mergedPicks = { ...newPicksFormatted, ...existingPicks };
    
    // Check if lineup is now complete (all 8 positions filled)
    const allPositions = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
    const isComplete = allPositions.every(pos => mergedPicks[pos]);
    
    const lineupData = {
      userId,
      leagueId,
      season: currentSeason,
      week,
      picks: mergedPicks,
      isComplete,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalActualPoints: existingData?.totalActualPoints || null,
      captainPlayerId: existingData?.captainPlayerId || null // Preserve existing captain
    };
    
    // Update usage counts for new picks only
    const usageCollectionPath = `users/${userId}/leagueUsage/${leagueId}_${currentSeason}/usageCounts`;
    const batch = db.batch();
    
    // Add the lineup document to batch
    batch.set(lineupDocRef, lineupData);
    
    // Add usage count updates for new picks
    Object.entries(newPicks).forEach(([, pick]) => {
      const entityId = `${pick.type}_${pick.id}`;
      const usageDocRef = db.doc(`${usageCollectionPath}/${entityId}`);
      
      batch.set(usageDocRef, {
        entityId: entityId,
        type: pick.type,
        count: admin.firestore.FieldValue.increment(1),
        lastUsedWeek: week,
        lastUsedTimestamp: admin.firestore.Timestamp.now()
      }, { merge: true });
    });
    
    // Execute batch write
    await batch.commit();
    
    logger.info(`Merged auto-picks with existing lineup for user ${userId}: ${Object.keys(newPicks).length} new picks, ${Object.keys(mergedPicks).length} total picks, usage counts updated`);
    
    return true;
    
  } catch (error) {
    logger.error(`Error saving auto-lineup:`, error);
    return false;
  }
}

/**
 * Send notification to user about auto-lineup
 */
async function sendAutoLineupNotification(userId: string, leagueId: string, positionsCount: number): Promise<void> {
  try {
    // Get user data and FCM token
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData?.fcmToken) {
      logger.info(`No FCM token found for user ${userId}, skipping notification`);
      return;
    }
    
    // Check if user has auto-lineup notifications enabled
    const prefs = userData.notificationPreferences;
    if (!prefs?.enabled || !prefs?.autoLineupAlerts) {
      logger.info(`Auto-lineup notifications disabled for user ${userId}`);
      return;
    }
    
    // Check quiet hours
    if (isQuietHours(prefs.quietHours)) {
      logger.info(`Skipping auto-lineup notification for user ${userId} due to quiet hours`);
      return;
    }
    
    // Get league name for context
    const leagueDoc = await db.collection('leagues').doc(leagueId).get();
    const leagueName = leagueDoc.data()?.name || 'your league';
    
    // Create friendly notification message
    const title = '🤖 Auto-Lineup Applied!';
    const body = `I filled ${positionsCount} missing position${positionsCount === 1 ? '' : 's'} in ${leagueName}. You're all set for this week! 🏈`;
    
    const message = {
      token: userData.fcmToken,
      notification: { title, body },
      data: {
        type: 'auto_lineup',
        leagueId,
        positionsCount: positionsCount.toString(),
        userId
      },
      webpush: {
        fcmOptions: {
          link: `/lineup?league=${leagueId}`
        }
      }
    };
    
    await admin.messaging().send(message);
    logger.info(`Auto-lineup notification sent to user ${userId}: ${positionsCount} positions filled`);
    
  } catch (error) {
    logger.error(`Error sending auto-lineup notification to user ${userId}:`, error);
  }
}

interface TippableGame {
    gameId: string;
    homeWinProbability: number;
    awayWinProbability: number;
    homeTeam: string;
    awayTeam: string;
    homeTeamId: string;
    awayTeamId: string;
}

/**
 * Apply auto-tips for specific games using betting favorites
 */
async function applyAutoTipsForGames(
  userId: string,
  leagueId: string, 
  games: GameInfoForWeek[],
  week: number,
  season: number
): Promise<boolean> {
  try {
    logger.info(`Applying auto-tips for user ${userId} in league ${leagueId}, ${games.length} games`);
    
    // 1. Get existing weekly tips document (correct format: leagueId_week_X_season_Y)
    const tipsDocId = `${leagueId}_week_${week}_season_${season}`;
    const tipsDocRef = db.collection('weeklyTips').doc(tipsDocId);
    const tipsDoc = await tipsDocRef.get();
    
    if (!tipsDoc.exists) {
      logger.warn(`No tips poll found for league ${leagueId}, week ${week}`);
      return false;
    }
    
    const tipsData = tipsDoc.data();
    const tippableGames = (tipsData?.games || []) as TippableGame[];
    
    if (tippableGames.length === 0) {
      logger.warn(`No tippable games found for league ${leagueId}, week ${week}`);
      return false;
    }
    
    // 2. Apply auto-tips for each game using betting favorites
    const userTipsRef = tipsDocRef.collection('userTips').doc(userId);
    const existingTips = await userTipsRef.get();
    const existingTipsData = existingTips.exists ? existingTips.data() : null;
    const currentTips: Record<string, { 
      gameId: string; 
      pick: 'home' | 'away'; 
      pickedTeamAbbreviation: string;
      pickedTeamId: string;
      confidence?: number; 
      submittedAt: admin.firestore.Timestamp; 
      autoGenerated: boolean 
    }> = {};
    
    let tipsApplied = 0;
    
    for (const game of games) {
      try {
        // Find the tippable game that matches this game
        const tippableGame = tippableGames.find((tg) => tg.gameId === game.gameID);
        
        if (!tippableGame) {
          logger.warn(`No tippable game found for game ${game.gameID}`);
          continue;
        }
        
        // Skip if user already has a tip for this game
        const existingTip = existingTipsData?.tips?.find((tip: { gameId: string }) => tip.gameId === game.gameID);
        if (existingTip) {
          logger.info(`User ${userId} already has tip for game ${game.gameID}, skipping`);
          continue;
        }
        
        // Determine betting favorite based on win probability
        let favoritePick: 'home' | 'away';
        let pickedTeamAbbreviation: string;
        let pickedTeamId: string;
        
        if (tippableGame.homeWinProbability > tippableGame.awayWinProbability) {
          favoritePick = 'home';
          pickedTeamAbbreviation = tippableGame.homeTeam;
          pickedTeamId = tippableGame.homeTeamId || '';
        } else if (tippableGame.awayWinProbability > tippableGame.homeWinProbability) {
          favoritePick = 'away';
          pickedTeamAbbreviation = tippableGame.awayTeam;
          pickedTeamId = tippableGame.awayTeamId || '';
        } else {
          // Equal odds - pick home team (home field advantage)
          favoritePick = 'home';
          pickedTeamAbbreviation = tippableGame.homeTeam;
          pickedTeamId = tippableGame.homeTeamId || '';
        }
        
        // Apply the auto-tip (matching manual tip data structure)
        currentTips[game.gameID] = {
          gameId: game.gameID,
          pick: favoritePick,
          pickedTeamAbbreviation,
          pickedTeamId,
          submittedAt: admin.firestore.Timestamp.now(),
          autoGenerated: true // Mark as auto-generated
        };
        
        tipsApplied++;
        logger.info(`Auto-tip applied for game ${game.gameID}: ${favoritePick} (${tippableGame.homeWinProbability}% vs ${tippableGame.awayWinProbability}%)`);
        
      } catch (error) {
        logger.error(`Error applying auto-tip for game ${game.gameID}:`, error);
      }
    }
    
    // 3. Save the updated tips (matching WeeklyTips.tsx UserTipsSubmission structure)
    if (tipsApplied > 0) {
      // Build tips array from current tips
      const existingTipsArray = existingTipsData?.tips || [];
      const newTipsArray = [...existingTipsArray];
      
      // Add new auto-tips
      for (const [gameId, tip] of Object.entries(currentTips)) {
        newTipsArray.push({
          gameId,
          pick: tip.pick,
          pickedTeamAbbreviation: tip.pickedTeamAbbreviation,
          pickedTeamId: tip.pickedTeamId,
          submittedAt: tip.submittedAt
          // Note: confidence is optional and auto-tips don't use it
        });
      }
      
      await userTipsRef.set({
        userId,
        leagueId,
        week,
        season,
        tips: newTipsArray,
        submittedAt: admin.firestore.Timestamp.now(),
        lastUpdated: admin.firestore.Timestamp.now(),
        totalGames: newTipsArray.length
      }, { merge: true });
      
      logger.info(`Auto-tips applied successfully for user ${userId}: ${tipsApplied} tips`);
      
      // 4. Send notification to user
      await sendAutoTipsNotification(userId, leagueId, tipsApplied);
      
      return true;
    } else {
      logger.info(`No auto-tips applied for user ${userId} (all games already tipped)`);
      return true; // Still considered success
    }
    
  } catch (error) {
    logger.error(`Failed to apply auto-tips for user ${userId}:`, error);
    return false;
  }
}

/**
 * Send notification to user about auto-tips
 */
async function sendAutoTipsNotification(userId: string, leagueId: string, tipsCount: number): Promise<void> {
  try {
    // Get user data and FCM token
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData?.fcmToken) {
      logger.info(`No FCM token found for user ${userId}, skipping notification`);
      return;
    }
    
    // Check if user has auto-tips notifications enabled
    const prefs = userData.notificationPreferences;
    if (!prefs?.enabled || !prefs?.autoTipsAlerts) {
      logger.info(`Auto-tips notifications disabled for user ${userId}`);
      return;
    }
    
    // Check quiet hours
    if (isQuietHours(prefs.quietHours)) {
      logger.info(`Skipping auto-tips notification for user ${userId} due to quiet hours`);
      return;
    }
    
    // Get league name for context
    const leagueDoc = await db.collection('leagues').doc(leagueId).get();
    const leagueName = leagueDoc.data()?.name || 'your league';
    
    // Create friendly notification message
    const title = '🎯 Auto-Tips Applied!';
    const body = `I picked the favorites for ${tipsCount} game${tipsCount === 1 ? '' : 's'} in ${leagueName}. Good luck! 🍀`;
    
    const message = {
      token: userData.fcmToken,
      notification: { title, body },
      data: {
        type: 'auto_tips',
        leagueId,
        tipsCount: tipsCount.toString(),
        userId
      },
      webpush: {
        fcmOptions: {
          link: `/tips?league=${leagueId}`
        }
      }
    };
    
    await admin.messaging().send(message);
    logger.info(`Auto-tips notification sent to user ${userId}: ${tipsCount} tips applied`);
    
  } catch (error) {
    logger.error(`Error sending auto-tips notification to user ${userId}:`, error);
  }
}

// --- Scheduled Functions ---

/**
 * Auto-Lineup Checker - runs every 10 minutes during season
 * Triggers 1 hour before Sunday 1 PM games
 */
export const checkAutoLineups = onSchedule(
  {
    schedule: '*/10 * * * *', // Every 10 minutes
    timeZone: 'America/New_York', // NFL timezone
    ...autoAssistantOptions
  },
  async () => {
    try {
      logger.info('Starting auto-lineup check...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
      const now = Math.floor(Date.now() / 1000); // Current epoch seconds
      
      // Get this week's schedule from Firestore
      const scheduleDocId = `${currentSeason}_week_${currentWeek}`;
      const scheduleDoc = await db.collection('nfl_schedules').doc(scheduleDocId).get();
      
      if (!scheduleDoc.exists) {
        logger.info(`No schedule found for week ${currentWeek}, season ${currentSeason}`);
        return;
      }
      
      const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
      const games = scheduleData?.games || [];
      
      // Find Sunday 1 PM games starting in exactly 1 hour
      const sundayEarlyGames = games.filter(game => {
        const gameTime = parseInt(game.gameTime_epoch || '0');
        const gameDate = new Date(gameTime * 1000);
        const isSunday = gameDate.getDay() === 0; // Sunday
        const timeUntilGame = gameTime - now;
        
        return isSunday && 
               timeUntilGame > 3540 && timeUntilGame <= 3660 && // 59-61 minutes
               gameDate.getHours() === 13; // 1 PM ET
      });
      
      if (sundayEarlyGames.length === 0) {
        logger.info('No Sunday 1 PM games starting in 1 hour');
        return;
      }
      
      logger.info(`Found ${sundayEarlyGames.length} Sunday 1 PM games starting soon - triggering auto-lineup`);
      
      // Get all leagues with auto-lineup enabled
      const leagueIds = await getLeaguesWithAutoLineup();
      
      if (leagueIds.length === 0) {
        logger.info('No leagues have auto-lineup enabled');
        return;
      }
      
      logger.info(`Processing auto-lineup for ${leagueIds.length} leagues`);
      
      let totalProcessed = 0;
      let totalSuccess = 0;
      
      // Process each league
      for (const leagueId of leagueIds) {
        try {
          // Get league members
          const leagueDoc = await db.collection('leagues').doc(leagueId).get();
          const leagueData = leagueDoc.data();
          const memberUids = leagueData?.memberUids || [];
          
          // Process each member
          for (const userId of memberUids) {
            totalProcessed++;
            
            // Check if user has missing positions
            const missingPositions = await getMissingLineupPositions(userId, leagueId, currentWeek, currentSeason);
            
            if (missingPositions.length > 0) {
              logger.info(`User ${userId} has ${missingPositions.length} missing positions, applying auto-lineup`);
              const success = await applyAutoLineupForUser(userId, leagueId, currentWeek, currentSeason);
              if (success) {
                totalSuccess++;
              }
            } else {
              logger.info(`User ${userId} already has complete lineup, skipping`);
            }
          }
          
        } catch (error) {
          logger.error(`Error processing league ${leagueId}:`, error);
        }
      }
      
      logger.info(`Auto-lineup check completed: ${totalSuccess}/${totalProcessed} lineups processed successfully`);
      
    } catch (error) {
      logger.error('Error in auto-lineup check:', error);
    }
  }
);

/**
 * Auto-Tips Checker - runs every 15 minutes during season
 * Triggers before first game of the week and specific games
 */
export const checkAutoTips = onSchedule(
  {
    schedule: '*/15 * * * *', // Every 15 minutes
    timeZone: 'America/New_York', // NFL timezone
    ...autoAssistantOptions
  },
  async () => {
    try {
      logger.info('Starting auto-tips check...');
      
      const currentWeek = calculateCurrentNFLWeek();
      const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
      const now = Math.floor(Date.now() / 1000);
      
      // Get this week's schedule
      const scheduleDocId = `${currentSeason}_week_${currentWeek}`;
      const scheduleDoc = await db.collection('nfl_schedules').doc(scheduleDocId).get();
      
      if (!scheduleDoc.exists) {
        logger.info(`No schedule found for week ${currentWeek}, season ${currentSeason}`);
        return;
      }
      
      const scheduleData = scheduleDoc.data() as FirestoreWeeklySchedule;
      const games = scheduleData?.games || [];
      
      // Sort all games by time to find chronological order
      const gamesSorted = games
        .map(game => ({
          ...game,
          gameTime: parseInt(game.gameTime_epoch || '0')
        }))
        .sort((a, b) => a.gameTime - b.gameTime);
      
      if (gamesSorted.length === 0) {
        logger.info('No games found in schedule');
        return;
      }
      
      // Find games starting in exactly 1 hour
      const gamesStartingSoon = gamesSorted.filter(game => {
        const timeUntilGame = game.gameTime - now;
        return timeUntilGame > 3540 && timeUntilGame <= 3660; // 59-61 minutes
      });
      
      if (gamesStartingSoon.length === 0) {
        logger.info('No games starting in 1 hour');
        return;
      }
      
      // Check if any of the games starting soon is the FIRST game of the week
      const firstGameOfWeek = gamesSorted[0];
      const isFirstGameStarting = gamesStartingSoon.some(game => 
        game.gameTime === firstGameOfWeek.gameTime
      );
      
      logger.info(`Games starting soon: ${gamesStartingSoon.length}, First game starting: ${isFirstGameStarting}`);
      
      // Get all leagues with auto-tips enabled
      const leagueIds = await getLeaguesWithAutoTips();
      
      if (leagueIds.length === 0) {
        logger.info('No leagues have auto-tips enabled');
        return;
      }
      
      let totalProcessed = 0;
      let totalSuccess = 0;
      
      // Process each league
      for (const leagueId of leagueIds) {
        try {
          // Get league members
          const leagueDoc = await db.collection('leagues').doc(leagueId).get();
          const leagueData = leagueDoc.data();
          const memberUids = leagueData?.memberUids || [];
          
          // Process each member
          for (const userId of memberUids) {
            totalProcessed++;
            
            if (isFirstGameStarting) {
              // First game starting - apply auto-tips for ALL games of the week
              const success = await applyAutoTipsForGames(userId, leagueId, gamesSorted, currentWeek, currentSeason);
              if (success) totalSuccess++;
            } else {
              // Not first game - only tip the specific games starting now
              const success = await applyAutoTipsForGames(userId, leagueId, gamesStartingSoon, currentWeek, currentSeason);
              if (success) totalSuccess++;
            }
          }
          
        } catch (error) {
          logger.error(`Error processing league ${leagueId} for auto-tips:`, error);
        }
      }
      
      logger.info(`Auto-tips check completed: ${totalSuccess}/${totalProcessed} tip sets processed successfully`);
      
    } catch (error) {
      logger.error('Error in auto-tips check:', error);
    }
  }
);