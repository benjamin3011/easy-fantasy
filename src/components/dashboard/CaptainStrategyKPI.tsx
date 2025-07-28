import React, { useState, useEffect } from 'react';
import { fetchUserAnalytics, type CaptainAnalytics } from '../../services/analyticsService';
import { APP_CONFIG } from '../../config/appConfig';

interface CaptainStrategyKPIProps {
  userId?: string;
  leagueId?: string;
  currentWeek?: number;
  className?: string;
}

const CaptainStrategyKPI: React.FC<CaptainStrategyKPIProps> = ({
  userId,
  leagueId,
  currentWeek,
  className = ''
}) => {
  const [insights, setInsights] = useState<CaptainAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCaptainData = async () => {
      if (!userId || !leagueId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch real captain analytics data
        const analytics = await fetchUserAnalytics(userId, leagueId, parseInt(APP_CONFIG.CURRENT_NFL_SEASON.toString()));
        
        if (analytics?.captainAnalytics) {
          setInsights(analytics.captainAnalytics);
        } else {
          // No data available yet (pre-season or no lineups)
          setInsights(null);
        }
        
      } catch (err) {
        console.error('Error loading captain data:', err);
        setError('Failed to load captain data');
      } finally {
        setIsLoading(false);
      }
    };

    loadCaptainData();
  }, [userId, leagueId, currentWeek]);

  const getSuccessRateColor = () => {
    if (!insights) return 'text-gray-500';
    
    if (insights.successRate >= 70) return 'text-green-600 dark:text-green-400';
    if (insights.successRate >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getSuccessRateIcon = () => {
    if (!insights) return '👑';
    
    if (insights.successRate >= 70) return '🔥';
    if (insights.successRate >= 50) return '👑';
    return '💔';
  };

  const getStreakDisplay = () => {
    if (!insights || !insights.streaks) return '';
    
    const emoji = insights.streaks.isPositive ? '🎯' : '❌';
    const text = insights.streaks.isPositive ? 'hot' : 'cold';
    return `${emoji} ${insights.streaks.current} ${text}`;
  };

  const getRecommendation = () => {
    if (!insights) return '';
    
    // Use AI-generated recommendations if available
    if (insights.recommendations && insights.recommendations.length > 0) {
      return insights.recommendations[0];
    }
    
    // Fallback to simple recommendations
    if (insights.successRate < 40) {
      return 'Try captaining your most consistent performers';
    }
    if (insights.bestPosition === 'QB' && insights.successRate > 60) {
      return 'QBs working well - stick with the strategy';
    }
    if (insights.streaks.current >= 3 && !insights.streaks.isPositive) {
      return 'Switch up your captain strategy';
    }
    return `${insights.bestPosition} captains are your strength`;
  };

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Captain Strategy</h3>
          <span className="text-xl">👑</span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {error}
        </div>
      </div>
    );
  }

  // No data available yet (pre-season or no lineup history)
  if (!insights) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Captain Strategy</h3>
          <span className="text-xl">👑</span>
        </div>
        
        <div className="mb-2">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            Waiting for Captain Results
          </div>
        </div>
        
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Captain analytics will appear after you've made some lineup picks with captains.
        </div>
        
        <div className="text-xs text-blue-600 dark:text-blue-400">
          💡 Tip: Your captain gets a point multiplier - choose wisely!
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Captain Strategy</h3>
        <span className="text-xl">{getSuccessRateIcon()}</span>
      </div>
      
      {/* Main Metric */}
      <div className="mb-2">
        <div className="flex items-baseline space-x-2">
          <span className={`text-2xl font-bold ${getSuccessRateColor()}`}>
            {insights.successRate.toFixed(0)}%
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">success</span>
        </div>
      </div>
      
      {/* Captain Analytics */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>ROI:</span>
          <span className="font-medium">+{insights.roi.toFixed(1)}%</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Bonus points:</span>
          <span className="font-medium">+{insights.totalBonusPoints.toFixed(1)} pts</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Best position:</span>
          <span className="font-medium text-green-600 dark:text-green-400">{insights.bestPosition}</span>
        </div>
        
        {insights.streaks.current > 0 && (
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Current streak:</span>
            <span className="font-medium">{getStreakDisplay()}</span>
          </div>
        )}
      </div>

      {/* Strategy Recommendation */}
      <div className="text-xs text-gray-500 dark:text-gray-400 italic">
        {getRecommendation()}
      </div>
    </div>
  );
};

export default CaptainStrategyKPI; 