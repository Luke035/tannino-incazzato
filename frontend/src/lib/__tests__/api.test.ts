import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHint, fetchMemorizeTip, fetchReview } from '../api';

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
