import { db } from '../firebase/firebase';
import { collection, query, where, getDocs, DocumentData, doc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { SelectablePlayer, SelectableTeam, PositionKey, InjuryStatus, StoredLineupPicks, RawSeasonStats, SeasonRecord, SeasonTeamStats, DetailedGameStatsType, SelectableEntity } from '../types/lineup';
import { APP_CONFIG } from '../config/appConfig'; // Import app config for season
import { getFirestore } from 'firebase/firestore';
import { measureAsyncPerformance, trackFirebaseOperation, addBreadcrumb } from '../config/sentry';

// ===== PERFORMANCE OPTIMIZATION: CACHING SYSTEM =====

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheConfig {
  players: number;      // 5 minutes
  teams: number;        // 10 minutes
  schedule: number;     // 30 minutes
  usageCounts: number;  // 2 minutes
  news: number;         // 15 minutes
}

class PerformanceCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly config: CacheConfig = {
    players: 5 * 60 * 1000,      // 5 minutes
    teams: 10 * 60 * 1000,       // 10 minutes
    schedule: 30 * 60 * 1000,    // 30 minutes
    usageCounts: 2 * 60 * 1000,  // 2 minutes
    news: 15 * 60 * 1000,        // 15 minutes
  };

  set<T>(key: string, data: T, type: keyof CacheConfig): void {
    const ttl = this.config[type];
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(pattern: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => 
      key.includes(pattern)
    );
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Global cache instance
const performanceCache = new PerformanceCache();

// ===== LAZY LOADING UTILITIES =====

interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
  totalCount?: number;
}

interface LazyLoadOptions {
  limit?: number;
  cursor?: string;
  sortBy?: 'actualPPG' | 'name' | 'usageCount';
  sortOrder?: 'asc' | 'desc';
  filters?: {
    excludeInjured?: boolean;
    excludeByeWeek?: boolean;
    maxUsage?: number;
  };
}

// ===== OPTIMISTIC UPDATE UTILITIES =====

interface OptimisticUpdate<T> {
  id: string;
  originalData: T;
  optimisticData: T;
  timestamp: number;
  rollback: () => void;
}

class OptimisticUpdateManager {
  private updates = new Map<string, OptimisticUpdate<unknown>>();

  add<T>(id: string, originalData: T, optimisticData: T, rollback: () => void): void {
    this.updates.set(id, {
      id,
      originalData,
      optimisticData,
      timestamp: Date.now(),
      rollback
    });
  }

  commit(id: string): void {
    this.updates.delete(id);
  }

  rollback(id: string): void {
    const update = this.updates.get(id);
    if (update) {
      update.rollback();
      this.updates.delete(id);
    }
  }

  rollbackAll(): void {
    this.updates.forEach(update => update.rollback());
    this.updates.clear();
  }

  getPendingUpdates(): string[] {
    return Array.from(this.updates.keys());
  }
}

// Global optimistic update manager
const optimisticUpdateManager = new OptimisticUpdateManager();

// ===== EXPORT PERFORMANCE UTILITIES =====

export { performanceCache, optimisticUpdateManager };
export type { PaginatedResult, LazyLoadOptions };

// ===== ENHANCED FETCH FUNCTIONS WITH CACHING =====

// Basic interface for game information, align with backend GameInfoForWeek if possible
export interface GameInfoFromSchedule {
  gameID: string;
  teamIDHome: string; // Match Firestore field names (teamIDHome, teamIDAway)
  teamIDAway: string;
  home?: string; // Changed from homeTeamAbbreviation
  away?: string; // Changed from awayTeamAbbreviation
  gameTime_epoch: number | string; // Match Firestore (string), will parse to number. Renamed to gameTime_epoch
  gameStatus?: string; // e.g., "Scheduled", "Live", "Final"
  gameStatusCode?: string; // e.g., "0", "1", "2" - Tank01 API status codes
  // Add other relevant fields like team names if available directly on game object
}

// Interface for the structure of the nfl_schedules document
export interface FirestoreWeeklySchedule {
  season: number;
  week: number;
  games: GameInfoFromSchedule[]; // Use the renamed interface
  // lastUpdated: firebase.firestore.Timestamp; // Or appropriate Firestore Timestamp type for client
}

// Interim type for game object from Firestore before transformation
interface FirestoreGameInfoRaw extends Omit<GameInfoFromSchedule, 'gameTime_epoch'> {
  gameTime_epoch: number | string; // Keeping it as number | string as it is in Firestore
}

// Helper to find game and opponent from schedule
const getWeekSpecificGameInfo = (
  entityTeamId: string, // The ID of the team we're finding the game for
  weeklySchedule?: FirestoreWeeklySchedule | null
): { opponentForWeek?: string; gameTimeEpochForWeek?: number; gameIdForWeek?: string } => {
  if (!weeklySchedule || !weeklySchedule.games || weeklySchedule.games.length === 0) {
    return {};
  }
  

  const game = weeklySchedule.games.find(
    (g) => g.teamIDHome === entityTeamId || g.teamIDAway === entityTeamId
  );

  if (game) {
    // console.log(`[getWeekSpecificGameInfo] Found game for teamId ${entityTeamId}:`, JSON.stringify(game, null, 2));
    const isHome = game.teamIDHome === entityTeamId;
    // Use game.away (opponent's abbreviation if entity is home) or game.home (opponent's abbreviation if entity is away)
    // Fallback to opponent's ID if abbreviation is missing.
    const opponentAbbrev = isHome ? (game.away || game.teamIDAway) : (game.home || game.teamIDHome);
    
    // Format opponent with home/away indicator
    const formattedOpponent = isHome ? `vs ${opponentAbbrev}` : `@ ${opponentAbbrev}`;
    
    // Ensure gameTime_epoch is parsed correctly
    const gameTimeEpoch = typeof game.gameTime_epoch === 'string' 
      ? parseInt(game.gameTime_epoch, 10) 
      : game.gameTime_epoch;

    return {
      opponentForWeek: formattedOpponent,
      gameTimeEpochForWeek: gameTimeEpoch,
      gameIdForWeek: game.gameID
    };
  }

  return {};
};

// ===== ENHANCED FETCH FUNCTIONS WITH SENTRY MONITORING =====

export async function fetchSelectablePlayers(
  positionKey: PositionKey,
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null
): Promise<SelectablePlayer[]> {
  return measureAsyncPerformance(`fetchSelectablePlayers-${positionKey}`, async () => {
    trackFirebaseOperation('query', 'players');
    
    const cacheKey = `players_${positionKey}`;
    const cached = performanceCache.get<SelectablePlayer[]>(cacheKey);
    if (cached) {
      addBreadcrumb(`Cache hit for players: ${positionKey}`, 'performance', 'info');
      return cached;
    }

    const playersRef = collection(db, 'players');
    const q = query(playersRef, where('position', '==', positionKey));
    const querySnapshot = await getDocs(q);
    
    const players: SelectablePlayer[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      const player: SelectablePlayer = {
        id: doc.id,
        entityType: 'player',
        name: data.fullName || data.name || 'Unknown Player',
        position: data.position || positionKey,
        teamAbbreviation: data.nflTeamAbbreviation || data.teamAbbreviation || data.team || 'UNK',
        fullTeamName: data.nflTeamFullName || data.fullTeamName || data.nflTeamAbbreviation || data.team || 'Unknown Team',
        actualPPG: data.actualPPG || (data.seasonFantasyPoints && data.gamesPlayed ? data.seasonFantasyPoints / data.gamesPlayed : 0),
        usageCount: usageCounts?.[`player_${doc.id}`] || 0,
        injuryStatus: data.injuryStatus || (data.injuryData ? {
          status: data.injuryData.designation || (data.injuryData.description ? 'Out' : 'Healthy'),
          details: data.injuryData.description
        } : { status: 'Healthy' }),
        headshotUrl: data.headshotUrl,
        rawSeasonStats: data.rawSeasonStats || data.seasonStats as RawSeasonStats || undefined,
        ...getWeekSpecificGameInfo(data.nflTeamId || data.teamID || data.teamId, weeklySchedule)
      };
      players.push(player);
    });

    performanceCache.set(cacheKey, players, 'players');
    addBreadcrumb(`Fetched ${players.length} players for ${positionKey}`, 'firebase', 'info');
    return players;
  });
}

