import React from 'react';
import { ArrowRightIcon, CalenderIcon } from '../../icons';

interface WeeklyProgressKPIProps {
  currentWeek: number;
  totalWeeks?: number;
  gamesThisWeek?: number;
  gamesCompleted?: number;
}

const WeeklyProgressKPI: React.FC<WeeklyProgressKPIProps> = ({
  currentWeek,
  totalWeeks = 18,
  gamesThisWeek = 16,
  gamesCompleted = 0
}) => {
  const seasonProgress = (currentWeek / totalWeeks) * 100;
  const weekProgress = gamesThisWeek > 0 ? (gamesCompleted / gamesThisWeek) * 100 : 0;
  
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <CalenderIcon className="w-6 h-6 text-brand-500 mr-2" />
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Season Progress
          </h4>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800 dark:text-white">
            Week {currentWeek}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            of {totalWeeks}
          </p>
        </div>
      </div>

      {/* Season Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Season
          </span>
          <span className="text-sm font-bold text-gray-800 dark:text-white">
            {Math.round(seasonProgress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-brand-500 h-2 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${seasonProgress}%` }}
          ></div>
        </div>
      </div>

      {/* This Week's Games */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            This Week's Games
          </span>
          <span className="text-sm font-bold text-gray-800 dark:text-white">
            {gamesCompleted}/{gamesThisWeek}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ease-in-out ${
              weekProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${weekProgress}%` }}
          ></div>
        </div>
        
        {weekProgress < 100 && (
          <div className="flex items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
            <ArrowRightIcon className="w-3 h-3 mr-1" />
            <span>{gamesThisWeek - gamesCompleted} games remaining</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyProgressKPI; 