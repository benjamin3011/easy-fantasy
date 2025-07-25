import React, { useEffect, useState } from 'react';
import { Suspense, lazy } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { useNetworkStatus } from '../common/NetworkStatusProvider';
import { POSITIONS_CONFIG } from '../../config/positions';
import { SelectableEntity } from '../../types/lineup';
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

interface SimpleLineupGridProps {
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
  userId?: string;
  leagueId?: string;
}

const SimpleLineupGrid: React.FC<SimpleLineupGridProps> = ({ 
  enableCaptainFeature, 
  captainPointMultiplier,
  userId,
  leagueId 
}) => {
  const {
    lineup,
    isLoadingLineup,
    currentWeek,
    currentSeason,
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
  const handleOpenStrategyPanel = () => {
    setIsStrategyPanelOpen(true);
  };

  const handleCloseStrategyPanel = () => {
    setIsStrategyPanelOpen(false);
  };

  // Calculate completion stats
  const totalSlots = POSITIONS_CONFIG.length;
  const filledSlots = Object.values(lineup).filter(entity => entity !== undefined).length;
  const completionPercentage = Math.round((filledSlots / totalSlots) * 100);

  // Separate player and team positions
  const playerPositions = POSITIONS_CONFIG.filter(pos => pos.type === 'player');
  const teamPositions = POSITIONS_CONFIG.filter(pos => pos.type === 'team');

  // Use week and season from store (set by LineupPage based on user selection)
  const weekForActions = currentWeek || calculateCurrentNFLWeek();
  const seasonForActions = currentSeason || parseInt(APP_CONFIG.CURRENT_NFL_SEASON, 10);

  return (
    <div className="space-y-8">
      {/* Progress Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {filledSlots} of {totalSlots} selected
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleOpenStrategyPanel}
              className="text-sm px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              📊 Strategy
            </button>
            <div className="text-lg font-semibold text-brand-600 dark:text-brand-400">
              {completionPercentage}% Complete
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-brand-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Lineup Slots */}
        <div className="lg:col-span-2 space-y-6">
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
        <div className="lg:col-span-1 space-y-6">
          <SimpleLineupSummary 
            enableCaptainFeature={enableCaptainFeature}
            captainPointMultiplier={captainPointMultiplier}
          />
          {enableCaptainFeature && (
            <SimpleCaptainSelector captainPointMultiplier={captainPointMultiplier} />
          )}
        </div>
      </div>

      {/* Entity Selection Panel */}
      <SimpleEntitySelectionPanel />

      {/* Stats Modal */}
      <Suspense fallback={null}>
        <StatsModal
          isOpen={isStatsModalOpen}
          onClose={handleCloseStatsModal}
          entity={selectedEntityForStats}
        />
      </Suspense>

      {/* Strategy Panel */}
      <Suspense fallback={null}>
        <StrategyPanel
          isOpen={isStrategyPanelOpen}
          onClose={handleCloseStrategyPanel}
          userId={userId}
          leagueId={leagueId}
          currentWeek={currentWeek ?? undefined}
          currentSeason={currentSeason ?? undefined}
        />
      </Suspense>
    </div>
  );
};

export default SimpleLineupGrid; 