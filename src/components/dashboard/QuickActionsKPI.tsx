import React from 'react';
import { Link } from 'react-router';
import { PencilIcon, BoltIcon, TimeIcon } from '../../icons';
import Button from '../ui/button/Button';

interface QuickActionsKPIProps {
  primaryLeagueId: string | null;
  currentWeek: number;
  isLineupSet: boolean;
  nextGameTime?: number | null;
  totalLeagues?: number;
  lineupsSet?: number;
}

const QuickActionsKPI: React.FC<QuickActionsKPIProps> = ({
  primaryLeagueId,
  currentWeek,
  isLineupSet,
  nextGameTime,
  totalLeagues = 1,
  lineupsSet = 0
}) => {
  const isGameStartingSoon = nextGameTime ? (nextGameTime * 1000 - Date.now()) < (2 * 60 * 60 * 1000) : false; // 2 hours
  const hasMultipleLeagues = totalLeagues > 1;
  const allLineupsSet = lineupsSet === totalLeagues && totalLeagues > 0;

  const getButtonText = () => {
    if (hasMultipleLeagues) {
      return allLineupsSet ? "Edit Lineups" : "Set All Lineups";
    }
    return isLineupSet ? "Edit Lineup" : "Set Lineup";
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center mb-4">
        <BoltIcon className="w-6 h-6 text-brand-500 mr-2" />
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Quick Actions
        </h4>
      </div>

      <div className="space-y-3">
        {/* Primary Action - Set/Edit Lineup */}
        {primaryLeagueId && (
          <Link to={`/leagues/${primaryLeagueId}/lineup/${currentWeek}`} className="block">
            <Button 
              variant={isLineupSet ? "outline" : "primary"} 
              size="md" 
              className="w-full justify-start"
              startIcon={<PencilIcon className="w-4 h-4" />}
            >
              {getButtonText()}
              {isGameStartingSoon && (
                <span className="ml-2 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                  Urgent
                </span>
              )}
            </Button>
          </Link>
        )}

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-3">
          {primaryLeagueId && (
            <Link to={`/leagues/${primaryLeagueId}`}>
              <Button variant="outline" size="sm" className="w-full text-xs">
                View League
              </Button>
            </Link>
          )}
          
          <Link to="/leagues">
            <Button variant="outline" size="sm" className="w-full text-xs">
              All Leagues
            </Button>
          </Link>
        </div>

        {/* Time Warning */}
        {isGameStartingSoon && nextGameTime && (
          <div className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <TimeIcon className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">
              ⏰ Games start soon! Make sure your lineup is set.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickActionsKPI; 