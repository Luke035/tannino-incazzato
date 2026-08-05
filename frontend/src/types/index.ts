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

// ── Promossi o Cirrotici (quiz) ───────────────────────────────────────────────

export type QuestionFormat = 'true_false' | 'multiple_choice' | 'open';
export type QuestionLevel = 1 | 2 | 3;

export type ExamStatus = 'in_progress' | 'submitted';
export type ExamVerdict = 'correct' | 'wrong';

// One question of the paper as the browser is allowed to see it. `verdict` and
// `correctAnswer` stay null until the Exam is handed in — the backend draws,
// shuffles and grades, and keeps the answers to itself in the meantime
// (ADR 0007).
export interface ExamQuestion {
  question_id: number;
  position: number;
  text: string;
  format: QuestionFormat;
  level: QuestionLevel;
  options: string[]; // shuffled by the backend; ["VERO", "FALSO"] on true/false
  topic: string | null;
  answer: string | null;
  verdict: ExamVerdict | null;
  correct_answer: string | null;
}

export interface Exam {
  id: number;
  mode: string;
  status: ExamStatus;
  max_score: number;
  score: number | null;
  score_pct: number | null;
  passed: boolean | null;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions: ExamQuestion[];
}
