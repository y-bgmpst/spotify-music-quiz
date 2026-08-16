/**
 * HTTP client for the quiz backend.
 *
 * Responsibilities: one place that knows the base URL, applies a request
 * timeout, and converts every failure into a typed `ApiError` with a
 * user-safe message. Callers never see a raw `fetch` rejection or a JSON
 * parse error.
 */

export type Status = 'ready' | 'playing' | 'paused' | 'revealed' | 'finished';

export interface Participant {
  id: string;
  name: string;
  score: number;
}

export interface ScoreEvent {
  id: string;
  participant_id: string;
  points: number;
  reason: string;
  reversed: boolean;
}

export interface Answer {
  title: string;
  artists: string[];
  album: string;
  image_url?: string | null;
}

export interface Game {
  id: string;
  status: Status;
  round_number: number;
  rounds: number;
  excerpt_seconds: number;
  time_limit_seconds?: number | null;
  /** Milliseconds left on the excerpt at the moment the backend answered. */
  excerpt_remaining_ms: number;
  /** Server epoch-ms deadline while playing, otherwise null. */
  excerpt_deadline_ms: number | null;
  participants: Participant[];
  score_events: ScoreEvent[];
  answer?: Answer;
  playback?: { uri?: string; position_ms: number };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owner: string;
  total: number;
  image_url?: string | null;
}

export interface PlaylistAnalysis {
  total_items: number;
  eligible_unique_tracks: number;
  duplicates_removed: number;
  unavailable_or_unsupported: number;
  too_short_for_excerpt: number;
}

export interface AuthStatus {
  authenticated: boolean;
  configured: boolean;
}

export interface AccessToken {
  access_token: string;
  expires_at: number;
  scope: string;
}

export interface ConfigStatus {
  spotify_client_id_configured: boolean;
  redirect_uri: string;
  frontend_origin: string;
  playback_implemented: boolean;
  problems: string[];
}

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'malformed';

/** Every failure surfaced by this module is an ApiError. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

const baseUrl: string =
  import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1';

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

function messageFor(status: number, envelope: ErrorEnvelope | null): string {
  const fromServer = envelope?.error?.message;
  if (fromServer) return fromServer;
  if (status === 404) return 'That item no longer exists.';
  if (status === 409) return 'That action is not allowed right now.';
  if (status >= 500) return 'The quiz server had a problem. Please try again.';
  return 'Der Quizserver hat die Anfrage abgelehnt.';
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Caller-owned cancellation, combined with the built-in timeout. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let timedOut = false;
  const timeoutWatcher = setTimeout(() => {
    timedOut = true;
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (signal?.aborted) {
      throw new ApiError('network', 'The request was cancelled.');
    }
    if (timedOut || controller.signal.aborted) {
      throw new ApiError('timeout', 'The quiz server did not respond in time.');
    }
    throw new ApiError(
      'network',
      'Cannot reach the quiz server. Is the backend running?',
    );
  } finally {
    clearTimeout(timeout);
    clearTimeout(timeoutWatcher);
    signal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    let envelope: ErrorEnvelope | null = null;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      envelope = null;
    }
    throw new ApiError(
      'http',
      messageFor(response.status, envelope),
      response.status,
      envelope?.error?.code,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      'malformed',
      'The quiz server sent an unreadable response.',
    );
  }
}

export type RoundCommand = 'start' | 'pause' | 'resume' | 'reveal' | 'next';

export const api = {
  health: (init?: RequestOptions) =>
    request<{ status: string; spotify_configured: boolean }>('/health', init),
  config: (init?: RequestOptions) => request<ConfigStatus>('/config', init),
  authStatus: (init?: RequestOptions) =>
    request<AuthStatus>('/auth/status', init),
  loginUrl: () => `${baseUrl}/auth/login`,
  accessToken: (init?: RequestOptions) =>
    request<AccessToken>('/auth/token', init),
  logout: (init?: RequestOptions) =>
    request<{ authenticated: boolean }>('/auth/logout', {
      ...init,
      method: 'POST',
    }),
  playlists: (init?: RequestOptions) =>
    request<SpotifyPlaylist[]>('/playlists', init),
  playlistAnalysis: (
    playlistId: string,
    excerptSeconds: number,
    mode: 'intro' | 'random' = 'intro',
    init?: RequestOptions,
  ) =>
    request<PlaylistAnalysis>(
      `/playlists/${encodeURIComponent(playlistId)}/analysis?excerpt_seconds=${excerptSeconds}&mode=${mode}`,
      init,
    ),
  create: (body: Record<string, unknown>, init?: RequestOptions) =>
    request<Game>('/games', { ...init, method: 'POST', body }),
  get: (id: string, init?: RequestOptions) =>
    request<Game>(`/games/${id}`, init),
  command: (id: string, command: RoundCommand, init?: RequestOptions) =>
    request<Game>(`/games/${id}/round/${command}`, { ...init, method: 'POST' }),
  awardScore: (
    id: string,
    body: {
      participant_id: string;
      points: number;
      reason: string;
      event_id?: string;
    },
    init?: RequestOptions,
  ) => request<Game>(`/games/${id}/scores`, { ...init, method: 'POST', body }),
  reverseScore: (id: string, eventId: string, init?: RequestOptions) =>
    request<Game>(`/games/${id}/scores/${eventId}/reverse`, {
      ...init,
      method: 'POST',
    }),
};

/** Narrow an unknown catch value to a message that is safe to display. */
export function toDisplayMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
