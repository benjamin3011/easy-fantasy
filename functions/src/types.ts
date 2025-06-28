// src/types.ts
import * as admin from "firebase-admin";

export type PlayerPosition = 'QB' | 'RB' | 'WR' | 'TE';

// Types needed for TEAM point calculations
export interface TeamDefenseStatsCalc { // Structure for calculateDefensePoints (Parsed from DST)
    ptsAllowed?: number; defInt?: number; fumRec?: number;
    sacks?: number; safeties?: number; defTD?: number;
  }
export interface SpecialTeamsStatsCalc { // Structure for calculateSpecialTeamsPoints (Aggregated)
    xpMade?: number; fgMade?: number;
    kickReturnTD?: number; puntReturnTD?: number; fumbleReturnTD?: number;
    xpReturn?: number;
}
export interface TeamGameStatsForCalc { // Combined structure for team unit calcs
    passingStats?: { totalPassingYards?: number; totalPassingTDs?: number; totalInterceptionsThrown?: number; };
    rushingStats?: { totalRushingYards?: number; totalRushingTDs?: number; };
    teamDefData?: TeamDefenseStatsCalc;
    specialTeamsStats?: SpecialTeamsStatsCalc;
}

// --- API Response Interfaces (Based on paste-3.txt and previous definitions) ---

// Structure for /getNFLBoxScore Player Stats (Raw API Response)
export interface BoxScorePlayerGameStatsAPI {
    teamID?: string; gameID?: string; longName?: string; playerID?: string; team?: string; teamAbv?: string;
    Passing?: Record<string, unknown>; Rushing?: Record<string, unknown>; Receiving?: Record<string, unknown>;
    Defense?: Record<string, unknown>; Kicking?: Record<string, unknown>; Punting?: Record<string, unknown>;
    Fumbles?: Record<string, unknown>;
    // API's Fantasy Points calculations
    fantasyPoints?: string; // The main calculated value based on your params
    fantasyPointsDefault?: { standard?: string; PPR?: string; halfPPR?: string; }; // Default calculations
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
    gameStatusCode?: string; // Tank01 API game status code as string, will be parsed to number
    // Game score fields are actually in the body, not at the top level
    gameID?: string;
    teamIDHome?: string;
    teamIDAway?: string;
    home?: string;
    away?: string;
    homePts?: string | number;
    awayPts?: string | number;
    period?: string; // "Final", "Q1", "Q2", etc.
    gameClock?: string;
    currentPeriod?: string; // "Final", "Q1", "Q2", etc. - this is the actual field name
    lineScore?: {
        period?: string;
        gameClock?: string;
        currentPeriod?: string;
        away?: {
            Q1?: string;
            Q2?: string;
            Q3?: string;
            Q4?: string;
            teamID?: string;
            currentlyInPossession?: string;
            totalPts?: string;
            teamAbv?: string;
        };
        home?: {
            Q1?: string;
            Q2?: string;
            Q3?: string;
            Q4?: string;
            teamID?: string;
            currentlyInPossession?: string;
            totalPts?: string;
            teamAbv?: string;
        };
    };
    gameLocation?: string;
    arena?: string;
    network?: string;
    attendance?: string;
}
export interface BoxScoreResponse { 
    statusCode?: number; 
    body: BoxScoreBody;
    // Top-level fields that are not duplicated in body
    gameDate?: string;
    gameWeek?: string;
    seasonType?: string;
}
// Game Info for fetching IDs
export interface GameInfoForWeek {
    gameID: string;
    seasonType?: string; 
    week?: string; 
    gameDate?: string; 
    gameTime_epoch?: string; // Renamed from gameTimeEpoch to match usage
    teamIDHome: string;      
    teamIDAway: string;      
    home?: string; // Changed from homeTeamAbbreviation to match Firestore data
    away?: string; // Changed from awayTeamAbbreviation to match Firestore data
    // Consider adding other relevant fields from your Firestore snapshot if needed by backend logic
    // e.g., gameStatus?: string; gameTime?: string;
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
    // *** Store the parsed fantasy points directly from the API response ***
    fantasyPoints?: number; // Use this for the API's calculated value based on your rules
    // Optional: Store the API's default calculations if needed for reference
    apiFantasyPointsDefault?: { standard: number; ppr: number; halfPpr: number; };
    // *** Game Status from Tank01 API ***
    gameStatus?: string; // e.g., "Live - In Progress", "Final", "Completed"
    gameStatusCode?: number; // 0=not started, 1=live, 2=final, 3=postponed, 4=suspended
    lastUpdated: admin.firestore.Timestamp;
}

