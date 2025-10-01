import React, { useEffect, useState } from 'react';
import { useTipsStore } from '../../store/tipsStore';
import { doc, getDoc, onSnapshot, query, where, getDocs, collection, limit } from 'firebase/firestore';
import { db, functions } from '../../firebase/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import TipsSummary from './TipsSummary';
import { SkeletonPage } from '../ui/skeleton/SkeletonLoader';
import { GameScore } from '../../services/lineupFetchingService';

interface TippableGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string;
  awayTeamId?: string;
  gameTime: number;
  homeWinProbability: number;
  awayWinProbability: number;
  spread: number;
  total: number;
  gameDate: string;
}

interface WeeklyTipsPoll {
  leagueId: string;
  week: number;
  season: number;
  games: TippableGame[];
  lockTime: { seconds: number };
  isLocked: boolean;
  createdAt: { seconds: number };
  totalGames: number;
}

interface UserTipsSubmission {
  userId: string;
  leagueId: string;
  week: number;
  season: number;
  tips: Array<{
    gameId: string;
    pick: 'home' | 'away';
    confidence?: number;
  }>;
  submittedAt: { seconds: number };
  lastUpdated: { seconds: number };
  totalGames: number;
}

// GameScore interface is now imported from lineupFetchingService

interface TeamInfo {
  logoUrl: string;
  abbreviation: string;
  fullName: string;
  name?: string; // Optional name field for display
}

interface WeeklyTipsProps {
  leagueId: string;
  week: number;
  season: number;
}

