// src/pages/Admin/StandingsTools.tsx
import { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Label from '../../components/form/Label';
import Input from '../../components/form/input/InputField';
import Button from '../../components/ui/button/Button';
import Alert from '../../components/ui/alert/Alert';
import { calculateWeeklyScoresCallable, healthCheckStandingsCallable } from '../../firebase/callables';

export default function StandingsTools() {
  const [scoresWeek, setScoresWeek] = useState('');
  const [scoresLeagueId, setScoresLeagueId] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);

  const [healthWeek, setHealthWeek] = useState('');
  const [healthLeagueId, setHealthLeagueId] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerCalculateWeeklyScores = async () => {
    setMessage(null); setError(null);
    const weekNum = parseInt(scoresWeek || '0', 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
      setError("Please enter valid week (1-18) to calculate scores.");
      return;
    }
    setCalcLoading(true);
    try {
      const result = await calculateWeeklyScoresCallable({ week: weekNum, leagueId: scoresLeagueId || undefined });
      setMessage(result.data.message || 'Weekly scores calculated.');
      if (!result.data.success) setError(result.data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to calculate scores.');
    } finally { setCalcLoading(false); }
  };

  const triggerHealthCheck = async () => {
    setMessage(null); setError(null);
    const weekNum = healthWeek ? parseInt(healthWeek, 10) : undefined;
    if (healthWeek && (isNaN(weekNum as number) || (weekNum as number) < 1 || (weekNum as number) > 18)) {
      setError('Please enter valid week (1-18) for health check or leave empty.');
      return;
    }
    setHealthLoading(true);
    try {
      const result = await healthCheckStandingsCallable({ week: weekNum, leagueId: healthLeagueId || undefined, dryRun });
      setMessage(result.data.message || 'Health check completed.');
      if (!result.data.success) setError(result.data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run health check.');
    } finally { setHealthLoading(false); }
  };

  return (
    <div className="space-y-6">
      {message && (<Alert variant="success" title="Success" message={message} showLink={false} />)}
      {error && (<Alert variant="error" title="Error" message={error} showLink={false} />)}

      <ComponentCard title='Update Standings (Calculate Weekly Scores)'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
          Calculate and persist weekly lineup totals into league standings. Run after stats processing.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="scoresWeekInput">NFL Week (1-18)</Label>
            <Input id="scoresWeekInput" type="number" inputMode="numeric" value={scoresWeek} onChange={(e) => setScoresWeek(e.target.value)} placeholder="Default: current week" min="1" max="18" disabled={calcLoading} />
          </div>
          <div>
            <Label htmlFor="scoresLeagueIdInput">League ID (optional)</Label>
            <Input id="scoresLeagueIdInput" type="text" value={scoresLeagueId} onChange={(e) => setScoresLeagueId(e.target.value)} placeholder="Leave empty for all leagues" disabled={calcLoading} />
          </div>
          <div className="flex md:justify-end">
            <Button onClick={triggerCalculateWeeklyScores} disabled={calcLoading} className="w-full md:w-auto">
              {calcLoading ? 'Calculating…' : 'Calculate Weekly Scores'}
            </Button>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title='Standings Health Check'>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>Compare user lineup totals with league standings and optionally repair mismatches.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label htmlFor="healthWeekInput">NFL Week (optional)</Label>
            <Input id="healthWeekInput" type="number" inputMode="numeric" value={healthWeek} onChange={(e) => setHealthWeek(e.target.value)} placeholder="Default: current week" min="1" max="18" disabled={healthLoading} />
          </div>
          <div>
            <Label htmlFor="healthLeagueIdInput">League ID (optional)</Label>
            <Input id="healthLeagueIdInput" type="text" value={healthLeagueId} onChange={(e) => setHealthLeagueId(e.target.value)} placeholder="Limit to a league" disabled={healthLoading} />
          </div>
          <div className="flex items-center space-x-2">
            <input id="dryRunToggle" type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={healthLoading} />
            <Label htmlFor="dryRunToggle">Dry Run</Label>
          </div>
          <div className="flex md:justify-end">
            <Button onClick={triggerHealthCheck} disabled={healthLoading} className="w-full md:w-auto">
              {healthLoading ? 'Checking…' : 'Run Health Check'}
            </Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}


