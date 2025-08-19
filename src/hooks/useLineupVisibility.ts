/**
 * React Hook for Lineup Visibility
 * 
 * Provides real-time lineup visibility updates with automatic refresh
 * as games start and players/teams become visible.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FirestoreWeeklySchedule } from '../services/lineupVisibilityService';
import {
  processLineupVisibility,
  calculateLineupStats,
  getNextRevealTime,
  VisibleLineupSlot,
  MemberLineupVisibility
} from '../services/lineupVisibilityService';

export interface UseLineupVisibilityOptions {
  refreshInterval?: number; // milliseconds, default 30000 (30 seconds)
  autoRefresh?: boolean; // default true
}

export interface UseLineupVisibilityReturn {
  visibleSlots: VisibleLineupSlot[];
  stats: {
    totalVisiblePoints: number;
    totalPossiblePoints: number;
    completionPercentage: number;
    visibleSlots: number;
    totalSlots: number;
  };
  nextReveal: {
    nextRevealTime?: number;
    slotsToReveal: number;
    timeUntilNext?: number;
  };
  isLoading: boolean;
  lastUpdated: Date | null;
  forceRefresh: () => void;
}

/**
 * Hook for processing a single lineup's visibility
 */
export function useLineupVisibility(
  lineup: any, // StoredLineupData or similar
  weeklySchedule: FirestoreWeeklySchedule | null,
  options: UseLineupVisibilityOptions = {}
): UseLineupVisibilityReturn {
  const {
    refreshInterval = 30000, // 30 seconds
    autoRefresh = true
  } = options;

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Force refresh function
  const forceRefresh = useCallback(() => {
    setCurrentTime(Math.floor(Date.now() / 1000));
    setLastUpdated(new Date());
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, autoRefresh]);

  // Process visibility when lineup, schedule, or time changes
  const visibleSlots = useMemo(() => {
    if (!lineup || !weeklySchedule) return [];
    
    setIsLoading(true);
    const slots = processLineupVisibility(lineup, weeklySchedule, currentTime);
    setIsLoading(false);
    
    return slots;
  }, [lineup, weeklySchedule, currentTime]);

  // Calculate stats
  const stats = useMemo(() => {
    return calculateLineupStats(visibleSlots);
  }, [visibleSlots]);

  // Calculate next reveal time
  const nextReveal = useMemo(() => {
    const reveal = getNextRevealTime(visibleSlots);
    const timeUntilNext = reveal.nextRevealTime 
      ? reveal.nextRevealTime - currentTime 
      : undefined;
    
    return {
      ...reveal,
      timeUntilNext: timeUntilNext && timeUntilNext > 0 ? timeUntilNext : undefined
    };
  }, [visibleSlots, currentTime]);

  // Smart refresh: increase frequency when reveals are imminent
  useEffect(() => {
    if (!autoRefresh || !nextReveal.timeUntilNext) return;

    // If next reveal is within 5 minutes, refresh every 15 seconds
    // If within 1 minute, refresh every 5 seconds
    let smartInterval = refreshInterval;
    
    if (nextReveal.timeUntilNext <= 300) { // 5 minutes
      smartInterval = 15000; // 15 seconds
    }
    if (nextReveal.timeUntilNext <= 60) { // 1 minute
      smartInterval = 5000; // 5 seconds
    }

    if (smartInterval !== refreshInterval) {
      const interval = setInterval(() => {
        setCurrentTime(Math.floor(Date.now() / 1000));
        setLastUpdated(new Date());
      }, smartInterval);

      return () => clearInterval(interval);
    }
  }, [nextReveal.timeUntilNext, refreshInterval, autoRefresh]);

  return {
    visibleSlots,
    stats,
    nextReveal,
    isLoading,
    lastUpdated,
    forceRefresh
  };
}

/**
 * Hook for processing multiple league member lineups
 */
