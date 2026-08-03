/**
 * Typed API client. Implements the CPF error contract: every non-2xx response
 * is surfaced as an ApiError with a stable code, safe message, and request id.
 * No mock modes — this client only ever talks to the real API.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    details?: Array<{ path: string; message: string }>;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly details: Array<{ path: string; message: string }> | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.retryable = body.retryable;
    this.details = body.details;
  }
}

let sessionToken: string | null = sessionStorage.getItem('cpf.token');

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  if (token === null) sessionStorage.removeItem('cpf.token');
  else sessionStorage.setItem('cpf.token', token);
}

export function hasSessionToken(): boolean {
  return sessionToken !== null;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && sessionToken)
    headers.authorization = `Bearer ${sessionToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'The CPF API could not be reached. Check your connection and try again.',
      requestId: 'n/a',
      retryable: true,
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  if (!response.ok) {
    let errorBody: ApiErrorBody['error'];
    try {
      const parsed = JSON.parse(text) as ApiErrorBody;
      errorBody = parsed.error;
    } catch {
      errorBody = {
        code: 'UNKNOWN',
        message: 'An unexpected error occurred.',
        requestId: response.headers.get('x-request-id') ?? 'n/a',
        retryable: false,
      };
    }
    throw new ApiError(response.status, errorBody);
  }

  if (text === '') return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, opts?: { auth?: boolean }) =>
    request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>('POST', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>('PUT', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>('PATCH', path, body, opts),
  delete: <T>(path: string, opts?: { auth?: boolean }) =>
    request<T>('DELETE', path, undefined, opts),
};

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Typed AbortController wrapper for use in async data hooks */
export function abortable<T>(
  fn: (signal: AbortSignal) => Promise<T>,
): { promise: Promise<T>; cancel: () => void } {
  const controller = new AbortController();
  return {
    promise: fn(controller.signal),
    cancel: () => controller.abort(),
  };
}
