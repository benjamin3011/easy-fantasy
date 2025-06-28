import React, { useState, useEffect, useCallback } from 'react';
import { PositionDetail, SelectableEntity, Lineup, PositionKey } from '../../types/lineup';
import Button from '../ui/button/Button';
import EntityDisplayCard from './EntityDisplayCard';
// Import the new service functions including lazy loading
import {
  fetchSelectablePlayers,
  fetchSelectableTeams,
} from '../../services/lineupFetchingService'; 
import { FirestoreWeeklySchedule } from '../../services/lineupFetchingService';

interface EntitySelectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  positionToEdit: PositionDetail | null;
  onSelectEntity: (entity: SelectableEntity) => void;
  currentlySelectedEntityId?: string;
  lineup: Lineup;
  usageCounts?: Record<string, number>;
  weeklySchedule?: FirestoreWeeklySchedule | null;
  onViewStatsRequest: (entity: SelectableEntity) => void;
  currentTimeEpoch: number;
  isGameStartedForEntity: (entity: SelectableEntity, currentTimeEpoch: number) => boolean;
  currentSelectedWeek?: number;
  // TODO: Add userId and leagueId props for fetching usage counts later
}

  const TEAM_POSITION_KEYS: PositionKey[] = ['PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];

const EntitySelectionPanel: React.FC<EntitySelectionPanelProps> = ({
  isOpen,
  onClose,
  positionToEdit,
  onSelectEntity,
  currentlySelectedEntityId,
  lineup,
  usageCounts,
  weeklySchedule,
  onViewStatsRequest,
  currentTimeEpoch,
  isGameStartedForEntity,
  currentSelectedWeek,
}) => {
  const [selectableEntities, setSelectableEntities] = useState<SelectableEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activePositionToEdit, setActivePositionToEdit] = useState<PositionDetail | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<'actualPPG' | 'name' | 'usageCount'>('actualPPG');
  const [filterOptions, setFilterOptions] = useState({
    excludeInjured: false,
    excludeByeWeek: false,
    maxUsage: undefined as number | undefined
  });

  useEffect(() => {
    if (isOpen && positionToEdit) {
      setActivePositionToEdit(positionToEdit);
      fetchEntitiesInitial(positionToEdit);
    } else if (!isOpen) {
      setTimeout(() => {
        setSelectableEntities([]);
        setIsLoading(false);
        setIsLoadingMore(false);
        setFetchError(null);
        setActivePositionToEdit(null);
        setHasMore(false);
      }, 300);
    }
  }, [isOpen, positionToEdit, usageCounts, weeklySchedule]);

  const fetchEntitiesInitial = async (position: PositionDetail) => {
    setIsLoading(true);
    setFetchError(null);
    setSelectableEntities([]);
    setHasMore(false);

    try {
      if (position.type === 'player') {
        // Load all players at once (simplified for now)
        const players = await fetchSelectablePlayers(
          position.key as PositionKey, 
          usageCounts, 
          weeklySchedule
        );
        
        setSelectableEntities(players);
        setHasMore(false);
      } else if (position.type === 'team') {
        // Teams are smaller datasets, load all at once
        const teams = await fetchSelectableTeams(position.key as PositionKey, usageCounts, weeklySchedule);
        setSelectableEntities(teams);
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error fetching entities:", error);
      if (error instanceof Error) {
        setFetchError(`Failed to load selections: ${error.message}. Please try again.`);
      } else {
        setFetchError("Failed to load available selections due to an unknown error. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreEntities = useCallback(async () => {
    if (!activePositionToEdit || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    
    try {
      if (activePositionToEdit.type === 'player') {
        // For now, this is a simplified implementation
        // In production, you'd implement proper cursor-based pagination
        const players = await fetchSelectablePlayers(
          activePositionToEdit.key as PositionKey, 
          usageCounts, 
          weeklySchedule
        );
        
        setSelectableEntities(players);
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more entities:", error);
      setFetchError("Failed to load more options. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [activePositionToEdit, isLoadingMore, hasMore, sortBy, filterOptions, usageCounts, weeklySchedule]);

  const handleEntitySelectedAndClose = (selectedFullEntity: SelectableEntity) => {
    onSelectEntity(selectedFullEntity);
    // Don't close here - let the parent handle it with optimistic updates
  };

  const handleViewStatsRequest = (entity: SelectableEntity) => {
    onViewStatsRequest(entity);
  };

  const handleSortChange = (newSortBy: 'actualPPG' | 'name' | 'usageCount') => {
    if (newSortBy !== sortBy) {
      setSortBy(newSortBy);
      if (activePositionToEdit) {
        fetchEntitiesInitial(activePositionToEdit);
      }
    }
  };

  const handleFilterChange = (newFilters: typeof filterOptions) => {
    setFilterOptions(newFilters);
    if (activePositionToEdit) {
      fetchEntitiesInitial(activePositionToEdit);
    }
  };

  // Mobile-first backdrop classes - Higher z-index than app header (z-99999)
  const backdropClasses = [
    'fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm',
    'transition-opacity duration-300 ease-in-out',
    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
  ].join(' ');

  // Mobile-first panel classes
  const panelClasses = [
    // Mobile: full screen
    'fixed inset-0 z-[9999999] bg-white dark:bg-gray-900',
    // Desktop: right side drawer
    'md:inset-auto md:right-0 md:top-0 md:h-full md:w-96 md:max-w-md',
    'md:rounded-l-lg md:border-l md:border-gray-200 md:dark:border-gray-700',
    'transform transition-transform duration-300 ease-in-out',
    isOpen ? 'translate-x-0' : 'translate-x-full'
  ].join(' ');

  return (
    <>
      {/* Backdrop - only show when open */}
      {isOpen && <div className={backdropClasses} onClick={onClose} />}
      
      {/* Panel - always in DOM for animation, but positioned off-screen when closed */}
      <div className={panelClasses}>
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* Enhanced Header with Filters */}
            <div className="flex-shrink-0 p-4 md:p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg md:text-base font-semibold text-gray-800 dark:text-white">
                  Select {activePositionToEdit?.label}
                </h3>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Close selection panel"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Sort and Filter Controls */}
              {activePositionToEdit?.type === 'player' && (
                <div className="space-y-2">
                  {/* Sort Options */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      <option value="actualPPG">Points per Game</option>
                      <option value="name">Name</option>
                      <option value="usageCount">Usage</option>
                    </select>
                  </div>

                  {/* Filter Options */}
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={filterOptions.excludeInjured}
                        onChange={(e) => handleFilterChange({ ...filterOptions, excludeInjured: e.target.checked })}
                        className="mr-1 w-3 h-3"
                      />
                      <span className="text-gray-600 dark:text-gray-400">Hide Injured</span>
                    </label>
                    <label className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={filterOptions.excludeByeWeek}
                        onChange={(e) => handleFilterChange({ ...filterOptions, excludeByeWeek: e.target.checked })}
                        className="mr-1 w-3 h-3"
                      />
                      <span className="text-gray-600 dark:text-gray-400">Hide Bye Week</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {/* Loading State */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center h-full p-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mb-4"></div>
                  <p className="text-lg text-gray-600 dark:text-gray-400">Loading options...</p>
                </div>
              )}

              {/* Error State */}
              {fetchError && (
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
                    {fetchError}
                  </p>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      if (activePositionToEdit) {
                        fetchEntitiesInitial(activePositionToEdit);
                      }
                    }}
                    className="min-h-[48px]"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !fetchError && selectableEntities.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                    No Options Available
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md">
                    No {activePositionToEdit?.type}s are available for the {activePositionToEdit?.label} position at this time.
                  </p>
                </div>
              )}

              {/* Entity List */}
              {!isLoading && !fetchError && selectableEntities.length > 0 && (
                <div className="h-full overflow-y-auto">
                  <div className="p-4 md:p-3 space-y-3 md:space-y-2">
                    {selectableEntities.map(entity => {
                      let isTeamSelectedInOtherSlot = false;
                      let otherSlotKey: PositionKey | null = null;

                      if (entity.entityType === 'team' && lineup && activePositionToEdit) { 
                        for (const key of TEAM_POSITION_KEYS) {
                          if (key !== activePositionToEdit.key && lineup[key]?.id === entity.id) {
                            isTeamSelectedInOtherSlot = true;
                            otherSlotKey = key;
                            break;
                          }
                        }
                      }
                      const isLocked = isGameStartedForEntity(entity, currentTimeEpoch);
                      const isOnByeWeekForSelectedWeek = entity.byeWeek === currentSelectedWeek;

                      return (
                        <EntityDisplayCard 
                          key={`${entity.id}-${activePositionToEdit?.key}`}
                          entity={entity} 
                          onSelect={handleEntitySelectedAndClose}
                          currentlySelectedEntityId={currentlySelectedEntityId}
                          isTeamSelectedInOtherSlot={isTeamSelectedInOtherSlot}
                          otherSlotKey={otherSlotKey}
                          onViewStats={handleViewStatsRequest}
                          isLocked={isLocked}
                          isOnByeWeekForSelectedWeek={isOnByeWeekForSelectedWeek}
                        />
                      );
                    })}
                  </div>
                  
                  {/* Load More Button */}
                  {hasMore && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      <Button
                        variant="outline"
                        size="md"
                        onClick={loadMoreEntities}
                        disabled={isLoadingMore}
                        className="w-full min-h-[48px]"
                      >
                        {isLoadingMore ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                            Loading more...
                          </>
                        ) : (
                          `Load More ${activePositionToEdit?.type === 'player' ? 'Players' : 'Teams'}`
                        )}
                      </Button>
                    </div>
                  )}
                  
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

export default EntitySelectionPanel; 