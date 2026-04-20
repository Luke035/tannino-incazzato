import { CardAttempt } from '@/types';

export async function fetchHint(params: {
  denominationName: string;
  denominationType: string;
  wrongRegion: string;
  correctRegions: string[];
  remainingRegions: string[];
  attemptNumber: number;
  language: string;
}): Promise<string> {
  const res = await fetch('/api/hint', {
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
  const res = await fetch('/api/memorize', {
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
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history: payload, language: params.language }),
  });
  const data = await res.json();
  return data.review ?? '';
}
