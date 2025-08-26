import { useState, useMemo } from 'react';
import { Member } from '../../utils/leagues';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import MemberLineupInline from './MemberLineupInline';

interface ModernLeaderboardProps {
  members: Member[];
  leagueId: string; // Add leagueId for lineup modal
  useMockData?: boolean; // Temporary prop for testing
}

export default function ModernLeaderboard({ members, leagueId, useMockData = false }: ModernLeaderboardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const currentWeek = calculateCurrentNFLWeek();

  // Mock data for testing
  const mockMembers: Member[] = [
    {
      uid: '1',
      teamName: 'Thunder Bolts',
      totalSeasonPoints: 1247,
      weeklyPoints: { '1': 89, '2': 92, '3': 156, '4': 123, '5': 134, '6': 167, '7': 145, '8': 98, '9': 112, '10': 131, '11': 88, '12': 76, '13': 134, '14': 102, '15': 89 }
    },
    {
      uid: '2', 
      teamName: 'Gridiron Giants',
      totalSeasonPoints: 1189,
      weeklyPoints: { '1': 76, '2': 134, '3': 98, '4': 145, '5': 121, '6': 89, '7': 167, '8': 134, '9': 92, '10': 156, '11': 123, '12': 145, '13': 76, '14': 134, '15': 99 }
    },
    {
      uid: '3',
      teamName: 'Crimson Crushers', 
      totalSeasonPoints: 1156,
      weeklyPoints: { '1': 134, '2': 76, '3': 145, '4': 89, '5': 167, '6': 92, '7': 98, '8': 156, '9': 123, '10': 134, '11': 145, '12': 89, '13': 167, '14': 76, '15': 65 }
    },
    {
      uid: '4',
      teamName: 'Midnight Mavericks',
      totalSeasonPoints: 1134,
      weeklyPoints: { '1': 98, '2': 156, '3': 89, '4': 167, '5': 76, '6': 134, '7': 123, '8': 145, '9': 134, '10': 89, '11': 167, '12': 98, '13': 145, '14': 89, '15': 124 }
    },
    {
      uid: '5',
      teamName: 'Steel Stallions',
      totalSeasonPoints: 1098,
      weeklyPoints: { '1': 123, '2': 89, '3': 167, '4': 76, '5': 145, '6': 98, '7': 134, '8': 89, '9': 167, '10': 76, '11': 134, '12': 123, '13': 89, '14': 145, '15': 43 }
    },
    {
      uid: '6',
      teamName: 'Phoenix Fury',
      totalSeasonPoints: 1087,
      weeklyPoints: { '1': 167, '2': 145, '3': 76, '4': 134, '5': 89, '6': 123, '7': 89, '8': 167, '9': 76, '10': 145, '11': 98, '12': 134, '13': 123, '14': 67, '15': 84 }
    },
    {
      uid: '7',
      teamName: 'Blazing Bulls',
      totalSeasonPoints: 1045,
      weeklyPoints: { '1': 145, '2': 123, '3': 134, '4': 98, '5': 156, '6': 76, '7': 167, '8': 123, '9': 89, '10': 98, '11': 76, '12': 167, '13': 98, '14': 123, '15': 72 }
    },
    {
      uid: '8',
      teamName: 'Viper Venom',
      totalSeasonPoints: 1023,
      weeklyPoints: { '1': 156, '2': 98, '3': 123, '4': 145, '5': 89, '6': 167, '7': 76, '8': 134, '9': 145, '10': 123, '11': 89, '12': 76, '13': 156, '14': 98, '15': 48 }
    },
    {
      uid: '9',
      teamName: 'Storm Surge',
      totalSeasonPoints: 987,
      weeklyPoints: { '1': 89, '2': 167, '3': 98, '4': 123, '5': 134, '6': 145, '7': 156, '8': 76, '9': 98, '10': 167, '11': 123, '12': 89, '13': 134, '14': 45, '15': 92 }
    },
    {
      uid: '10',
      teamName: 'Rocket Raiders',
      totalSeasonPoints: 934,
      weeklyPoints: { '1': 76, '2': 134, '3': 167, '4': 156, '5': 98, '6': 89, '7': 145, '8': 98, '9': 156, '10': 134, '11': 76, '12': 145, '13': 67, '14': 89, '15': 8 }
    },
    {
      uid: '11',
      teamName: 'Galaxy Gladiators',
      totalSeasonPoints: 876,
      weeklyPoints: { '1': 134, '2': 89, '3': 156, '4': 167, '5': 123, '6': 76, '7': 98, '8': 145, '9': 89, '10': 156, '11': 134, '12': 23, '13': 89, '14': 76, '15': 21 }
    },
    {
      uid: '12',
      teamName: 'Cyber Cyclones',
      totalSeasonPoints: 823,
      weeklyPoints: { '1': 167, '2': 76, '3': 134, '4': 89, '5': 145, '6': 156, '7': 123, '8': 67, '9': 134, '10': 89, '11': 45, '12': 156, '13': 12, '14': 23, '15': 7 }
    }
  ];

  // Use mock data if flag is set, otherwise use real data
  const dataToUse = useMockData ? mockMembers : members;

  // Sort members by total points descending
  const sortedMembers = useMemo(() => {
    return dataToUse
      .slice()
      .sort((a, b) => (b.totalSeasonPoints || 0) - (a.totalSeasonPoints || 0));
  }, [dataToUse]);

  // Show top 5 by default, all if expanded
  const displayMembers = showAll ? sortedMembers : sortedMembers.slice(0, 5);

  const getRankBadge = (position: number) => {
    if (position === 1) {
      return {
        bg: 'bg-gradient-to-r from-yellow-400 to-yellow-600',
        text: 'text-white',
        icon: '🥇',
        ring: 'ring-2 ring-yellow-300'
      };
    } else if (position === 2) {
      return {
        bg: 'bg-gradient-to-r from-gray-400 to-gray-600',
        text: 'text-white',
        icon: '🥈',
        ring: 'ring-2 ring-gray-300'
      };
    } else if (position === 3) {
      return {
        bg: 'bg-gradient-to-r from-orange-400 to-orange-600',
        text: 'text-white',
        icon: '🥉',
        ring: 'ring-2 ring-orange-300'
      };
    } else {
      return {
        bg: 'bg-gradient-to-r from-blue-500 to-blue-600',
        text: 'text-white',
        icon: `#${position}`,
        ring: 'ring-2 ring-blue-300'
      };
    }
  };

  const getWeeklyChange = (member: Member) => {
    const thisWeek = Math.round((member.weeklyPoints?.[currentWeek] ?? 0) * 100) / 100;
    const lastWeek = Math.round((member.weeklyPoints?.[currentWeek - 1] ?? 0) * 100) / 100;
    
    if (!lastWeek) return null;
    
    const change = Math.round((thisWeek - lastWeek) * 100) / 100;
    if (change > 0) {
      return { value: `+${change}`, color: 'text-green-600 dark:text-green-400', icon: '📈' };
    } else if (change < 0) {
      return { value: `${change}`, color: 'text-red-600 dark:text-red-400', icon: '📉' };
    } else {
      return { value: '±0', color: 'text-gray-500 dark:text-gray-400', icon: '➖' };
    }
  };

  const getAveragePoints = (member: Member) => {
    if (!member.weeklyPoints) return 0;
    const weeks = Object.keys(member.weeklyPoints).length;
    if (weeks === 0) return 0;
    return Math.round((member.totalSeasonPoints || 0) / weeks * 100) / 100;
  };

  if (dataToUse.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🏆</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Members Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Invite friends to join your league to see the leaderboard!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {displayMembers.map((member, index) => {
        const position = index + 1;
        const badge = getRankBadge(position);
        const thisWeek = Math.round((member.weeklyPoints?.[currentWeek] ?? 0) * 100) / 100;
        const weeklyChange = getWeeklyChange(member);
        const avgPoints = getAveragePoints(member);

        return (
          <div
            key={member.uid}
            className={`
              relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
              rounded-xl p-4 md:p-5 shadow-sm
              ${position <= 3 ? 'ring-1 ' + badge.ring : ''}
            `}
          >
            {/* Mobile Layout */}
            <div className="block md:hidden">
              <div className="flex items-start justify-between mb-3">
                {/* Team Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base text-gray-900 dark:text-white truncate">
                    {member.teamName}
                  </h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    #{position}
                  </div>
                </div>
                
                {/* Total Points */}
                <div className="text-right pl-3">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {Math.round((member.totalSeasonPoints || 0) * 100) / 100}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    total points
                  </div>
                </div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
                    {thisWeek}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    This Week
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
                    {avgPoints}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Avg/Week
                  </div>
                </div>
                
                <div className="text-center">
                  {weeklyChange ? (
                    <>
                      <div className={`text-lg font-semibold ${weeklyChange.color}`}>
                        {weeklyChange.value}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        vs Last Week
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-gray-400">
                        -
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        No Change
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className={`
                  w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold
                  ${badge.bg} ${badge.text} shadow-lg
                `}>
                  {typeof badge.icon === 'string' && badge.icon.startsWith('#') 
                    ? badge.icon 
                    : <span className="text-xl">{badge.icon}</span>
                  }
                </div>
                
                {/* Team Info */}
                <div className="flex-1 min-w-0 max-w-md">
                  <h4 className="font-bold text-xl text-gray-900 dark:text-white truncate">
                    {member.teamName}
                  </h4>
                </div>
              </div>
              
              {/* Stats + Button Container */}
              <div className="flex items-center gap-6">
                {/* Stats */}
                <div className="flex items-center gap-8">
                  <div className="text-right min-w-[80px]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">This Week</div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                      {thisWeek}
                    </div>
                  </div>
                  
                  <div className="text-right min-w-[80px]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Average</div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                      {avgPoints}
                    </div>
                  </div>
                  
                  <div className="text-right min-w-[80px]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Change</div>
                    {weeklyChange ? (
                      <div className={`text-xl font-bold ${weeklyChange.color} flex items-center justify-end gap-1`}>
                        <span>{weeklyChange.icon}</span>
                        <span>{weeklyChange.value}</span>
                      </div>
                    ) : (
                      <div className="text-xl font-bold text-gray-400">-</div>
                    )}
                  </div>
                  
                  <div className="text-right min-w-[100px]">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Points</div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                      {Math.round((member.totalSeasonPoints || 0) * 100) / 100}
                    </div>
                  </div>
                </div>
                
                {/* View Lineup Button - Desktop */}
                <div>
                  <button
                    onClick={() => setExpandedMember(expandedMember === member.uid ? null : member.uid)}
                    className="shadow-theme-xs inline-flex h-6 items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                  >
                    {expandedMember === member.uid ? 'Hide Lineup' : 'View Lineup'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* View Lineup Button - Mobile */}
            <div className="md:hidden mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setExpandedMember(expandedMember === member.uid ? null : member.uid)}
                className="w-full shadow-theme-xs inline-flex h-8 items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              >
                {expandedMember === member.uid ? 'Hide Lineup' : 'View Lineup'}
              </button>
            </div>
            
            {/* Inline Lineup Expansion */}
            {expandedMember === member.uid && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-in slide-in-from-top-2 duration-300">
                <MemberLineupInline member={member} leagueId={leagueId} />
              </div>
            )}

            {/* Position indicator for top 3 */}
            {position <= 3 && (
              <div className="absolute -top-1 -right-1">
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${badge.bg} ${badge.text} shadow-sm
                `}>
                  {position}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Show More/Less Button */}
      {sortedMembers.length > 5 && (
        <div className="text-center pt-4">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm font-medium"
          >
            {showAll 
              ? `Show Top 5 (${sortedMembers.length - 5} hidden)`
              : `Show All ${sortedMembers.length} Members`
            }
          </button>
        </div>
      )}
    </div>
  );
}