import * as admin from 'firebase-admin';
import type { PushSubscription } from 'web-push';
import webpush from 'web-push';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { config, REGION, secrets } from './config';
import { calculateCurrentNFLWeek } from './common';
import type { NotificationPreferences, FirestoreUser } from './types';
import { logger } from 'firebase-functions/v2';

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
  
  // Friendly titles with emojis (context-aware)
  let titles: string[];
  
  if (minutesUntilGame <= 60) {
    // Urgent titles for games starting soon
    titles = [
      "🏈 Game time approaching!",
      "⏰ Quick lineup check",
      "🚨 Games starting soon!",
      "⚡ Fantasy reminder"
    ];
  } else if (minutesUntilGame <= 720) {
    // Half-day titles
    titles = [
      "🏈 Lineup reminder",
      "⏰ Fantasy check-in",
      "📋 Complete your lineup",
      "⚡ Fantasy update"
    ];
  } else {
    // Day-ahead titles
    titles = [
      "📅 Fantasy reminder",
      "🗓️ Upcoming games",
      "📋 Lineup check",
      "⏰ Don't forget!"
    ];
  }
  
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
  } else if (minutesUntilGame <= 180) {
    // Short-term reminder (within 3 hours)
    if (positionCount <= 2) {
      body = `Almost done! Just need ${positionCount} more picks for ${homeTeam} vs ${awayTeam} (starts in ${minutesUntilGame} min) 😊`;
    } else {
      body = `${homeTeam} vs ${awayTeam} starts in ${minutesUntilGame} minutes. Want to finish your ${leagueName} lineup? You've got ${positionCount} picks left 👍`;
    }
  } else if (minutesUntilGame <= 720) {
    // Half-day reminder (within 12 hours)
    const hours = Math.floor(minutesUntilGame / 60);
    if (positionCount === 1) {
      body = `${homeTeam} vs ${awayTeam} starts in ${hours} hours - just need 1 more player for ${leagueName}! 🎯`;
    } else {
      body = `${homeTeam} vs ${awayTeam} kicks off in ${hours} hours. You've got ${positionCount} picks to make in ${leagueName} 📋`;
    }
  } else {
    // Day-ahead reminder (24+ hours)
    const hours = Math.floor(minutesUntilGame / 60);
    if (positionCount <= 2) {
      body = `Don't forget! ${homeTeam} vs ${awayTeam} starts in ${hours} hours. Almost done - just ${positionCount} more picks for ${leagueName}! 📅`;
    } else {
      body = `Reminder: ${homeTeam} vs ${awayTeam} starts in ${hours} hours. You've got ${positionCount} lineup spots to fill in ${leagueName} 🗓️`;
    }
  }
  
  // Pick a random friendly title
  const title = titles[Math.floor(Math.random() * titles.length)];
  
  return { title, body };
}

