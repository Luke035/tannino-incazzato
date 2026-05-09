function apiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${apiUrl()}/auth/me`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

export async function apiRegister(params: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}): Promise<{ user: AuthUser } | { error: string }> {
  const res = await fetch(`${apiUrl()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data.detail ?? 'register_failed' };
  }
  const user = await res.json();
  return { user };
}

export async function apiLogin(params: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser } | { error: string }> {
  const res = await fetch(`${apiUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    return { error: 'invalid_credentials' };
  }
  const user = await res.json();
  return { user };
}

export async function apiLogout(): Promise<void> {
  await fetch(`${apiUrl()}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
