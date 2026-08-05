/** Shared builders for API payloads used by unit tests. */
import type { Game, Participant } from '../src/api/client';

export const TEAM_A: Participant = { id: 'p-a', name: 'Team A', score: 0 };
export const TEAM_B: Participant = { id: 'p-b', name: 'Team B', score: 0 };

export function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    status: 'ready',
    round_number: 1,
    rounds: 3,
    excerpt_seconds: 10,
    time_limit_seconds: 300,
    excerpt_remaining_ms: 0,
    excerpt_deadline_ms: null,
    participants: [TEAM_A, TEAM_B],
    score_events: [],
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const CONFIG_OK = {
  spotify_client_id_configured: true,
  redirect_uri: 'http://127.0.0.1:8000/api/v1/auth/callback',
  frontend_origin: 'http://127.0.0.1:5173',
  playback_implemented: false,
  problems: [] as string[],
};
