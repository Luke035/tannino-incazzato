// A Practice Session as the backend serves it: one chosen Level, the Exam's
// format proportions scaled to the length, and nothing given away about a
// question that has not been answered yet.
//
// The ids run from 200 so that nothing here can be mistaken for an Exam
// question, whose fixtures start at 100.
//
// The bank is Italian and stays Italian whatever the interface language, so
// these fixtures are too.

export const PRACTICE_ID = 11;
export const PRACTICE_LENGTH = 10;
export const PRACTICE_LEVEL = 2;

// `PRACTICE_COMPOSITION[10]` on the backend: 5 open, 4 multiple choice, 1
// true/false. Open Questions are the largest block at every length.
export const PRACTICE_MULTIPLE_CHOICE_COUNT = 4;
export const PRACTICE_TRUE_FALSE_COUNT = 1;
export const PRACTICE_OPEN_COUNT = 5;

type Format = 'multiple_choice' | 'true_false' | 'open';

export interface PracticeQuestionFixture {
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

// The option a correct answer would pick — or, on an Open Question, what a
// student who knows their material would write. Never served while the question
// is still being asked: the specs use it to answer, the way that student would.
export const PRACTICE_CORRECT: Record<number, string> = {};

// What the grading agent sends back on a written answer.
export const PRACTICE_FEEDBACK_WRONG = 'Ti mancava il nocciolo della risposta.';
export const PRACTICE_FEEDBACK_RIGHT = 'Ci siamo, il nocciolo c’è tutto.';

function question(position: number, format: Format): PracticeQuestionFixture {
  const id = 200 + position;
  const number = position + 1;
  const right =
    format === 'true_false'
      ? position % 2 === 0
        ? 'VERO'
        : 'FALSO'
      : `Risposta giusta ${number}`;
  PRACTICE_CORRECT[id] = right;

  const text =
    format === 'multiple_choice'
      ? `Domanda a scelta multipla ${number}`
      : format === 'true_false'
        ? `Domanda vero o falso ${number}`
        : `Domanda aperta ${number}`;

  return {
    question_id: id,
    position,
    text,
    format,
    level: PRACTICE_LEVEL,
    // shuffled by the backend: on multiple choice the right answer is not first
    options:
      format === 'multiple_choice'
        ? [`Risposta sbagliata ${number}A`, right, `Risposta sbagliata ${number}B`]
        : format === 'true_false'
          ? ['VERO', 'FALSO']
          : [], // free text: the question offers nothing to pick from
    topic: 'winemaking',
    answer: null,
    verdict: null,
    correct_answer: null,
    feedback: null,
  };
}

// Laid out in blocks rather than shuffled so that a spec can say "question 3"
// and mean something.
export const PRACTICE_QUESTIONS: PracticeQuestionFixture[] = Array.from(
  { length: PRACTICE_LENGTH },
  (_, position) => {
    if (position < PRACTICE_MULTIPLE_CHOICE_COUNT) return question(position, 'multiple_choice');
    if (position < PRACTICE_MULTIPLE_CHOICE_COUNT + PRACTICE_TRUE_FALSE_COUNT) {
      return question(position, 'true_false');
    }
    return question(position, 'open');
  }
);

export interface PracticeFixture {
  id: number;
  mode: 'practice';
  level: 1 | 2 | 3;
  status: 'in_progress' | 'submitted' | 'abandoned';
  max_score: number;
  score: number | null;
  score_pct: number | null;
  // Always null in Practice: nothing here is passed or failed.
  passed: null;
  grading_complete: boolean;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions: PracticeQuestionFixture[];
}

export function practiceInProgress(answered = 0): PracticeFixture {
  const questions = PRACTICE_QUESTIONS.map((one) => ({ ...one }));

  // What a student who was interrupted comes back to: the first `answered`
  // questions already marked, the rest untouched.
  for (const one of questions.slice(0, answered)) {
    one.answer = PRACTICE_CORRECT[one.question_id];
    one.verdict = 'correct';
    one.correct_answer = PRACTICE_CORRECT[one.question_id];
    if (one.format === 'open') one.feedback = PRACTICE_FEEDBACK_RIGHT;
  }

  return {
    id: PRACTICE_ID,
    mode: 'practice',
    level: PRACTICE_LEVEL,
    status: 'in_progress',
    max_score: PRACTICE_LENGTH,
    score: null,
    score_pct: null,
    passed: null,
    grading_complete: true,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    submitted_at: null,
    duration_seconds: null,
    questions,
  };
}
