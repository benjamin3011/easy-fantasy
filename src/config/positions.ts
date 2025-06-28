import { PositionDetail } from '../types/lineup';

export const POSITIONS_CONFIG: PositionDetail[] = [
  { key: 'QB', label: 'Quarterback', type: 'player' },
  { key: 'RB', label: 'Running Back', type: 'player' },
  { key: 'WR', label: 'Wide Receiver', type: 'player' },
  { key: 'TE', label: 'Tight End', type: 'player' },
  { key: 'PassingOffense', label: 'Passing Offense', type: 'team' },
  { key: 'RushingOffense', label: 'Rushing Offense', type: 'team' },
  { key: 'Defense', label: 'Defense', type: 'team' },
  { key: 'SpecialTeams', label: 'Special Teams', type: 'team' },
];
