import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { config, REGION } from './config';
import { calculateCurrentNFLWeek } from './common';
import type { NotificationPreferences, FirestoreUser } from './types';

// Initialize messaging if not already done
const messaging = admin.messaging();

// Generate friendly, casual notification messages
function generateFriendlyNotificationMessage(
  homeTeam: string,
  awayTeam: string,
  minutesUntilGame: number,
  positionCount: number,
  leagueName: string
): { title: string; body: string } {
  
  // Friendly titles with emojis
  const titles = [
    "🏈 Game time approaching!",
    "⏰ Quick lineup check",
    "🚨 Games starting soon!",
    "⚡ Fantasy reminder"
  ];
  
  // Generate body based on urgency and context
  let body: string;
  
  if (minutesUntilGame <= 5) {
    // Ultra urgent - last minute
    body = `${homeTeam} vs ${awayTeam} starts in ${minutesUntilGame} minutes! Quick - you still need to pick ${positionCount} players. Tap to set your lineup! 🏃‍♂️`;
  } else if (minutesUntilGame <= 15) {
    // Very urgent 
    body = `Hey! ${homeTeam} vs ${awayTeam} kicks off in ${minutesUntilGame} minutes and you're missing ${positionCount} picks in ${leagueName}. Tap to complete your lineup! ⚡`;
  } else if (minutesUntilGame <= 30) {
    // Moderate urgency
    if (positionCount === 1) {
      body = `${homeTeam} vs ${awayTeam} starts in ${minutesUntilGame} minutes - you just need 1 more player for ${leagueName}! 👆`;
    } else {
      body = `Heads up! ${homeTeam} vs ${awayTeam} starts in ${minutesUntilGame} minutes. You've got ${positionCount} spots to fill in ${leagueName} 🏈`;
    }
  } else {
    // Early reminder - casual tone
    if (positionCount <= 2) {
      body = `Almost done! Just need ${positionCount} more picks for ${homeTeam} vs ${awayTeam} (starts in ${minutesUntilGame} min) 😊`;
    } else {
      body = `${homeTeam} vs ${awayTeam} starts in ${minutesUntilGame} minutes. Want to finish your ${leagueName} lineup? You've got ${positionCount} picks left 👍`;
    }
  }
  
  // Pick a random friendly title
  const title = titles[Math.floor(Math.random() * titles.length)];
  
  return { title, body };
}

interface LineupDeadlineAlert {
  userId: string;
  leagueId: string;
  leagueName: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: number; // epoch seconds
  missingPositions: string[];
}

