import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { MAX_USAGE_COUNT } from '../config/appConfig';

interface UseUsageTrackingProps {
  userId: string | null;
  leagueId: string | null;
  currentSeason: number;
}

interface UseUsageTrackingReturn {
  usageCounts: Record<string, number>;
  isLoading: boolean;
  error: string | null;
  refreshUsageCounts: () => Promise<void>;
}

/**
 * Hook to track entity usage counts for the current season
 * Returns usage counts in format: { "player_123": 3, "team_456": 2 }
 */
export const useUsageTracking = ({
  userId,
  leagueId,
  currentSeason
}: UseUsageTrackingProps): UseUsageTrackingReturn => {
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageCounts = async (): Promise<Record<string, number>> => {
    if (!userId || !leagueId) {
      return {};
    }

    try {
      setError(null);
      
      // Query all weekly lineups for this user that match the league and season
      // Path: users/{userId}/weeklyLineups/{lineupId}
      // LineupId format: {leagueId}_{season}_{week}
      const weeklyLineupsRef = collection(db, 'users', userId, 'weeklyLineups');
      const q = query(
        weeklyLineupsRef,
        where('leagueId', '==', leagueId),
        where('season', '==', currentSeason)
      );

      const querySnapshot = await getDocs(q);
      const counts: Record<string, number> = {};

      querySnapshot.forEach((doc) => {
        const lineupData = doc.data();
        
        // Process picks from the lineup
        if (lineupData.picks) {
          Object.values(lineupData.picks).forEach((pick: unknown) => {
            if (pick && typeof pick === 'object' && 'id' in pick && 'type' in pick) {
              const typedPick = pick as { id: string; type: string };
              if (typeof typedPick.id === 'string' && typeof typedPick.type === 'string') {
                const key = `${typedPick.type}_${typedPick.id}`;
                counts[key] = (counts[key] || 0) + 1;
              }
            }
          });
        }
      });

      return counts;
    } catch (err) {
      console.error('Error fetching usage counts:', err);
      throw err;
    }
  };

  const refreshUsageCounts = async () => {
    if (!userId || !leagueId) {
      setUsageCounts({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const counts = await fetchUsageCounts();
      setUsageCounts(counts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch usage counts';
      setError(errorMessage);
      console.error('Error in refreshUsageCounts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch when dependencies change
  useEffect(() => {
    refreshUsageCounts();
  }, [userId, leagueId, currentSeason]);

  return {
    usageCounts,
    isLoading,
    error,
    refreshUsageCounts
  };
};

/**
 * Helper function to check if an entity has reached the usage limit
 */
export const isEntityAtUsageLimit = (
  entityId: string,
  entityType: 'player' | 'team',
  usageCounts: Record<string, number>
): boolean => {
  const key = `${entityType}_${entityId}`;
  const currentUsage = usageCounts[key] || 0;
  return currentUsage >= MAX_USAGE_COUNT;
};

/**
 * Helper function to get remaining usage for an entity
 */
export const getRemainingUsage = (
  entityId: string,
  entityType: 'player' | 'team',
  usageCounts: Record<string, number>
): number => {
  const key = `${entityType}_${entityId}`;
  const currentUsage = usageCounts[key] || 0;
  return Math.max(0, MAX_USAGE_COUNT - currentUsage);
}; 