import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  SaveLineupPayload, SaveLineupResult,
  AdminRolePayload, GenericResult, EmptyInput,
  FetchStatsOrSchedulePayload, CalculateScoresPayload,
  CreateLeaguePayload, CreateLeagueResult,
  JoinLeagueByCodePayload, JoinLeagueByCodeResult,
  JoinLeagueByIdPayload, /* Uses GenericResult */
  ToggleLeagueVisibilityPayload, /* Uses GenericResult */
  RenameLeaguePayload, /* Uses GenericResult */
  UpdateLeagueCaptainSettingsPayload, // Import the new payload type
  CreateWeeklyTipsPayload,
  UpdateLeagueWeeklyTipsSettingsPayload,
  UpdateLeagueAutoSettingsPayload
} from '../types/functions';

const app = getApp(); // Get the default Firebase app instance
const functions = getFunctions(app, 'europe-west3'); // Specify the region for all functions

// Lineup Processing
export const saveWeeklyLineupCallable = httpsCallable<SaveLineupPayload, SaveLineupResult>(functions, 'saveWeeklyLineup');
export const calculateWeeklyScoresCallable = httpsCallable<CalculateScoresPayload, GenericResult>(functions, 'calculateWeeklyScores');

// Admin
export const addAdminRoleCallable = httpsCallable<AdminRolePayload, GenericResult>(functions, 'addAdminRole');
export const manualUpdateTeamsAndPlayersCallable = httpsCallable<EmptyInput, GenericResult>(functions, 'manualUpdateTeamsAndPlayers');
export const manualFetchAndProcessGameStatsForWeekCallable = httpsCallable<FetchStatsOrSchedulePayload, GenericResult>(functions, 'manualFetchAndProcessGameStatsForWeek');
export const manualFetchWeeklyScheduleCallable = httpsCallable<FetchStatsOrSchedulePayload, GenericResult>(functions, 'manualFetchWeeklySchedule');

// League Management
export const createLeagueCallable = httpsCallable<CreateLeaguePayload, CreateLeagueResult>(functions, 'createLeague');
export const joinLeagueByCodeCallable = httpsCallable<JoinLeagueByCodePayload, JoinLeagueByCodeResult>(functions, 'joinLeagueByCode');
export const joinLeagueByIdCallable = httpsCallable<JoinLeagueByIdPayload, GenericResult>(functions, 'joinLeagueById');
export const toggleLeagueVisibilityCallable = httpsCallable<ToggleLeagueVisibilityPayload, GenericResult>(functions, 'toggleLeagueVisibility');
export const renameLeagueCallable = httpsCallable<RenameLeaguePayload, GenericResult>(functions, 'renameLeague');

// New callable for updating captain settings
export const updateLeagueCaptainSettingsCallable = httpsCallable<UpdateLeagueCaptainSettingsPayload, GenericResult>(functions, 'updateLeagueCaptainSettings');

// New callable for updating weekly tips settings
export const updateLeagueWeeklyTipsSettingsCallable = httpsCallable<UpdateLeagueWeeklyTipsSettingsPayload, GenericResult>(functions, 'updateLeagueWeeklyTipsSettings');

// Create Weekly Tips Poll
export const createWeeklyTipsCallable = httpsCallable<CreateWeeklyTipsPayload, GenericResult>(functions, 'createWeeklyTips');

// Update Tips Odds
export const updateTipsOddsCallable = httpsCallable<{ week?: number; season?: number }, GenericResult>(functions, 'updateTipsOdds');

// Calculate Tips Results
export const calculateTipsResultsCallable = httpsCallable<{ leagueId: string; week: number; season?: number }, GenericResult>(functions, 'calculateTipsResults');

// Auto-settings management
export const updateLeagueAutoSettingsCallable = httpsCallable<UpdateLeagueAutoSettingsPayload, GenericResult>(functions, 'updateLeagueAutoSettings');

// Health/Integrity
import type { HealthCheckStandingsPayload, RepairProphetTotalsPayload, RepairProphetTotalsResult, RepairSeasonFantasyPointsPayload, RepairSeasonFantasyPointsResult } from '../types/functions';
export const healthCheckStandingsCallable = httpsCallable<HealthCheckStandingsPayload, GenericResult>(functions, 'healthCheckStandings');
export const systemHealthCheckCallable = httpsCallable(functions, 'systemHealthCheck');
export const repairSystemIssuesCallable = httpsCallable(functions, 'repairSystemIssues');

// Tips functions
export const repairProphetTotalsCallable = httpsCallable<RepairProphetTotalsPayload, RepairProphetTotalsResult>(functions, 'repairProphetTotals');

// Stats repair functions
export const repairSeasonFantasyPointsCallable = httpsCallable<RepairSeasonFantasyPointsPayload, RepairSeasonFantasyPointsResult>(functions, 'repairSeasonFantasyPoints');

// Add other callable functions here as needed
// export const anotherCallable = httpsCallable<InputType, OutputType>(functions, 'anotherFunctionName'); 