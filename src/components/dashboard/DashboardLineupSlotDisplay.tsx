import React from 'react';
import {
  PositionDetail,
  SelectableEntity,
  SelectablePlayer,
  InjuryStatus,
  PlayerGameStatRaw,
  TeamGameStatDetail,
} from '../../types/lineup';
import { useEntityGameStats } from '../../hooks/useEntityGameStats';

interface DashboardLineupSlotDisplayProps {
  position: PositionDetail;
  selectedEntity: SelectableEntity | null | undefined;
}

// Helper function to determine if the entity is a player
const isPlayer = (entity: SelectableEntity): entity is SelectablePlayer => entity.entityType === 'player';

// Helper function to get injury border color (adapted from EntityDisplayCard.tsx)
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

// Helper function to format game time (adapted from EntityDisplayCard.tsx, no parentheses)
const formatGameTime = (epoch?: number): string | null => {
  if (!epoch) return null;
  try {
    const date = new Date(epoch * 1000);
    const day = date.toLocaleDateString(undefined, { weekday: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} ${time}`;
  } catch (e) {
    console.error("Error formatting game time:", e);
    return null;
  }
};

// Function to determine game status (adapted from LineupSlotCard)
const getGameStatus = (gameTimeEpochForWeek?: number, gameDurationHours: number = 3.75): 'Upcoming' | 'Live' | 'Final' | 'NoGame' => {
  if (gameTimeEpochForWeek === undefined || gameTimeEpochForWeek === null) {
    return 'NoGame';
  }
  const nowEpoch = Date.now() / 1000; // Current time in seconds
  const gameStartEpoch = gameTimeEpochForWeek;
  const gameEndEpoch = gameStartEpoch + (gameDurationHours * 60 * 60); // Game ends roughly 3.75 hours after start

  if (nowEpoch < gameStartEpoch) {
    return 'Upcoming';
  }
  if (nowEpoch >= gameStartEpoch && nowEpoch <= gameEndEpoch) {
    return 'Live';
  }
  if (nowEpoch > gameEndEpoch) {
    return 'Final';
  }
  return 'NoGame'; // Should not be reached if logic is correct
};

const DashboardLineupSlotDisplay: React.FC<DashboardLineupSlotDisplayProps> = ({ position, selectedEntity }) => {
  const injuryBorderClass = selectedEntity && isPlayer(selectedEntity) && selectedEntity.injuryStatus 
                            ? getInjuryBorderColor(selectedEntity.injuryStatus.status) 
                            : 'border-transparent';
  const gameTimeDisplay = selectedEntity?.gameTimeEpochForWeek ? formatGameTime(selectedEntity.gameTimeEpochForWeek) : null;
  const gameStatus = selectedEntity ? getGameStatus(selectedEntity.gameTimeEpochForWeek) : 'NoGame';

  // Use the hook to get live game stats
  const { stats: liveGameStats, loading: statsLoading } = useEntityGameStats({
    entityId: selectedEntity?.id,
    entityType: selectedEntity?.entityType,
    gameId: selectedEntity?.gameIdForWeek,
  });

  let pointsColorClass = "text-gray-800 dark:text-white";
  if (gameStatus === 'Live') {
    pointsColorClass = "text-brand-500 dark:text-brand-400"; // Assuming brand-500 is your primary color
  }
  // For 'Final' or 'Upcoming' or 'NoGame', it will use the default pointsColorClass

  let displayPoints: number | undefined | null = undefined;
  if (liveGameStats) {
    if (selectedEntity?.entityType === 'player' && 'fantasyPoints' in liveGameStats) {
      displayPoints = (liveGameStats as PlayerGameStatRaw).fantasyPoints;
    } else if (selectedEntity?.entityType === 'team') {
      const teamStats = liveGameStats as TeamGameStatDetail;
      switch (position.key) {
        case 'PassingOffense': displayPoints = teamStats.fantasyPointsPassing; break;
        case 'RushingOffense': displayPoints = teamStats.fantasyPointsRushing; break;
        case 'Defense': displayPoints = teamStats.fantasyPointsDefense; break;
        case 'SpecialTeams': displayPoints = teamStats.fantasyPointsSpecialTeams; break;
        default: displayPoints = undefined;
      }
    }
  } else if (!statsLoading && selectedEntity?.actualFantasyPoints !== undefined) {
    // Fallback to initially fetched points if hook has no stats yet and is not loading
    // This can be useful if the gamestat doc doesn't exist yet but points were pre-calculated elsewhere (less common)
    displayPoints = selectedEntity.actualFantasyPoints;
  }

  return (
    <div className="flex items-center p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors duration-150 ease-in-out">
      <div className={`relative w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm border-2 ${injuryBorderClass} p-0.5 flex-shrink-0 mr-3`}>
        {selectedEntity ? (
          isPlayer(selectedEntity) && selectedEntity.headshotUrl ? (
            <img src={selectedEntity.headshotUrl} alt={selectedEntity.name} className="w-full h-full rounded-full object-cover" />
          ) : !isPlayer(selectedEntity) && selectedEntity.logoUrl ? (
            <img src={selectedEntity.logoUrl} alt={selectedEntity.name} className="w-full h-full rounded-full object-contain p-1" />
          ) : (
            <span className="text-gray-500 dark:text-gray-400 font-semibold">{selectedEntity.name.substring(0, 1)}</span>
          )
        ) : (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{position.key}</span>
        )}
      </div>

      <div className="flex-grow min-w-0">
        {selectedEntity ? (
          <>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {position.label} 
            </p>
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
              {selectedEntity.name}
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1 flex-wrap">
              <span>
                {selectedEntity.teamAbbreviation}
              </span>
              {selectedEntity.opponentForWeek && (
                <span>{selectedEntity.opponentForWeek}</span>
              )}
              {gameTimeDisplay && (
                <span className="whitespace-nowrap">({gameTimeDisplay})</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">{position.label} - Empty</p>
        )}
      </div>

      {selectedEntity && (
        <div className="text-right ml-2 flex-shrink-0 w-20"> {/* Increased width for status text */}
          <p className={`text-sm font-bold ${pointsColorClass}`}>
            {statsLoading && displayPoints === undefined ? '...' : (displayPoints?.toFixed(2) ?? '--.--')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {gameStatus !== 'NoGame' && gameStatus !== 'Upcoming' ? gameStatus : 'PTS'} {/* Show status or PTS */}
          </p>
        </div>
      )}
       {/* Optional: Small injury icon for players if needed and status is not Healthy */}
       {selectedEntity && isPlayer(selectedEntity) && selectedEntity.injuryStatus && selectedEntity.injuryStatus.status !== 'Healthy' && (
         <div className={`ml-1 w-2 h-2 rounded-full ${getInjuryBorderColor(selectedEntity.injuryStatus.status).replace('border-', 'bg-')}`}></div>
      )}
    </div>
  );
};

export default DashboardLineupSlotDisplay; 