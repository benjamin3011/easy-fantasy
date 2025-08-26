import React, { useEffect, useState, useMemo } from 'react';
import { Suspense, lazy } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { useNetworkStatus } from '../common/NetworkStatusProvider';
import { POSITIONS_CONFIG } from '../../config/positions';
import { SelectableEntity, PositionKey } from '../../types/lineup';
import SimpleLineupSlot from './SimpleLineupSlot';
import SimpleEntitySelectionPanel from './SimpleEntitySelectionPanel';
import SimpleCaptainSelector from './SimpleCaptainSelector';
import SimpleLineupSummary from './SimpleLineupSummary';
import SimpleQuickActions from './SimpleQuickActions';
import { SkeletonPage } from '../ui/skeleton/SkeletonLoader';

// Lazy load heavy components
const StatsModal = lazy(() => import('../modals/StatsModal'));
const StrategyPanel = lazy(() => import('./StrategyPanel'));
import { APP_CONFIG } from '../../config/appConfig';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import { useActualLineupPoints } from '../../hooks/useActualLineupPoints';
import { LineupPointsProvider } from '../../context/LineupPointsContext';

interface SimpleLineupGridProps {
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
}

const SimpleLineupGrid: React.FC<SimpleLineupGridProps> = ({ 
  enableCaptainFeature, 
  captainPointMultiplier
}) => {
  const {
    isLoadingLineup,
    currentWeek,
    currentSeason,
    lineup,
    designatedCaptainSlotKey,
    setOnlineStatus,
    loadPendingChanges,
  } = useLineupStore();

  // Stats modal state
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedEntityForStats, setSelectedEntityForStats] = useState<SelectableEntity | null>(null);

  // Strategy panel state
  const [isStrategyPanelOpen, setIsStrategyPanelOpen] = useState(false);

  const isOnline = useNetworkStatus();
  
  // Monitor network status
  useEffect(() => {
    setOnlineStatus(isOnline.isOnline);
  }, [isOnline.isOnline, setOnlineStatus]);
  
  // Load pending changes on mount
  useEffect(() => {
    loadPendingChanges();
  }, [loadPendingChanges]);
  
  // Prepare lineup entities for actual points fetching
  const lineupEntities = useMemo(() => {
    if (!lineup) return [];
    
    return Object.entries(lineup)
      .map(([positionKey, entity]) => ({
        entity,
        positionKey: positionKey as PositionKey
      }))
      .filter(({ entity }) => entity !== null);
  }, [lineup]);

  // Get actual points data when games have started
  const { hasGameStarted, actualPoints, isLoading: actualPointsLoading } = useActualLineupPoints(
    currentWeek || calculateCurrentNFLWeek(), 
    currentSeason || parseInt(APP_CONFIG.CURRENT_NFL_SEASON), 
    lineupEntities
  );

  // Compute missing picks for sticky banner
  const filledSlots = useMemo(() => Object.values(lineup || {}).filter((e) => !!e).length, [lineup]);
  const totalSlots = POSITIONS_CONFIG.length;
  const missingCount = totalSlots - filledSlots;
  
  // Show loading overlay while lineup is being loaded
  if (isLoadingLineup) {
    return <SkeletonPage type="dashboard" />;
  }

  // Stats modal handlers
  const handleViewStats = (entity: SelectableEntity) => {
    setSelectedEntityForStats(entity);
    setIsStatsModalOpen(true);
  };

  const handleCloseStatsModal = () => {
    setIsStatsModalOpen(false);
    setSelectedEntityForStats(null);
  };

  // Strategy panel handlers
  const handleCloseStrategyPanel = () => {
    setIsStrategyPanelOpen(false);
  };

  // Separate player and team positions
  const playerPositions = POSITIONS_CONFIG.filter(pos => pos.type === 'player');
  const teamPositions = POSITIONS_CONFIG.filter(pos => pos.type === 'team');

  // Use week and season from store (set by LineupPage based on user selection)
  const weekForActions = currentWeek || calculateCurrentNFLWeek();
  const seasonForActions = currentSeason || parseInt(APP_CONFIG.CURRENT_NFL_SEASON, 10);

  return (
    <LineupPointsProvider 
      hasGameStarted={hasGameStarted}
      actualPoints={actualPoints}
      isLoading={actualPointsLoading}
      captainSlotKey={designatedCaptainSlotKey}
      captainMultiplier={captainPointMultiplier}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Lineup Slots */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sticky picks-left banner */}
          {missingCount > 0 && (
            <div className="sticky top-0 z-20 lg:hidden">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="text-sm font-medium">
                  {missingCount} pick{missingCount === 1 ? '' : 's'} left to complete your lineup
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Use Optimize to auto-fill missing slots
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <SimpleQuickActions 
            currentWeek={weekForActions}
            currentSeason={seasonForActions}
          />

          {/* Unified Lineup Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Lineup (8 positions)
            </h3>
            <div className="space-y-6">
              {/* Player Positions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {playerPositions.map((position) => (
                  <SimpleLineupSlot
                    key={position.key}
                    positionKey={position.key}
                    onViewStats={handleViewStats}
                  />
                ))}
              </div>

              {/* Team Positions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teamPositions.map((position) => (
                  <SimpleLineupSlot
                    key={position.key}
                    positionKey={position.key}
                    onViewStats={handleViewStats}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Captain Selector & Summary */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Mobile: Captain First, Desktop: Summary First */}
          {enableCaptainFeature && (
            <div className="order-1 lg:order-2">
              <SimpleCaptainSelector captainPointMultiplier={captainPointMultiplier} />
            </div>
          )}
          <div className="order-2 lg:order-1">
            <SimpleLineupSummary 
              enableCaptainFeature={enableCaptainFeature}
              captainPointMultiplier={captainPointMultiplier}
            />
          </div>
        </div>
      </div>

      {/* Entity Selection Panel */}
      <SimpleEntitySelectionPanel />

      {/* Stats Modal */}
      <Suspense fallback={null}>
        {isStatsModalOpen && selectedEntityForStats && (
          <StatsModal
            isOpen={isStatsModalOpen}
            onClose={handleCloseStatsModal}
            entity={selectedEntityForStats}
          />
        )}
      </Suspense>

      {/* Strategy Panel */}
      <Suspense fallback={null}>
        {isStrategyPanelOpen && (
          <StrategyPanel
            isOpen={isStrategyPanelOpen}
            onClose={handleCloseStrategyPanel}
            currentWeek={weekForActions}
          />
        )}
      </Suspense>
    </LineupPointsProvider>
  );
};

export default SimpleLineupGrid; 