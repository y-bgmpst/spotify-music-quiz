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
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
export const api = {
  create: (body: object) =>
    request<Game>('/games', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => request<Game>(`/games/${id}`),
  command: (id: string, command: string) =>
    request<Game>(`/games/${id}/round/${command}`, { method: 'POST' }),
};
