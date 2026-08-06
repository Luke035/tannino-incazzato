import { QuestionLevel } from '@/types';

// What a Practice Session can be set to, mirroring `PRACTICE_LEVELS` and
// `PRACTICE_LENGTHS` in `backend/app/exams/model.py`. The backend is the
// authority and refuses anything else — these are here so the setup screen can
// offer the choices before a Session exists.
export const PRACTICE_LEVELS: QuestionLevel[] = [1, 2, 3];
export const PRACTICE_LENGTHS = [10, 20, 30] as const;

export type PracticeLength = (typeof PRACTICE_LENGTHS)[number];

// The default a student lands on: the shortest session and the first Level.
// Practice is meant to fit in the gaps of a day, so the screen opens on the
// one that always does.
export const DEFAULT_PRACTICE_LEVEL: QuestionLevel = 1;
export const DEFAULT_PRACTICE_LENGTH: PracticeLength = 10;

// How many of each length are Open Questions, mirroring `PRACTICE_COMPOSITION`.
// Shown on the setup screen so that "10 questions" is not a surprise about how
// much typing it involves.
export const PRACTICE_OPEN_COUNT: Record<PracticeLength, number> = {
  10: 5,
  20: 10,
  30: 14,
};
