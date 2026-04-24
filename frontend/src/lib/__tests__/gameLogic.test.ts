import { describe, it, expect } from 'vitest';
import { scoreForCard, maxPossibleScore, computeRecapStats } from '../gameLogic';
import type { CardAttempt } from '@/types';

describe('scoreForCard', () => {
  it('returns 3 for 0 wrong attempts', () => {
    expect(scoreForCard(0, 'correct')).toBe(3);
  });

  it('returns 2 for 1 wrong attempt', () => {
    expect(scoreForCard(1, 'correct')).toBe(2);
  });

  it('returns 1 for 2 wrong attempts', () => {
    expect(scoreForCard(2, 'correct')).toBe(1);
  });

  it('returns 0 when auto-placed regardless of wrong attempts', () => {
    expect(scoreForCard(0, 'auto-placed')).toBe(0);
    expect(scoreForCard(2, 'auto-placed')).toBe(0);
  });
});

describe('maxPossibleScore', () => {
  it('returns 3 points per card', () => {
    expect(maxPossibleScore(4)).toBe(12);
    expect(maxPossibleScore(0)).toBe(0);
  });
});

describe('computeRecapStats', () => {
  const makeCard = (
    wrongAttempts: number,
    result: 'correct' | 'auto-placed',
    regions: string[]
  ): CardAttempt => ({
    denomination: { name: 'Test', type: 'DOC', regions },
    wrongAttempts,
    result,
    foundRegions: result === 'correct' ? regions : [],
    autoPlacedRegions: result === 'auto-placed' ? regions : [],
  });

  it('counts total cards', () => {
    const stats = computeRecapStats([
      makeCard(0, 'correct', ['Toscana']),
      makeCard(1, 'correct', ['Veneto']),
    ]);
    expect(stats.total).toBe(2);
    expect(stats.maxScore).toBe(6);
  });

  it('buckets cards by wrong attempt count', () => {
    const stats = computeRecapStats([
      makeCard(0, 'correct', ['Lazio']),
      makeCard(1, 'correct', ['Lazio']),
      makeCard(2, 'correct', ['Lazio']),
      makeCard(3, 'auto-placed', ['Lazio']),
    ]);
    expect(stats.noWrong).toBe(1);
    expect(stats.oneWrong).toBe(1);
    expect(stats.twoWrong).toBe(1);
    expect(stats.autoPlaced).toBe(1);
  });

  it('sums score across all cards', () => {
    const stats = computeRecapStats([
      makeCard(0, 'correct', ['Sicilia']),   // 3
      makeCard(1, 'correct', ['Sicilia']),   // 2
      makeCard(3, 'auto-placed', ['Sicilia']), // 0
    ]);
    expect(stats.score).toBe(5);
  });

  it('aggregates byRegion for correct placements', () => {
    const stats = computeRecapStats([
      makeCard(0, 'correct', ['Toscana']),
      makeCard(1, 'correct', ['Toscana']),
    ]);
    expect(stats.byRegion['Toscana']).toEqual({ correct: 2, autoPlaced: 0 });
  });

  it('aggregates byRegion for auto-placed cards', () => {
    const stats = computeRecapStats([
      makeCard(3, 'auto-placed', ['Puglia']),
    ]);
    expect(stats.byRegion['Puglia']).toEqual({ correct: 0, autoPlaced: 1 });
  });

  it('returns empty stats for empty history', () => {
    const stats = computeRecapStats([]);
    expect(stats.total).toBe(0);
    expect(stats.score).toBe(0);
    expect(stats.byRegion).toEqual({});
  });
});