export async function fetchSelectableTeams(
  positionKey: PositionKey,
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null
): Promise<SelectableTeam[]> {
  // Check cache first
  const cacheKey = `teams_${positionKey}_${JSON.stringify(usageCounts)}_${weeklySchedule?.week || 'no-schedule'}`;
  const cachedData = performanceCache.get<SelectableTeam[]>(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const teamsCollectionRef = collection(db, 'teams');
  const q = query(teamsCollectionRef);
  const querySnapshot = await getDocs(q);

  // Temporary interface for sorting
  interface TeamWithSorting extends SelectableTeam {
    sortingValue: number;
  }

  const teams = querySnapshot.docs.map((doc): TeamWithSorting => {
    const data = doc.data() as DocumentData;
    const entityUsageKey = `team_${doc.id}`;
    const currentUsage = usageCounts && usageCounts[entityUsageKey] ? usageCounts[entityUsageKey] : 0;
    
    const gamesPlayed = data.gamesPlayed || 0; 
    let seasonFPForUnit = 0;

    switch (positionKey) {
      case 'PassingOffense': seasonFPForUnit = data.seasonFP_Passing || 0; break;
      case 'RushingOffense': seasonFPForUnit = data.seasonFP_Rushing || 0; break;
      case 'Defense': seasonFPForUnit = data.seasonFP_Defense || 0; break;
      case 'SpecialTeams': seasonFPForUnit = data.seasonFP_ST || 0; break;
      default: seasonFPForUnit = 0;
    }
    
    // Handle new season scenario where gamesPlayed is 0
    // Use raw fantasy points for sorting, but show 0.00 PPG in UI
    let calculatedPpg = 0;
    let sortingValue = 0;
    
    if (gamesPlayed > 0) {
      // Normal case: calculate actual PPG
      calculatedPpg = seasonFPForUnit / gamesPlayed;
      sortingValue = calculatedPpg;
    } else {
      // New season case: use raw fantasy points for sorting, but display 0.00 PPG
      calculatedPpg = 0;
      sortingValue = seasonFPForUnit; // Use raw points for sorting
    }

    const { opponentForWeek, gameTimeEpochForWeek, gameIdForWeek } = getWeekSpecificGameInfo(doc.id, weeklySchedule);

    return {
      id: doc.id,
      name: data.fullName || data.name || `Team ${data.abbreviation || doc.id}`,
      entityType: 'team',
      teamAbbreviation: data.abbreviation || 'N/A',
      logoUrl: data.logoUrl,
      actualPPG: parseFloat(calculatedPpg.toFixed(2)), 
      usageCount: currentUsage,
      byeWeek: data.byeWeek,
      opponentForWeek: opponentForWeek || data.nextOpponent,
      gameTimeEpochForWeek: gameTimeEpochForWeek ?? (typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch),
      gameIdForWeek: gameIdForWeek || data.nextGameId,
      nextOpponent: data.nextOpponent, 
      gameTimeEpoch: typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch,
      gameId: data.nextGameId,
      seasonRecord: data.seasonRecord as SeasonRecord | undefined,
      seasonTeamStats: data.seasonTeamStats as SeasonTeamStats | undefined,
      // Include season fantasy points for Quick Actions
      seasonFP_Defense: data.seasonFP_Defense || 0,
      seasonFP_Passing: data.seasonFP_Passing || 0,
      seasonFP_Rushing: data.seasonFP_Rushing || 0,
      seasonFP_ST: data.seasonFP_ST || 0,
      sortingValue: sortingValue,
    };
  });
  
  // Sort by sortingValue instead of actualPPG to handle new season scenario
  const sortedTeams = teams.sort((a, b) => b.sortingValue - a.sortingValue);
  
  // Remove sortingValue before returning (clean up the temporary property)
  const cleanedTeams = sortedTeams.map((team): SelectableTeam => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sortingValue, ...cleanTeam } = team;
    return cleanTeam;
  });
  
  // Cache the result
  performanceCache.set(cacheKey, cleanedTeams, 'teams');
  
  return cleanedTeams;
}

