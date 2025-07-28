// src/components/dashboard/WeeklyGamesSchedule.tsx
import React, { useState, useEffect } from 'react';
import type { GameInfoFromSchedule, FirestoreWeeklySchedule } from '../../services/lineupFetchingService'; // Types
import { fetchWeeklySchedule } from '../../services/lineupFetchingService'; // Fetch function
import { APP_CONFIG } from '../../config/appConfig'; // For current season
import { getNewsForGame, formatTimeAgo, type NewsItem } from '../../services/newsService';

import Spinner from '../ui/Spinner';

interface WeeklyGamesScheduleProps {
  currentNflWeek: number;
  isMobileView?: boolean;
}

const formatGameTime = (epochInSeconds: number | string): string => {
  const epochNumber = typeof epochInSeconds === 'string' ? parseInt(epochInSeconds, 10) : epochInSeconds;
  if (isNaN(epochNumber)) {
    return 'Invalid date';
  }
  // Multiply by 1000 because Date constructor expects milliseconds
  const date = new Date(epochNumber * 1000);
  return date.toLocaleString('en-US', {
    weekday: 'short', // e.g., 'Sun'
    month: 'short',   // e.g., 'Oct'
    day: 'numeric',   // e.g., '29'
    hour: 'numeric',    // e.g., '1'
    minute: '2-digit', // e.g., '00'
    hour12: true,     // Use AM/PM
    timeZoneName: 'short' // Optional: e.g., 'EST', 'PST' - might vary by browser support
  });
};

const WeeklyGamesSchedule: React.FC<WeeklyGamesScheduleProps> = ({ currentNflWeek, isMobileView = false }) => {
  const [scheduleData, setScheduleData] = useState<FirestoreWeeklySchedule | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gameNews, setGameNews] = useState<Record<string, NewsItem[]>>({});
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSchedule = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const data = await fetchWeeklySchedule(season, currentNflWeek);
        setScheduleData(data);
        
        // Load news for each game
        if (data && data.games) {
          const newsPromises = data.games.map(async (game: GameInfoFromSchedule) => {
            const news = await getNewsForGame(game.home || '', game.away || '');
            // Smart filtering: prioritize high severity, limit to top 3
            const prioritizedNews = news
              .sort((a, b) => {
                const severityWeight = { high: 3, medium: 2, low: 1 };
                return severityWeight[b.severity] - severityWeight[a.severity];
              })
              .slice(0, 3); // Limit to max 3 news items per game
            return { gameId: game.gameID, news: prioritizedNews };
          });
          
          const newsResults = await Promise.all(newsPromises);
          const newsMap = newsResults.reduce((acc, { gameId, news }) => {
            acc[gameId] = news;
            return acc;
          }, {} as Record<string, NewsItem[]>);
          
          setGameNews(newsMap);
        }
      } catch (err) {
        console.error("Error fetching weekly schedule:", err);
        setError('Failed to load game schedule.');
      }
      setIsLoading(false);
    };

    if (currentNflWeek > 0) {
      loadSchedule();
    }

    // Optional: Add cleanup if necessary, though fetchWeeklySchedule is a one-off call
  }, [currentNflWeek]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-4">
          <Spinner size="md" />
          <span className="ml-2">Loading schedule...</span>
        </div>
      );
    }

    if (error) {
      return <p className="p-4 text-center text-red-500">{error}</p>;
    }

    if (!scheduleData || !scheduleData.games || scheduleData.games.length === 0) {
      return <p className="p-4 text-center text-gray-500">No games scheduled for this week.</p>;
    }

    return (
      <div className="space-y-2">
        <div className={isMobileView ? "space-y-1" : "max-h-96 overflow-y-auto custom-scrollbar"}>
          <div className="space-y-1">
          {scheduleData.games.map((game: GameInfoFromSchedule) => {
            const gameTime = new Date(Number(game.gameTime_epoch) * 1000);
            const now = new Date();
            const isLive = gameTime <= now && gameTime.getTime() + (3.5 * 60 * 60 * 1000) > now.getTime(); // Assume 3.5 hour game duration
            const isUpcoming = gameTime > now;

            
            const getGameStatusBadge = () => {
              if (isLive) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">🔴 Live</span>;
              if (isUpcoming) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">⏰ Upcoming</span>;
              return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">✅ Final</span>;
            };
            
            const gameNewsItems = gameNews[game.gameID] || [];
            const isExpanded = expandedGames.has(game.gameID);
            
            const toggleExpanded = () => {
              const newExpanded = new Set(expandedGames);
              if (isExpanded) {
                newExpanded.delete(game.gameID);
              } else {
                newExpanded.add(game.gameID);
              }
              setExpandedGames(newExpanded);
            };
            
            return (
              <div key={game.gameID} className="group p-3 rounded-lg hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/30 dark:hover:to-gray-600/30 transition-all duration-200">
                <div className="flex items-center space-x-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="text-gray-600 dark:text-gray-400">{game.away}</span>
                    <span className="mx-2 text-gray-400">@</span>
                    <span>{game.home}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatGameTime(game.gameTime_epoch)}
                  </span>
                  {getGameStatusBadge()}
                </div>
                
                {/* Simple news badge - shows count and expands all news on click */}
                {gameNewsItems.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleExpanded}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors touch-manipulation"
                      >
                        📰 News ({gameNewsItems.length})
                      </button>
                    </div>
                    
                    {/* Expanded news items - all news shown when expanded */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        {gameNewsItems.map((newsItem) => (
                          <div key={newsItem.id} className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-3">
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
      </div>
    );
  };

  return renderContent();
};

export default WeeklyGamesSchedule; 