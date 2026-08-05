// A paper as the backend serves it: 30 closed questions, options already
// shuffled, no correct answer anywhere until it is handed in.
//
// The bank is Italian and stays Italian whatever the interface language, so
// these fixtures are too.

export const EXAM_LENGTH = 30;

type Format = 'multiple_choice' | 'true_false';

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
}

// The option a correct answer would pick. Never served while the paper is
// open — the specs use it to sit the exam, the way a student who knows the
// material would.
export const CORRECT_OPTION: Record<number, string> = {};

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
  };
}

// 21 multiple choice + 9 true/false, the closed-only composition the backend
// draws while the Open Questions wait for the grading agent.
export const EXAM_QUESTIONS: ExamQuestionFixture[] = Array.from(
  { length: EXAM_LENGTH },
  (_, position) => (position < 21 ? multipleChoice(position) : trueFalse(position))
);

export const EXAM_ID = 7;

export interface ExamFixture {
  id: number;
  mode: string;
  status: 'in_progress' | 'submitted';
  max_score: number;
  score: number | null;
  score_pct: number | null;
  passed: boolean | null;
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
    started_at: new Date(Date.now() - 90_000).toISOString(),
    submitted_at: null,
    duration_seconds: null,
    questions: EXAM_QUESTIONS.map((q) => ({ ...q })),
  };
}
