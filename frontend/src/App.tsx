import { useEffect, useRef, useState } from 'react';
import { api, Game } from './api/client';
import { FakePlayback } from './spotify/player';

export function App() {
  const [game, setGame] = useState<Game | undefined>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const player = useRef(new FakePlayback());
  const timer = useRef<number | undefined>();

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      void player.current.stop();
    },
    [],
  );
  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      setGame(
        await api.create({
          rounds: 3,
          excerpt_seconds: 10,
          participants: ['Team A', 'Team B'],
          seed: 42,
        }),
      );
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
  const concealed =
    !game || (game.status !== 'revealed' && game.status !== 'finished');
  return (
    <main>
      <header>
        <p className="eyebrow">PRIVATE PLAYLIST GAME</p>
        <h1>Guess the track.</h1>
        <p className="subhead">A clean, host-controlled quiz for your room.</p>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!game && (
        <section className="card intro">
          <h2>Ready when you are.</h2>
          <p>
            Use the fake catalog to rehearse the complete game without Spotify
            credentials.
          </p>
          <button onClick={create} disabled={busy}>
            Create demo game
          </button>
        </section>
      )}
      {game && (
        <section className="game" aria-live="polite">
          <div className="round-bar">
            <span>
              ROUND {game.round_number} / {game.rounds}
            </span>
            <span className="status">{game.status.toUpperCase()}</span>
          </div>
          <div className="card stage">
            {concealed ? (
              <>
                <div className="mystery">?</div>
                <h2>What are we listening to?</h2>
                <p className="timer">{seconds}s</p>
              </>
            ) : game.answer ? (
              <>
                <p className="eyebrow">THE ANSWER</p>
                <h2>{game.answer.title}</h2>
                <p>
                  {game.answer.artists.join(', ')} · {game.answer.album}
                </p>
              </>
            ) : (
              <h2>Game complete</h2>
            )}
            <div className="controls">
              {game.status === 'ready' && (
                <button onClick={() => void command('start')} disabled={busy}>
                  Start excerpt
                </button>
              )}
              {game.status === 'playing' && (
                <button onClick={() => void command('pause')} disabled={busy}>
                  Pause
                </button>
              )}
              {game.status === 'paused' && (
                <button onClick={() => void command('resume')} disabled={busy}>
                  Resume
                </button>
              )}
              {(game.status === 'playing' || game.status === 'paused') && (
                <button
                  className="secondary"
                  onClick={() => void command('reveal')}
                  disabled={busy}
                >
                  Reveal answer
                </button>
              )}
              {game.status === 'revealed' && (
                <button onClick={() => void command('next')} disabled={busy}>
                  Next round
                </button>
              )}
            </div>
          </div>
          <div className="scores">
            {game.participants.map(
              (participant: { id: string; name: string; score: number }) => (
                <div className="score" key={participant.id}>
                  <span>{participant.name}</span>
                  <strong>{participant.score}</strong>
                </div>
              ),
            )}
          </div>
        </section>
      )}
    </main>
  );
}
