export type DenominationType = 'DOC' | 'DOCG';

export interface Denomination {
  name: string;
  type: DenominationType;
  regions: string[]; // one or more Italian regions
}

export type AttemptResult = 'correct' | 'auto-placed';

export interface CardAttempt {
  denomination: Denomination;
  wrongAttempts: number;       // 0–3 wrong drops across all placements
  result: AttemptResult;
  foundRegions: string[];      // regions the student found correctly
  autoPlacedRegions: string[]; // regions auto-placed after 3 failures
}

export interface SessionState {
  queue: Denomination[];
  current: Denomination | null;
  wrongAttempts: number;    // wrong attempts for current card
  foundRegions: string[];   // correctly found so far for current card
  history: CardAttempt[];
  score: number;
  placedCards: Record<string, CardAttempt[]>; // region -> placed cards
}

export type Language = 'en' | 'it';
export type Filter = 'both' | 'DOC' | 'DOCG';
