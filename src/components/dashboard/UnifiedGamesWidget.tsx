import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useLeagueContext } from '../../context/LeagueContext';
import { 
  fetchStoredWeeklyLineup,
  fetchDetailedGameStatsBatch,
  fetchSelectablePlayerById,
  fetchSelectableTeamById,
  fetchGameScores,
  GameScore
} from '../../services/lineupFetchingService';
import type { GameInfoFromSchedule } from '../../services/lineupFetchingService';
import { fetchWeeklySchedule } from '../../services/lineupFetchingService';
import { APP_CONFIG } from '../../config/appConfig';
import { getFantasyNews, formatTimeAgo, type NewsItem } from '../../services/newsService';
import { SelectableEntity, SelectablePlayer, SelectableTeam, PositionKey, InjuryStatus } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface UnifiedGamesWidgetProps {
  currentNflWeek: number;
  isMobileView?: boolean;
}

interface PlayerInGame {
  id: string;
  name: string;
  position: string;
  team: string;
  isCaptain: boolean;
  currentPoints: number;
  gameStatus: 'live' | 'upcoming' | 'final';
  type: 'player' | 'team';
  displayName: string; // For team positions like "DAL Run"
}

interface ScoringPlay {
  playerIDs?: string[];
  scoreType?: string;
  score?: string;
  scorePeriod?: string;
  scoreTime?: string;
}

interface ProcessedScoringPlay {
  playerId: string;
  playerName: string;
  playerType: 'player' | 'team';
  teamAbbreviation: string;
  opponent?: string;
  playDescription: string;
  scoreType: string;
  period: string;
  time: string;
  fantasyPoints: number;
  isCaptain: boolean;
  timestamp: number; // For sorting
}

interface GameWithPlayers extends GameInfoFromSchedule {
  userPlayers: PlayerInGame[];
  newsItems: NewsItem[];
  hasUserPlayers: boolean;
  gameScore?: GameScore;
  gameStatus: 'live' | 'upcoming' | 'final';
  scoringPlays: ProcessedScoringPlay[];
}

const formatGameTime = (epochInSeconds: number | string): string => {
  const epochNumber = typeof epochInSeconds === 'string' ? parseInt(epochInSeconds, 10) : epochInSeconds;
  if (isNaN(epochNumber)) {
    return 'Invalid date';
  }
  const date = new Date(epochNumber * 1000);
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false, // Use 24-hour format for German locale
    timeZoneName: 'short'
  });
};

// Helper functions for scoring plays
const calculatePlayFantasyPoints = (scoreType: string, playerType: 'player' | 'team'): number => {
  const type = scoreType?.toLowerCase() || '';
  
  if (playerType === 'player') {
    // Player fantasy points
    if (type.includes('td') || type.includes('touchdown')) {
      if (type.includes('pass')) return 4; // Passing TD
      return 6; // Rushing/Receiving TD
    }
    if (type.includes('fg') || type.includes('field goal')) return 3;
    if (type.includes('pat') || type.includes('extra point')) return 1;
    if (type.includes('safety')) return 2;
    if (type.includes('fumble recovery')) return 2;
    if (type.includes('interception')) return 2;
    if (type.includes('sack')) return 1;
  } else {
    // Team defense/special teams points
    if (type.includes('interception')) return 2;
    if (type.includes('fumble recovery')) return 2;
    if (type.includes('sack')) return 1;
    if (type.includes('safety')) return 2;
    if (type.includes('td') || type.includes('touchdown')) return 6;
    if (type.includes('fg') || type.includes('field goal')) return 3;
    if (type.includes('pat') || type.includes('extra point')) return 1;
  }
  
  return 0; // Unknown play type
};

const getPlayIcon = (scoreType: string): string => {
  const type = scoreType?.toLowerCase() || '';
  if (type.includes('td') || type.includes('touchdown')) return '🏈';
  if (type.includes('fg') || type.includes('field goal')) return '⚡';
  if (type.includes('pat') || type.includes('extra point')) return '⚡';
  if (type.includes('interception')) return '🛡️';
  if (type.includes('fumble')) return '🛡️';
  if (type.includes('sack')) return '🛡️';
  if (type.includes('safety')) return '🛡️';
  return '🏈';
};

const parseGameTime = (period: string, time: string): number => {
  // Simple parsing - Q1 = 1000, Q2 = 2000, etc.
  // Time like "8:45" becomes 845
  const quarterNum = parseInt(period.replace(/\D/g, '')) || 1;
  const timeParts = time.split(':');
  const minutes = parseInt(timeParts[0]) || 0;
  const seconds = parseInt(timeParts[1]) || 0;
  
  // Higher timestamp = more recent (reverse order for sorting)
  return (quarterNum * 1000) + (minutes * 60) + seconds;
};

