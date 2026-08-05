// The shape of the paper, mirroring `EXAM_COMPOSITION`, `EXAM_LENGTH` and
// `PASS_MARK_PCT` in `backend/app/exams/model.py`. The backend is the
// authority — these are here only so the game can say what it is about to ask
// *before* a paper has been drawn. Anything shown about an Exam that exists
// comes from its payload.
export const EXAM_LENGTH = 30;
export const PASS_MARK_PCT = 60;

export const EXAM_COMPOSITION = {
  open: 14,
  multiple_choice: 11,
  true_false: 5,
} as const;

// An Open Question is answered in prose, and the backend refuses anything past
// this. The textarea stops the student at the same number rather than letting
// them write past it and lose the tail.
export const MAX_OPEN_ANSWER_CHARS = 4000;

// Whitespace is a blank. The backend trims before grading, so an answer of
// three spaces is wrong there and has to look blank everywhere here: on the
// review screen, in the count of how far a resumed paper got, and nowhere
// else deciding it for itself.
export function isBlank(answer: string | null | undefined): boolean {
  return !answer?.trim();
}

export function answeredCount(questions: { answer: string | null }[]): number {
  return questions.filter((question) => !isBlank(question.answer)).length;
}

// How long after the last keystroke the written answer is sent. Long enough
// that typing a paragraph is not thirty requests, short enough that a student
// who closes the tab mid-thought loses at most a word.
export const OPEN_ANSWER_SAVE_DELAY_MS = 700;
