import React from 'react';
import { SelectableEntity, SelectablePlayer, InjuryStatus, PositionKey } from '../../types/lineup';
import Button from '../ui/button/Button';
import { POSITIONS_CONFIG } from '../../config/positions';
import { MAX_USAGE_COUNT } from '../../config/appConfig';
// Placeholder for an icon, e.g., from lucide-react or a custom SVG
// import { Info } from 'lucide-react';

// Lock Icon SVG - Can be shared or moved to a common UI icons file later
const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
  </svg>
);

interface EntityDisplayCardProps {
  entity: SelectableEntity;
  onSelect: (entity: SelectableEntity) => void;
  onViewStats?: (entity: SelectableEntity) => void;
  currentlySelectedEntityId?: string;
  isTeamSelectedInOtherSlot?: boolean;
  otherSlotKey?: PositionKey | null;
  isLocked?: boolean;
  isOnByeWeekForSelectedWeek?: boolean;
}

const getInjuryBorderColor = (status?: InjuryStatus['status']): string => {
  if (!status) return 'border-transparent'; // Default or no border if no status
  switch (status) {
    case 'Healthy':
      return 'border-green-500';
    case 'Questionable':
      return 'border-yellow-500'; // Changed to yellow for Questionable
    case 'Doubtful':
      return 'border-orange-500'; // Changed to orange for Doubtful
    case 'Out':
    case 'IR':
    case 'PUP':
    case 'Suspended':
      return 'border-red-500';
    default:
      return 'border-gray-300'; // A neutral border for unhandled cases
  }
};

