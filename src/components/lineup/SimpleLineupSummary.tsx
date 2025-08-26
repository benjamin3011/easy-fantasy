import React from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { POSITIONS_CONFIG } from '../../config/positions';

interface SimpleLineupSummaryProps {
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
}

const SimpleLineupSummary: React.FC<SimpleLineupSummaryProps> = ({ enableCaptainFeature, captainPointMultiplier }) => {
  const { 
    lineup, 
    designatedCaptainSlotKey,
    autoSaveStatus,
    saveError
  } = useLineupStore();

  // Calculate completion stats
  const totalSlots = POSITIONS_CONFIG.length;
  const filledSlots = Object.values(lineup).filter(entity => entity !== undefined).length;
  const completionPercentage = Math.round((filledSlots / totalSlots) * 100);
  const isComplete = filledSlots === totalSlots;

  // Check captain status (only if feature is enabled)
  const captainEntity = enableCaptainFeature && designatedCaptainSlotKey ? lineup[designatedCaptainSlotKey] : null;
  const isCaptainValid = captainEntity && captainEntity.entityType === 'player';
  const hasCaptain = enableCaptainFeature && designatedCaptainSlotKey !== null && isCaptainValid;

  // Calculate projected points
  const projectedPoints = Object.values(lineup).reduce((total, entity) => {
    if (!entity) return total;
    let points = entity.actualPPG;
    
    // Add captain bonus (only for players and if feature is enabled)
    if (enableCaptainFeature) {
      const entityPosition = POSITIONS_CONFIG.find(pos => 
        lineup[pos.key]?.id === entity.id
      );
      if (entityPosition && 
          designatedCaptainSlotKey === entityPosition.key && 
          entity.entityType === 'player') {
        points *= captainPointMultiplier; // Use configurable multiplier
      }
    }
    
    return total + points;
  }, 0);

  // Get captain info (ensure it's a player, only if feature is enabled)
  const captainPosition = enableCaptainFeature && designatedCaptainSlotKey ? 
    POSITIONS_CONFIG.find(pos => pos.key === designatedCaptainSlotKey) : null;

  // Auto-save status indicator
  const getSaveStatusIcon = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Saving...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <span className="text-sm">Saved</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span className="text-sm">Error saving</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Lineup Summary
        </h3>
        {/* Auto-save status indicator */}
        {getSaveStatusIcon()}
      </div>

      {/* Completion Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Lineup Completion
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {filledSlots}/{totalSlots}
            </span>
            <div className={`
              w-3 h-3 rounded-full
              ${isComplete ? 'bg-green-500' : 'bg-yellow-500'}
            `} />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={`
              h-2 rounded-full transition-all duration-300
              ${isComplete ? 'bg-green-500' : 'bg-yellow-500'}
            `}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>

        {/* Captain Status */}
        {enableCaptainFeature && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Captain Selected
            </span>
            <div className="flex items-center gap-2">
              {hasCaptain && captainEntity && captainPosition ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {captainEntity.name} ({captainPosition.label})
                  </span>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    None
                  </span>
                  <div className="w-3 h-3 bg-gray-300 dark:bg-gray-600 rounded-full" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projected Points */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Projected Points
          </span>
          <div className="text-right">
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {projectedPoints.toFixed(2)}
            </div>
            {enableCaptainFeature && hasCaptain && captainEntity && isCaptainValid && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400">
                +{(captainEntity.actualPPG * (captainPointMultiplier - 1)).toFixed(2)} captain bonus
              </div>
            )}
          </div>
        </div>

        {/* Status Messages */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Save Error Message */}
          {saveError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mb-3">
              <svg className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <div className="text-sm text-red-800 dark:text-red-200">
                <p className="font-medium">Save Error</p>
                <p>{saveError}</p>
              </div>
            </div>
          )}

          {!isComplete && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">Lineup Incomplete</p>
                <p>Fill all {totalSlots - filledSlots} remaining positions</p>
              </div>
            </div>
          )}

          {enableCaptainFeature && isComplete && !hasCaptain && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">Select Your Captain</p>
                <p>Choose a player as captain to maximize your points potential</p>
              </div>
            </div>
          )}

          {isComplete && (!enableCaptainFeature || hasCaptain) && (
            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <div className="text-sm text-green-800 dark:text-green-200">
                <p className="font-medium">Lineup Ready!</p>
                <p>Your lineup is complete and automatically saved</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleLineupSummary; 