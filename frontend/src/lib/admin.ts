// ── The admin panel: players (#41) ───────────────────────────────────────────
// Read-only calls behind the /admin surface. Every action on a player arrives
// in later slices; here the panel only reads. The backend serialises a schema
// of its own that never carries a password hash or a Google id, so these types
// deliberately have no field for either.

function apiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

export interface AdminPlayer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  account_state: string; // 'open' | 'suspended'
  role: string; // 'player' | 'admin'
  plan: string; // 'free' | 'premium'
  created_at: string;
  last_login: string | null;
  // The most recent moment the player was seen: a login or either game played.
  last_activity: string | null;
  // Finished games played, both games summed. An abandoned or in-progress quiz
  // Session is not counted.
  sessions_played: number;
}

export interface AdminPlayerPage {
  players: AdminPlayer[];
  total: number;
  page: number;
  page_size: number;
}

// The list only grows, so it is always paged and searchable. `search` matches
// name and email; the result is null only when the backend does not answer, so
// the screen can tell a genuinely empty page from a failed request.
export async function fetchAdminPlayers(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminPlayerPage | null> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('page_size', String(params.pageSize));

  const res = await fetch(`${apiUrl()}/admin/users?${query.toString()}`, {
    credentials: 'include',
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

export async function fetchAdminPlayer(id: number): Promise<AdminPlayer | null> {
  const res = await fetch(`${apiUrl()}/admin/users/${id}`, {
    credentials: 'include',
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}
