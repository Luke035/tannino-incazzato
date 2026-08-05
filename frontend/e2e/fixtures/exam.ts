// A paper as the backend serves it: 14 open, 11 multiple choice and 5
// true/false, options already shuffled, no correct answer anywhere until it is
// handed in.
//
// The bank is Italian and stays Italian whatever the interface language, so
// these fixtures are too.

export const EXAM_LENGTH = 30;
export const OPEN_COUNT = 14;
export const MULTIPLE_CHOICE_COUNT = 11;
export const TRUE_FALSE_COUNT = 5;

type Format = 'multiple_choice' | 'true_false' | 'open';

export interface ExamQuestionFixture {
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
// student who knows their material would write. Never served while the paper
// is open: the specs use it to sit the exam, the way that student would.
export const CORRECT_OPTION: Record<number, string> = {};

// What the grading agent sends back on a written answer it did not accept.
export const OPEN_FEEDBACK = 'Ti mancava il nocciolo della risposta.';

function multipleChoice(position: number): ExamQuestionFixture {
  const id = 100 + position;
  const right = `Risposta giusta ${position + 1}`;
  // shuffled, as the backend serves it: the right answer is not first
  CORRECT_OPTION[id] = right;
  return {
    question_id: id,
    position,
    text: `Domanda a scelta multipla ${position + 1}`,
    format: 'multiple_choice',
    level: ((position % 3) + 1) as 1 | 2 | 3,
    options: [`Risposta sbagliata ${position + 1}A`, right, `Risposta sbagliata ${position + 1}B`],
    topic: 'winemaking',
    answer: null,
    verdict: null,
    correct_answer: null,
    feedback: null,
  };
}

function open(position: number): ExamQuestionFixture {
  const id = 100 + position;
  const right = `Risposta giusta ${position + 1}`;
  CORRECT_OPTION[id] = right;
  return {
    question_id: id,
    position,
    text: `Domanda aperta ${position + 1}`,
    level: ((position % 3) + 1) as 1 | 2 | 3,
    format: 'open',
    options: [], // free text: the paper offers nothing to pick from
    topic: 'viticulture',
    answer: null,
    verdict: null,
    correct_answer: null,
    feedback: null,
  };
}

function trueFalse(position: number): ExamQuestionFixture {
  const id = 100 + position;
  const right = position % 2 === 0 ? 'VERO' : 'FALSO';
  CORRECT_OPTION[id] = right;
  return {
    question_id: id,
    position,
    text: `Domanda vero o falso ${position + 1}`,
    format: 'true_false',
    level: ((position % 3) + 1) as 1 | 2 | 3,
    options: ['VERO', 'FALSO'],
    topic: 'tasting',
    answer: null,
    verdict: null,
    correct_answer: null,
    feedback: null,
  };
}

// The composition the backend draws. Laid out in blocks rather than shuffled so
// that a spec can say "question 3" and mean something.
export const EXAM_QUESTIONS: ExamQuestionFixture[] = Array.from(
  { length: EXAM_LENGTH },
  (_, position) => {
    if (position < MULTIPLE_CHOICE_COUNT) return multipleChoice(position);
    if (position < MULTIPLE_CHOICE_COUNT + TRUE_FALSE_COUNT) return trueFalse(position);
    return open(position);
  }
);

export const EXAM_ID = 7;

export interface ExamFixture {
  id: number;
  mode: string;
  status: 'in_progress' | 'submitted' | 'abandoned';
  max_score: number;
  score: number | null;
  score_pct: number | null;
  passed: boolean | null;
  grading_complete: boolean;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions: ExamQuestionFixture[];
}

export function examInProgress(): ExamFixture {
  return {
    id: EXAM_ID,
    mode: 'exam',
    status: 'in_progress',
    max_score: EXAM_LENGTH,
    score: null,
    score_pct: null,
    passed: null,
    grading_complete: false,
    started_at: new Date(Date.now() - 90_000).toISOString(),
    submitted_at: null,
    duration_seconds: null,
    questions: EXAM_QUESTIONS.map((q) => ({ ...q })),
  };
}
