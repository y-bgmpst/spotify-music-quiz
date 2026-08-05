import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  debugEvent,
  toDisplayMessage,
  type ConfigStatus,
  type Game,
  type RoundCommand,
} from './api/client';
import {
  PLAYBACK_READY_NOTICE,
  PLAYBACK_UNAVAILABLE_NOTICE,
  StubPlayback,
  type PlaybackPort,
} from './spotify/player';
import { PlaybackError, SpotifyWebPlayback } from './spotify/webPlayback';
import { formatClock, useCountdown } from './useCountdown';
import { sounds } from './sounds';
import { TitleBar } from './retro/TitleBar';
import {
  DesktopIcons,
  Taskbar,
  type DesktopShortcut,
  type StartMenuItem,
} from './retro/Desktop';
import { MenuBar, type Menu } from './retro/MenuBar';
import { Toolbar, type ToolbarAction } from './retro/Toolbar';
import { LocationBar } from './retro/LocationBar';
import { StatusBar } from './retro/StatusBar';
import { RetroDialog } from './retro/RetroDialog';
import { RetroIcon, type RetroIconName } from './retro/icons';
import {
  loadAudioPreferences,
  saveAudioPreferences,
  shouldPlayIntro,
  type AudioPreferences,
} from './audio/preferences';
import { playDialUpEffect, stopDialUpEffect } from './audio/dialUpEffect';

const TIME_LIMIT_OPTIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 0, label: 'No limit' },
] as const;

const WINDOW_TITLE = 'Spotify Music Quiz — Netscape Navigator';

type DialogName = 'audio' | 'shortcuts' | 'about' | 'import' | 'exit';

