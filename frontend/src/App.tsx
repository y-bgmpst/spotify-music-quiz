import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  toDisplayMessage,
  type ConfigStatus,
  type Game,
  type PlaylistAnalysis,
  type RoundCommand,
  type SpotifyPlaylist,
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
  { value: 300, label: '5 Minuten' },
  { value: 600, label: '10 Minuten' },
  { value: 0, label: 'Keine Begrenzung' },
] as const;

const WINDOW_TITLE = 'Back to the 90s – Amt 16 Musikquiz';

const STATUS_LABELS: Record<Game['status'], string> = {
  ready: 'bereit',
  playing: 'läuft',
  paused: 'pausiert',
  revealed: 'aufgedeckt',
  finished: 'beendet',
};

type DialogName = 'audio' | 'shortcuts' | 'about' | 'import' | 'exit';

const DISPLAY_CHANNEL = 'spotify-music-quiz-display';
const DISPLAY_STATE_KEY = 'spotify-music-quiz-display-state';

type DisplayState = Pick<
  Game,
  | 'id'
  | 'status'
  | 'round_number'
  | 'rounds'
  | 'excerpt_seconds'
  | 'excerpt_remaining_ms'
  | 'excerpt_deadline_ms'
  | 'answer'
>;

/** Messages for the `auth_error` codes the backend redirects with. */
const AUTH_ERRORS: Record<string, string> = {
  denied: 'Die Spotify-Anmeldung wurde abgebrochen.',
  invalid_state:
    'Der Anmeldelink ist abgelaufen. Bitte Spotify erneut verbinden.',
  missing_code:
    'Spotify hat keinen Autorisierungscode zurückgegeben. Bitte erneut versuchen.',
  not_configured: 'Spotify ist auf diesem Server nicht eingerichtet.',
  exchange_failed:
    'Spotify hat die Anmeldung abgelehnt. Bitte erneut versuchen.',
  unexpected:
    'Die Spotify-Anmeldung ist unerwartet fehlgeschlagen. Bitte erneut versuchen.',
};

