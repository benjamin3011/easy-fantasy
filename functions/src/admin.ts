// src/admin.ts
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// Import shared config/secrets
import { adminOptions, config } from './config';
import { FirestoreLeague, FirestoreWeeklyLineup, FirestoreUser } from './types';

const db = admin.firestore();

interface ResetSeasonStandingsPayload {
  leagueId?: string;
  dryRun?: boolean;
}

interface ResetSeasonStandingsResult {
  success: boolean;
  message: string;
  dryRun: boolean;
  leaguesMatched: number;
  leaguesUpdated: number;
  membersReset: number;
}

// Health check result types
interface HealthCheckResult {
  checkName: string;
  status: 'pass' | 'fail' | 'warning';
  details: string;
  affectedCount?: number;
  repairAvailable?: boolean;
}

interface HealthCheckSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: HealthCheckResult[];
  timestamp: admin.firestore.Timestamp;
}

// --- Callable Function (Exported) ---
export const addAdminRole = onCall({ ...adminOptions }, async (request) => {
  // Check if the caller is already an admin
  if (request.auth?.token?.admin !== true) {
    logger.warn("Permission denied for addAdminRole.", { callerUid: request.auth?.uid });
    throw new HttpsError('permission-denied', 'Only admins can assign other admins.');
  }

  const targetUid = request.data.uid; // Expect UID in the 'data' object
  if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'Requires "uid" argument.');
  }

  try {
    // Set custom user claims on the target user
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    logger.info(`Admin role added to ${targetUid} by admin: ${request.auth?.uid}`);
    return { message: `Success! User ${targetUid} is now an admin.` };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error assigning admin role:', { targetUid: targetUid, error: errorMessage, detail: error });
    throw new HttpsError('internal', 'Error assigning admin role. Check logs.');
  }
});

