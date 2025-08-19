// src/pages/Admin/TipsTools.tsx
import { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Label from '../../components/form/Label';
import Input from '../../components/form/input/InputField';
import Button from '../../components/ui/button/Button';
import Alert from '../../components/ui/alert/Alert';
import { createWeeklyTipsCallable, updateTipsOddsCallable, calculateTipsResultsCallable, repairProphetTotalsCallable } from '../../firebase/callables';

export default function TipsTools() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState('');
  const [week, setWeek] = useState('');
  const [loading, setLoading] = useState(false);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);

  return (
    <div className="space-y-6">
      {message && (<Alert variant="success" title="Success" message={message} showLink={false} />)}
      {error && (<Alert variant="error" title="Error" message={error} showLink={false} />)}

      <ComponentCard title='Create Weekly Tips Poll'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>Create a weekly tipping poll for a league and week.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="tipsLeagueIdInput">League ID</Label>
            <Input id="tipsLeagueIdInput" type="text" value={leagueId} onChange={(e) => setLeagueId(e.target.value)} placeholder="Enter League ID" disabled={loading} />
          </div>
          <div>
            <Label htmlFor="tipsWeekInput">NFL Week (1-18)</Label>
            <Input id="tipsWeekInput" type="number" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="Enter week number" min="1" max="18" disabled={loading} />
          </div>
          <div className="flex md:justify-end">
            <Button onClick={async () => {
              setMessage(null); setError(null); setLoading(true);
              try {
                const w = parseInt(week, 10);
                if (!leagueId.trim() || isNaN(w) || w < 1 || w > 18) throw new Error('Enter league and valid week 1-18');
                const res = await createWeeklyTipsCallable({ leagueId: leagueId.trim(), week: w });
                setMessage(res.data.message || 'Tips poll created.');
                if (!res.data.success) setError(res.data.message);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to create tips poll.');
              } finally { setLoading(false); }
            }} disabled={loading} className="w-full md:w-auto">{loading ? 'Creating…' : 'Create Tips Poll'}</Button>
          </div>
        </div>
        <div className="border-t pt-3 mt-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Update odds (uses current week if none provided).</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label htmlFor="oddsWeekInput">NFL Week (optional)</Label>
              <Input id="oddsWeekInput" type="number" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="Default: current week" min="1" max="18" disabled={oddsLoading} />
            </div>
            <div className="flex md:justify-end">
              <Button onClick={async () => {
                setMessage(null); setError(null); setOddsLoading(true);
                try {
                  const res = await updateTipsOddsCallable({ week: week ? parseInt(week, 10) : undefined, season: undefined });
                  setMessage(res.data.message || 'Tips odds updated.');
                  if (!res.data.success) setError(res.data.message);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to update odds.');
                } finally { setOddsLoading(false); }
              }} disabled={oddsLoading} className="w-full md:w-auto">{oddsLoading ? 'Updating…' : 'Update Tips Odds'}</Button>
            </div>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title='Calculate Tips Results'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
          Manually calculate and update tips leaderboard totals for completed games in a specific week.
          <br />
          <span className="text-yellow-600 dark:text-yellow-400 font-medium">
            Use this if totals aren't updating automatically after games finish.
          </span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="resultsLeagueIdInput">League ID</Label>
            <Input 
              id="resultsLeagueIdInput" 
              type="text" 
              value={leagueId} 
              onChange={(e) => setLeagueId(e.target.value)} 
              placeholder="Enter League ID" 
              disabled={resultsLoading} 
            />
          </div>
          <div>
            <Label htmlFor="resultsWeekInput">NFL Week (1-18)</Label>
            <Input 
              id="resultsWeekInput" 
              type="number" 
              value={week} 
              onChange={(e) => setWeek(e.target.value)} 
              placeholder="Enter week number" 
              min="1" 
              max="18" 
              disabled={resultsLoading} 
            />
          </div>
          <div className="flex md:justify-end">
            <Button 
              onClick={async () => {
                setMessage(null); 
                setError(null); 
                setResultsLoading(true);
                try {
                  const w = parseInt(week, 10);
                  if (!leagueId.trim() || isNaN(w) || w < 1 || w > 18) {
                    throw new Error('Enter league ID and valid week 1-18');
                  }
                  const res = await calculateTipsResultsCallable({ 
                    leagueId: leagueId.trim(), 
                    week: w 
                  });
                  setMessage(res.data.message || 'Tips results calculated and leaderboard updated.');
                  if (!res.data.success) setError(res.data.message);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to calculate tips results.');
                } finally { 
                  setResultsLoading(false); 
                }
              }} 
              disabled={resultsLoading} 
              className="w-full md:w-auto"
            >
              {resultsLoading ? 'Calculating…' : 'Calculate Results'}
            </Button>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title='🔧 Repair Prophet Totals'>
        <p className='text-sm text-orange-600 dark:text-orange-400 mb-4'>
          <strong>Fix incorrect totals:</strong> This will recalculate totalPoints, totalCorrect, and totalPicks from weekly results for all users in a league.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="repairLeagueIdInput">League ID</Label>
            <Input 
              id="repairLeagueIdInput" 
              type="text" 
              value={leagueId} 
              onChange={(e) => setLeagueId(e.target.value)} 
              placeholder="Enter League ID" 
              disabled={repairLoading} 
            />
          </div>
          <div>
            <Label htmlFor="repairSeasonInput">Season</Label>
            <Input 
              id="repairSeasonInput" 
              type="number" 
              value="2025" 
              placeholder="2025" 
              disabled={repairLoading} 
            />
          </div>
          <div>
            <Button 
              onClick={async () => {
                if (!leagueId.trim()) {
                  setError('Please enter a League ID.');
                  return;
                }
                setError(null);
                setMessage(null);
                setRepairLoading(true);
                try {
                  const res = await repairProphetTotalsCallable({ 
                    leagueId: leagueId.trim(),
                    season: 2025
                  });
                  setMessage(`✅ ${res.data.message} (${res.data.repairedCount} entries fixed)`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to repair prophet totals.');
                } finally { 
                  setRepairLoading(false); 
                }
              }} 
              disabled={repairLoading} 
              className="w-full md:w-auto"
              variant="destructive"
            >
              {repairLoading ? 'Repairing…' : '🔧 Repair Totals'}
            </Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}


