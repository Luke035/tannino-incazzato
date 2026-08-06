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

// `abandoned` is a paper walked away from on purpose. It frees the one
// in-progress slot, keeps no score, and never enters statistics.
export type ExamStatus = 'in_progress' | 'submitted' | 'abandoned';
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
  options: string[]; // shuffled by the backend; ["VERO", "FALSO"] on true/false; [] on open
  topic: string | null;
  answer: string | null;
  verdict: ExamVerdict | null;
  correct_answer: string | null;
  // What the grading agent told the player about their own answer. Open
  // Questions only, and only once graded — never the bank's explanation of the
  // question, which a Closed Question does not get either.
  feedback: string | null;
}

// Which mode of the game a Session belongs to. There is one Session in
// progress at a time across all of them, so the mode is what tells a returning
// player which screen they were on.
export type QuizMode = 'exam' | 'practice' | 'review';

export interface Exam {
  id: number;
  mode: QuizMode;
  // The Level a Practice Session was drawn from. Null on an Exam, which is
  // deliberately blind across all three.
  level: QuestionLevel | null;
  status: ExamStatus;
  max_score: number;
  score: number | null;
  score_pct: number | null;
  passed: boolean | null;
  // False while an Open Question of a handed-in paper is still being graded.
  // Until it turns true there is no score: the recap shows the Closed
  // Questions and waits.
  grading_complete: boolean;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions: ExamQuestion[];
}

// Every mode is the same resource with a different `mode`, so they are the same
// payload. The alias is here so that code outside the Exam does not have to
// call a Session an Exam to say what it is holding.
export type QuizSession = Exam;

// An Error Review Session carries one thing the others do not: how many
// questions are still waiting to be Mastered, counted at the moment of asking.
// It is on every response because the number moves *during* the Session — that
// is what progress looks like in this mode.
export interface ReviewSession extends Exam {
  pending: number;
}

// How much is left to learn, before there is a Session to put it in. Zero is a
// real answer and not an error: emptying the pool is winning.
export interface ReviewPool {
  pending: number;
  // The bar a question has to clear, so no translation string has to hardcode
  // a rule that lives in the backend.
  mastery_sessions: number;
}

// What comes back from answering one question in a mode that marks as it goes —
// Practice or Error Review. The Verdict lands with the answer, which is the
// whole reason those modes exist. `verdict` is null only
// when the agent could not read a written answer — that is not a wrong answer,
// gives nothing away, and is retried by sending the same answer again.
export interface PracticeAnswerResult {
  question_id: number;
  answer: string | null;
  verdict: ExamVerdict | null;
  correct_answer: string | null;
  feedback: string | null;
}