// Helper function to perform the lineup deadline check logic
async function performLineupDeadlineCheck(): Promise<{ success: boolean; alertsSent: number; message: string }> {
  console.log('Starting lineup deadline check...');
  
  try {
    const currentWeek = calculateCurrentNFLWeek();
    const currentSeason = parseInt(config.CURRENT_NFL_SEASON, 10);
    const now = Math.floor(Date.now() / 1000); // Current time in epoch seconds
      
      // Get this week's schedule
      const scheduleDoc = await admin.firestore()
        .collection('nfl_schedules')
        .doc(`${currentSeason}_week_${currentWeek}`)
        .get();
      
      if (!scheduleDoc.exists) {
        console.log('No schedule found for current week');
        return { success: false, alertsSent: 0, message: 'No schedule found for current week' };
      }
      
      const scheduleData = scheduleDoc.data();
      const games = scheduleData?.games || [];
      
             // Find games starting in the next 30-60 minutes
       const upcomingGames = games.filter((game: { gameTime_epoch: string | number; gameID: string; home?: string; away?: string }) => {
        const gameTime = typeof game.gameTime_epoch === 'string' 
          ? parseInt(game.gameTime_epoch) 
          : game.gameTime_epoch;
        const timeUntilGame = gameTime - now;
        return timeUntilGame > 0 && timeUntilGame <= 3600; // Next hour
      });
      
      if (upcomingGames.length === 0) {
        console.log('No games starting in the next hour');
        return { success: true, alertsSent: 0, message: 'No games starting in the next hour' };
      }
      
      console.log(`Found ${upcomingGames.length} games starting soon`);
      
      // Get all users with notification preferences
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('notificationPreferences.enabled', '==', true)
        .where('notificationPreferences.lineupDeadlineAlerts', '==', true)
        .get();
      
      console.log(`Found ${usersSnapshot.docs.length} users with notifications enabled`);
      
      const alerts: LineupDeadlineAlert[] = [];
      
      // Check each user's lineups
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as FirestoreUser;
        const userId = userDoc.id;
        
        console.log(`Checking user ${userId}, has FCM token: ${!!userData.fcmToken}`);
        
        if (!userData.fcmToken) {
          console.log(`Skipping user ${userId} - no FCM token`);
          continue;
        }
        
        const notificationMinutes = userData.notificationPreferences?.lineupDeadlineMinutes || 30;
        console.log(`User ${userId} notification window: ${notificationMinutes} minutes`);
        
        // Get user's leagues
        const leaguesSnapshot = await admin.firestore()
          .collection('leagues')
          .where('memberUids', 'array-contains', userId)
          .get();
        
        console.log(`User ${userId} is in ${leaguesSnapshot.docs.length} leagues`);
        
        for (const leagueDoc of leaguesSnapshot.docs) {
          const leagueData = leagueDoc.data();
          const leagueId = leagueDoc.id;
          
          // Check if user has lineup for this week
          const lineupDocId = `${leagueId}_${currentSeason}_${currentWeek}`;
          const lineupDoc = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('weeklyLineups')
            .doc(lineupDocId)
            .get();
          
          const lineupData = lineupDoc.data();
          const isComplete = lineupData?.isComplete === true;
          
          console.log(`User ${userId} in league ${leagueId}: lineup exists: ${lineupDoc.exists}, isComplete: ${isComplete}`);
          
          if (!isComplete) {
            // Check which games this user needs to set lineups for
            for (const game of upcomingGames) {
              const gameTime = typeof game.gameTime_epoch === 'string' 
                ? parseInt(game.gameTime_epoch) 
                : game.gameTime_epoch;
              const timeUntilGame = gameTime - now;
              const minutesUntilGame = Math.floor(timeUntilGame / 60);
              
              console.log(`Game ${game.gameID}: ${minutesUntilGame} minutes until start, user wants alerts ${notificationMinutes} minutes before`);
              
              // Send notification if within user's preferred time window
              if (minutesUntilGame <= notificationMinutes) {
                console.log(`Creating alert for user ${userId} in league ${leagueId} for game ${game.gameID}`);
                // Determine missing positions (simplified - could be more specific)
                const picks = lineupData?.picks || {};
                const allPositions = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
                const missingPositions = allPositions.filter(pos => !picks[pos]);
                
                alerts.push({
                  userId,
                  leagueId,
                  leagueName: leagueData.name,
                  gameId: game.gameID,
                  homeTeam: game.home || 'Home',
                  awayTeam: game.away || 'Away',
                  gameTime: gameTime,
                  missingPositions
                });
              }
            }
          }
        }
      }
      
      // Send notifications
      console.log(`Sending ${alerts.length} lineup deadline alerts`);
      
      const notificationPromises = alerts.map(async (alert) => {
        try {
          const userDoc = await admin.firestore()
            .collection('users')
            .doc(alert.userId)
            .get();
          
          const userData = userDoc.data() as FirestoreUser;
          if (!userData.fcmToken) return;
          
          const minutesUntilGame = Math.floor((alert.gameTime - now) / 60);
          const positionCount = alert.missingPositions.length;
          
          // Generate friendly, casual notification message
          const { title, body } = generateFriendlyNotificationMessage(
            alert.homeTeam,
            alert.awayTeam,
            minutesUntilGame,
            positionCount,
            alert.leagueName
          );
          
          const message = {
            token: userData.fcmToken,
            notification: {
              title,
              body
            },
            data: {
              type: 'lineup_deadline',
              leagueId: alert.leagueId,
              gameId: alert.gameId,
              week: currentWeek.toString(),
              season: currentSeason.toString()
            },
            webpush: {
              fcmOptions: {
                link: `/lineup?league=${alert.leagueId}&week=${currentWeek}`
              }
            }
          };
          
          await messaging.send(message);
          console.log(`Sent lineup deadline alert to user ${alert.userId} for league ${alert.leagueName}`);
          
        } catch (error) {
          console.error(`Failed to send notification to user ${alert.userId}:`, error);
        }
      });
      
      await Promise.all(notificationPromises);
      console.log('Lineup deadline check completed');
      
      return { success: true, alertsSent: alerts.length, message: `Sent ${alerts.length} lineup deadline alerts` };
      
    } catch (error) {
      console.error('Error in lineup deadline check:', error);
      return { success: false, alertsSent: 0, message: `Error: ${error}` };
    }
}

