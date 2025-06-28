import React, { useState, useEffect } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { SelectablePlayer, SelectableTeam, SelectableEntity, PositionKey, InjuryStatus } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { MAX_USAGE_COUNT } from '../../config/appConfig';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';

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

  const [searchTerm, setSearchTerm] = useState('');
  
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

  if (!isSelectionPanelOpen || !selectedPosition) return null;

  const isPlayer = selectedPosition.type === 'player';
  const entities = isPlayer ? players[selectedPosition.key as PositionKey] || [] : teams[selectedPosition.key as PositionKey] || [];
  const isLoading = loadingStates[selectedPosition.key as PositionKey] || false;
  const error = errorStates[selectedPosition.key as PositionKey];

  // Sort entities by PPG (descending - highest first)
  const sortedEntities = [...entities].sort((a, b) => b.actualPPG - a.actualPPG);

  // Filter entities based on search term
  const filteredEntities = sortedEntities.filter((entity: SelectableEntity) =>
    entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entity.teamAbbreviation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectEntity = (entity: SelectableEntity) => {
    updateLineupSlot(selectedPosition.key as PositionKey, entity);
    closeSelectionPanel();
  };

  // Mobile-first backdrop classes with lighter blur
  const backdropClasses = [
    'fixed inset-0 z-[999999] bg-gray-400/30 backdrop-blur-sm',
    'transition-opacity duration-300 ease-in-out',
    isSelectionPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
  ].join(' ');

  // Mobile-first panel classes matching old EntitySelectionPanel
  const panelClasses = [
    // Mobile: full screen
    'fixed inset-0 z-[9999999] bg-white dark:bg-gray-900',
    // Desktop: right side drawer
    'md:inset-auto md:right-0 md:top-0 md:h-full md:w-96 md:max-w-md',
    'md:rounded-l-lg md:border-l md:border-gray-200 md:dark:border-gray-700',
    'transform transition-transform duration-300 ease-in-out',
    isSelectionPanelOpen ? 'translate-x-0' : 'translate-x-full'
  ].join(' ');

  return (
    <>
      {/* Backdrop - only show when open */}
      {isSelectionPanelOpen && <div className={backdropClasses} onClick={closeSelectionPanel} />}
      
      {/* Panel - always in DOM for animation, but positioned off-screen when closed */}
      <div className={panelClasses}>
        {isSelectionPanelOpen && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 p-4 md:p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg md:text-base font-semibold text-gray-900 dark:text-white">
                  Select {selectedPosition.label}
                </h2>
                <button
                  onClick={closeSelectionPanel}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Close selection panel"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder={`Search ${selectedPosition.label.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full p-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mb-4"></div>
                  <p className="text-lg text-gray-600 dark:text-gray-400">Loading options...</p>
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
                      const canSelect = !isTeamSelectedInOtherSlot && 
                                      (entity.usageCount < MAX_USAGE_COUNT || isCurrentlySelected) &&
                                      !isOnByeThisWeek; // Can't select if on bye week

                      return (
                        <div
                          key={entity.id}
                          className={`relative p-4 border rounded-lg transition-colors ${
                            isCurrentlySelected
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                              : canSelect
                              ? 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                              : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 opacity-60'
                          }`}
                          onClick={canSelect ? () => handleSelectEntity(entity) : undefined}
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

                            {/* Right side: PPG only */}
                            <div className="flex items-center space-x-3">
                              {/* PPG (always in same position for alignment) */}
                              <div className="text-right min-w-[60px]">
                                <div className="text-xs text-gray-500 dark:text-gray-400">PPG</div>
                                <div className="font-semibold text-lg text-gray-800 dark:text-gray-100">
                                  {entity.actualPPG.toFixed(1)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Status messages */}
                          {!canSelect && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
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
          </div>
        )}
      </div>
    </>
  );
};

export default SimpleEntitySelectionPanel; 