// New interface for the data returned by the listener function
export interface StoredLineupData {
  picks: StoredLineupPicks | null;
  totalActualPoints?: number;
  captainPlayerId?: string | null; // ID of the player designated as Captain
}

// Modified to use onSnapshot for real-time updates
export function listenToStoredWeeklyLineup(
  userId: string,
  leagueId: string,
  week: number,
  callback: (data: StoredLineupData) => void,
  onError: (error: Error) => void
): Unsubscribe | undefined {
  if (!userId || !leagueId || !week) {
    // console.error("listenToStoredWeeklyLineup: Missing userId, leagueId, or week"); // Keep for ops
    onError(new Error("Missing userId, leagueId, or week"));
    return undefined;
  }

  const season = APP_CONFIG.CURRENT_NFL_SEASON;
  const lineupDocId = `${leagueId}_${season}_${week}`;
  const lineupDocRef = doc(db, 'users', userId, 'weeklyLineups', lineupDocId);

  const unsubscribe = onSnapshot(lineupDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const lineupData: StoredLineupData = {
        picks: (data.picks as StoredLineupPicks) ?? null,
        totalActualPoints: data.totalActualPoints as number | undefined,
        captainPlayerId: data.captainPlayerId as string | null,
      };
      callback(lineupData);
    } else {
      // No lineup saved for this week yet, or document deleted
      callback({ picks: null, totalActualPoints: undefined, captainPlayerId: undefined });
    }
  }, (error: Error) => {
    // console.error("Error listening to stored weekly lineup picks:", error); // Keep for ops
    onError(error);
  });

  return unsubscribe; // Return the unsubscribe function
}