// Function to check lineups and send deadline notifications
export const checkLineupDeadlines = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: REGION,
  },
  async () => {
    await performLineupDeadlineCheck();
  }
);

// Manual trigger for testing
export const triggerLineupDeadlineCheck = onCall(
  { region: REGION, cors: true },
  async (request) => {
    // Verify admin access
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    // Check if user is admin (you can implement this check)
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    if (!userData?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    try {
      // Manually trigger the lineup deadline check
      console.log('Manual trigger for lineup deadline check');
      const result = await performLineupDeadlineCheck();
      return result;
    } catch (error) {
      console.error('Error triggering lineup deadline check:', error);
      throw new HttpsError('internal', 'Failed to trigger lineup deadline check');
    }
  }
);

// Function to send performance alerts (captain success, scoring)
export const sendPerformanceAlert = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { type, playerName, points, isCaptain } = request.data;
    
    try {
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(request.auth.uid)
        .get();
      
      const userData = userDoc.data() as FirestoreUser;
      
      if (!userData?.fcmToken) {
        return { success: false, message: 'No FCM token found' };
      }
      
      // Check if user has performance notifications enabled
      const prefs = userData.notificationPreferences;
      if (!prefs?.enabled || !prefs?.scoringAlerts) {
        return { success: false, message: 'Performance notifications disabled' };
      }
      
      let title: string;
      let body: string;
      
      if (type === 'captain_success' && isCaptain && prefs?.captainSuccessAlerts) {
        title = '🔥 Captain Success!';
        body = `Your captain ${playerName} scored ${points} points! Great choice! 🎯`;
      } else if (type === 'big_performance' && points >= 20) {
        title = '🚀 Big Performance!';
        body = `${playerName} is having a huge game with ${points} points! 💪`;
      } else if (type === 'scoring_update' && points >= 10) {
        title = '📈 Scoring Update';
        body = `${playerName} just scored! Now at ${points} fantasy points 🏈`;
      } else {
        return { success: false, message: 'Notification criteria not met' };
      }
      
      const message = {
        token: userData.fcmToken,
        notification: { title, body },
        data: {
          type,
          playerName,
          points: points.toString()
        }
      };
      
      await messaging.send(message);
      console.log(`Sent performance alert to user ${request.auth.uid}: ${title}`);
      
      return { success: true, message: 'Performance alert sent' };
      
    } catch (error) {
      console.error('Error sending performance alert:', error);
      throw new HttpsError('internal', 'Failed to send performance alert');
    }
  }
);

