import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { StoredLineupPicks, SelectableEntity, Lineup, PositionDetail, PositionKey } from '../../types/lineup'; // League removed
import { League } from '../../utils/leagues'; // League imported from correct path
import { POSITIONS_CONFIG } from '../../config/positions';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import {
  listenToStoredWeeklyLineup,
  fetchSelectablePlayerById,
  fetchSelectableTeamById,
  fetchWeeklySchedule,
  FirestoreWeeklySchedule,
} from '../../services/lineupFetchingService';
import ComponentCard from '../common/ComponentCard';
import DashboardLineupSlotDisplay from './DashboardLineupSlotDisplay';
import Button from '../ui/button/Button';
import { Link } from 'react-router';
import Spinner from '../ui/Spinner';
import { APP_CONFIG } from '../../config/appConfig';
import { Dropdown } from '../ui/dropdown/Dropdown';
import { DropdownItem } from '../ui/dropdown/DropdownItem';

interface DashboardLineupSnapshotProps {
  leagues: League[];
  selectedLeagueId: string;
  onLeagueChange: (leagueId: string) => void;
}

const DashboardLineupSnapshot: React.FC<DashboardLineupSnapshotProps> = ({ leagues, selectedLeagueId, onLeagueChange }) => {
  const { user } = useAuth();
  const [lineupPicks, setLineupPicks] = useState<StoredLineupPicks | null>(null);
  const [lineupDetails, setLineupDetails] = useState<Lineup | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [displayWeek, setDisplayWeek] = useState<number>(1);
  const [weeklySchedule, setWeeklySchedule] = useState<FirestoreWeeklySchedule | null>(null);
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);

  useEffect(() => {
    const currentNflWeek = calculateCurrentNFLWeek();
    setDisplayWeek(currentNflWeek);
  }, []);

  useEffect(() => {
    if (!user?.uid || !selectedLeagueId || !displayWeek) {
      setIsLoading(false);
      setLineupPicks(null); // Clear picks if no user/league/week
      setLineupDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setLineupPicks(null); // Clear previous picks before fetching new ones
    setLineupDetails(null); // Clear previous details

    const unsubscribeLineup = listenToStoredWeeklyLineup(
      user.uid,
      selectedLeagueId, // Use selectedLeagueId
      displayWeek,
      (data) => {
        setLineupPicks(data.picks);
      },
      (err) => {
        console.error("Error fetching lineup picks:", err);
        setError("Failed to load lineup snapshot.");
        setIsLoading(false);
      }
    );

    const loadSchedule = async () => {
      try {
        const schedule = await fetchWeeklySchedule(APP_CONFIG.CURRENT_NFL_SEASON, displayWeek);
        setWeeklySchedule(schedule);
      } catch (err) {
        console.error("Error fetching weekly schedule for dashboard:", err);
      }
    };

    loadSchedule();

    return () => {
      if (unsubscribeLineup) unsubscribeLineup();
    };
  }, [user, selectedLeagueId, displayWeek]); // Use selectedLeagueId in dependencies

  useEffect(() => {
    if (!lineupPicks || !user?.uid) {
        if(!lineupPicks && weeklySchedule) { 
            setLineupDetails({}); 
            setIsLoading(false);
        }
      return;
    }
    if (!weeklySchedule) {
        return;
    }

    const resolveLineupDetails = async () => {
      setIsLoading(true);
      const resolvedDetails: Lineup = {};
      const positionKeys = Object.keys(lineupPicks) as Array<keyof StoredLineupPicks>;

      for (const positionKey of positionKeys) {
        const pick = lineupPicks[positionKey];
        if (pick) {
          let entityDetail: SelectableEntity | null = null;
          if (pick.type === 'player') {
            entityDetail = await fetchSelectablePlayerById(pick.id, undefined, weeklySchedule);
          } else if (pick.type === 'team') {
            entityDetail = await fetchSelectableTeamById(pick.id, positionKey as PositionDetail['key'], undefined, weeklySchedule);
          }
          if (entityDetail) {
            resolvedDetails[positionKey] = entityDetail;
          }
        }
      }
      setLineupDetails(resolvedDetails);
      setIsLoading(false);
    };

    if (lineupPicks && weeklySchedule) {
        resolveLineupDetails();
    } else if (lineupPicks === null && weeklySchedule) { 
        setLineupDetails({});
        setIsLoading(false);
    }

  }, [lineupPicks, weeklySchedule, user?.uid]);

  if (!user) return <p>Please log in to see your lineup.</p>;
  // Simplified initial loading check
  if (isLoading && (!lineupDetails || Object.keys(lineupDetails).length === 0) && !error ) return <Spinner/>; 

  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);
  const leagueDisplayName = selectedLeague ? selectedLeague.name : "Select League";

  const leagueSelector = leagues.length > 1 ? (
    <div className="relative inline-block">
      <button
        onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
        className="inline-flex items-center justify-between w-full gap-2 px-4 py-3 text-sm font-medium text-gray-700 rounded-lg dropdown-toggle bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        style={{ minWidth: '150px', maxWidth: '150px' }}
      >
        <span className="truncate">{leagueDisplayName}</span>
        <svg
          className={`duration-200 ease-in-out stroke-current ${
            isLeagueDropdownOpen ? "rotate-180" : ""
          }`}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.79199 7.396L10.0003 12.6043L15.2087 7.396"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isLeagueDropdownOpen}
        onClose={() => setIsLeagueDropdownOpen(false)}
        className="absolute left-0 top-full z-40 mt-2 w-full min-w-[200px] rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-[#1E2635]"
      >
        <ul className="flex flex-col gap-1">
          {leagues.map((league) => (
            <DropdownItem
              key={league.id}
              onClick={() => {
                onLeagueChange(league.id);
                setIsLeagueDropdownOpen(false);
              }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-sm font-medium 
                          ${selectedLeagueId === league.id 
                            ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400' 
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'}`}
            >
              {league.name}
            </DropdownItem>
          ))}
        </ul>
      </Dropdown>
    </div>
  ) : null;

  return (
    <ComponentCard title={`Your Lineup - Week ${displayWeek}`} headerControls={leagueSelector}>
      {isLoading && (!lineupDetails || Object.keys(lineupDetails).length === 0) && (
        <div className="flex justify-center items-center py-6">
          <Spinner />
          <p className="ml-2">Loading lineup...</p>
        </div>
      )}
      {!isLoading && error && <p className="text-red-500 p-4">{error}</p>}
      {!isLoading && !error && (
        <div className="space-y-1">
          {POSITIONS_CONFIG.map((position: PositionDetail) => {
            const selectedEntityForSlot = lineupDetails ? lineupDetails[position.key as PositionKey] : null;
            return (
              <DashboardLineupSlotDisplay
                key={`${selectedLeagueId}-${position.key}`}
                position={position}
                selectedEntity={selectedEntityForSlot}
              />
            );
          })}
          { !isLoading && ((lineupDetails && Object.keys(lineupDetails).length === 0) || lineupPicks === null) && (
             <p className="p-4 text-center text-gray-500 dark:text-gray-400">
                Your lineup for Week {displayWeek} is empty or not set for this league.
            </p>
          )}
        </div>
      )}
       <div className="mt-4 p-1 text-center">
        <Link to={`/leagues/${selectedLeagueId}/lineup/${displayWeek}`}> 
          <Button variant="outline" size="sm">
            Manage Lineup
          </Button>
        </Link>
      </div>
    </ComponentCard>
  );
};

export default DashboardLineupSnapshot; 