// Persist a notification document for in-app history/UX
async function persistUserNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channel: 'fcm' | 'webpush' | 'inapp' = 'inapp',
  source: string = 'functions'
) {
  try {
    await admin
      .firestore()
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .add({
        type,
        title,
        body,
        data: data ?? {},
        channel,
        source,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        readAt: null,
      });
  } catch (e) {
    logger.warn('Failed to persist user notification', { userId, type, error: e });
  }
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
  logger.info('Starting lineup deadline check...');
  
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
        logger.info('No schedule found for current week');
        return { success: false, alertsSent: 0, message: 'No schedule found for current week' };
      }
      
      const scheduleData = scheduleDoc.data();
      const games = scheduleData?.games || [];
      
             // Find games starting in the next 24 hours (to accommodate day-ahead notifications)
       const upcomingGames = games.filter((game: { gameTime_epoch: string | number; gameID: string; home?: string; away?: string }) => {
        const gameTime = typeof game.gameTime_epoch === 'string' 
          ? parseInt(game.gameTime_epoch) 
          : game.gameTime_epoch;
        const timeUntilGame = gameTime - now;
        return timeUntilGame > 0 && timeUntilGame <= 86400; // Next 24 hours
      });
      
      if (upcomingGames.length === 0) {
        logger.info('No games starting in the next 24 hours');
        return { success: true, alertsSent: 0, message: 'No games starting in the next 24 hours' };
      }
      
      logger.info(`Found ${upcomingGames.length} games starting soon`);
      
      // Get all users with notification preferences
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('notificationPreferences.enabled', '==', true)
        .where('notificationPreferences.lineupDeadlineAlerts', '==', true)
        .get();
      
      logger.info(`Found ${usersSnapshot.docs.length} users with notifications enabled`);
      
      const alerts: LineupDeadlineAlert[] = [];
      
      // Check each user's lineups
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as FirestoreUser;
        const userId = userDoc.id;
        
        logger.debug(`Checking user ${userId}, has FCM token: ${!!userData.fcmToken}`);
        
        if (!userData.fcmToken) {
          logger.debug(`Skipping user ${userId} - no FCM token`);
          continue;
        }
        
        const notificationMinutes = userData.notificationPreferences?.lineupDeadlineMinutes || 30;
        logger.debug(`User ${userId} notification window: ${notificationMinutes} minutes`);
        
        // Get user's leagues
        const leaguesSnapshot = await admin.firestore()
          .collection('leagues')
          .where('memberUids', 'array-contains', userId)
          .get();
        
        logger.debug(`User ${userId} is in ${leaguesSnapshot.docs.length} leagues`);
        
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
          
          logger.debug(`User ${userId} in league ${leagueId}: lineup exists: ${lineupDoc.exists}, isComplete: ${isComplete}`);
          
          if (!isComplete) {
            // Check which games this user needs to set lineups for
            for (const game of upcomingGames) {
              const gameTime = typeof game.gameTime_epoch === 'string' 
                ? parseInt(game.gameTime_epoch) 
                : game.gameTime_epoch;
              const timeUntilGame = gameTime - now;
              const minutesUntilGame = Math.floor(timeUntilGame / 60);
              
              logger.debug(`Game ${game.gameID}: ${minutesUntilGame} minutes until start, user wants alerts ${notificationMinutes} minutes before`);
              
              // Send notification if within user's preferred time window
              if (minutesUntilGame <= notificationMinutes) {
                logger.debug(`Creating alert for user ${userId} in league ${leagueId} for game ${game.gameID}`);
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
      logger.info(`Sending ${alerts.length} lineup deadline alerts`);
      
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
          
          try {
            await messaging.send(message);
            logger.info(`Sent lineup deadline alert (FCM) to user ${alert.userId} for league ${alert.leagueName}`);
          } catch (fcmError: unknown) {
            const msg = (fcmError as { errorInfo?: { code?: string } })?.errorInfo?.code || '';
            if (msg === 'messaging/registration-token-not-registered') {
              // Clean up invalid token
              await admin.firestore().collection('users').doc(alert.userId).set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
              logger.warn(`Removed invalid FCM token for user ${alert.userId}`);
            } else {
              logger.warn('FCM send failed for user', { userId: alert.userId, error: fcmError });
            }
          }
          
          // Also attempt Web Push for Safari/iOS PWA users
          await sendWebPushToUser(alert.userId, {
            title,
            body,
            data: { type: 'lineup_deadline', leagueId: alert.leagueId, week: currentWeek, season: currentSeason },
          });
          // Persist notification for in-app center
          await persistUserNotification(
            alert.userId,
            'lineup_deadline',
            title,
            body,
            { leagueId: alert.leagueId, gameId: alert.gameId, week: currentWeek, season: currentSeason }
          );
          
        } catch (error) {
          logger.error(`Failed to send notification to user ${alert.userId}:`, { error });
        }
      });
      
      await Promise.all(notificationPromises);
      logger.info('Lineup deadline check completed');
      
      return { success: true, alertsSent: alerts.length, message: `Sent ${alerts.length} lineup deadline alerts` };
      
    } catch (error) {
      logger.error('Error in lineup deadline check:', { error });
      return { success: false, alertsSent: 0, message: `Error: ${error}` };
    }
}

// Function to check lineups and send deadline notifications
export const checkLineupDeadlines = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: REGION,
    timeZone: 'Europe/Berlin',
    secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY],
  },
  async () => {
    await performLineupDeadlineCheck();
  }
);

// Manual trigger for testing
export const triggerLineupDeadlineCheck = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
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
      logger.info('Manual trigger for lineup deadline check');
      const result = await performLineupDeadlineCheck();
      return result;
    } catch (error) {
      logger.error('Error triggering lineup deadline check:', { error });
      throw new HttpsError('internal', 'Failed to trigger lineup deadline check');
    }
  }
);

// --- Web Push (Safari/iOS PWA) Support ---
let webPushConfigured = false;
function ensureWebPushConfigured(): boolean {
  try {
    const pub = secrets.WEB_PUSH_VAPID_PUBLIC_KEY.value();
    const priv = secrets.WEB_PUSH_VAPID_PRIVATE_KEY.value();
    if (!pub || !priv) return false;
    if (!webPushConfigured) {
      webpush.setVapidDetails('mailto:support@easy-fantasy.app', pub, priv);
      webPushConfigured = true;
    }
    return true;
  } catch {
    return false;
  }
}

export const saveWebPushSubscription = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const raw = request.data?.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string }; toJSON?: () => unknown } | undefined;
    const sub = (raw && typeof raw.toJSON === 'function') ? (raw.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }) : raw;
    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new HttpsError('invalid-argument', 'Missing subscription');
    }
    try {
      // Store a sanitized subscription
      await admin.firestore().collection('users').doc(request.auth.uid).set({ webPushSubscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } } }, { merge: true });
      return { success: true };
    } catch {
      throw new HttpsError('internal', 'Failed to save subscription');
    }
  }
);

