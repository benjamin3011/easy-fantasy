import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface TippableGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: number;
  homeWinProbability: number;
  awayWinProbability: number;
  spread: number;
  total: number;
  gameDate: string;
}

interface WeeklyTipsPoll {
  leagueId: string;
  week: number;
  season: number;
  games: TippableGame[];
  lockTime: { seconds: number };
  isLocked: boolean;
  createdAt: { seconds: number };
  totalGames: number;
}

interface UserTipsSubmission {
  userId: string;
  leagueId: string;
  week: number;
  season: number;
  tips: Array<{
    gameId: string;
    pick: 'home' | 'away';
  }>;
  submittedAt: { seconds: number };
  totalGames: number;
}

interface ProphetLeaderboardEntry {
  userId: string;
  userName: string;
  teamName: string;
  weeklyPoints: number;
  totalPoints: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  totalCorrect: number;
  totalPicks: number;
}

interface TipsState {
  // Current context
  currentLeagueId: string | null;
  currentWeek: number | null;
  currentSeason: number | null;
  
  // Tips poll data
  tipsPoll: WeeklyTipsPoll | null;
  pollLoading: boolean;
  pollError: string | null;
  
  // User tips state
  userTips: Record<string, 'home' | 'away'>;
  existingTips: UserTipsSubmission | null;
  tipsLoading: boolean;
  tipsError: string | null;
  
  // Submission state
  submitting: boolean;
  submitError: string | null;
  submitSuccess: string | null;
  
  // Leaderboard state
  leaderboard: ProphetLeaderboardEntry[];
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  
  // UI state
  activeTab: 'tips' | 'leaderboard';
  
  // Actions
  setContext: (leagueId: string, week: number, season: number) => void;
  setActiveTab: (tab: 'tips' | 'leaderboard') => void;
  
  // Tips poll actions
  setPollData: (poll: WeeklyTipsPoll | null) => void;
  setPollLoading: (loading: boolean) => void;
  setPollError: (error: string | null) => void;
  
  // User tips actions
  setUserTips: (tips: Record<string, 'home' | 'away'>) => void;
  updateUserTip: (gameId: string, pick: 'home' | 'away') => void;
  setExistingTips: (tips: UserTipsSubmission | null) => void;
  setTipsLoading: (loading: boolean) => void;
  setTipsError: (error: string | null) => void;
  
  // Submission actions
  setSubmitting: (submitting: boolean) => void;
  setSubmitError: (error: string | null) => void;
  setSubmitSuccess: (success: string | null) => void;
  clearSubmitMessages: () => void;
  
  // Leaderboard actions
  setLeaderboard: (leaderboard: ProphetLeaderboardEntry[]) => void;
  setLeaderboardLoading: (loading: boolean) => void;
  setLeaderboardError: (error: string | null) => void;
  
  // Cleanup
  cleanup: () => void;
}

export const useTipsStore = create<TipsState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentLeagueId: null,
      currentWeek: null,
      currentSeason: null,
      
      tipsPoll: null,
      pollLoading: true,
      pollError: null,
      
      userTips: {},
      existingTips: null,
      tipsLoading: false,
      tipsError: null,
      
      submitting: false,
      submitError: null,
      submitSuccess: null,
      
      leaderboard: [],
      leaderboardLoading: false,
      leaderboardError: null,
      
      activeTab: 'tips',
      
      // Context actions
      setContext: (leagueId, week, season) => {
        set({
          currentLeagueId: leagueId,
          currentWeek: week,
          currentSeason: season,
        }, false, 'setContext');
      },
      
      setActiveTab: (tab) => {
        set({ activeTab: tab }, false, 'setActiveTab');
      },
      
      // Tips poll actions
      setPollData: (poll) => {
        set({ tipsPoll: poll }, false, 'setPollData');
      },
      
      setPollLoading: (loading) => {
        set({ pollLoading: loading }, false, 'setPollLoading');
      },
      
      setPollError: (error) => {
        set({ pollError: error }, false, 'setPollError');
      },
      
      // User tips actions
      setUserTips: (tips) => {
        set({ userTips: tips }, false, 'setUserTips');
      },
      
      updateUserTip: (gameId, pick) => {
        const currentTips = get().userTips;
        set({
          userTips: {
            ...currentTips,
            [gameId]: pick
          }
        }, false, 'updateUserTip');
      },
      
      setExistingTips: (tips) => {
        set({ existingTips: tips }, false, 'setExistingTips');
      },
      
      setTipsLoading: (loading) => {
        set({ tipsLoading: loading }, false, 'setTipsLoading');
      },
      
      setTipsError: (error) => {
        set({ tipsError: error }, false, 'setTipsError');
      },
      
      // Submission actions
      setSubmitting: (submitting) => {
        set({ submitting }, false, 'setSubmitting');
      },
      
      setSubmitError: (error) => {
        set({ submitError: error }, false, 'setSubmitError');
      },
      
      setSubmitSuccess: (success) => {
        set({ submitSuccess: success }, false, 'setSubmitSuccess');
      },
      
      clearSubmitMessages: () => {
        set({ 
          submitError: null, 
          submitSuccess: null 
        }, false, 'clearSubmitMessages');
      },
      
      // Leaderboard actions
      setLeaderboard: (leaderboard) => {
        set({ leaderboard }, false, 'setLeaderboard');
      },
      
      setLeaderboardLoading: (loading) => {
        set({ leaderboardLoading: loading }, false, 'setLeaderboardLoading');
      },
      
      setLeaderboardError: (error) => {
        set({ leaderboardError: error }, false, 'setLeaderboardError');
      },
      
      // Cleanup
      cleanup: () => {
        set({
          currentLeagueId: null,
          currentWeek: null,
          currentSeason: null,
          tipsPoll: null,
          pollLoading: true,
          pollError: null,
          userTips: {},
          existingTips: null,
          tipsLoading: false,
          tipsError: null,
          submitting: false,
          submitError: null,
          submitSuccess: null,
          leaderboard: [],
          leaderboardLoading: false,
          leaderboardError: null,
          activeTab: 'tips',
        }, false, 'cleanup');
      },
    }),
    {
      name: 'tips-store',
    }
  )
); 