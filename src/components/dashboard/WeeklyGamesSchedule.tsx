// src/components/dashboard/WeeklyGamesSchedule.tsx
import React, { useState, useEffect } from 'react';
import type { GameInfoFromSchedule, FirestoreWeeklySchedule } from '../../services/lineupFetchingService'; // Types
import { fetchWeeklySchedule } from '../../services/lineupFetchingService'; // Fetch function
import { APP_CONFIG } from '../../config/appConfig'; // For current season
import ComponentCard from '../common/ComponentCard';
import Spinner from '../ui/Spinner';

interface WeeklyGamesScheduleProps {
  currentNflWeek: number;
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

const WeeklyGamesSchedule: React.FC<WeeklyGamesScheduleProps> = ({ currentNflWeek }) => {
  const [scheduleData, setScheduleData] = useState<FirestoreWeeklySchedule | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSchedule = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const data = await fetchWeeklySchedule(season, currentNflWeek);
        setScheduleData(data);
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
      <div className="max-h-96 overflow-y-auto custom-scrollbar pr-1">
        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
          {scheduleData.games.map((game: GameInfoFromSchedule) => (
            <li key={game.gameID} className="p-3 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {game.away} @ {game.home}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatGameTime(game.gameTime_epoch)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <ComponentCard title={`Week ${currentNflWeek} NFL Schedule`}>
      {renderContent()}
    </ComponentCard>
  );
};

export default WeeklyGamesSchedule; 