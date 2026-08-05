import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHint, fetchMemorizeTip, fetchReview, gradeExam, startExam } from '../api';

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
