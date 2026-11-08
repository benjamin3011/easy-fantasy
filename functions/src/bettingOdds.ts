// Tank01 getNFLBettingOdds with itemFormat=list.
// Moneyline fields are homeTeamML / awayTeamML. The older guide names
// homeTeamMLOdds / awayTeamMLOdds are accepted so a shape change does not
// crash the daily odds update.

export interface SportsbookLine {
  odds?: {
    homeTeamML?: string;
    awayTeamML?: string;
    homeTeamMLOdds?: string;
    awayTeamMLOdds?: string;
  };
}

export interface WinProbabilities {
  home: number;
  away: number;
}

export function moneylineToWinProbability(odds: unknown): number {
  if (typeof odds !== 'string' || odds.trim() === '') return NaN;

  const numericOdds = parseFloat(odds.replace(/[+\s]/g, ''));
  if (!Number.isFinite(numericOdds) || numericOdds === 0) return NaN;

  if (numericOdds > 0) {
    return (100 / (numericOdds + 100)) * 100;
  }
  return (Math.abs(numericOdds) / (Math.abs(numericOdds) + 100)) * 100;
}

function readMoneyline(book: SportsbookLine, side: 'home' | 'away'): unknown {
  const odds = book.odds;
  if (!odds) return undefined;
  return side === 'home'
    ? odds.homeTeamML ?? odds.homeTeamMLOdds
    : odds.awayTeamML ?? odds.awayTeamMLOdds;
}

/** Null when no sportsbook has a usable moneyline on both sides. */
export function calculateConsensusWinProbabilities(
  sportsBooks: SportsbookLine[]
): WinProbabilities | null {
  const pairs: WinProbabilities[] = [];

  for (const book of sportsBooks) {
    const home = moneylineToWinProbability(readMoneyline(book, "home"));
    const away = moneylineToWinProbability(readMoneyline(book, "away"));
    if (!Number.isFinite(home) || !Number.isFinite(away) || home <= 0 || away <= 0) {
      continue;
    }
    pairs.push({ home, away });
  }

  if (pairs.length === 0) return null;

  const avgHome = pairs.reduce((sum, pair) => sum + pair.home, 0) / pairs.length;
  const avgAway = pairs.reduce((sum, pair) => sum + pair.away, 0) / pairs.length;
  const total = avgHome + avgAway;
  if (total <= 0) return null;

  return {
    home: Math.round((avgHome / total) * 100),
    away: Math.round((avgAway / total) * 100),
  };
}
