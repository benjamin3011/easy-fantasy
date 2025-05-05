import { logger } from "firebase-functions/v2";
import { safeParseFloat, safeParseInt } from './common';
import {
    PlayerStatsForCalc, PlayerPosition,
    TeamGameStatsForCalc
} from './types';

/** Calculate Player Fantasy Points based on position */
export function calculatePlayerFantasyPoints(stats: PlayerStatsForCalc, position: PlayerPosition): number {
  let points = 0.0;
  if (!stats) return 0;

  // Passing
  if (stats.Passing) {
    points += safeParseFloat(stats.Passing.passYds) / 25; // 1 pt per 25 yds, fractional
    points += safeParseInt(stats.Passing.passTD) * 6.0;
    points += safeParseInt(stats.Passing.twoPtPass) * 2.0;
    if (position === 'QB') {
        points -= safeParseInt(stats.Passing.int) * 2.0;
    }
  }
  // Rushing
  if (stats.Rushing) {
    points += safeParseFloat(stats.Rushing.rushYds) / 10; // 1 pt per 10 yds, fractional
    points += safeParseInt(stats.Rushing.rushTD) * 6.0;
    points += safeParseInt(stats.Rushing.twoPtRush) * 2.0;
  }
  // Receiving
  if (stats.Receiving) {
    points += safeParseFloat(stats.Receiving.recYds) / 10; // 1 pt per 10 yds, fractional
    points += safeParseInt(stats.Receiving.recTD) * 6.0;
    points += safeParseInt(stats.Receiving.twoPtRec) * 2.0;
  }
  // Fumbles Lost (Check both Defense and Fumbles categories in raw stats)
  const fumbleStatSource = stats.Defense;
  if (fumbleStatSource?.fumLost !== undefined) {
    points -= safeParseInt(fumbleStatSource.fumLost) * 2.0;
  }

  // Round to 2 decimals for display, but keep fractional points
  return Math.round(points * 100) / 100;
}

/** Calculate Passing Offense Points (Team Unit) */
export function calculatePassingOffensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.passingStats) return 0;
    points += safeParseFloat(teamGameStats.passingStats.totalPassingYards) / 25;
    points += safeParseInt(teamGameStats.passingStats.totalPassingTDs) * 6.0;
    return Math.round(points * 100) / 100;
}

/** Calculate Rushing Offense Points (Team Unit) */
export function calculateRushingOffensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.rushingStats) return 0;
    points += safeParseFloat(teamGameStats.rushingStats.totalRushingYards) / 10;
    points += safeParseInt(teamGameStats.rushingStats.totalRushingTDs) * 6.0;
    return Math.round(points * 100) / 100;
}

/** Calculate Defense Points (Team Unit) */
export function calculateDefensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.teamDefData) { logger.warn("Defense calc skipped: Missing teamDefData."); return 0; }
    const defStats = teamGameStats.teamDefData;

    const ptsAllowed = defStats.ptsAllowed ?? 99;
    if (ptsAllowed === 0) points += 10.0;
    else if (ptsAllowed >= 2 && ptsAllowed <= 9) points += 6.0;
    else if (ptsAllowed >= 10 && ptsAllowed <= 20) points += 3.0;

    points += (safeParseInt(defStats.defensiveInterceptions) + safeParseInt(defStats.fumblesRecovered)) * 2.0;
    points += safeParseFloat(defStats.sacks) * 1.0;
    points += safeParseInt(defStats.safeties) * 2.0;
    points += safeParseInt(defStats.defTD) * 6.0;

    return Math.round(points * 100) / 100;
}

/** Calculate Special Teams Points (Team Unit) */
export function calculateSpecialTeamsPoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.specialTeamsStats) { logger.warn("ST calc skipped: Missing specialTeamsStats."); return 0; }
    const stStats = teamGameStats.specialTeamsStats;

    points += safeParseInt(stStats.xpMade) * 1.0;
    points += safeParseInt(stStats.fgMade) * 3.0;
    const returnTD = safeParseInt(stStats.kickReturnTD) + safeParseInt(stStats.puntReturnTD);
    points += returnTD * 6.0;
    points += safeParseInt(stStats.xpReturn) * 2.0;

    return Math.round(points * 100) / 100;
}
