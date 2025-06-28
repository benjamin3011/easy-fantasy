import React, { useState } from 'react';
import Button from '../ui/button/Button';

interface QuickActionsMenuProps {
  isRandomizing: boolean;
  isLoadingLineup: boolean;
  isCopyingFromLastWeek?: boolean;
  selectedCount: number;
  totalPositions: number;
  currentWeek: number;
  onRandomizeLineup: () => void;
  onClearLineup: () => void;
  onOptimizeLineup: () => void;
  onCopyFromLastWeek: () => void;
  onOpenStrategyPanel?: () => void;
}

const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  isRandomizing,
  isLoadingLineup,
  isCopyingFromLastWeek = false,
  selectedCount,
  totalPositions,
  currentWeek,
  onRandomizeLineup,
  onClearLineup,
  onOptimizeLineup,
  onCopyFromLastWeek,
  onOpenStrategyPanel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDisabled = isRandomizing || isLoadingLineup || isCopyingFromLastWeek;
  const hasSelections = selectedCount > 0;
  const isWeek1 = currentWeek === 1;

  return (
    <div className="relative">
      {/* Mobile: Show dropdown for all weeks */}
      <div className="block sm:hidden">
        {selectedCount === 0 ? (
          <Button
            size="sm"
            variant="primary"
            disabled={isDisabled}
            onClick={() => setIsOpen(!isOpen)}
            className="min-h-[44px] px-4 flex items-center gap-2"
          >
            Quick Actions
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isDisabled}
            onClick={() => setIsOpen(!isOpen)}
            className="min-h-[44px] px-4 flex items-center gap-2"
          >
            Actions
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        )}
      </div>

      {/* Desktop: Show dropdown menu */}
      <div className="hidden sm:block">
        <Button
          size="sm"
          variant="outline"
          disabled={isDisabled}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
        >
          Quick Actions
          <svg 
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </div>

      {/* Dropdown Menu - Shared for both mobile and desktop */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 w-56 sm:w-56 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-20">
              <div className="p-2 space-y-1">
                {/* Quick Pick */}
                <button
                  onClick={() => {
                    onRandomizeLineup();
                    setIsOpen(false);
                  }}
                  disabled={isDisabled}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <div className="flex-1 text-left">
                    <div className="font-medium">Quick Pick</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {isRandomizing ? 'Picking players...' : 'Fill lineup with top players'}
                    </div>
                  </div>
                </button>

                {/* Copy from Last Week */}
                {!isWeek1 && (
                  <button
                    onClick={() => {
                      onCopyFromLastWeek();
                      setIsOpen(false);
                    }}
                    disabled={isDisabled}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">Copy from Last Week</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {isCopyingFromLastWeek ? 'Copying lineup...' : `Copy Week ${currentWeek - 1} lineup`}
                      </div>
                    </div>
                  </button>
                )}

                {/* Optimize Lineup */}
                <button
                  onClick={() => {
                    onOptimizeLineup();
                    setIsOpen(false);
                  }}
                  disabled={isDisabled || selectedCount === 0}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 text-left">
                    <div className="font-medium">Optimize Lineup</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Improve current selections
                    </div>
                  </div>
                </button>

                {/* Strategy Insights */}
                {onOpenStrategyPanel && (
                  <button
                    onClick={() => {
                      onOpenStrategyPanel();
                      setIsOpen(false);
                    }}
                    disabled={isDisabled}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">Strategy Insights</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Usage tracking & captain tips
                      </div>
                    </div>
                  </button>
                )}

                {/* Divider */}
                {hasSelections && (
                  <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                )}

                {/* Clear All */}
                {hasSelections && (
                  <button
                    onClick={() => {
                      onClearLineup();
                      setIsOpen(false);
                    }}
                    disabled={isDisabled}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">Clear All</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Remove all {selectedCount} selections
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Status Footer */}
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg border-t border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {selectedCount} of {totalPositions} positions filled
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
};

export default QuickActionsMenu; 