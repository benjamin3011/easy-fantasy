import React from 'react';
import Button from '../ui/button/Button'; // Assuming you have a Button component
import { PositionDetail, PositionKey, SelectableEntity, SelectablePlayer, InjuryStatus, PlayerGameStatRaw, TeamGameStatDetail } from '../../types/lineup';
import Badge from '../ui/badge/Badge'; // Import the Badge component
import { useEntityGameStats } from '../../hooks/useEntityGameStats'; // Import the hook

// Lock Icon SVG
const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
  </svg>
);

interface LineupSlotCardProps {
  position: PositionDetail;
  selectedItem?: SelectableEntity;
  isLocked?: boolean;
  onAddClick: (positionKey: PositionKey) => void;
  onClearClick: (positionKey: PositionKey) => void;
  // Captain feature related props
  enableCaptainFeature?: boolean;
  designatedCaptainSlotKey?: PositionKey | null;
  onDesignateCaptainSlot?: (positionKey: PositionKey | null) => void;
  onViewStatsClick?: (entity: SelectableEntity) => void;
  onViewGameStatsClick?: (entity: SelectableEntity, positionKey: PositionKey) => void;
}

// Helper function to determine game status
const getGameStatus = (gameTimeEpochForWeek?: number, gameDurationHours: number = 3.5): 'Upcoming' | 'Live' | 'Final' | 'NoGame' => {
  if (gameTimeEpochForWeek === undefined || gameTimeEpochForWeek === null) {
    return 'NoGame';
  }
  const nowInSeconds = Date.now() / 1000;
  const gameEndTimeEpoch = gameTimeEpochForWeek + (gameDurationHours * 60 * 60);

  if (nowInSeconds < gameTimeEpochForWeek) {
    return 'Upcoming';
  }
  if (nowInSeconds >= gameTimeEpochForWeek && nowInSeconds < gameEndTimeEpoch) {
    return 'Live';
  }
  return 'Final';
};

// Copied from EntityDisplayCard.tsx
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

