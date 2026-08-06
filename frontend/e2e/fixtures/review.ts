// An Error Review Session as the backend serves it: drawn from this player's
// own unmastered questions, so it spans Levels, has no `level` of its own, and
// carries `pending` — how many questions are still waiting to be Mastered.
//
// The ids run from 300 so that nothing here can be mistaken for a Practice
// question (200s) or an Exam one (100s).
//
// The bank is Italian and stays Italian whatever the interface language, so
// these fixtures are too.

export const REVIEW_ID = 21;
export const REVIEW_LENGTH = 10;

// How much of this player's pool is still waiting when the spec starts. Larger
// than the Session so that the screens have to say both numbers and mean
// different things by them.
export const REVIEW_PENDING = 14;

// The rule, mirrored from `MASTERY_SESSIONS`.
export const REVIEW_MASTERY_SESSIONS = 3;

type Format = 'multiple_choice' | 'true_false' | 'open';

export interface ReviewQuestionFixture {
  question_id: number;
  position: number;
  text: string;
  format: Format;
  level: 1 | 2 | 3;
  options: string[];
  topic: string | null;
  answer: string | null;
  verdict: 'correct' | 'wrong' | null;
  correct_answer: string | null;
  feedback: string | null;
}

export const REVIEW_CORRECT: Record<number, string> = {};

export const REVIEW_FEEDBACK_WRONG = 'Ti mancava ancora il nocciolo della risposta.';
export const REVIEW_FEEDBACK_RIGHT = 'Stavolta ci siamo.';

function question(position: number, format: Format): ReviewQuestionFixture {
  const id = 300 + position;
  const number = position + 1;
  const right =
    format === 'true_false'
      ? position % 2 === 0
        ? 'VERO'
        : 'FALSO'
      : `Risposta giusta ${number}`;
  REVIEW_CORRECT[id] = right;

  const text =
    format === 'multiple_choice'
      ? `Errore a scelta multipla ${number}`
      : format === 'true_false'
        ? `Errore vero o falso ${number}`
        : `Errore a risposta aperta ${number}`;

  return {
    question_id: id,
    position,
    text,
    format,
    // Every Level at once: the pool is the player's record, not a syllabus.
    level: ((position % 3) + 1) as 1 | 2 | 3,
    options:
      format === 'multiple_choice'
        ? [`Risposta sbagliata ${number}A`, right, `Risposta sbagliata ${number}B`]
        : format === 'true_false'
          ? ['VERO', 'FALSO']
          : [],
    topic: 'legislation',
    answer: null,
    verdict: null,
    correct_answer: null,
    feedback: null,
  };
}

// Laid out in blocks rather than shuffled so that a spec can say "question 3"
// and mean something. There is no format composition in this mode — the pool
// is what it is — so the mix here is simply a mix.
export const REVIEW_QUESTIONS: ReviewQuestionFixture[] = Array.from(
  { length: REVIEW_LENGTH },
  (_, position) => {
    if (position < 4) return question(position, 'multiple_choice');
    if (position < 5) return question(position, 'true_false');
    return question(position, 'open');
  }
);

export interface ReviewFixture {
  id: number;
  mode: 'review';
  // Always null: an Error Review Session is not drawn from a Level.
  level: null;
  status: 'in_progress' | 'submitted' | 'abandoned';
  max_score: number;
  score: number | null;
  score_pct: number | null;
  // Always null: nothing here is passed or failed.
  passed: null;
  grading_complete: boolean;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions: ReviewQuestionFixture[];
  pending: number;
}

export function reviewInProgress(answered = 0): ReviewFixture {
  const questions = REVIEW_QUESTIONS.map((one) => ({ ...one }));

  for (const one of questions.slice(0, answered)) {
    one.answer = REVIEW_CORRECT[one.question_id];
    one.verdict = 'correct';
    one.correct_answer = REVIEW_CORRECT[one.question_id];
    if (one.format === 'open') one.feedback = REVIEW_FEEDBACK_RIGHT;
  }

  return {
    id: REVIEW_ID,
    mode: 'review',
    level: null,
    status: 'in_progress',
    max_score: REVIEW_LENGTH,
    score: null,
    score_pct: null,
    passed: null,
    grading_complete: true,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    submitted_at: null,
    duration_seconds: null,
    questions,
    pending: REVIEW_PENDING,
  };
}
