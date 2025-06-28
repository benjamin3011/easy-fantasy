import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { config, REGION } from './config';
import { calculateCurrentNFLWeek } from './common';
import type { NotificationPreferences, FirestoreUser } from './types';

// Initialize messaging if not already done
const messaging = admin.messaging();

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
          
          const message = {
            token: userData.fcmToken,
            notification: {
              title: '⏰ Lineup Deadline Alert',
              body: `${alert.homeTeam} vs ${alert.awayTeam} starts in ${minutesUntilGame} minutes! You have ${positionCount} positions to fill in ${alert.leagueName}.`
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
  { region: REGION },
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

// Function to update user notification preferences
export const updateNotificationPreferences = onCall(
  { region: REGION },
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