// One-time fetch function for getting lineup data for a specific week (used for "Copy from Last Week")
export async function fetchStoredWeeklyLineup(
  userId: string,
  leagueId: string,
  week: number,
  season?: string | number
): Promise<StoredLineupData | null> {
  if (!userId || !leagueId || !week) {
    throw new Error("Missing userId, leagueId, or week");
  }

  const currentSeason = season || APP_CONFIG.CURRENT_NFL_SEASON;
  const lineupDocId = `${leagueId}_${currentSeason}_${week}`;
  const lineupDocRef = doc(db, 'users', userId, 'weeklyLineups', lineupDocId);

  try {
    const docSnap = await getDoc(lineupDocRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        picks: (data.picks as StoredLineupPicks) ?? null,
        totalActualPoints: data.totalActualPoints as number | undefined,
        captainPlayerId: data.captainPlayerId as string | null,
      };
    } else {
      // No lineup saved for this week
      return null;
    }
  } catch (error) {
    console.error("Error fetching stored weekly lineup:", error);
    throw error;
  }
}

export async function fetchSelectablePlayerById(
  playerId: string,
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null
): Promise<SelectablePlayer | null> {
  const playerDocRef = doc(db, 'players', playerId);
  const playerDocSnap = await getDoc(playerDocRef);

  if (playerDocSnap.exists()) {
    const data = playerDocSnap.data() as DocumentData;
    const entityUsageKey = `player_${playerId}`;
    const currentUsage = usageCounts && usageCounts[entityUsageKey] ? usageCounts[entityUsageKey] : 0;
    
    const injuryData = data.injuryData;
    const injuryStatus: InjuryStatus | undefined = injuryData ? 
      { 
        status: injuryData.designation || (injuryData.description ? 'Out' : 'Healthy'),
        details: injuryData.description 
      } :
      { status: 'Healthy' };

    const currentSeasonFantasyPoints = data.seasonFantasyPoints || 0;
    const gamesPlayed = data.gamesPlayed || 0;
    const calculatedPpg = gamesPlayed > 0 ? currentSeasonFantasyPoints / gamesPlayed : 0;

    const { opponentForWeek, gameTimeEpochForWeek, gameIdForWeek } = getWeekSpecificGameInfo(data.nflTeamId, weeklySchedule);

    let actualPointsForWeek: number | undefined = undefined;
    if (gameIdForWeek) {
      actualPointsForWeek = await fetchActualFantasyPointsForGame(playerId, 'player', gameIdForWeek);
    }

    return {
      id: playerId,
      name: data.fullName || 'N/A',
      entityType: 'player',
      fullTeamName: data.nflTeamFullName || data.nflTeamAbbreviation || 'N/A',
      teamAbbreviation: data.nflTeamAbbreviation || 'N/A',
      position: data.position,
      headshotUrl: data.headshotUrl,
      actualPPG: parseFloat(calculatedPpg.toFixed(2)),
      usageCount: currentUsage,
      injuryStatus: injuryStatus,
      byeWeek: data.byeWeek,
      opponentForWeek: opponentForWeek || data.nextOpponent,
      gameTimeEpochForWeek: gameTimeEpochForWeek ?? (typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch),
      gameIdForWeek: gameIdForWeek || data.nextGameId,
      actualFantasyPoints: actualPointsForWeek,
      nextOpponent: data.nextOpponent,
      gameTimeEpoch: typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch,
      gameId: data.nextGameId,
      rawSeasonStats: data.rawSeasonStats as RawSeasonStats | undefined,
    } as SelectablePlayer;
  } else {
    // console.warn(`Player with ID ${playerId} not found.`); // Keep for ops
    return null;
  }
}

