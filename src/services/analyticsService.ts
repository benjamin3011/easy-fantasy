import { collection, query, where, orderBy, limit, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { APP_CONFIG } from '../config/appConfig';

// ===== TYPES =====

export interface WeeklyPerformance {
  week: number;
  points: number;
  rank: number;
  leagueSize: number;
  lineupComplete: boolean;
  captainPoints: number;
  captainPosition: string;
}

export interface SeasonStats {
  totalPoints: number;
  averagePoints: number;
  bestWeek: number;
  worstWeek: number;
  currentRank: number;
  weeksPlayed: number;
  consistency: number; // 0-100 score
}

export interface UsageAnalytics {
  totalUsed: number;
  totalAvailable: number;
  efficiency: number; // Points per pick used
  recommendedPicks: string[];
  underusedGems: string[];
}

export interface CaptainAnalytics {
  totalCaptainPoints: number;
  totalBonusPoints: number;
  roi: number; // Return on investment percentage
  bestPosition: string;
  successRate: number;
  recentForm: number; // Last 4 weeks
  positionBreakdown: Record<string, {
    count: number;
    totalPoints: number;
    totalBonus: number;
    averagePoints: number;
    averageBonus: number;
    successRate: number;
  }>;
  streaks: {
    current: number;
    best: number;
    isPositive: boolean;
  };
  recommendations: string[];
}

export interface CompetitiveMetrics {
  leagueRank: number;
  leagueSize: number;
  pointsAboveAverage: number;
  winStreak: number;
  trend: 'up' | 'down' | 'stable';
}

export interface UserAnalytics {
  userId: string;
  leagueId: string;
  season: number;
  seasonStats: SeasonStats;
  weeklyPerformance: WeeklyPerformance[];
  usageAnalytics: UsageAnalytics;
  captainAnalytics: CaptainAnalytics;
  competitiveMetrics: CompetitiveMetrics;
  lastUpdated: Date;
}

// ===== CORE ANALYTICS FUNCTIONS =====

export async function fetchUserAnalytics(
  userId: string, 
  leagueId: string, 
  season: number = parseInt(APP_CONFIG.CURRENT_NFL_SEASON.toString())
): Promise<UserAnalytics | null> {
  try {
    
    // Fetch user's weekly lineups for this league/season
    const weeklyLineups = await fetchUserWeeklyLineups(userId, leagueId, season);
    
    if (weeklyLineups.length === 0) {
      if (import.meta.env.DEV) console.log('⚠️ No lineup data found for analytics');
      return null;
    }

    // Fetch league standings for competitive context
    const leagueStandings = await fetchLeagueStandings(leagueId, season);
    
    // Calculate all analytics
    const seasonStats = calculateSeasonStats(weeklyLineups);
    const weeklyPerformance = calculateWeeklyPerformance(weeklyLineups, leagueStandings);
    const usageAnalytics = await calculateUsageAnalytics(userId, leagueId, season);
    const captainAnalytics = calculateCaptainAnalytics(weeklyLineups);
    const competitiveMetrics = calculateCompetitiveMetrics(weeklyLineups, leagueStandings, userId);

    return {
      userId,
      leagueId,
      season,
      seasonStats,
      weeklyPerformance,
      usageAnalytics,
      captainAnalytics,
      competitiveMetrics,
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return null;
  }
}

// ===== DATA FETCHING HELPERS =====

async function fetchUserWeeklyLineups(userId: string, leagueId: string, season: number) {
  const lineupsRef = collection(db, 'users', userId, 'weeklyLineups');
  const q = query(
    lineupsRef,
    where('leagueId', '==', leagueId),
    where('season', '==', season),
    orderBy('week', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchLeagueStandings(_leagueId: string, _season: number) {
  // This would fetch league standings data
  // For now, return mock data structure
  return [];
}

// ===== CALCULATION FUNCTIONS =====

function calculateSeasonStats(weeklyLineups: DocumentData[]): SeasonStats {
  if (weeklyLineups.length === 0) {
    return {
      totalPoints: 0,
      averagePoints: 0,
      bestWeek: 0,
      worstWeek: 0,
      currentRank: 0,
      weeksPlayed: 0,
      consistency: 0
    };
  }

  const weeklyPoints = weeklyLineups
    .filter(lineup => typeof lineup.totalActualPoints === 'number' && lineup.totalActualPoints >= 0)
    .map(lineup => lineup.totalActualPoints as number);

  const totalPoints = weeklyPoints.reduce((sum, points) => sum + points, 0);
  const averagePoints = totalPoints / weeklyPoints.length;
  const bestWeek = Math.max(...weeklyPoints);
  const worstWeek = Math.min(...weeklyPoints);
  
  // Calculate consistency (lower standard deviation = higher consistency)
  const variance = weeklyPoints.reduce((sum, points) => 
    sum + Math.pow(points - averagePoints, 2), 0) / weeklyPoints.length;
  const standardDeviation = Math.sqrt(variance);
  const consistency = Math.max(0, 100 - (standardDeviation / averagePoints * 100));

  return {
    totalPoints,
    averagePoints: Math.round(averagePoints * 10) / 10,
    bestWeek,
    worstWeek,
    currentRank: 0, // Will be calculated from league context
    weeksPlayed: weeklyPoints.length,
    consistency: Math.round(consistency)
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateWeeklyPerformance(weeklyLineups: DocumentData[], _leagueStandings: DocumentData[]): WeeklyPerformance[] {
  return weeklyLineups
    .filter(lineup => typeof lineup.totalActualPoints === 'number' && lineup.totalActualPoints >= 0)
    .map(lineup => ({
      week: lineup.week,
      points: lineup.totalActualPoints ?? 0,
      rank: 0, // Would need league context
      leagueSize: 0, // Would need league context
      lineupComplete: lineup.isComplete || false,
      captainPoints: (typeof lineup.captainMultipliedPoints === 'number' ? lineup.captainMultipliedPoints : 0),
      captainPosition: lineup.captainPosition || 'Unknown'
    }));
}

async function calculateUsageAnalytics(userId: string, leagueId: string, season: number): Promise<UsageAnalytics> {
  try {
    // Fetch user's weekly lineups for this league/season
    const weeklyLineups = await fetchUserWeeklyLineups(userId, leagueId, season);
    
    if (weeklyLineups.length === 0) {
      return {
        totalUsed: 0,
        totalAvailable: 0,
        efficiency: 0,
        recommendedPicks: [],
        underusedGems: []
      };
    }

    // Track usage counts for each entity
    const entityUsage: Record<string, { count: number; totalPoints: number; name: string; type: 'player' | 'team' }> = {};
    
    // Helper function to safely access lineup properties
    const getLineupProperty = (lineup: DocumentData, key: string) => {
      return lineup[key] as { id?: string; name?: string; points?: number } | undefined;
    };

    // Process each lineup to count usage
    weeklyLineups.forEach(lineup => {
      // Process player selections
      ['qb', 'rb', 'wr', 'te'].forEach(position => {
        const player = getLineupProperty(lineup, position);
        if (player?.id) {
          const key = `player_${player.id}`;
          if (!entityUsage[key]) {
            entityUsage[key] = { count: 0, totalPoints: 0, name: player.name || 'Unknown Player', type: 'player' };
          }
          entityUsage[key].count++;
          entityUsage[key].totalPoints += player.points || 0;
        }
      });

      // Process team selections
      ['passingOffense', 'rushingOffense', 'defense', 'specialTeams'].forEach(position => {
        const team = getLineupProperty(lineup, position);
        if (team?.id) {
          const key = `team_${team.id}`;
          if (!entityUsage[key]) {
            entityUsage[key] = { count: 0, totalPoints: 0, name: team.name || 'Unknown Team', type: 'team' };
          }
          entityUsage[key].count++;
          entityUsage[key].totalPoints += team.points || 0;
        }
      });
    });

    // Calculate metrics
    const totalPicks = Object.values(entityUsage).reduce((sum, entity) => sum + entity.count, 0);
    const totalAvailablePicks = weeklyLineups.length * 8; // 8 picks per week
    const usageEfficiency = totalPicks > 0 
      ? Object.values(entityUsage).reduce((sum, entity) => sum + entity.totalPoints, 0) / totalPicks 
      : 0;

    // Find underused gems (high points per use, low usage count)
    const underusedGems = Object.entries(entityUsage)
      .filter(([, data]) => data.count >= 1 && data.count <= 2) // Used 1-2 times
      .map(([key, data]) => ({
        id: key,
        name: data.name,
        type: data.type,
        avgPoints: data.totalPoints / data.count,
        usageCount: data.count
      }))
      .filter(entity => entity.avgPoints > usageEfficiency) // Above average performance
      .sort((a, b) => b.avgPoints - a.avgPoints)
      .slice(0, 3)
      .map(entity => `${entity.name} (${entity.avgPoints.toFixed(1)} avg pts)`);

    // Find recommended picks (entities approaching but not at limit)
    const recommendedPicks = Object.entries(entityUsage)
      .filter(([, data]) => data.count >= 3 && data.count <= 4) // Used 3-4 times (approaching limit)
      .map(([key, data]) => ({
        id: key,
        name: data.name,
        avgPoints: data.totalPoints / data.count,
        usageCount: data.count
      }))
      .filter(entity => entity.avgPoints > usageEfficiency) // Above average performance
      .sort((a, b) => b.avgPoints - a.avgPoints)
      .slice(0, 3)
      .map(entity => `${entity.name} (${5 - entity.usageCount} left)`);

    return {
      totalUsed: totalPicks,
      totalAvailable: totalAvailablePicks,
      efficiency: Math.round(usageEfficiency * 10) / 10,
      recommendedPicks,
      underusedGems
    };

  } catch (error) {
    console.error('Error calculating usage analytics:', error);
    return {
      totalUsed: 0,
      totalAvailable: 0,
      efficiency: 0,
      recommendedPicks: [],
      underusedGems: []
    };
  }
}

function calculateCaptainAnalytics(weeklyLineups: DocumentData[]): CaptainAnalytics {
  const captainWeeks = weeklyLineups.filter(lineup => 
    typeof lineup.captainMultipliedPoints === 'number' && typeof lineup.captainBasePoints === 'number'
  );

  if (captainWeeks.length === 0) {
    return {
      totalCaptainPoints: 0,
      totalBonusPoints: 0,
      roi: 0,
      bestPosition: 'QB',
      successRate: 0,
      recentForm: 0,
      positionBreakdown: {},
      streaks: { current: 0, best: 0, isPositive: false },
      recommendations: []
    };
  }

  const totalCaptainPoints = captainWeeks.reduce((sum, lineup) => 
    sum + (lineup.captainMultipliedPoints as number), 0);
  const totalBasePoints = captainWeeks.reduce((sum, lineup) => 
    sum + (lineup.captainBasePoints as number), 0);
  const totalBonusPoints = totalCaptainPoints - totalBasePoints;
  
  const roi = totalBasePoints > 0 ? (totalBonusPoints / totalBasePoints) * 100 : 0;

  // Calculate detailed position breakdown
  const positionStats: Record<string, { total: number; bonus: number; count: number }> = {};
  captainWeeks.forEach(lineup => {
    const pos = lineup.captainPosition || 'Unknown';
    if (!positionStats[pos]) {
      positionStats[pos] = { total: 0, bonus: 0, count: 0 };
    }
    positionStats[pos].total += (lineup.captainMultipliedPoints as number);
    positionStats[pos].bonus += ((lineup.captainMultipliedPoints as number) - (lineup.captainBasePoints as number));
    positionStats[pos].count += 1;
  });

  // Calculate recent form (last 4 weeks) - moved up to fix declaration order
  const recentWeeks = captainWeeks.slice(-4);
  const recentBonus = recentWeeks.reduce((sum, lineup) => 
    sum + ((lineup.captainMultipliedPoints as number) - (lineup.captainBasePoints as number)), 0);
  const recentBase = recentWeeks.reduce((sum, lineup) => 
    sum + (lineup.captainBasePoints as number), 0);
  const recentForm = recentBase > 0 ? (recentBonus / recentBase) * 100 : 0;

  // Create position breakdown with detailed stats
  const positionBreakdown: Record<string, {
    count: number;
    totalPoints: number;
    totalBonus: number;
    averagePoints: number;
    averageBonus: number;
    successRate: number;
  }> = {};
  
  Object.entries(positionStats).forEach(([pos, stats]) => {
    const averagePoints = stats.total / stats.count;
    const averageBonus = stats.bonus / stats.count;
    const successRate = averageBonus > 0 ? Math.min(100, (averageBonus / (averagePoints - averageBonus)) * 100) : 0;
    
    positionBreakdown[pos] = {
      count: stats.count,
      totalPoints: Math.round(stats.total * 10) / 10,
      totalBonus: Math.round(stats.bonus * 10) / 10,
      averagePoints: Math.round(averagePoints * 10) / 10,
      averageBonus: Math.round(averageBonus * 10) / 10,
      successRate: Math.round(successRate * 10) / 10
    };
  });

  const bestPosition = Object.entries(positionBreakdown).reduce((best, [pos, stats]) => {
    const bestStats = positionBreakdown[best];
    return (!bestStats || stats.averageBonus > bestStats.averageBonus) ? pos : best;
  }, Object.keys(positionBreakdown)[0] || 'QB');

  // Calculate streaks (simplified: consecutive weeks with positive/negative bonus)
  const bonusResults = captainWeeks.map(lineup => 
    ((lineup.captainMultipliedPoints as number) - (lineup.captainBasePoints as number)) > 0
  );
  
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let lastResult = bonusResults[0];
  
  bonusResults.forEach((result, index) => {
    if (index === 0 || result === lastResult) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }
    
    if (index === bonusResults.length - 1) {
      currentStreak = tempStreak;
    }
    
    bestStreak = Math.max(bestStreak, tempStreak);
    lastResult = result;
  });

  // Generate recommendations
  const recommendations: string[] = [];
  const sortedPositions = Object.entries(positionBreakdown)
    .sort(([,a], [,b]) => b.averageBonus - a.averageBonus);
  
  if (sortedPositions.length > 1) {
    const topPos = sortedPositions[0];
    if (topPos[1].count >= 2) {
      recommendations.push(`${topPos[0]}s are your strongest captain choice (${topPos[1].averageBonus.toFixed(1)} avg bonus)`);
    }
  }
  
  if (recentForm < roi * 0.7) {
    recommendations.push("Recent captain form is below your season average - consider switching positions");
  }

  return {
    totalCaptainPoints: Math.round(totalCaptainPoints * 10) / 10,
    totalBonusPoints: Math.round(totalBonusPoints * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    bestPosition,
    successRate: roi > 0 ? Math.min(100, roi * 2) : 0, // Simplified calculation
    recentForm: Math.round(recentForm * 10) / 10,
    positionBreakdown,
    streaks: {
      current: currentStreak,
      best: bestStreak,
      isPositive: bonusResults[bonusResults.length - 1] || false
    },
    recommendations: recommendations.slice(0, 2) // Limit to top 2 recommendations
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateCompetitiveMetrics(weeklyLineups: DocumentData[], _leagueStandings: DocumentData[], _userId: string): CompetitiveMetrics {
  // This would need actual league data for proper calculation
  // For now, return mock structure with basic trend analysis
  
  if (weeklyLineups.length < 2) {
    return {
      leagueRank: 0,
      leagueSize: 0,
      pointsAboveAverage: 0,
      winStreak: 0,
      trend: 'stable'
    };
  }

  // Calculate trend from last few weeks
  const recentWeeks = weeklyLineups.slice(-4);
  const firstHalf = recentWeeks.slice(0, 2);
  const secondHalf = recentWeeks.slice(2);
  
  const firstAvg = firstHalf.reduce((sum, w) => sum + (w.totalPoints || 0), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, w) => sum + (w.totalPoints || 0), 0) / secondHalf.length;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (secondAvg > firstAvg * 1.05) trend = 'up';
  else if (secondAvg < firstAvg * 0.95) trend = 'down';

  return {
    leagueRank: 0, // Would need league context
    leagueSize: 0, // Would need league context
    pointsAboveAverage: 0, // Would need league context
    winStreak: 0, // Would need week-by-week rankings
    trend
  };
}

// ===== QUICK PERFORMANCE HELPERS =====

export async function getQuickPerformanceData(userId: string, leagueId: string) {
  try {
    const currentWeek = calculateCurrentNFLWeek();
    const season = parseInt(APP_CONFIG.CURRENT_NFL_SEASON.toString());
    
    // Get current week lineup
    const currentWeekLineup = await getCurrentWeekLineup(userId, leagueId, currentWeek, season);
    
    // Get last 4 weeks for trend
    const recentLineups = await getRecentLineups(userId, leagueId, season, 4);
    
    // Calculate quick metrics (use totalActualPoints written by score calc)
    const currentWeekPoints = currentWeekLineup?.totalActualPoints || 0;
    const recentAverage = recentLineups.length > 0 
      ? recentLineups.reduce((sum, lineup) => sum + (lineup.totalActualPoints || 0), 0) / recentLineups.length
      : 0;
    
    const trend = recentLineups.length >= 2 ? calculateQuickTrend(recentLineups) : 'stable';
    
    return {
      currentWeekPoints: Math.round(currentWeekPoints * 10) / 10,
      recentAverage: Math.round(recentAverage * 10) / 10,
      trend,
      weeksPlayed: recentLineups.length,
      hasCurrentWeekData: currentWeekLineup?.totalActualPoints != null
    };
    
  } catch (error) {
    console.error('Error getting quick performance data:', error);
    return {
      currentWeekPoints: 0,
      recentAverage: 0,
      trend: 'stable' as const,
      weeksPlayed: 0,
      hasCurrentWeekData: false
    };
  }
}

async function getCurrentWeekLineup(userId: string, leagueId: string, week: number, season: number) {
  const lineupsRef = collection(db, 'users', userId, 'weeklyLineups');
  const q = query(
    lineupsRef,
    where('leagueId', '==', leagueId),
    where('week', '==', week),
    where('season', '==', season),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs[0]?.data() || null;
}

async function getRecentLineups(userId: string, leagueId: string, season: number, count: number) {
  const lineupsRef = collection(db, 'users', userId, 'weeklyLineups');
  const q = query(
    lineupsRef,
    where('leagueId', '==', leagueId),
    where('season', '==', season),
    orderBy('week', 'desc'),
    limit(count)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data()).reverse(); // Reverse to get chronological order
}

function calculateQuickTrend(lineups: DocumentData[]): 'up' | 'down' | 'stable' {
  if (lineups.length < 2) return 'stable';
  
  const firstHalf = lineups.slice(0, Math.floor(lineups.length / 2));
  const secondHalf = lineups.slice(Math.floor(lineups.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, lineup) => sum + (lineup.totalActualPoints || 0), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, lineup) => sum + (lineup.totalActualPoints || 0), 0) / secondHalf.length;
  
  if (secondAvg > firstAvg * 1.05) return 'up';
  if (secondAvg < firstAvg * 0.95) return 'down';
  return 'stable';
} 