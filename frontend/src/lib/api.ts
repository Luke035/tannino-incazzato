import {
  CardAttempt,
  Denomination,
  Exam,
  Filter,
  Language,
  PracticeAnswerResult,
  QuizSession,
} from '@/types';

function apiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

export async function fetchDenominations(): Promise<Denomination[]> {
  const res = await fetch(`${apiUrl()}/denominations`);
  return res.json();
}

export async function fetchHint(params: {
  denominationName: string;
  denominationType: string;
  wrongRegion: string;
  correctRegions: string[];
  remainingRegions: string[];
  attemptNumber: number;
  language: string;
}): Promise<string> {
  const res = await fetch(`${apiUrl()}/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return data.hint ?? '';
}

export async function fetchMemorizeTip(params: {
  denominationName: string;
  denominationType: string;
  correctRegions: string[];
  language: string;
}): Promise<string> {
  const res = await fetch(`${apiUrl()}/memorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return data.tip ?? '';
}

export async function fetchReview(params: {
  history: Pick<CardAttempt, 'denomination' | 'wrongAttempts' | 'result'>[];
  language: string;
}): Promise<string> {
  const payload = params.history.map((h) => ({
    name: h.denomination.name,
    type: h.denomination.type,
    correctRegions: h.denomination.regions,
    wrongAttempts: h.wrongAttempts,
    result: h.result,
  }));
  const res = await fetch(`${apiUrl()}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history: payload, language: params.language }),
  });
  const data = await res.json();
  return data.review ?? '';
}

export interface SessionStats {
  sessions: {
    id: number;
    filter: string;
    score_pct: number;
    items: number;
    duration_seconds: number;
    played_at: string;
  }[];
  aggregate: {
    total_sessions: number;
    avg_score_pct: number;
    best_score_pct: number;
    best_session: { played_at: string; filter: string } | null;
    unique_denoms: number;
    total_denoms: number;
  };
  type_performance: {
    doc_pct: number | null;
    docg_pct: number | null;
  };
  top_regions: { region: string; score_pct: number }[];
  low_regions: { region: string; score_pct: number }[];
}

export async function fetchSaveSession(params: {
  gameId: string;
  filter: Filter;
  startedAt: string;
  history: CardAttempt[];
}): Promise<{ id: number }> {
  const payload = {
    gameId: params.gameId,
    filter: params.filter,
    startedAt: params.startedAt,
    history: params.history.map((c) => ({
      denominationName: c.denomination.name,
      denominationType: c.denomination.type,
      wrongAttempts: c.wrongAttempts,
      result: c.result,
      foundRegions: c.foundRegions,
      autoPlacedRegions: c.autoPlacedRegions,
    })),
  };
  const res = await fetch(`${apiUrl()}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchSessionStats(): Promise<SessionStats> {
  const res = await fetch(`${apiUrl()}/session/stats`, {
    credentials: 'include',
  });
  return res.json();
}

// ── Promossi o Cirrotici: the Exam ───────────────────────────────────────────
// The backend draws the paper, shuffles the options and produces every Verdict
// (ADR 0007), so these wrappers carry state rather than compute it.

// Why a paper could not be drawn. `in_progress` is the player already having
// one open — the backend refuses rather than replacing it, so that no tap can
// destroy work. `bank_too_small` is claimed only when the backend says so: a
// 500 or a dropped connection is `unavailable`, and telling a student the bank
// is empty when it is the backend that is down is a lie about the game.
export type ExamRefusal = 'in_progress' | 'bank_too_small' | 'unavailable';

export type ExamStart = { started: Exam } | { refused: ExamRefusal };

export async function startExam(): Promise<ExamStart> {
  const res = await fetch(`${apiUrl()}/quiz/exams`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);
  if (res === null) return { refused: 'unavailable' };
  if (res.ok) return { started: await res.json() };

  const detail = await res
    .json()
    .then((body) => body?.detail)
    .catch(() => null);
  if (detail === 'exam_in_progress') return { refused: 'in_progress' };
  return { refused: detail === 'question_bank_too_small' ? 'bank_too_small' : 'unavailable' };
}

// The Session the player left open, or null when the slot is free. In-progress
// Sessions do not expire, so this is the only thing the game needs to know to
// tell a returning student what is waiting for them.
export async function fetchCurrentExam(): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams/current`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

// Throws the open paper away and frees the slot. Only ever called behind an
// explicit confirmation: it is not undoable.
export async function abandonExam(examId: number): Promise<boolean> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}/abandon`, {
    method: 'POST',
    credentials: 'include',
  });
  return res.ok;
}

export async function fetchExam(examId: number): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

// `answer: null` clears the answer — skipping a question is a first-class move.
export async function saveExamAnswer(
  examId: number,
  questionId: number,
  answer: string | null
): Promise<boolean> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}/answers/${questionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ answer }),
    // The last write of a Session is the one sent as the tab is closing, and a
    // page going away cancels its requests. `keepalive` is what lets that one
    // outlive the page — which is the whole promise of an answer that persists
    // as it is given.
    keepalive: true,
  });
  return res.ok;
}

