import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAdminPlayers,
  fetchAdminPlayer,
  fetchAudit,
  setAccountState,
  setPlan,
  setRole,
} from '../admin';

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

// ── The four acts (#44) ───────────────────────────────────────────────────────

describe('the mutation calls', () => {
  it('setAccountState PUTs the state and returns the fresh player', async () => {
    const fresh = { ...PAGE.players[0], account_state: 'suspended' };
    const spy = mockFetch(fresh);
    const result = await setAccountState(1, 'suspended');

    expect(spy).toHaveBeenCalledWith(
      `${BASE}/admin/users/1/account-state`,
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ account_state: 'suspended' }),
      })
    );
    expect(result).toEqual({ player: fresh });
  });

  it('setRole PUTs the role', async () => {
    const spy = mockFetch({ ...PAGE.players[0], role: 'admin' });
    await setRole(1, 'admin');
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/admin/users/1/role`);
    expect((spy.mock.calls[0][1] as RequestInit).body).toBe(
      JSON.stringify({ role: 'admin' })
    );
  });

  it('setPlan PUTs the plan', async () => {
    const spy = mockFetch({ ...PAGE.players[0], plan: 'premium' });
    await setPlan(1, 'premium');
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/admin/users/1/plan`);
  });

  it('surfaces the self-suspend guard as a typed refusal', async () => {
    mockFetch({ detail: { code: 'cannot_suspend_self' } }, 400);
    expect(await setAccountState(1, 'suspended')).toEqual({
      refused: 'cannot_suspend_self',
    });
  });

  it('surfaces the self-demote guard as a typed refusal', async () => {
    mockFetch({ detail: { code: 'cannot_demote_self' } }, 400);
    expect(await setRole(1, 'player')).toEqual({ refused: 'cannot_demote_self' });
  });

  it('reports a generic error on any other failure', async () => {
    mockFetch({ detail: 'nope' }, 422);
    expect(await setPlan(1, 'premium')).toEqual({ refused: 'error' });
  });

  it('reports a generic error when the request throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await setRole(1, 'admin')).toEqual({ refused: 'error' });
  });
});

// ── The audit log (#44) ──────────────────────────────────────────────────────

const AUDIT_PAGE = {
  entries: [
    {
      id: 7,
      actor_id: 2,
      actor_email: 'admin@example.com',
      actor_name: 'Ada Admin',
      created_at: '2025-06-01T00:00:00Z',
      entity_type: 'user',
      entity_id: 1,
      field: 'account_state',
      previous_value: 'open',
      new_value: 'suspended',
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

describe('fetchAudit', () => {
  it('filters by entity and actor, with cookies', async () => {
    const spy = mockFetch(AUDIT_PAGE);
    const result = await fetchAudit({ entityType: 'user', entityId: 1, actorId: 2 });

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(`${BASE}/admin/audit?`);
    expect(url).toContain('entity_type=user');
    expect(url).toContain('entity_id=1');
    expect(url).toContain('actor_id=2');
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual(AUDIT_PAGE);
  });

  it('returns null when the backend refuses', async () => {
    mockFetch({ detail: 'forbidden' }, 403);
    expect(await fetchAudit({})).toBeNull();
  });
});
