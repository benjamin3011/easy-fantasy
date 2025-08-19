import React from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { PositionKey, SelectablePlayer, SelectableEntity, InjuryStatus } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { isEntityGameLocked, getGameLockMessage } from '../../utils/gameLockHelper';
import { useLineupPoints } from '../../context/LineupPointsContext';
import { getEntityDisplayPoints } from '../../utils/lineupPointsDisplay';

interface SimpleLineupSlotProps {
  positionKey: PositionKey;
  onSlotClick?: (positionKey: PositionKey) => void;
  onViewStats?: (entity: SelectableEntity) => void;
}

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

const SimpleLineupSlot: React.FC<SimpleLineupSlotProps> = ({
  positionKey,
  onSlotClick,
  onViewStats
}) => {
  const { lineup, updateLineupSlot, openSelectionPanel } = useLineupStore();
  const { hasGameStarted, actualPoints, captainSlotKey, captainMultiplier } = useLineupPoints();
  
  const positionConfig = POSITIONS_CONFIG.find(p => p.key === positionKey);
  const selectedEntity = lineup[positionKey];
  
  // Check if this entity's game is locked
  const isLocked = selectedEntity ? isEntityGameLocked(selectedEntity) : false;
  const lockMessage = selectedEntity ? getGameLockMessage(selectedEntity) : '';
  
  const handleSlotClick = () => {
    // Prevent selection if entity is locked
    if (isLocked) {
      return;
    }
    
    if (onSlotClick) {
      onSlotClick(positionKey);
    } else if (positionConfig) {
      // Use store's openSelectionPanel method to open entity selection
      openSelectionPanel(positionConfig);
    }
  };

  const handleClearSlot = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent slot click when clearing
    
    // Prevent clearing if entity is locked
    if (isLocked) {
      return;
    }
    
    updateLineupSlot(positionKey, undefined);
  };

  // Determine injury border class for players
  const isPlayer = (entity: SelectableEntity | undefined): entity is SelectablePlayer => entity?.entityType === 'player';
  const injuryBorderClass = selectedEntity && isPlayer(selectedEntity) && selectedEntity.injuryStatus 
    ? getInjuryBorderColor(selectedEntity.injuryStatus.status) 
    : 'border-transparent';

  // Format game time and opponent info
  const gameTimeDisplay = formatGameTime(selectedEntity?.gameTimeEpochForWeek);
  const opponentDisplay = selectedEntity?.opponentForWeek || selectedEntity?.nextOpponent;

  return (
    <div 
      className={`relative bg-white dark:bg-gray-800 border-2 rounded-lg p-4 min-h-[140px] transition-all duration-200 ${
        isLocked 
          ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 cursor-not-allowed opacity-70' 
          : 'border-gray-200 dark:border-gray-700 cursor-pointer hover:border-brand-400 hover:shadow-md'
      }`}
      onClick={handleSlotClick}
      title={isLocked ? lockMessage : undefined}
    >


      {/* Stats Button - Top Right (only when entity is selected) */}
      {selectedEntity && onViewStats && (
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering slot click
            onViewStats(selectedEntity);
          }}
          aria-label="Show stats"
          className="absolute top-2 right-2 flex items-center justify-center w-11 h-11 text-gray-500 transition-colors border border-gray-200 rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 z-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" color='currentColor' fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 5.25C3.5 4.83579 3.16421 4.5 2.75 4.5C2.33579 4.5 2 4.83579 2 5.25V17.25C2 18.4926 3.00736 19.5 4.25 19.5H21.25C21.6642 19.5 22 19.1642 22 18.75C22 18.3358 21.6642 18 21.25 18H4.25C3.83579 18 3.5 17.6642 3.5 17.25V5.25Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M7 10.2773C5.89543 10.2773 5 11.1728 5 12.2773V15.7501C5 16.1643 5.33579 16.5001 5.75 16.5001H8.25C8.66421 16.5001 9 16.1643 9 15.7501V12.2773C9 11.1728 8.10457 10.2773 7 10.2773ZM6.5 12.2773C6.5 12.0012 6.72386 11.7773 7 11.7773C7.27614 11.7773 7.5 12.0012 7.5 12.2773V15.0001H6.5V12.2773Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M10.5 6.5C10.5 5.39543 11.3954 4.5 12.5 4.5C13.6046 4.5 14.5 5.39543 14.5 6.5V15.7501C14.5 16.1643 14.1642 16.5001 13.75 16.5001H11.25C10.8358 16.5001 10.5 16.1643 10.5 15.7501V6.5ZM12.5 6C12.2239 6 12 6.22386 12 6.5V15.0001H13V6.5C13 6.22386 12.7761 6 12.5 6Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M18 8.05859C16.8954 8.05859 16 8.95402 16 10.0586V15.7501C16 16.1643 16.3358 16.5001 16.75 16.5001H19.25C19.6642 16.5001 20 16.1643 20 15.7501V10.0586C20 8.95402 19.1046 8.05859 18 8.05859ZM17.5 10.0586C17.5 9.78245 17.7239 9.55859 18 9.55859C18.2761 9.55859 18.5 9.78245 18.5 10.0586V15.0001H17.5V10.0586Z" fill="currentColor"/>
          </svg>
        </button>
      )}

      <div className="flex flex-col h-full">
        {/* Position Header */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {positionConfig?.label || positionKey}
            </h3>
            {isLocked && (
              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
              </svg>
            )}
          </div>
        </div>

        {/* Selected Entity Display */}
        {selectedEntity ? (
          <div className="flex-1 flex flex-col justify-between">
            {/* Entity Avatar and Info */}
            <div className="flex items-start space-x-3 mb-3">
              {/* Avatar with injury border support */}
              <div className={`w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm flex-shrink-0 overflow-hidden border-2 ${injuryBorderClass} p-0.5`}>
                {selectedEntity.entityType === 'player' && (selectedEntity as SelectablePlayer).headshotUrl ? (
                  <img 
                    src={(selectedEntity as SelectablePlayer).headshotUrl} 
                    alt={selectedEntity.name} 
                    className="w-full h-full rounded-full object-cover" 
                  />
                ) : selectedEntity.entityType === 'team' && selectedEntity.logoUrl ? (
                  <img 
                    src={selectedEntity.logoUrl} 
                    alt={selectedEntity.name} 
                    className="w-full h-full rounded-full object-contain p-1" 
                  />
                ) : (
                  <span className="font-semibold text-gray-600 dark:text-gray-300">
                    {selectedEntity.name.substring(0, 1)}
                  </span>
                )}
              </div>
              
              {/* Entity Details */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-base mb-1">
                  {selectedEntity.name}
                </p>
                
                {/* Full team name for players, abbreviation for teams */}
                {selectedEntity.entityType === 'player' ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {(selectedEntity as SelectablePlayer).fullTeamName}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {selectedEntity.teamAbbreviation}
                  </p>
                )}
                
                {/* Opponent and Game Time */}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {opponentDisplay ? `${opponentDisplay} ${gameTimeDisplay ? `(${gameTimeDisplay})` : ''}` : 
                   (selectedEntity.byeWeek ? `BYE WEEK ${selectedEntity.byeWeek}` : 'No game this week')}
                </p>
              </div>
            </div>
            
            {/* Stats and Actions */}
            <div className="flex items-center justify-between">
              <div className="text-center">
                {(() => {
                  const displayPoints = getEntityDisplayPoints(
                    selectedEntity, 
                    hasGameStarted, 
                    actualPoints[selectedEntity.id],
                    positionKey,
                    captainSlotKey,
                    captainMultiplier
                  );
                  return (
                    <>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {displayPoints.label}
                      </div>
                                            <div className={`text-lg font-semibold ${
                        displayPoints.isCaptain
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : displayPoints.type === 'actual'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {displayPoints.points.toFixed(1)}
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Clear Button */}
              <button
                onClick={handleClearSlot}
                disabled={isLocked}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  isLocked 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                {isLocked ? 'Locked' : 'Clear'}
              </button>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-base text-gray-500 dark:text-gray-400 mb-1">
              Select {positionConfig?.label}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Click to choose
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleLineupSlot; 