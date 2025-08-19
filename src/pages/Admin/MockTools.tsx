// src/pages/Admin/MockTools.tsx
import React, { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Label from '../../components/form/Label';
import Input from '../../components/form/input/InputField';
import Button from '../../components/ui/button/Button';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '../../components/ui/table';
import { APP_CONFIG } from '../../config/appConfig';
import { fetchWeeklySchedule, GameInfoFromSchedule } from '../../services/lineupFetchingService';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function MockTools() {
  // Schedule mock state
  const [mockSeason, setMockSeason] = useState<string>(APP_CONFIG.CURRENT_NFL_SEASON);
  const [mockWeek, setMockWeek] = useState<string>('1');
  const [fetchedGames, setFetchedGames] = useState<GameInfoFromSchedule[]>([]);
  const [isLoadingMockSchedule, setIsLoadingMockSchedule] = useState<boolean>(false);
  const [mockScheduleError, setMockScheduleError] = useState<string | null>(null);

  // Inline edit state
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameTimeEpoch, setEditingGameTimeEpoch] = useState<string>('');
  const [editingGameDateTimeString, setEditingGameDateTimeString] = useState<string>('');

  // Mock stats state
  const [mockStatsEntityType, setMockStatsEntityType] = useState<'player' | 'team' | ''>('');
  const [mockStatsEntityId, setMockStatsEntityId] = useState<string>('');
  const [mockStatsGameId, setMockStatsGameId] = useState<string>('');
  const [mockStatsJson, setMockStatsJson] = useState<string>(`{\n  "fantasyPoints": "0.0"\n}`);
  const [isLoadingMockStats, setIsLoadingMockStats] = useState<boolean>(false);
  const [mockStatsError, setMockStatsError] = useState<string | null>(null);
  const [mockStatsSuccessMessage, setMockStatsSuccessMessage] = useState<string | null>(null);

  const handleFetchMockSchedule = async () => {
    setIsLoadingMockSchedule(true);
    setMockScheduleError(null);
    setFetchedGames([]);
    setEditingGameId(null);
    try {
      const seasonNum = parseInt(mockSeason, 10);
      const weekNum = parseInt(mockWeek, 10);
      if (isNaN(seasonNum) || isNaN(weekNum)) {
        setMockScheduleError('Season and Week must be valid numbers.');
        setIsLoadingMockSchedule(false);
        return;
      }
      const scheduleData = await fetchWeeklySchedule(seasonNum, weekNum);
      if (scheduleData && scheduleData.games) {
        setFetchedGames(scheduleData.games);
      } else {
        setMockScheduleError('No schedule data found for the selected season/week.');
      }
    } catch (err) {
      setMockScheduleError(err instanceof Error ? err.message : 'Failed to fetch mock schedule');
    } finally {
      setIsLoadingMockSchedule(false);
    }
  };

  const handleEditGameTime = (game: GameInfoFromSchedule) => {
    setEditingGameId(game.gameID);
    const currentEpoch = typeof game.gameTime_epoch === 'string' ? parseInt(game.gameTime_epoch, 10) : game.gameTime_epoch;
    setEditingGameTimeEpoch(String(currentEpoch || ''));
    if (currentEpoch) {
      const date = new Date(currentEpoch * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      setEditingGameDateTimeString(`${year}-${month}-${day}T${hours}:${minutes}`);
    } else {
      setEditingGameDateTimeString('');
    }
    setMockScheduleError(null);
  };

  const handleCancelEditGameTime = () => {
    setEditingGameId(null);
    setEditingGameTimeEpoch('');
    setEditingGameDateTimeString('');
  };

  const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateTimeValue = e.target.value;
    setEditingGameDateTimeString(dateTimeValue);
    if (dateTimeValue) {
      const epoch = Math.floor(new Date(dateTimeValue).getTime() / 1000);
      setEditingGameTimeEpoch(String(epoch));
    } else {
      setEditingGameTimeEpoch('');
    }
  };

  const handleEpochTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const epochValue = e.target.value;
    setEditingGameTimeEpoch(epochValue);
    if (epochValue && !isNaN(parseInt(epochValue, 10))) {
      const date = new Date(parseInt(epochValue, 10) * 1000);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        setEditingGameDateTimeString(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setEditingGameDateTimeString('');
      }
    } else if (!epochValue) {
      setEditingGameDateTimeString('');
    }
  };

  const handleSaveGameTime = async () => {
    if (!editingGameId || !mockSeason || !mockWeek) return;
    setMockScheduleError(null);
    setIsLoadingMockSchedule(true);
    try {
      const newEpoch = parseInt(editingGameTimeEpoch, 10);
      if (isNaN(newEpoch)) {
        setMockScheduleError('Invalid epoch time format.');
        setIsLoadingMockSchedule(false);
        return;
      }
      const scheduleDocRef = doc(db, 'nfl_schedules', `${mockSeason}_week_${mockWeek}`);
      const scheduleSnap = await getDoc(scheduleDocRef);
      if (!scheduleSnap.exists()) {
        setMockScheduleError('Schedule document not found. Cannot update.');
        setIsLoadingMockSchedule(false);
        return;
      }
      const scheduleData = scheduleSnap.data() as { games: GameInfoFromSchedule[] };
      const gamesArray = scheduleData.games;
      const gameIndex = gamesArray.findIndex(g => g.gameID === editingGameId);
      if (gameIndex === -1) {
        setMockScheduleError('Game not found in schedule. Cannot update.');
        setIsLoadingMockSchedule(false);
        return;
      }
      const updatedGamesArray = gamesArray.map((game, index) => index === gameIndex ? { ...game, gameTime_epoch: newEpoch } : game);
      await updateDoc(scheduleDocRef, { games: updatedGamesArray });
      setFetchedGames(updatedGamesArray);
      handleCancelEditGameTime();
    } catch (err) {
      setMockScheduleError(err instanceof Error ? err.message : 'Failed to update game time');
    } finally {
      setIsLoadingMockSchedule(false);
    }
  };

  const handleFetchExistingMockStats = async () => {
    setMockStatsError(null);
    setMockStatsSuccessMessage(null);
    if (!mockStatsEntityType || !mockStatsEntityId.trim() || !mockStatsGameId.trim()) {
      setMockStatsError('Please select entity type and enter Entity ID and Game ID.');
      return;
    }
    setIsLoadingMockStats(true);
    setMockStatsJson(`{\n  "fantasyPoints": "0.0"\n}`);
    const collectionName = mockStatsEntityType === 'player' ? 'players' : 'teams';
    const docPath = `${collectionName}/${mockStatsEntityId.trim()}/gamestats/${mockStatsGameId.trim()}`;
    try {
      const statDocRef = doc(db, docPath);
      const docSnap = await getDoc(statDocRef);
      if (docSnap.exists()) {
        setMockStatsJson(JSON.stringify(docSnap.data(), null, 2));
        setMockStatsSuccessMessage('Existing stats fetched.');
      } else {
        setMockStatsError('No existing stats found for this entity/game. You can create new stats.');
      }
    } catch (err) {
      setMockStatsError(err instanceof Error ? err.message : 'Failed to fetch mock stats');
    } finally {
      setIsLoadingMockStats(false);
    }
  };

  const handleSaveMockStats = async () => {
    setMockStatsError(null);
    setMockStatsSuccessMessage(null);
    if (!mockStatsEntityType || !mockStatsEntityId.trim() || !mockStatsGameId.trim() || !mockSeason.trim() || !mockWeek.trim()) {
      setMockStatsError('Entity Type, Entity ID, Game ID, Season, and Week are required.');
      return;
    }
    let parsedStats: Record<string, unknown>;
    try {
      parsedStats = JSON.parse(mockStatsJson);
    } catch {
      setMockStatsError('Invalid JSON format for stats.');
      return;
    }
    setIsLoadingMockStats(true);
    const collectionName = mockStatsEntityType === 'player' ? 'players' : 'teams';
    const docPath = `${collectionName}/${mockStatsEntityId.trim()}/gamestats/${mockStatsGameId.trim()}`;
    interface BaseMockStatData { gameId: string; season: number; week: number; lastUpdated: Date; }
    const statsToSave: BaseMockStatData & Record<string, any> = {
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
      setMockStatsSuccessMessage('Mock stats saved successfully!');
    } catch (err) {
      setMockStatsError(err instanceof Error ? err.message : 'Failed to save mock stats');
    } finally {
      setIsLoadingMockStats(false);
    }
  };

  return (
    <div className="space-y-6">
      <ComponentCard title="Mock Data Management">
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">Weekly Game Schedule</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="mockSeason">Season</Label>
              <Input id="mockSeason" type="number" value={mockSeason} onChange={(e) => setMockSeason(e.target.value)} placeholder={`e.g., ${APP_CONFIG.CURRENT_NFL_SEASON}`} />
            </div>
            <div>
              <Label htmlFor="mockWeek">Week</Label>
              <Input id="mockWeek" type="number" value={mockWeek} onChange={(e) => setMockWeek(e.target.value)} placeholder="e.g., 1" />
            </div>
            <Button onClick={handleFetchMockSchedule} disabled={isLoadingMockSchedule} className="w-full md:w-auto">{isLoadingMockSchedule ? 'Fetching…' : 'Fetch Schedule'}</Button>
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
                            <Input type="datetime-local" value={editingGameDateTimeString} onChange={handleDateTimeChange} className="text-xs p-1 w-full max-w-xs" />
                            <Input type="number" value={editingGameTimeEpoch} onChange={handleEpochTimeChange} placeholder="Epoch seconds" className="text-xs p-1 w-full max-w-xs mt-1" />
                          </div>
                        ) : (
                          String(game.gameTime_epoch)
                        )}
                      </TableCell>
                      <TableCell>
                        {editingGameId === game.gameID ? (
                          <div className="flex space-x-1 items-center">
                            <Button size="sm" variant="primary" onClick={handleSaveGameTime} disabled={isLoadingMockSchedule} className="text-xs">Save</Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEditGameTime} disabled={isLoadingMockSchedule} className="text-xs">Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleEditGameTime(game)} disabled={isLoadingMockSchedule} className="text-xs">Edit</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Mock Entity Game Stats</h4>
            {mockStatsError && !mockStatsSuccessMessage && (<p className="text-red-500 dark:text-red-400 text-sm mb-3 py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{mockStatsError}</p>)}
            {mockStatsSuccessMessage && (<p className="text-green-500 dark:text-green-400 text-sm mb-3 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{mockStatsSuccessMessage}</p>)}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Entity Type*</Label>
                <select onChange={(e) => { setMockStatsEntityType(e.target.value as 'player' | 'team' | ''); setMockStatsError(null); setMockStatsSuccessMessage(null); }} className="w-full border rounded-md p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="">Select Type…</option>
                  <option value="player">Player</option>
                  <option value="team">Team</option>
                </select>
              </div>
              <div>
                <Label htmlFor="mockStatsEntityId">Entity ID*</Label>
                <Input id="mockStatsEntityId" value={mockStatsEntityId} onChange={(e) => { setMockStatsEntityId(e.target.value); setMockStatsError(null); setMockStatsSuccessMessage(null); }} placeholder="e.g., 12345 or KC" className="w-full" />
              </div>
              <div>
                <Label htmlFor="mockStatsGameId">Game ID* (from schedule)</Label>
                <Input id="mockStatsGameId" value={mockStatsGameId} onChange={(e) => { setMockStatsGameId(e.target.value); setMockStatsError(null); setMockStatsSuccessMessage(null); }} placeholder="e.g., 2023101_NYJ@DEN" className="w-full" />
              </div>
            </div>
            <div className="mb-4">
              <Label htmlFor="mockStatsJson">Stats JSON* (Uses Season: {mockSeason}, Week: {mockWeek} from above for context)</Label>
              <textarea id="mockStatsJson" rows={10} value={mockStatsJson} onChange={(e) => { setMockStatsJson(e.target.value); setMockStatsError(null); setMockStatsSuccessMessage(null); }} className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-500 focus:border-brand-500 text-sm font-mono" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Note: gameId, season, and week will be set automatically.</p>
            </div>
            <div className="flex space-x-3">
              <Button onClick={handleFetchExistingMockStats} disabled={isLoadingMockStats} variant="outline">{isLoadingMockStats && mockStatsEntityType ? 'Fetching…' : 'Fetch Existing Stats'}</Button>
              <Button onClick={handleSaveMockStats} disabled={isLoadingMockStats}>{isLoadingMockStats ? 'Saving…' : 'Save Mock Stats'}</Button>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}


