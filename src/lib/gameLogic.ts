import { CardAttempt, AttemptResult } from '@/types';

export function scoreForCard(wrongAttempts: number, result: AttemptResult): number {
  if (result === 'auto-placed') return 0;
  if (wrongAttempts === 0) return 3;
  if (wrongAttempts === 1) return 2;
  if (wrongAttempts === 2) return 1;
  return 0;
}

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function maxPossibleScore(count: number): number {
  return count * 3;
}

export interface RecapStats {
  total: number;
  noWrong: number;    // 3 pts
  oneWrong: number;   // 2 pts
  twoWrong: number;   // 1 pt
  autoPlaced: number; // 0 pts
  score: number;
  maxScore: number;
  byRegion: Record<string, { correct: number; autoPlaced: number }>;
}

export function computeRecapStats(history: CardAttempt[]): RecapStats {
  const stats: RecapStats = {
    total: history.length,
    noWrong: 0,
    oneWrong: 0,
    twoWrong: 0,
    autoPlaced: 0,
    score: 0,
    maxScore: maxPossibleScore(history.length),
    byRegion: {},
  };

  for (const card of history) {
    if (card.result === 'auto-placed') {
      stats.autoPlaced++;
      for (const region of card.autoPlacedRegions) {
        if (!stats.byRegion[region]) stats.byRegion[region] = { correct: 0, autoPlaced: 0 };
        stats.byRegion[region].autoPlaced++;
      }
    } else {
      if (card.wrongAttempts === 0) stats.noWrong++;
      else if (card.wrongAttempts === 1) stats.oneWrong++;
      else stats.twoWrong++;
      for (const region of card.foundRegions) {
        if (!stats.byRegion[region]) stats.byRegion[region] = { correct: 0, autoPlaced: 0 };
        stats.byRegion[region].correct++;
      }
    }
    stats.score += scoreForCard(card.wrongAttempts, card.result);
  }

  return stats;
}
