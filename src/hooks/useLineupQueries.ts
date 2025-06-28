import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  fetchSelectablePlayers, 
  fetchSelectableTeams, 
  fetchUsageCounts, 
  fetchWeeklySchedule,
  invalidatePlayerCache,
  invalidateTeamCache,
  invalidateUsageCache,
  FirestoreWeeklySchedule
} from '../services/lineupFetchingService';
import { 
  PositionKey
} from '../types/lineup';
import { addBreadcrumb, measureAsyncPerformance } from '../config/sentry';

// Query Keys
export const lineupQueryKeys = {
  all: ['lineup'] as const,
  players: (position: PositionKey) => ['lineup', 'players', position] as const,
  teams: (position: PositionKey) => ['lineup', 'teams', position] as const,
  usageCounts: (userId: string, leagueId: string) => ['lineup', 'usage', userId, leagueId] as const,
  schedule: (season: string | number, week: number) => ['lineup', 'schedule', season, week] as const,
  storedPicks: (userId: string, leagueId: string, week: number) => ['lineup', 'stored', userId, leagueId, week] as const,
  gameStats: (gameId: string) => ['lineup', 'gameStats', gameId] as const,
  leagueLineups: (leagueId: string, week: number) => ['lineup', 'leagueLineups', leagueId, week] as const,
};

// Players Query Hook
export const useSelectablePlayers = (
  positionKey: PositionKey,
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null,
  enabled = true
) => {
  return useQuery({
    queryKey: [...lineupQueryKeys.players(positionKey), usageCounts, weeklySchedule?.week],
    queryFn: () => measureAsyncPerformance(
      `useSelectablePlayers-${positionKey}`, 
      () => fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule)
    ),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Teams Query Hook
export const useSelectableTeams = (
  positionKey: PositionKey,
  usageCounts?: Record<string, number>,
  weeklySchedule?: FirestoreWeeklySchedule | null,
  enabled = true
) => {
  return useQuery({
    queryKey: [...lineupQueryKeys.teams(positionKey), usageCounts, weeklySchedule?.week],
    queryFn: () => measureAsyncPerformance(
      `useSelectableTeams-${positionKey}`, 
      () => fetchSelectableTeams(positionKey, usageCounts, weeklySchedule)
    ),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
};

// Usage Counts Query Hook
export const useUsageCounts = (userId: string, leagueId: string, enabled = true) => {
  return useQuery({
    queryKey: lineupQueryKeys.usageCounts(userId, leagueId),
    queryFn: () => measureAsyncPerformance(
      `useUsageCounts-${userId}-${leagueId}`, 
      () => fetchUsageCounts(userId, leagueId)
    ),
    enabled: enabled && !!userId && !!leagueId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Weekly Schedule Query Hook
export const useWeeklySchedule = (season: string | number, week: number, enabled = true) => {
  return useQuery({
    queryKey: lineupQueryKeys.schedule(season, week),
    queryFn: () => measureAsyncPerformance(
      `useWeeklySchedule-${season}-${week}`, 
      () => fetchWeeklySchedule(season, week)
    ),
    enabled: enabled && !!season && !!week,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

// Note: Additional query hooks can be added here as needed
// when the corresponding fetch functions are implemented in the service layer

// Cache Invalidation Hooks
export const useInvalidateQueries = () => {
  const queryClient = useQueryClient();

  const invalidatePlayerQueries = (positionKey?: PositionKey) => {
    if (positionKey) {
      queryClient.invalidateQueries({ queryKey: lineupQueryKeys.players(positionKey) });
      invalidatePlayerCache(positionKey);
    } else {
      queryClient.invalidateQueries({ queryKey: ['lineup', 'players'] });
      invalidatePlayerCache();
    }
    addBreadcrumb(`Invalidated player queries${positionKey ? ` for ${positionKey}` : ''}`, 'cache', 'info');
  };

  const invalidateTeamQueries = (positionKey?: PositionKey) => {
    if (positionKey) {
      queryClient.invalidateQueries({ queryKey: lineupQueryKeys.teams(positionKey) });
      invalidateTeamCache(positionKey);
    } else {
      queryClient.invalidateQueries({ queryKey: ['lineup', 'teams'] });
      invalidateTeamCache();
    }
    addBreadcrumb(`Invalidated team queries${positionKey ? ` for ${positionKey}` : ''}`, 'cache', 'info');
  };

  const invalidateUsageQueries = (userId?: string, leagueId?: string) => {
    if (userId && leagueId) {
      queryClient.invalidateQueries({ queryKey: lineupQueryKeys.usageCounts(userId, leagueId) });
      invalidateUsageCache(userId, leagueId);
    } else {
      queryClient.invalidateQueries({ queryKey: ['lineup', 'usage'] });
      invalidateUsageCache();
    }
    addBreadcrumb(`Invalidated usage queries${userId && leagueId ? ` for ${userId}-${leagueId}` : ''}`, 'cache', 'info');
  };

  const invalidateScheduleQueries = (season?: string | number, week?: number) => {
    if (season && week) {
      queryClient.invalidateQueries({ queryKey: lineupQueryKeys.schedule(season, week) });
    } else {
      queryClient.invalidateQueries({ queryKey: ['lineup', 'schedule'] });
    }
    addBreadcrumb(`Invalidated schedule queries${season && week ? ` for ${season}-${week}` : ''}`, 'cache', 'info');
  };

  const invalidateAllLineupQueries = () => {
    queryClient.invalidateQueries({ queryKey: lineupQueryKeys.all });
    addBreadcrumb('Invalidated all lineup queries', 'cache', 'info');
  };

  return {
    invalidatePlayerQueries,
    invalidateTeamQueries,
    invalidateUsageQueries,
    invalidateScheduleQueries,
    invalidateAllLineupQueries,
  };
};

// Prefetch Hooks for Performance Optimization
export const usePrefetchLineupData = () => {
  const queryClient = useQueryClient();

  const prefetchPlayers = (positionKey: PositionKey, usageCounts?: Record<string, number>, weeklySchedule?: FirestoreWeeklySchedule | null) => {
    queryClient.prefetchQuery({
      queryKey: [...lineupQueryKeys.players(positionKey), usageCounts, weeklySchedule?.week],
      queryFn: () => fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule),
      staleTime: 5 * 60 * 1000,
    });
  };

  const prefetchTeams = (positionKey: PositionKey, usageCounts?: Record<string, number>, weeklySchedule?: FirestoreWeeklySchedule | null) => {
    queryClient.prefetchQuery({
      queryKey: [...lineupQueryKeys.teams(positionKey), usageCounts, weeklySchedule?.week],
      queryFn: () => fetchSelectableTeams(positionKey, usageCounts, weeklySchedule),
      staleTime: 10 * 60 * 1000,
    });
  };

  const prefetchUsageCounts = (userId: string, leagueId: string) => {
    queryClient.prefetchQuery({
      queryKey: lineupQueryKeys.usageCounts(userId, leagueId),
      queryFn: () => fetchUsageCounts(userId, leagueId),
      staleTime: 2 * 60 * 1000,
    });
  };

  return {
    prefetchPlayers,
    prefetchTeams,
    prefetchUsageCounts,
  };
}; 