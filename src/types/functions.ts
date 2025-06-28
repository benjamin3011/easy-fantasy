import { PositionKey } from './lineup'; // Assuming PositionKey is defined here

// Payload for the saveWeeklyLineup callable function
export interface BackendLineupPick {
  id: string; // Player or Team ID
  type: 'player' | 'team';
}

export interface SaveLineupPayload {
  leagueId: string;
  week: number;
  picks: Partial<Record<PositionKey, BackendLineupPick>>;
  captainPlayerId?: string | null; // ID of the player designated as Captain
  // userId is typically not part of the payload for callable functions,
  // as it's available via context.auth.uid on the backend.
}

// Result from the saveWeeklyLineup callable function
export interface SaveLineupResult {
  success: boolean;
  message: string;
  // Add any other fields your function might return
}

// For functions that don't take specific input beyond auth context
export type EmptyInput = undefined; // Or could be an empty object: {};

// Generic result for many admin/utility functions
export interface GenericResult {
  success: boolean;
  message: string;
}

// Payload for addAdminRole
export interface AdminRolePayload {
  uid: string;
}

// Payload for manualFetchAndProcessGameStatsForWeek & manualFetchWeeklySchedule
export interface FetchStatsOrSchedulePayload {
  week: number;
  season?: number;
}

// Payload for calculateWeeklyScores
export interface CalculateScoresPayload {
  week: number;
  season?: number;
  leagueId?: string;
}

// --- Types for League Functions (to be moved/consolidated from leagues.ts) ---
export interface CreateLeaguePayload {
  name: string;
  teamName: string;
  isPublic?: boolean;
  enableCaptainFeature?: boolean;
  captainPointMultiplier?: number;
  enableWeeklyTips?: boolean;
}
export interface CreateLeagueResult {
  id: string; // League ID
}

export interface JoinLeagueByCodePayload {
  code: string;
  teamName: string;
}
export interface JoinLeagueByCodeResult {
  success: boolean;
  leagueId: string;
}

export interface JoinLeagueByIdPayload {
  leagueId: string;
  teamName: string;
}
// JoinLeagueByIdResult is GenericResult

export interface ToggleLeagueVisibilityPayload {
  leagueId: string;
  isPublic: boolean;
}
// ToggleLeagueVisibilityResult is GenericResult

export interface RenameLeaguePayload {
  leagueId: string;
  newName: string;
}
// RenameLeagueResult is GenericResult

export interface UpdateLeagueCaptainSettingsPayload {
  leagueId: string;
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
}
// UpdateLeagueCaptainSettingsResult is GenericResult 

// Payload for updateLeagueCaptainSettings
export interface UpdateLeagueCaptainSettingsPayload {
  leagueId: string;
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
}

// Payload for updateLeagueWeeklyTipsSettings
export interface UpdateLeagueWeeklyTipsSettingsPayload {
  leagueId: string;
  enableWeeklyTips: boolean;
}

// Payload for createWeeklyTips
export interface CreateWeeklyTipsPayload {
  leagueId: string;
  week: number;
  season?: number;
} 