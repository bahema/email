import type { ApiErrorResponse, SessionResponse } from '@affiliate/shared';

let csrfToken = '';
export function rememberSession(session: SessionResponse) { csrfToken = session.csrfToken; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    if (response.status === 401 && failure.error?.code === 'UNAUTHORIZED') window.dispatchEvent(new Event('admin-session-expired'));
    throw new ApiError(failure.error?.message ?? 'Request failed', response.status, failure.error?.code ?? 'UNKNOWN');
  }
  return data as T;
}
export async function loadSession() {
  const session = await api<SessionResponse>('/api/auth/session');
  rememberSession(session);
  return session;
}
