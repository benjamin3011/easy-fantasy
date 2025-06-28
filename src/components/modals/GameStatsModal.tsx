import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/modal';
import Spinner from '../ui/Spinner';
import Button from '../ui/button/Button';
import { 
  SelectableEntity, 
  PositionKey, 
  SelectablePlayer, 
  SelectableTeam, 
  PlayerGameStatRaw,
  TeamGameStatDetail,
  DetailedGameStatsType
} from '../../types/lineup';
import { fetchDetailedGameStatsForEntity } from '../../services/lineupFetchingService';

interface GameStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: SelectableEntity | null;
  gameId: string | null;
  weekNumber: number | null;
  positionKeyContext?: PositionKey | null;
}

const isPlayer = (entity: SelectableEntity): entity is SelectablePlayer => entity.entityType === 'player';
const isTeam = (entity: SelectableEntity): entity is SelectableTeam => entity.entityType === 'team';

const GameStatsModal: React.FC<GameStatsModalProps> = ({
  isOpen,
  onClose,
  entity,
  gameId,
  weekNumber,
  positionKeyContext,
}) => {
  const [detailedGameStats, setDetailedGameStats] = useState<DetailedGameStatsType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && entity && gameId && weekNumber) {
      const fetchStats = async () => {
        setIsLoading(true);
        setError(null);
        setDetailedGameStats(null);
        try {
          const stats = await fetchDetailedGameStatsForEntity(
            entity.id,
            entity.entityType,
            gameId
          );
          if (stats) {
            setDetailedGameStats(stats as DetailedGameStatsType); // Cast to the defined type
          } else {
            setError("No game stats found for this entity and game.");
          }
        } catch (err) {
          console.error("Error fetching game stats:", err);
          setError("Failed to load game stats. Please try again.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchStats();
    } else if (!isOpen) {
      setDetailedGameStats(null);
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen, entity, gameId, weekNumber, positionKeyContext]); // Added positionKeyContext to deps if it influences fetching/display indirectly

  const renderPlayerStats = (stats: PlayerGameStatRaw) => {
    if (!stats) return <p>No detailed stats available for this player.</p>;

    const rawStats = stats.rawBoxScoreStats;
    if (!rawStats) return <p>Raw box score stats are missing for this player.</p>;

    const { Passing, Rushing, Receiving, Kicking, Defense, Fumbles } = rawStats;
    const displayFantasyPoints = typeof stats.fantasyPoints === 'number' 
      ? stats.fantasyPoints.toFixed(1) 
      : (rawStats.fantasyPoints ? parseFloat(rawStats.fantasyPoints).toFixed(1) : "N/A");

    return (
      <div className="space-y-3 text-sm">
        <p className="text-lg font-semibold text-brand-600 dark:text-brand-500">Fantasy Points: {displayFantasyPoints}</p>
        
        {Passing && (
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Passing</h4>
            <p>Yards: {Passing.passYds || '0'}, TDs: {Passing.passTD || '0'}, INTs: {Passing.int || '0'}</p>
            <p>Attempts: {Passing.passAttempts || '0'}, Completions: {Passing.passCompletions || '0'}</p>
          </div>
        )}
        {Rushing && (
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Rushing</h4>
            <p>Yards: {Rushing.rushYds || '0'}, TDs: {Rushing.rushTD || '0'}, Carries: {Rushing.carries || '0'}</p>
          </div>
        )}
        {Receiving && (
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Receiving</h4>
            <p>Yards: {Receiving.recYds || '0'}, TDs: {Receiving.recTD || '0'}, Receptions: {Receiving.receptions || '0'}, Targets: {Receiving.targets || '0'}</p>
          </div>
        )}
        {Kicking && (
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Kicking</h4>
            <p>FG Made: {Kicking.fgMade || '0'}, XP Made: {Kicking.xpMade || '0'}</p>
            <p>FG Att: {Kicking.fgAttempts || '0'}, XP Att: {Kicking.xpAttempts || '0'}</p>
          </div>
        )}
        {Defense && ( 
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Defense (IDP)</h4>
            <p>Tackles: {Defense.totalTackles || '0'}, Sacks: {Defense.sacks || '0'}, INTs: {Defense.defensiveInterceptions || '0'}, TDs: {Defense.defTD || '0'}</p>
          </div>
        )}
        {Fumbles && (
          <div>
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Fumbles</h4>
            <p>Total: {Fumbles.fumbles || '0'}, Lost: {Fumbles.fumblesLost || '0'}</p>
          </div>
        )}
        {stats.apiFantasyPointsDefault && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">API Default Scores (Reference)</h4>
            <p>Standard: {stats.apiFantasyPointsDefault.standard?.toFixed(1) ?? 'N/A'}, PPR: {stats.apiFantasyPointsDefault.ppr?.toFixed(1) ?? 'N/A'}, Half PPR: {stats.apiFantasyPointsDefault.halfPpr?.toFixed(1) ?? 'N/A'}</p>
          </div>
        )}
         {rawStats.fantasyPointsDefault && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300">Raw API Default Scores (Reference)</h4>
            <p>Standard: {rawStats.fantasyPointsDefault.standard ?? 'N/A'}, PPR: {rawStats.fantasyPointsDefault.PPR ?? 'N/A'}, Half PPR: {rawStats.fantasyPointsDefault.halfPPR ?? 'N/A'}</p>
          </div>
        )}
      </div>
    );
  };

  const renderTeamStats = (stats: TeamGameStatDetail, posKey: PositionKey | null | undefined) => {
    const { rawDefBoxScoreStats, aggregatedStatsForCalc,
            fantasyPointsPassing, fantasyPointsRushing, fantasyPointsDefense, fantasyPointsSpecialTeams } = stats;

    if (!posKey) return <p>Position context not available for team stats.</p>;
    
    let content = null;

    switch (posKey) {
      case 'PassingOffense':
        content = (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-brand-600 dark:text-brand-500">Fantasy Points (Passing): {fantasyPointsPassing?.toFixed(1) ?? 'N/A'}</p>
            {aggregatedStatsForCalc?.passingStats && (
              <div>
                <p>Passing Yards: {aggregatedStatsForCalc.passingStats.totalPassingYards ?? '0'}</p>
                <p>Passing TDs: {aggregatedStatsForCalc.passingStats.totalPassingTDs ?? '0'}</p>
                <p>Interceptions Thrown: {aggregatedStatsForCalc.passingStats.totalInterceptionsThrown ?? '0'}</p>
              </div>
            )}
          </div>
        );
        break;
      case 'RushingOffense':
        content = (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-brand-600 dark:text-brand-500">Fantasy Points (Rushing): {fantasyPointsRushing?.toFixed(1) ?? 'N/A'}</p>
            {aggregatedStatsForCalc?.rushingStats && (
              <div>
                <p>Rushing Yards: {aggregatedStatsForCalc.rushingStats.totalRushingYards ?? '0'}</p>
                <p>Rushing TDs: {aggregatedStatsForCalc.rushingStats.totalRushingTDs ?? '0'}</p>
              </div>
            )}
          </div>
        );
        break;
      case 'Defense':
        content = (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-brand-600 dark:text-brand-500">Fantasy Points (Defense): {fantasyPointsDefense?.toFixed(1) ?? 'N/A'}</p>
            {rawDefBoxScoreStats && (
              <div>
                <p>Points Allowed: {rawDefBoxScoreStats.ptsAllowed || 'N/A'}</p>
                <p>Sacks: {rawDefBoxScoreStats.sacks || '0'}</p>
                <p>Interceptions: {rawDefBoxScoreStats.defensiveInterceptions || '0'}</p>
                <p>Fumbles Recovered: {rawDefBoxScoreStats.fumblesRecovered || '0'}</p>
                <p>Defensive TDs: {rawDefBoxScoreStats.defTD || '0'}</p>
                <p>Safeties: {rawDefBoxScoreStats.safeties || '0'}</p>
              </div>
            )}
          </div>
        );
        break;
      case 'SpecialTeams':
         content = (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-brand-600 dark:text-brand-500">Fantasy Points (ST): {fantasyPointsSpecialTeams?.toFixed(1) ?? 'N/A'}</p>
            {aggregatedStatsForCalc?.specialTeamsStats && (
              <div>
                <p>XP Made: {aggregatedStatsForCalc.specialTeamsStats.xpMade ?? '0'}</p>
                <p>FG Made: {aggregatedStatsForCalc.specialTeamsStats.fgMade ?? '0'}</p>
                <p>Kick Return TDs: {aggregatedStatsForCalc.specialTeamsStats.kickReturnTD ?? '0'}</p>
                <p>Punt Return TDs: {aggregatedStatsForCalc.specialTeamsStats.puntReturnTD ?? '0'}</p>
                <p>Fumble Return TDs: {aggregatedStatsForCalc.specialTeamsStats.fumbleReturnTD ?? '0'}</p>
                <p>XP Return TDs: {aggregatedStatsForCalc.specialTeamsStats.xpReturn ?? '0'}</p>
              </div>
            )}
          </div>
        );
        break;
      default:
        content = <p>Stats for this team position ({posKey}) are not specifically detailed here.</p>;
    }
    return <div className="text-sm">{content}</div>;
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} isFullscreen={true} showCloseButton={false}>
      <div className="flex flex-col w-full h-screen bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between p-4 lg:p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="game-stats-modal-title" className="text-xl lg:text-2xl font-semibold text-gray-800 dark:text-white">
            {entity?.name} - Game Stats (Week {weekNumber ?? 'N/A'})
          </h2>
          <Button 
            variant="outline"
            size="sm"
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white p-2 rounded-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="sr-only">Close modal</span>
          </Button>
        </div>

        <div className="p-4 lg:p-6 overflow-y-auto styled-scrollbar flex-grow">
          {isLoading && (
            <div className="flex justify-center items-center h-32">
              <Spinner />
              <p className="ml-2">Loading game stats...</p>
            </div>
          )}
          {error && <p className="text-red-500 dark:text-red-400">{error}</p>}
          {!isLoading && !error && detailedGameStats && entity && (
            isPlayer(entity)
              ? renderPlayerStats(detailedGameStats as PlayerGameStatRaw) // Ensure correct type is passed
              : isTeam(entity)
              ? renderTeamStats(detailedGameStats as TeamGameStatDetail, positionKeyContext) // Ensure correct type
              : <p>Unsupported entity type.</p>
          )}
           {!isLoading && !error && !detailedGameStats && entity && (
            <p>No detailed game stats available to display.</p>
          )}
        </div>

        <div className="p-4 lg:p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};

export default GameStatsModal; 