import { PositionKey, SelectableEntity, SelectablePlayer } from '../types/lineup';
import { fetchSelectablePlayers } from './lineupFetchingService';
import type { FirestoreWeeklySchedule } from './lineupFetchingService';

export interface InjuryReplacement {
  player: SelectablePlayer;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  ppgDifference: number;
}

export interface InjuryAnalysis {
  hasInjuredPlayers: boolean;
  injuredPlayers: Array<{
    position: PositionKey;
    player: SelectablePlayer;
    severity: 'critical' | 'warning' | 'watch';
    replacements: InjuryReplacement[];
  }>;
  recommendations: string[];
}

/**
 * Analyzes lineup for injury concerns and provides replacement suggestions
 */
export async function analyzeLineupInjuries(
  lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>,
  usageCounts: Record<string, number>,
  weeklySchedule: FirestoreWeeklySchedule | null,
  currentWeek: number
): Promise<InjuryAnalysis> {
  const injuredPlayers: InjuryAnalysis['injuredPlayers'] = [];
  const recommendations: string[] = [];

  // Check each position for injured players
  for (const [positionKey, entity] of Object.entries(lineup)) {
    if (!entity || entity.entityType !== 'player') continue;

    const player = entity as SelectablePlayer;
    const position = positionKey as PositionKey;
    
    // Analyze injury severity
    const severity = getInjurySeverity(player);
    if (severity === null) continue;

    // Find replacement suggestions
    const replacements = await findReplacementPlayers(
      position,
      player,
      usageCounts,
      weeklySchedule,
      currentWeek
    );

    injuredPlayers.push({
      position,
      player,
      severity,
      replacements
    });
  }

  // Generate recommendations
  if (injuredPlayers.length > 0) {
    const criticalCount = injuredPlayers.filter(p => p.severity === 'critical').length;
    const warningCount = injuredPlayers.filter(p => p.severity === 'warning').length;

    if (criticalCount > 0) {
      recommendations.push(`${criticalCount} player${criticalCount > 1 ? 's' : ''} ruled OUT - immediate replacement needed`);
    }
    if (warningCount > 0) {
      recommendations.push(`${warningCount} player${warningCount > 1 ? 's' : ''} questionable - monitor status closely`);
    }

    // Add specific replacement advice
    const bestReplacements = injuredPlayers
      .filter(p => p.replacements.length > 0)
      .map(p => p.replacements[0]);

    if (bestReplacements.length > 0) {
      const topReplacement = bestReplacements.reduce((best, current) => 
        current.confidence === 'high' && current.ppgDifference > best.ppgDifference ? current : best
      );
      recommendations.push(`Consider ${topReplacement.player.name} - ${topReplacement.reason}`);
    }
  }

  return {
    hasInjuredPlayers: injuredPlayers.length > 0,
    injuredPlayers,
    recommendations
  };
}

/**
 * Determines injury severity level
 */
function getInjurySeverity(player: SelectablePlayer): 'critical' | 'warning' | 'watch' | null {
  if (!player.injuryStatus) return null;

  switch (player.injuryStatus.status) {
    case 'Out':
    case 'IR':
    case 'PUP':
    case 'Suspended':
      return 'critical';
    case 'Doubtful':
      return 'warning';
    case 'Questionable':
      return 'watch';
    default:
      return null;
  }
}

/**
 * Finds the best replacement players for an injured player
 */
async function findReplacementPlayers(
  position: PositionKey,
  injuredPlayer: SelectablePlayer,
  usageCounts: Record<string, number>,
  weeklySchedule: FirestoreWeeklySchedule | null,
  currentWeek: number
): Promise<InjuryReplacement[]> {
  try {
    // Get all available players for this position
    const availablePlayers = await fetchSelectablePlayers(position, usageCounts, weeklySchedule);
    
    // Filter for viable replacements
    const viableReplacements = availablePlayers.filter(player => {
      // Exclude the injured player
      if (player.id === injuredPlayer.id) return false;
      
      // Must be available (not at usage limit, not on bye)
      if (player.usageCount >= 5) return false;
      if (player.byeWeek === currentWeek) return false;
      
      // Must have some performance data
      if (player.actualPPG <= 0) return false;
      
      return true;
    });

    // Score and rank replacements
    const scoredReplacements = viableReplacements.map(player => {
      const ppgDifference = player.actualPPG - injuredPlayer.actualPPG;
      const usageEfficiency = 5 - player.usageCount; // More picks available = better
      
      // Determine confidence level
      let confidence: 'high' | 'medium' | 'low';
      let reason: string;

      if (ppgDifference >= 2 && usageEfficiency >= 3) {
        confidence = 'high';
        reason = `Strong upgrade: ${player.actualPPG.toFixed(1)} PPG vs ${injuredPlayer.actualPPG.toFixed(1)} PPG`;
      } else if (ppgDifference >= 0 && usageEfficiency >= 2) {
        confidence = 'medium';
        reason = `Solid replacement: ${player.actualPPG.toFixed(1)} PPG, ${usageEfficiency} picks left`;
      } else if (usageEfficiency >= 1) {
        confidence = 'low';
        reason = `Available option: ${player.actualPPG.toFixed(1)} PPG`;
      } else {
        confidence = 'low';
        reason = `Last resort: ${player.actualPPG.toFixed(1)} PPG (usage limit concern)`;
      }

      return {
        player,
        reason,
        confidence,
        ppgDifference,
        score: (ppgDifference * 2) + (usageEfficiency * 0.5) // Weight PPG more heavily
      };
    });

    // Return top 3 replacements, sorted by score
    return scoredReplacements
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

  } catch (error) {
    console.error('Error finding replacement players:', error);
    return [];
  }
}

/**
 * Generates a user-friendly injury report message
 */
export function generateInjuryReportMessage(analysis: InjuryAnalysis): string {
  if (!analysis.hasInjuredPlayers) {
    return "✅ No injury concerns in your lineup";
  }

  const criticalCount = analysis.injuredPlayers.filter(p => p.severity === 'critical').length;
  const warningCount = analysis.injuredPlayers.filter(p => p.severity === 'warning').length;
  const watchCount = analysis.injuredPlayers.filter(p => p.severity === 'watch').length;

  let message = "🏥 Injury Report: ";
  
  if (criticalCount > 0) {
    message += `${criticalCount} OUT`;
  }
  if (warningCount > 0) {
    message += criticalCount > 0 ? `, ${warningCount} Doubtful` : `${warningCount} Doubtful`;
  }
  if (watchCount > 0) {
    const hasOthers = criticalCount > 0 || warningCount > 0;
    message += hasOthers ? `, ${watchCount} Questionable` : `${watchCount} Questionable`;
  }

  return message;
}

/**
 * Gets the most urgent injury action needed
 */
export function getUrgentInjuryAction(analysis: InjuryAnalysis): string | null {
  if (!analysis.hasInjuredPlayers) return null;

  const critical = analysis.injuredPlayers.find(p => p.severity === 'critical');
  if (critical && critical.replacements.length > 0) {
    const bestReplacement = critical.replacements[0];
    return `Replace ${critical.player.name} with ${bestReplacement.player.name}`;
  }

  const warning = analysis.injuredPlayers.find(p => p.severity === 'warning');
  if (warning && warning.replacements.length > 0) {
    const bestReplacement = warning.replacements[0];
    return `Consider replacing ${warning.player.name} with ${bestReplacement.player.name}`;
  }

  return `Monitor ${analysis.injuredPlayers[0].player.name} status`;
} 