// src/statsAggregators.ts
import { safeParseFloat, safeParseInt } from './common';
import { BoxScorePlayerGameStatsAPI } from './types';

type PlayerStatsMap = { [playerId: string]: BoxScorePlayerGameStatsAPI | undefined };

// Output types
interface AggregatedPassingStats { totalPassingYards: number; totalPassingTDs: number; totalInterceptionsThrown: number; /* Add Fumbles if needed for team calc */ }
interface AggregatedRushingStats { totalRushingYards: number; totalRushingTDs: number; /* Add Fumbles if needed for team calc */ }
interface AggregatedKickingStats { totalExtraPointsMade: number; totalFieldGoalsMade: number; }
interface AggregatedReturnStats { totalKickReturnTDs: number; totalPuntReturnTDs: number; totalFumbleReturnTDs: number; /* Check API source */ }
// Add Aggregated Defense if needed for team calcs, though often DST object is used directly
// interface AggregatedDefenseStats { /* ... */ }

// --- Aggregation Functions ---

export const aggregatePassingStats = (playerStatsMap: PlayerStatsMap, teamID: string): AggregatedPassingStats => {
  let totalPassingYards = 0; let totalPassingTDs = 0; let totalInterceptionsThrown = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID && playerData.Passing) {
      totalPassingYards += safeParseFloat(playerData.Passing.passYds);
      totalPassingTDs += safeParseInt(playerData.Passing.passTD);
      totalInterceptionsThrown += safeParseInt(playerData.Passing.int); // If needed for team calc
    }
  }
  return { totalPassingYards, totalPassingTDs, totalInterceptionsThrown };
};

export const aggregateRushingStats = (playerStatsMap: PlayerStatsMap, teamID: string): AggregatedRushingStats => {
  let totalRushingYards = 0; let totalRushingTDs = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID && playerData.Rushing) {
      totalRushingYards += safeParseFloat(playerData.Rushing.rushYds);
      totalRushingTDs += safeParseInt(playerData.Rushing.rushTD);
    }
  }
  return { totalRushingYards, totalRushingTDs };
};

export const aggregateKickingStats = (playerStatsMap: PlayerStatsMap, teamID: string): AggregatedKickingStats => {
  let totalExtraPointsMade = 0; let totalFieldGoalsMade = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID && playerData.Kicking) {
      totalExtraPointsMade += safeParseInt(playerData.Kicking.xpMade);
      totalFieldGoalsMade += safeParseInt(playerData.Kicking.fgMade);
    }
  }
  return { totalExtraPointsMade, totalFieldGoalsMade };
};

export const aggregateSpecialTeamsReturnStats = (playerStatsMap: PlayerStatsMap, teamID: string): AggregatedReturnStats => {
  let totalKickReturnTDs = 0; let totalPuntReturnTDs = 0; let totalFumbleReturnTDs = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID) {
      // Check various potential locations for return TDs based on API structure
      if (playerData.Kicking) totalKickReturnTDs += safeParseInt(playerData.Kicking.kickReturnTD);
      if (playerData.Punting) totalPuntReturnTDs += safeParseInt(playerData.Punting.puntReturnTD);
      // Check API for Fumble Return TD source (e.g., Defense.fumRetTD) - Verify field name!
      if (playerData.Defense) totalFumbleReturnTDs += safeParseInt(playerData.Defense.fumRetTD);
    }
  }
  return { totalKickReturnTDs, totalPuntReturnTDs, totalFumbleReturnTDs };
};