/** Messages for the `auth_error` codes the backend redirects with. */
const AUTH_ERRORS: Record<string, string> = {
  denied: 'Spotify sign-in was cancelled.',
  invalid_state: 'That sign-in link expired. Please connect Spotify again.',
  missing_code:
    'Spotify did not return an authorization code. Please try again.',
  not_configured: 'Spotify is not configured on this server.',
  exchange_failed: 'Spotify refused the sign-in. Please try again.',
  unexpected: 'Spotify sign-in failed unexpectedly. Please try again.',
};

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

  const [dialog, setDialog] = useState<DialogName | undefined>();
  const [audio, setAudio] = useState<AudioPreferences>(() =>
    loadAudioPreferences(),
  );
  const [handshaking, setHandshaking] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const [authenticated, setAuthenticated] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | undefined>();

  const playback = useRef<PlaybackPort>(new StubPlayback());
  const errorRef = useRef<HTMLDivElement>(null);
  const latestGame = useRef<Game | undefined>(undefined);

  const audioVolumeRef = useRef(audio.volume);
  audioVolumeRef.current = audio.volume;

  const remainingMs = useCountdown(
    game?.excerpt_remaining_ms ?? 0,
    game?.status === 'playing',
  );
  const excerptElapsed = game?.status === 'playing' && remainingMs <= 0;

  useEffect(() => {
    debugEvent('app_loaded', {
      pathname: window.location.pathname,
      query_keys: [...new URLSearchParams(window.location.search).keys()].join(
        ',',
      ),
    });
    const id = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .config({ signal: controller.signal })
      .then((value) => {
        debugEvent('config_loaded', {
          spotify_client_id_configured: value.spotify_client_id_configured,
          playback_implemented: value.playback_implemented,
          problem_count: value.problems.length,
        });
        setConfig(value);
      })
      .catch((error: unknown) => {
        debugEvent('config_failed', {
          error: error instanceof Error ? error.name : 'unknown',
        });
        setConfig(undefined);
      });
    return () => controller.abort();
  }, []);

  // Report an OAuth round trip once, then clean the query string so a reload
  // does not repeat the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const failure = params.get('auth_error');
    if (params.get('authenticated') === '1') {
      debugEvent('oauth_redirect', { authenticated: true });
      setAuthNotice('Spotify account connected.');
    } else if (failure) {
      debugEvent('oauth_redirect', { authenticated: false, error: failure });
      setAuthNotice(
        AUTH_ERRORS[failure] ??
          'Spotify sign-in did not complete. Please try again.',
      );
    }
    if (failure || params.get('authenticated')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .authStatus({ signal: controller.signal })
      .then((status) => {
        debugEvent('auth_status', {
          authenticated: status.authenticated,
          configured: status.configured,
        });
        setAuthenticated(status.authenticated);
      })
      .catch((error: unknown) => {
        debugEvent('auth_status_failed', {
          error: error instanceof Error ? error.name : 'unknown',
        });
        setAuthenticated(false);
      });
    return () => controller.abort();
  }, [authNotice]);

  // The stub keeps the game usable offline; a connected account swaps in the
  // real Web Playback SDK so rounds actually make sound.
  useEffect(() => {
    void playback.current.stop();
    playback.current = authenticated
      ? new SpotifyWebPlayback({
          getToken: async () => (await api.accessToken()).access_token,
          volume: audioVolumeRef.current,
        })
      : new StubPlayback();
  }, [authenticated]);

  useEffect(() => {
    return () => {
      void playback.current.stop();
      stopDialUpEffect();
    };
  }, []);

  // Preferences are the single source of truth for every sound in the app.
  useEffect(() => {
    saveAudioPreferences(audio);
    sounds.setEnabled(audio.uiSounds);
    sounds.setVolume(audio.volume);
  }, [audio]);

  const run = useCallback(async (action: () => Promise<Game>) => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await action();
      latestGame.current = next;
      setGame(next);
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
    .map((name) => name.trim())
    .filter(Boolean);

  function stopHandshake() {
    stopDialUpEffect();
    setHandshaking(false);
  }

  /** Fire-and-forget: a failed or unsupported handshake never blocks the game. */
  function startHandshake() {
    if (!shouldPlayIntro(audio)) return;
    setHandshaking(true);
    void playDialUpEffect({ volume: audio.volume })
      .catch(() => undefined)
      .finally(() => setHandshaking(false));
  }

  async function createGame(event: React.FormEvent) {
    event.preventDefault();
    if (participantNames.length === 0) {
      setError('Add at least one team name before starting.');
      errorRef.current?.focus();
      return;
    }
    startHandshake();
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
    try {
      if (command === 'start') {
        sounds.start();
        const target = latestGame.current?.playback;
        await playback.current.start({
          uri: target?.uri ?? 'unknown',
          position_ms: target?.position_ms ?? 0,
        });
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
    } catch (caught) {
      // Playback problems never abort the round: the host can still keep time
      // and score while playing the track by other means.
      setError(
        caught instanceof PlaybackError
          ? caught.message
          : 'Spotify playback failed. The round continues without audio.',
      );
      window.requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  async function award(participantId: string, points: number, reason: string) {
    if (!game) return;
    const ok = await run(() =>
      api.awardScore(game.id, {
        participant_id: participantId,
        points,
        reason,
      }),
    );
    if (ok) sounds.score();
  }

  async function undo(eventId: string) {
    if (!game) return;
    await run(() => api.reverseScore(game.id, eventId));
  }

  function exitQuiz() {
    stopHandshake();
    void playback.current.stop();
    setGame(undefined);
    setError(undefined);
    setDialog(undefined);
  }

  const concealed =
    !game || (game.status !== 'revealed' && game.status !== 'finished');
  const activeEvents =
    game?.score_events.filter((event) => !event.reversed) ?? [];
  const nameOf = (participantId: string) =>
    game?.participants.find((p) => p.id === participantId)?.name ??
    'Unknown team';

  const menus: Menu[] = useMemo(
    () => [
      {
        label: 'File',
        items: [
          {
            label: 'Import playlist…',
            onSelect: () => setDialog('import'),
          },
          {
            label: 'Connect Spotify account',
            onSelect: () => {
              window.location.href = api.loginUrl();
            },
          },
          {
            label: 'Exit quiz',
            disabled: !game,
            onSelect: () => setDialog('exit'),
          },
        ],
      },
      {
        label: 'View',
        items: [
          {
            label: 'Side panel',
            checked: !panelsHidden,
            onSelect: () => setPanelsHidden((value) => !value),
          },
          {
            label: 'Focus mode',
            checked: focusMode,
            onSelect: () => setFocusMode((value) => !value),
          },
        ],
      },
      {
        label: 'Audio',
        items: [
          {
            label: 'Dial-up intro sound',
            checked: audio.introSound,
            onSelect: () =>
              setAudio((current) => ({
                ...current,
                introSound: !current.introSound,
              })),
          },
          {
            label: 'Interface sounds',
            checked: audio.uiSounds,
            onSelect: () =>
              setAudio((current) => ({
                ...current,
                uiSounds: !current.uiSounds,
              })),
          },
          { label: 'Audio preferences…', onSelect: () => setDialog('audio') },
        ],
      },
      {
        label: 'Help',
        items: [
          {
            label: 'Keyboard shortcuts',
            onSelect: () => setDialog('shortcuts'),
          },
          {
            label: 'About Spotify Music Quiz',
            onSelect: () => setDialog('about'),
          },
        ],
      },
    ],
    [audio.introSound, audio.uiSounds, focusMode, game, panelsHidden],
  );

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    const actions: ToolbarAction[] = [];
    if (game) {
      actions.push(
        {
          id: 'start',
          label: 'Play',
          description: 'Start round',
          icon: 'play',
          disabled: busy || game.status !== 'ready',
          onSelect: () => void sendCommand('start'),
        },
        {
          id: 'pause',
          label: 'Pause',
          description:
            game.status === 'paused' ? 'Resume round' : 'Pause round',
          icon: 'pause',
          disabled:
            busy || (game.status !== 'playing' && game.status !== 'paused'),
          onSelect: () =>
            void sendCommand(game.status === 'paused' ? 'resume' : 'pause'),
        },
        {
          id: 'reveal',
          label: 'Reveal',
          description: 'Reveal answer',
          icon: 'reveal',
          disabled:
            busy || (game.status !== 'playing' && game.status !== 'paused'),
          onSelect: () => void sendCommand('reveal'),
        },
        {
          id: 'next',
          label: 'Next',
          description: 'Next round',
          icon: 'next',
          disabled: busy || game.status !== 'revealed',
          onSelect: () => void sendCommand('next'),
        },
        {
          id: 'stop',
          label: 'Stop',
          description: 'Exit quiz',
          icon: 'stop',
          onSelect: () => setDialog('exit'),
        },
      );
    }
    actions.push(
      {
        id: 'audio',
        label: 'Audio',
        description: 'Open audio preferences',
        icon: 'audio',
        onSelect: () => setDialog('audio'),
      },
      {
        id: 'help',
        label: 'Help',
        description: 'About Spotify Music Quiz',
        icon: 'help',
        onSelect: () => setDialog('about'),
      },
    );
    return actions;
    // sendCommand is stable enough for this menu: it only reads current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, game]);

  let connection = 'Ready';
  let connectionIcon: RetroIconName = 'app';
  if (handshaking) {
    connection = 'Connecting… negotiating with the music server';
    connectionIcon = 'loading';
  } else if (error) {
    connection = 'Error — see the message in the document';
    connectionIcon = 'error';
  } else if (busy) {
    connection = 'Working…';
    connectionIcon = 'loading';
  } else if (game) {
    connection = `Document: round ${game.round_number} — ${game.status}`;
  }

  const shortcuts: DesktopShortcut[] = useMemo(
    () => [
      {
        id: 'quiz',
        label: 'Music Quiz',
        icon: 'app',
        onOpen: () => setMinimized(false),
      },
      {
        id: 'spotify',
        label: 'Connect Spotify',
        icon: 'spotify',
        onOpen: () => {
          window.location.href = api.loginUrl();
        },
      },
      {
        id: 'audio',
        label: 'Audio',
        icon: 'audio',
        onOpen: () => setDialog('audio'),
      },
      {
        id: 'help',
        label: 'Help',
        icon: 'help',
        onOpen: () => setDialog('shortcuts'),
      },
    ],
    [],
  );

  const startItems: StartMenuItem[] = useMemo(
    () => [
      {
        label: minimized ? 'Restore Music Quiz' : 'Music Quiz',
        icon: 'app',
        onSelect: () => setMinimized(false),
      },
      {
        label: 'Import playlist…',
        icon: 'import',
        onSelect: () => setDialog('import'),
      },
      {
        label: 'Connect Spotify account',
        icon: 'spotify',
        onSelect: () => {
          window.location.href = api.loginUrl();
        },
      },
      {
        label: 'Audio preferences…',
        icon: 'audio',
        onSelect: () => setDialog('audio'),
      },
      {
        label: 'Keyboard shortcuts',
        icon: 'help',
        onSelect: () => setDialog('shortcuts'),
      },
      {
        label: 'About Spotify Music Quiz',
        icon: 'app',
        onSelect: () => setDialog('about'),
      },
      {
        label: 'Shut down…',
        icon: 'error',
        disabled: !game,
        onSelect: () => setDialog('exit'),
      },
    ],
    [game, minimized],
  );

  const clockLabel = clock.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const playlistLocation = game
    ? `spotify:quiz:${game.id}`
    : 'spotify:playlist:(none selected — using the demo catalogue)';

  return (
    <div className="desktop">
      <DesktopIcons shortcuts={shortcuts} />

      <div
        className={[
          'retro-window',
          focusMode ? 'is-focus-mode' : '',
          minimized ? 'is-minimized' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <TitleBar
          title={WINDOW_TITLE}
          focusMode={focusMode}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setFocusMode((value) => !value)}
          onClose={() => setDialog('exit')}
        />
        <MenuBar menus={menus} />
        <Toolbar actions={toolbarActions} />
        <LocationBar
          value={playlistLocation}
          onImport={() => setDialog('import')}
        />

        <main
          className={panelsHidden ? 'retro-content' : 'retro-content has-panel'}
          aria-labelledby="app-title"
        >
          <div className="window-body">
            <p className="notice" role="note">
              {authenticated
                ? PLAYBACK_READY_NOTICE
                : PLAYBACK_UNAVAILABLE_NOTICE}
            </p>

            {authNotice && (
              <p className="notice" role="status">
                {authNotice}
              </p>
            )}

            {config && config.problems.length > 0 && (
              <section
                className="notice notice-warning"
                aria-labelledby="config-problems"
              >
                <h2 id="config-problems">Configuration needs attention</h2>
                <ul>
                  {config.problems.map((problem) => (
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

            {handshaking && (
              <p className="notice">
                <RetroIcon name="loading" /> Dialling the music server…{' '}
                <button type="button" onClick={stopHandshake}>
                  Skip sound
                </button>
              </p>
            )}

            {!game && (
              <form
                className="card"
                onSubmit={createGame}
                aria-labelledby="setup-heading"
              >
                <h2 id="setup-heading">Set up the quiz</h2>

                <div className="field">
                  <label htmlFor="teams">Teams (comma separated)</label>
                  <input
                    id="teams"
                    name="teams"
                    type="text"
                    value={teams}
                    onChange={(event) => setTeams(event.target.value)}
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
                    onChange={(event) => setRounds(Number(event.target.value))}
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
                    onChange={(event) =>
                      setExcerptSeconds(Number(event.target.value))
                    }
                  />
                </div>

                <fieldset className="field">
                  <legend>Overall time limit</legend>
                  {TIME_LIMIT_OPTIONS.map((option) => (
                    <div className="radio" key={option.value}>
                      <input
                        type="radio"
                        id={`limit-${option.value}`}
                        name="timeLimit"
                        value={option.value}
                        checked={timeLimit === option.value}
                        onChange={() => setTimeLimit(option.value)}
                      />
                      <label htmlFor={`limit-${option.value}`}>
                        {option.label}
                      </label>
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
                        <span className="visually-hidden">
                          Time remaining in this excerpt:{' '}
                        </span>
                        <output aria-live="off">
                          {formatClock(remainingMs)}
                        </output>
                      </p>
                      {excerptElapsed && (
                        <p className="timer-elapsed" aria-live="polite">
                          The excerpt time is up. Reveal the answer when you are
                          ready.
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
                    {game.participants.map((participant) => (
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
                      {game.participants.map((participant) => (
                        <li key={participant.id}>
                          <span className="scoring-team">
                            {participant.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void award(participant.id, 1, 'title')
                            }
                            disabled={busy}
                          >
                            <span aria-hidden="true">+1</span>
                            <span className="visually-hidden">
                              Award one point to {participant.name} for the
                              title
                            </span>
                            <span aria-hidden="true"> title</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void award(participant.id, 1, 'artist')
                            }
                            disabled={busy}
                          >
                            <span aria-hidden="true">+1</span>
                            <span className="visually-hidden">
                              Award one point to {participant.name} for the
                              artist
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
                      {activeEvents.map((event) => (
                        <li key={event.id}>
                          <span>
                            {nameOf(event.participant_id)}: {event.points} for{' '}
                            {event.reason}
                          </span>
                          <button
                            type="button"
                            onClick={() => void undo(event.id)}
                            disabled={busy}
                          >
                            <span aria-hidden="true">Undo</span>
                            <span className="visually-hidden">
                              Undo {event.points} points for{' '}
                              {nameOf(event.participant_id)}
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

          {!panelsHidden && (
            <aside className="retro-panel" aria-labelledby="panel-heading">
              <h2 id="panel-heading">Quiz master notes</h2>
              <p className="hint">
                Answers stay concealed on the server until you reveal them, so
                this window can be shown on a shared screen.
              </p>
              <h3>Audio</h3>
              <p className="hint">
                Dial-up intro: {audio.introSound ? 'on' : 'off'} · Interface
                sounds: {audio.uiSounds ? 'on' : 'off'} · Volume:{' '}
                {Math.round(audio.volume * 100)}%
              </p>
              <button type="button" onClick={() => setDialog('audio')}>
                Audio preferences…
              </button>
            </aside>
          )}
        </main>

        <StatusBar
          connection={connection}
          connectionIcon={connectionIcon}
          round={
            game
              ? `Round ${game.round_number}/${game.rounds}`
              : 'No document loaded'
          }
          players={game ? `${game.participants.length} teams` : undefined}
          clock={clockLabel}
        />
      </div>

      <Taskbar
        windowTitle={WINDOW_TITLE}
        minimized={minimized}
        onToggleWindow={() => setMinimized((value) => !value)}
        startItems={startItems}
        clock={clockLabel}
      />

      <RetroDialog
        title="Audio preferences"
        icon="audio"
        open={dialog === 'audio'}
        onClose={() => setDialog(undefined)}
      >
        <div className="field">
          <div className="radio">
            <input
              type="checkbox"
              id="pref-intro"
              checked={audio.introSound}
              onChange={(event) =>
                setAudio({ ...audio, introSound: event.target.checked })
              }
            />
            <label htmlFor="pref-intro">
              Play the dial-up intro when a quiz starts
            </label>
          </div>
          <div className="radio">
            <input
              type="checkbox"
              id="pref-skip"
              checked={audio.skipIntro}
              onChange={(event) =>
                setAudio({ ...audio, skipIntro: event.target.checked })
              }
            />
            <label htmlFor="pref-skip">Skip the intro this session</label>
          </div>
          <div className="radio">
            <input
              type="checkbox"
              id="pref-ui"
              checked={audio.uiSounds}
              onChange={(event) =>
                setAudio({ ...audio, uiSounds: event.target.checked })
              }
            />
            <label htmlFor="pref-ui">Play short interface sounds</label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pref-volume">
            Volume: {Math.round(audio.volume * 100)}%
          </label>
          <input
            className="retro-range"
            id="pref-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(audio.volume * 100)}
            onChange={(event) =>
              setAudio({ ...audio, volume: Number(event.target.value) / 100 })
            }
          />
          <p className="hint">
            Sounds are synthesised in the browser, so nothing is downloaded and
            no recording is bundled with the app.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            void playDialUpEffect({ volume: audio.volume }).catch(
              () => undefined,
            )
          }
        >
          Preview intro sound
        </button>
      </RetroDialog>

      <RetroDialog
        title="Keyboard shortcuts"
        icon="help"
        open={dialog === 'shortcuts'}
        onClose={() => setDialog(undefined)}
      >
        <table className="retro-kbd-table">
          <caption className="visually-hidden">
            Keyboard shortcuts for the retro interface
          </caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tab / Shift + Tab</td>
              <td>Move between controls</td>
            </tr>
            <tr>
              <td>Left / Right</td>
              <td>Move between menu titles</td>
            </tr>
            <tr>
              <td>Enter or Down</td>
              <td>Open the focused menu</td>
            </tr>
            <tr>
              <td>Up / Down / Home / End</td>
              <td>Move inside an open menu</td>
            </tr>
            <tr>
              <td>Escape</td>
              <td>Close the menu or dialog and return focus</td>
            </tr>
          </tbody>
        </table>
      </RetroDialog>

      <RetroDialog
        title="About Spotify Music Quiz"
        icon="app"
        open={dialog === 'about'}
        onClose={() => setDialog(undefined)}
      >
        <p>
          A music quiz for a shared screen, wearing a 1996 interface. The
          Windows 95 and Netscape Navigator look is an homage drawn from
          scratch: no Microsoft, Netscape, or Spotify assets are bundled.
        </p>
        <p className="hint">
          Audio plays through the Spotify Web Playback SDK in this browser and
          requires a connected Spotify Premium account. Without one, the quiz
          keeps time and score only.
        </p>
      </RetroDialog>

      <RetroDialog
        title="Import playlist"
        icon="import"
        open={dialog === 'import'}
        onClose={() => setDialog(undefined)}
      >
        <p>
          Spotify is connected, but this interface does not yet display a
          playlist picker. The server can read Spotify playlists; this dialog
          will be replaced by the picker when that UI is wired in.
        </p>
        <p className="hint">
          Use the File menu to reconnect Spotify if the account status is not
          shown as connected.
        </p>
      </RetroDialog>

      <RetroDialog
        title="Exit quiz"
        icon="error"
        open={dialog === 'exit'}
        onClose={() => setDialog(undefined)}
        footer={
          <>
            <button type="button" onClick={() => setDialog(undefined)}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={exitQuiz}>
              Exit quiz
            </button>
          </>
        }
      >
        <p>
          Exit the current quiz and return to the setup screen? Scores for this
          game are kept on the server.
        </p>
      </RetroDialog>
    </div>
  );
}

export default App;
