import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  toDisplayMessage,
  type ConfigStatus,
  type Game,
  type RoundCommand,
} from './api/client';
import { PLAYBACK_UNAVAILABLE_NOTICE, StubPlayback } from './spotify/player';
import { formatClock, useCountdown } from './useCountdown';
import { sounds } from './sounds';

const TIME_LIMIT_OPTIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 0, label: 'No limit' },
] as const;

/** Decorative desktop furniture. Not interactive, so it is hidden from AT. */
const DESKTOP_ICONS = ['My Computer', 'Network Neighborhood', 'Recycle Bin', 'Minesweeper'];

export function App() {
  const [game, setGame] = useState<Game | undefined>();
  const [config, setConfig] = useState<ConfigStatus | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [timeLimit, setTimeLimit] = useState<number>(300);
  const [rounds, setRounds] = useState(10);
  const [excerptSeconds, setExcerptSeconds] = useState(10);
  const [teams, setTeams] = useState('Team A, Team B');
  const [clock, setClock] = useState(() => new Date());

  const playback = useRef(new StubPlayback());
  const errorRef = useRef<HTMLDivElement>(null);

  const remainingMs = useCountdown(
    game?.excerpt_remaining_ms ?? 0,
    game?.status === 'playing',
  );
  const excerptElapsed = game?.status === 'playing' && remainingMs <= 0;

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .config({ signal: controller.signal })
      .then(setConfig)
      .catch(() => setConfig(undefined));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const player = playback.current;
    return () => {
      void player.stop();
    };
  }, []);

  const run = useCallback(async (action: () => Promise<Game>) => {
    setBusy(true);
    setError(undefined);
    try {
      setGame(await action());
      return true;
    } catch (caught) {
      setError(toDisplayMessage(caught));
      // Move focus to the message so keyboard and screen-reader users are not
      // left wondering why the button they pressed did nothing.
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const participantNames = teams
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

  async function createGame(event: React.FormEvent) {
    event.preventDefault();
    if (participantNames.length === 0) {
      setError('Add at least one team name before starting.');
      errorRef.current?.focus();
      return;
    }
    await run(() =>
      api.create({
        rounds,
        excerpt_seconds: excerptSeconds,
        mode: 'intro',
        participants: participantNames,
        time_limit_seconds: timeLimit === 0 ? null : timeLimit,
      }),
    );
  }

  async function sendCommand(command: RoundCommand) {
    if (!game) return;
    const ok = await run(() => api.command(game.id, command));
    if (!ok) return;
    if (command === 'start') {
      sounds.start();
      await playback.current.start({ uri: 'unknown', position_ms: 0 });
    }
    if (command === 'pause') await playback.current.pause();
    if (command === 'resume') await playback.current.resume();
    if (command === 'reveal') {
      sounds.reveal();
      await playback.current.stop();
    }
    if (command === 'next') {
      sounds.next();
      await playback.current.stop();
    }
  }

  async function award(participantId: string, points: number, reason: string) {
    if (!game) return;
    const ok = await run(() =>
      api.awardScore(game.id, { participant_id: participantId, points, reason }),
    );
    if (ok) sounds.score();
  }

  async function undo(eventId: string) {
    if (!game) return;
    await run(() => api.reverseScore(game.id, eventId));
  }

  const concealed = !game || (game.status !== 'revealed' && game.status !== 'finished');
  const activeEvents = game?.score_events.filter(event => !event.reversed) ?? [];
  const nameOf = (participantId: string) =>
    game?.participants.find(p => p.id === participantId)?.name ?? 'Unknown team';

  return (
    <div className="desktop">
      <ul className="desktop-icons" aria-hidden="true">
        {DESKTOP_ICONS.map(label => (
          <li key={label} className="desktop-icon">
            <span className="icon-image" />
            <span className="icon-label">{label}</span>
          </li>
        ))}
      </ul>

      <main className="window" aria-labelledby="app-title">
        <div className="window-titlebar">
          <h1 className="window-title" id="app-title">
            Spotify Music Quiz
          </h1>
          <span className="window-badge">{busy ? 'Working…' : 'Ready'}</span>
        </div>

        <div className="window-body">
          <p className="notice" role="note">
            {PLAYBACK_UNAVAILABLE_NOTICE}
          </p>

          {config && config.problems.length > 0 && (
            <section className="notice notice-warning" aria-labelledby="config-problems">
              <h2 id="config-problems">Configuration needs attention</h2>
              <ul>
                {config.problems.map(problem => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </section>
          )}

          <div
            className={error ? 'error' : 'error error-empty'}
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            {error}
          </div>

          {!game && (
            <form className="card" onSubmit={createGame} aria-labelledby="setup-heading">
              <h2 id="setup-heading">Set up the quiz</h2>

              <div className="field">
                <label htmlFor="teams">Teams (comma separated)</label>
                <input
                  id="teams"
                  name="teams"
                  type="text"
                  value={teams}
                  onChange={event => setTeams(event.target.value)}
                  aria-describedby="teams-hint"
                  required
                />
                <p id="teams-hint" className="hint">
                  For example: Team A, Team B
                </p>
              </div>

              <div className="field">
                <label htmlFor="rounds">Number of rounds</label>
                <input
                  id="rounds"
                  name="rounds"
                  type="number"
                  min={1}
                  max={100}
                  value={rounds}
                  onChange={event => setRounds(Number(event.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="excerpt">Excerpt length in seconds</label>
                <input
                  id="excerpt"
                  name="excerpt"
                  type="number"
                  min={1}
                  max={60}
                  value={excerptSeconds}
                  onChange={event => setExcerptSeconds(Number(event.target.value))}
                />
              </div>

              <fieldset className="field">
                <legend>Overall time limit</legend>
                {TIME_LIMIT_OPTIONS.map(option => (
                  <div className="radio" key={option.value}>
                    <input
                      type="radio"
                      id={`limit-${option.value}`}
                      name="timeLimit"
                      value={option.value}
                      checked={timeLimit === option.value}
                      onChange={() => setTimeLimit(option.value)}
                    />
                    <label htmlFor={`limit-${option.value}`}>{option.label}</label>
                  </div>
                ))}
              </fieldset>

              <div className="actions">
                <button type="submit" className="primary" disabled={busy}>
                  Start quiz
                </button>
                <a className="button-link" href={api.loginUrl()}>
                  Connect Spotify account
                </a>
              </div>
            </form>
          )}

          {game && (
            <section className="game" aria-labelledby="round-heading">
              <h2 id="round-heading">
                Round {game.round_number} of {game.rounds}
              </h2>
              <p className="status" aria-live="polite">
                Status: {game.status}
              </p>

              <div className="card stage">
                {concealed ? (
                  <>
                    <p className="mystery" aria-hidden="true">
                      ?
                    </p>
                    <p>The track is hidden until you reveal it.</p>
                    <p className="timer">
                      <span className="visually-hidden">Time remaining in this excerpt: </span>
                      <output aria-live="off">{formatClock(remainingMs)}</output>
                    </p>
                    {excerptElapsed && (
                      <p className="timer-elapsed" aria-live="polite">
                        The excerpt time is up. Reveal the answer when you are ready.
                      </p>
                    )}
                  </>
                ) : game.answer ? (
                  <div aria-live="polite">
                    <h3>{game.answer.title}</h3>
                    <p>Artist: {game.answer.artists.join(', ')}</p>
                    <p>Album: {game.answer.album}</p>
                  </div>
                ) : (
                  <div aria-live="polite">
                    <h3>Game complete</h3>
                    <p>Thanks for playing.</p>
                  </div>
                )}

                <div className="controls">
                  {game.status === 'ready' && (
                    <button type="button" onClick={() => void sendCommand('start')} disabled={busy}>
                      Start round
                    </button>
                  )}
                  {game.status === 'playing' && (
                    <button type="button" onClick={() => void sendCommand('pause')} disabled={busy}>
                      Pause round
                    </button>
                  )}
                  {game.status === 'paused' && (
                    <button
                      type="button"
                      onClick={() => void sendCommand('resume')}
                      disabled={busy}
                    >
                      Resume round
                    </button>
                  )}
                  {(game.status === 'playing' || game.status === 'paused') && (
                    <button
                      type="button"
                      onClick={() => void sendCommand('reveal')}
                      disabled={busy}
                    >
                      Reveal answer
                    </button>
                  )}
                  {game.status === 'revealed' && (
                    <button type="button" onClick={() => void sendCommand('next')} disabled={busy}>
                      Next round
                    </button>
                  )}
                </div>
              </div>

              <table className="scoreboard">
                <caption>Scoreboard</caption>
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {game.participants.map(participant => (
                    <tr key={participant.id}>
                      <th scope="row">{participant.name}</th>
                      <td>{participant.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {game.status === 'revealed' && (
                <section className="card" aria-labelledby="scoring-heading">
                  <h3 id="scoring-heading">Award points</h3>
                  <ul className="scoring-list">
                    {game.participants.map(participant => (
                      <li key={participant.id}>
                        <span className="scoring-team">{participant.name}</span>
                        <button
                          type="button"
                          onClick={() => void award(participant.id, 1, 'title')}
                          disabled={busy}
                        >
                          <span aria-hidden="true">+1</span>
                          <span className="visually-hidden">
                            Award one point to {participant.name} for the title
                          </span>
                          <span aria-hidden="true"> title</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void award(participant.id, 1, 'artist')}
                          disabled={busy}
                        >
                          <span aria-hidden="true">+1</span>
                          <span className="visually-hidden">
                            Award one point to {participant.name} for the artist
                          </span>
                          <span aria-hidden="true"> artist</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {activeEvents.length > 0 && (
                <section className="card" aria-labelledby="history-heading">
                  <h3 id="history-heading">Awarded this game</h3>
                  <ul className="score-history">
                    {activeEvents.map(event => (
                      <li key={event.id}>
                        <span>
                          {nameOf(event.participant_id)}: {event.points} for {event.reason}
                        </span>
                        <button type="button" onClick={() => void undo(event.id)} disabled={busy}>
                          <span aria-hidden="true">Undo</span>
                          <span className="visually-hidden">
                            Undo {event.points} points for {nameOf(event.participant_id)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </section>
          )}
        </div>
      </main>

      <div className="taskbar" aria-hidden="true">
        <span className="start-button">Start</span>
        <span className="taskbar-item">Spotify Music Quiz</span>
        <span className="clock">
          {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default App;
