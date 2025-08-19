import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';

interface LeagueContextState {
  leagues: League[];
  leaguesLoading: boolean;
  leaguesError: string | null;
  selectedLeagueId: string | null;
  selectedLeague: League | null;
  selectedWeek: number;
  effectiveWeek: number;
  setSelectedLeagueId: (leagueId: string | null) => void;
  setSelectedWeek: (week: number) => void;
}

const LeagueContext = createContext<LeagueContextState | undefined>(undefined);

interface LeagueProviderProps {
  children: ReactNode;
}

export const LeagueProvider: React.FC<LeagueProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);
  
  // Initialize from localStorage or defaults
  const [selectedLeagueId, setSelectedLeagueIdState] = useState<string | null>(() => {
    return localStorage.getItem('easy-fantasy-selected-league-id');
  });

  const [selectedWeek, setSelectedWeekState] = useState<number>(() => {
    const stored = localStorage.getItem('easy-fantasy-selected-week');
    const storedTimestamp = localStorage.getItem('easy-fantasy-selected-week-timestamp');
    const currentWeek = calculateCurrentNFLWeek();
    
    // If we have a stored week and timestamp
    if (stored && storedTimestamp) {
      const storedTime = parseInt(storedTimestamp, 10);
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      // If the stored value is less than 24 hours old, use it
      // Otherwise, recalculate and use current week
      if (now - storedTime < oneDay) {
        return parseInt(stored, 10);
      }
    }
    
    // Use current calculated week if no valid stored value
    return currentWeek;
  });

  const handleSetSelectedWeek = (week: number) => {
    const clampedWeek = Math.max(1, Math.min(week, 18)); // Clamp between 1-18
    setSelectedWeekState(clampedWeek);
    localStorage.setItem('easy-fantasy-selected-week', clampedWeek.toString());
    localStorage.setItem('easy-fantasy-selected-week-timestamp', Date.now().toString());
  };

  // Check and update week on app load/daily
  useEffect(() => {
    const checkCurrentWeek = () => {
      const currentWeek = calculateCurrentNFLWeek();
      const storedTimestamp = localStorage.getItem('easy-fantasy-selected-week-timestamp');
      
      // If no timestamp stored, or if it's a new day, update to current week
      if (!storedTimestamp) {
        console.log('No week timestamp found, updating to current week:', currentWeek);
        handleSetSelectedWeek(currentWeek);
      } else {
        const storedTime = parseInt(storedTimestamp, 10);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        // If more than 24 hours old, update to current week
        if (now - storedTime >= oneDay) {
          console.log('Week cache expired, updating to current week:', currentWeek);
          handleSetSelectedWeek(currentWeek);
        }
      }
    };
    
    // Check immediately on mount
    checkCurrentWeek();
    
    // Set up daily check (every 24 hours)
    const interval = setInterval(checkCurrentWeek, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to user leagues
  useEffect(() => {
    if (user?.uid) {
      setLeaguesLoading(true);
      const unsubscribe = listenToUserLeagues(
        user.uid,
        (fetchedLeagues) => {
          setLeagues(fetchedLeagues);
          setLeaguesLoading(false);
          setLeaguesError(null);
          
          // Auto-select first league if none selected or current selection is invalid
          const currentIsValid = fetchedLeagues.some(league => league.id === selectedLeagueId);
          if (!selectedLeagueId || !currentIsValid) {
            if (fetchedLeagues.length > 0) {
              const firstLeagueId = fetchedLeagues[0].id;
              setSelectedLeagueIdState(firstLeagueId);
              localStorage.setItem('easy-fantasy-selected-league-id', firstLeagueId);
            }
          }
        },
        (error) => {
          console.error("Error fetching leagues:", error);
          setLeaguesError("Failed to load leagues.");
          setLeaguesLoading(false);
        }
      );
      return () => unsubscribe();
    } else {
      setLeagues([]);
      setLeaguesLoading(false);
      setLeaguesError(null);
    }
  }, [user?.uid, selectedLeagueId]);

  const handleSetSelectedLeagueId = (leagueId: string | null) => {
    setSelectedLeagueIdState(leagueId);
    if (leagueId) {
      localStorage.setItem('easy-fantasy-selected-league-id', leagueId);
    } else {
      localStorage.removeItem('easy-fantasy-selected-league-id');
    }
  };

  const selectedLeague = leagues.find(league => league.id === selectedLeagueId) || null;
  const effectiveWeek = selectedWeek;

  const contextValue: LeagueContextState = {
    leagues,
    leaguesLoading,
    leaguesError,
    selectedLeagueId,
    selectedLeague,
    selectedWeek,
    effectiveWeek,
    setSelectedLeagueId: handleSetSelectedLeagueId,
    setSelectedWeek: handleSetSelectedWeek,
  };

  return (
    <LeagueContext.Provider value={contextValue}>
      {children}
    </LeagueContext.Provider>
  );
};

export const useLeagueContext = (): LeagueContextState => {
  const context = useContext(LeagueContext);
  if (context === undefined) {
    throw new Error('useLeagueContext must be used within a LeagueProvider');
  }
  return context;
};