function HostApp() {
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
  const [playbackTest, setPlaybackTest] = useState<string | undefined>();
  const [authGeneration, setAuthGeneration] = useState(0);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | undefined>();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>();
  const [analysis, setAnalysis] = useState<PlaylistAnalysis>();
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const playlistRequest = useRef<Promise<void> | undefined>(undefined);

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
    const state: DisplayState | null = game
      ? {
          id: game.id,
          status: game.status,
          round_number: game.round_number,
          rounds: game.rounds,
          excerpt_seconds: game.excerpt_seconds,
          excerpt_remaining_ms: game.excerpt_remaining_ms,
          excerpt_deadline_ms: game.excerpt_deadline_ms,
          answer: game.answer,
        }
      : null;
    const storage = window.localStorage;
    if (storage) {
      if (state) storage.setItem(DISPLAY_STATE_KEY, JSON.stringify(state));
      else storage.removeItem(DISPLAY_STATE_KEY);
    }
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(DISPLAY_CHANNEL);
      channel.postMessage(state);
      channel.close();
    }
  }, [game]);

  useEffect(() => {
    if (!excerptElapsed) return;
    // The backend remains authoritative for the round state; the browser
    // player must nevertheless stop as soon as the local interpolation of
    // that server deadline reaches zero.
    void playback.current.pause();
  }, [excerptElapsed, game?.id, game?.round_number]);

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

  // Report an OAuth round trip once, then clean the query string so a reload
  // does not repeat the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const failure = params.get('auth_error');
    const success =
      params.get('auth_callback') === 'success' ||
      params.get('authenticated') === '1';
    if (success) {
      setAuthNotice('Spotify-Konto verbunden.');
      setError(undefined);
      setAuthGeneration((generation) => generation + 1);
    } else if (failure) {
      setAuthNotice(
        AUTH_ERRORS[failure] ??
          'Die Spotify-Anmeldung wurde nicht abgeschlossen. Bitte erneut versuchen.',
      );
    }
    if (failure || success) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .authStatus({ signal: controller.signal })
      .then((status) => setAuthenticated(status.authenticated))
      .catch(() => setAuthenticated(false));
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
  }, [authGeneration, authenticated]);

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

  const selectedPlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylistId,
  );
  const canContinueWithPlaylist = Boolean(
    selectedPlaylist && analysis && analysis.eligible_unique_tracks > 0,
  );

  function playlistErrorMessage(caught: unknown, action: string) {
    if (caught instanceof ApiError) {
      if (
        caught.status === 401 ||
        caught.code === 'spotify_not_authenticated'
      ) {
        return 'Spotify ist nicht mehr verbunden. Verbinde Spotify erneut und versuche es wieder.';
      }
      if (caught.status === 403)
        return 'Spotify hat den Zugriff auf diese Playlist verweigert.';
      if (caught.status === 404)
        return 'Diese Playlist ist nicht mehr verfügbar.';
      if (caught.status === 429)
        return 'Spotify begrenzt gerade die Anfragen. Bitte gleich erneut versuchen.';
      if (caught.status && caught.status >= 500) {
        return `Der Server konnte die Playlist-${action === 'list' ? 'liste' : 'analyse'} nicht laden. Bitte erneut versuchen.`;
      }
      if (caught.kind === 'network' || caught.kind === 'timeout') {
        return 'Der Quizserver ist nicht erreichbar. Prüfe die Verbindung und versuche es erneut.';
      }
    }
    return `Die Playlist-${action === 'list' ? 'liste' : 'analyse'} ist fehlgeschlagen. Bitte erneut versuchen.`;
  }

  const loadPlaylists = useCallback(async () => {
    if (playlistRequest.current) return playlistRequest.current;
    setPlaylistsLoading(true);
    setPlaylistsError(undefined);
    const request = api
      .playlists()
      .then(setPlaylists)
      .catch((caught: unknown) =>
        setPlaylistsError(playlistErrorMessage(caught, 'list')),
      )
      .finally(() => {
        playlistRequest.current = undefined;
        setPlaylistsLoading(false);
      });
    playlistRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (dialog === 'import' && authenticated && playlists.length === 0) {
      void loadPlaylists();
    }
  }, [authenticated, dialog, loadPlaylists, playlists.length]);

  async function analyzeSelectedPlaylist() {
    if (!selectedPlaylistId) return;
    setAnalysisLoading(true);
    setAnalysisError(undefined);
    try {
      setAnalysis(
        await api.playlistAnalysis(selectedPlaylistId, excerptSeconds, 'intro'),
      );
    } catch (caught) {
      setAnalysis(undefined);
      setAnalysisError(playlistErrorMessage(caught, 'analysis'));
    } finally {
      setAnalysisLoading(false);
    }
  }

  function selectPlaylist(id: string) {
    setSelectedPlaylistId(id);
    setAnalysis(undefined);
    setAnalysisError(undefined);
  }

  async function logoutSpotify() {
    setBusy(true);
    setError(undefined);
    try {
      await api.logout();
      await playback.current.stop();
      playback.current = new StubPlayback();
      setAuthenticated(false);
      setAuthGeneration((generation) => generation + 1);
      setAuthNotice('Spotify-Konto getrennt.');
      setPlaybackTest(undefined);
      setPlaylists([]);
      setSelectedPlaylistId(undefined);
      setAnalysis(undefined);
      setGame(undefined);
    } catch (caught) {
      setError(toDisplayMessage(caught));
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  async function testSpotifyPlayer() {
    setPlaybackTest('Spotify-Player-Verbindung wird getestet…');
    try {
      await playback.current.testConnection();
      setPlaybackTest(
        'Spotify-Player ist bereit. Klicke auf „Start“, um Audio zu testen.',
      );
    } catch (caught) {
      setPlaybackTest(
        caught instanceof PlaybackError
          ? caught.message
          : 'Die Spotify-Player-Verbindung konnte nicht hergestellt werden.',
      );
    }
  }

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
      setError('Gib vor dem Start mindestens ein Team an.');
      errorRef.current?.focus();
      return;
    }
    if (authenticated && !canContinueWithPlaylist) {
      setError(
        'Wähle vor dem Start eine Spotify-Playlist aus und analysiere sie.',
      );
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
        playlist_id: selectedPlaylistId,
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
        await playback.current.pause();
      }
      if (command === 'next') {
        sounds.next();
        await playback.current.pause();
      }
    } catch (caught) {
      // Playback problems never abort the round: the host can still keep time
      // and score while playing the track by other means.
      setError(
        caught instanceof PlaybackError
          ? caught.message
          : 'Spotify-Wiedergabe fehlgeschlagen. Die Runde läuft ohne Audio weiter.',
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
    'Unbekanntes Team';

  const menus: Menu[] = useMemo(
    () => [
      {
        label: 'File',
        items: [
          {
            label: 'Spotify-Playlist auswählen…',
            onSelect: () => setDialog('import'),
          },
          {
            label: 'Beamer-Ansicht öffnen',
            onSelect: () => {
              window.open(
                `${window.location.pathname}?view=display`,
                'spotify-music-quiz-display',
                'popup,width=1280,height=720',
              );
            },
          },
          {
            label: 'Spotify-Konto verbinden',
            onSelect: () => {
              window.location.href = api.loginUrl();
            },
          },
          {
            label: 'Von Spotify abmelden',
            disabled: !authenticated || busy,
            onSelect: () => void logoutSpotify(),
          },
          {
            label: 'Quiz beenden',
            disabled: !game,
            onSelect: () => setDialog('exit'),
          },
        ],
      },
      {
        label: 'Ansicht',
        items: [
          {
            label: 'Seitenleiste',
            checked: !panelsHidden,
            onSelect: () => setPanelsHidden((value) => !value),
          },
          {
            label: 'Fokusmodus',
            checked: focusMode,
            onSelect: () => setFocusMode((value) => !value),
          },
        ],
      },
      {
        label: 'Audio',
        items: [
          {
            label: 'Einwahlton beim Start',
            checked: audio.introSound,
            onSelect: () =>
              setAudio((current) => ({
                ...current,
                introSound: !current.introSound,
              })),
          },
          {
            label: 'Oberflächenklänge',
            checked: audio.uiSounds,
            onSelect: () =>
              setAudio((current) => ({
                ...current,
                uiSounds: !current.uiSounds,
              })),
          },
          { label: 'Audioeinstellungen…', onSelect: () => setDialog('audio') },
        ],
      },
      {
        label: 'Hilfe',
        items: [
          {
            label: 'Tastaturkürzel',
            onSelect: () => setDialog('shortcuts'),
          },
          {
            label: 'Über Back to the 90s',
            onSelect: () => setDialog('about'),
          },
        ],
      },
    ],
    [
      audio.introSound,
      audio.uiSounds,
      authenticated,
      busy,
      focusMode,
      game,
      panelsHidden,
    ],
  );

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    const actions: ToolbarAction[] = [];
    if (game) {
      actions.push(
        {
          id: 'start',
          label: 'Start',
          description: 'Runde starten',
          icon: 'play',
          disabled: busy || game.status !== 'ready',
          onSelect: () => void sendCommand('start'),
        },
        {
          id: 'pause',
          label: 'Pause',
          description:
            game.status === 'paused' ? 'Runde fortsetzen' : 'Runde pausieren',
          icon: 'pause',
          disabled:
            busy || (game.status !== 'playing' && game.status !== 'paused'),
          onSelect: () =>
            void sendCommand(game.status === 'paused' ? 'resume' : 'pause'),
        },
        {
          id: 'reveal',
          label: 'Auflösen',
          description: 'Antwort aufdecken',
          icon: 'reveal',
          disabled:
            busy || (game.status !== 'playing' && game.status !== 'paused'),
          onSelect: () => void sendCommand('reveal'),
        },
        {
          id: 'next',
          label: 'Weiter',
          description: 'Nächste Runde',
          icon: 'next',
          disabled: busy || game.status !== 'revealed',
          onSelect: () => void sendCommand('next'),
        },
        {
          id: 'stop',
          label: 'Stopp',
          description: 'Quiz beenden',
          icon: 'stop',
          onSelect: () => setDialog('exit'),
        },
      );
    }
    actions.push(
      {
        id: 'audio',
        label: 'Audio',
        description: 'Audioeinstellungen öffnen',
        icon: 'audio',
        onSelect: () => setDialog('audio'),
      },
      {
        id: 'help',
        label: 'Hilfe',
        description: 'Über Back to the 90s',
        icon: 'help',
        onSelect: () => setDialog('about'),
      },
    );
    return actions;
    // sendCommand is stable enough for this menu: it only reads current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, game]);

  let connection = 'Bereit';
  let connectionIcon: RetroIconName = 'app';
  if (handshaking) {
    connection = 'Verbinde… Musikserver wird kontaktiert';
    connectionIcon = 'loading';
  } else if (error) {
    connection = 'Fehler — Meldung im Fenster beachten';
    connectionIcon = 'error';
  } else if (busy) {
    connection = 'Arbeite…';
    connectionIcon = 'loading';
  } else if (game) {
    connection = `Dokument: Runde ${game.round_number} — ${STATUS_LABELS[game.status]}`;
  }

  const shortcuts: DesktopShortcut[] = useMemo(
    () => [
      {
        id: 'quiz',
        label: 'Back to the 90s',
        icon: 'app',
        onOpen: () => setMinimized(false),
      },
      {
        id: 'spotify',
        label: 'Spotify verbinden',
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
        label: 'Hilfe',
        icon: 'help',
        onOpen: () => setDialog('shortcuts'),
      },
    ],
    [],
  );

  const startItems: StartMenuItem[] = useMemo(
    () => [
      {
        label: minimized ? 'Quiz wiederherstellen' : 'Back to the 90s',
        icon: 'app',
        onSelect: () => setMinimized(false),
      },
      {
        label: 'Spotify-Playlist auswählen…',
        icon: 'import',
        onSelect: () => setDialog('import'),
      },
      {
        label: 'Spotify-Konto verbinden',
        icon: 'spotify',
        onSelect: () => {
          window.location.href = api.loginUrl();
        },
      },
      {
        label: 'Von Spotify abmelden',
        icon: 'stop',
        disabled: !authenticated || busy,
        onSelect: () => void logoutSpotify(),
      },
      {
        label: 'Audioeinstellungen…',
        icon: 'audio',
        onSelect: () => setDialog('audio'),
      },
      {
        label: 'Tastaturkürzel',
        icon: 'help',
        onSelect: () => setDialog('shortcuts'),
      },
      {
        label: 'Über Back to the 90s',
        icon: 'app',
        onSelect: () => setDialog('about'),
      },
      {
        label: 'Beenden…',
        icon: 'error',
        disabled: !game,
        onSelect: () => setDialog('exit'),
      },
    ],
    [authenticated, busy, game, minimized],
  );

  const clockLabel = clock.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const playlistLocation = game
    ? `spotify:quiz:${game.id}`
    : selectedPlaylist
      ? `spotify:playlist:${selectedPlaylist.name}`
      : 'spotify:playlist:(Playlist auswählen)';

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
            <div className="notice auth-notice" role="note">
              <span>
                {authenticated
                  ? PLAYBACK_READY_NOTICE
                  : PLAYBACK_UNAVAILABLE_NOTICE}
              </span>
              {authenticated && (
                <span className="auth-actions">
                  <button
                    type="button"
                    onClick={() => void testSpotifyPlayer()}
                    disabled={busy || playbackTest?.startsWith('Testing')}
                  >
                    Spotify-Player testen
                  </button>
                  <button
                    type="button"
                    onClick={() => void logoutSpotify()}
                    disabled={busy}
                  >
                    Von Spotify abmelden
                  </button>
                </span>
              )}
            </div>

            {playbackTest && (
              <p className="notice" role="status">
                {playbackTest}
              </p>
            )}

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
                <h2 id="config-problems">Konfiguration prüfen</h2>
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
                <RetroIcon name="loading" /> Musikserver wird angewählt…{' '}
                <button type="button" onClick={stopHandshake}>
                  Ton überspringen
                </button>
              </p>
            )}

            {!game && (
              <form
                className="card"
                onSubmit={createGame}
                aria-labelledby="setup-heading"
              >
                <h2 id="setup-heading">Quiz einrichten</h2>

                {authenticated && (
                  <section
                    className="playlist-selection"
                    aria-labelledby="selected-playlist-heading"
                  >
                    <h3 id="selected-playlist-heading">Spotify-Playlist</h3>
                    {selectedPlaylist && analysis ? (
                      <div className="playlist-selected">
                        <strong>{selectedPlaylist.name}</strong>
                        <span>
                          {analysis.eligible_unique_tracks} geeignete Titel ·{' '}
                          {analysis.total_items} Titel insgesamt
                        </span>
                        <button
                          type="button"
                          onClick={() => setDialog('import')}
                        >
                          Playlist ändern
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="hint">
                          Wähle eine echte Spotify-Playlist aus und analysiere
                          sie vor dem Start.
                        </p>
                        <button
                          type="button"
                          onClick={() => setDialog('import')}
                        >
                          Spotify-Playlist auswählen…
                        </button>
                      </>
                    )}
                  </section>
                )}

                <div className="field">
                  <label htmlFor="teams">Teams (durch Komma getrennt)</label>
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
                    Zum Beispiel: Team A, Team B
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="rounds">Anzahl der Runden</label>
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
                  <label htmlFor="excerpt">
                    Länge des Ausschnitts in Sekunden
                  </label>
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
                  <legend>Gesamte Zeitbegrenzung</legend>
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
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy || (authenticated && !canContinueWithPlaylist)
                    }
                  >
                    Quiz starten
                  </button>
                  {!authenticated && (
                    <a className="button-link" href={api.loginUrl()}>
                      Spotify-Konto verbinden
                    </a>
                  )}
                </div>
              </form>
            )}

            {game && (
              <section className="game" aria-labelledby="round-heading">
                <h2 id="round-heading">
                  Runde {game.round_number} von {game.rounds}
                </h2>
                <p className="status" aria-live="polite">
                  Status: {STATUS_LABELS[game.status]}
                </p>

                <div className="card stage">
                  {concealed ? (
                    <>
                      <p className="mystery" aria-hidden="true">
                        ?
                      </p>
                      <p>Der Titel bleibt verborgen, bis du ihn aufdeckst.</p>
                      <p className="timer">
                        <span className="visually-hidden">
                          Verbleibende Zeit für diesen Ausschnitt:{' '}
                        </span>
                        <output aria-live="off">
                          {formatClock(remainingMs)}
                        </output>
                      </p>
                      {excerptElapsed && (
                        <p className="timer-elapsed" aria-live="polite">
                          Die Zeit ist abgelaufen. Decke die Antwort auf, wenn
                          du bereit bist.
                        </p>
                      )}
                    </>
                  ) : game.answer ? (
                    <div aria-live="polite">
                      <h3>{game.answer.title}</h3>
                      <p>Interpret: {game.answer.artists.join(', ')}</p>
                      <p>Album: {game.answer.album}</p>
                    </div>
                  ) : (
                    <div aria-live="polite">
                      <h3>Quiz beendet</h3>
                      <p>Danke fürs Mitspielen.</p>
                    </div>
                  )}
                </div>

                <table className="scoreboard">
                  <caption>Punktestand</caption>
                  <thead>
                    <tr>
                      <th scope="col">Team</th>
                      <th scope="col">Punkte</th>
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
                    <h3 id="scoring-heading">Punkte vergeben</h3>
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
                              Einen Punkt für den Titel an {participant.name}
                              vergeben
                            </span>
                            <span aria-hidden="true"> Titel</span>
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
                              Einen Punkt für den Interpreten an{' '}
                              {participant.name}
                              vergeben
                            </span>
                            <span aria-hidden="true"> Interpret</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {activeEvents.length > 0 && (
                  <section className="card" aria-labelledby="history-heading">
                    <h3 id="history-heading">Punkte in diesem Quiz</h3>
                    <ul className="score-history">
                      {activeEvents.map((event) => (
                        <li key={event.id}>
                          <span>
                            {nameOf(event.participant_id)}: {event.points} für{' '}
                            {event.reason}
                          </span>
                          <button
                            type="button"
                            onClick={() => void undo(event.id)}
                            disabled={busy}
                          >
                            <span aria-hidden="true">Rückgängig</span>
                            <span className="visually-hidden">
                              {event.points} Punkte für{' '}
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
              <h2 id="panel-heading">Notizen für den Quizmaster</h2>
              <p className="hint">
                Antworten bleiben bis zum Aufdecken auf dem Server verborgen.
                Dieses Fenster kann auf einem gemeinsamen Bildschirm angezeigt
                werden.
              </p>
              <h3>Audio</h3>
              <p className="hint">
                Einwahlton: {audio.introSound ? 'an' : 'aus'} ·
                Oberflächenklänge: {audio.uiSounds ? 'an' : 'aus'} · Lautstärke:{' '}
                {Math.round(audio.volume * 100)}%
              </p>
              <button type="button" onClick={() => setDialog('audio')}>
                Audioeinstellungen…
              </button>
            </aside>
          )}
        </main>

        <StatusBar
          connection={connection}
          connectionIcon={connectionIcon}
          round={
            game
              ? `Runde ${game.round_number}/${game.rounds}`
              : 'Kein Quiz geladen'
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
        title="Audioeinstellungen"
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
              Einwahlton beim Start des Quiz abspielen
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
            <label htmlFor="pref-skip">
              Einwahlton in dieser Sitzung überspringen
            </label>
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
            <label htmlFor="pref-ui">Kurze Oberflächenklänge abspielen</label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pref-volume">
            Lautstärke: {Math.round(audio.volume * 100)}%
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
            Die Klänge werden im Browser erzeugt; es wird nichts heruntergeladen
            und keine Aufnahme mit der App ausgeliefert.
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
          Einwahlton probehören
        </button>
      </RetroDialog>

      <RetroDialog
        title="Tastaturkürzel"
        icon="help"
        open={dialog === 'shortcuts'}
        onClose={() => setDialog(undefined)}
      >
        <table className="retro-kbd-table">
          <caption className="visually-hidden">
            Tastaturkürzel der Retro-Oberfläche
          </caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tab / Shift + Tab</td>
              <td>Zwischen Steuerelementen wechseln</td>
            </tr>
            <tr>
              <td>Left / Right</td>
              <td>Zwischen Menütiteln wechseln</td>
            </tr>
            <tr>
              <td>Enter or Down</td>
              <td>Fokussiertes Menü öffnen</td>
            </tr>
            <tr>
              <td>Up / Down / Home / End</td>
              <td>Im geöffneten Menü bewegen</td>
            </tr>
            <tr>
              <td>Escape</td>
              <td>Menü/Dialog schließen und Fokus zurückgeben</td>
            </tr>
          </tbody>
        </table>
      </RetroDialog>

      <RetroDialog
        title="Über Back to the 90s"
        icon="app"
        open={dialog === 'about'}
        onClose={() => setDialog(undefined)}
      >
        <p>
          Ein Musikquiz für den gemeinsamen Bildschirm im Look von 1996. Die
          Windows-95- und Netscape-Navigator-Optik ist selbst gestaltet; es
          werden keine Microsoft-, Netscape- oder Spotify-Assets mitgeliefert.
        </p>
        <p className="hint">
          Audio wird über das Spotify Web Playback SDK in diesem Browser
          abgespielt und benötigt ein verbundenes Spotify-Premium-Konto. Ohne
          Konto misst das Quiz nur Zeit und Punkte.
        </p>
      </RetroDialog>

      <RetroDialog
        title="Spotify-Playlist auswählen"
        icon="import"
        open={dialog === 'import'}
        onClose={() => setDialog(undefined)}
        footer={
          <>
            <button
              type="button"
              onClick={() => void loadPlaylists()}
              disabled={playlistsLoading}
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                !canContinueWithPlaylist || analysisLoading || playlistsLoading
              }
              onClick={() => setDialog(undefined)}
            >
              Diese Playlist verwenden
            </button>
          </>
        }
      >
        {!authenticated ? (
          <>
            <p role="status">Verbinde Spotify, um deine Playlists zu laden.</p>
            <a className="button-link" href={api.loginUrl()}>
              Spotify-Konto verbinden
            </a>
          </>
        ) : playlistsLoading ? (
          <p role="status" aria-live="polite">
            Spotify-Playlists werden geladen…
          </p>
        ) : playlistsError ? (
          <div className="error" role="alert">
            <p>{playlistsError}</p>
            <button type="button" onClick={() => void loadPlaylists()}>
              Playlists erneut laden
            </button>
          </div>
        ) : playlists.length === 0 ? (
          <div role="status">
            <p>Keine Spotify-Playlists verfügbar.</p>
            <p className="hint">
              Erstelle oder teile eine Playlist in Spotify und versuche es
              erneut.
            </p>
          </div>
        ) : (
          <>
            <p id="playlist-list-help" className="hint">
              Wähle eine Playlist aus und analysiere sie für den aktuellen
              10-Sekunden-Anfang.
            </p>
            <div
              className="playlist-list"
              role="radiogroup"
              aria-describedby="playlist-list-help"
            >
              {playlists.map((playlist) => (
                <label className="playlist-option" key={playlist.id}>
                  <input
                    type="radio"
                    name="spotify-playlist"
                    value={playlist.id}
                    checked={selectedPlaylistId === playlist.id}
                    onChange={() => selectPlaylist(playlist.id)}
                  />
                  {playlist.image_url ? (
                    <img
                      className="playlist-cover"
                      src={playlist.image_url}
                      alt=""
                    />
                  ) : (
                    <span
                      className="playlist-cover playlist-cover-empty"
                      aria-hidden="true"
                    >
                      ♪
                    </span>
                  )}
                  <span className="playlist-details">
                    <strong>{playlist.name}</strong>
                    <span>
                      {playlist.owner || 'Unbekannter Besitzer'} ·{' '}
                      {playlist.total} Titel
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {selectedPlaylist && (
              <section
                className="playlist-analysis"
                aria-live="polite"
                aria-labelledby="analysis-heading"
              >
                <h3 id="analysis-heading">Playlist-Analyse</h3>
                {analysisError && (
                  <p className="error" role="alert">
                    {analysisError}
                  </p>
                )}
                {analysis ? (
                  <dl className="playlist-summary">
                    <div>
                      <dt>Playlist-Titel insgesamt</dt>
                      <dd>{analysis.total_items}</dd>
                    </div>
                    <div>
                      <dt>Geeignete eindeutige Titel</dt>
                      <dd>{analysis.eligible_unique_tracks}</dd>
                    </div>
                    <div>
                      <dt>Entfernte Duplikate</dt>
                      <dd>{analysis.duplicates_removed}</dd>
                    </div>
                    <div>
                      <dt>Nicht verfügbar / nicht unterstützt</dt>
                      <dd>{analysis.unavailable_or_unsupported}</dd>
                    </div>
                    <div>
                      <dt>Zu kurz für den Ausschnitt</dt>
                      <dd>{analysis.too_short_for_excerpt}</dd>
                    </div>
                  </dl>
                ) : (
                  <p>Analysiere diese Playlist, bevor du fortfährst.</p>
                )}
                {analysis && analysis.eligible_unique_tracks === 0 && (
                  <p className="notice notice-warning">
                    Diese Playlist enthält für die aktuellen Spieleinstellungen
                    keine geeigneten Titel.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void analyzeSelectedPlaylist()}
                  disabled={analysisLoading}
                >
                  {analysisLoading
                    ? 'Analysiere…'
                    : 'Ausgewählte Playlist analysieren'}
                </button>
              </section>
            )}
          </>
        )}
      </RetroDialog>

      <RetroDialog
        title="Quiz beenden"
        icon="error"
        open={dialog === 'exit'}
        onClose={() => setDialog(undefined)}
        footer={
          <>
            <button type="button" onClick={() => setDialog(undefined)}>
              Abbrechen
            </button>
            <button type="button" className="primary" onClick={exitQuiz}>
              Quiz beenden
            </button>
          </>
        }
      >
        <p>
          Das aktuelle Quiz beenden und zur Einrichtung zurückkehren? Der
          Punktestand dieses Spiels bleibt auf dem Server erhalten.
        </p>
      </RetroDialog>
    </div>
  );
}

function DisplayView() {
  const [state, setState] = useState<DisplayState | undefined>(() => {
    const saved = window.localStorage?.getItem(DISPLAY_STATE_KEY);
    if (!saved) return undefined;
    try {
      return JSON.parse(saved) as DisplayState;
    } catch {
      return undefined;
    }
  });
  const remainingMs = useCountdown(
    state?.excerpt_remaining_ms ?? 0,
    state?.status === 'playing',
  );

  useEffect(() => {
    const apply = (next: DisplayState | null) => setState(next ?? undefined);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DISPLAY_STATE_KEY) return;
      apply(
        event.newValue ? (JSON.parse(event.newValue) as DisplayState) : null,
      );
    };
    window.addEventListener('storage', onStorage);
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(DISPLAY_CHANNEL)
        : undefined;
    if (channel)
      channel.onmessage = (event: MessageEvent<DisplayState | null>) =>
        apply(event.data);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, []);

  return (
    <main className="player-display" aria-labelledby="display-heading">
      <div className="player-browser-window">
        <header className="player-browser-titlebar">
          <span className="player-browser-mark" aria-hidden="true">
            N
          </span>
          <h1 id="display-heading">Back to the 90s – Amt 16 Musikquiz</h1>
          <span className="player-browser-buttons" aria-hidden="true">
            _ □ ×
          </span>
        </header>
        <nav className="player-browser-menubar" aria-label="Beamer-Menü">
          <span>Datei</span>
          <span>Bearbeiten</span>
          <span>Ansicht</span>
          <span>Gehe zu</span>
          <span>Lesezeichen</span>
          <span>Optionen</span>
          <span>Verzeichnis</span>
          <span>Hilfe</span>
        </nav>
        <div className="player-browser-toolbar" aria-hidden="true">
          <span className="player-browser-tool">
            ←<small>Zurück</small>
          </span>
          <span className="player-browser-tool">
            →<small>Vorwärts</small>
          </span>
          <span className="player-browser-tool">
            ⌂<small>Home</small>
          </span>
          <span className="player-browser-tool">
            ↻<small>Neu laden</small>
          </span>
          <span className="player-browser-tool">
            ▧<small>Bilder</small>
          </span>
          <span className="player-browser-tool">
            ▤<small>Öffnen</small>
          </span>
          <span className="player-browser-tool">
            ⌕<small>Suchen</small>
          </span>
          <span className="player-browser-tool player-browser-tool-stop">
            ■<small>Stopp</small>
          </span>
        </div>
        <div className="player-browser-tabs" aria-hidden="true">
          <span>Was gibt&apos;s Neues?</span>
          <span>Handbuch</span>
          <span>Netzsuche</span>
          <span>Verzeichnis</span>
          <span>Software</span>
        </div>
        <div className="player-browser-location">
          <span className="player-browser-location-label">Adresse:</span>
          <span className="player-browser-location-value">
            http://amt16.local/quiz
          </span>
          <span className="player-browser-n-mark" aria-hidden="true">
            N
          </span>
        </div>
        <div className="player-display-inner">
          <header className="player-display-header">
            <div>
              <p className="player-display-kicker">
                AMT 16 · FRANKFURT AM MAIN
              </p>
              <h2>Back to the 90s</h2>
            </div>
            <p>Beamer-Ansicht</p>
          </header>
          {!state ? (
            <section className="player-display-card">
              <h3>Warte auf den Quizmaster</h3>
              <p>Das Quiz erscheint hier, sobald der Quizmaster es startet.</p>
            </section>
          ) : (
            <section className="player-display-card">
              <p className="player-display-round">
                Runde {state.round_number} von {state.rounds}
              </p>
              <p className="player-display-status">
                Status: {STATUS_LABELS[state.status]}
              </p>
              {state.status === 'revealed' && state.answer ? (
                <div className="player-display-answer" aria-live="polite">
                  <h2>{state.answer.title}</h2>
                  <p>Interpret: {state.answer.artists.join(', ')}</p>
                  <p>Album: {state.answer.album}</p>
                </div>
              ) : state.status === 'playing' || state.status === 'paused' ? (
                <div className="player-display-playing" aria-live="polite">
                  <p className="player-display-mystery" aria-hidden="true">
                    ?
                  </p>
                  <p>
                    Der Titel bleibt verborgen, bis der Quizmaster ihn aufdeckt.
                  </p>
                  <output className="player-display-clock">
                    {formatClock(remainingMs)}
                  </output>
                </div>
              ) : (
                <p>Bereit für den nächsten Ausschnitt.</p>
              )}
            </section>
          )}
        </div>
        <footer className="player-browser-footer">
          Bereit · Back to the 90s
        </footer>
      </div>
    </main>
  );
}

export function App() {
  const displayMode =
    new URLSearchParams(window.location.search).get('view') === 'display';
  return displayMode ? <DisplayView /> : <HostApp />;
}

export default App;