export async function fetchSelectableTeamById(
  teamId: string,
  positionKey?: PositionKey, 
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null
): Promise<SelectableTeam | null> {
  const teamDocRef = doc(db, 'teams', teamId);
  const teamDocSnap = await getDoc(teamDocRef);

  if (teamDocSnap.exists()) {
    const data = teamDocSnap.data() as DocumentData;
    const entityUsageKey = `team_${teamId}`;
    const currentUsage = usageCounts && usageCounts[entityUsageKey] ? usageCounts[entityUsageKey] : 0;

    const gamesPlayed = data.gamesPlayed || 0;
    let seasonFPForUnit = 0;

    if (positionKey) {
      switch (positionKey) {
        case 'PassingOffense': seasonFPForUnit = data.seasonFP_Passing || 0; break;
        case 'RushingOffense': seasonFPForUnit = data.seasonFP_Rushing || 0; break;
        case 'Defense': seasonFPForUnit = data.seasonFP_Defense || 0; break;
        case 'SpecialTeams': seasonFPForUnit = data.seasonFP_ST || 0; break;
        default: seasonFPForUnit = 0;
      }
    }
    
    // Handle new season scenario where gamesPlayed is 0 (same logic as fetchSelectableTeams)
    const calculatedPpg = gamesPlayed > 0 ? seasonFPForUnit / gamesPlayed : 0;

    const { opponentForWeek, gameTimeEpochForWeek, gameIdForWeek } = getWeekSpecificGameInfo(teamId, weeklySchedule);

    let actualPointsForWeek: number | undefined = undefined;
    if (gameIdForWeek && positionKey) {
      actualPointsForWeek = await fetchActualFantasyPointsForGame(teamId, 'team', gameIdForWeek, positionKey);
    }

    return {
      id: teamId,
      name: data.fullName || data.name || `Team ${data.abbreviation || teamId}`,
      entityType: 'team',
      teamAbbreviation: data.abbreviation || 'N/A',
      logoUrl: data.logoUrl,
      actualPPG: parseFloat(calculatedPpg.toFixed(2)),
      usageCount: currentUsage,
      byeWeek: data.byeWeek,
      opponentForWeek: opponentForWeek || data.nextOpponent,
      gameTimeEpochForWeek: gameTimeEpochForWeek ?? (typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch),
      gameIdForWeek: gameIdForWeek || data.nextGameId,
      actualFantasyPoints: actualPointsForWeek,
      nextOpponent: data.nextOpponent,
      gameTimeEpoch: typeof data.nextGameTimeEpoch === 'string' ? parseInt(data.nextGameTimeEpoch, 10) : data.nextGameTimeEpoch,
      gameId: data.nextGameId,
      seasonRecord: data.seasonRecord as SeasonRecord | undefined,
      seasonTeamStats: data.seasonTeamStats as SeasonTeamStats | undefined,
      // Include season fantasy points for Quick Actions
      seasonFP_Defense: data.seasonFP_Defense || 0,
      seasonFP_Passing: data.seasonFP_Passing || 0,
      seasonFP_Rushing: data.seasonFP_Rushing || 0,
      seasonFP_ST: data.seasonFP_ST || 0,
    } as SelectableTeam;
  } else {
    // console.warn(`Team with ID ${teamId} not found.`); // Keep for ops
    return null;
  }
}