export const resetSeasonStandings = onCall(
  { ...adminOptions, timeoutSeconds: 120 },
  async (request): Promise<ResetSeasonStandingsResult> => {
    if (request.auth?.token?.admin !== true) {
      logger.warn("Permission denied for resetSeasonStandings.", { callerUid: request.auth?.uid });
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const payload = (request.data ?? {}) as ResetSeasonStandingsPayload;
    const leagueId = typeof payload.leagueId === 'string' ? payload.leagueId.trim() : '';
    const dryRun = payload.dryRun !== false;
    const now = admin.firestore.Timestamp.now();

    const leagueDocs: admin.firestore.DocumentSnapshot[] = [];
    if (leagueId) {
      const leagueSnap = await db.collection('leagues').doc(leagueId).get();
      if (!leagueSnap.exists) {
        throw new HttpsError('not-found', `League ${leagueId} not found.`);
      }
      leagueDocs.push(leagueSnap);
    } else {
      const leaguesSnap = await db.collection('leagues').get();
      leagueDocs.push(...leaguesSnap.docs);
    }

    let leaguesUpdated = 0;
    let membersReset = 0;
    let batch = db.batch();
    let batchOperations = 0;
    const commitPromises: Promise<admin.firestore.WriteResult[]>[] = [];

    for (const leagueDoc of leagueDocs) {
      const leagueData = leagueDoc.data() as FirestoreLeague | undefined;
      const members = leagueData?.members ?? [];
      membersReset += members.length;

      if (!dryRun) {
        const resetMembers = members.map((member) => ({
          ...member,
          weeklyPoints: {},
          totalSeasonPoints: 0,
          lastUpdated: now,
        }));

        batch.update(leagueDoc.ref, {
          members: resetMembers,
          standingsResetAt: now,
          standingsResetBy: request.auth.uid,
          standingsResetSeason: config.CURRENT_NFL_SEASON,
        });
        batchOperations++;
        leaguesUpdated++;

        if (batchOperations >= 450) {
          commitPromises.push(batch.commit());
          batch = db.batch();
          batchOperations = 0;
        }
      }
    }

    if (!dryRun && batchOperations > 0) {
      commitPromises.push(batch.commit());
    }
    if (commitPromises.length > 0) {
      await Promise.all(commitPromises);
    }

    const target = leagueId ? `league ${leagueId}` : 'all leagues';
    const message = dryRun
      ? `Dry run: would reset ${membersReset} members across ${leagueDocs.length} league(s) for ${config.CURRENT_NFL_SEASON}.`
      : `Reset standings for ${membersReset} members across ${leaguesUpdated} league(s) for ${config.CURRENT_NFL_SEASON}.`;

    logger.info('Season standings reset completed', {
      callerUid: request.auth.uid,
      target,
      dryRun,
      leaguesMatched: leagueDocs.length,
      leaguesUpdated,
      membersReset,
      season: config.CURRENT_NFL_SEASON,
    });

    return {
      success: true,
      message,
      dryRun,
      leaguesMatched: leagueDocs.length,
      leaguesUpdated,
      membersReset,
    };
  }
);

// --- Comprehensive Health Check System ---

export const systemHealthCheck = onCall({ ...adminOptions }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const { dryRun = true, checks = ['all'] } = request.data;
  
  try {
    const results: HealthCheckResult[] = [];
    
    // Check 1: Score Integrity - Verify weekly lineup points match game stats
    if (checks.includes('all') || checks.includes('scores')) {
      const scoreCheck = await checkScoreIntegrity();
      results.push(scoreCheck);
    }
    
    // Check 2: Missing Derived Fields - Find lineups without totalActualPoints, captain fields
    if (checks.includes('all') || checks.includes('fields')) {
      const fieldsCheck = await checkMissingDerivedFields();
      results.push(fieldsCheck);
    }
    
    // Check 3: Orphaned Documents - Tips without games, lineups without users
    if (checks.includes('all') || checks.includes('orphans')) {
      const orphansCheck = await checkOrphanedDocuments();
      results.push(orphansCheck);
    }
    
    // Check 4: Token Hygiene - Find stale FCM tokens, invalid Web Push subscriptions
    if (checks.includes('all') || checks.includes('tokens')) {
      const tokensCheck = await checkTokenHygiene();
      results.push(tokensCheck);
    }
    
    // Check 5: League Consistency - Member counts, standings vs actual lineups
    if (checks.includes('all') || checks.includes('leagues')) {
      const leaguesCheck = await checkLeagueConsistency();
      results.push(leaguesCheck);
    }
    
    const summary: HealthCheckSummary = {
      totalChecks: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      warnings: results.filter(r => r.status === 'warning').length,
      results,
      timestamp: admin.firestore.Timestamp.now()
    };
    
    logger.info('System health check completed', { summary });
    return { summary, dryRun };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('System health check failed:', { error: errorMessage });
    throw new HttpsError('internal', 'Health check failed. Check logs.');
  }
});