export function useMultipleLineupVisibility(
  lineups: Array<{
    userId: string;
    userName: string;
    teamName: string;
    lineup: any;
  }>,
  weeklySchedule: FirestoreWeeklySchedule | null,
  options: UseLineupVisibilityOptions = {}
): {
  memberLineups: MemberLineupVisibility[];
  overallStats: {
    totalMembers: number;
    membersWithVisiblePoints: number;
    averageCompletion: number;
    totalVisiblePoints: number;
  };
  nextGlobalReveal: {
    nextRevealTime?: number;
    membersAffected: number;
    slotsToReveal: number;
  };
  isLoading: boolean;
  lastUpdated: Date | null;
  forceRefresh: () => void;
} {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  const {
    refreshInterval = 30000,
    autoRefresh = true
  } = options;

  // Force refresh function
  const forceRefresh = useCallback(() => {
    setCurrentTime(Math.floor(Date.now() / 1000));
    setLastUpdated(new Date());
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, autoRefresh]);

  // Process all lineups
  const memberLineups = useMemo(() => {
    if (!weeklySchedule) return [];
    
    const processed = lineups.map(({ userId, userName, teamName, lineup }) => {
      const slots = processLineupVisibility(lineup, weeklySchedule, currentTime);
      const stats = calculateLineupStats(slots);
      
      return {
        userId,
        userName,
        teamName,
        slots,
        totalVisiblePoints: stats.totalVisiblePoints,
        totalPossiblePoints: stats.totalPossiblePoints,
        completionPercentage: stats.completionPercentage,
        lastUpdated: new Date()
      };
    });
    
    return processed;
  }, [lineups, weeklySchedule, currentTime]);

  // Update loading state based on data availability
  useEffect(() => {
    setIsLoading(!weeklySchedule || lineups.length === 0);
  }, [weeklySchedule, lineups.length]);

  // Calculate overall stats
  const overallStats = useMemo(() => {
    const totalMembers = memberLineups.length;
    const membersWithVisiblePoints = memberLineups.filter(m => m.totalVisiblePoints > 0).length;
    const averageCompletion = totalMembers > 0 
      ? memberLineups.reduce((sum, m) => sum + m.completionPercentage, 0) / totalMembers 
      : 0;
    const totalVisiblePoints = memberLineups.reduce((sum, m) => sum + m.totalVisiblePoints, 0);

    return {
      totalMembers,
      membersWithVisiblePoints,
      averageCompletion: Math.round(averageCompletion),
      totalVisiblePoints
    };
  }, [memberLineups]);

  // Calculate next global reveal
  const nextGlobalReveal = useMemo(() => {
    const allReveals = memberLineups.flatMap(member => {
      const reveal = getNextRevealTime(member.slots);
      return reveal.nextRevealTime ? [reveal] : [];
    });

    if (allReveals.length === 0) {
      return { membersAffected: 0, slotsToReveal: 0 };
    }

    const nextRevealTime = Math.min(...allReveals.map(r => r.nextRevealTime!));
    const revealsAtTime = allReveals.filter(r => r.nextRevealTime === nextRevealTime);
    
    const membersAffected = revealsAtTime.length;
    const slotsToReveal = revealsAtTime.reduce((sum, r) => sum + r.slotsToReveal, 0);

    return {
      nextRevealTime,
      membersAffected,
      slotsToReveal
    };
  }, [memberLineups]);

  return {
    memberLineups,
    overallStats,
    nextGlobalReveal,
    isLoading,
    lastUpdated,
    forceRefresh
  };
}

/**
 * Hook for getting visibility status of a single entity
 */
export function useEntityVisibility(
  entityId: string,
  entityType: 'player' | 'team',
  gameId?: string,
  weeklySchedule?: FirestoreWeeklySchedule | null,
  options: UseLineupVisibilityOptions = {}
) {
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));
  
  const {
    refreshInterval = 30000,
    autoRefresh = true
  } = options;

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, autoRefresh]);

  const visibility = useMemo(() => {
    if (!weeklySchedule || !gameId) {
      return {
        isVisible: false,
        reason: 'no_game_info' as const,
        timeUntilReveal: undefined
      };
    }

    const game = weeklySchedule.games.find((g: any) => g.gameID === gameId);
    if (!game || !game.gameTime_epoch) {
      return {
        isVisible: false,
        reason: 'no_game_info' as const,
        timeUntilReveal: undefined
      };
    }

    const gameStartTime = parseInt(game.gameTime_epoch);
    const timeUntilReveal = gameStartTime - currentTime;

    if (currentTime >= gameStartTime) {
      return {
        isVisible: true,
        reason: 'game_started' as const,
        gameStartTime,
        timeUntilReveal: undefined
      };
    }

    return {
      isVisible: false,
      reason: 'not_started' as const,
      gameStartTime,
      timeUntilReveal: timeUntilReveal > 0 ? timeUntilReveal : undefined
    };
  }, [entityId, entityType, gameId, weeklySchedule, currentTime]);

  return visibility;
}