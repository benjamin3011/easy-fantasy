// src/statsAggregators.ts
import { safeParseFloat, safeParseInt } from './common';
import { BoxScorePlayerGameStatsAPI } from './types';

type PlayerStatsMap = { [playerId: string]: BoxScorePlayerGameStatsAPI | undefined };

// Output types
interface AggregatedPassingStats { totalPassingYards: number; totalPassingTDs: number; }
interface AggregatedRushingStats { totalRushingYards: number; totalRushingTDs: number; }
interface AggregatedKickingStats { totalExtraPointsMade: number; totalFieldGoalsMade: number; }
interface AggregatedReturnStats { totalKickReturnTDs: number; totalPuntReturnTDs: number; }

// --- Aggregation Functions ---

export const aggregatePassingStats = (playerStatsMap: PlayerStatsMap, teamID: string): AggregatedPassingStats => {
  let totalPassingYards = 0; let totalPassingTDs = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID && playerData.Passing) {
      totalPassingYards += safeParseFloat(playerData.Passing.passYds);
      totalPassingTDs += safeParseInt(playerData.Passing.passTD);
    }
  }
  return { totalPassingYards, totalPassingTDs };
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
  let totalKickReturnTDs = 0; let totalPuntReturnTDs = 0;
  for (const playerId in playerStatsMap) {
    const playerData = playerStatsMap[playerId];
    if (playerData?.teamID === teamID) {
      if (playerData.Kicking) totalKickReturnTDs += safeParseInt(playerData.Kicking.kickReturnTD);
      if (playerData.Punting) totalPuntReturnTDs += safeParseInt(playerData.Punting.puntReturnTD);
    }
  }
  return { totalKickReturnTDs, totalPuntReturnTDs };
};
