export type Status = 'ready' | 'playing' | 'paused' | 'revealed' | 'finished';
export type Game = {
  id: string;
  status: Status;
  round_number: number;
  rounds: number;
  excerpt_seconds: number;
  time_limit_seconds?: number | null;
  participants: { id: string; name: string; score: number }[];
  answer?: {
    title: string;
    artists: string[];
    album: string;
    image_url?: string;
  };
};

const base = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1';

/**
 * Deliberately safe browser diagnostics. Never add response bodies, tokens,
 * OAuth codes, state values, or PKCE verifiers to these events.
 */
export function debugEvent(
  event: string,
  details: Record<string, boolean | number | string | undefined> = {},
): void {
  console.info('[spotify-quiz]', event, details);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const started = performance.now();
  debugEvent('api_request', { method, path });
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = (await response.json()) as {
          error?: { code?: string };
        };
        code = body.error?.code;
      } catch {
        // Keep diagnostics useful without logging an unsafe raw response.
      }
      debugEvent('api_error', {
        method,
        path,
        status: response.status,
        code,
        elapsed_ms: Math.round(performance.now() - started),
      });
      throw new Error(code ?? `HTTP ${response.status}`);
    }
    const result = (await response.json()) as T;
    debugEvent('api_success', {
      method,
      path,
      status: response.status,
      elapsed_ms: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    if (!(error instanceof Error && /^HTTP \d+$/.test(error.message))) {
      debugEvent('api_exception', {
        method,
        path,
        error: error instanceof Error ? error.name : 'unknown',
        elapsed_ms: Math.round(performance.now() - started),
      });
    }
    throw error;
  }
}
export const api = {
  authStatus: () => request<{ authenticated: boolean }>('/auth/status'),
  create: (body: object) =>
    request<Game>('/games', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => request<Game>(`/games/${id}`),
  command: (id: string, command: string) =>
    request<Game>(`/games/${id}/round/${command}`, { method: 'POST' }),
};
