import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../../firebase/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { fetchGameScores } from '../../services/lineupFetchingService';
import { fetchUserProfiles, UserProfile } from '../../utils/userProfiles';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import { APP_CONFIG } from '../../config/appConfig';

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

interface ProphetLeaderboardProps {
  leagueId: string;
  week?: number; // optional; defaults to current NFL week
  season?: number;
  useMockData?: boolean; // Temporary prop for testing
}

export const ProphetLeaderboard: React.FC<ProphetLeaderboardProps> = ({ 
  leagueId, 
  week,
  season = parseInt(APP_CONFIG.CURRENT_NFL_SEASON, 10),
  useMockData = false
}) => {
  const [leaderboard, setLeaderboard] = useState<ProphetLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(week ?? calculateCurrentNFLWeek());
  const [weeklyOverrides, setWeeklyOverrides] = useState<Record<string, { points: number; correct: number; total: number }>>({});
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());

  // Mock data for testing
  const mockLeaderboard: ProphetLeaderboardEntry[] = [
    {
      userId: '1',
      userName: 'Mike Johnson',
      teamName: 'Thunder Bolts',
      weeklyPoints: 12,
      totalPoints: 187,
      accuracy: 78.2,
      currentStreak: 4,
      bestStreak: 7,
      totalCorrect: 43,
      totalPicks: 55
    },
    {
      userId: '2',
      userName: 'Sarah Chen',
      teamName: 'Gridiron Giants',
      weeklyPoints: 8,
      totalPoints: 179,
      accuracy: 75.9,
      currentStreak: 2,
      bestStreak: 6,
      totalCorrect: 44,
      totalPicks: 58
    },
    {
      userId: '3',
      userName: 'Alex Rodriguez',
      teamName: 'Crimson Crushers',
      weeklyPoints: 15,
      totalPoints: 171,
      accuracy: 73.1,
      currentStreak: 3,
      bestStreak: 5,
      totalCorrect: 38,
      totalPicks: 52
    },
    {
      userId: '4',
      userName: 'Jordan Smith',
      teamName: 'Midnight Mavericks',
      weeklyPoints: 4,
      totalPoints: 168,
      accuracy: 71.4,
      currentStreak: 1,
      bestStreak: 8,
      totalCorrect: 40,
      totalPicks: 56
    },
    {
      userId: '5',
      userName: 'Taylor Williams',
      teamName: 'Steel Stallions',
      weeklyPoints: 9,
      totalPoints: 162,
      accuracy: 69.8,
      currentStreak: 0,
      bestStreak: 4,
      totalCorrect: 37,
      totalPicks: 53
    },
    {
      userId: '6',
      userName: 'Casey Brown',
      teamName: 'Phoenix Fury',
      weeklyPoints: 6,
      totalPoints: 158,
      accuracy: 68.5,
      currentStreak: 2,
      bestStreak: 6,
      totalCorrect: 39,
      totalPicks: 57
    },
    {
      userId: '7',
      userName: 'Jamie Davis',
      teamName: 'Blazing Bulls',
      weeklyPoints: 11,
      totalPoints: 154,
      accuracy: 66.7,
      currentStreak: 1,
      bestStreak: 3,
      totalCorrect: 34,
      totalPicks: 51
    },
    {
      userId: '8',
      userName: 'Riley Garcia',
      teamName: 'Viper Venom',
      weeklyPoints: 7,
      totalPoints: 147,
      accuracy: 64.3,
      currentStreak: 0,
      bestStreak: 5,
      totalCorrect: 36,
      totalPicks: 56
    },
    {
      userId: '9',
      userName: 'Morgan Lee',
      teamName: 'Storm Surge',
      weeklyPoints: 3,
      totalPoints: 143,
      accuracy: 62.1,
      currentStreak: 0,
      bestStreak: 4,
      totalCorrect: 33,
      totalPicks: 53
    },
    {
      userId: '10',
      userName: 'Avery Martinez',
      teamName: 'Rocket Raiders',
      weeklyPoints: 2,
      totalPoints: 139,
      accuracy: 59.6,
      currentStreak: 0,
      bestStreak: 3,
      totalCorrect: 31,
      totalPicks: 52
    },
    {
      userId: '11',
      userName: 'Drew Thompson',
      teamName: 'Galaxy Gladiators',
      weeklyPoints: 5,
      totalPoints: 134,
      accuracy: 57.4,
      currentStreak: 1,
      bestStreak: 4,
      totalCorrect: 31,
      totalPicks: 54
    },
    {
      userId: '12',
      userName: 'Blake Wilson',
      teamName: 'Cyber Cyclones',
      weeklyPoints: 1,
      totalPoints: 128,
      accuracy: 55.2,
      currentStreak: 0,
      bestStreak: 2,
      totalCorrect: 27,
      totalPicks: 49
    }
  ];

  useEffect(() => {
    if (useMockData) {
      // Use mock data - simulate loading
      setLoading(true);
      setTimeout(() => {
        setLeaderboard(mockLeaderboard);
        setLoading(false);
        setError(null);
      }, 500); // Brief loading simulation
    } else {
      fetchLeaderboard();
    }
  // Deliberately not including fetchLeaderboard/mockLeaderboard to avoid infinite recreation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, season, useMockData]);

  // Recompute weekly overrides whenever the selected week changes
  useEffect(() => {
    const compute = async () => {
      const map = await computeWeeklyForWeek(selectedWeek);
      setWeeklyOverrides(map);
    };
    compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, leagueId, season]);

  // Fetch user profiles when leaderboard changes
  useEffect(() => {
    const fetchProfiles = async () => {
      if (leaderboard.length === 0) return;
      
      const uids = leaderboard.map(entry => entry.userId);
      const profiles = await fetchUserProfiles(uids);
      setUserProfiles(profiles);
    };

    fetchProfiles();
  }, [leaderboard]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const getProphetLeaderboardFunction = httpsCallable(functions, 'getProphetLeaderboard');
      const result = await getProphetLeaderboardFunction({
        leagueId,
        season
      });

      const data = result.data as { success: boolean; leaderboard: ProphetLeaderboardEntry[] };
      
      if (data.success && data.leaderboard.length > 0) {
        setLeaderboard(data.leaderboard);
      } else {
        // Fallback: compute simple weekly leaderboard from weeklyTips/userTips and gameScores
        const fallback = await computeFallbackLeaderboard();
        setLeaderboard(fallback);
        if (fallback.length === 0) setError('No leaderboard data available yet');
      }
    } catch (err) {
      // On error, attempt fallback
      try {
        const fallback = await computeFallbackLeaderboard();
        setLeaderboard(fallback);
        if (fallback.length === 0) setError(`Error loading leaderboard: ${err}`);
      } catch {
        setError(`Error loading leaderboard: ${err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fallback: Build week leaderboard from weeklyTips
  const computeFallbackLeaderboard = async (): Promise<ProphetLeaderboardEntry[]> => {
    try {
      const currentWeek = week ?? calculateCurrentNFLWeek();
      const docId = `${leagueId}_week_${currentWeek}_season_${season}`;
      const tipsDocRef = doc(db, 'weeklyTips', docId);
      const tipsDoc = await getDoc(tipsDocRef);
      if (!tipsDoc.exists()) return [];

      // Fetch league to map team names
      const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
      const members: Array<{ uid: string; teamName?: string }> = leagueDoc.exists() ? (leagueDoc.data()?.members || []) : [];
      const uidToTeamName: Record<string, string> = {};
      members.forEach(m => { uidToTeamName[m.uid] = m.teamName || 'Unknown'; });

      // Get all user tips
      const userTipsSnap = await getDocs(collection(db, 'weeklyTips', docId, 'userTips'));
      if (userTipsSnap.empty) return [];

      // Build winner map from gameScores
      const games: Array<{ gameId: string }> = (tipsDoc.data()?.games || []) as Array<{ gameId: string }>;
      const gameIds = games.map(g => g.gameId);
      const scoresMap = await fetchGameScores(gameIds);
      const gameWinners: Record<string, 'home' | 'away' | 'tie' | 'unknown'> = {};
      gameIds.forEach(id => {
        const s = scoresMap.get(id);
        if (s && s.gameStatusCode === 2) {
          if (s.homeScore > s.awayScore) gameWinners[id] = 'home';
          else if (s.awayScore > s.homeScore) gameWinners[id] = 'away';
          else gameWinners[id] = 'tie';
        } else {
          gameWinners[id] = 'unknown';
        }
      });

      // Create a map of user tips data
      const userTipsMap = new Map();
      userTipsSnap.forEach(docSnap => {
        const data = docSnap.data() as { tips?: Array<{ gameId: string; pick: 'home' | 'away' }> };
        userTipsMap.set(docSnap.id, data.tips || []);
      });

      // Compute per user - include ALL league members
      const entries: ProphetLeaderboardEntry[] = [];
      members.forEach(member => {
        const tips = userTipsMap.get(member.uid) || [];
        let correct = 0;
        let total = 0;
        
        tips.forEach((t: { gameId: string; pick: 'home' | 'away' }) => {
          const winner = gameWinners[t.gameId];
          if (winner === 'home' || winner === 'away') {
            total += 1;
            if (winner === t.pick) correct += 1;
          }
        });
        
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        const teamName = member.teamName || 'Unknown';
        
        entries.push({
          userId: member.uid,
          userName: teamName,
          teamName,
          weeklyPoints: correct,
          totalPoints: correct,
          accuracy,
          currentStreak: 0,
          bestStreak: 0,
          totalCorrect: correct,
          totalPicks: total,
        });
      });

      // Sort by weekly points desc, then accuracy
      entries.sort((a, b) => (b.weeklyPoints - a.weeklyPoints) || (b.accuracy - a.accuracy));
      return entries;
    } catch {
      return [];
    }
  };

  // Compute per-user weekly points for a specific week; does not change totals
  const computeWeeklyForWeek = async (targetWeek: number): Promise<Record<string, { points: number; correct: number; total: number }>> => {
    try {
      const docId = `${leagueId}_week_${targetWeek}_season_${season}`;
      const tipsDocRef = doc(db, 'weeklyTips', docId);
      const tipsDoc = await getDoc(tipsDocRef);
      if (!tipsDoc.exists()) return {};

      // Winners
      const games: Array<{ gameId: string }> = (tipsDoc.data()?.games || []) as Array<{ gameId: string }>;
      const gameIds = games.map(g => g.gameId);
      const scoresMap = await fetchGameScores(gameIds);
      const gameWinners: Record<string, 'home' | 'away' | 'tie' | 'unknown'> = {};
      gameIds.forEach(id => {
        const s = scoresMap.get(id);
        if (s && s.gameStatusCode === 2) {
          if (s.homeScore > s.awayScore) gameWinners[id] = 'home';
          else if (s.awayScore > s.homeScore) gameWinners[id] = 'away';
          else gameWinners[id] = 'tie';
        } else {
          gameWinners[id] = 'unknown';
        }
      });

      const userTipsSnap = await getDocs(collection(db, 'weeklyTips', docId, 'userTips'));
      const resultMap: Record<string, { points: number; correct: number; total: number }> = {};
      userTipsSnap.forEach(docSnap => {
        const data = docSnap.data() as { tips?: Array<{ gameId: string; pick: 'home' | 'away' }> };
        const tips = data.tips || [];
        let correct = 0;
        let total = 0;
        tips.forEach(t => {
          const winner = gameWinners[t.gameId];
          if (winner === 'home' || winner === 'away' || winner === 'tie') {
            total += 1;
            if ((winner === 'home' || winner === 'away') && t.pick === winner) {
              correct += 1;
            }
          }
        });
        resultMap[docSnap.id] = { points: correct, correct, total };
      });
      return resultMap;
    } catch {
      return {};
    }
  };

  const getRankBadge = (position: number) => {
    if (position === 1) {
      return {
        icon: '🥇',
        bg: 'bg-gradient-to-br from-yellow-400 to-yellow-600',
        text: 'text-yellow-900',
        ring: 'ring-yellow-400/30'
      };
    } else if (position === 2) {
      return {
        icon: '🥈', 
        bg: 'bg-gradient-to-br from-gray-300 to-gray-500',
        text: 'text-gray-900',
        ring: 'ring-gray-400/30'
      };
    } else if (position === 3) {
      return {
        icon: '🥉',
        bg: 'bg-gradient-to-br from-orange-400 to-orange-600', 
        text: 'text-orange-900',
        ring: 'ring-orange-400/30'
      };
    } else {
      return {
        icon: `#${position}`,
        bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
        text: 'text-white',
        ring: ''
      };
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 70) return 'text-green-600 dark:text-green-400';
    if (accuracy >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center p-8 sm:p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Loading prophet leaderboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3">❌</div>
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Unable to Load Leaderboard
        </h3>
        <p className="text-red-700 dark:text-red-300 text-sm sm:text-base mb-4">
          {error}
        </p>
        <button
          onClick={fetchLeaderboard}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium min-h-[40px]"
        >
          🔄 Try Again
        </button>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎯</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Prophet Points Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Start making game predictions to appear on the leaderboard!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weekly selector (does not change totals) */}
      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">Weekly points: Week {selectedWeek}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedWeek(w => Math.max(1, w - 1))}
            className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
          >Prev</button>
          <button
            onClick={() => setSelectedWeek(w => Math.min(18, w + 1))}
            className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
          >Next</button>
        </div>
      </div>
      {leaderboard.map((entry, index) => {
        const position = index + 1;
        const badge = getRankBadge(position);
        const weekly = weeklyOverrides[entry.userId];
        const weeklyPoints = weekly ? weekly.points : entry.weeklyPoints;

        return (
          <div
            key={entry.userId}
            className={`
              relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
              rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-200
              ${position <= 3 ? 'ring-1 ' + badge.ring : ''}
              ${position === 1 ? 'transform hover:-translate-y-1' : ''}
            `}
          >
            {/* Mobile Layout */}
            <div className="block md:hidden">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {/* Rank Badge */}
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold
                    ${badge.bg} ${badge.text} shadow-lg
                  `}>
                    {typeof badge.icon === 'string' && badge.icon.startsWith('#') 
                      ? badge.icon 
                      : <span className="text-lg">{badge.icon}</span>
                    }
                  </div>
                  
                  {/* Team Info */}
                  <div>
                    <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                      {entry.teamName}
                    </h4>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {userProfiles.get(entry.userId)?.firstName || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                {/* Total Points */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {entry.totalPoints}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    total pts
                  </div>
                </div>
              </div>

              {/* Stats Grid - Mobile */}
              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-gray-200 dark:border-gray-600">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">This Week</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{weeklyPoints}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Accuracy</p>
                  <p className={`font-semibold ${getAccuracyColor(entry.accuracy)}`}>{entry.accuracy}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Record</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{entry.totalCorrect}-{entry.totalPicks - entry.totalCorrect}</p>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className={`
                  w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg
                  ${badge.bg} ${badge.text} shadow-lg relative
                `}>
                  {position <= 3 && (
                    <div className={`absolute inset-0 rounded-full border-2 ${position === 1 ? 'border-yellow-400' : position === 2 ? 'border-gray-400' : 'border-orange-400'} animate-pulse-slow`} />
                  )}
                  {typeof badge.icon === 'string' && badge.icon.startsWith('#') 
                    ? badge.icon 
                    : <span className="text-xl">{badge.icon}</span>
                  }
                </div>

                {/* Team Info */}
                <div>
                  <h4 className="font-bold text-xl text-gray-900 dark:text-white">
                    {entry.teamName}
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    {userProfiles.get(entry.userId)?.firstName || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Stats Row - Desktop */}
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">This Week</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{weeklyPoints}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Accuracy</p>
                  <p className={`font-semibold text-lg ${getAccuracyColor(entry.accuracy)}`}>{entry.accuracy}%</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Record</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{entry.totalCorrect}-{entry.totalPicks - entry.totalCorrect}</p>
                </div>
                <div className="text-center ml-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Points</p>
                  <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{entry.totalPoints}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};