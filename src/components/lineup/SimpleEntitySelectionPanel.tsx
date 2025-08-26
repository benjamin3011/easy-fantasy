import React, { useState, useEffect } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { SelectablePlayer, SelectableTeam, SelectableEntity, PositionKey, InjuryStatus } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { MAX_USAGE_COUNT } from '../../config/appConfig';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import { isEntityGameLocked, getGameLockMessage } from '../../utils/gameLockHelper';
import { useLineupPoints } from '../../context/LineupPointsContext';
import { getEntityDisplayPoints } from '../../utils/lineupPointsDisplay';
import { BottomSheet } from '../ui/bottomsheet/BottomSheet';

// Helper function to get injury border color (from old EntityDisplayCard.tsx)
const getInjuryBorderColor = (status?: InjuryStatus['status']): string => {
  if (!status) return 'border-transparent';
  switch (status) {
    case 'Healthy':
      return 'border-green-500';
    case 'Questionable':
      return 'border-yellow-500';
    case 'Doubtful':
      return 'border-orange-500';
    case 'Out':
    case 'IR':
    case 'PUP':
    case 'Suspended':
      return 'border-red-500';
    default:
      return 'border-gray-300';
  }
};

// Helper function to format game time (from old EntityDisplayCard.tsx)
const formatGameTime = (epoch?: number): string | null => {
  if (!epoch) return null;
  try {
    const date = new Date(epoch * 1000);
    const day = date.toLocaleDateString(undefined, { weekday: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} ${time}`;
  } catch {
    return null;
  }
};

const SimpleEntitySelectionPanel: React.FC = () => {
  const { 
    isSelectionPanelOpen, 
    selectedPosition, 
    lineup,
    closeSelectionPanel, 
    updateLineupSlot, 
    players,
    teams,
    loadingStates,
    errorStates,
    fetchSelectablePlayers,
    fetchSelectableTeams
  } = useLineupStore();

  const { hasGameStarted, actualPoints, captainSlotKey, captainMultiplier } = useLineupPoints();
  const [searchTerm, setSearchTerm] = useState('');
  const [hideExhausted, setHideExhausted] = useState<boolean>(false);
  const [hideLowRemaining, setHideLowRemaining] = useState<boolean>(false);
  
  const TEAM_POSITION_KEYS: PositionKey[] = ['PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
  const currentWeek = calculateCurrentNFLWeek();

  useEffect(() => {
    if (isSelectionPanelOpen && selectedPosition) {
      if (selectedPosition.type === 'player') {
        fetchSelectablePlayers(selectedPosition.key as PositionKey);
      } else {
        fetchSelectableTeams(selectedPosition.key as PositionKey);
      }
    }
  }, [isSelectionPanelOpen, selectedPosition, fetchSelectablePlayers, fetchSelectableTeams]);

  // Persist usage filter preferences across sessions
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ef_selector_usage_filters');
      if (raw) {
        const obj = JSON.parse(raw) as { hideExhausted?: boolean; hideLowRemaining?: boolean };
        if (typeof obj.hideExhausted === 'boolean') setHideExhausted(obj.hideExhausted);
        if (typeof obj.hideLowRemaining === 'boolean') setHideLowRemaining(obj.hideLowRemaining);
      }
    } catch (e) {
      console.warn('Failed to load selector usage filters', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ef_selector_usage_filters',
        JSON.stringify({ hideExhausted, hideLowRemaining })
      );
    } catch (e) {
      console.warn('Failed to persist selector usage filters', e);
    }
  }, [hideExhausted, hideLowRemaining]);

  if (!isSelectionPanelOpen || !selectedPosition) return null;

  const isPlayer = selectedPosition.type === 'player';
  const entities = isPlayer ? players[selectedPosition.key as PositionKey] || [] : teams[selectedPosition.key as PositionKey] || [];
  const isLoading = loadingStates[selectedPosition.key as PositionKey] || false;
  const error = errorStates[selectedPosition.key as PositionKey];
  const currentlySelectedEntityId = lineup[selectedPosition.key as PositionKey]?.id;

  // Sort entities by PPG (descending - highest first)
  const sortedEntities = [...entities].sort((a, b) => (b.actualPPG || 0) - (a.actualPPG || 0));

  // Filter entities based on search term
  const filteredEntities = sortedEntities
    .filter((entity: SelectableEntity) =>
      entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entity.teamAbbreviation.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((entity: SelectableEntity) => {
      // Hide exhausted usage unless it's the currently selected one
      if (hideExhausted && entity.usageCount >= MAX_USAGE_COUNT && entity.id !== currentlySelectedEntityId) {
        return false;
      }
      // Hide low remaining (≤1 left) unless it's the currently selected one
      const remaining = Math.max(0, MAX_USAGE_COUNT - entity.usageCount);
      if (hideLowRemaining && remaining <= 1 && entity.id !== currentlySelectedEntityId) {
        return false;
      }
      return true;
    });

  const handleSelectEntity = (entity: SelectableEntity) => {
    // Prevent selection if entity's game is locked
    if (isEntityGameLocked(entity)) {
      return;
    }
    
    updateLineupSlot(selectedPosition.key as PositionKey, entity);
    closeSelectionPanel();
  };

  // Render body content (search, filters, list)
  const renderPanelBody = () => (
    <>
      {/* Search */}
      <input
        type="text"
        placeholder={`Search ${selectedPosition.label.toLowerCase()}...`}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
      />

      {/* Usage filters */}
      <div className="mt-2 flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            checked={hideExhausted}
            onChange={(e) => setHideExhausted(e.target.checked)}
          />
          Hide exhausted (5/5)
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            checked={hideLowRemaining}
            onChange={(e) => setHideLowRemaining(e.target.checked)}
          />
          Hide ≤1 remaining
        </label>
        {(hideExhausted || hideLowRemaining) && (
          <button
            type="button"
            onClick={() => { setHideExhausted(false); setHideLowRemaining(false); }}
            className="ml-auto text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-3 space-y-3 md:space-y-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="p-4 border rounded-lg border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                    <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
              ))}
              <div className="h-8 md:h-4" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              Unable to Load Options
            </h3>
            <p className="text-red-600 dark:text-red-400 mb-4 max-w-md">
              {error}
            </p>
            <button
              onClick={() => {
                if (selectedPosition.type === 'player') {
                  fetchSelectablePlayers(selectedPosition.key as PositionKey);
                } else {
                  fetchSelectableTeams(selectedPosition.key as PositionKey);
                }
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              {searchTerm ? 'No Results Found' : 'No Options Available'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              {searchTerm 
                ? `No ${selectedPosition.label.toLowerCase()} match your search.`
                : `No ${selectedPosition.label.toLowerCase()} are available at this time.`
              }
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-3 space-y-3 md:space-y-2">
              {filteredEntities.map((entity: SelectableEntity) => {
                const currentlySelectedEntityId = lineup[selectedPosition.key as PositionKey]?.id;
                const isCurrentlySelected = entity.id === currentlySelectedEntityId;
                
                // Check if this team is selected in another slot (for teams only)
                let isTeamSelectedInOtherSlot = false;
                let otherSlotKey: PositionKey | null = null;
                
                if (entity.entityType === 'team') {
                  for (const key of TEAM_POSITION_KEYS) {
                    if (key !== selectedPosition.key && lineup[key]?.id === entity.id) {
                      isTeamSelectedInOtherSlot = true;
                      otherSlotKey = key;
                      break;
                    }
                  }
                }

                // Determine if entity can be selected
                const isOnByeThisWeek = entity.byeWeek === currentWeek;
                const isGameLocked = isEntityGameLocked(entity);
                const canSelect = !isTeamSelectedInOtherSlot && 
                                (entity.usageCount < MAX_USAGE_COUNT || isCurrentlySelected) &&
                                !isOnByeThisWeek && // Can't select if on bye week
                                !isGameLocked; // Can't select if game is locked

                return (
                  <div
                    key={entity.id}
                    className={`relative p-4 border rounded-lg transition-colors ${
                      isCurrentlySelected
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : isGameLocked
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 opacity-65'
                        : canSelect
                        ? 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                        : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 opacity-60'
                    }`}
                    onClick={canSelect ? () => handleSelectEntity(entity) : undefined}
                    title={isGameLocked ? getGameLockMessage(entity) : undefined}
                  >
                    <div className="flex items-center space-x-3">
                      {/* Avatar with injury border */}
                      <div className={`w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm flex-shrink-0 overflow-hidden border-2 ${
                        entity.entityType === 'player' && (entity as SelectablePlayer).injuryStatus 
                          ? getInjuryBorderColor((entity as SelectablePlayer).injuryStatus?.status) 
                          : 'border-transparent'
                      } p-0.5`}>
                        {entity.entityType === 'player' && (entity as SelectablePlayer).headshotUrl ? (
                          <img 
                            src={(entity as SelectablePlayer).headshotUrl} 
                            alt={entity.name} 
                            className="w-full h-full rounded-full object-cover" 
                          />
                        ) : entity.entityType === 'team' && (entity as SelectableTeam).logoUrl ? (
                          <img 
                            src={(entity as SelectableTeam).logoUrl} 
                            alt={entity.name} 
                            className="w-full h-full rounded-full object-contain" 
                          />
                        ) : (
                          entity.name.substring(0, 1)
                        )}
                      </div>

                      {/* Entity Info */}
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white text-base">
                          {entity.name}
                        </h3>
                        
                        {/* Full team name for players only */}
                        {entity.entityType === 'player' && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {(entity as SelectablePlayer).fullTeamName}
                          </p>
                        )}
                        
                        {/* Opponent and Game Time (only if not on bye) */}
                        {!isOnByeThisWeek && (entity.opponentForWeek || entity.nextOpponent) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {entity.opponentForWeek || entity.nextOpponent} {
                              entity.gameTimeEpochForWeek ? 
                                `(${formatGameTime(entity.gameTimeEpochForWeek)})` : 
                                (entity.gameTimeEpoch ? `(${formatGameTime(entity.gameTimeEpoch)})` : '')
                            }
                          </p>
                        )}
                        
                        {/* No game message */}
                        {!isOnByeThisWeek && !(entity.opponentForWeek || entity.nextOpponent) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            No game this week
                          </p>
                        )}
                        
                        {/* Usage indicator */}
                        <div className="flex items-center mt-1 text-xs">
                          <span className="text-gray-500 dark:text-gray-400 mr-2">Usage:</span>
                          <div className="flex space-x-1">
                            {[...Array(MAX_USAGE_COUNT)].map((_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  i < entity.usageCount ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Points display */}
                      <div className="flex items-center space-x-3">
                        {/* Points (PPG or actual) */}
                        <div className="text-right min-w-[60px]">
                          {(() => {
                            const displayPoints = getEntityDisplayPoints(
                              entity, 
                              hasGameStarted, 
                              actualPoints[entity.id],
                              selectedPosition.key,
                              captainSlotKey,
                              captainMultiplier
                            );
                            return (
                              <>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {displayPoints.label}
                                </div>
                                <div className={`font-semibold text-lg ${
                                  displayPoints.type === 'actual' 
                                    ? 'text-blue-600 dark:text-blue-400' 
                                    : 'text-gray-800 dark:text-gray-100'
                                }`}>
                                  {displayPoints.points.toFixed(2)}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Lock Icon - Absolute positioned */}
                    {isGameLocked && (
                      <div className="absolute top-2 right-2">
                        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
                        </svg>
                      </div>
                    )}

                    {/* Status messages */}
                    {!canSelect && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        {isGameLocked && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
                            </svg>
                            Game has started - cannot select
                          </p>
                        )}
                        {isOnByeThisWeek && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            On bye week - cannot select
                          </p>
                        )}
                        {isTeamSelectedInOtherSlot && otherSlotKey && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            Already selected for {POSITIONS_CONFIG.find(p => p.key === otherSlotKey)?.label || 'Unknown Position'}
                          </p>
                        )}
                        {entity.usageCount >= MAX_USAGE_COUNT && !isCurrentlySelected && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Usage limit reached (5/{MAX_USAGE_COUNT})
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Bottom padding for mobile safe area */}
            <div className="h-8 md:h-4"></div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: Bottom Sheet (visible below lg) */}
      <BottomSheet
        isOpen={isSelectionPanelOpen}
        onClose={closeSelectionPanel}
        title={`Select ${selectedPosition.label}`}
        className="min-h-[75vh]"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {renderPanelBody()}
        </div>
      </BottomSheet>

      {/* Desktop: Right-side drawer (lg and up) */}
      {isSelectionPanelOpen && (
        <>
          <div className="hidden lg:block fixed inset-0 z-[999998] bg-gray-900/30" onClick={closeSelectionPanel} />
          <div className={`hidden lg:block fixed right-0 top-0 bottom-0 z-[999999] w-96 max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out ${isSelectionPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Select {selectedPosition.label}
                  </h2>
                  <button
                    onClick={closeSelectionPanel}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Close selection panel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {renderPanelBody()}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SimpleEntitySelectionPanel; 