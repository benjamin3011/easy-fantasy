export interface League {
  id: string;
  name: string;
  description?: string;
  leagueManagerUid: string;
  memberUids: string[];
  createdAt: string;
  season: string;
  maxMembers: number;
  currentWeek: number;
  
  // Team/lineup restrictions
  maxPlayersPerNflTeam: number;
  
  // Captain feature
  enableCaptainFeature: boolean;
  captainPointMultiplier: number;
  
  // Weekly tipping feature
  enableWeeklyTips?: boolean; // Optional for backward compatibility
} 