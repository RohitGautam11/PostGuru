export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string[],
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Do not attempt a token refresh on 401 (used by auth endpoints). */
  noRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s wait on the same refresh call. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `/api${path}${s ? `?${s}` : ''}`;
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  };
  const url = buildUrl(path, opts.query);

  let res = await fetch(url, init);
  if (res.status === 401 && !opts.noRefresh) {
    if (await refreshSession()) {
      res = await fetch(url, init);
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      throw new ApiError('Session expired', 401);
    }
  }

  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message;
    const details = Array.isArray(msg) ? msg : undefined;
    throw new ApiError(details ? details.join('\n') : msg || res.statusText || 'Request failed', res.status, details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'Something went wrong';