const formatGameTime = (epoch?: number): string | null => {
  if (!epoch) return null;
  try {
    const date = new Date(epoch * 1000); // Epoch is in seconds, Date expects ms
    const day = date.toLocaleDateString(undefined, { weekday: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `(${day} ${time})`; // Added parentheses
  } catch (e) {
    console.error("Error formatting game time:", e);
    return null; // Gracefully handle potential errors with date formatting
  }
};

const EntityDisplayCard: React.FC<EntityDisplayCardProps> = ({ entity, onSelect, onViewStats, currentlySelectedEntityId, isTeamSelectedInOtherSlot, otherSlotKey, isLocked, isOnByeWeekForSelectedWeek }) => {
  const isPlayer = (e: SelectableEntity): e is SelectablePlayer => e.entityType === 'player';

  const handleSelect = () => {
    if (isLocked || isOnByeWeekForSelectedWeek) return; // Cannot select if locked OR on bye week
    // Do not select if usage limit is reached and it's not the one already selected
    if (entity.usageCount >= MAX_USAGE_COUNT && entity.id !== currentlySelectedEntityId) return;
    onSelect(entity);
  };

  const handleShowStats = () => {
    if (onViewStats) {
      onViewStats(entity);
    }
  };

  const injuryBorderClass = isPlayer(entity) && entity.injuryStatus ? getInjuryBorderColor(entity.injuryStatus.status) : 'border-transparent';
  // Prioritize week-specific game time, fallback to generic gameTimeEpoch
  const gameTimeDisplay = formatGameTime(entity.gameTimeEpochForWeek ?? entity.gameTimeEpoch);
  // Determine opponent to display, prioritizing week-specific
  const opponentDisplay = entity.opponentForWeek || entity.nextOpponent;

  const isCurrentlySelectedForThisSlot = entity.id === currentlySelectedEntityId;

  let buttonText = "Add to Lineup";
  let buttonVariant: "primary" | "outline" = "primary";
  let buttonDisabled = false;
  let buttonClassName = "w-auto";

  if (isLocked) {
    buttonText = "Game Started";
    buttonVariant = "outline";
    buttonClassName = "w-auto border-gray-400 text-gray-500 dark:border-gray-600 dark:text-gray-500 cursor-not-allowed flex items-center gap-2";
    buttonDisabled = true;
  } else if (isOnByeWeekForSelectedWeek) {
    buttonText = "BYE Week";
    buttonVariant = "outline";
    buttonClassName = "w-auto border-gray-400 text-gray-500 dark:border-gray-600 dark:text-gray-500 cursor-not-allowed";
    buttonDisabled = true;
  } else if (isCurrentlySelectedForThisSlot) {
    buttonText = "Selected";
    buttonVariant = "outline";
    buttonClassName = "w-auto border-green-500 text-green-600 dark:border-green-400 dark:text-green-400 cursor-default";
    buttonDisabled = true;
  } else if (entity.entityType === 'team' && isTeamSelectedInOtherSlot) {
    const otherSlotLabel = otherSlotKey ? POSITIONS_CONFIG.find(p => p.key === otherSlotKey)?.label.substring(0,3).toUpperCase() : 'Slot';
    buttonText = `In ${otherSlotLabel || 'Use'}`;
    buttonVariant = "outline";
    buttonClassName = "w-auto border-gray-400 text-gray-500 dark:border-gray-500 dark:text-gray-400 cursor-not-allowed";
    buttonDisabled = true;
  } else if (entity.usageCount >= MAX_USAGE_COUNT) {
    buttonText = "Limit Reached";
    buttonVariant = "outline";
    buttonClassName = "w-auto border-orange-400 text-orange-500 dark:border-orange-500 dark:text-orange-400 cursor-not-allowed";
    buttonDisabled = true;
  }

  const cardClasses = [
    "relative p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors shadow-sm flex flex-col justify-between",
    (isLocked || isOnByeWeekForSelectedWeek) ? "opacity-60 cursor-not-allowed" : ""
  ].join(" ");

  return (
    <div className={cardClasses}>
      {/* Stats Icon Button - Top Right */}
      <button 
      onClick={handleShowStats} aria-label="Show stats"
      className="absolute top-3 right-3 flex items-center justify-center w-full h-10 text-gray-500 transition-colors border border-gray-200 rounded-lg max-w-10 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800">
          <svg width="20" height="20" viewBox="0 0 24 24" color='currentColor' fill="none" xmlns="http://www.w3.org/2000/svg" transform="rotate(0 0 0)">
            <path d="M3.5 5.25C3.5 4.83579 3.16421 4.5 2.75 4.5C2.33579 4.5 2 4.83579 2 5.25V17.25C2 18.4926 3.00736 19.5 4.25 19.5H21.25C21.6642 19.5 22 19.1642 22 18.75C22 18.3358 21.6642 18 21.25 18H4.25C3.83579 18 3.5 17.6642 3.5 17.25V5.25Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M7 10.2773C5.89543 10.2773 5 11.1728 5 12.2773V15.7501C5 16.1643 5.33579 16.5001 5.75 16.5001H8.25C8.66421 16.5001 9 16.1643 9 15.7501V12.2773C9 11.1728 8.10457 10.2773 7 10.2773ZM6.5 12.2773C6.5 12.0012 6.72386 11.7773 7 11.7773C7.27614 11.7773 7.5 12.0012 7.5 12.2773V15.0001H6.5V12.2773Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M10.5 6.5C10.5 5.39543 11.3954 4.5 12.5 4.5C13.6046 4.5 14.5 5.39543 14.5 6.5V15.7501C14.5 16.1643 14.1642 16.5001 13.75 16.5001H11.25C10.8358 16.5001 10.5 16.1643 10.5 15.7501V6.5ZM12.5 6C12.2239 6 12 6.22386 12 6.5V15.0001H13V6.5C13 6.22386 12.7761 6 12.5 6Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M18 8.05859C16.8954 8.05859 16 8.95402 16 10.0586V15.7501C16 16.1643 16.3358 16.5001 16.75 16.5001H19.25C19.6642 16.5001 20 16.1643 20 15.7501V10.0586C20 8.95402 19.1046 8.05859 18 8.05859ZM17.5 10.0586C17.5 9.78245 17.7239 9.55859 18 9.55859C18.2761 9.55859 18.5 9.78245 18.5 10.0586V15.0001H17.5V10.0586Z" fill="currentColor"/>
        </svg>
        </button>
      <div>
        <div className="flex items-start space-x-3 mb-2">
          <div className={`w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm border-2 ${injuryBorderClass} p-0.5 flex-shrink-0`}>
            {isPlayer(entity) && entity.headshotUrl ? (
              <img src={entity.headshotUrl} alt={entity.name} className="w-full h-full rounded-full object-cover" />
            ) : !isPlayer(entity) && entity.logoUrl ? (
              <img src={entity.logoUrl} alt={entity.name} className="w-full h-full rounded-full object-contain" />
            ) : (
              entity.name.substring(0, 1)
            )}
          </div>
          <div className="flex-1 pr-8">
            <p className="font-semibold text-gray-800 dark:text-white leading-tight">{entity.name}</p>
            {isPlayer(entity) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{entity.fullTeamName}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {opponentDisplay ? `${opponentDisplay} ${gameTimeDisplay || ''}` : (entity.byeWeek ? `BYE WEEK ${entity.byeWeek}` : 'No game this week')}
            </p>
            {isPlayer(entity) && entity.injuryStatus && entity.injuryStatus.status !== 'Healthy' && (
              <p className={`text-xs font-semibold mt-1 ${
                entity.injuryStatus.status === 'Questionable' ? 'text-yellow-600 dark:text-yellow-400' :
                entity.injuryStatus.status === 'Doubtful' ? 'text-orange-600 dark:text-orange-400' :
                'text-red-600 dark:text-red-400' // For Out, IR, etc.
              }`}>
                {entity.injuryStatus.status}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mt-3 mb-3 text-xs">
          <div className="flex items-center">
            <span className="text-gray-500 dark:text-gray-400 mr-2">Usage:</span>
            <div className="flex space-x-1">
              {[...Array(MAX_USAGE_COUNT)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < entity.usageCount ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                ></div>
              ))}
            </div>
          </div>

          <div className="text-right">
            <span className="text-gray-500 dark:text-gray-400 block mb-0.5 text-base">PPG</span>
            <span className="font-semibold text-lg text-gray-800 dark:text-gray-100">{entity.actualPPG.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <Button 
          variant={buttonVariant} 
          size="sm" 
          onClick={handleSelect} 
          className={buttonClassName}
          disabled={buttonDisabled}
        >
          {isLocked && <LockIcon />} 
          {buttonText}
        </Button>
      </div>
    </div>
  );
};

export default EntityDisplayCard; 