// Function to send injury alerts
export const sendInjuryAlert = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { playerName, injuryStatus, injuryDetails, suggestedReplacement } = request.data;
    
    try {
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(request.auth.uid)
        .get();
      
      const userData = userDoc.data() as FirestoreUser;
      
      if (!userData?.fcmToken) {
        return { success: false, message: 'No FCM token found' };
      }
      
      // Check if user has injury notifications enabled
      const prefs = userData.notificationPreferences;
      if (!prefs?.enabled || !prefs?.injuryAlerts) {
        return { success: false, message: 'Injury notifications disabled' };
      }
      
      let title: string;
      let body: string;
      
      if (injuryStatus === 'Out') {
        title = '🏥 Injury Alert';
        body = `${playerName} is ruled OUT. ${suggestedReplacement ? `Consider ${suggestedReplacement} as replacement.` : 'Time to find a replacement!'} ${injuryDetails ? `(${injuryDetails})` : ''}`;
      } else if (injuryStatus === 'Questionable') {
        title = '⚠️ Injury Update';
        body = `${playerName} is questionable to play. ${suggestedReplacement ? `Backup plan: ${suggestedReplacement}` : 'Keep an eye on this!'} ${injuryDetails ? `(${injuryDetails})` : ''}`;
      } else if (injuryStatus === 'Doubtful') {
        title = '🔶 Injury Warning';
        body = `${playerName} is doubtful - ${suggestedReplacement ? `consider ${suggestedReplacement}` : 'might want to consider alternatives'}. ${injuryDetails ? `(${injuryDetails})` : ''}`;
      } else {
        return { success: false, message: 'Non-critical injury status' };
      }
      
      const message = {
        token: userData.fcmToken,
        notification: { title, body },
        data: {
          type: 'injury_alert',
          playerName,
          injuryStatus,
          injuryDetails: injuryDetails || '',
          suggestedReplacement: suggestedReplacement || ''
        }
      };
      
      await messaging.send(message);
      console.log(`Sent injury alert to user ${request.auth.uid}: ${playerName} - ${injuryStatus}`);
      
      return { success: true, message: 'Injury alert sent' };
      
    } catch (error) {
      console.error('Error sending injury alert:', error);
      throw new HttpsError('internal', 'Failed to send injury alert');
    }
  }
);

// Function to send achievement alerts
export const sendAchievementAlert = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { achievementType, weekCount, leagueName } = request.data;
    
    try {
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(request.auth.uid)
        .get();
      
      const userData = userDoc.data() as FirestoreUser;
      
      if (!userData?.fcmToken) {
        return { success: false, message: 'No FCM token found' };
      }
      
      // Check if user has achievement notifications enabled
      const prefs = userData.notificationPreferences;
      if (!prefs?.enabled || !prefs?.achievementAlerts) {
        return { success: false, message: 'Achievement notifications disabled' };
      }
      
      let title: string;
      let body: string;
      
      if (achievementType === 'complete_streak') {
        title = '🏆 Achievement Unlocked!';
        if (weekCount === 3) {
          body = `Nice! You've set complete lineups for 3 weeks straight in ${leagueName}! 💪`;
        } else if (weekCount === 5) {
          body = `Awesome! 5 weeks of complete lineups in ${leagueName}! You're on fire! 🔥`;
        } else {
          body = `Amazing! ${weekCount} weeks of complete lineups in ${leagueName}! Keep it up! 🌟`;
        }
      } else if (achievementType === 'perfect_week') {
        title = '🎯 Perfect Week!';
        body = `Incredible! You got every lineup spot right this week in ${leagueName}! 🤩`;
      } else {
        return { success: false, message: 'Unknown achievement type' };
      }
      
      const message = {
        token: userData.fcmToken,
        notification: { title, body },
        data: {
          type: 'achievement',
          achievementType,
          weekCount: weekCount?.toString() || '',
          leagueName
        }
      };
      
      await messaging.send(message);
      console.log(`Sent achievement alert to user ${request.auth.uid}: ${achievementType}`);
      
      return { success: true, message: 'Achievement alert sent' };
      
    } catch (error) {
      console.error('Error sending achievement alert:', error);
      throw new HttpsError('internal', 'Failed to send achievement alert');
    }
  }
);

// Function to update user notification preferences
export const updateNotificationPreferences = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const data = request.data as NotificationPreferences;
    
    try {
      await admin.firestore()
        .collection('users')
        .doc(request.auth.uid)
        .set({ notificationPreferences: data }, { merge: true });
      
      return { success: true, message: 'Notification preferences updated' };
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw new HttpsError('internal', 'Failed to update notification preferences');
    }
  }
); 