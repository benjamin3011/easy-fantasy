// src/types.ts
import * as admin from "firebase-admin";

// --- Calculation Input Types (Derived from Raw Stats for Calculators) ---
export interface PassingStatsCalc { passYds?: number; passTD?: number; twoPtPass?: number; int?: number; }
export interface RushingStatsCalc { rushYds?: number; rushTD?: number; twoPtRush?: number; }
export interface ReceivingStatsCalc { recYds?: number; recTD?: number; twoPtRec?: number; }
export interface PlayerDefenseStatsCalc { fumLost?: number; } // Fumble lost for QB/RB/WR/TE scoring

export interface PlayerStatsForCalc { // Structure for calculatePlayerFantasyPoints
  Passing?: PassingStatsCalc;
  Rushing?: RushingStatsCalc;
  Receiving?: ReceivingStatsCalc;
  // Fumble source might be Defense or Fumbles category in raw stats
  Defense?: PlayerDefenseStatsCalc;
}
export type PlayerPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface TeamDefenseStatsCalc { // Structure for calculateDefensePoints (Parsed from DST)
  ptsAllowed?: number; defensiveInterceptions?: number; fumblesRecovered?: number;
  sacks?: number; safeties?: number; defTD?: number; ydsAllowed?: number; // Optional: Yards allowed for additional calculations
}
export interface SpecialTeamsStatsCalc { // Structure for calculateSpecialTeamsPoints (Aggregated)
  xpMade?: number; fgMade?: number;
  kickReturnTD?: number; puntReturnTD?: number;
  xpReturn?: number;
}
export interface TeamGameStatsForCalc { // Combined structure for team unit calcs
     passingStats?: { totalPassingYards?: number; totalPassingTDs?: number; }; // From Aggregation
     rushingStats?: { totalRushingYards?: number; totalRushingTDs?: number; }; // From Aggregation
     teamDefData?: TeamDefenseStatsCalc; // Parsed from DST
     specialTeamsStats?: SpecialTeamsStatsCalc; // From Aggregation
}

// --- API Response Interfaces (Based on paste-3.txt and previous definitions) ---

// Structure for /getNFLBoxScore Player Stats (Raw API Response)
export interface BoxScorePlayerGameStatsAPI {
    teamID?: string; gameID?: string; longName?: string; playerID?: string; team?: string; teamAbv?: string;
    Passing?: Record<string, unknown>; Rushing?: Record<string, unknown>; Receiving?: Record<string, unknown>;
    Defense?: Record<string, unknown>; Kicking?: Record<string, unknown>; Punting?: Record<string, unknown>;
    fantasyPoints?: string; // API calculation
    fantasyPointsDefault?: { standard?: string; PPR?: string; halfPPR?: string; }; // Alternative key
    scoringPlays?: unknown[]; snapCounts?: Record<string, unknown>;
}
// Box Score Team/DST Details
export interface BoxScoreTeamGameStatsDetail { teamID: string; [key: string]: unknown; }
export interface BoxScoreTeamDefGameStatsDetail { ptsAllowed?: string; [key: string]: unknown; }
// Box Score Body/Response
export interface BoxScoreBody {
    playerStats: { [playerId: string]: BoxScorePlayerGameStatsAPI };
    teamStats: { home: BoxScoreTeamGameStatsDetail; away: BoxScoreTeamGameStatsDetail; };
    DST: { home: BoxScoreTeamDefGameStatsDetail; away: BoxScoreTeamDefGameStatsDetail; };
    week?: string; season?: string; gameDate?: string; gameTimeEpoch?: string; gameStatus?: string;
}
export interface BoxScoreResponse { statusCode?: number; body: BoxScoreBody; }
// Game Info for fetching IDs
export interface GameInfoForWeek {
    gameID: string;
    seasonType?: string; week?: string; gameDate?: string; gameTimeEpoch?: string;
}
export interface GamesForWeekResponse { body: GameInfoForWeek[]; }
// Player/Team roster types
export interface Tank01ApiInjury { injReturnDate?: string; description?: string; injDate?: string; designation?: string; }
export interface Tank01ApiPlayerSeasonStats {
    gamesPlayed?: string; Defense?: Record<string, unknown>; Rushing?: Record<string, unknown>;
    Passing?: Record<string, unknown>; Receiving?: Record<string, unknown>; Kicking?: Record<string, unknown>;
    Punting?: Record<string, unknown>; fantasyPointsDefault?: { standard?: string; PPR?: string; halfPPR?: string; };
}
export interface Tank01ApiPlayer {
    playerID: string; espnID?: string; espnName?: string; longName: string;
    firstName?: string; lastName?: string; pos: string; teamID: string;
    team: string; jerseyNum?: string;
    injury?: Tank01ApiInjury | string | null;
    espnHeadshot?: string; weight?: string; age?: string; espnLink?: string;
    bDay?: string; isFreeAgent?: string; school?: string; height?: string;
    lastGamePlayed?: string; exp?: string;
    stats?: Tank01ApiPlayerSeasonStats;
}
export interface Tank01ApiGameSchedule {
    gameWeek: string; seasonType: string; home: string; away: string; gameTimeEpoch?: string;
}
export interface Tank01ApiTeam {
    teamID: string; teamAbv: string; teamCity?: string; teamName?: string;
    conferenceAbv?: string; division?: string; espnLogo1?: string;
    byeWeeks?: { [season: string]: string[] };
    teamSchedule?: { [gameId: string]: Tank01ApiGameSchedule };
    teamStats?: Record<string, unknown>;
    wins?: string | number; loss?: string | number; tie?: string | number;
}
export interface Tank01ApiRosterResponse { body: { roster: Tank01ApiPlayer[] }; }
export interface Tank01ApiTeamsResponse { body: Tank01ApiTeam[]; }


// --- Firestore Data Interfaces (Updated) ---

// Data stored in players/{playerId}/gamestats/{gameId}
export interface FirestorePlayerGameStat {
    gameId: string;
    season: number;
    week: number;
    nflTeamId?: string;
    rawBoxScoreStats?: BoxScorePlayerGameStatsAPI; // Keep full raw stats
    apiFantasyPoints?: { standard: number; ppr: number; halfPpr: number; }; // API's calculation
    // ADD Field for YOUR calculated fantasy points
    fantasyPoints?: number; // Your custom calculation result
    lastUpdated: admin.firestore.Timestamp;
}

// Data stored in teams/{teamId}/gamestats/{gameId}
export interface FirestoreTeamGameStat {
    gameId: string;
    season: number;
    week: number;
    rawTeamBoxScoreStats?: Record<string, unknown>;
    rawDefBoxScoreStats?: Record<string, unknown>;
    // ADD Fields for YOUR calculated unit points
    fantasyPointsPassing?: number;
    fantasyPointsRushing?: number;
    fantasyPointsDefense?: number;
    fantasyPointsSpecialTeams?: number;
    // Optional: Store aggregated stats used for calc (for debugging)
    aggregatedStatsForCalc?: TeamGameStatsForCalc;
    lastUpdated: admin.firestore.Timestamp;
}
