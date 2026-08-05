import { useEffect, useRef, useState } from 'react';
import { api, Game } from './api/client';
import { FakePlayback } from './spotify/player';

export function App() {
  const [game, setGame] = useState<Game | undefined>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timeLimit, setTimeLimit] = useState<number | null>(300); // 5 min default
  const [showConfig, setShowConfig] = useState(true);
  const player = useRef(new FakePlayback());
  const timer = useRef<number | undefined>();
  const totalTimer = useRef<number | undefined>();

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
        participants: ['Team A', 'Team B'],
        seed: 42,
        time_limit_seconds: timeLimit || undefined,
      });
      setGame(newGame);
      setShowConfig(false);

      // Start total timer if time limit is set
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
        // Play sound effect
        playSound('start');
      }
      if (name === 'reveal') {
        playSound('reveal');
      }
      if (name === 'next') {
        playSound('next');
      }
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

  function playSound(type: string) {
    // Placeholder for 90s sound effects
    // Could use Web Audio API to generate beeps/boops
    console.log(`🔊 Playing ${type} sound`);
  }

  function formatTime(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  }

  const concealed =
    !game || (game.status !== 'revealed' && game.status !== 'finished');
  const timeLimitWarning = totalSeconds > 0 && totalSeconds <= 60;

  return (
    <main>
      <header>
        <span className="title-bar-text">
          🎵 Spotify Music Quiz - 90s Edition 🎵
        </span>
        <div className="title-bar-controls">
          <button className="title-bar-button" aria-label="Minimize">
            _
          </button>
          <button className="title-bar-button" aria-label="Maximize">
            □
          </button>
          <button className="title-bar-button" aria-label="Close">
            ×
          </button>
        </div>
      </header>

      <div className="window-body">
        {error && (
          <div role="alert" className="error">
            <span>{error}</span>
          </div>
        )}

        {showConfig && !game && (
          <section className="card intro">
            <p className="eyebrow">★ NETSCAPE NAVIGATOR 3.0 COMPATIBLE ★</p>
            <h1>🎸 90s MUSIC QUIZ 🎸</h1>
            <p className="scrolling-text">
              <span>
                ★ Welcome to the ultimate 90s music quiz experience! ★
              </span>
            </p>

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

            <div style={{ marginTop: '16px' }}>
              <button className="primary" onClick={create} disabled={busy}>
                🚀 START QUIZ 🚀
              </button>
            </div>

            <p
              style={{ marginTop: '16px', fontSize: '10px', color: '#808080' }}
            >
              Best viewed in 800×600 resolution • Made in Frankfurt am Main 🏙️
            </p>
          </section>
        )}

        {game && (
          <section className="game" aria-live="polite">
            <div className="status-bar">
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
                <div
                  className={`time-limit-timer ${timeLimitWarning ? 'warning' : ''}`}
                >
                  {formatTime(totalSeconds)}
                </div>
              )}

              {concealed ? (
                <>
                  <div className="mystery">?</div>
                  <h2>What are we listening to?</h2>
                  <div className="timer">{seconds}s</div>
                  {seconds === 0 && game.status === 'playing' && (
                    <p
                      className="blink"
                      style={{ color: '#ff0000', fontWeight: 'bold' }}
                    >
                      ⚠️ TIME'S UP! ⚠️
                    </p>
                  )}
                </>
              ) : game.answer ? (
                <>
                  <p className="eyebrow">★ THE ANSWER ★</p>
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
                  <p className="blink">Thanks for playing!</p>
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
                  <button
                    onClick={() => void command('resume')}
                    disabled={busy}
                  >
                    ▶️ Resume
                  </button>
                )}
                {(game.status === 'playing' || game.status === 'paused') && (
                  <button
                    className="secondary"
                    onClick={() => void command('reveal')}
                    disabled={busy}
                  >
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
                        playSound('score');
                        // TODO: Implement score API endpoint
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

      <div className="status-bar">
        <div className="status-field">🏙️ Frankfurt Edition</div>
        <div className="status-field">Ready</div>
        <div className="status-field">
          {new Date().toLocaleTimeString('de-DE', { hour12: false })}
        </div>
      </div>
    </main>
  );
}
