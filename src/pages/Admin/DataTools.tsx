// src/pages/Admin/DataTools.tsx
import { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Label from '../../components/form/Label';
import Input from '../../components/form/input/InputField';
import Button from '../../components/ui/button/Button';
import Alert from '../../components/ui/alert/Alert';
import { manualUpdateTeamsAndPlayersCallable, manualFetchAndProcessGameStatsForWeekCallable, manualFetchWeeklyScheduleCallable, repairSeasonFantasyPointsCallable } from '../../firebase/callables';

export default function DataTools() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [week, setWeek] = useState('');

  const withStatus = async (fn: () => Promise<void>) => {
    setMessage(null); setError(null); setLoading(true);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      {message && (<Alert variant="success" title="Success" message={message} showLink={false} />)}
      {error && (<Alert variant="error" title="Error" message={error} showLink={false} />)}

      <ComponentCard title='Fetch Weekly Schedule'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>Fetch and store schedule for a week.</p>
        <div className="flex items-end space-x-3">
          <div className="flex-grow">
            <Label htmlFor="weekInput">NFL Week (1-18):</Label>
            <Input id="weekInput" type="number" inputMode="numeric" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="Enter week number" min="1" max="18" disabled={loading} className="w-full" />
          </div>
          <Button onClick={() => withStatus(async () => {
            const n = parseInt(week, 10);
            if (isNaN(n) || n < 1 || n > 18) throw new Error('Enter valid week 1-18');
            const res = await manualFetchWeeklyScheduleCallable({ week: n });
            setMessage(res.data.message || 'Schedule fetched.');
          })} disabled={loading || !week.trim()} className="shrink-0">
            {loading ? 'Working…' : 'Fetch Schedule'}
          </Button>
        </div>
      </ComponentCard>

      <ComponentCard title='Process Game Stats & Scores'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>Fetch box scores and compute team points.</p>
        <div className="flex items-end space-x-3">
          <div className="flex-grow">
            <Label htmlFor="processWeekInput">NFL Week (1-18):</Label>
            <Input id="processWeekInput" type="number" inputMode="numeric" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="Enter week number" min="1" max="18" disabled={loading} className="w-full" />
          </div>
          <Button onClick={() => withStatus(async () => {
            const n = parseInt(week, 10);
            if (isNaN(n) || n < 1 || n > 18) throw new Error('Enter valid week 1-18');
            const res = await manualFetchAndProcessGameStatsForWeekCallable({ week: n });
            setMessage(res.data.message || 'Stats processed.');
          })} disabled={loading || !week.trim()} className="shrink-0">
            {loading ? 'Working…' : 'Process Stats & Scores'}
          </Button>
        </div>
      </ComponentCard>

      <ComponentCard title='Sync Teams & Players'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>Update teams, players, and injuries.</p>
        <Button onClick={() => withStatus(async () => {
          const res = await manualUpdateTeamsAndPlayersCallable();
          setMessage(res.data.message || 'Teams/Players updated.');
        })} disabled={loading}>
          {loading ? 'Working…' : 'Update Teams & Players Now'}
        </Button>
      </ComponentCard>

      <ComponentCard title='🔧 Repair Season Fantasy Points'>
        <p className='text-sm text-orange-600 dark:text-orange-400 mb-4'>
          <strong>Fix duplicate aggregation:</strong> Recalculates season fantasy points from individual game stats for all players and teams.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button 
            onClick={() => withStatus(async () => {
              const res = await repairSeasonFantasyPointsCallable({ season: 2025 });
              setMessage(`✅ Repaired ${res.data.playersRepaired} players and ${res.data.teamsRepaired} teams`);
            })} 
            disabled={loading} 
            className="w-full"
            variant="destructive"
          >
            {loading ? 'Repairing All...' : '🔧 Repair All (Players + Teams)'}
          </Button>
          
          <Button 
            onClick={() => withStatus(async () => {
              const res = await repairSeasonFantasyPointsCallable({ season: 2025, playersOnly: true });
              setMessage(`✅ Repaired ${res.data.playersRepaired} players`);
            })} 
            disabled={loading} 
            className="w-full"
            variant="outline"
          >
            {loading ? 'Repairing...' : '👤 Players Only'}
          </Button>
          
          <Button 
            onClick={() => withStatus(async () => {
              const res = await repairSeasonFantasyPointsCallable({ season: 2025, teamsOnly: true });
              setMessage(`✅ Repaired ${res.data.teamsRepaired} teams`);
            })} 
            disabled={loading} 
            className="w-full"
            variant="outline"
          >
            {loading ? 'Repairing...' : '🏈 Teams Only'}
          </Button>
        </div>
      </ComponentCard>
    </div>
  );
}