export async function fetchActualFantasyPointsForGame(
  entityId: string,
  entityType: 'player' | 'team',
  gameId: string,
  positionKey?: PositionKey
): Promise<number | undefined> {
  if (!entityId || !entityType || !gameId) {
    // console.warn('fetchActualFantasyPointsForGame: Missing entityId or gameId'); // Keep for ops
    return undefined;
  }

  const collectionName = entityType === 'player' ? 'players' : 'teams';
  const gameStatsRef = collection(db, collectionName, entityId, 'gamestats');
  const q = query(gameStatsRef, where('gameId', '==', gameId)); 

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const gameStatDoc = querySnapshot.docs[0].data();
      if (entityType === 'player') {
        return gameStatDoc.fantasyPoints as number | undefined;
      } else if (entityType === 'team' && positionKey) {
        switch (positionKey) {
          case 'PassingOffense': return gameStatDoc.fantasyPointsPassing as number | undefined;
          case 'RushingOffense': return gameStatDoc.fantasyPointsRushing as number | undefined;
          case 'Defense': return gameStatDoc.fantasyPointsDefense as number | undefined;
          case 'SpecialTeams': return gameStatDoc.fantasyPointsSpecialTeams as number | undefined;
          default: return undefined;
        }
      }
    }
    return undefined; 
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  catch (_error: unknown) { // Intentionally unused error for linter when log is commented
    // console.error(`Error fetching actual fantasy points for ${entityType} ${entityId}, game ${gameId}:`, _error); // Keep for ops
    return undefined;
  }
}

export async function fetchUsageCounts(
  userId: string,
  leagueId: string
): Promise<Record<string, number>> {
  // Check cache first
  const cacheKey = `usage_${userId}_${leagueId}`;
  const cachedData = performanceCache.get<Record<string, number>>(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // Access user-specific usage counts as per Firestore rules
  const leagueSeasonDocId = `${leagueId}_${APP_CONFIG.CURRENT_NFL_SEASON}`;
  const usageCollectionRef = collection(db, 'users', userId, 'leagueUsage', leagueSeasonDocId, 'usageCounts');
  
  try {
    const usageSnapshot = await getDocs(usageCollectionRef);
    const userUsageData: Record<string, number> = {};
    
    // Build usage data from individual documents
    usageSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.entityId && typeof data.count === 'number') {
        userUsageData[data.entityId] = data.count;
      }
    });
    
    // Cache the result
    performanceCache.set(cacheKey, userUsageData, 'usageCounts');
    
    return userUsageData;
  } catch (error) {
    console.error("Error fetching usage counts:", error);
    return {};
  }
}

