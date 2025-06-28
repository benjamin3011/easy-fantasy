import React from 'react';
import { SelectableEntity, InjuryStatus as InjuryStatusType, SelectablePlayer, RawSeasonStats, SelectableTeam, SeasonRecord, SeasonTeamStats } from '../../types/lineup';
import Button from '../ui/button/Button';
import { Modal } from '../ui/modal';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: SelectableEntity | null;
}

const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  entity,
}) => {
  const [activeTab, setActiveTab] = React.useState<'stats' | 'news' | 'injury'>('stats');

  React.useEffect(() => {
    if (isOpen) setActiveTab('stats'); // Reset to stats tab when opened
  }, [isOpen]);

  if (!isOpen || !entity) {
    return null;
  }

  const displayInjuryStatus = (injuryStatus?: InjuryStatusType): string => {
    if (!injuryStatus) return 'Healthy';
    let display = injuryStatus.status;
    if (injuryStatus.details) {
      display += ` (${injuryStatus.details})`;
    }
    return display;
  };

  const isPlayerWithStats = (entity: SelectableEntity): entity is SelectablePlayer & { rawSeasonStats: RawSeasonStats } => {
    return entity.entityType === 'player' && !!(entity as SelectablePlayer).rawSeasonStats;
  }

  const isTeamWithStats = (entity: SelectableEntity): entity is SelectableTeam & { seasonRecord?: SeasonRecord, seasonTeamStats?: SeasonTeamStats } => {
    return entity.entityType === 'team' && (!!(entity as SelectableTeam).seasonRecord || !!(entity as SelectableTeam).seasonTeamStats);
  }

  const StatItem: React.FC<{ label: string; value?: string | number }> = ({ label, value }) => {
    if (value === undefined || value === null || value === "0" || value === "0.0") return null;
    return (
      <div className="flex justify-between py-1.5 px-2 even:bg-gray-50 dark:even:bg-gray-700/30 rounded-sm">
        <span className="text-gray-600 dark:text-gray-400">{label}:</span>
        <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
      </div>
    );
  };

  const renderStatsSection = (title: string, stats?: Record<string, string | undefined>) => {
    if (!stats || Object.values(stats).every(val => val === undefined || val === null || val === "0" || val === "0.0")) return null;
    
    // Order of stats as per user's screenshot for Passing and Rushing
    const statOrder: Record<string, string[]> = {
      // Player Stats Categories
      Passing: ['passAttempts', 'passCompletions', 'passYds', 'passTD', 'int'],
      Rushing: ['carries', 'rushYds', 'rushTD'],
      Receiving: ['targets', 'receptions', 'recYds', 'recTD'],
      Defense: ['totalTackles', 'soloTackles', 'sacks', 'tfl', 'passDeflections', 'qbHits', 'defensiveInterceptions', 'fumblesRecovered', 'defTD', 'fumbles', 'fumblesLost'], // Player defense stats
      "Fantasy Points (Default)": ['PPR', 'halfPPR', 'standard'],
      
      // Team Stats Categories - matching keys from the nested SeasonTeamStats structure
      "Team Offense: Passing": ['passAttempts', 'passCompletions', 'passYds', 'passTD', 'int'], // From SeasonTeamStats.Passing
      "Team Offense: Rushing": ['carries', 'rushYds', 'rushTD'], // From SeasonTeamStats.Rushing
      "Team Offense: Receiving": ['targets', 'receptions', 'recYds', 'recTD'], // From SeasonTeamStats.Receiving
      "Team Defense": ['totalTackles', 'soloTackles', 'sacks', 'tfl', 'passDeflections', 'qbHits', 'defensiveInterceptions', 'fumblesRecovered', 'defTD', 'fumbles', 'fumblesLost', 'passingTDAllowed', 'passingYardsAllowed', 'rushingTDAllowed'], // From SeasonTeamStats.Defense
      "Team Kicking": ['fgAttempts', 'fgMade', 'fgYds', 'xpAttempts', 'xpMade'], // From SeasonTeamStats.Kicking
      "Team Punting": ['punts', 'puntYds', 'puntsin20', 'puntTouchBacks'], // From SeasonTeamStats.Punting
      // Removed generic team categories as we now point to specific sub-objects
    };

    const getLabel = (key: string): string => {
      // Convert camelCase to Title Case with spaces
      let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      // Specific label overrides
      if (key === 'passYds') label = 'Passing Yards';
      if (key === 'passTD') label = 'Passing TDs';
      if (key === 'int') label = 'Interceptions';
      if (key === 'rushYds') label = 'Rushing Yards';
      if (key === 'rushTD') label = 'Rushing TDs';
      if (key === 'recYds') label = 'Receiving Yards';
      if (key === 'recTD') label = 'Receiving TDs';
      if (key === 'tfl') label = 'Tackles for Loss';
      if (key === 'defTD') label = 'Defensive TDs';
      
      // Team stat specific labels (many are covered by camelCase or player labels already)
      if (key === 'passingTDAllowed') label = 'Passing TDs Allowed';
      if (key === 'passingYardsAllowed') label = 'Passing Yards Allowed';
      if (key === 'rushingTDAllowed') label = 'Rushing TDs Allowed';
      if (key === 'rushingYardsAllowed') label = 'Rushing Yards Allowed';
      if (key === 'fgAttempts') label = 'FG Attempts';
      if (key === 'fgMade') label = 'FG Made';
      if (key === 'fgYds') label = 'FG Yards';
      if (key === 'xpAttempts') label = 'XP Attempts';
      if (key === 'xpMade') label = 'XP Made';
      if (key === 'puntsin20') label = 'Punts Inside 20';
      if (key === 'puntTouchBacks') label = 'Punt Touchbacks';

      return label;
    };
    
    const orderedKeys = statOrder[title] || Object.keys(stats);

    return (
      <div className="mb-4">
        <h4 className="text-md font-semibold mb-1.5 text-gray-700 dark:text-gray-300 border-b dark:border-gray-600 pb-1">{title === "Fantasy Points (Default)" ? "Fantasy Points" : title}</h4>
        <div className="space-y-0.5 text-sm">
          {orderedKeys.map(key => (
            <StatItem key={key} label={getLabel(key)} value={stats[key]} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isFullscreen={true} showCloseButton={false}>
      <div 
        className="flex flex-col w-full h-screen bg-white dark:bg-gray-900 overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 lg:p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="stats-modal-title" className="text-xl lg:text-2xl font-semibold text-gray-800 dark:text-white">
            {entity.name} - Statistics
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

        {/* Tab Group */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'stats' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-900' : 'text-gray-600 dark:text-gray-300'}`}
            onClick={() => setActiveTab('stats')}
          >
            Stats
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'news' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-900' : 'text-gray-600 dark:text-gray-300'}`}
            onClick={() => setActiveTab('news')}
          >
            News
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'injury' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-900' : 'text-gray-600 dark:text-gray-300'}`}
            onClick={() => setActiveTab('injury')}
            disabled={entity.entityType !== 'player'}
          >
            Injury
          </button>
        </div>

        <div className="p-4 lg:p-6 overflow-y-auto styled-scrollbar flex-grow">
          {activeTab === 'stats' && (
            <>
              <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">Player/Team Details:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
                <div><span className="font-semibold">ID:</span> {entity.id}</div>
                <div><span className="font-semibold">Type:</span> {entity.entityType}</div>
                {entity.entityType === 'player' && entity.position && (
                  <div><span className="font-semibold">Position:</span> {entity.position}</div>
                )}
                <div><span className="font-semibold">NFL Team:</span> {entity.teamAbbreviation}</div>
                <div><span className="font-semibold">Next Opponent (Week {entity.byeWeek === undefined ? 'N/A' : entity.byeWeek }):</span> {entity.opponentForWeek || 'N/A'}</div>
                <div><span className="font-semibold">Avg. PPG:</span> {entity.actualPPG?.toFixed(1) ?? 'N/A'}</div>
                <div><span className="font-semibold">Usage Count:</span> {entity.usageCount ?? 0} / 5</div>
                {entity.entityType === 'player' && (
                  <div><span className="font-semibold">Injury Status:</span> {displayInjuryStatus(entity.injuryStatus)}</div>
                )}
              </div>

              <hr className="my-4 md:my-6 dark:border-gray-700" />

              <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-300">Season Statistics</h3>
              {isPlayerWithStats(entity) ? (
                <div className="space-y-3">
                  <StatItem label="Games Played" value={entity.rawSeasonStats.gamesPlayed} />
                  {renderStatsSection("Passing", entity.rawSeasonStats.Passing as Record<string, string | undefined>)}
                  {renderStatsSection("Rushing", entity.rawSeasonStats.Rushing as Record<string, string | undefined>)}
                  {renderStatsSection("Receiving", entity.rawSeasonStats.Receiving as Record<string, string | undefined>)}
                  {renderStatsSection("Defense", entity.rawSeasonStats.Defense as Record<string, string | undefined>)}
                  {renderStatsSection("Fantasy Points (Default)", entity.rawSeasonStats.fantasyPointsDefault as Record<string, string | undefined>)}
                </div>
              ) : isTeamWithStats(entity) ? (
                <div className="space-y-3">
                  {entity.seasonRecord && (
                    <div className="mb-4">
                      <h4 className="text-md font-semibold mb-1.5 text-gray-700 dark:text-gray-300 border-b dark:border-gray-600 pb-1">Season Record</h4>
                      <div className="space-y-0.5 text-sm">
                        <StatItem label="Wins" value={entity.seasonRecord.wins} />
                        <StatItem label="Losses" value={entity.seasonRecord.losses} />
                        <StatItem label="Ties" value={entity.seasonRecord.ties} />
                      </div>
                    </div>
                  )}
                  {entity.seasonTeamStats?.Passing && renderStatsSection("Team Offense: Passing", entity.seasonTeamStats.Passing as Record<string, string | undefined>)}
                  {entity.seasonTeamStats?.Rushing && renderStatsSection("Team Offense: Rushing", entity.seasonTeamStats.Rushing as Record<string, string | undefined>)}
                  {entity.seasonTeamStats?.Receiving && renderStatsSection("Team Offense: Receiving", entity.seasonTeamStats.Receiving as Record<string, string | undefined>)}
                  {entity.seasonTeamStats?.Defense && renderStatsSection("Team Defense", entity.seasonTeamStats.Defense as Record<string, string | undefined>)}
                  {entity.seasonTeamStats?.Kicking && renderStatsSection("Team Kicking", entity.seasonTeamStats.Kicking as Record<string, string | undefined>)}
                  {entity.seasonTeamStats?.Punting && renderStatsSection("Team Punting", entity.seasonTeamStats.Punting as Record<string, string | undefined>)}
                  {entity.seasonTeamStats && 
                    !entity.seasonTeamStats.Passing && 
                    !entity.seasonTeamStats.Rushing && 
                    !entity.seasonTeamStats.Receiving && 
                    !entity.seasonTeamStats.Defense && 
                    !entity.seasonTeamStats.Kicking && 
                    !entity.seasonTeamStats.Punting && 
                    !entity.seasonRecord && (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Detailed season statistics are not available for this team.</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">Detailed season statistics are not available for this entity.</p>
              )}
            </>
          )}

          {activeTab === 'news' && (
            <div>
              <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-300">Latest News</h3>
              {entity.latestNews ? (
                <div className="mb-4">
                  <a
                    href={entity.latestNews.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    {entity.latestNews.title}
                  </a>
                  {entity.latestNews.timestamp && (
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(entity.latestNews.timestamp * 1000).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No recent news available for this player or team.</p>
              )}
            </div>
          )}

          {activeTab === 'injury' && entity.entityType === 'player' && (
            <div>
              <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-300">Injury Information</h3>
              <div className="mb-2">
                <span className="font-semibold">Status:</span> {displayInjuryStatus(entity.injuryStatus)}
              </div>
              {entity.injuryStatus?.details && (
                <div className="mb-2">
                  <span className="font-semibold">Details:</span> {entity.injuryStatus.details}
                </div>
              )}
              {!entity.injuryStatus && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No injury information available.</p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 lg:p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};

export default StatsModal; 