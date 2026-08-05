// The shape of the paper, mirroring `EXAM_COMPOSITION` and `PASS_MARK_PCT` in
// `backend/app/exams/model.py`. The backend is the authority — these are here
// only so the game can say what it is about to ask *before* a paper has been
// drawn. Anything shown about an Exam that exists comes from its payload.
export const EXAM_LENGTH = 30;
export const PASS_MARK_PCT = 60;
