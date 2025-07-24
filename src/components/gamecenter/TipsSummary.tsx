import React from 'react';
import { useTipsStore } from '../../store/tipsStore';

interface TipsSummaryProps {
  totalGames: number;
  week: number;
}

const TipsSummary: React.FC<TipsSummaryProps> = ({ totalGames, week }) => {
  const { 
    userTips,
    existingTips,
    submitting,
    submitError,
    submitSuccess
  } = useTipsStore();

  // Calculate completion stats
  const tipsSubmitted = Object.keys(userTips).length;
  const completionPercentage = Math.round((tipsSubmitted / totalGames) * 100);
  const isComplete = tipsSubmitted === totalGames;

  // Calculate points from existing tips (if available)
  const currentPoints = existingTips?.tips?.length || 0;
  
  // Auto-save status indicator
  const getSaveStatusIcon = () => {
    if (submitting) {
      return (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Saving...</span>
        </div>
      );
    }
    
    if (submitSuccess) {
      return (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          <span className="text-sm">Saved</span>
        </div>
      );
    }
    
    if (submitError) {
      return (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <span className="text-sm">Error saving</span>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Tips Summary
        </h3>
        {/* Auto-save status indicator */}
        {getSaveStatusIcon()}
      </div>

      {/* Completion Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Tips Submitted
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {tipsSubmitted}/{totalGames}
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

        {/* Current Points */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Prophet Points (Week {week})
          </span>
          <div className="text-right">
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {currentPoints}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              1 point per correct pick
            </div>
          </div>
        </div>

        {/* Last Updated */}
        {existingTips && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Last Updated
            </span>
            <span className="text-sm text-gray-900 dark:text-white">
              {new Date(existingTips.submittedAt.seconds * 1000).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}

        {/* Status Messages */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Save Error Message */}
          {submitError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mb-3">
              <svg className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <div className="text-sm text-red-800 dark:text-red-200">
                <p className="font-medium">Save Error</p>
                <p>{submitError}</p>
              </div>
            </div>
          )}

          {!isComplete && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">Tips Incomplete</p>
                <p>Make {totalGames - tipsSubmitted} more prediction{totalGames - tipsSubmitted !== 1 ? 's' : ''} to maximize your Prophet Points</p>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <div className="text-sm text-green-800 dark:text-green-200">
                <p className="font-medium">All Tips Submitted!</p>
                <p>Your predictions are complete and automatically saved. Good luck!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TipsSummary; 