// Get game status from Tank01 gameStatusCode
const getGameStatusFromCode = (gameStatusCode?: string | number): 'upcoming' | 'live' | 'final' => {
  const code = typeof gameStatusCode === 'string' ? parseInt(gameStatusCode) : gameStatusCode;
  switch (code) {
    case 0: return 'upcoming';  // Game has not started yet
    case 1: return 'live';      // Game is currently in progress
    case 2: return 'final';     // Game is completed/final
    case 3: return 'upcoming';  // Game postponed - treat as upcoming
    case 4: return 'upcoming';  // Game suspended - treat as upcoming
    default: return 'upcoming'; // Default fallback
  }
};

const UnifiedGamesWidget: React.FC<UnifiedGamesWidgetProps> = ({ currentNflWeek, isMobileView = false }) => {
  const { user } = useAuth();
  const { selectedLeagueId } = useLeagueContext();
  const season = APP_CONFIG.CURRENT_NFL_SEASON;
  const [gamesWithPlayers, setGamesWithPlayers] = useState<GameWithPlayers[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedScoringPlays, setExpandedScoringPlays] = useState<string | null>(null);
  const [expandedNews, setExpandedNews] = useState<string | null>(null);
  const [loadingScoringPlays, setLoadingScoringPlays] = useState<Set<string>>(new Set());
  const [scoringPlaysCache, setScoringPlaysCache] = useState<Map<string, ProcessedScoringPlay[]>>(new Map());
  const [scoringPlaysCount, setScoringPlaysCount] = useState<Map<string, number>>(new Map());
  // Track how many plays the user had seen last time per game to insert a "since last open" marker
  const [seenPlaysCount, setSeenPlaysCount] = useState<Map<string, number>>(new Map());
  const gamesSnapshotRef = useRef<GameWithPlayers[]>([]);
  // Grace period to avoid flicker between 0-0 and first fetched scores
  const [initialScoreSettleDone, setInitialScoreSettleDone] = useState<boolean>(false);

  // Keep a ref snapshot to avoid effects depending on the array identity
  useEffect(() => {
    gamesSnapshotRef.current = gamesWithPlayers;
  }, [gamesWithPlayers]);

  // Load seen counts from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ef_seen_scoring_counts');
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, number>;
        const map = new Map<string, number>();
        Object.entries(obj).forEach(([k, v]) => map.set(k, typeof v === 'number' ? v : Number(v) || 0));
        setSeenPlaysCount(map);
      }
    } catch (e) {
      console.warn('Failed to load seen scoring counts:', e);
    }
  }, []);

  const persistSeenCounts = useCallback((map: Map<string, number>) => {
    try {
      const obj: Record<string, number> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('ef_seen_scoring_counts', JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to persist seen scoring counts:', e);
    }
  }, []);

  // Use TanStack Query for weekly schedule
  const { data: scheduleData } = useQuery({
    queryKey: ['weeklySchedule', season, currentNflWeek],
    queryFn: () => fetchWeeklySchedule(season, currentNflWeek),
    enabled: currentNflWeek > 0,
    staleTime: 10 * 60 * 1000,
  });

  // News (global, cached longer)
  const { data: allNewsData } = useQuery({
    queryKey: ['news'],
    queryFn: getFantasyNews,
    staleTime: 10 * 60 * 1000,
  });

  // Game scores with periodic refresh only when live games exist
  const gameIdsForQuery = useMemo(() => (scheduleData?.games?.map((g: GameInfoFromSchedule) => g.gameID) ?? []), [scheduleData]);
  const hasLiveGames = useMemo(() => {
    if (!scheduleData?.games) return false;
    const now = Date.now();
    return scheduleData.games.some((g: GameInfoFromSchedule) => {
      const t = Number(g.gameTime_epoch) * 1000;
      return t <= now && (t + 4 * 60 * 60 * 1000) > now;
    });
  }, [scheduleData]);
  const { data: gameScoresData } = useQuery<Map<string, GameScore>>({
    queryKey: ['gameScores', season, currentNflWeek],
    queryFn: () => fetchGameScores(gameIdsForQuery),
    enabled: gameIdsForQuery.length > 0,
    refetchInterval: hasLiveGames ? 30000 : false,
    refetchOnWindowFocus: false,
  });

  // Keep skeleton visible slightly longer, or until first scores arrive, to avoid 0-0 → real score flicker
  useEffect(() => {
    if (isLoading) {
      setInitialScoreSettleDone(false);
      return;
    }

    // If there are no games or scores already available, we can settle immediately
    if (gameIdsForQuery.length === 0 || gameScoresData) {
      setInitialScoreSettleDone(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setInitialScoreSettleDone(true);
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading, gameScoresData, gameIdsForQuery.length]);

  // Load schedule-driven data and combine with user data
  useEffect(() => {
    const loadGamesData = async () => {
      if (!user?.uid) {
        setIsLoading(false);
        setGamesWithPlayers([]);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Use cached schedule
        const schedule = scheduleData;
        if (!schedule || !schedule.games || schedule.games.length === 0) {
          setGamesWithPlayers([]);
          setIsLoading(false);
          return;
        }

        // Get user lineup from selected league (one-time fetch to avoid lingering listeners)
        const userLineupData: Record<string, { player: SelectableEntity; isCaptain: boolean; position: string; type: 'player' | 'team' }> = {};
        if (selectedLeagueId) {
          const lineupData = await fetchStoredWeeklyLineup(user.uid, selectedLeagueId, currentNflWeek, season);
          if (lineupData?.picks) {
            // Collect picks that need API calls (missing stored names)
            const picksNeedingApiCalls: Array<{pick: { id: string; type: 'player' | 'team'; name?: string; teamAbbreviation?: string }, positionKey: string, key: string}> = [];
            for (const [positionKey, pick] of Object.entries(lineupData.picks)) {
              if (pick) {
                const key = `${pick.id}_${pick.type}`;
                if (!userLineupData[key]) {
                  if (pick.name && pick.teamAbbreviation) {
                    const entity: SelectableEntity = {
                      id: pick.id,
                      name: pick.name,
                      teamAbbreviation: pick.teamAbbreviation,
                      entityType: pick.type,
                      fullTeamName: pick.teamAbbreviation,
                      position: pick.type === 'player' ? positionKey : positionKey,
                      headshotUrl: '',
                      actualPPG: 0,
                      usageCount: 0,
                      injuryStatus: 'Healthy' as unknown as InjuryStatus,
                      byeWeek: 0,
                      opponentForWeek: undefined,
                      gameTimeEpochForWeek: undefined,
                      gameIdForWeek: undefined,
                      actualFantasyPoints: undefined,
                      nextOpponent: undefined,
                      gameTimeEpoch: undefined,
                      gameId: undefined,
                      rawSeasonStats: undefined
                    };
                    userLineupData[key] = {
                      player: entity,
                      isCaptain: lineupData.captainPlayerId === pick.id,
                      position: pick.type === 'player' ? positionKey : positionKey,
                      type: pick.type
                    };
                  } else {
                    picksNeedingApiCalls.push({ pick, positionKey, key });
                  }
                }
              }
            }
            if (picksNeedingApiCalls.length > 0) {
              const entityPromises = picksNeedingApiCalls.map(async ({ pick, positionKey, key }) => {
                let entity: SelectablePlayer | SelectableTeam | null = null;
                if (pick.type === 'player') {
                  entity = await fetchSelectablePlayerById(pick.id);
                } else {
                  entity = await fetchSelectableTeamById(pick.id, positionKey as PositionKey);
                }
                if (entity) {
                  userLineupData[key] = {
                    player: entity,
                    isCaptain: lineupData.captainPlayerId === pick.id,
                    position: pick.type === 'player' ? (entity as SelectablePlayer).position : positionKey,
                    type: pick.type
                  };
                }
                return entity;
              });
              await Promise.all(entityPromises);
            }
          }
        }

        // Game scores are optional - don't block loading on them
        // They'll be undefined initially and update when available

        // PERFORMANCE: Collect all stats requests upfront for batch fetching
        const allStatsRequests: Array<{ entityId: string; entityType: 'player' | 'team'; gameId: string }> = [];
        const gamePlayerMapping: Record<string, Array<{ data: { player: SelectableEntity; isCaptain: boolean; position: string; type: 'player' | 'team' }; entity: SelectableEntity }>> = {};
        
        // First pass: collect all potential stat requests
        schedule.games.forEach((game: GameInfoFromSchedule) => {
          const gameTeams = [game.home, game.away];
          const playersInThisGame: Array<{ data: { player: SelectableEntity; isCaptain: boolean; position: string; type: 'player' | 'team' }; entity: SelectableEntity }> = [];
          
          for (const data of Object.values(userLineupData)) {
            const entity = data.player;
            if (gameTeams.includes(entity.teamAbbreviation)) {
              playersInThisGame.push({ data, entity });
              
              // Check if we need stats (game is live or finished)
              const gameTime = new Date(Number(game.gameTime_epoch) * 1000);
              const now = new Date();
              const isLive = gameTime <= now && gameTime.getTime() + (3.5 * 60 * 60 * 1000) > now.getTime();
              
              if (isLive || gameTime < now) {
                allStatsRequests.push({
                  entityId: entity.id,
                  entityType: data.type,
                  gameId: game.gameID
                });
              }
            }
          }
          
          gamePlayerMapping[game.gameID] = playersInThisGame;
        });
        
        // PERFORMANCE: Batch fetch all game stats at once
        const batchStatsResults = await fetchDetailedGameStatsBatch(allStatsRequests);
        
        // NEWS via Query (cached)
        const news: NewsItem[] = allNewsData ?? [];
        const sortedNews = news.sort((a, b) => {
          const severityWeight = { high: 3, medium: 2, low: 1 };
          return severityWeight[b.severity] - severityWeight[a.severity];
        });
        
        // Create news lookup by filtering for each game
        const newsLookup = new Map<string, NewsItem[]>();
        schedule.games.forEach((game: GameInfoFromSchedule) => {
          const gameNews = sortedNews
            .filter(news => 
              news.team === game.home?.toUpperCase() || news.team === game.away?.toUpperCase()
            )
            .slice(0, 2); // Limit to top 2 news items per game
          newsLookup.set(game.gameID, gameNews);
        });

        // Game scores from Query (might be undefined initially)
        const gameScoresMap: Map<string, GameScore> = gameScoresData ?? new Map<string, GameScore>();

        // Second pass: process games with pre-fetched data
        const processedGames = schedule.games.map((game: GameInfoFromSchedule) => {
          const playersInGame: PlayerInGame[] = [];
          const gamePlayersData = gamePlayerMapping[game.gameID] || [];
          
          // Get game score and determine status
          const gameScore = gameScoresMap.get(game.gameID);
          const gameStatus = gameScore 
            ? getGameStatusFromCode(gameScore.gameStatusCode)
            : getGameStatusFromCode(game.gameStatusCode);
          
          for (const { data, entity } of gamePlayersData) {
            // Get stats from batch results
            let currentPoints = 0;
            const gameTime = new Date(Number(game.gameTime_epoch) * 1000);
            const now = new Date();
            const isLive = gameTime <= now && gameTime.getTime() + (3.5 * 60 * 60 * 1000) > now.getTime();
            
            if (isLive || gameTime < now) {
              const statsKey = `${entity.id}_${data.type}_${game.gameID}`;
              const stats = batchStatsResults.get(statsKey);
              if (stats) {
                if (data.type === 'player' && 'fantasyPoints' in stats) {
                  currentPoints = (stats as { fantasyPoints?: number }).fantasyPoints || 0;
                } else if (data.type === 'team') {
                  const teamStats = stats as {
                    fantasyPointsPassing?: number;
                    fantasyPointsRushing?: number;
                    fantasyPointsDefense?: number;
                    fantasyPointsSpecialTeams?: number;
                  };
                  switch (data.position) {
                    case 'PassingOffense':
                      currentPoints = teamStats.fantasyPointsPassing || 0; break;
                    case 'RushingOffense':
                      currentPoints = teamStats.fantasyPointsRushing || 0; break;
                    case 'Defense':
                      currentPoints = teamStats.fantasyPointsDefense || 0; break;
                    case 'SpecialTeams':
                      currentPoints = teamStats.fantasyPointsSpecialTeams || 0; break;
                    default:
                      currentPoints = 0;
                  }
                }
              }
            }

            // Apply captain multiplier if this player is the captain
            if (data.isCaptain && data.type === 'player' && currentPoints > 0) {
              currentPoints = currentPoints * 1.5; // Captain multiplier
            }

            // Create display name
            let displayName = entity.name;
            if (data.type === 'team') {
              const positionMap: Record<string, string> = {
                'PassingOffense': 'Pass',
                'RushingOffense': 'Run', 
                'Defense': 'DEF',
                'SpecialTeams': 'ST'
              };
              const shortPosition = positionMap[data.position] || data.position;
              displayName = `${entity.teamAbbreviation} ${shortPosition}`;
            } else {
              // For players, show position after name
              displayName = `${entity.name} (${(entity as SelectablePlayer).position})`;
            }

            playersInGame.push({
              id: entity.id,
              name: entity.name,
              position: data.position,
              team: entity.teamAbbreviation,
              isCaptain: data.isCaptain,
              currentPoints,
              gameStatus,
              type: data.type,
              displayName
            });
          }

          return {
            ...game,
            userPlayers: playersInGame,
            newsItems: newsLookup.get(game.gameID) || [],
            hasUserPlayers: playersInGame.length > 0,
            gameScore,
            gameStatus,
            scoringPlays: [] // Loaded on demand when user expands
          };
        });

        // Sort games: first by time, prioritize games with user players, then by teams
        processedGames.sort((a, b) => {
          const timeA = Number(a.gameTime_epoch);
          const timeB = Number(b.gameTime_epoch);
          
          // Primary sort: by game start time
          if (timeA !== timeB) return timeA - timeB;
          // Secondary sort: within same time slot, prioritize games with user players
          if (a.hasUserPlayers && !b.hasUserPlayers) return -1;
          if (!a.hasUserPlayers && b.hasUserPlayers) return 1;
          
          const teamNameA = `${a.away} @ ${a.home}`;
          const teamNameB = `${b.away} @ ${b.home}`;
          return teamNameA.localeCompare(teamNameB);
        });
        
        setGamesWithPlayers(processedGames);
        setIsLoadingStats(false);
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error loading games data:', err);
        setError('Failed to load games data');
        setIsLoading(false);
        setIsLoadingStats(false);
      }
    };

    if (currentNflWeek > 0) {
      loadGamesData();
    }
  }, [currentNflWeek, user?.uid, selectedLeagueId, scheduleData, allNewsData, gameScoresData]);

  const refreshGameScores = useCallback(async (gamesSnapshot: GameWithPlayers[]) => {
    if (gamesSnapshot.length === 0) return;

    try {
      const gameIds = gamesSnapshot.map(game => game.gameID);
      const updatedScores = await fetchGameScores(gameIds);

      // Update games with new scores and status
      setGamesWithPlayers(prevGames =>
        prevGames.map(game => {
          const updatedScore = updatedScores.get(game.gameID);
          const updatedStatus = updatedScore
            ? getGameStatusFromCode(updatedScore.gameStatusCode)
            : game.gameStatus;

          return {
            ...game,
            gameScore: updatedScore,
            gameStatus: updatedStatus,
            userPlayers: game.userPlayers.map(player => ({
              ...player,
              gameStatus: updatedStatus,
            })),
          };
        })
      );
    } catch (error) {
      console.error('Error refreshing game scores:', error);
    }
  }, []);

  // Optimized: Lazy load scoring plays only when requested
  const fetchScoringPlaysForGame = useCallback(async (gameId: string) => {
    if (!user?.uid) return;

    // Check cache first
    if (scoringPlaysCache.has(gameId)) {
      return scoringPlaysCache.get(gameId)!;
    }

    // Find the game
    const game = gamesWithPlayers.find(g => g.gameID === gameId);
    if (!game || !game.hasUserPlayers || game.gameStatus === 'upcoming') {
      return [];
    }

    setLoadingScoringPlays(prev => new Set(prev).add(gameId));

    try {
      const allScoringPlays: ProcessedScoringPlay[] = [];

      // Only players have scoring plays, not team units
      const playersNeedingFetch = game.userPlayers.filter(p => p.type === 'player');

      // Use the existing batch function for better performance
      const statsRequests = playersNeedingFetch.map(player => ({
        entityId: player.id,
        entityType: 'player' as const,
        gameId: gameId
      }));

      const batchResults = await fetchDetailedGameStatsBatch(statsRequests);

      // Process stats into scoring plays
      for (const player of playersNeedingFetch) {
        const statsKey = `${player.id}_player_${gameId}`;
        const gameStats = batchResults.get(statsKey);

        if (gameStats && 'rawBoxScoreStats' in gameStats) {
          const playerGameStats = gameStats as { rawBoxScoreStats?: { scoringPlays?: ScoringPlay[] } };
          const scoringPlays = playerGameStats.rawBoxScoreStats?.scoringPlays || [];

          // Filter plays that involve this player
          const playerPlays = scoringPlays.filter(play =>
            play.playerIDs && Array.isArray(play.playerIDs) && play.playerIDs.includes(player.id)
          );

          // Process each play
          for (const play of playerPlays) {
            if (play.scoreType && play.score && play.scorePeriod && play.scoreTime) {
              const baseFantasyPoints = calculatePlayFantasyPoints(play.scoreType, player.type);

              // Apply captain multiplier if applicable
              let fantasyPoints = baseFantasyPoints;
              if (player.isCaptain) {
                fantasyPoints = baseFantasyPoints * 1.5; // Captain multiplier
              }

              const processedPlay: ProcessedScoringPlay = {
                playerId: player.id,
                playerName: player.name,
                playerType: player.type,
                teamAbbreviation: player.team,
                opponent: game.away === player.team ? game.home : game.away,
                playDescription: play.score,
                scoreType: play.scoreType,
                period: play.scorePeriod,
                time: play.scoreTime,
                fantasyPoints,
                isCaptain: player.isCaptain,
                timestamp: parseGameTime(play.scorePeriod, play.scoreTime)
              };

              allScoringPlays.push(processedPlay);
            }
          }
        }
      }
      
      // Sort by timestamp (most recent first)
      allScoringPlays.sort((a, b) => b.timestamp - a.timestamp);
      
      // Cache the results
      setScoringPlaysCache(prev => new Map(prev).set(gameId, allScoringPlays));
      
      return allScoringPlays;
    } catch (error) {
      console.error('Error fetching scoring plays:', error);
      return [];
    } finally {
      setLoadingScoringPlays(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameId);
        return newSet;
      });
    }
  }, [user?.uid, gamesWithPlayers, scoringPlaysCache]);

  // Auto-refresh game scores every 30 seconds (scoring plays loaded on demand)
  useEffect(() => {
    if (gamesWithPlayers.length === 0) return;

    const interval = setInterval(() => {
      const snapshot = gamesSnapshotRef.current;
      refreshGameScores(snapshot);
      
      // Refresh scoring plays for expanded games only
      if (expandedScoringPlays) {
        fetchScoringPlaysForGame(expandedScoringPlays);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshGameScores, gamesWithPlayers.length, expandedScoringPlays, fetchScoringPlaysForGame]);

  // Quick check for scoring plays availability
  const checkScoringPlaysAvailability = useCallback(async (gameId: string) => {
    if (scoringPlaysCount.has(gameId)) {
      return scoringPlaysCount.get(gameId)!;
    }

    const game = gamesWithPlayers.find(g => g.gameID === gameId);
    if (!game || !game.hasUserPlayers || game.gameStatus === 'upcoming') {
      setScoringPlaysCount(prev => new Map(prev).set(gameId, 0));
      return 0;
    }

    // Check if this game has any players (not just team units)
    const playersInGame = game.userPlayers.filter(p => p.type === 'player');
    if (playersInGame.length === 0) {
      setScoringPlaysCount(prev => new Map(prev).set(gameId, 0));
      return 0;
    }

    try {
      // Quick count check: use the batch function but only count
      const statsRequests = playersInGame.map(player => ({
        entityId: player.id,
        entityType: 'player' as const,
        gameId: gameId
      }));

      const batchResults = await fetchDetailedGameStatsBatch(statsRequests);
      let totalPlays = 0;

      for (const player of playersInGame) {
        const statsKey = `${player.id}_player_${gameId}`;
        const gameStats = batchResults.get(statsKey);

        if (gameStats && 'rawBoxScoreStats' in gameStats) {
          const playerGameStats = gameStats as { rawBoxScoreStats?: { scoringPlays?: ScoringPlay[] } };
          const scoringPlays = playerGameStats.rawBoxScoreStats?.scoringPlays || [];
          
          // Count plays that involve this player
          const playerPlays = scoringPlays.filter(play =>
            play.playerIDs && Array.isArray(play.playerIDs) && play.playerIDs.includes(player.id)
          );
          
          totalPlays += playerPlays.length;
        }
      }

      setScoringPlaysCount(prev => new Map(prev).set(gameId, totalPlays));
      return totalPlays;
    } catch (error) {
      console.error('Error checking scoring plays availability:', error);
      setScoringPlaysCount(prev => new Map(prev).set(gameId, 0));
      return 0;
    }
  }, [gamesWithPlayers, scoringPlaysCount]);

  // Background check for scoring plays availability when games go live
  useEffect(() => {
    const checkLiveGames = async () => {
      for (const game of gamesWithPlayers) {
        // Only check games that are live/final and have players
        if (game.gameStatus !== 'upcoming' && game.userPlayers.some(p => p.type === 'player')) {
          // Check if we haven't checked this game yet
          if (!scoringPlaysCount.has(game.gameID)) {
            await checkScoringPlaysAvailability(game.gameID);
          }
        }
      }
    };

    if (gamesWithPlayers.length > 0) {
      // Small delay to avoid blocking the main thread
      const timeoutId = setTimeout(checkLiveGames, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [gamesWithPlayers, scoringPlaysCount, checkScoringPlaysAvailability]);

  const getGameStatusBadge = (game: GameWithPlayers) => {
    if (game.gameStatus === 'live') return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">🔴 Live</span>;
    if (game.gameStatus === 'upcoming') return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">⏰ Upcoming</span>;
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">✅ Final</span>;
  };

  const toggleScoringPlaysExpansion = async (gameId: string) => {
    const isExpanding = expandedScoringPlays !== gameId;
    // If collapsing, mark all current plays as seen
    if (!isExpanding) {
      const current = scoringPlaysCache.get(gameId) || [];
      const updated = new Map(seenPlaysCount);
      updated.set(gameId, current.length);
      setSeenPlaysCount(updated);
      persistSeenCounts(updated);
    }

    setExpandedScoringPlays(isExpanding ? gameId : null);
    
    // Lazy load scoring plays when expanding
    if (isExpanding) {
      await fetchScoringPlaysForGame(gameId);
    }
  };

  const toggleNewsExpansion = (gameId: string) => {
    setExpandedNews(expandedNews === gameId ? null : gameId);
  };

  if (isLoading || !initialScoreSettleDone) {
    // Show skeletons instead of a spinner while loading
    return (
      <div className="space-y-4 py-2">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className={`${isMobileView ? 'p-3' : 'p-5 border border-gray-200 dark:border-gray-700'} rounded-lg bg-white dark:bg-gray-800`}>
            {/* Game header skeleton */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
              </div>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
            </div>
            {/* User lineup skeleton */}
            <div className={`${isMobileView ? 'p-3' : 'p-3 border border-blue-200 dark:border-blue-800'} bg-blue-50 dark:bg-blue-900/10 rounded-lg`}>
              <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-28 animate-pulse mb-2" />
              <div className="space-y-1">
                {Array(3).fill(0).map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-24 animate-pulse" />
                    <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-14 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="text-center py-8 text-red-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (gamesWithPlayers.length === 0) {
    return (
      <div className="py-8">
        {!isMobileView && (
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            This Week's Games
          </h2>
        )}
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No games scheduled for this week.</p>
        </div>
      </div>
    );
  }

  const containerClass = "space-y-4";
  const contentClass = isMobileView ? "space-y-3" : "space-y-3";

  return (
    <div className={containerClass}>
      {!isMobileView && (
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          This Week's Games
        </h2>
      )}
      
      <div className={contentClass}>
        {gamesWithPlayers.map((game) => {
          const isScoringPlaysExpanded = expandedScoringPlays === game.gameID;
          const isNewsExpanded = expandedNews === game.gameID;
          const cachedScoringPlays = scoringPlaysCache.get(game.gameID) || [];
          const isLoadingScoringPlays = loadingScoringPlays.has(game.gameID);
          const knownScoringPlaysCount = scoringPlaysCount.get(game.gameID);
          
          // Smart detection: Only show scoring plays button if game has players and we've confirmed scoring plays exist
          const hasPlayers = game.userPlayers.some(p => p.type === 'player');
          const hasConfirmedScoringPlays = knownScoringPlaysCount !== undefined && knownScoringPlaysCount > 0;
          const shouldShowScoringPlays = hasPlayers && game.gameStatus !== 'upcoming' && hasConfirmedScoringPlays;
          
          return (
            <div key={game.gameID} className={`${
              isMobileView 
                ? "p-3 rounded-lg" 
                : "p-5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm"
            }`}>
              {/* Game Header */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="text-gray-600 dark:text-gray-400">{game.away}</span>
                    <span className="mx-2 text-gray-400">@</span>
                    <span>{game.home}</span>
                    
                    {/* Always show game score */}
                    <span className="ml-3 text-lg font-bold text-gray-700 dark:text-gray-200">
                      {game.gameScore && (game.gameScore.homeScore !== undefined && game.gameScore.awayScore !== undefined) 
                        ? `${game.gameScore.awayScore} - ${game.gameScore.homeScore}`
                        : game.gameStatus === 'upcoming' ? '0 - 0' : '0 - 0'
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {game.gameScore && game.gameStatus === 'live' && game.gameScore.timeRemaining ? (
                        (() => {
                          const q = game.gameScore?.quarter;
                          const qLabel = q === 5 ? 'OT' : (q ? `Q${q}` : '');
                          return qLabel ? `${qLabel} ${game.gameScore.timeRemaining}` : game.gameScore.timeRemaining;
                        })()
                      ) : (
                        formatGameTime(game.gameTime_epoch)
                      )}
                    </span>
                    {getGameStatusBadge(game)}
                  </div>
                </div>
              </div>

              {/* Smart Priority Content */}
              {game.hasUserPlayers && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        👤 Your Lineup ({game.userPlayers.length})
                      </h4>
                      <div className="space-y-1">
                        {game.userPlayers
                          .sort((a, b) => {
                            // Define position order: Players first (QB, RB, WR, TE), then teams (Pass, Rush, Def, ST)
                            const positionOrder = {
                              'QB': 1, 'RB': 2, 'WR': 3, 'TE': 4,
                              'PassingOffense': 5, 'RushingOffense': 6, 'Defense': 7, 'SpecialTeams': 8
                            };
                            
                            const orderA = positionOrder[a.position as keyof typeof positionOrder] || 999;
                            const orderB = positionOrder[b.position as keyof typeof positionOrder] || 999;
                            
                            return orderA - orderB;
                          })
                          .map((player) => (
                          <div key={player.id} className="flex items-center justify-between text-sm">
                            <span className="text-blue-800 dark:text-blue-200">
                              {player.displayName}
                              {player.isCaptain && <span className="ml-1 text-yellow-600">⭐</span>}
                            </span>
                            <span className="font-semibold text-blue-900 dark:text-blue-100">
                              {isLoadingStats && player.currentPoints === 0 ? (
                                <span className="animate-pulse text-gray-400">Loading...</span>
                              ) : (
                                `${player.currentPoints.toFixed(2)} pts`
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scoring Plays (Secondary Priority) - Only show when confirmed to exist */}
              {shouldShowScoringPlays && (
                <div className="mt-3">
                  <button
                    onClick={() => toggleScoringPlaysExpansion(game.gameID)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors mr-2"
                    disabled={isLoadingScoringPlays}
                  >
                    {isLoadingScoringPlays ? (
                      <>🔄 Loading...</>
                    ) : cachedScoringPlays.length > 0 ? (
                      `🏈 Scoring Plays (${cachedScoringPlays.length})`
                    ) : (
                      `🏈 Scoring Plays (${knownScoringPlaysCount})`
                    )}
                  </button>
                  
                  {isScoringPlaysExpanded && (
                    <div className="mt-2 space-y-2">
                      {isLoadingScoringPlays ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex items-center gap-2">
                          <Spinner size="sm" />
                          Loading scoring plays...
                        </div>
                      ) : cachedScoringPlays.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          No scoring plays yet.
                        </div>
                      ) : (
                        (() => {
                          const previouslySeen = seenPlaysCount.get(game.gameID) ?? 0;
                          const currentCount = cachedScoringPlays.length;
                          const newCount = Math.max(0, currentCount - previouslySeen);
                          return cachedScoringPlays.map((play, index) => (
                            <div key={`${play.playerId}-${play.timestamp}-${index}`}>
                              {/* New plays */}
                              <div
                                className={`text-xs text-gray-600 dark:text-gray-400 p-3 border-l-2 ml-2 rounded-r-lg ${index < newCount ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/10' : 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/10'}`}
                              >
                                <div className="flex items-start gap-2">
                                  <div className="text-sm flex-shrink-0 mt-0.5">
                                    {getPlayIcon(play.scoreType)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-green-800 dark:text-green-200">
                                        {play.playerName}
                                      </span>
                                      {play.isCaptain && (
                                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                                          ⭐ Captain
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {play.teamAbbreviation}
                                        {play.opponent && ` vs ${play.opponent}`}
                                      </span>
                                    </div>
                                    <div className="text-sm text-green-700 dark:text-green-300 mt-1 font-medium">
                                      {play.playDescription}
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                      <span className="text-gray-500 dark:text-gray-400">
                                        {play.period} {play.time}
                                      </span>
                                      <span className="text-green-600 dark:text-green-400 font-bold">
                                        +{play.fantasyPoints.toFixed(2)} pts
                                        {play.isCaptain && <span className="ml-1">⭐</span>}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Divider after new items */}
                              {newCount > 0 && index === newCount - 1 && (
                                <div className="ml-2 my-2 flex items-center gap-2">
                                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                  <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Since last open</span>
                                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                </div>
                              )}
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* News (Secondary Priority) */}
              {game.newsItems.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => toggleNewsExpansion(game.gameID)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    📰 News ({game.newsItems.length})
                  </button>
                  
                  {isNewsExpanded && (
                    <div className="mt-2 space-y-2">
                      {game.newsItems.map((newsItem) => (
                        <div key={newsItem.id} className="text-xs text-gray-600 dark:text-gray-400 p-3 border-l-2 border-gray-300 dark:border-gray-600 ml-2">
                          <div className={`font-medium mb-1 ${
                            newsItem.severity === 'high' ? 'text-red-700 dark:text-red-400' : 
                            newsItem.severity === 'medium' ? 'text-yellow-700 dark:text-yellow-400' : 
                            'text-blue-700 dark:text-blue-400'
                          }`}>
                            📰 {newsItem.title}
                          </div>
                          <div className="mb-1">{newsItem.summary}</div>
                          <div className="text-gray-500 dark:text-gray-500">{formatTimeAgo(newsItem.timestamp)} • {newsItem.source}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UnifiedGamesWidget; 