const formatGameTimeShort = (epoch?: number): string | null => {
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

const LineupSlotCard: React.FC<LineupSlotCardProps> = ({ 
  position, 
  selectedItem, 
  isLocked, 
  onAddClick, 
  onClearClick, 
  enableCaptainFeature, 
  designatedCaptainSlotKey, 
  onDesignateCaptainSlot,
  onViewStatsClick, 
  onViewGameStatsClick
}) => {
  const isPlayer = (item: SelectableEntity): item is SelectablePlayer => item.entityType === 'player';

  const gameStatus = getGameStatus(selectedItem?.gameTimeEpochForWeek);
  const gameTimeDisplay = selectedItem?.gameTimeEpochForWeek ? formatGameTimeShort(selectedItem.gameTimeEpochForWeek) : null;
  
  // Determine opponent to display, prioritizing week-specific
  const opponentDisplay = selectedItem?.opponentForWeek || selectedItem?.nextOpponent;

  // Determine injury border and status text
  const injuryBorderClass = selectedItem && isPlayer(selectedItem) && selectedItem.injuryStatus 
    ? getInjuryBorderColor(selectedItem.injuryStatus.status) 
    : 'border-transparent';
  
  // Mobile-first card classes with better spacing and larger touch targets
  const cardClasses = [
    "bg-white dark:bg-gray-800 shadow-lg rounded-xl p-4 sm:p-4 flex flex-col justify-between min-h-[200px] sm:min-h-[220px] relative transition-all duration-200",
    "border border-gray-200 dark:border-gray-700",
    isLocked ? "cursor-not-allowed opacity-75" : "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
  ].join(" ");

  const handleMainButtonClick = () => {
    if (isLocked) return;
    onAddClick(position.key);
  };

  const handleClearButtonClick = () => {
    if (isLocked) return;
    onClearClick(position.key);
  }

  const handleSetCaptainClick = () => {
    if (isLocked || !selectedItem || !isPlayer(selectedItem) || position.type !== 'player' || !onDesignateCaptainSlot) return;

    if (isThisSlotTheDesignatedCaptain) {
      onDesignateCaptainSlot(null);
    } else {
      onDesignateCaptainSlot(position.key);
    }
  };

  const isThisSlotTheDesignatedCaptain = enableCaptainFeature && designatedCaptainSlotKey === position.key;

  const { stats: liveGameStats, loading: statsLoading, error: statsError } = useEntityGameStats({
    entityId: selectedItem?.id,
    entityType: selectedItem?.entityType,
    gameId: selectedItem?.gameIdForWeek,
    positionKey: selectedItem?.entityType === 'team' ? position.key : undefined,
  });

  // Handle stats error, e.g., log it or display a message
  if (statsError) {
    console.error("Error fetching live game stats for LineupSlotCard:", statsError);
    // Optionally, you could set a state here to show an error message in the UI
  }

  return (
    <div className={cardClasses}>
      {isLocked && (
        <div className="absolute top-3 left-3 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md">
          <LockIcon />
        </div>
      )}
      {selectedItem && onViewStatsClick && !isLocked && (
        <button 
          onClick={() => onViewStatsClick(selectedItem)} 
          aria-label="Show stats"
          className="absolute top-3 right-3 flex items-center justify-center w-10 h-10 text-gray-500 transition-colors border border-gray-200 rounded-full hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" color='currentColor' fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 5.25C3.5 4.83579 3.16421 4.5 2.75 4.5C2.33579 4.5 2 4.83579 2 5.25V17.25C2 18.4926 3.00736 19.5 4.25 19.5H21.25C21.6642 19.5 22 19.1642 22 18.75C22 18.3358 21.6642 18 21.25 18H4.25C3.83579 18 3.5 17.6642 3.5 17.25V5.25Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M7 10.2773C5.89543 10.2773 5 11.1728 5 12.2773V15.7501C5 16.1643 5.33579 16.5001 5.75 16.5001H8.25C8.66421 16.5001 9 16.1643 9 15.7501V12.2773C9 11.1728 8.10457 10.2773 7 10.2773ZM6.5 12.2773C6.5 12.0012 6.72386 11.7773 7 11.7773C7.27614 11.7773 7.5 12.0012 7.5 12.2773V15.0001H6.5V12.2773Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M10.5 6.5C10.5 5.39543 11.3954 4.5 12.5 4.5C13.6046 4.5 14.5 5.39543 14.5 6.5V15.7501C14.5 16.1643 14.1642 16.5001 13.75 16.5001H11.25C10.8358 16.5001 10.5 16.1643 10.5 15.7501V6.5ZM12.5 6C12.2239 6 12 6.22386 12 6.5V15.0001H13V6.5C13 6.22386 12.7761 6 12.5 6Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M18 8.05859C16.8954 8.05859 16 8.95402 16 10.0586V15.7501C16 16.1643 16.3358 16.5001 16.75 16.5001H19.25C19.6642 16.5001 20 16.1643 20 15.7501V10.0586C20 8.95402 19.1046 8.05859 18 8.05859ZM17.5 10.0586C17.5 9.78245 17.7239 9.55859 18 9.55859C18.2761 9.55859 18.5 9.78245 18.5 10.0586V15.0001H17.5V10.0586Z" fill="currentColor"/>
          </svg>
        </button>
      )}
      
      {/* Position Header with Captain Badge */}
      <div className="text-center mb-3">
        <h3 className="text-lg sm:text-base font-semibold text-gray-700 dark:text-gray-200 inline-block">
          {position.label}
        </h3>
        {isThisSlotTheDesignatedCaptain && selectedItem && isPlayer(selectedItem) && (
          <span className="ml-2">
            <Badge variant="light" color="primary" size="sm">
              C
            </Badge>
          </span>
        )}
      </div>

      {selectedItem ? (
        <div className="flex-grow flex flex-col">
          {/* Mobile: Horizontal Layout, Desktop: Vertical Layout */}
          <div className="flex sm:flex-col sm:items-center sm:text-center">
            {/* Player/Team Avatar */}
            <div className={`w-14 h-14 sm:w-14 sm:h-14 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-lg sm:text-xl mb-0 sm:mb-2 mr-3 sm:mr-0 overflow-hidden flex-shrink-0 border-2 ${injuryBorderClass} p-0.5`}>
              {isPlayer(selectedItem) && selectedItem.headshotUrl ? (
                <img src={selectedItem.headshotUrl} alt={selectedItem.name} className="w-full h-full rounded-full object-cover" />
              ) : !isPlayer(selectedItem) && selectedItem.logoUrl ? (
                <img src={selectedItem.logoUrl} alt={selectedItem.name} className="w-full h-full rounded-full object-contain p-1" />
              ) : (
                selectedItem.name.substring(0, 1).toUpperCase()
              )}
            </div>
            
            {/* Player Info - Right side on mobile, centered on desktop */}
            <div className="flex-1 sm:flex-none sm:w-full">
              {/* Player/Team Name */}
              <h4 className="text-base sm:text-md font-semibold text-brand-700 dark:text-brand-500 truncate mb-1 sm:text-center" title={selectedItem.name}>
                {selectedItem.name}
              </h4>
              
              {/* Team Name for Players */}
              {isPlayer(selectedItem) && (
                <p className="text-xs sm:text-xs text-gray-500 dark:text-gray-400 mb-1 sm:text-center">
                  {selectedItem.fullTeamName}
                </p>
              )}
              
              {/* Opponent and Game Time */}
              {opponentDisplay && (
                <p className="text-xs sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:text-center">
                  {opponentDisplay} {gameTimeDisplay ? <span className="text-gray-400 dark:text-gray-500">({gameTimeDisplay})</span> : ''}
                </p>
              )}
              
              {/* Fantasy Points */}
              <p className={`text-sm sm:text-sm font-bold flex items-center sm:justify-center ${gameStatus === 'Live' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-200'}`}>
                {(() => {
                  if (!selectedItem) return "—"; // No item selected

                  let currentPoints: number | undefined | null = undefined;

                  // Prioritize parent-provided actualFantasyPoints (includes captain bonus) over hook data
                  if (selectedItem.actualFantasyPoints !== undefined) {
                    currentPoints = selectedItem.actualFantasyPoints;
                  } else if (liveGameStats) {
                    if (selectedItem.entityType === 'player' && 'fantasyPoints' in liveGameStats) {
                      currentPoints = (liveGameStats as PlayerGameStatRaw).fantasyPoints;
                    } else if (selectedItem.entityType === 'team') {
                      const teamStats = liveGameStats as TeamGameStatDetail;
                      switch (position.key) {
                        case 'PassingOffense': currentPoints = teamStats.fantasyPointsPassing; break;
                        case 'RushingOffense': currentPoints = teamStats.fantasyPointsRushing; break;
                        case 'Defense': currentPoints = teamStats.fantasyPointsDefense; break;
                        case 'SpecialTeams': currentPoints = teamStats.fantasyPointsSpecialTeams; break;
                        default: currentPoints = undefined;
                      }
                    }
                  }
                  
                  if (gameStatus === 'Live' || gameStatus === 'Final') {
                    const pointsToShow = currentPoints !== undefined && currentPoints !== null 
                                          ? currentPoints.toFixed(2) 
                                          : (statsLoading ? '...' : '0.00');
                    const isCaptainBonus = isThisSlotTheDesignatedCaptain && selectedItem.entityType === 'player';
                    
                    return (
                      <>
                        {pointsToShow} PTS
                        {isCaptainBonus && (
                          <span className="ml-1 text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                            ⭐
                          </span>
                        )}
                        {onViewGameStatsClick && selectedItem && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              onViewGameStatsClick(selectedItem, position.key);
                            }}
                            aria-label="View game stats breakdown"
                            className="ml-2 text-gray-400 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400 p-1 rounded-full focus:outline-none focus:ring-1 focus:ring-brand-500 active:scale-95"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </>
                    );
                  } else if (gameStatus === 'Upcoming') {
                    return selectedItem?.actualPPG !== undefined ? `${selectedItem.actualPPG.toFixed(1)} PPG` : "0.0 PPG";
                  } else { 
                    return "—"; 
                  }
                })()}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center">
          <div className="w-20 h-20 sm:w-14 sm:h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3 sm:mb-2">
            <svg className="w-8 h-8 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <p className="text-gray-400 dark:text-gray-500 text-base sm:text-sm">Empty Slot</p>
        </div>
      )}

      {/* Action Buttons - Larger touch targets on mobile */}
      <div className="mt-auto pt-4 sm:pt-3 w-full flex items-center gap-3 sm:gap-2">
        <Button
          variant={selectedItem ? "outline" : "primary"}
          size="md"
          className={`w-full text-base sm:text-sm min-h-[48px] sm:min-h-[40px] py-4 sm:py-3.5 ${selectedItem ? 'flex-grow' : ''}`}
          onClick={handleMainButtonClick}
          disabled={isLocked}
        >
          {isLocked && selectedItem ? "Locked" : (selectedItem ? 'Change' : `+ Add ${position.label.split(' ')[0]}`)}
        </Button>
        
        {selectedItem && (
          <button 
            onClick={handleClearButtonClick}
            disabled={isLocked}
            className={`flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 text-gray-500 transition-all duration-200 border border-gray-200 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 active:scale-95 ${
              isLocked 
                ? 'cursor-not-allowed opacity-50' 
                : 'hover:text-error-500 dark:hover:text-error-500 hover:border-error-300 dark:hover:border-error-600'
            }`}
          >
            <svg className="fill-current w-5 h-5 sm:w-4 sm:h-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M6.54118 3.7915C6.54118 2.54886 7.54854 1.5415 8.79118 1.5415H11.2078C12.4505 1.5415 13.4578 2.54886 13.4578 3.7915V4.0415H15.6249H16.6658C17.08 4.0415 17.4158 4.37729 17.4158 4.7915C17.4158 5.20572 17.08 5.5415 16.6658 5.5415H16.3749V8.24638V13.2464V16.2082C16.3749 17.4508 15.3676 18.4582 14.1249 18.4582H5.87492C4.63228 18.4582 3.62492 17.4508 3.62492 16.2082V13.2464V8.24638V5.5415H3.33325C2.91904 5.5415 2.58325 5.20572 2.58325 4.7915C2.58325 4.37729 2.91904 4.0415 3.33325 4.0415H4.37492H6.54118V3.7915ZM14.8749 13.2464V8.24638V5.5415H13.4578H12.7078H7.29118H6.54118H5.12492V8.24638V13.2464V16.2082C5.12492 16.6224 5.46071 16.9582 5.87492 16.9582H14.1249C14.5391 16.9582 14.8749 16.6224 14.8749 16.2082V13.2464ZM8.04118 4.0415H11.9578V3.7915C11.9578 3.37729 11.6221 3.0415 11.2078 3.0415H8.79118C8.37696 3.0415 8.04118 3.37729 8.04118 3.7915V4.0415ZM8.33325 7.99984C8.74747 7.99984 9.08325 8.33562 9.08325 8.74984V13.7498C9.08325 14.1641 8.74747 14.4998 8.33325 14.4998C7.91904 14.4998 7.58325 14.1641 7.58325 13.7498V8.74984C7.58325 8.33562 7.91904 7.99984 8.33325 7.99984ZM12.4166 8.74984C12.4166 8.33562 12.0808 7.99984 11.6666 7.99984C11.2524 7.99984 10.9166 8.33562 10.9166 8.74984V13.7498C10.9166 14.1641 11.2524 14.4998 11.6666 14.4998C12.0808 14.4998 12.4166 14.1641 12.4166 13.7498V8.74984Z" fill="" />
            </svg>
          </button>
        )}
        
        {enableCaptainFeature && selectedItem && isPlayer(selectedItem) && position.type === 'player' && onDesignateCaptainSlot && (
          <button 
            onClick={handleSetCaptainClick}
            disabled={isLocked}
            title={isThisSlotTheDesignatedCaptain ? "Remove Captain status from this slot" : "Make this slot Captain"}
            aria-label={isThisSlotTheDesignatedCaptain ? "Remove Captain status from this slot" : "Make this slot Captain"}
            className={`flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 text-gray-500 transition-all duration-200 border border-gray-200 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 active:scale-95 ${
              isLocked 
                ? 'cursor-not-allowed opacity-50' 
                : isThisSlotTheDesignatedCaptain 
                  ? 'border-yellow-500 dark:border-yellow-400 text-yellow-500 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' 
                  : 'hover:text-yellow-500 dark:hover:text-yellow-400 hover:border-yellow-300 dark:hover:border-yellow-600'
            }`}
          >
            <svg className="fill-current w-5 h-5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 3.75C12.2163 3.75 12.4221 3.84339 12.5645 4.00621L16.7116 8.74719L20.775 5.42099C21.0116 5.22731 21.342 5.19665 21.6102 5.3435C21.8784 5.49035 22.0306 5.78531 21.9949 6.08898L20.6507 17.5129C20.5174 18.646 19.5571 19.5 18.4162 19.5H5.58388C4.44295 19.5 3.48261 18.646 3.34929 17.5129L2.00516 6.08898C1.96943 5.78531 2.12162 5.49035 2.38981 5.3435C2.658 5.19665 2.98849 5.22731 3.22509 5.42099L7.28842 8.74719L11.4355 4.00621C11.5779 3.84339 11.7837 3.75 12 3.75ZM12 5.63914L7.93953 10.2811C7.6731 10.5857 7.21308 10.624 6.89995 10.3677L3.71188 7.75795L4.46183 14.1319H19.5382L20.2882 7.75795L17.1001 10.3677C16.787 10.624 16.3269 10.5857 16.0605 10.2811L12 5.63914ZM19.3617 15.6319H4.63832L4.83902 17.3376C4.88346 17.7153 5.20357 18 5.58388 18H18.4162C18.7965 18 19.1166 17.7153 19.161 17.3376L19.3617 15.6319Z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default LineupSlotCard; 