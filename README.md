# Spotify Music Quiz — Windows 95 / Netscape Edition

A local-first music guessing game with a Windows 95 desktop and Netscape Navigator-inspired interface.

## Windows — easiest way (no installation)

You do not need Python, Node.js, Git, or administrator rights for the packaged version.

1. Open the repository’s [Actions page](https://github.com/y-bgmpst/spotify-music-quiz/actions).
2. Open the latest successful **Build Windows Portable** run.
3. At the bottom, download the artifact named `spotify-music-quiz-windows-portable`.
4. Extract the downloaded ZIP to your **Documents** folder or Desktop.
   Do not use `C:\Program Files` or a read-only network folder.
5. Open the extracted folder and double-click `launcher.bat`.
6. The quiz opens in your browser at <http://127.0.0.1:8000/frontend/>.

The demo works without Spotify login. It uses fake tracks so you can test the game immediately. For live Spotify features, open the bundled `.env` file with Notepad and enter your Spotify Client ID; never add a Client Secret.

### If something goes wrong

- **Nothing opens:** double-click `launcher.bat` again, then open <http://127.0.0.1:8000/frontend/> manually.
- **Port already in use:** close another copy of the quiz, then retry.
- **Windows SmartScreen warning:** the portable executable is unsigned; choose **More info → Run anyway** only if you trust the downloaded repository artifact.
- **Your organization blocks local apps:** ask IT whether user-space applications and `127.0.0.1:8000` are allowed. The app cannot bypass company policy.

## Current status

The game engine, SQLite persistence, OAuth PKCE helpers, fake Spotify catalog, scoring, and automated tests are implemented. Automated development uses fake tracks. Live Spotify Web Playback SDK wiring and production playlist loading still require manual integration and verification.

The standalone playlist import script can search Spotify and create a private playlist. It uses a persistent search cache and conservative rate-limit handling.

## Requirements

- Python 3.11+
- Node.js 20+
- npm
- A Spotify Developer application only for OAuth/import work

## Local setup

```bash
git clone https://github.com/y-bgmpst/spotify-music-quiz.git
cd spotify-music-quiz

cp .env.example .env
# Edit .env and set SPOTIFY_CLIENT_ID when OAuth is needed.

python3 -m venv .venv
.venv/bin/pip install -e './backend[dev]'
npm --prefix frontend ci
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
python -m venv .venv
.venv\Scripts\pip install -e '.\backend[dev]'
npm --prefix frontend ci
```

The OAuth redirect must be registered exactly as:

```text
http://127.0.0.1:8000/api/v1/auth/callback
```

Do not put a Spotify Client Secret in this project or in frontend code.

## Run the app

Start the backend:

```bash
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src
```

In another terminal, start the frontend:

```bash
npm --prefix frontend run dev
```

Open <http://127.0.0.1:5173>.

Without Spotify credentials, use the fake playlist to exercise the game flow. The local database is stored at `.data/quiz.db` by default.

## Import a playlist from Excel

The rate-limit-aware importer expects an Excel file named `Top100_90er_Weltweit_Deutschland_Frankfurt.xlsx` in the repository root or in `~/Downloads`. Expected columns are rank, artist, title, and year.

After logging in through the local app, run:

```bash
.venv/bin/python scripts/batch-import-playlist.py
```

The importer:

- reuses one HTTP connection;
- caches successful and not-found searches in `.data/spotify-search-cache.json`;
- paces all requests;
- honors Spotify `Retry-After` responses;
- uses bounded retry with backoff for transient failures;
- adds tracks in Spotify-supported chunks of up to 100.

Never commit `.env`, the SQLite database, or the search cache.

## Quality checks

```bash
make format
make lint
make typecheck
make test
make build
make verify
```

Frontend end-to-end tests require the backend to be running:

```bash
npm --prefix frontend run e2e
```

CI runs on both Ubuntu and Windows through:

- `.github/workflows/ci-ubuntu.yml`
- `.github/workflows/ci-windows.yml`

## Repository layout

```text
backend/                 FastAPI app, domain rules, persistence, tests
frontend/                React/Vite UI and browser tests
scripts/                 Spotify import and playlist utilities
docs/                    Architecture, security, setup, and status notes
windows-portable/        Portable launcher assets
.github/workflows/       Ubuntu and Windows CI
```

## Design direction

The interface is intentionally inspired by Windows 95 and Netscape Navigator: beveled controls, a desktop/taskbar shell, a browser-like quiz window, dense status information, and restrained 1990s colors. See [the design-generation prompt](docs/win95-netscape-design-prompt.md) for the full visual and UX brief.

## Security and Spotify boundaries

- Do not download, cache, record, transform, or redistribute Spotify audio.
- Do not expose answer metadata before reveal, including hidden DOM, ARIA labels, logs, media metadata, or track URIs.
- Keep Spotify tokens and OAuth state out of logs and source control.
- Live playback is unverified until tested with an eligible Spotify Premium account.

See [docs/security.md](docs/security.md), [docs/spotify-setup.md](docs/spotify-setup.md), and [docs/live-playback-checklist.md](docs/live-playback-checklist.md).

## License

MIT License. See [LICENSE](LICENSE).
