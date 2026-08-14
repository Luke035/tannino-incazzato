import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAdminPlayers, fetchAdminPlayer } from '../admin';

const BASE = 'http://localhost:8000';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', BASE);
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

const PAGE = {
  players: [
    {
      id: 1,
      email: 'a@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      account_state: 'open',
      role: 'player',
      plan: 'free',
      created_at: '2025-01-01T00:00:00Z',
      last_login: null,
      last_activity: null,
      sessions_played: 3,
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

describe('fetchAdminPlayers', () => {
  it('sends search and pagination as query params, with cookies', async () => {
    const spy = mockFetch(PAGE);
    const result = await fetchAdminPlayers({ search: 'ada', page: 2, pageSize: 20 });

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(`${BASE}/admin/users?`);
    expect(url).toContain('search=ada');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=20');
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual(PAGE);
  });

  it('omits empty search from the query', async () => {
    const spy = mockFetch(PAGE);
    await fetchAdminPlayers({ page: 1 });
    const url = spy.mock.calls[0][0] as string;
    expect(url).not.toContain('search=');
  });

  it('returns null when the backend refuses', async () => {
    mockFetch({ detail: 'forbidden' }, 403);
    expect(await fetchAdminPlayers({})).toBeNull();
  });

  it('returns null when the request throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await fetchAdminPlayers({})).toBeNull();
  });
});

describe('fetchAdminPlayer', () => {
  it('fetches one player by id with cookies', async () => {
    const spy = mockFetch(PAGE.players[0]);
    const result = await fetchAdminPlayer(1);
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/admin/users/1`,
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual(PAGE.players[0]);
  });

  it('returns null on a 404', async () => {
    mockFetch({ detail: 'not found' }, 404);
    expect(await fetchAdminPlayer(999)).toBeNull();
  });
});
