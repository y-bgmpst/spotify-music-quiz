import { useEffect, useRef, useState } from 'react';
import { api, Game } from './api/client';
import { FakePlayback } from './spotify/player';
import { sounds } from './sounds';

interface DesktopIcon {
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  selected: boolean;
}

export function App() {
  const [game, setGame] = useState<Game | undefined>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timeLimit, setTimeLimit] = useState<number | null>(300);
  const [showConfig, setShowConfig] = useState(true);
  const [time, setTime] = useState(new Date());

  // Desktop state
  const [desktopIcons, setDesktopIcons] = useState<DesktopIcon[]>([
    { id: 'mycomputer', label: 'My Computer', icon: '💻', x: 10, y: 10, selected: false },
    { id: 'network', label: 'Network Neighborhood', icon: '🌐', x: 10, y: 100, selected: false },
    { id: 'recyclebin', label: 'Recycle Bin', icon: '🗑️', x: 10, y: 190, selected: false },
    { id: 'netscape', label: 'Netscape Navigator', icon: '🧭', x: 10, y: 280, selected: false },
    { id: 'minesweeper', label: 'Minesweeper', icon: '💣', x: 10, y: 370, selected: false },
  ]);

  const [windowPos, setWindowPos] = useState({ x: 100, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const player = useRef(new FakePlayback());
  const timer = useRef<number | undefined>();
  const totalTimer = useRef<number | undefined>();

  // Clock update
  useEffect(() => {
    const clockInterval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      if (totalTimer.current) window.clearInterval(totalTimer.current);
      void player.current.stop();
    },
    [],
  );

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const newGame = await api.create({
        rounds: 10,
        excerpt_seconds: 10,
        mode: 'intro',
        participants: ['Team A', 'Team B'],
        seed: 42,
        time_limit_seconds: timeLimit || undefined,
      });
      setGame(newGame);
      setShowConfig(false);

      if (timeLimit) {
        setTotalSeconds(timeLimit);
        totalTimer.current = window.setInterval(() => {
          setTotalSeconds((value: number) => {
            if (value <= 1) {
              window.clearInterval(totalTimer.current);
              return 0;
            }
            return value - 1;
          });
        }, 1000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function command(name: string) {
    if (!game || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await api.command(game.id, name);
      setGame(next);
      if (name === 'start' && next.status === 'playing') {
        setSeconds(next.excerpt_seconds);
        if (timer.current) window.clearInterval(timer.current);
        timer.current = window.setInterval(
          () =>
            setSeconds((value: number) => {
              if (value <= 1) {
                window.clearInterval(timer.current);
                void player.current.pause();
                return 0;
              }
              return value - 1;
            }),
          1000,
        );
        sounds.start();
      }
      if (name === 'reveal') sounds.reveal();
      if (name === 'next') sounds.next();
      if (name === 'reveal' || name === 'next') {
        if (timer.current) window.clearInterval(timer.current);
        await player.current.stop();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function formatTime(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  }

  function handleIconClick(id: string, event: React.MouseEvent) {
    if (!event.ctrlKey) {
      setDesktopIcons(icons =>
        icons.map(icon => ({
          ...icon,
          selected: icon.id === id,
        })),
      );
    } else {
      setDesktopIcons(icons =>
        icons.map(icon =>
          icon.id === id ? { ...icon, selected: !icon.selected } : icon,
        ),
      );
    }
  }

  function handleWindowMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-titlebar')) {
      setDragging(true);
      setDragStart({
        x: e.clientX - windowPos.x,
        y: e.clientY - windowPos.y,
      });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging) {
      setWindowPos({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }

  function handleMouseUp() {
    setDragging(false);
  }

  const concealed = !game || (game.status !== 'revealed' && game.status !== 'finished');
  const timeLimitWarning = totalSeconds > 0 && totalSeconds <= 60;

  return (
    <div
      className="desktop"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => setDesktopIcons(icons => icons.map(i => ({ ...i, selected: false })))}
    >
      {/* Desktop Icons */}
      <div className="desktop-icons" onClick={(e) => e.stopPropagation()}>
        {desktopIcons.map(icon => (
          <div
            key={icon.id}
            className={`desktop-icon ${icon.selected ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleIconClick(icon.id, e);
            }}
          >
            <div className="icon-image">{icon.icon}</div>
            <div className="icon-label">{icon.label}</div>
          </div>
        ))}
      </div>

      {/* Netscape Navigator Window */}
      <div
        className="window"
        style={{
          left: `${windowPos.x}px`,
          top: `${windowPos.y}px`,
          width: '800px',
          height: '600px',
        }}
        onMouseDown={handleWindowMouseDown}
      >
        <div className="window-titlebar">
          <div className="window-title">
            <span className="netscape-logo">N</span>
            <span>Netscape: Spotify Music Quiz - 90s Edition</span>
            <span className={`netscape-throbber ${busy || dragging ? 'loading' : ''}`}>N</span>
          </div>
          <div className="window-controls">
            <button className="window-button" title="Minimize">_</button>
            <button className="window-button" title="Maximize">□</button>
            <button className="window-button" title="Close">×</button>
          </div>
        </div>

        <div className="window-body">
          <div className="quiz-content">
            {error && (
              <div role="alert" className="error">
                <span>{error}</span>
              </div>
            )}

            {showConfig && !game && (
              <section className="card intro">
                <p style={{ fontSize: '10px', color: '#808080', textAlign: 'center' }}>
                  ★ NETSCAPE NAVIGATOR 3.0 COMPATIBLE ★
                </p>
                <h1 style={{ textAlign: 'center' }}>🎸 90s MUSIC QUIZ 🎸</h1>
                <p style={{ textAlign: 'center', margin: '8px 0' }}>
                  ★ Welcome to the ultimate 90s music quiz experience! ★
                </p>

                <fieldset className="config-section">
                  <legend>🎵 Select Playlist</legend>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        name="playlist"
                        value="fake"
                        defaultChecked
                      />
                      <span>Test Playlist (12 Fake Tracks)</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="playlist"
                        value="90s-usa"
                      />
                      <span>🇺🇸 Top 100 - 90s USA Hits</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="playlist"
                        value="90s-europe"
                      />
                      <span>🇪🇺 Top 100 - 90s Europe Classics</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="playlist"
                        value="90s-germany"
                      />
                      <span>🇩🇪 Top 100 - 90s Germany Hits</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="playlist"
                        value="custom"
                      />
                      <span>📝 Custom (Your Spotify Playlists)</span>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="config-section">
                  <legend>⏱️ Quiz Time Limit</legend>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        name="timeLimit"
                        value="300"
                        checked={timeLimit === 300}
                        onChange={() => setTimeLimit(300)}
                      />
                      <span>5 Minutes (Fast & Furious!)</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="timeLimit"
                        value="600"
                        checked={timeLimit === 600}
                        onChange={() => setTimeLimit(600)}
                      />
                      <span>10 Minutes (Chill Mode)</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="timeLimit"
                        value="null"
                        checked={timeLimit === null}
                        onChange={() => setTimeLimit(null)}
                      />
                      <span>No Limit (Unlimited Power!)</span>
                    </label>
                  </div>
                </fieldset>

                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <button className="primary" onClick={create} disabled={busy}>
                    🚀 START QUIZ 🚀
                  </button>
                  <button onClick={() => window.location.href = 'http://127.0.0.1:8000/api/v1/auth/login'} style={{ marginLeft: '8px' }}>
                    🔑 Spotify Login
                  </button>
                </div>

                <p style={{ marginTop: '16px', fontSize: '10px', color: '#808080', textAlign: 'center' }}>
                  Best viewed in 800×600 resolution • Made in Frankfurt am Main 🏙️
                </p>
              </section>
            )}

            {game && (
              <section className="game" aria-live="polite">
                <div className="window-statusbar">
                  <div className="status-field">
                    ROUND {game.round_number} / {game.rounds}
                  </div>
                  <div className="status-field">
                    STATUS: {game.status.toUpperCase()}
                  </div>
                  {game.time_limit_seconds && (
                    <div className="status-field">
                      ⏱️ {formatTime(totalSeconds)}
                    </div>
                  )}
                </div>

                <div className="card stage">
                  {game.time_limit_seconds && totalSeconds > 0 && (
                    <div className={`time-limit-timer ${timeLimitWarning ? 'warning' : ''}`}>
                      {formatTime(totalSeconds)}
                    </div>
                  )}

                  {concealed ? (
                    <>
                      <div className="mystery">?</div>
                      <h2>What are we listening to?</h2>
                      <div className="timer">{seconds}s</div>
                      {seconds === 0 && game.status === 'playing' && (
                        <p style={{ color: '#ff0000', fontWeight: 'bold', animation: 'blink 1.5s infinite' }}>
                          ⚠️ TIME'S UP! ⚠️
                        </p>
                      )}
                    </>
                  ) : game.answer ? (
                    <>
                      <p style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                        ★ THE ANSWER ★
                      </p>
                      <h1>{game.answer.title}</h1>
                      <p style={{ fontSize: '14px', margin: '12px 0' }}>
                        <strong>Artist:</strong> {game.answer.artists.join(', ')}
                      </p>
                      <p style={{ fontSize: '12px', color: '#808080' }}>
                        Album: {game.answer.album}
                      </p>
                    </>
                  ) : (
                    <>
                      <h1>🏆 GAME COMPLETE! 🏆</h1>
                      <p style={{ animation: 'blink 1.5s infinite' }}>Thanks for playing!</p>
                    </>
                  )}

                  <div className="controls">
                    {game.status === 'ready' && (
                      <button onClick={() => void command('start')} disabled={busy}>
                        ▶️ Start
                      </button>
                    )}
                    {game.status === 'playing' && (
                      <button onClick={() => void command('pause')} disabled={busy}>
                        ⏸️ Pause
                      </button>
                    )}
                    {game.status === 'paused' && (
                      <button onClick={() => void command('resume')} disabled={busy}>
                        ▶️ Resume
                      </button>
                    )}
                    {(game.status === 'playing' || game.status === 'paused') && (
                      <button onClick={() => void command('reveal')} disabled={busy}>
                        💡 Reveal
                      </button>
                    )}
                    {game.status === 'revealed' && (
                      <button onClick={() => void command('next')} disabled={busy}>
                        ⏭️ Next Round
                      </button>
                    )}
                  </div>
                </div>

                <fieldset style={{ margin: '12px 0', padding: '12px' }}>
                  <legend style={{ fontWeight: 'bold', color: '#000080' }}>
                    📊 SCOREBOARD 📊
                  </legend>
                  <div className="scores">
                    {game.participants.map((p) => (
                      <div key={p.id} className="score">
                        <span className="score-name">{p.name}</span>
                        <span className="score-value">{p.score} pts</span>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {game.status === 'revealed' && (
                  <fieldset style={{ margin: '12px 0', padding: '12px' }}>
                    <legend style={{ fontWeight: 'bold', color: '#008080' }}>
                      ➕ Award Points
                    </legend>
                    <p style={{ fontSize: '11px', marginBottom: '8px' }}>
                      Click a team to award points for this round:
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {game.participants.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            console.log(`Award points to ${p.name}`);
                            sounds.score();
                          }}
                        >
                          +1 {p.name}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Taskbar */}
      <div className="taskbar">
        <button className="start-button">
          <span className="start-icon">🪟</span>
          <span>Start</span>
        </button>

        <div className="taskbar-divider"></div>

        <div className="taskbar-items">
          <div className="taskbar-item active">
            <span>🧭</span>
            <span>Netscape: Spotify Music Quiz</span>
          </div>
        </div>

        <div className="system-tray">
          <span className="tray-icon" title="Volume">🔊</span>
          <div className="clock">{time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    </div>
  );
}
