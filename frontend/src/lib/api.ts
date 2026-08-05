import { CardAttempt, Denomination, Exam, Filter } from '@/types';

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

// Returns null when the bank cannot fill a paper — the caller says so on screen
// rather than dropping the student into a broken exam.
export async function startExam(): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
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
  });
  return res.ok;
}

export async function submitExam(examId: number): Promise<Exam | null> {
  const res = await fetch(`${apiUrl()}/quiz/exams/${examId}/submit`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}
