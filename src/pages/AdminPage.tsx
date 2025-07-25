// src/pages/AdminPage.tsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FunctionsError } from 'firebase/functions';
import {
  manualUpdateTeamsAndPlayersCallable,
  addAdminRoleCallable,
  manualFetchAndProcessGameStatsForWeekCallable,
  manualFetchWeeklyScheduleCallable,
  createWeeklyTipsCallable
} from '../firebase/callables';
import Button from '../components/ui/button/Button';
import PageMeta from '../components/common/PageMeta';
import PageBreadcrumb from '../components/common/PageBreadCrumb';
import Alert from "../components/ui/alert/Alert";
import ComponentCard from "../components/common/ComponentCard";
import { APP_CONFIG } from '../config/appConfig';
import { fetchWeeklySchedule, GameInfoFromSchedule } from '../services/lineupFetchingService';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '../components/ui/table';
import Label from '../components/form/Label';
import Input from '../components/form/input/InputField';
import Select from '../components/form/Select';
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';

// Type Guard for Firebase Functions errors
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();

  // --- Loading States ---
  const [updateTeamsLoading, setUpdateTeamsLoading] = useState(false);
  const [adminRoleLoading, setAdminRoleLoading] = useState(false);
  const [processStatsLoading, setProcessStatsLoading] = useState(false);
  const [fetchScheduleLoading, setFetchScheduleLoading] = useState(false);
  const [createTipsLoading, setCreateTipsLoading] = useState(false);

  // --- Input States ---
  const [targetUid, setTargetUid] = useState('');
  const [processWeek, setProcessWeek] = useState('');
  const [scheduleWeek, setScheduleWeek] = useState('');
  const [tipsLeagueId, setTipsLeagueId] = useState('');
  const [tipsWeek, setTipsWeek] = useState('');

  // --- Feedback States ---
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for Mock Data Creator - Schedule
  const [mockSeason, setMockSeason] = useState<string>(APP_CONFIG.CURRENT_NFL_SEASON);
  const [mockWeek, setMockWeek] = useState<string>('1');
  const [fetchedGames, setFetchedGames] = useState<GameInfoFromSchedule[]>([]);
  const [isLoadingMockSchedule, setIsLoadingMockSchedule] = useState<boolean>(false);
  const [mockScheduleError, setMockScheduleError] = useState<string | null>(null);

  // State for inline editing of game time
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameTimeEpoch, setEditingGameTimeEpoch] = useState<string>("");
  const [editingGameDateTimeString, setEditingGameDateTimeString] = useState<string>("");

  // State for Mock Entity Game Stats
  const [mockStatsEntityType, setMockStatsEntityType] = useState<'player' | 'team' | '' >('');
  const [mockStatsEntityId, setMockStatsEntityId] = useState<string>("");
  const [mockStatsGameId, setMockStatsGameId] = useState<string>("");
  const [mockStatsJson, setMockStatsJson] = useState<string>("{\n  \"fantasyPoints\": \"0.0\"\n}"); // Default with basic structure
  const [isLoadingMockStats, setIsLoadingMockStats] = useState<boolean>(false);
  const [mockStatsError, setMockStatsError] = useState<string | null>(null);
  const [mockStatsSuccessMessage, setMockStatsSuccessMessage] = useState<string | null>(null);

  // --- Error Handling Helper ---
  const handleFirebaseError = (err: unknown, action: string): string => {
      // Error during action - logging for debugging
      if (isFunctionsError(err)) {
        switch (err.code) {
          case 'functions/unauthenticated': return "Authentication error. Please log in again.";
          case 'functions/permission-denied': return "Permission Denied: You are not authorized.";
          case 'functions/invalid-argument': return `Invalid input: ${err.message}`;
          case 'functions/not-found': return `Not found: ${err.message}`;
          case 'functions/internal': return `Server error: ${err.message}. Check function logs.`;
          default: return `Error (${err.code}): ${err.message}`;
        }
      } else if (err instanceof Error) {
        return err.message;
      }
      return `An unexpected error occurred during ${action}.`;
  };


  // --- Callable Function Handlers ---

  const triggerUpdateTeamsPlayers = async () => {
    setMessage(null); setError(null); setUpdateTeamsLoading(true);
    try {
      // USE IMPORTED CALLABLE
      // const updateFunction = httpsCallable<EmptyInput, GenericResult>(functions, 'manualUpdateTeamsAndPlayers');
      // Calling manualUpdateTeamsAndPlayers...
      const result = await manualUpdateTeamsAndPlayersCallable(); // EmptyInput is undefined, so no arg or pass {} if defined as object
      // Function result logged for debugging
      setMessage(result.data.message || "Team/Player update completed.");
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'data update');
      setError(errorMessage);
    } finally { setUpdateTeamsLoading(false); }
  };

  const handleMakeAdmin = async () => {
    if (!targetUid.trim()) { setError("Please enter a User ID."); return; }
    setMessage(null); setError(null); setAdminRoleLoading(true);
    try {
      // USE IMPORTED CALLABLE
      // const addAdminFunction = httpsCallable<AdminRoleInput, GenericResult>(functions, 'addAdminRole');
      // Calling addAdminRole for UID...
      const result = await addAdminRoleCallable({ uid: targetUid.trim() }); // Uses AdminRolePayload
      // Function result logged for debugging
      setMessage(result.data.message || `Successfully added admin role.`);
      setTargetUid(''); // Clear input on success
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'adding admin role');
      setError(errorMessage);
    } finally { setAdminRoleLoading(false); }
  };

  const triggerProcessGameStats = async () => {
    setMessage(null); setError(null);
    const weekNum = parseInt(processWeek, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
        setError("Please enter valid week (1-18) for stats processing."); return;
    }
    setProcessStatsLoading(true);
    try {
        // USE IMPORTED CALLABLE
        // const processStatsFunction = httpsCallable<WeekInput, GenericResult>(functions, 'manualFetchAndProcessGameStatsForWeek');
        // Calling manualFetchAndProcessGameStatsForWeek week...
        const result = await manualFetchAndProcessGameStatsForWeekCallable({ week: weekNum }); // Uses FetchStatsOrSchedulePayload
        setMessage(result.data.message || "Stats processing complete.");
        if (!result.data.success) setError(result.data.message);
    } catch (err: unknown) {
        const errorMessage = handleFirebaseError(err, 'processing game stats');
        setError(errorMessage);
    } finally {
        setProcessStatsLoading(false);
    }
  };

  const triggerFetchSchedule = async () => {
    setMessage(null); setError(null);
    const weekNum = parseInt(scheduleWeek, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
      setError("Please enter a valid week number (1-18) to fetch the schedule.");
      return;
    }
    setFetchScheduleLoading(true);
    try {
      // USE IMPORTED CALLABLE
      // const fetchScheduleFunction = httpsCallable<WeekInput, GenericResult>(functions, 'manualFetchWeeklySchedule');
      // Calling manualFetchWeeklySchedule for week...
      const result = await manualFetchWeeklyScheduleCallable({ week: weekNum }); // Uses FetchStatsOrSchedulePayload
      // Function result logged for debugging
      setMessage(result.data.message || "Schedule fetch process completed.");
      if (!result.data.success && result.data.message) {
        setError(result.data.message);
      }
    } catch (err: unknown) {
      // Error calling manualFetchWeeklySchedule - logged for debugging
      const errorMessage = handleFirebaseError(err, 'fetching schedule');
      setError(errorMessage);
    } finally {
      setFetchScheduleLoading(false);
    }
  };

  const handleFetchMockSchedule = async () => {
    setIsLoadingMockSchedule(true);
    setMockScheduleError(null);
    setFetchedGames([]);
    setEditingGameId(null); // Reset editing state on new fetch
    try {
      const seasonNum = parseInt(mockSeason, 10);
      const weekNum = parseInt(mockWeek, 10);
      if (isNaN(seasonNum) || isNaN(weekNum)) {
        setMockScheduleError("Season and Week must be valid numbers.");
        setIsLoadingMockSchedule(false);
        return;
      }
      const scheduleData = await fetchWeeklySchedule(seasonNum, weekNum);
      if (scheduleData && scheduleData.games) {
        setFetchedGames(scheduleData.games);
      } else {
        setMockScheduleError("No schedule data found for the selected season/week.");
      }
    } catch (err) {
      // Error fetching mock schedule - logged for debugging
      setMockScheduleError(handleFirebaseError(err, "fetching mock schedule"));
    } finally {
      setIsLoadingMockSchedule(false);
    }
  };

  const handleEditGameTime = (game: GameInfoFromSchedule) => {
    setEditingGameId(game.gameID);
    const currentEpoch = typeof game.gameTime_epoch === 'string' ? parseInt(game.gameTime_epoch, 10) : game.gameTime_epoch;
    setEditingGameTimeEpoch(String(currentEpoch || ""));
    if (currentEpoch) {
      const date = new Date(currentEpoch * 1000);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      setEditingGameDateTimeString(`${year}-${month}-${day}T${hours}:${minutes}`);
    } else {
      setEditingGameDateTimeString("");
    }
    setMockScheduleError(null); 
    setMessage(null);
  };

  const handleCancelEditGameTime = () => {
    setEditingGameId(null);
    setEditingGameTimeEpoch("");
    setEditingGameDateTimeString("");
  };

  const handleSaveGameTime = async () => {
    if (!editingGameId || !mockSeason || !mockWeek) return;
    setMessage(null); 
    setMockScheduleError(null);

    const newEpoch = parseInt(editingGameTimeEpoch, 10);
    if (isNaN(newEpoch)) {
      setMockScheduleError("Invalid epoch time format.");
      return;
    }

    setIsLoadingMockSchedule(true); 

    try {
      const scheduleDocRef = doc(db, "nfl_schedules", `${mockSeason}_week_${mockWeek}`);
      const scheduleSnap = await getDoc(scheduleDocRef);

      if (!scheduleSnap.exists()) {
        setMockScheduleError("Schedule document not found. Cannot update.");
        setIsLoadingMockSchedule(false);
        return;
      }

      const scheduleData = scheduleSnap.data();
      const gamesArray = scheduleData.games as GameInfoFromSchedule[];
      const gameIndex = gamesArray.findIndex(g => g.gameID === editingGameId);

      if (gameIndex === -1) {
        setMockScheduleError("Game not found in schedule. Cannot update.");
        setIsLoadingMockSchedule(false);
        return;
      }

      const updatedGamesArray = gamesArray.map((game, index) => 
        index === gameIndex ? { ...game, gameTime_epoch: newEpoch } : game
      );
      
      await updateDoc(scheduleDocRef, { games: updatedGamesArray });

      setFetchedGames(updatedGamesArray);
      handleCancelEditGameTime(); 
      setMessage("Game time updated successfully!");

    } catch (err) {
      // Error updating game time - logged for debugging
      setMockScheduleError(handleFirebaseError(err, "updating game time"));
    } finally {
      setIsLoadingMockSchedule(false);
    }
  };
  
  const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateTimeValue = e.target.value;
    setEditingGameDateTimeString(dateTimeValue);
    if (dateTimeValue) {
      const epoch = Math.floor(new Date(dateTimeValue).getTime() / 1000);
      setEditingGameTimeEpoch(String(epoch));
    } else {
      setEditingGameTimeEpoch("");
    }
  };

  const handleEpochTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const epochValue = e.target.value;
    setEditingGameTimeEpoch(epochValue);
    if (epochValue && !isNaN(parseInt(epochValue, 10))) {
      const date = new Date(parseInt(epochValue, 10) * 1000);
      // Ensure date is valid before trying to format it
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        setEditingGameDateTimeString(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setEditingGameDateTimeString(""); // Invalid epoch, clear datetime string
      }
    } else if (!epochValue) {
        setEditingGameDateTimeString("");
    }
  };

  const handleFetchExistingMockStats = async () => {
    // Clear previous messages
    setMockStatsError(null);
    setMockStatsSuccessMessage(null);

    if (!mockStatsEntityType || !mockStatsEntityId.trim() || !mockStatsGameId.trim()) {
      setMockStatsError("Please select entity type and enter Entity ID and Game ID.");
      return;
    }
    setIsLoadingMockStats(true);
    setMockStatsJson("{\n  \"fantasyPoints\": \"0.0\"\n}"); // Reset on new fetch

    const collectionName = mockStatsEntityType === 'player' ? 'players' : 'teams';
    const docPath = `${collectionName}/${mockStatsEntityId.trim()}/gamestats/${mockStatsGameId.trim()}`;

    try {
      const statDocRef = doc(db, docPath);
      const docSnap = await getDoc(statDocRef);
      if (docSnap.exists()) {
        setMockStatsJson(JSON.stringify(docSnap.data(), null, 2));
        setMockStatsSuccessMessage("Existing stats fetched.");
      } else {
        setMockStatsError("No existing stats found for this entity/game. You can create new stats.");
      }
    } catch (err) {
      // Error fetching existing mock stats - logged for debugging
      setMockStatsError(handleFirebaseError(err, "fetching existing mock stats"));
    } finally {
      setIsLoadingMockStats(false);
    }
  };

  const handleSaveMockStats = async () => {
    // Clear previous messages
    setMockStatsError(null);
    setMockStatsSuccessMessage(null);

    if (!mockStatsEntityType || !mockStatsEntityId.trim() || !mockStatsGameId.trim() || !mockSeason.trim() || !mockWeek.trim()) {
      setMockStatsError("Entity Type, Entity ID, Game ID, Season, and Week are required.");
      return;
    }
    let parsedStats;
    try {
      parsedStats = JSON.parse(mockStatsJson);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      setMockStatsError("Invalid JSON format for stats.");
      return;
    }

    setIsLoadingMockStats(true);

    const collectionName = mockStatsEntityType === 'player' ? 'players' : 'teams';
    const docPath = `${collectionName}/${mockStatsEntityId.trim()}/gamestats/${mockStatsGameId.trim()}`;
    
    // Define a more specific type for the base structure of statsToSave
    interface BaseMockStatData {
      gameId: string;
      season: number;
      week: number;
      lastUpdated: Date;
    }

    const statsToSave: BaseMockStatData & Record<string, unknown> = {
      gameId: mockStatsGameId.trim(), 
      season: parseInt(mockSeason, 10),
      week: parseInt(mockWeek, 10),
      lastUpdated: new Date(), 
      ...parsedStats,
    };

    if (mockStatsEntityType === 'player' && typeof statsToSave.fantasyPoints === 'string') {
        statsToSave.fantasyPoints = parseFloat(statsToSave.fantasyPoints);
    } else if (mockStatsEntityType === 'team') {
        if (typeof statsToSave.fantasyPointsPassing === 'string') statsToSave.fantasyPointsPassing = parseFloat(statsToSave.fantasyPointsPassing);
        if (typeof statsToSave.fantasyPointsRushing === 'string') statsToSave.fantasyPointsRushing = parseFloat(statsToSave.fantasyPointsRushing);
        if (typeof statsToSave.fantasyPointsDefense === 'string') statsToSave.fantasyPointsDefense = parseFloat(statsToSave.fantasyPointsDefense);
        if (typeof statsToSave.fantasyPointsSpecialTeams === 'string') statsToSave.fantasyPointsSpecialTeams = parseFloat(statsToSave.fantasyPointsSpecialTeams);
    }

    try {
      const statDocRef = doc(db, docPath);
      await setDoc(statDocRef, statsToSave); 
      setMockStatsSuccessMessage("Mock stats saved successfully!");
    } catch (err) {
      // Error saving mock stats - logged for debugging
      setMockStatsError(handleFirebaseError(err, "saving mock stats"));
    } finally {
      setIsLoadingMockStats(false);
    }
  };

  const triggerCreateWeeklyTips = async () => {
    if (!tipsLeagueId.trim()) { setError("Please enter a League ID."); return; }
    const weekNum = parseInt(tipsWeek, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
        setError("Please enter valid week (1-18) for tips creation."); return;
    }
    
    setMessage(null); setError(null); setCreateTipsLoading(true);
    try {
      const result = await createWeeklyTipsCallable({ 
        leagueId: tipsLeagueId.trim(), 
        week: weekNum 
      });
      setMessage(result.data.message || "Weekly tips poll created successfully.");
      setTipsLeagueId(''); // Clear inputs on success
      setTipsWeek('');
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'creating weekly tips');
      setError(errorMessage);
    } finally { 
      setCreateTipsLoading(false); 
    }
  };

  // --- Render Logic ---

  // Loading/Auth Checks
  if (authLoading) { return <p className='p-4 text-center'>Loading authentication...</p>; }
  if (!user) { return <p className='p-4 text-center text-red-600'>Please log in to access the Admin Panel.</p>; }
  if (!isAdmin) {
    return (
      <div className="p-4 text-center">
        <h1 className='text-xl font-bold text-red-600'>Access Denied</h1>
        <p className='text-gray-600 dark:text-gray-400'>You do not have permission to view this page.</p>
      </div>
    );
  }

  // Admin Page Content
  return (
    <>
      <div>
      <PageMeta title="Admin Panel | Easy Fantasy" description='Admin control panel for Easy Fantasy application.' />
      <PageBreadcrumb pageTitle="Admin Panel" />
      <div className="space-y-5 sm:space-y-6 mb-4">
        {/* General Feedback Area */}
        {message && (
          <Alert
            variant="success"
            title="Success Message"
            message={message}
            showLink={false}
          />
        )}
        {error && (
          <Alert
            variant="error"
            title="Error Message"
            message={error}
            showLink={false}
          />
        )}
        
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-5 sm:space-y-6">
          <ComponentCard title='Fetch Weekly Schedule'>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually fetch the weekly game schedule from the external API and store it in Firestore for a specific week.
            </p>
            <div className="flex items-end space-x-3">
                 <div className="flex-grow">
                   <Label htmlFor="scheduleWeekInput">NFL Week (1-18):</Label>
                   <Input
                        id="scheduleWeekInput" type="number"
                        inputMode="numeric"
                        value={scheduleWeek}
                        onChange={(e) => setScheduleWeek(e.target.value)}
                        placeholder="Enter week number" min="1" max="18"
                        disabled={fetchScheduleLoading}
                        className="w-full"
                    />
                 </div>
                 <Button
                    onClick={triggerFetchSchedule}
                    disabled={fetchScheduleLoading || !scheduleWeek.trim()}
                    className="shrink-0"
                >
                    {fetchScheduleLoading ? "Fetching Schedule..." : "Fetch Schedule"}
                </Button>
            </div>
          </ComponentCard>

          <ComponentCard title='Process Game Stats & Scores'>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually fetch raw box scores from the external API, store API-calculated player points, calculate custom team unit points, and sync live game scores for all games in a specific week.
            </p>
            <div className="flex items-end space-x-3">
                 <div className="flex-grow">
                   <Label htmlFor="processWeekInput">NFL Week (1-18):</Label>
                   <Input
                        id="processWeekInput" type="number"
                        inputMode="numeric"
                        value={processWeek}
                        onChange={(e) => setProcessWeek(e.target.value)}
                        placeholder="Enter week number" min="1" max="18"
                        disabled={processStatsLoading}
                        className="w-full"
                    />
                 </div>
                 <Button
                    onClick={triggerProcessGameStats}
                    disabled={processStatsLoading || !processWeek.trim()}
                    className="shrink-0"
                >
                    {processStatsLoading ? "Processing..." : "Process Stats & Scores"}
                </Button>
            </div>
          </ComponentCard>
        </div>
        <div className="space-y-6">
          <ComponentCard title='Sync Teams & Players'>
              <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                  Manually trigger the update process for NFL teams (info, schedule, season stats) and player rosters (info, season stats, injury data) from the external API. Marks inactive players.
              </p>
              <Button onClick={triggerUpdateTeamsPlayers} disabled={updateTeamsLoading}>
                  {updateTeamsLoading ? "Updating Data..." : "Update Teams & Players Now"}
              </Button>
          </ComponentCard>
          
          <ComponentCard title='Create Weekly Tips Poll'>
              <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                  Create a weekly game tipping poll for a specific league and week. This fetches NFL games and betting odds for users to make predictions.
              </p>
              <div className="space-y-3">
                  <div>
                      <Label htmlFor="tipsLeagueIdInput">League ID:</Label>
                      <Input
                          id="tipsLeagueIdInput"
                          type="text"
                          value={tipsLeagueId}
                          onChange={(e) => setTipsLeagueId(e.target.value)}
                          placeholder="Enter League ID"
                          disabled={createTipsLoading}
                          className="w-full"
                      />
                  </div>
                  <div>
                      <Label htmlFor="tipsWeekInput">NFL Week (1-18):</Label>
                      <Input
                          id="tipsWeekInput"
                          type="number"
                          value={tipsWeek}
                          onChange={(e) => setTipsWeek(e.target.value)}
                          placeholder="Enter week number"
                          min="1"
                          max="18"
                          disabled={createTipsLoading}
                          className="w-full"
                      />
                  </div>
                  <Button 
                      onClick={triggerCreateWeeklyTips} 
                      disabled={createTipsLoading || !tipsLeagueId.trim() || !tipsWeek.trim()}
                      className="w-full"
                  >
                      {createTipsLoading ? "Creating Tips Poll..." : "Create Tips Poll"}
                  </Button>
              </div>
          </ComponentCard>
          
          <ComponentCard title='Assign Admin Role'>
          <div className="space-y-2">
               <Label htmlFor="targetUidInput">User ID to make Admin:</Label>
               <Input
                    id="targetUidInput"
                    type="text"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    placeholder="Enter User UID"
                    disabled={adminRoleLoading}
                    className="w-full"
                />
            </div>
             <Button onClick={handleMakeAdmin} disabled={adminRoleLoading || !targetUid.trim()} className="mt-3">
                 {adminRoleLoading ? "Assigning..." : "Make Admin"}
             </Button>
          </ComponentCard>
        </div>
      </div>

      {/* New Mock Data Management Card */}
      <ComponentCard title="Mock Data Management" className="mt-6">
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">Weekly Game Schedule</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="mockSeason">Season</Label>
              <Input
                id="mockSeason"
                type="number"
                value={mockSeason}
                onChange={(e) => setMockSeason(e.target.value)}
                placeholder={`e.g., ${APP_CONFIG.CURRENT_NFL_SEASON}`}
              />
            </div>
            <div>
              <Label htmlFor="mockWeek">Week</Label>
              <Input
                id="mockWeek"
                type="number"
                value={mockWeek}
                onChange={(e) => setMockWeek(e.target.value)}
                placeholder="e.g., 1"
              />
            </div>
            <Button
              onClick={handleFetchMockSchedule}
              disabled={isLoadingMockSchedule}
              className="w-full md:w-auto"
            >
              {isLoadingMockSchedule ? 'Fetching...' : 'Fetch Schedule'}
            </Button>
          </div>

          {mockScheduleError && <p className="text-red-500 dark:text-red-400 text-sm">{mockScheduleError}</p>}

          {fetchedGames.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Game ID</TableCell>
                    <TableCell isHeader>Home Team</TableCell>
                    <TableCell isHeader>Away Team</TableCell>
                    <TableCell isHeader>Game Time Epoch</TableCell>
                    <TableCell isHeader>Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fetchedGames.map((game) => (
                    <TableRow key={game.gameID}>
                      <TableCell>{game.gameID}</TableCell>
                      <TableCell>{game.home || game.teamIDHome}</TableCell>
                      <TableCell>{game.away || game.teamIDAway}</TableCell>
                      <TableCell>
                        {editingGameId === game.gameID ? (
                          <div className="space-y-1">
                            <Input 
                              type="datetime-local" 
                              value={editingGameDateTimeString} 
                              onChange={handleDateTimeChange}
                              className="text-xs p-1 w-full max-w-xs"
                            />
                            <Input 
                              type="number" 
                              value={editingGameTimeEpoch} 
                              onChange={handleEpochTimeChange}
                              placeholder="Epoch seconds"
                              className="text-xs p-1 w-full max-w-xs mt-1"
                            />
                          </div>
                        ) : (
                          String(game.gameTime_epoch)
                        )}
                      </TableCell>
                      <TableCell>
                        {editingGameId === game.gameID ? (
                          <div className="flex space-x-1 items-center">
                            <Button size="sm" variant="primary" onClick={handleSaveGameTime} disabled={isLoadingMockSchedule} className="text-xs">
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEditGameTime} disabled={isLoadingMockSchedule} className="text-xs">
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleEditGameTime(game)} disabled={isLoadingMockSchedule} className="text-xs">
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* New Mock Entity Game Stats Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Mock Entity Game Stats</h4>
            
            {/* Combined feedback for this section */}
            {mockStatsError && !mockStatsSuccessMessage && (
              <p className="text-red-500 dark:text-red-400 text-sm mb-3 py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{mockStatsError}</p>
            )}
            {mockStatsSuccessMessage && (
              <p className="text-green-500 dark:text-green-400 text-sm mb-3 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{mockStatsSuccessMessage}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Entity Type*</Label>
                <Select
                  options={[{ value: 'player', label: 'Player' }, { value: 'team', label: 'Team' }]}
                  onChange={(value) => {
                    setMockStatsEntityType(value as 'player' | 'team' | '');
                    setMockStatsError(null); // Clear errors on change
                    setMockStatsSuccessMessage(null);
                  }}
                  placeholder="Select Type..."
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="mockStatsEntityId">Entity ID*</Label>
                <Input 
                  id="mockStatsEntityId" 
                  value={mockStatsEntityId} 
                  onChange={(e) => {
                    setMockStatsEntityId(e.target.value); 
                    setMockStatsError(null);
                    setMockStatsSuccessMessage(null);
                  }}
                  placeholder="e.g., 12345 or KC"
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="mockStatsGameId">Game ID* (from schedule)</Label>
                <Input 
                  id="mockStatsGameId" 
                  value={mockStatsGameId} 
                  onChange={(e) => {
                    setMockStatsGameId(e.target.value); 
                    setMockStatsError(null);
                    setMockStatsSuccessMessage(null);
                  }}
                  placeholder="e.g., 2023101_NYJ@DEN"
                  className="w-full"
                />
              </div>
            </div>
            <div className="mb-4">
              <Label htmlFor="mockStatsJson">
                Stats JSON* (Uses Season: {mockSeason}, Week: {mockWeek} from above for context)
              </Label>
              <textarea
                id="mockStatsJson"
                rows={10}
                value={mockStatsJson}
                onChange={(e) => {
                  setMockStatsJson(e.target.value);
                  setMockStatsError(null); // Clear potential JSON parse error on change
                  setMockStatsSuccessMessage(null);
                }}
                className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                placeholder={'{\n  "fantasyPoints": "15.5",\n  "nflTeamId": "PLAYER_TEAM_ID_HERE", \n  "Passing": { "passYds": "200", "passTD": "2" },\n  "Rushing": { "rushYds": "50", "rushTD": "1" }\n}'}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Note: `gameId`, `season`, and `week` will be automatically set based on the form inputs above. Any values for these in the JSON will be overridden.
                For players, include `nflTeamId` if applicable.
              </p>
            </div>
            <div className="flex space-x-3">
              <Button onClick={handleFetchExistingMockStats} disabled={isLoadingMockStats} variant="outline">
                {isLoadingMockStats && mockStatsEntityType ? 'Fetching...' : 'Fetch Existing Stats'} {/* Dynamic loading text */}
              </Button>
              <Button onClick={handleSaveMockStats} disabled={isLoadingMockStats}>
                {isLoadingMockStats ? 'Saving...' : 'Save Mock Stats'}
              </Button>
            </div>
          </div>
        </div>
      </ComponentCard>
      </div>
    </>
  );
}
