import React, { useState, useEffect } from 'react';
import { fetchUsageCounts, fetchStoredWeeklyLineup, StoredLineupData } from '../../services/lineupFetchingService';
import { MAX_USAGE_COUNT } from '../../config/appConfig';

interface SmartLineupAssistanceProps {
  userId?: string;
  leagueId?: string;
  currentWeek?: number;
  currentSeason?: number;
  className?: string;
}

interface LineupRecommendation {
  type: 'warning' | 'suggestion' | 'info';
  title: string;
  message: string;
  actionText?: string;
  priority: number;
}

interface SmartInsights {
  recommendations: LineupRecommendation[];
  riskScore: number;
  efficiencyScore: number;
  hasLineup: boolean;
  completionPercentage: number;
}

const SmartLineupAssistance: React.FC<SmartLineupAssistanceProps> = ({
  userId,
  leagueId,
  currentWeek,
  currentSeason,
  className = ''
}) => {
  const [insights, setInsights] = useState<SmartInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSmartInsights = async () => {
      if (!userId || !leagueId || !currentWeek || !currentSeason) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch current lineup and usage data
        const [usageCounts, lineupData] = await Promise.all([
          fetchUsageCounts(userId, leagueId),
          fetchStoredWeeklyLineup(userId, leagueId, currentWeek, currentSeason).catch(() => null)
        ]);
        
        const smartInsights = analyzeLineupAndUsage(usageCounts, lineupData);
        setInsights(smartInsights);
        
      } catch (err) {
        console.error('Error loading smart insights:', err);
        setError('Failed to load lineup insights');
      } finally {
        setIsLoading(false);
      }
    };

    loadSmartInsights();
  }, [userId, leagueId, currentWeek, currentSeason]);

  const analyzeLineupAndUsage = (usageCounts: Record<string, number>, lineupData: StoredLineupData | null): SmartInsights => {
    const recommendations: LineupRecommendation[] = [];
    
    // Check if lineup exists
    const hasLineup = !!lineupData?.picks;
    const lineupPicks = hasLineup && lineupData?.picks ? Object.values(lineupData.picks).filter(Boolean) : [];
    const completionPercentage = hasLineup ? (lineupPicks.length / 8) * 100 : 0;
    
    // Analyze usage patterns
    const usageEntries = Object.entries(usageCounts);
    const highUsageEntities = usageEntries.filter(([, count]) => count >= 4);
    const maxedOutEntities = usageEntries.filter(([, count]) => count >= MAX_USAGE_COUNT);
    
    // Risk assessment
    let riskScore = 0;
    let efficiencyScore = 50; // Base score
    
    // Generate recommendations based on analysis
    
    // 1. Lineup completion
    if (!hasLineup) {
      recommendations.push({
        type: 'warning',
        title: 'No Lineup Set',
        message: 'You haven\'t set a lineup for this week yet.',
        actionText: 'Set Lineup',
        priority: 1
      });
      riskScore += 30;
    } else if (completionPercentage < 100) {
      recommendations.push({
        type: 'warning',
        title: 'Incomplete Lineup',
        message: `Your lineup is ${completionPercentage.toFixed(0)}% complete (${lineupPicks.length}/8 positions filled).`,
        actionText: 'Complete Lineup',
        priority: 2
      });
      riskScore += 20;
    }
    
    // 2. Usage risk analysis
    if (maxedOutEntities.length > 0) {
      recommendations.push({
        type: 'info',
        title: 'Players Maxed Out',
        message: `${maxedOutEntities.length} player(s) have reached the 5-pick limit and can't be selected again.`,
        priority: 5
      });
      efficiencyScore -= maxedOutEntities.length * 5;
    }
    
    if (highUsageEntities.length > 3) {
      recommendations.push({
        type: 'suggestion',
        title: 'High Usage Risk',
        message: `${highUsageEntities.length} players are at 4+ picks. Consider diversifying to preserve flexibility.`,
        actionText: 'Review Picks',
        priority: 3
      });
      riskScore += 15;
    }
    
    // 3. Captain strategy
    if (hasLineup && !lineupData.captainPlayerId) {
      recommendations.push({
        type: 'warning',
        title: 'No Captain Selected',
        message: 'Select a captain to get bonus points multiplier.',
        actionText: 'Pick Captain',
        priority: 2
      });
      riskScore += 10;
      efficiencyScore -= 15;
    }
    
    // 4. Strategic recommendations
    const averageUsage = usageEntries.length > 0 
      ? usageEntries.reduce((sum, [, count]) => sum + count, 0) / usageEntries.length 
      : 0;
    
    if (averageUsage < 1.2 && currentWeek && currentWeek > 10) {
      recommendations.push({
        type: 'suggestion',
        title: 'Conservative Strategy',
        message: 'You\'re being very conservative with picks. Consider using top players more aggressively in late season.',
        priority: 4
      });
      efficiencyScore -= 10;
    }
    
    if (averageUsage > 3 && currentWeek && currentWeek < 8) {
      recommendations.push({
        type: 'suggestion',
        title: 'Aggressive Strategy',
        message: 'You\'re using players frequently early in the season. Save some elite picks for playoffs.',
        priority: 4
      });
      riskScore += 10;
    }
    
    // 5. Positive reinforcement
    if (hasLineup && completionPercentage === 100 && riskScore < 15) {
      recommendations.push({
        type: 'info',
        title: 'Lineup Looking Good',
        message: 'Your lineup is complete and usage strategy appears balanced.',
        priority: 6
      });
      efficiencyScore += 10;
    }
    
    // Sort recommendations by priority
    recommendations.sort((a, b) => a.priority - b.priority);
    
    return {
      recommendations: recommendations.slice(0, 3), // Show top 3 recommendations
      riskScore: Math.min(100, Math.max(0, riskScore)),
      efficiencyScore: Math.min(100, Math.max(0, efficiencyScore)),
      hasLineup,
      completionPercentage
    };
  };

  const getRiskColor = () => {
    if (!insights) return 'text-gray-500';
    
    if (insights.riskScore < 20) return 'text-green-600 dark:text-green-400';
    if (insights.riskScore < 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getRiskIcon = () => {
    if (!insights) return '🤖';
    
    if (insights.riskScore < 20) return '✅';
    if (insights.riskScore < 40) return '⚠️';
    return '🚨';
  };

  const getRecommendationIcon = (type: LineupRecommendation['type']) => {
    switch (type) {
      case 'warning': return '⚠️';
      case 'suggestion': return '💡';
      case 'info': return 'ℹ️';
      default: return '💡';
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Smart Assistant</h3>
          <span className="text-xl">🤖</span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {error || 'No insights available'}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Smart Assistant</h3>
        <span className="text-xl">{getRiskIcon()}</span>
      </div>
      
      {/* Risk/Efficiency Scores */}
      <div className="flex justify-between mb-3 text-xs">
        <div className="text-center">
          <div className={`font-bold ${getRiskColor()}`}>
            {100 - insights.riskScore}
          </div>
          <div className="text-gray-500 dark:text-gray-400">Safety</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-blue-600 dark:text-blue-400">
            {insights.efficiencyScore}
          </div>
          <div className="text-gray-500 dark:text-gray-400">Strategy</div>
        </div>
        {insights.hasLineup && (
          <div className="text-center">
            <div className="font-bold text-green-600 dark:text-green-400">
              {insights.completionPercentage.toFixed(0)}%
            </div>
            <div className="text-gray-500 dark:text-gray-400">Complete</div>
          </div>
        )}
      </div>
      
      {/* Top Recommendations */}
      <div className="space-y-2">
        {insights.recommendations.map((rec, index) => (
          <div 
            key={index}
            className={`text-xs p-2 rounded-lg border ${
              rec.type === 'warning' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
              rec.type === 'suggestion' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
              'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}
          >
            <div className="flex items-start space-x-2">
              <span className="text-sm">{getRecommendationIcon(rec.type)}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {rec.title}
                </div>
                <div className="text-gray-600 dark:text-gray-400 mt-1">
                  {rec.message}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {insights.recommendations.length === 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
            No recommendations at this time
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartLineupAssistance; 