import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchErrorReviewPool,
  fetchHint,
  fetchMemorizeTip,
  fetchReview,
  gradeExam,
  startErrorReview,
  startExam,
} from '../api';

const BASE = 'http://localhost:8000';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', BASE);
});

function mockFetch(body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('fetchHint', () => {
  it('posts to NEXT_PUBLIC_API_URL/hint and returns hint', async () => {
    const spy = mockFetch({ hint: 'Think mountains.' });
    const result = await fetchHint({
      denominationName: 'Barolo',
      denominationType: 'DOCG',
      wrongRegion: 'Veneto',
      correctRegions: ['Piemonte'],
      remainingRegions: ['Piemonte'],
      attemptNumber: 1,
      language: 'en',
    });
    expect(spy).toHaveBeenCalledWith(`${BASE}/hint`, expect.objectContaining({ method: 'POST' }));
    expect(result).toBe('Think mountains.');
  });
});

describe('fetchMemorizeTip', () => {
  it('posts to NEXT_PUBLIC_API_URL/memorize and returns tip', async () => {
    const spy = mockFetch({ tip: 'Barolo is king.' });
    const result = await fetchMemorizeTip({
      denominationName: 'Barolo',
      denominationType: 'DOCG',
      correctRegions: ['Piemonte'],
      language: 'en',
    });
    expect(spy).toHaveBeenCalledWith(`${BASE}/memorize`, expect.objectContaining({ method: 'POST' }));
    expect(result).toBe('Barolo is king.');
  });
});

describe('fetchReview', () => {
  it('posts to NEXT_PUBLIC_API_URL/review and returns review', async () => {
    const spy = mockFetch({ review: 'Good session.' });
    const result = await fetchReview({
      history: [
        {
          denomination: { name: 'Barolo', type: 'DOCG', regions: ['Piemonte'] },
          wrongAttempts: 0,
          result: 'correct',
          foundRegions: ['Piemonte'],
          autoPlacedRegions: [],
        },
      ],
      language: 'en',
    });
    expect(spy).toHaveBeenCalledWith(`${BASE}/review`, expect.objectContaining({ method: 'POST' }));
    expect(result).toBe('Good session.');
  });
});

// Being refused a paper because one is already open is nothing like being
// refused because the bank is empty: one offers the player a choice, the other
// is a dead end. The wrapper is where the two are told apart.
describe('startExam', () => {
  it('reads a paper already in progress as its own refusal', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'exam_in_progress' }), { status: 409 })
    );

    expect(await startExam()).toEqual({ refused: 'in_progress' });
  });

  it('claims the bank is too thin only when the backend says so', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'question_bank_too_small' }), { status: 409 })
    );

    expect(await startExam()).toEqual({ refused: 'bank_too_small' });
  });

  it('does not blame the bank for a backend that broke', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));

    expect(await startExam()).toEqual({ refused: 'unavailable' });
  });

  it('does not blame the bank for a request that never arrived', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('network down'));

    expect(await startExam()).toEqual({ refused: 'unavailable' });
  });

  it('hands back the paper it drew', async () => {
    mockFetch({ id: 7, status: 'in_progress' });

    expect(await startExam()).toEqual({ started: { id: 7, status: 'in_progress' } });
  });
});

// Grading is the one call whose failure must not look like an answer: a
// paper that came back short of Verdicts has to reach the screen as "not
// marked yet", never as a score.
describe('gradeExam', () => {
  it('posts the interface language, so the agent writes in it', async () => {
    const spy = mockFetch({ id: 7, grading_complete: true });

    await gradeExam(7, 'it');

    expect(spy).toHaveBeenCalledWith(
      `${BASE}/quiz/exams/7/grade`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ language: 'it' }) })
    );
  });

  it('returns null when the paper is still short of verdicts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'grading_incomplete' }), { status: 503 })
    );

    expect(await gradeExam(7, 'en')).toBeNull();
  });
});

// Error Review is the one mode whose refusals are not all failures. An empty
// pool means the student has nothing left to learn, which the screen turns into
// the congratulation it is — so it must never arrive as "unavailable", and
// "unavailable" must never arrive as an empty pool.
describe('startErrorReview', () => {
  it('sends the chosen length and hands back the session it drew', async () => {
    const spy = mockFetch({ id: 9, mode: 'review', pending: 12 });

    expect(await startErrorReview(20)).toEqual({
      started: { id: 9, mode: 'review', pending: 12 },
    });
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/quiz/review`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ length: 20 }) })
    );
  });

  it('tells an empty pool apart from a backend that is down', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'nothing_to_review' }), { status: 409 })
    );

    expect(await startErrorReview(10)).toEqual({ refused: 'nothing_to_review' });
  });

  it('reports a session already open as such, whatever mode is holding it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'exam_in_progress' }), { status: 409 })
    );

    expect(await startErrorReview(10)).toEqual({ refused: 'in_progress' });
  });

  it('does not claim the pool is empty when the request never arrived', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('network down'));

    expect(await startErrorReview(10)).toEqual({ refused: 'unavailable' });
  });
});

describe('fetchErrorReviewPool', () => {
  it('returns the count and the rule behind it', async () => {
    mockFetch({ pending: 4, mastery_sessions: 3 });

    expect(await fetchErrorReviewPool()).toEqual({ pending: 4, mastery_sessions: 3 });
  });

  // Null, never zero: "the backend did not answer" and "you have mastered
  // everything" are opposite pieces of news.
  it('returns null rather than zero when the backend does not answer', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('network down'));

    expect(await fetchErrorReviewPool()).toBeNull();
  });
});
