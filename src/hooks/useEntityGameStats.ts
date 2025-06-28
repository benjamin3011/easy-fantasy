import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { DetailedGameStatsType } from '../types/lineup';

interface UseEntityGameStatsProps {
  entityId?: string | null;
  entityType?: 'player' | 'team' | null;
  gameId?: string | null;
  positionKey?: string | null;
}

interface UseEntityGameStatsReturn {
  stats: DetailedGameStatsType | null;
  loading: boolean;
  error: Error | null;
}

export const useEntityGameStats = ({
  entityId,
  entityType,
  gameId,
  positionKey,
}: UseEntityGameStatsProps): UseEntityGameStatsReturn => {
  const [stats, setStats] = useState<DetailedGameStatsType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!entityId || !entityType || !gameId) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const collectionName = entityType === 'player' ? 'players' : 'teams';
    // Path to the specific game stat document, not a sub-collection query
    const docPath = `${collectionName}/${entityId}/gamestats/${gameId}`;
    const gameStatDocRef = doc(db, docPath);

    const unsubscribe: Unsubscribe = onSnapshot(
      gameStatDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setStats(docSnap.data() as DetailedGameStatsType);
        } else {
          // console.log(`No gamestat document found at: ${docPath}`); // Optional: for debugging
          setStats(null); // No stats available for this game yet
        }
        setLoading(false);
      },
      (err) => {
        console.error(`Error listening to game stats at ${docPath}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [entityId, entityType, gameId, positionKey]);

  return { stats, loading, error };
};

/**
 * Hook for managing cleanup functions and preventing memory leaks
 */
export function useCleanup() {
  const cleanupFunctions = useRef<(() => void)[]>([]);

  const addCleanup = useCallback((cleanup: () => void) => {
    cleanupFunctions.current.push(cleanup);
  }, []);

  const cleanup = useCallback(() => {
    cleanupFunctions.current.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });
    cleanupFunctions.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { addCleanup, cleanup };
}

/**
 * Hook for managing async operations with cleanup
 */
export function useAsyncEffect(
  effect: (signal: AbortSignal) => Promise<void> | void,
  deps: React.DependencyList
) {
  useEffect(() => {
    const abortController = new AbortController();
    
    const runEffect = async () => {
      try {
        await effect(abortController.signal);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Async effect error:', error);
        }
      }
    };

    runEffect();

    return () => {
      abortController.abort();
    };
  }, deps);
}

/**
 * Hook for debounced effects to prevent excessive API calls
 */
export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  delay: number = 300
) {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const cleanup = effect();
      return cleanup;
    }, delay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [...deps, delay]);
}

/**
 * Hook for intervals with automatic cleanup
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const intervalId = setInterval(() => {
      savedCallback.current();
    }, delay);

    return () => clearInterval(intervalId);
  }, [delay]);
}

/**
 * Hook for managing Firebase listeners with automatic cleanup
 */
export function useFirebaseListener(
  createListener: () => (() => void) | undefined,
  deps: React.DependencyList,
  onError?: (error: Error) => void
) {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = createListener();
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error);
      } else {
        console.error('Firebase listener error:', error);
      }
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('Error during Firebase listener cleanup:', error);
        }
      }
    };
  }, deps);
} 