// Data stored in teams/{teamId}/gamestats/{gameId}
export interface FirestoreTeamGameStat {
    gameId: string;
    season: number;
    week: number;
    rawTeamBoxScoreStats?: Record<string, unknown>;
    rawDefBoxScoreStats?: Record<string, unknown>;
    // Fields for YOUR calculated team unit points
    fantasyPointsPassing?: number;
    fantasyPointsRushing?: number;
    fantasyPointsDefense?: number;
    fantasyPointsSpecialTeams?: number;
    // Optional: Store aggregated stats used for calc
    aggregatedStatsForCalc?: TeamGameStatsForCalc;
    // *** Game Status from Tank01 API ***
    gameStatus?: string; // e.g., "Live - In Progress", "Final", "Completed"  
    gameStatusCode?: number; // 0=not started, 1=live, 2=final, 3=postponed, 4=suspended
    lastUpdated: admin.firestore.Timestamp;
}

// *** NEW: Firestore structure for storing schedule ***
export interface FirestoreWeeklySchedule {
    season: number;
    week: number;
    games: GameInfoForWeek[]; // Store the array of games fetched from API
    lastUpdated: admin.firestore.Timestamp;
}

// Main Player/Team doc structure in Firestore (No average points)
export interface FirestorePlayer {
    playerId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    position: PlayerPosition;
    nflTeamId: string;
    nflTeamAbbreviation: string;
    headshotUrl?: string | null;
    isActive: boolean;
    injuryData?: Tank01ApiInjury | string | null;
    status?: string | null;
    nextOpponent?: string;
    nextGameId?: string | null;
    byeWeek?: number | null;
    lastUpdated: admin.firestore.Timestamp;
    // Store raw season stats needed for PPG calculation in UI
    rawSeasonStats?: Tank01ApiPlayerSeasonStats; // Includes gamesPlayed, fantasyPointsDefault
    apiSeasonFantasyPoints?: { standard: number; ppr: number; halfPpr: number; };
}
export interface FirestoreTeam {
    teamId: string;
    abbreviation: string;
    fullName?: string | null;
    logoUrl?: string | null;
    nextOpponent?: string;
    nextGameId?: string | null;
    byeWeek?: number | null;
    lastUpdated: admin.firestore.Timestamp;
    seasonRecord?: { wins: number; losses: number; ties: number; };
    // Store raw season team stats needed for PPG calculation in UI
    seasonTeamStats?: Record<string, unknown>;
}

// Lineup Structure
export type LineupPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'PassingOffense' | 'RushingOffense' | 'Defense' | 'SpecialTeams';
export interface LineupPick {
    id: string; // PlayerID or TeamID
    type: 'player' | 'team';
    selectedAt: admin.firestore.Timestamp;
    gameIdForWeek?: string; // Added: The specific game ID for this pick for the given week
}
export interface FirestoreWeeklyLineup {
    userId: string;
    leagueId: string;
    season: number;
    week: number;
    picks: Partial<Record<LineupPosition, LineupPick>>;
    isComplete: boolean;
    lastUpdated: admin.firestore.Timestamp;
    totalActualPoints?: number | null; // Renamed from totalPoints and made optional for clarity
    captainPlayerId?: string | null; // ID of the player designated as Captain
}

// Usage Count Structure
export interface FirestoreLeagueUsageCount {
    entityId: string; // e.g., 'player_12345' or 'team_11'
    type: 'player' | 'team';
    count: number;
}

// --- League Structure with Member Points ---
export interface FirestoreLeagueMember {
    uid: string;
    teamName: string;
    // Optional: Add other member-specific league settings if any in the future
    weeklyPoints?: { [week: string]: number }; // Key is week number (e.g., "1", "2")
    totalSeasonPoints?: number;
    lastUpdated?: admin.firestore.Timestamp;
}

export interface FirestoreLeague {
    name: string;
    adminUid: string;
    code: string;
    isPublic: boolean;
    members: FirestoreLeagueMember[]; // Array of members with their points
    memberUids: string[]; // Still useful for quick checks of who is in the league
    createdAt: admin.firestore.Timestamp;
    enableCaptainFeature?: boolean;
    captainPointMultiplier?: number;
    // Add any other league-wide settings
}

// Add notification preferences types
export interface NotificationPreferences {
    lineupDeadlineAlerts: boolean;
    lineupDeadlineMinutes: number; // How many minutes before game start to alert
    scoringAlerts: boolean;
    injuryAlerts: boolean;
    leagueActivityAlerts: boolean;
    enabled: boolean; // Master toggle
}

export interface FirestoreUser {
    uid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fcmToken?: string; // Firebase Cloud Messaging token
    notificationPreferences?: NotificationPreferences;
    createdAt: admin.firestore.Timestamp;
    lastLoginAt?: admin.firestore.Timestamp;
}
