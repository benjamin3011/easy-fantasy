import React, { useState, useEffect } from 'react';

interface CaptainStrategyKPIProps {
  userId?: string;
  leagueId?: string;
  currentWeek?: number;
  className?: string;
}

interface CaptainInsights {
  totalCaptainPicks: number;
  successfulCaptains: number;
  successRate: number;
  averageBonusPoints: number;
  bestPosition: string;
  worstPosition: string;
  currentStreak: number;
  streakType: 'win' | 'loss';
}

const CaptainStrategyKPI: React.FC<CaptainStrategyKPIProps> = ({
  userId,
  leagueId,
  currentWeek,
  className = ''
}) => {
  const [insights, setInsights] = useState<CaptainInsights | null>(null);
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
        
        // TODO: Implement actual captain analytics fetching
        // For now, using mock data to demonstrate the UI
        const mockInsights = generateMockCaptainInsights();
        setInsights(mockInsights);
        
      } catch (err) {
        console.error('Error loading captain data:', err);
        setError('Failed to load captain data');
      } finally {
        setIsLoading(false);
      }
    };

    loadCaptainData();
  }, [userId, leagueId, currentWeek]);

  const generateMockCaptainInsights = (): CaptainInsights => {
    // Mock data - replace with actual analytics later
    return {
      totalCaptainPicks: 8,
      successfulCaptains: 5,
      successRate: 62.5,
      averageBonusPoints: 4.2,
      bestPosition: 'QB',
      worstPosition: 'TE',
      currentStreak: 2,
      streakType: 'win'
    };
  };

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
    if (!insights) return '';
    
    const emoji = insights.streakType === 'win' ? '🎯' : '❌';
    const text = insights.streakType === 'win' ? 'hot' : 'cold';
    return `${emoji} ${insights.currentStreak} ${text}`;
  };

  const getRecommendation = () => {
    if (!insights) return '';
    
    if (insights.successRate < 40) {
      return 'Try captaining your most consistent performers';
    }
    if (insights.bestPosition === 'QB' && insights.successRate > 60) {
      return 'QBs working well - stick with the strategy';
    }
    if (insights.currentStreak >= 3 && insights.streakType === 'loss') {
      return 'Switch up your captain strategy';
    }
    return `${insights.bestPosition} captains are your strength`;
  };

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
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

  if (error || !insights) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Captain Strategy</h3>
          <span className="text-xl">👑</span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {error || 'No captain data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
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
          <span>Picks made:</span>
          <span className="font-medium">{insights.totalCaptainPicks}</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Avg bonus:</span>
          <span className="font-medium">+{insights.averageBonusPoints.toFixed(1)} pts</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Best position:</span>
          <span className="font-medium text-green-600 dark:text-green-400">{insights.bestPosition}</span>
        </div>
        
        {insights.currentStreak > 0 && (
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