const WeeklyTips: React.FC<WeeklyTipsProps> = ({ leagueId, week, season }) => {
  const { user } = useAuth();
  
  // Zustand store - use all relevant state from the store
  const {
    tipsPoll,
    pollLoading,
    pollError,
    userTips,

    submitError,
    setPollData,
    setPollLoading,
    setPollError,
    setUserTips,
    updateUserTip,
    setExistingTips,
    setTipsLoading,
    setTipsError,
    setSubmitting,
    setSubmitError,
    setSubmitSuccess,
    clearSubmitMessages
  } = useTipsStore();

  // Local state for additional data not in Zustand store
  const [gameScores, setGameScores] = useState<Record<string, GameScore>>({});
  const [teamLogos, setTeamLogos] = useState<Record<string, TeamInfo>>({});
  const [loadingTeamLogos, setLoadingTeamLogos] = useState(true);
  
  // Page-level loading states (similar to LineupPage)
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Page loading logic (similar to LineupPage)
  useEffect(() => {
    if (!leagueId || !week || !season) {
      setPageError("Invalid tips parameters");
      setIsPageLoading(false);
      return;
    }

    if (!user?.uid) {
      setPageError("Authentication required");
      setIsPageLoading(false);
      return;
    }

    // Page is ready when we have basic parameters
    if (pollLoading || loadingTeamLogos) {
      setIsPageLoading(true);
      setPageError(null);
    } else if (pollError || (tipsPoll && Object.keys(teamLogos).length === 0 && !loadingTeamLogos)) {
      setPageError(pollError || "Failed to load team information");
      setIsPageLoading(false);
    } else {
      setIsPageLoading(false);
      setPageError(null);
    }
  }, [leagueId, week, season, user?.uid, pollLoading, loadingTeamLogos, pollError, tipsPoll, teamLogos]);

  // Subscribe to tips poll
  useEffect(() => {
    if (!leagueId || !week || !season) return;

    setPollLoading(true);
    const docId = `${leagueId}_week_${week}_season_${season}`;
    const unsubscribe = onSnapshot(
      doc(db, 'weeklyTips', docId),
      (doc) => {
        if (doc.exists()) {
          setPollData(doc.data() as WeeklyTipsPoll);
        } else {
          setPollData(null);
        }
        setPollLoading(false);
      },
      (error) => {
        console.error('Error fetching tips poll:', error);
        setPollError('Failed to load tips poll');
        setPollLoading(false);
      }
    );

    return () => unsubscribe();
  }, [leagueId, week, season, setPollData, setPollLoading, setPollError]);

  // Subscribe to user's existing tips
  useEffect(() => {
    if (!tipsPoll || !user?.uid) return;

    setTipsLoading(true);
    const docId = `${leagueId}_week_${week}_season_${season}`;
    const unsubscribe = onSnapshot(
      doc(db, 'weeklyTips', docId, 'userTips', user.uid),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as UserTipsSubmission;
          setExistingTips(data);
          
          // Populate current tips with existing ones
          const currentTips: Record<string, 'home' | 'away'> = {};
          data.tips.forEach(tip => {
            currentTips[tip.gameId] = tip.pick;
          });
          setUserTips(currentTips);
        }
        setTipsLoading(false);
      },
      (error) => {
        console.error('Error fetching user tips:', error);
        setTipsError('Failed to load your tips');
        setTipsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tipsPoll, user?.uid, leagueId, week, season, setExistingTips, setUserTips, setTipsLoading, setTipsError]);

  // Auto-save function with debounce
  const autoSaveTips = async (tips: Record<string, 'home' | 'away'>) => {
    if (Object.keys(tips).length === 0) return;
    
    setSubmitting(true);
    clearSubmitMessages();
    
    try {
      // Call the actual submitTips Cloud Function
      const submitTipsFunction = httpsCallable(functions, 'submitTips');
      const result = await submitTipsFunction({
        leagueId,
        week,
        season,
        tips
      });
      
      const data = result.data as { success: boolean; message?: string };
      if (data.success) {
        setSubmitSuccess('Saved successfully');
        setTimeout(() => setSubmitSuccess(''), 2000);
      } else {
        throw new Error(data.message || 'Failed to save tips');
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save tips';
      setSubmitError(errorMessage);
      setTimeout(() => clearSubmitMessages(), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle tip selection with auto-save
  const handleTipChange = (gameId: string, pick: 'home' | 'away') => {
    updateUserTip(gameId, pick);
    
    // Auto-save after a short delay
    setTimeout(() => {
      const currentTips = { ...userTips, [gameId]: pick };
      autoSaveTips(currentTips);
    }, 500);
  };

  // Fetch real game scores with auto-refresh
  useEffect(() => {
    if (!tipsPoll?.games) return;
    
    const fetchRealGameScores = async () => {
      try {
        const gameIds = tipsPoll.games.map(game => game.gameId);
        
        // Import the fetchGameScores function dynamically to avoid circular deps
        const { fetchGameScores } = await import('../../services/lineupFetchingService');
        const gameScoresMap = await fetchGameScores(gameIds);
        
        // Convert Map to Record for state (keeping original GameScore structure)
        const scoresRecord: Record<string, GameScore> = {};
        for (const [gameId, score] of gameScoresMap.entries()) {
          scoresRecord[gameId] = score; // Use the score directly as it already matches GameScore interface
        }
        
        setGameScores(scoresRecord);
      } catch (error) {
        console.error('Error fetching real game scores:', error);
        // Keep empty scores object on error - games will show as scheduled
        setGameScores({});
      }
    };
    
    // Initial fetch
    fetchRealGameScores();
    
    // Auto-refresh every 30 seconds during game days
    const refreshInterval = setInterval(() => {
      fetchRealGameScores();
    }, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [tipsPoll?.games]);

  // Fetch team logos and info
  const fetchTeamLogos = async (games: TippableGame[]) => {
    setLoadingTeamLogos(true);
    const teamData: Record<string, TeamInfo> = {};
    
    // Get unique team identifiers (prefer IDs, fallback to abbreviations)
    const teamIdentifiers = new Set<string>();
    games.forEach(game => {
      // Add home team - prefer ID if available
      if (game.homeTeamId) {
        teamIdentifiers.add(`id:${game.homeTeamId}`);
      } else {
        teamIdentifiers.add(`abbr:${game.homeTeam}`);
      }
      
      // Add away team - prefer ID if available
      if (game.awayTeamId) {
        teamIdentifiers.add(`id:${game.awayTeamId}`);
      } else {
        teamIdentifiers.add(`abbr:${game.awayTeam}`);
      }
    });

    // Fetch team data
    for (const identifier of teamIdentifiers) {
      try {
        const [type, value] = identifier.split(':');
        
        if (type === 'id') {
          // Direct document access by team ID (fast!)
          const teamDoc = await getDoc(doc(db, 'teams', value));
          if (teamDoc.exists()) {
            const data = teamDoc.data();
            teamData[value] = {
              logoUrl: data.logoUrl || data.espnLogo1,
              abbreviation: data.abbreviation || value,
              fullName: data.fullName || data.name
            };
          }
        } else {
          // Query by abbreviation (backwards compatibility)
          const teamQuery = query(
            collection(db, 'teams'),
            where('abbreviation', '==', value),
            limit(1)
          );
          const querySnapshot = await getDocs(teamQuery);
          
          if (!querySnapshot.empty) {
            const teamDoc = querySnapshot.docs[0];
            teamData[value] = {
              logoUrl: teamDoc.data().logoUrl || teamDoc.data().espnLogo1,
              abbreviation: teamDoc.data().abbreviation || value,
              fullName: teamDoc.data().fullName || teamDoc.data().name
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching team data for ${identifier}:`, error);
      }
    }

    setTeamLogos(teamData);
    setLoadingTeamLogos(false);
  };

  // Fetch data when component mounts or dependencies change
  useEffect(() => {
    if (tipsPoll?.games && tipsPoll.games.length > 0) {
      fetchTeamLogos(tipsPoll.games);
    }
  }, [tipsPoll?.games]);

  // Display functions
  const getGameStatusDisplay = (game: TippableGame, score?: GameScore) => {
    if (!score) {
      // game.gameTime is already in milliseconds (converted in backend)
      const gameDate = new Date(game.gameTime);
      return gameDate.toLocaleDateString('de-DE', { 
        timeZone: 'Europe/Berlin',
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    
    if (score.gameStatusCode === 2) {
      return 'Final';
    } else if (score.gameStatusCode === 1) {
      return `Q${score.quarter || 1} ${score.timeRemaining || ''}`;
    }
    
    return 'Scheduled';
  };

  // Check if game is locked (started)
  const isGameLocked = (game: TippableGame, score?: GameScore): boolean => {
    if (score && score.gameStatusCode > 0) return true; // Started
    // game.gameTime is already in milliseconds (converted in backend)
    return Date.now() > game.gameTime; // Past game time
  };

  // Extract team name from full name (e.g., "Dallas Cowboys" -> "Cowboys")
  const getTeamDisplayName = (teamInfo?: TeamInfo, fallback?: string): string => {
    if (teamInfo?.fullName) {
      // Split by space and take the last word (team name)
      const parts = teamInfo.fullName.split(' ');
      return parts[parts.length - 1];
    }
    return teamInfo?.abbreviation || fallback || '';
  };

  // Individual game locking is handled per-game

  // Loading state (similar to LineupPage)
  if (isPageLoading) {
    return (
      <SkeletonPage type="dashboard" />
    );
  }

  // Error state (similar to LineupPage)
  if (pageError) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-red-500 dark:text-red-400 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Unable to Load Tips
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{pageError}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No tips poll state
  if (!tipsPoll) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-gray-400 dark:text-gray-500 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Tips Available
          </h3>
          <p className="text-gray-600 dark:text-gray-300">
            Tips poll for Week {week} hasn't been created yet.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state - wait for both tips poll AND team data
  if (pollLoading || loadingTeamLogos) {
    return (
      <SkeletonPage type="dashboard" />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
      {/* Main Tips Content - Full width on mobile, 2/3 on desktop */}
      <div className="space-y-6 lg:col-span-2">
        {/* Individual games will show their own lock status */}

        {/* Error Message */}
        {submitError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <p className="text-red-800 dark:text-red-200">{submitError}</p>
            </div>
          </div>
        )}

        {/* Games List - Single Column Layout */}
        <div className="space-y-6">
          {tipsPoll.games
            .sort((a, b) => a.gameTime - b.gameTime) // Sort by game time ascending (earliest first)
            .map((game) => {
            const score = gameScores[game.gameId];
            // Use team ID for lookup if available, otherwise use abbreviation
            const gameWithIds = game as TippableGame & { homeTeamId?: string; awayTeamId?: string };
            const homeTeamKey = gameWithIds.homeTeamId || game.homeTeam;
            const awayTeamKey = gameWithIds.awayTeamId || game.awayTeam;
            const homeTeam = teamLogos[homeTeamKey];
            const awayTeam = teamLogos[awayTeamKey];
            
            const gameStatus = getGameStatusDisplay(game, score);
            const gameLocked = isGameLocked(game, score);
            const userPick = userTips[game.gameId];
            const isFinal = score?.gameStatusCode === 2;
            const winner: 'home' | 'away' | null = isFinal
              ? (score!.homeScore > score!.awayScore ? 'home' : score!.awayScore > score!.homeScore ? 'away' : null)
              : null;
            const isTie = isFinal && winner === null;
            const isCorrect = isFinal && winner !== null && userPick === winner;
            const isWrong = isFinal && ((winner !== null && userPick && userPick !== winner) || (isTie && !!userPick));

            return (
              <div key={game.gameId} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Game Status Header */}
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      {gameStatus}
                    </span>
                    {gameLocked && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200">
                        🔒 Locked
                      </span>
                    )}
                  </div>
                </div>

                {/* Teams and Selection */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Away Team */}
                    <button
                      onClick={() => !gameLocked && handleTipChange(game.gameId, 'away')}
                      disabled={gameLocked}
                    className={`flex flex-col sm:flex-row items-center sm:space-x-3 space-y-2 sm:space-y-0 p-3 rounded-lg border-2 transition-all duration-200 flex-1 mr-2 relative ${
                        isWrong && userPick === 'away' ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : isCorrect && userPick === 'away' ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : userPick === 'away' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      } ${gameLocked ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {/* Team Logo */}
                      <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                        {loadingTeamLogos ? (
                          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full animate-pulse"></div>
                        ) : awayTeam?.logoUrl ? (
                          <img 
                            src={awayTeam.logoUrl} 
                            alt={awayTeam.abbreviation} 
                            className="w-8 h-8 object-contain" 
                          />
                        ) : (
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                            {getTeamDisplayName(awayTeam, game.awayTeam)}
                          </span>
                        )}
                      </div>

                      {/* Team Info */}
                      <div className="flex-1 text-center sm:text-left">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
                          {getTeamDisplayName(awayTeam, game.awayTeam)}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {Math.round(game.awayWinProbability)}% chance
                        </div>
                      </div>

                      {/* Score */}
                      {score && (
                        <div className="text-center sm:text-right">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {score.awayScore}
                          </div>
                        </div>
                      )}

                      {/* Selection Indicator */}
                      {userPick === 'away' && (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto ${
                          isWrong ? 'bg-red-500' : isCorrect ? 'bg-green-500' : 'bg-blue-500'
                        }`}>
                          {isWrong ? (
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.3 5.71L12 12.01 5.71 5.71 4.29 7.12 10.59 13.41 4.29 19.71 5.71 21.12 12 14.83 18.29 21.12 19.71 19.71 13.41 13.41 19.71 7.12z"/>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </div>
                      )}
                    </button>

                    {/* VS Divider */}
                    <div className="px-2">
                      <span className="text-lg font-medium text-gray-500 dark:text-gray-400">@</span>
                    </div>

                    {/* Home Team */}
                    <button
                      onClick={() => !gameLocked && handleTipChange(game.gameId, 'home')}
                      disabled={gameLocked}
                    className={`flex flex-col sm:flex-row items-center sm:space-x-3 space-y-2 sm:space-y-0 p-3 rounded-lg border-2 transition-all duration-200 flex-1 ml-2 relative ${
                        isWrong && userPick === 'home' ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : isCorrect && userPick === 'home' ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : userPick === 'home' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      } ${gameLocked ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {/* Team Logo */}
                      <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                        {loadingTeamLogos ? (
                          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full animate-pulse"></div>
                        ) : homeTeam?.logoUrl ? (
                          <img 
                            src={homeTeam.logoUrl} 
                            alt={homeTeam.abbreviation} 
                            className="w-8 h-8 object-contain" 
                          />
                        ) : (
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                            {getTeamDisplayName(homeTeam, game.homeTeam)}
                          </span>
                        )}
                      </div>

                      {/* Team Info */}
                      <div className="flex-1 text-center sm:text-left">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
                          {getTeamDisplayName(homeTeam, game.homeTeam)}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {Math.round(game.homeWinProbability)}% chance
                        </div>
                      </div>

                      {/* Score */}
                      {score && (
                        <div className="text-center sm:text-right">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {score.homeScore}
                          </div>
                        </div>
                      )}

                      {/* Selection Indicator */}
                      {userPick === 'home' && (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto ${
                          isWrong ? 'bg-red-500' : isCorrect ? 'bg-green-500' : 'bg-blue-500'
                        }`}>
                          {isWrong ? (
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.3 5.71L12 12.01 5.71 5.71 4.29 7.12 10.59 13.41 4.29 19.71 5.71 21.12 12 14.83 18.29 21.12 19.71 19.71 13.41 13.41 19.71 7.12z"/>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </div>
                      )}
                    </button>
                  </div>


                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tips Summary - Full width on mobile, fixed width on desktop */}
      <div className="space-y-6 lg:col-span-1">
        <TipsSummary 
          totalGames={tipsPoll.games.length}
          week={week}
        />
        
        {/* Status is now handled by TipsSummary in the sidebar */}
      </div>
    </div>
  );
};

export default WeeklyTips; 