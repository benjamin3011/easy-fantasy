// Real NFL news service using Tank01 API via Firebase functions
// Uses existing robust news infrastructure with 5-minute caching

export interface NewsItem {
  id: string;
  title: string; // Full descriptive title
  chipTitle?: string; // Short mobile-friendly chip version
  summary: string;
  team?: string;
  player?: string;
  playerIDs?: string[]; // Tank01 provides player associations
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  source: string;
}

// ESPN team abbreviation mapping for consistency
const TEAM_MAPPING: Record<string, string> = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF', 'CAR': 'CAR',
  'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE', 'DAL': 'DAL', 'DEN': 'DEN',
  'DET': 'DET', 'GB': 'GB', 'HOU': 'HOU', 'IND': 'IND', 'JAC': 'JAX',
  'JAX': 'JAC', 'KC': 'KC', 'LV': 'LVR', 'LVR': 'LV', 'LAC': 'LAC',
  'LAR': 'LAR', 'MIA': 'MIA', 'MIN': 'MIN', 'NE': 'NE', 'NO': 'NO',
  'NYG': 'NYG', 'NYJ': 'NYJ', 'PHI': 'PHI', 'PIT': 'PIT', 'SF': 'SF',
  'SEA': 'SEA', 'TB': 'TB', 'TEN': 'TEN', 'WAS': 'WAS'
};

// Helper functions for real news API integration
function generateChipTitle(): string {
  // Much simpler approach - just return "News" for all items
  // The actual title will be shown when expanded
  return "News";
}

function determineSeverity(title: string, summary: string): 'low' | 'medium' | 'high' {
  const text = (title + ' ' + summary).toLowerCase();
  
  // High severity - injuries, suspensions, major status changes
  if (text.includes('questionable') || text.includes('doubtful') || text.includes('injured') || 
      text.includes('suspension') || text.includes('arrested') || text.includes('out for season')) {
    return 'high';
  }
  
  // Medium severity - probable, trending, weather, lineup changes
  if (text.includes('probable') || text.includes('trending') || text.includes('weather') || 
      text.includes('increased role') || text.includes('starting') || text.includes('cleared')) {
    return 'medium';
  }
  
  // Low severity - everything else
  return 'low';
}

async function fetchTank01News(): Promise<NewsItem[]> {
  try {
    // Use existing Tank01 API via Firebase functions (has 5-min caching)
    const { fetchNews } = await import('../utils/api/news');
    const tank01News = await fetchNews();
    
    return tank01News.map((article, index) => {
      const title = article.title;
      // Create summary from title since Tank01 doesn't provide descriptions
      const summary = `${title} - Latest NFL news and updates from ${article.source}`;
      const publishedDate = new Date(article.published);
      
      // Extract team from title content - improved detection
      let team = '';
      const titleUpper = title.toUpperCase();
      
      // Check for team names and common abbreviations
      for (const [abbr] of Object.entries(TEAM_MAPPING)) {
        if (titleUpper.includes(` ${abbr} `) || titleUpper.includes(`${abbr}:`) || 
            titleUpper.includes(`${abbr},`) || titleUpper.startsWith(`${abbr} `) ||
            titleUpper.includes(abbr.toLowerCase())) {
          team = abbr;
          break;
        }
      }
      
      // If no team found, try full team names
      if (!team) {
        const teamNames: Record<string, string> = {
          'CHIEFS': 'KC', 'BILLS': 'BUF', 'DOLPHINS': 'MIA', 'PATRIOTS': 'NE',
          'RAVENS': 'BAL', 'BENGALS': 'CIN', 'BROWNS': 'CLE', 'STEELERS': 'PIT',
          'TITANS': 'TEN', 'COLTS': 'IND', 'JAGUARS': 'JAC', 'TEXANS': 'HOU',
          'BRONCOS': 'DEN', 'CHARGERS': 'LAC', 'RAIDERS': 'LV', 'COWBOYS': 'DAL',
          'GIANTS': 'NYG', 'EAGLES': 'PHI', 'COMMANDERS': 'WAS', 'BEARS': 'CHI',
          'PACKERS': 'GB', 'LIONS': 'DET', 'VIKINGS': 'MIN', 'FALCONS': 'ATL',
          'PANTHERS': 'CAR', 'SAINTS': 'NO', 'BUCCANEERS': 'TB', 'CARDINALS': 'ARI',
          '49ERS': 'SF', 'RAMS': 'LAR', 'SEAHAWKS': 'SEA'
        };
        
        for (const [name, abbr] of Object.entries(teamNames)) {
          if (titleUpper.includes(name)) {
            team = abbr;
            break;
          }
        }
      }
      
      return {
        id: article.id || `tank01-${index}`,
        title,
        chipTitle: generateChipTitle(),
        summary: summary.length > 150 ? summary.substring(0, 150) + '...' : summary,
        team: team.toUpperCase(),
        playerIDs: article.playerIDs || [],
        severity: determineSeverity(title, summary),
        timestamp: publishedDate,
        source: article.source
      };
    });
    
  } catch (error) {
    console.warn('Failed to fetch Tank01 news, falling back to mock data:', error);
    return [];
  }
}