// Hands the paper in. Comes back with the Closed Questions already marked and
// the Open ones still pending — `grading_complete` says which.
export async function submitExam(examId: number): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}/submit`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Promossi o Cirrotici: Practice ──────────────────────────────────────────
// The same Session resource under a different mode, so the payload is the same.
// What differs is that the Verdict comes back with the answer — Practice is
// where the correction has to land while the reasoning is still fresh.

// Why a Practice Session could not be drawn. `in_progress` is the player
// already having a Session open in *any* mode — the backend refuses rather
// than replacing it, so that no tap can destroy work. `level_too_thin` is the
// chosen Level being unable to fill the chosen length, which is a fact about
// the bank; anything else is the backend not answering, and the two are never
// told to the student as the same thing.
export type PracticeRefusal = 'in_progress' | 'level_too_thin' | 'unavailable';

export type PracticeStart = { started: QuizSession } | { refused: PracticeRefusal };

export async function startPractice(
  level: number,
  length: number
): Promise<PracticeStart> {
  const res = await fetch(`${apiUrl()}/quiz/practice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ level, length }),
  }).catch(() => null);
  if (res === null) return { refused: 'unavailable' };
  if (res.ok) return { started: await res.json() };

  const detail = await res
    .json()
    .then((body) => body?.detail)
    .catch(() => null);
  if (detail === 'exam_in_progress') return { refused: 'in_progress' };
  return { refused: detail === 'question_bank_too_small' ? 'level_too_thin' : 'unavailable' };
}

export async function fetchPracticeSession(sessionId: number): Promise<QuizSession | null> {
  const res = await fetch(`${apiUrl()}/quiz/practice/${sessionId}`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

// Answers one question and comes back with the correction. Null means the
// answer was not taken at all — a question already marked, or a backend that
// did not answer. It never means "wrong": a Verdict only ever comes from the
// backend, and its absence in the payload is a stalled agent, which the screen
// tells the student about rather than counting against them.
export async function savePracticeAnswer(
  sessionId: number,
  questionId: number,
  answer: string,
  language: Language
): Promise<PracticeAnswerResult | null> {
  const res = await fetch(
    `${apiUrl()}/quiz/practice/${sessionId}/answers/${questionId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ answer, language }),
    }
  ).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

// Ends the Session and records it. Always available: a student who runs out of
// time is scored on what they actually answered, never trapped in a Session
// they want to end.
export async function finishPractice(sessionId: number): Promise<QuizSession | null> {
  const res = await fetch(`${apiUrl()}/quiz/practice/${sessionId}/finish`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

// Throws the Session away and frees the slot, recording nothing. Only ever
// called behind an explicit confirmation: it is not undoable.
export async function abandonPractice(sessionId: number): Promise<boolean> {
  const res = await fetch(`${apiUrl()}/quiz/practice/${sessionId}/abandon`, {
    method: 'POST',
    credentials: 'include',
  });
  return res.ok;
}

// Asks the grading agent for the written answers. Safe to call again on a
// paper it only got halfway through: it picks up the questions still unmarked, so a
// retry is cheap. Returns null when the paper came back short of Verdicts —
// it stays ungraded and scoreless, and calling again is the whole recovery.
export async function gradeExam(examId: number, language: Language): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ language }),
  });
  if (!res.ok) return null;
  return res.json();
}
