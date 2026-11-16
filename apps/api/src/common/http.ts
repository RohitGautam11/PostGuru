/**
 * Thin fetch wrapper used by all social providers. Normalises provider errors into ProviderError,
 * flags transient failures (429 / 5xx / network) so the publisher can retry them, and applies a timeout.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly transient = false,
    public readonly authError = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
  raw?: boolean;
}

export function withQuery(url: string, query?: RequestOptions['query']) {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function extractMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data.slice(0, 300);
  return (
    data.error?.message ||
    data.error_description ||
    data.detail ||
    data.title ||
    data.message ||
    data.errors?.[0]?.message ||
    data.errors?.[0]?.detail ||
    (typeof data.error === 'string' ? data.error : null) ||
    fallback
  );
}

export async function request<T = any>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await requestRaw(url, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function requestRaw(url: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(withQuery(url, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new ProviderError(
      err?.name === 'AbortError' ? 'Request to provider timed out' : `Network error: ${err?.message}`,
      0,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    const message = extractMessage(data, `Provider request failed with status ${res.status}`);
    const metaAuth = data?.error?.code === 190 || data?.error?.type === 'OAuthException';
    throw new ProviderError(
      message,
      res.status,
      res.status === 429 || res.status >= 500,
      res.status === 401 || (metaAuth && data?.error?.code === 190),
    );
  }
  return res;
}

/** Download a media file into memory (needed by providers that require binary uploads). */
export async function downloadMedia(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await requestRaw(url, { headers: { Accept: '*/*' }, timeoutMs: 120_000 });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
