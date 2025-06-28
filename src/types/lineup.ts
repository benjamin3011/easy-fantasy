export type PositionKey =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'PassingOffense'
  | 'RushingOffense'
  | 'Defense'
  | 'SpecialTeams';

export interface PositionDetail {
  key: PositionKey;
  label: string;
  type: 'player' | 'team'; // Helps later to know what kind of entities to fetch
}

// Represents a selected item in the lineup for a given position
export interface LineupSelection {
  id: string; // ID of the player or team
  name: string; // Name of the player or team
  entityType: 'player' | 'team';
  // Potentially add a small image/icon URL here if available
  // headshotUrl?: string;
}

// The overall lineup state: a mapping from PositionKey to the selected entity
export type Lineup = Partial<Record<PositionKey, SelectableEntity | undefined>>;

export interface InjuryStatus {
  status: 'Questionable' | 'Doubtful' | 'Out' | 'Healthy' | 'Suspended' | 'IR' | 'PUP';
  details?: string; // e.g., "Ankle", "Knee"
}

export interface BaseSelectableEntity {
  id: string; // Player or Team ID from Firestore
  name: string;
  teamAbbreviation: string; // e.g., "KC", "PHI"
  nextOpponent?: string; // e.g., "@DEN", "vs NYG"
  actualPPG: number;
  usageCount: number; // How many times this entity has been used by the user in this league
  gameId?: string; // ID of the next game, useful for checking started status
  gameTimeEpoch?: number; // Epoch time of the next game
  byeWeek?: number; // The week this player/team is on bye

  // New fields for week-specific opponent and game time
  opponentForWeek?: string;
  gameTimeEpochForWeek?: number;
  gameIdForWeek?: string; // Specific game ID for the selected week
  actualFantasyPoints?: number; // Actual fantasy points scored in the game for the specific week
  isLocked?: boolean; // NEW: Indicates if the entity's game for the week has started
}

export interface LatestNews {
  title: string;
  link: string;
  timestamp?: number;
}

export interface SelectablePlayer extends BaseSelectableEntity {
  entityType: 'player';
  fullTeamName: string; // Added full team name for players
  position: string; // e.g., "QB", "WR"
  headshotUrl?: string;
  injuryStatus?: InjuryStatus;
  rawSeasonStats?: RawSeasonStats; // Added for displaying detailed stats
  latestNews?: LatestNews;
}

// Basic structure for RawSeasonStats, can be expanded as needed
export interface RawSeasonStats {
  gamesPlayed?: string;
  team?: string;
  teamAbv?: string;
  teamID?: string;
  fantasyPointsDefault?: {
    PPR?: string;
    halfPPR?: string;
    standard?: string;
  };
  Passing?: {
    passAttempts?: string;
    passCompletions?: string;
    passYds?: string;
    passTD?: string;
    int?: string;
  };
  Rushing?: {
    carries?: string;
    rushYds?: string;
    rushTD?: string;
  };
  Receiving?: { // Added Receiving stats as they are common for QB/RB/WR/TE
    receptions?: string;
    recYds?: string;
    recTD?: string;
    targets?: string;
  };
  Defense?: { // For defensive players, though less common for these slots
    soloTackles?: string;
    totalTackles?: string;
    sacks?: string;
    tfl?: string; // Tackles for loss
    passDeflections?: string;
    qbHits?: string;
    defensiveInterceptions?: string;
    fumblesRecovered?: string;
    defTD?: string; // Defensive Touchdowns
    fumbles?: string; // Total fumbles (forced or unforced if applicable)
    fumblesLost?: string; // Fumbles lost by this player
  };
  // Add other categories like Kicking, PuntReturns, KickReturns if needed
}

// Structure for overall team season record
export interface SeasonRecord {
  wins?: number | string; // Can be string from DB
  losses?: number | string;
  ties?: number | string;
  // Potentially add streak, standing, etc.
}

// Updated Structure for detailed team season stats to match Firestore
export interface SeasonTeamStats {
  // Top-level general stats, if they exist (e.g. from a different source or aggregated)
  // For now, focusing on matching the provided nested structure.
  // pointsFor?: string; (Example, if this was at the top level of seasonTeamStats)
  // pointsAgainst?: string;

  Defense?: {
    defTD?: string;
    defensiveInterceptions?: string;
    fumbles?: string;
    fumblesLost?: string;
    fumblesRecovered?: string;
    passDeflections?: string;
    passingTDAllowed?: string;
    passingYardsAllowed?: string;
    qbHits?: string;
    rushingTDAllowed?: string;
    rushingYardsAllowed?: string;
    sacks?: string;
    soloTackles?: string;
    tfl?: string;
    totalTackles?: string;
  };
  Kicking?: {
    fgAttempts?: string;
    fgMade?: string;
    fgYds?: string; // Typically 0 unless it's total length of FGs
    kickYards?: string; // Kickoff yards?
    xpAttempts?: string;
    xpMade?: string;
  };
  Passing?: { // Team Offensive Passing
    int?: string;
    passAttempts?: string;
    passCompletions?: string;
    passTD?: string;
    passYds?: string;
  };
  Punting?: {
    puntTouchBacks?: string;
    puntYds?: string;
    punts?: string;
    puntsin20?: string; // Punts inside the 20
  };
  Receiving?: { // Team Offensive Receiving
    recTD?: string;
    recYds?: string;
    receptions?: string;
    targets?: string;
  };
  Rushing?: { // Team Offensive Rushing
    carries?: string;
    rushTD?: string;
    rushYds?: string;
  };
  // Add other categories like Returns if available/needed
}

