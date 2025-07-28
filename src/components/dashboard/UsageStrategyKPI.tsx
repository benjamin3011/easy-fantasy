import React, { useState, useEffect } from 'react';
import { fetchUsageCounts } from '../../services/lineupFetchingService';

interface UsageStrategyKPIProps {
  userId?: string;
  leagueId?: string;
  className?: string;
}

interface UsageInsights {
  totalEntitiesUsed: number;
  highUsageEntities: Array<{ id: string; count: number; name?: string }>;
  burnRiskEntities: Array<{ id: string; count: number; name?: string }>;
  averageUsagePerEntity: number;
  usageEfficiency: 'conservative' | 'balanced' | 'aggressive';
  weeksRemaining: number;
}

const UsageStrategyKPI: React.FC<UsageStrategyKPIProps> = ({
  userId,
  leagueId,
  className = ''
}) => {

  const [insights, setInsights] = useState<UsageInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsageData = async () => {
      if (!userId || !leagueId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        const counts = await fetchUsageCounts(userId, leagueId);
        
        // Calculate insights
        const insights = calculateUsageInsights(counts);
        setInsights(insights);
        
      } catch (err) {
        console.error('Error loading usage data:', err);
        setError('Failed to load usage data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsageData();
  }, [userId, leagueId]);

  const calculateUsageInsights = (counts: Record<string, number>): UsageInsights => {
    const entries = Object.entries(counts);
    const usedEntities = entries.filter(([, count]) => count > 0);
    
    const highUsageEntities = entries
      .filter(([, count]) => count >= 3)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    
    const burnRiskEntities = entries
      .filter(([, count]) => count === 4)
      .map(([id, count]) => ({ id, count }));
    
    const totalUsage = entries.reduce((sum, [, count]) => sum + count, 0);
    const averageUsage = usedEntities.length > 0 ? totalUsage / usedEntities.length : 0;
    
    // Estimate weeks remaining (simplified - could be made more accurate)
    const currentWeek = Math.max(1, Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7)) - 35); // Rough NFL week calculation
    const weeksRemaining = Math.max(0, 18 - currentWeek);
    
    // Determine usage efficiency
    let usageEfficiency: 'conservative' | 'balanced' | 'aggressive';
    if (averageUsage < 1.5) {
      usageEfficiency = 'conservative';
    } else if (averageUsage < 2.5) {
      usageEfficiency = 'balanced';
    } else {
      usageEfficiency = 'aggressive';
    }

    return {
      totalEntitiesUsed: usedEntities.length,
      highUsageEntities,
      burnRiskEntities,
      averageUsagePerEntity: averageUsage,
      usageEfficiency,
      weeksRemaining
    };
  };

  const getUsageHealthColor = () => {
    if (!insights) return 'text-gray-500';
    
    if (insights.burnRiskEntities.length > 3) return 'text-red-600 dark:text-red-400';
    if (insights.burnRiskEntities.length > 1) return 'text-orange-600 dark:text-orange-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getUsageHealthIcon = () => {
    if (!insights) return '📊';
    
    if (insights.burnRiskEntities.length > 3) return '🔥';
    if (insights.burnRiskEntities.length > 1) return '⚠️';
    return '✅';
  };

  const getStrategyRecommendation = () => {
    if (!insights) return '';
    
    if (insights.usageEfficiency === 'conservative' && insights.weeksRemaining < 6) {
      return 'Consider using your best players more aggressively';
    }
    if (insights.usageEfficiency === 'aggressive' && insights.weeksRemaining > 8) {
      return 'Pace yourself - save elite players for key weeks';
    }
    if (insights.burnRiskEntities.length > 2) {
      return 'Multiple players at risk - diversify your picks';
    }
    return 'Usage strategy looks balanced';
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

  if (error || !insights) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Usage Strategy</h3>
          <span className="text-xl">📊</span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {error || 'No usage data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Usage Strategy</h3>
        <span className="text-xl">{getUsageHealthIcon()}</span>
      </div>
      
      {/* Main Metric */}
      <div className="mb-2">
        <div className="flex items-baseline space-x-2">
          <span className={`text-2xl font-bold ${getUsageHealthColor()}`}>
            {insights.burnRiskEntities.length}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">at risk</span>
        </div>
      </div>
      
      {/* Usage Overview */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Entities used:</span>
          <span className="font-medium">{insights.totalEntitiesUsed}</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Avg usage:</span>
          <span className="font-medium">{insights.averageUsagePerEntity.toFixed(1)}/5</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Strategy:</span>
          <span className={`font-medium capitalize ${
            insights.usageEfficiency === 'conservative' ? 'text-blue-600 dark:text-blue-400' :
            insights.usageEfficiency === 'balanced' ? 'text-green-600 dark:text-green-400' :
            'text-orange-600 dark:text-orange-400'
          }`}>
            {insights.usageEfficiency}
          </span>
        </div>
      </div>

      {/* High Usage Entities (if any) */}
      {insights.highUsageEntities.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">High usage players:</div>
          <div className="flex flex-wrap gap-1">
            {insights.highUsageEntities.slice(0, 3).map((entity) => (
              <div 
                key={entity.id} 
                className={`text-xs px-2 py-1 rounded-full ${
                  entity.count === 5 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  entity.count === 4 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                }`}
              >
                {entity.count}/5
              </div>
            ))}
            {insights.highUsageEntities.length > 3 && (
              <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                +{insights.highUsageEntities.length - 3}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strategy Recommendation */}
      <div className="text-xs text-gray-500 dark:text-gray-400 italic">
        {getStrategyRecommendation()}
      </div>
    </div>
  );
};

export default UsageStrategyKPI; 