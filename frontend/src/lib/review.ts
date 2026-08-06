// What an Error Review Session can be set to, mirroring `REVIEW_LENGTHS` in
// `backend/app/exams/model.py`. The backend is the authority and refuses
// anything else — these are here so the setup screen can offer the choices
// before a Session exists.
//
// There is no Level here, and that absence is the mode: the pool is whatever
// this player has personally not Mastered yet, across every Level they have
// ever been asked about. Choosing would be the game picking the questions,
// when the whole point is that their own record already has.
export const REVIEW_LENGTHS = [10, 20, 30] as const;

export type ReviewLength = (typeof REVIEW_LENGTHS)[number];

// The shortest session, like Practice: Error Review is meant to fit in the gaps
// of a day, so the screen opens on the length that always does.
export const DEFAULT_REVIEW_LENGTH: ReviewLength = 10;

// How many distinct Sessions a question has to be answered correctly in before
// it is Mastered and leaves the pool, mirroring `MASTERY_SESSIONS`. Used only
// as the fallback for copy written before `/quiz/review/pool` has answered —
// the number the screen shows comes from the backend.
export const MASTERY_SESSIONS = 3;
