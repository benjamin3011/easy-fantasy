import React from 'react';
import { PositionKey, SelectableEntity, SelectablePlayer } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';

interface SmartSuggestionsProps {
  lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>;
  week: number;
  currentTimeEpoch: number;
  isGameStartedForEntity: (entity: SelectableEntity | undefined, timeEpoch: number) => boolean;
  hasLastWeekLineup?: boolean;
}

interface Suggestion {
  id: string;
  type: 'warning' | 'info' | 'success' | 'tip';
  title: string;
  message: string;
  action?: string;
  priority: number; // Higher = more important
}

const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  lineup,
  week,
  currentTimeEpoch,
  isGameStartedForEntity,
  hasLastWeekLineup,
}) => {
  const generateSuggestions = (): Suggestion[] => {
    const suggestions: Suggestion[] = [];
    const filledPositions = Object.keys(lineup).filter(key => lineup[key as PositionKey] !== undefined);
    const totalPositions = POSITIONS_CONFIG.length;

    // Check for bye week players
    const byeWeekPlayers = filledPositions.filter(key => {
      const entity = lineup[key as PositionKey];
      return entity && entity.byeWeek === week;
    });

    if (byeWeekPlayers.length > 0) {
      suggestions.push({
        id: 'bye-week',
        type: 'warning',
        title: 'Players on Bye Week',
        message: `${byeWeekPlayers.length} player${byeWeekPlayers.length > 1 ? 's' : ''} won't play this week`,
        action: 'Replace them',
        priority: 10
      });
    }

    // Check for locked players (games started)
    const lockedPlayers = filledPositions.filter(key => {
      const entity = lineup[key as PositionKey];
      return entity && isGameStartedForEntity(entity, currentTimeEpoch);
    });

    if (lockedPlayers.length > 0) {
      suggestions.push({
        id: 'locked-players',
        type: 'info',
        title: 'Locked Selections',
        message: `${lockedPlayers.length} selection${lockedPlayers.length > 1 ? 's' : ''} locked (games started)`,
        priority: 8
      });
    }

    // Check for injured players
    const injuredPlayers = filledPositions.filter(key => {
      const entity = lineup[key as PositionKey];
      if (entity && entity.entityType === 'player') {
        const player = entity as SelectablePlayer;
        return player.injuryStatus?.status === 'Out' || player.injuryStatus?.status === 'Doubtful';
      }
      return false;
    });

    if (injuredPlayers.length > 0) {
      suggestions.push({
        id: 'injured-players',
        type: 'warning',
        title: 'Injury Concerns',
        message: `${injuredPlayers.length} player${injuredPlayers.length > 1 ? 's' : ''} may not play due to injury`,
        action: 'Check status',
        priority: 9
      });
    }

    // Lineup completion suggestions
    if (filledPositions.length === 0) {
      // Suggest copying from last week if available and not week 1
      if (week > 1 && hasLastWeekLineup) {
        suggestions.push({
          id: 'copy-last-week',
          type: 'tip',
          title: 'Copy Last Week\'s Lineup',
          message: `Start with your Week ${week - 1} lineup and make adjustments`,
          action: 'Copy Lineup',
          priority: 7
        });
      }
      
      suggestions.push({
        id: 'get-started',
        type: 'tip',
        title: 'Get Started',
        message: 'Use Quick Pick to instantly fill your lineup with top performers',
        action: 'Try Quick Pick',
        priority: 5
      });
    } else if (filledPositions.length < totalPositions) {
      const remaining = totalPositions - filledPositions.length;
      suggestions.push({
        id: 'incomplete-lineup',
        type: 'info',
        title: 'Lineup Incomplete',
        message: `${remaining} position${remaining > 1 ? 's' : ''} still need${remaining === 1 ? 's' : ''} to be filled`,
        priority: 6
      });
    } else {
      suggestions.push({
        id: 'lineup-complete',
        type: 'success',
        title: 'Lineup Complete!',
        message: 'All positions filled. You\'re ready for this week!',
        priority: 3
      });
    }

    // Performance optimization tip
    if (filledPositions.length >= 2) {
      suggestions.push({
        id: 'optimize-tip',
        type: 'tip',
        title: 'Maximize Points',
        message: 'Use "Optimize Lineup" to upgrade your players with better performers',
        action: 'Optimize Now',
        priority: 4
      });
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  };

  const suggestions = generateSuggestions();

  if (suggestions.length === 0) return null;

  const getIconForType = (type: Suggestion['type']) => {
    switch (type) {
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'tip':
        return (
          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
    }
  };

  const getBackgroundForType = (type: Suggestion['type']) => {
    switch (type) {
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800';
      case 'success':
        return 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800';
      case 'tip':
        return 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800';
    }
  };

  // Show only the top 2 most important suggestions to avoid clutter
  const topSuggestions = suggestions.slice(0, 2);

  return (
    <div className="mb-6 space-y-3">
      {topSuggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className={`rounded-lg border p-4 ${getBackgroundForType(suggestion.type)}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getIconForType(suggestion.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white">
                  {suggestion.title}
                </h4>
                {suggestion.action && (
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-full">
                    {suggestion.action}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {suggestion.message}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SmartSuggestions; 