export async function sendWebPushToUser(userId: string, payload: Record<string, unknown>) {
  if (!ensureWebPushConfigured()) return;
  const userSnap = await admin.firestore().collection('users').doc(userId).get();
  const saved = userSnap.data()?.webPushSubscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  if (!saved || typeof saved.endpoint !== 'string' || !saved.endpoint) {
    logger.warn('WebPush: missing endpoint for user', { userId });
    return;
  }
  if (!saved.keys?.p256dh || !saved.keys?.auth) {
    logger.warn('WebPush: missing keys for user', { userId });
    return;
  }
  const sub = { endpoint: saved.endpoint, keys: { p256dh: saved.keys.p256dh, auth: saved.keys.auth } } as unknown as PushSubscription;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (e) {
    logger.warn('WebPush send failed', e as Error);
  }
}

// Function to send performance alerts (captain success, scoring)
export const sendPerformanceAlert = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
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
      
      // Try FCM first if token exists
      const token = userData.fcmToken;
      if (token) {
        const message = {
          token,
          notification: { title, body },
          data: { type, playerName, points: points.toString() }
        };
        try {
          await messaging.send(message);
          logger.info(`Sent performance alert (FCM) to user ${request.auth.uid}: ${title}`);
        } catch (err: unknown) {
          const msg = (err as { errorInfo?: { code?: string } })?.errorInfo?.code || '';
          if (msg === 'messaging/registration-token-not-registered') {
            // Clean up invalid token to prevent future failures
            await admin.firestore().collection('users').doc(request.auth.uid).set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
            logger.warn(`Removed invalid FCM token for user ${request.auth.uid}`);
          } else {
            logger.warn('FCM send failed', err);
          }
        }
      }

      // Also attempt Web Push (iOS PWA/Safari)
      await sendWebPushToUser(request.auth.uid, { title, body, data: { type, playerName, points: String(points) } });
      await persistUserNotification(request.auth.uid, 'performance', title, body, { type, playerName, points });

      return { success: true, message: 'Performance alert dispatched' };
      
    } catch (error) {
      logger.error('Error sending performance alert:', { error });
      throw new HttpsError('internal', 'Failed to send performance alert');
    }
  }
);

// Function to send injury alerts
export const sendInjuryAlert = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
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
      
      const token = userData.fcmToken;
      if (token) {
        const message = {
          token,
          notification: { title, body },
          data: {
            type: 'injury_alert',
            playerName,
            injuryStatus,
            injuryDetails: injuryDetails || '',
            suggestedReplacement: suggestedReplacement || ''
          }
        };
        try {
          await messaging.send(message);
          logger.info(`Sent injury alert (FCM) to user ${request.auth.uid}: ${playerName} - ${injuryStatus}`);
        } catch (err: unknown) {
          const msg = (err as { errorInfo?: { code?: string } })?.errorInfo?.code || '';
          if (msg === 'messaging/registration-token-not-registered') {
            await admin.firestore().collection('users').doc(request.auth.uid).set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
            logger.warn(`Removed invalid FCM token for user ${request.auth.uid}`);
          } else {
            logger.warn('FCM send failed', err);
          }
        }
      }

      await sendWebPushToUser(request.auth.uid, { title, body, data: { type: 'injury_alert', playerName, injuryStatus } });
      await persistUserNotification(request.auth.uid, 'injury', title, body, { playerName, injuryStatus, injuryDetails, suggestedReplacement });
      
      return { success: true, message: 'Injury alert dispatched' };
      
    } catch (error) {
      logger.error('Error sending injury alert:', { error });
      throw new HttpsError('internal', 'Failed to send injury alert');
    }
  }
);

// Function to send achievement alerts
export const sendAchievementAlert = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
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
      
      try {
        await messaging.send(message);
        logger.info(`Sent achievement alert to user ${request.auth.uid}: ${achievementType}`);
      } catch (err: unknown) {
        const msg = (err as { errorInfo?: { code?: string } })?.errorInfo?.code || '';
        if (msg === 'messaging/registration-token-not-registered') {
          // Clean up invalid token to prevent future failures
          await admin.firestore().collection('users').doc(request.auth.uid).set({ fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
          logger.warn(`Removed invalid FCM token for user ${request.auth.uid}`);
          return { success: false, message: 'FCM token was invalid and has been removed. Please refresh the page to generate a new token.' };
        } else {
          logger.warn('FCM send failed', err);
          throw err; // Re-throw non-token errors
        }
      }
      
      await persistUserNotification(request.auth.uid, 'achievement', title, body, { achievementType, weekCount, leagueName });
      
      return { success: true, message: 'Achievement alert sent' };
      
    } catch (error) {
      logger.error('Error sending achievement alert:', { error });
      throw new HttpsError('internal', 'Failed to send achievement alert');
    }
  }
);

// Function to update user notification preferences
export const updateNotificationPreferences = onCall(
  { region: REGION, cors: true, secrets: [secrets.WEB_PUSH_VAPID_PUBLIC_KEY, secrets.WEB_PUSH_VAPID_PRIVATE_KEY] },
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
      logger.error('Error updating notification preferences:', { error });
      throw new HttpsError('internal', 'Failed to update notification preferences');
    }
  }
); 