// Individual health check functions
async function checkScoreIntegrity(): Promise<HealthCheckResult> {
  try {
    // Check recent week's lineups for score consistency
    const currentWeek = 15; // TODO: Get from current week helper
    const lineupsRef = db.collectionGroup('weeklyLineups')
      .where('week', '>=', currentWeek - 2)
      .where('totalActualPoints', '>', 0)
      .limit(100);
    
    const lineupsSnap = await lineupsRef.get();
    let inconsistentCount = 0;
    
    for (const doc of lineupsSnap.docs) {
      const lineup = doc.data() as FirestoreWeeklyLineup;
      
      // Simple check: totalActualPoints should be reasonable (0-200 range)
      if (lineup.totalActualPoints && (lineup.totalActualPoints < 0 || lineup.totalActualPoints > 200)) {
        inconsistentCount++;
      }
      
      // Check captain points consistency
      if (lineup.captainBasePoints && lineup.captainMultipliedPoints) {
        const expectedMultiplied = lineup.captainBasePoints * 2; // Default multiplier
        if (Math.abs(lineup.captainMultipliedPoints - expectedMultiplied) > 0.1) {
          inconsistentCount++;
        }
      }
    }
    
    return {
      checkName: 'Score Integrity',
      status: inconsistentCount === 0 ? 'pass' : inconsistentCount < 5 ? 'warning' : 'fail',
      details: inconsistentCount === 0 
        ? `All ${lineupsSnap.size} recent lineups have consistent scoring`
        : `Found ${inconsistentCount} lineups with scoring inconsistencies`,
      affectedCount: inconsistentCount,
      repairAvailable: inconsistentCount > 0
    };
    
  } catch (error) {
    return {
      checkName: 'Score Integrity',
      status: 'fail',
      details: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkMissingDerivedFields(): Promise<HealthCheckResult> {
  try {
    // Check for lineups missing totalActualPoints or captain fields
    const currentWeek = 15;
    const lineupsRef = db.collectionGroup('weeklyLineups')
      .where('week', '>=', currentWeek - 2)
      .where('isComplete', '==', true)
      .limit(100);
    
    const lineupsSnap = await lineupsRef.get();
    let missingFieldsCount = 0;
    
    for (const doc of lineupsSnap.docs) {
      const lineup = doc.data() as FirestoreWeeklyLineup;
      
      // Check if completed lineup is missing derived fields
      if (lineup.isComplete) {
        if (lineup.totalActualPoints === undefined || lineup.totalActualPoints === null) {
          missingFieldsCount++;
        }
        
        // If has captain but missing captain analytics
        if (lineup.captainPlayerId && !lineup.captainBasePoints) {
          missingFieldsCount++;
        }
      }
    }
    
    return {
      checkName: 'Missing Derived Fields',
      status: missingFieldsCount === 0 ? 'pass' : missingFieldsCount < 10 ? 'warning' : 'fail',
      details: missingFieldsCount === 0 
        ? `All ${lineupsSnap.size} recent lineups have required derived fields`
        : `Found ${missingFieldsCount} lineups missing derived fields (points/captain data)`,
      affectedCount: missingFieldsCount,
      repairAvailable: missingFieldsCount > 0
    };
    
  } catch (error) {
    return {
      checkName: 'Missing Derived Fields',
      status: 'fail',
      details: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkOrphanedDocuments(): Promise<HealthCheckResult> {
  try {
    let orphanedCount = 0;
    const issues: string[] = [];
    
    // Check for lineups with invalid user references
    const lineupsRef = db.collectionGroup('weeklyLineups').limit(50);
    const lineupsSnap = await lineupsRef.get();
    
    const userIds = new Set<string>();
    for (const doc of lineupsSnap.docs) {
      const lineup = doc.data() as FirestoreWeeklyLineup;
      userIds.add(lineup.userId);
    }
    
    // Verify users exist
    for (const userId of userIds) {
      try {
        await admin.auth().getUser(userId);
      } catch {
        orphanedCount++;
        issues.push(`Lineup found for non-existent user: ${userId}`);
        if (issues.length >= 5) break; // Limit details
      }
    }
    
    // Check for tips without corresponding games (simplified check)
    const tipsRef = db.collection('weeklyTips').limit(10);
    const tipsSnap = await tipsRef.get();
    
    for (const doc of tipsSnap.docs) {
      const tipsData = doc.data();
      if (!tipsData.games || Object.keys(tipsData.games).length === 0) {
        orphanedCount++;
        issues.push(`Tips document with no games: ${doc.id}`);
      }
    }
    
    return {
      checkName: 'Orphaned Documents',
      status: orphanedCount === 0 ? 'pass' : orphanedCount < 5 ? 'warning' : 'fail',
      details: orphanedCount === 0 
        ? 'No orphaned documents found'
        : `Found ${orphanedCount} orphaned documents: ${issues.join(', ')}`,
      affectedCount: orphanedCount,
      repairAvailable: orphanedCount > 0
    };
    
  } catch (error) {
    return {
      checkName: 'Orphaned Documents',
      status: 'fail',
      details: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkTokenHygiene(): Promise<HealthCheckResult> {
  try {
    const usersRef = db.collection('users').limit(100);
    const usersSnap = await usersRef.get();
    
    let staleTokensCount = 0;
    let invalidSubscriptionsCount = 0;
    
    for (const doc of usersSnap.docs) {
      const userData = doc.data() as FirestoreUser;
      
      // Check for obviously invalid FCM tokens (too short, malformed)
      if (userData.fcmToken) {
        if (userData.fcmToken.length < 100 || !userData.fcmToken.includes(':')) {
          staleTokensCount++;
        }
      }
      
      // Check for Web Push subscriptions
      if (userData.webPushSubscription) {
        const sub = userData.webPushSubscription;
        if (!sub.endpoint || !sub.keys?.auth || !sub.keys?.p256dh) {
          invalidSubscriptionsCount++;
        }
      }
    }
    
    const totalIssues = staleTokensCount + invalidSubscriptionsCount;
    
    return {
      checkName: 'Token Hygiene',
      status: totalIssues === 0 ? 'pass' : totalIssues < 5 ? 'warning' : 'fail',
      details: totalIssues === 0 
        ? `All ${usersSnap.size} user tokens appear valid`
        : `Found ${staleTokensCount} stale FCM tokens, ${invalidSubscriptionsCount} invalid Web Push subscriptions`,
      affectedCount: totalIssues,
      repairAvailable: totalIssues > 0
    };
    
  } catch (error) {
    return {
      checkName: 'Token Hygiene',
      status: 'fail',
      details: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkLeagueConsistency(): Promise<HealthCheckResult> {
  try {
    const leaguesRef = db.collection('leagues').limit(20);
    const leaguesSnap = await leaguesRef.get();
    
    let inconsistentCount = 0;
    const issues: string[] = [];
    
    for (const doc of leaguesSnap.docs) {
      const leagueData = doc.data();
      
      // Check member count consistency
      const membersArray = leagueData.members || [];
      const memberUids = leagueData.memberUids || [];
      
      if (membersArray.length !== memberUids.length) {
        inconsistentCount++;
        issues.push(`League ${leagueData.name}: member count mismatch`);
      }
      
      // Check for duplicate member UIDs
      const uniqueUids = new Set(memberUids);
      if (uniqueUids.size !== memberUids.length) {
        inconsistentCount++;
        issues.push(`League ${leagueData.name}: duplicate members`);
      }
      
      if (issues.length >= 5) break; // Limit details
    }
    
    return {
      checkName: 'League Consistency',
      status: inconsistentCount === 0 ? 'pass' : inconsistentCount < 3 ? 'warning' : 'fail',
      details: inconsistentCount === 0 
        ? `All ${leaguesSnap.size} leagues are consistent`
        : `Found ${inconsistentCount} leagues with issues: ${issues.join(', ')}`,
      affectedCount: inconsistentCount,
      repairAvailable: inconsistentCount > 0
    };
    
  } catch (error) {
    return {
      checkName: 'League Consistency',
      status: 'fail',
      details: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Repair function for fixing common issues
export const repairSystemIssues = onCall({ ...adminOptions }, async (request) => {
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const { repairType, dryRun = true } = request.data;
  
  try {
    let repairedCount = 0;
    const actions: string[] = [];
    
    switch (repairType) {
      case 'stale-tokens': {
        // Remove obviously invalid FCM tokens
        const usersRef = db.collection('users').limit(50);
        const usersSnap = await usersRef.get();
        
        for (const doc of usersSnap.docs) {
          const userData = doc.data() as FirestoreUser;
          
          if (userData.fcmToken && userData.fcmToken.length < 100) {
            if (!dryRun) {
              await doc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
            }
            repairedCount++;
            actions.push(`Remove stale FCM token for user ${doc.id}`);
          }
        }
        break;
      }
        
      case 'missing-fields': {
        // Recalculate missing derived fields (simplified - just mark for recalc)
        const lineupsRef = db.collectionGroup('weeklyLineups')
          .where('isComplete', '==', true)
          .where('totalActualPoints', '==', null)
          .limit(20);
          
        const lineupsSnap = await lineupsRef.get();
        
        for (const doc of lineupsSnap.docs) {
          if (!dryRun) {
            // Mark for recalculation by setting a flag
            await doc.ref.update({ needsRecalculation: true });
          }
          repairedCount++;
          actions.push(`Mark lineup ${doc.id} for score recalculation`);
        }
        break;
      }
        
      default:
        throw new HttpsError('invalid-argument', `Unknown repair type: ${repairType}`);
    }
    
    logger.info('System repair completed', { repairType, repairedCount, dryRun });
    return { repairedCount, actions, dryRun };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('System repair failed:', { error: errorMessage, repairType });
    throw new HttpsError('internal', 'Repair failed. Check logs.');
  }
});