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

// ── The four acts this slice records (#44) ───────────────────────────────────
// Suspend/reinstate an account, change a role or a Plan. Each returns the fresh
// player detail on success, or a typed refusal the screen can act on: the panel
// must tell an admin *why* an act on their own account was refused, not just
// that it failed. A backend that does not answer at all reads as 'error'.

// The distinct codes the backend returns for a refused act. `cannot_suspend_self`
// and `cannot_demote_self` are the self-guards; the rest are generic failures.
export type AdminActionRefusal =
  | 'cannot_suspend_self'
  | 'cannot_demote_self'
  | 'error';

export type AdminActionResult =
  | { player: AdminPlayer }
  | { refused: AdminActionRefusal };

async function mutatePlayer(
  id: number,
  path: string,
  body: Record<string, string>,
): Promise<AdminActionResult> {
  const res = await fetch(`${apiUrl()}/admin/users/${id}/${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (res?.ok) return { player: await res.json() };

  // A 400 carries a self-guard code the interface renders as its own message.
  if (res?.status === 400) {
    const detail = await res.json().catch(() => null);
    const code = detail?.detail?.code;
    if (code === 'cannot_suspend_self' || code === 'cannot_demote_self') {
      return { refused: code };
    }
  }
  return { refused: 'error' };
}

export function setAccountState(
  id: number,
  account_state: 'open' | 'suspended',
): Promise<AdminActionResult> {
  return mutatePlayer(id, 'account-state', { account_state });
}

export function setRole(
  id: number,
  role: 'player' | 'admin',
): Promise<AdminActionResult> {
  return mutatePlayer(id, 'role', { role });
}

export function setPlan(
  id: number,
  plan: 'free' | 'premium',
): Promise<AdminActionResult> {
  return mutatePlayer(id, 'plan', { plan });
}

// ── The audit log (#44) ──────────────────────────────────────────────────────
// One append-only record for the whole panel, readable and filterable by entity
// and by actor. Each row answers "what did this say before?" beside the value
// that replaced it.

export interface AuditEntry {
  id: number;
  actor_id: number;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
  entity_type: string;
  entity_id: number;
  field: string;
  previous_value: string | null;
  new_value: string | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchAudit(params: {
  entityType?: string;
  entityId?: number;
  actorId?: number;
  page?: number;
  pageSize?: number;
}): Promise<AuditPage | null> {
  const query = new URLSearchParams();
  if (params.entityType) query.set('entity_type', params.entityType);
  if (params.entityId !== undefined) query.set('entity_id', String(params.entityId));
  if (params.actorId !== undefined) query.set('actor_id', String(params.actorId));
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('page_size', String(params.pageSize));

  const res = await fetch(`${apiUrl()}/admin/audit?${query.toString()}`, {
    credentials: 'include',
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}
