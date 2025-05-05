// src/pointsCalculator.ts
import { logger } from "firebase-functions/v2";
import { safeParseFloat, safeParseInt } from './common';
import { TeamGameStatsForCalc } from './types'; // Only need Team input type

/** Calculate Passing Offense Points (Team Unit) - Fractional Yards */
export function calculatePassingOffensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.passingStats) return 0;
    // 0.04 points per passing yard
    points += safeParseFloat(teamGameStats.passingStats.totalPassingYards) * 0.04;
    // 4 points per passing TD (Based on OLD PARAMS - check if your image has 6 for team TD?)
    // If image shows 6 for team unit TD, change multiplier to 6.0
    points += safeParseInt(teamGameStats.passingStats.totalPassingTDs) * 6.0; // Using 4 from old params, adjust if needed
    // Interceptions are typically handled by player score, not team offense score.
    // If your rules apply INTs to team score, add:
    points -= safeParseInt(teamGameStats.passingStats.totalInterceptionsThrown) * 2.0;
    return Math.round(points * 100) / 100;
}

/** Calculate Rushing Offense Points (Team Unit) - Fractional Yards */
export function calculateRushingOffensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.rushingStats) return 0;
    // 0.1 points per rushing yard
    points += safeParseFloat(teamGameStats.rushingStats.totalRushingYards) * 0.1;
    // 6 points per rushing TD
    points += safeParseInt(teamGameStats.rushingStats.totalRushingTDs) * 6.0;
    // Fumbles lost are typically handled by player score, not team offense score.
    // If your rules apply fumbles to team score, add logic here using aggregated fumbles.
    return Math.round(points * 100) / 100;
}

/** Calculate Defense Points (Team Unit) - Based on points.jpg */
export function calculateDefensePoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.teamDefData) { logger.warn("Defense calc skipped: Missing teamDefData."); return 0; }
    const defStats = teamGameStats.teamDefData;

    const ptsAllowed = defStats.ptsAllowed ?? 99; // Parsed from DST stats
    if (ptsAllowed === 0) points += 10.0;
    else if (ptsAllowed >= 2 && ptsAllowed <= 9) points += 6.0; // Image rule
    else if (ptsAllowed >= 10 && ptsAllowed <= 20) points += 3.0; // Image rule

    // Using fields likely available in DST object or aggregated player defense stats
    points += (safeParseInt(defStats.defInt) + safeParseInt(defStats.fumRec)) * 2.0; // Interception/Fumble Recovery
    points += safeParseFloat(defStats.sacks) * 1.0; // Sack
    points += safeParseInt(defStats.safeties) * 2.0; // Safety
    points += safeParseInt(defStats.defTD) * 6.0; // Defensive Touchdown

    return Math.round(points * 100) / 100;
}

/** Calculate Special Teams Points (Team Unit) - Based on points.jpg */
export function calculateSpecialTeamsPoints(teamGameStats: TeamGameStatsForCalc): number {
    let points = 0.0;
    if (!teamGameStats?.specialTeamsStats) { logger.warn("ST calc skipped: Missing specialTeamsStats."); return 0; }
    const stStats = teamGameStats.specialTeamsStats;

    points += safeParseInt(stStats.xpMade) * 1.0; // Extrapunkt (PAT)
    points += safeParseInt(stStats.fgMade) * 3.0; // Field Goal
    // Punt/Kickoff/Fumble Return TD (Aggregated)
    const returnTD = safeParseInt(stStats.kickReturnTD) + safeParseInt(stStats.puntReturnTD) + safeParseInt(stStats.fumbleReturnTD);
    points += returnTD * 6.0;
    points += safeParseInt(stStats.xpReturn) * 2.0; // Extrapunkt returned

    return Math.round(points * 100) / 100;
}
