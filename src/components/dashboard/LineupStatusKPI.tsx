import React from 'react';
import { CheckCircleIcon, AlertIcon } from '../../icons';
import Spinner from '../ui/Spinner';

interface LineupStatusKPIProps {
  lineupsSet: number;
  lineupsComplete: number;
  totalLeagues: number;
  isLoading: boolean;
  currentWeek: number;
  nextLockTime?: number | null;
}

const LineupStatusKPI: React.FC<LineupStatusKPIProps> = ({
  lineupsSet,
  lineupsComplete,
  totalLeagues,
  isLoading,
  currentWeek,
  nextLockTime
}) => {
  const formatTimeUntilLock = (lockTime: number): string => {
    const now = Date.now();
    const diff = lockTime - now;
    
    if (diff <= 0) return "Live now";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const isAllComplete = lineupsComplete === totalLeagues && totalLeagues > 0;
  const hasPartialLineups = lineupsSet > lineupsComplete;
  const isPartialSet = lineupsSet > 0 && lineupsSet < totalLeagues;

  const getStatusColor = () => {
    if (isLoading) return "text-gray-500 dark:text-gray-400";
    if (isAllComplete) return "text-green-500";
    if (hasPartialLineups || isPartialSet) return "text-yellow-500";
    return "text-red-500";
  };

  const getBackgroundColor = () => {
    if (isLoading) return "bg-gray-50 dark:bg-gray-800";
    if (isAllComplete) return "bg-green-50 dark:bg-green-900/20";
    if (hasPartialLineups || isPartialSet) return "bg-yellow-50 dark:bg-yellow-900/20";
    return "bg-red-50 dark:bg-red-900/20";
  };

  const getStatusText = () => {
    if (isLoading) return "Checking...";
    if (totalLeagues === 0) return "No Leagues";
    if (totalLeagues === 1) {
      if (isAllComplete) return "Complete";
      if (lineupsSet > 0) return "Partial";
      return "Not Set";
    }
    // For multiple leagues, show complete count if any are complete, otherwise show set count
    if (lineupsComplete > 0) {
      return `${lineupsComplete}/${totalLeagues} Complete`;
    }
    return `${lineupsSet}/${totalLeagues} Set`;
  };

  const getStatusIcon = () => {
    if (isAllComplete) return <CheckCircleIcon className="w-8 h-8 text-green-500" />;
    if (hasPartialLineups || isPartialSet) return <AlertIcon className="w-8 h-8 text-yellow-500" />;
    return <AlertIcon className="w-8 h-8 text-red-500" />;
  };

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${getBackgroundColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {isLoading ? (
            <Spinner size="sm" className="mr-3" />
          ) : (
            <div className="mr-3">
              {getStatusIcon()}
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Week {currentWeek} Lineup{totalLeagues > 1 ? 's' : ''}
            </h4>
            <p className={`text-lg font-bold ${getStatusColor()}`}>
              {getStatusText()}
            </p>
          </div>
        </div>
        
        {nextLockTime && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Starting in
            </p>
            <p className="text-lg font-bold text-gray-800 dark:text-white">
              {formatTimeUntilLock(nextLockTime)}
            </p>
          </div>
        )}
      </div>
      
      {!isAllComplete && !isLoading && totalLeagues > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {hasPartialLineups
              ? `⚠️ ${lineupsSet - lineupsComplete} incomplete lineup${lineupsSet - lineupsComplete > 1 ? 's' : ''}`
              : isPartialSet 
              ? `⚠️ ${totalLeagues - lineupsSet} more lineup${totalLeagues - lineupsSet > 1 ? 's' : ''} needed`
              : "⚠️ Complete your lineup before games start"
            }
          </p>
        </div>
      )}
    </div>
  );
};

export default LineupStatusKPI; 