// Fallback mock news for development/testing
const fallbackNews: NewsItem[] = [
  {
    id: '1',
    title: 'Patrick Mahomes Listed as Questionable with Ankle Injury',
    chipTitle: 'Mahomes Q',
    summary: 'Patrick Mahomes listed as questionable with ankle injury for Sunday\'s game. Monitor practice participation.',
    team: 'KC',
    player: 'Patrick Mahomes',
    severity: 'high',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    source: 'NFL.com'
  },
  {
    id: '2', 
    title: 'Buffalo Defense Expected to Dominate in Favorable Matchup',
    chipTitle: 'BUF DST ↑',
    summary: 'Buffalo defense ranked #1 against opposing offense this week. Strong play expected.',
    team: 'BUF',
    severity: 'medium',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    source: 'FantasyPros'
  },
  {
    id: '3',
    title: 'High Winds Expected in Chicago Game',
    chipTitle: 'CHI Wind ⚠',
    summary: 'Weather forecast shows 25+ mph winds in Chicago, could significantly impact passing game.',
    team: 'CHI',
    severity: 'medium',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    source: 'Weather.com'
  },
  {
    id: '4',
    title: 'Surprise Rookie RB Getting Increased Touches',
    chipTitle: 'LAR RB ↗',
    summary: 'Rookie running back expected to see 40%+ snap share after strong practice week.',
    team: 'LAR',
    severity: 'low',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
    source: 'ESPN'
  },
  {
    id: '5',
    title: 'Tight End Seeing Increased Red Zone Targets',
    chipTitle: 'MIA TE RZ',
    summary: 'Starting tight end has 8 red zone targets over the last 3 games. Strong TD potential.',
    team: 'MIA',
    severity: 'low',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    source: 'Yahoo Sports'
  },
  {
    id: '6',
    title: 'Travis Kelce Expected to Play Despite Knee Concern',
    chipTitle: 'Kelce OK',
    summary: 'Star tight end practiced in full and is expected to play despite knee issue reported earlier.',
    team: 'KC',
    player: 'Travis Kelce',
    severity: 'medium',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    source: 'ESPN'
  },
  {
    id: '7',
    title: 'Cold Weather Could Favor KC Running Game',
    chipTitle: 'KC Cold ❄',
    summary: 'Temperatures below 30°F expected. Historical data shows increased rushing attempts in these conditions.',
    team: 'KC',
    severity: 'low',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    source: 'Weather.com'
  },
  {
    id: '8',
    title: 'Key Buffalo Defender Cleared from Concussion Protocol',
    chipTitle: 'BUF D Back',
    summary: 'Starting linebacker cleared to play after passing concussion protocol. Defense at full strength.',
    team: 'BUF',
    severity: 'medium',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    source: 'NFL.com'
  },
  {
    id: '9',
    title: 'Houston QB Dealing with Shoulder Soreness',
    chipTitle: 'HOU QB ⚠',
    summary: 'Starting quarterback listed on injury report with shoulder issue. Monitor for game-time decision.',
    team: 'HOU',
    severity: 'high',
    timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
    source: 'NFL.com'
  },
  {
    id: '10',
    title: 'Dolphins WR1 Limited in Practice',
    chipTitle: 'MIA WR1 Ltd',
    summary: 'Top receiver had limited participation in Wednesday practice with hamstring tightness.',
    team: 'MIA',
    severity: 'medium',
    timestamp: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 hours ago
    source: 'ESPN'
  }
];

export async function getFantasyNews(): Promise<NewsItem[]> {
  // Try to fetch real Tank01 news first
  const tank01News = await fetchTank01News();
  
  // If Tank01 news is available, use it; otherwise use fallback
  const allNews = tank01News.length > 0 ? tank01News : fallbackNews;
  
  // Return news sorted by severity and recency
  return allNews.sort((a: NewsItem, b: NewsItem) => {
    const severityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const severityDiff = severityWeight[b.severity] - severityWeight[a.severity];
    
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

export async function getNewsForTeam(teamCode: string): Promise<NewsItem[]> {
  const allNews = await getFantasyNews();
  return allNews.filter(news => news.team === teamCode.toUpperCase());
}

export async function getNewsForGame(homeTeam: string, awayTeam: string): Promise<NewsItem[]> {
  const allNews = await getFantasyNews();
  return allNews.filter(news => 
    news.team === homeTeam.toUpperCase() || news.team === awayTeam.toUpperCase()
  );
}

export async function getNewsForPlayer(playerId: string): Promise<NewsItem[]> {
  const allNews = await getFantasyNews();
  return allNews.filter(news => 
    news.playerIDs && news.playerIDs.includes(playerId)
  );
}

export async function getTopNews(limit: number = 3): Promise<NewsItem[]> {
  const allNews = await getFantasyNews();
  return allNews.slice(0, limit);
}

export function formatTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffHours >= 24) {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } else if (diffHours >= 1) {
    return `${diffHours}h ago`;
  } else {
    return `${diffMinutes}m ago`;
  }
}

export function getSeverityColor(severity: NewsItem['severity']): string {
  switch (severity) {
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

export function getDisplayTitle(newsItem: NewsItem, context: 'chip' | 'full' = 'chip'): string {
  if (context === 'chip' && newsItem.chipTitle) {
    return newsItem.chipTitle;
  }
  return newsItem.title;
} 