export interface SelectableTeam extends BaseSelectableEntity {
  entityType: 'team';
  logoUrl?: string;
  seasonRecord?: SeasonRecord; // Added team record
  seasonTeamStats?: SeasonTeamStats; // Added team season stats
  latestNews?: LatestNews;
  // Season fantasy points by unit - used for Quick Actions when actualPPG is 0
  seasonFP_Defense?: number;
  seasonFP_Passing?: number;
  seasonFP_Rushing?: number;
  seasonFP_ST?: number;
  // For teams, the 'position' or 'unit' (e.g., Defense, SpecialTeams) is usually implied
  // by the slot they are being selected for, rather than an intrinsic property of the team data itself.
}

// Revert SelectableEntity to a discriminated union type
export type SelectableEntity = SelectablePlayer | SelectableTeam;

// Represents a single pick as stored in Firestore within the weeklyLineup document
export interface StoredLineupPick {
  id: string; // Player or Team ID
  type: 'player' | 'team';
}

// Represents the 'picks' object stored in Firestore
export type StoredLineupPicks = Partial<Record<PositionKey, StoredLineupPick>>;

// Detailed Game Stat Types (moved from GameStatsModal.tsx)
export interface PlayerGameStatRaw {
  nflTeamId?: string; // Player's NFL team ID
  fantasyPoints?: number; // ACTUAL calculated fantasy points (numerical)
  apiFantasyPointsDefault?: { // API's default scores, converted to numbers
    standard?: number;
    ppr?: number;
    halfPpr?: number;
  };
  // *** Game Status from Tank01 API ***
  gameStatus?: string; // e.g., "Live - In Progress", "Final", "Completed"
  gameStatusCode?: number; // 0=not started, 1=live, 2=final, 3=postponed, 4=suspended
  rawBoxScoreStats?: { // This will hold the direct data from the API
    playerID?: string;
    longName?: string;
    teamID?: string;
    teamAbv?: string;
    gameID?: string; // This will be the API's gameID, might differ from the one in the path
    Passing?: { passYds?: string; passTD?: string; int?: string; passAttempts?: string; passCompletions?: string; sacked?: string; passAvg?: string; rtg?: string; qbr?: string; };
    Rushing?: { rushYds?: string; rushTD?: string; carries?: string; rushAvg?: string; longRush?: string; };
    Receiving?: { recYds?: string; recTD?: string; receptions?: string; targets?: string; };
    Kicking?: { fgMade?: string; xpMade?: string; fgAttempts?: string; xpAttempts?: string; };
    Defense?: { totalTackles?: string; sacks?: string; defensiveInterceptions?: string; defTD?: string; };
    Fumbles?: { fumbles?: string; fumblesLost?: string; };
    fantasyPoints?: string; // API calculated fantasy points (string)
    fantasyPointsDefault?: { // API's default scores (strings)
      standard?: string;
      PPR?: string;
      halfPPR?: string;
    };
    snapCounts?: Record<string, string>;
    scoringPlays?: Array<ScoringPlay>; // Keep generic for now
    // ... any other fields directly from the API's box score for a player
  };
}

export interface ScoringPlay {
  type: string; // e.g., 'TD', 'FG', 'PAT', 'SAFETY'
  description: string; // e.g., 'J.Smith 5 yd pass from P.Mahomes (H.Butker kick)'
  scoreChange?: number;
  teamId?: string; // Team that scored
  playerId?: string; // Primary player involved (e.g., scorer, passer)
  assistingPlayerId?: string; // e.g., passer on a TD reception
  quarter?: string | number;
  time?: string; // e.g., '10:34'
  // Add any other common fields you might expect
}

export interface TeamGameStatDetail {
  rawDefBoxScoreStats?: { 
    ptsAllowed?: string;
    sacks?: string;
    defensiveInterceptions?: string;
    fumblesRecovered?: string;
    defTD?: string;
    safeties?: string;
  };
  aggregatedStatsForCalc?: {
    passingStats?: { totalPassingYards?: number; totalPassingTDs?: number; totalInterceptionsThrown?: number; };
    rushingStats?: { totalRushingYards?: number; totalRushingTDs?: number; };
    specialTeamsStats?: { xpMade?: number; fgMade?: number; kickReturnTD?: number; puntReturnTD?: number; fumbleReturnTD?: number; xpReturn?: number; };
  };
  fantasyPointsPassing?: number;
  fantasyPointsRushing?: number;
  fantasyPointsDefense?: number;
  fantasyPointsSpecialTeams?: number;
  // *** Game Status from Tank01 API ***
  gameStatus?: string; // e.g., "Live - In Progress", "Final", "Completed"  
  gameStatusCode?: number; // 0=not started, 1=live, 2=final, 3=postponed, 4=suspended
  // Add any other relevant fields from FirestoreTeamGameStat
}

export type DetailedGameStatsType = PlayerGameStatRaw | TeamGameStatDetail;