export async function fetchWeeklySchedule(
  season: string | number,
  week: number
): Promise<FirestoreWeeklySchedule | null> {
  // Check cache first
  const cacheKey = `schedule_${season}_${week}`;
  const cachedData = performanceCache.get<FirestoreWeeklySchedule>(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const scheduleDocId = `${season}_week_${week}`;
  const scheduleDocRef = doc(db, 'nfl_schedules', scheduleDocId);

  try {
    const docSnap = await getDoc(scheduleDocRef);
    if (docSnap.exists()) {
      // Explicitly cast to FirestoreWeeklySchedule
      // Ensure mapping of gameTime_epoch if it's a string from DB to number if needed by frontend
      const data = docSnap.data() as Omit<FirestoreWeeklySchedule, 'games'> & { games: FirestoreGameInfoRaw[] }; // Use interim type
      const games = data.games.map((game: FirestoreGameInfoRaw) => ({ // Use interim type for game parameter
        ...game,
        gameTime_epoch: typeof game.gameTime_epoch === 'string' ? parseInt(game.gameTime_epoch, 10) : game.gameTime_epoch
      })) as GameInfoFromSchedule[];
      
      const schedule = { ...data, games } as FirestoreWeeklySchedule;
      
      // Cache the result
      performanceCache.set(cacheKey, schedule, 'schedule');
      
      return schedule;
    } else {
      console.warn(`No schedule document found for: ${scheduleDocId}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching weekly schedule:", error);
    throw error; // Re-throw or handle as needed
  }
}

// New function to fetch detailed game stats
export async function fetchDetailedGameStatsForEntity(
  entityId: string,
  entityType: 'player' | 'team',
  gameId: string
): Promise<DetailedGameStatsType | null> {
  try {
    const db = getFirestore();
    
    if (entityType === 'player') {
      const docRef = doc(db, 'players', entityId, 'gamestats', gameId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data as DetailedGameStatsType;
      }
    } else if (entityType === 'team') {
      const docRef = doc(db, 'teams', entityId, 'gamestats', gameId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data as DetailedGameStatsType;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching detailed game stats for ${entityType} ${entityId}:`, error);
    return null;
  }
}

// Fetch game scores for live game display
export interface GameScore {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  gameStatus: string;
  gameStatusCode: number;
  quarter?: number;
  timeRemaining?: string;
  lastUpdated: Date;
}

export async function fetchGameScore(gameId: string): Promise<GameScore | null> {
  try {
    const db = getFirestore();
    const docRef = doc(db, 'gameScores', gameId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        gameId: data.gameId,
        season: data.season,
        week: data.week,
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        gameStatus: data.gameStatus,
        gameStatusCode: data.gameStatusCode,
        quarter: data.quarter,
        timeRemaining: data.timeRemaining,
        lastUpdated: data.lastUpdated?.toDate() || new Date()
      } as GameScore;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching game score for ${gameId}:`, error);
    return null;
  }
}

// Fetch multiple game scores for a list of game IDs
export async function fetchGameScores(gameIds: string[]): Promise<Map<string, GameScore>> {
  const gameScores = new Map<string, GameScore>();
  
  if (gameIds.length === 0) {
    return gameScores;
  }
  
  try {
    // Fetch all game scores in parallel
    const scorePromises = gameIds.map(async (gameId) => {
      const score = await fetchGameScore(gameId);
      if (score) {
        gameScores.set(gameId, score);
      }
    });
    
    await Promise.all(scorePromises);
    
    return gameScores;
  } catch (error) {
    console.error('Error fetching multiple game scores:', error);
    return gameScores;
  }
}

export async function checkIfLineupExists(
  userId: string,
  leagueId: string,
  week: number,
  season: string | number
): Promise<boolean> {
  if (!userId || !leagueId || !week || !season) {
    // console.error('checkIfLineupExists: Missing required parameters.'); // Keep for ops
    return false;
  }
  const lineupDocId = `${leagueId}_${season}_${week}`;
  const lineupDocRef = doc(db, 'users', userId, 'weeklyLineups', lineupDocId);

  try {
    const docSnap = await getDoc(lineupDocRef);
    return docSnap.exists();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) { // Intentionally unused error for linter when log is commented
    // console.error(`Error checking lineup existence for user ${userId}, league ${leagueId}, week ${week}:`, _error); // Keep for ops
    return false; // Return false on error to indicate lineup likely not set or inaccessible
  }
}

export interface LineupCompletionStatus {
  exists: boolean;
  isComplete: boolean;
  positionsFilled: number;
  totalPositions: number;
}

export async function checkLineupCompletionStatus(
  userId: string,
  leagueId: string,
  week: number,
  season: string | number
): Promise<LineupCompletionStatus> {
  const defaultStatus: LineupCompletionStatus = {
    exists: false,
    isComplete: false,
    positionsFilled: 0,
    totalPositions: 8
  };

  if (!userId || !leagueId || !week || !season) {
    return defaultStatus;
  }

  const lineupDocId = `${leagueId}_${season}_${week}`;
  const lineupDocRef = doc(db, 'users', userId, 'weeklyLineups', lineupDocId);

  try {
    const docSnap = await getDoc(lineupDocRef);
    
    if (!docSnap.exists()) {
      return defaultStatus;
    }

    const lineupData = docSnap.data();
    const picks = lineupData?.picks || {};
    
    // Count filled positions
    const positionsFilled = Object.keys(picks).filter(key => picks[key] !== undefined && picks[key] !== null).length;
    const totalPositions = 8; // QB, RB, WR, TE, PassingOffense, RushingOffense, Defense, SpecialTeams
    const isComplete = lineupData?.isComplete === true; // Use the existing isComplete flag from Firestore

    return {
      exists: true,
      isComplete,
      positionsFilled,
      totalPositions
    };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) { // Intentionally unused error for linter when log is commented
    return defaultStatus;
  }
}

// ===== OPTIMISTIC UPDATE HELPERS =====

export function createOptimisticLineupUpdate(
  currentLineup: Partial<Record<PositionKey, SelectableEntity | undefined>>,
  position: PositionKey,
  newEntity: SelectableEntity | undefined,
  setLineup: (lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>) => void
): string {
  const updateId = `lineup_${position}_${Date.now()}`;
  const originalLineup = { ...currentLineup };
  const optimisticLineup = { ...currentLineup, [position]: newEntity };
  
  // Apply optimistic update immediately
  setLineup(optimisticLineup);
  
  // Register rollback function
  optimisticUpdateManager.add(
    updateId,
    originalLineup,
    optimisticLineup,
    () => setLineup(originalLineup)
  );
  
  return updateId;
}

export function commitOptimisticUpdate(updateId: string): void {
  optimisticUpdateManager.commit(updateId);
}

export function rollbackOptimisticUpdate(updateId: string): void {
  optimisticUpdateManager.rollback(updateId);
}

// Cache invalidation helpers
export function invalidatePlayerCache(positionKey?: PositionKey): void {
  if (positionKey) {
    performanceCache.invalidate(`players_${positionKey}`);
  } else {
    performanceCache.invalidate('players_');
  }
}

export function invalidateTeamCache(positionKey?: PositionKey): void {
  if (positionKey) {
    performanceCache.invalidate(`teams_${positionKey}`);
  } else {
    performanceCache.invalidate('teams_');
  }
}

export function invalidateUsageCache(userId?: string, leagueId?: string): void {
  if (userId && leagueId) {
    performanceCache.invalidate(`usage_${userId}_${leagueId}`);
  } else {
    performanceCache.invalidate('usage_');
  }
}

export function invalidateScheduleCache(season?: string | number, week?: number): void {
  if (season && week) {
    performanceCache.invalidate(`schedule_${season}_${week}`);
  } else {
    performanceCache.invalidate('schedule_');
  }
}

// Performance monitoring
export function getCacheStats(): { size: number; keys: string[] } {
  return performanceCache.getStats();
}

export function clearAllCaches(): void {
  performanceCache.clear();
  optimisticUpdateManager.rollbackAll();
} 