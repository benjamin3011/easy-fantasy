// src/pages/Admin/NotificationsTools.tsx
import { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Input from '../../components/form/input/InputField';
import Select from '../../components/form/Select';
import Button from '../../components/ui/button/Button';
import Alert from '../../components/ui/alert/Alert';
import { functions } from '../../firebase/firebase';
import { httpsCallable } from 'firebase/functions';

export default function NotificationsTools() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState('');
  const [points, setPoints] = useState('');
  const [perfType, setPerfType] = useState('');

  const [injPlayer, setInjPlayer] = useState('');
  const [injStatus, setInjStatus] = useState('');
  const [injDetails, setInjDetails] = useState('');

  const [achType, setAchType] = useState('');
  const [weekCount, setWeekCount] = useState('');

  const call = async (name: string, data?: any) => {
    setMessage(null); setError(null);
    try {
      const fn = httpsCallable(functions, name);
      const res = await fn(data);
      setMessage((res.data as { message?: string })?.message || 'Success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      {message && (<Alert variant="success" title="Success" message={message} showLink={false} />)}
      {error && (<Alert variant="error" title="Error" message={error} showLink={false} />)}

      <ComponentCard title="Test Lineup Deadline Alert">
        <Button onClick={() => call('triggerLineupDeadlineCheck')} variant="outline" className="w-full sm:w-auto">Send Test Lineup Alert</Button>
      </ComponentCard>

      <ComponentCard title="Test Performance Alert">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Input placeholder="Player name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          <Input placeholder="Points (e.g., 24)" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
          <Select options={[{ value: 'scoring_update', label: 'Scoring Update' }, { value: 'big_performance', label: 'Big Performance' }, { value: 'captain_success', label: 'Captain Success' }]} onChange={(v) => setPerfType(v)} placeholder="Alert Type" />
        </div>
        <Button onClick={() => call('sendPerformanceAlert', { type: perfType, playerName, points: parseInt(points), isCaptain: perfType === 'captain_success' })} variant="outline" className="w-full sm:w-auto">Send Test Performance Alert</Button>
      </ComponentCard>

      <ComponentCard title="Test Injury Alert">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Input placeholder="Player name" value={injPlayer} onChange={(e) => setInjPlayer(e.target.value)} />
          <Select options={[{ value: 'Out', label: 'Out' }, { value: 'Questionable', label: 'Questionable' }, { value: 'Doubtful', label: 'Doubtful' }]} onChange={(v) => setInjStatus(v)} placeholder="Injury Status" />
          <Input placeholder="Details (e.g., Ankle)" value={injDetails} onChange={(e) => setInjDetails(e.target.value)} />
        </div>
        <Button onClick={() => call('sendInjuryAlert', { playerName: injPlayer, injuryStatus: injStatus, injuryDetails: injDetails, suggestedReplacement: injStatus === 'Out' ? 'Josh Allen (22.1 PPG, 4 picks left)' : 'Tua Tagovailoa (backup plan)' })} variant="outline" className="w-full sm:w-auto">Send Test Injury Alert</Button>
      </ComponentCard>

      <ComponentCard title="Test Achievement Alert">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Select options={[{ value: 'complete_streak', label: 'Complete Streak' }, { value: 'perfect_week', label: 'Perfect Week' }]} onChange={(v) => setAchType(v)} placeholder="Achievement Type" />
          <Input placeholder="Week count (for streaks)" type="number" value={weekCount} onChange={(e) => setWeekCount(e.target.value)} />
        </div>
        <Button onClick={() => call('sendAchievementAlert', { achievementType: achType, weekCount: weekCount ? parseInt(weekCount) : undefined, leagueName: 'Test League' })} variant="outline" className="w-full sm:w-auto">Send Test Achievement Alert</Button>
      </ComponentCard>
    </div>
  );
}


