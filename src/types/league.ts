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
  
  // Auto-lineup feature (uses Quick Pick logic, 1 hour before games)
  autoLineup?: {
    enabled: boolean;
  };
  
  // Auto-tips feature (follows betting favorites, 1 hour before games)
  autoTips?: {
    enabled: boolean;
  };
} 