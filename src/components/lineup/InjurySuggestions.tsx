import React, { useState, useEffect } from 'react';
import { PositionKey, SelectableEntity } from '../../types/lineup';
import { analyzeLineupInjuries, generateInjuryReportMessage, getUrgentInjuryAction, type InjuryAnalysis } from '../../services/injuryService';
import type { FirestoreWeeklySchedule } from '../../services/lineupFetchingService';

interface InjurySuggestionsProps {
  lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>;
  usageCounts: Record<string, number>;
  weeklySchedule: FirestoreWeeklySchedule | null;
  currentWeek: number;
  onPlayerSelect?: (player: SelectableEntity, position: PositionKey) => void;
}

const InjurySuggestions: React.FC<InjurySuggestionsProps> = ({
  lineup,
  usageCounts,
  weeklySchedule,
  currentWeek,
  onPlayerSelect
}) => {
  const [injuryAnalysis, setInjuryAnalysis] = useState<InjuryAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    const analyzeInjuries = async () => {
      if (!weeklySchedule) return;
      
      setIsLoading(true);
      try {
        const analysis = await analyzeLineupInjuries(lineup, usageCounts, weeklySchedule, currentWeek);
        setInjuryAnalysis(analysis);
      } catch (error) {
        console.error('Error analyzing injuries:', error);
      } finally {
        setIsLoading(false);
      }
    };

    analyzeInjuries();
  }, [lineup, usageCounts, weeklySchedule, currentWeek]);

  if (isLoading) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-blue-600 dark:text-blue-400">Analyzing injury status...</span>
        </div>
      </div>
    );
  }

  if (!injuryAnalysis || !injuryAnalysis.hasInjuredPlayers) {
    return null; // No injuries to display
  }

  const urgentAction = getUrgentInjuryAction(injuryAnalysis);
  const reportMessage = generateInjuryReportMessage(injuryAnalysis);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800';
      case 'warning':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800';
      case 'watch':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/10 border-gray-200 dark:border-gray-800';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'watch':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className={`rounded-lg border p-4 ${getSeverityColor(injuryAnalysis.injuredPlayers[0]?.severity || 'warning')}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getSeverityIcon(injuryAnalysis.injuredPlayers[0]?.severity || 'warning')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {reportMessage}
              </h4>
              {urgentAction && (
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-white dark:bg-gray-800 bg-opacity-80">
                  Action Needed
                </span>
              )}
            </div>
            {urgentAction && (
              <p className="text-sm mt-1 font-medium">
                {urgentAction}
              </p>
            )}
            {injuryAnalysis.recommendations.length > 0 && (
              <p className="text-xs mt-2 opacity-90">
                {injuryAnalysis.recommendations[0]}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Player Cards */}
      {injuryAnalysis.injuredPlayers.map((injuredPlayerData) => (
        <div 
          key={injuredPlayerData.player.id}
          className={`rounded-lg border ${getSeverityColor(injuredPlayerData.severity)}`}
        >
          {/* Player Header */}
          <div 
            className="p-4 cursor-pointer"
            onClick={() => setExpandedPlayer(
              expandedPlayer === injuredPlayerData.player.id ? null : injuredPlayerData.player.id
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {getSeverityIcon(injuredPlayerData.severity)}
                </div>
                <div>
                  <h5 className="font-semibold text-sm">
                    {injuredPlayerData.player.name} ({injuredPlayerData.position.toUpperCase()})
                  </h5>
                  <p className="text-xs opacity-90">
                    {injuredPlayerData.player.injuryStatus?.status}
                    {injuredPlayerData.player.injuryStatus?.details && ` - ${injuredPlayerData.player.injuryStatus.details}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {injuredPlayerData.replacements.length > 0 && (
                  <span className="text-xs bg-white dark:bg-gray-800 bg-opacity-80 px-2 py-1 rounded-full">
                    {injuredPlayerData.replacements.length} replacement{injuredPlayerData.replacements.length > 1 ? 's' : ''}
                  </span>
                )}
                <svg 
                  className={`w-4 h-4 transition-transform ${expandedPlayer === injuredPlayerData.player.id ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Replacement Suggestions */}
          {expandedPlayer === injuredPlayerData.player.id && injuredPlayerData.replacements.length > 0 && (
            <div className="border-t border-current border-opacity-20 p-4 space-y-3">
              <h6 className="text-xs font-semibold uppercase tracking-wide opacity-75">
                Suggested Replacements
              </h6>
                             {injuredPlayerData.replacements.map((replacement) => (
                <div 
                  key={replacement.player.id}
                  className="bg-white dark:bg-gray-800 bg-opacity-80 rounded-lg p-3 border border-current border-opacity-10"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {replacement.player.name}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${getConfidenceColor(replacement.confidence)}`}>
                          {replacement.confidence}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {replacement.player.actualPPG.toFixed(1)} PPG
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {replacement.reason}
                      </p>
                    </div>
                    {onPlayerSelect && (
                      <button
                        onClick={() => onPlayerSelect(replacement.player, injuredPlayerData.position)}
                        className="ml-3 px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default InjurySuggestions; 