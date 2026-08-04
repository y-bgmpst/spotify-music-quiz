# 🎸 Spotify Music Quiz - 90s Edition

[![Build Windows](https://github.com/YOUR_USERNAME/spotify-music-quiz/actions/workflows/build-windows.yml/badge.svg)](https://github.com/YOUR_USERNAME/spotify-music-quiz/actions/workflows/build-windows.yml)
[![Build Ubuntu](https://github.com/YOUR_USERNAME/spotify-music-quiz/actions/workflows/build-ubuntu.yml/badge.svg)](https://github.com/YOUR_USERNAME/spotify-music-quiz/actions/workflows/build-ubuntu.yml)

A nostalgic Windows 95 themed music quiz game powered by Spotify, featuring authentic 90s aesthetics with Netscape Navigator styling.

## ✨ Features

- 🖥️ **Authentic Windows 95 Desktop** with taskbar and desktop icons
- 🌐 **Netscape Navigator Window** with 90s browser styling
- 🎵 **Spotify Integration** with OAuth 2.0 PKCE flow
- ⏱️ **Timed Quizzes** (5 min / 10 min / Unlimited)
- 🔊 **90s Sound Effects** with Web Audio API
- 🏙️ **Frankfurt Skyline** background
- 📦 **Windows Portable Build** (no installation required)

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Spotify Developer Account

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/spotify-music-quiz.git
   cd spotify-music-quiz
   ```

2. **Configure Spotify OAuth**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - Add redirect URI: `http://127.0.0.1:8000/api/v1/auth/callback`
   - Copy your Client ID

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your SPOTIFY_CLIENT_ID
   ```

4. **Install dependencies**
   ```bash
   # Backend
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt

   # Frontend
   cd frontend
   npm install
   ```

5. **Run the application**
   ```bash
   # Terminal 1: Backend
   uvicorn music_quiz.main:app --reload --app-dir backend/src

   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

6. **Open in browser**
   ```
   http://localhost:5173
   ```

## 📦 Windows Portable Build

Download the latest Windows portable build from [Releases](https://github.com/YOUR_USERNAME/spotify-music-quiz/releases).

### Build from source

```bash
# Windows
.\build-scripts\build-windows.ps1

# Linux
chmod +x build-scripts/build-linux.sh
./build-scripts/build-linux.sh
```

## 🎮 How to Play

1. Click **"🔑 Spotify Login"** to authenticate
2. Select quiz time limit (5/10 minutes or unlimited)
3. Click **"🚀 START QUIZ"**
4. Listen to track excerpts and guess the song
5. Award points to teams using the point buttons

## 🛠️ Development

### Project Structure

```
spotify-music-quiz/
├── backend/
│   ├── src/music_quiz/      # FastAPI backend
│   └── tests/                # Backend tests
├── frontend/
│   ├── src/                  # React + TypeScript frontend
│   └── public/               # Static assets
├── scripts/
│   ├── import-playlist.py    # Excel → Spotify import
│   ├── batch-import-playlist.py  # Rate-limit-safe import
│   └── find-playlists.py     # Find public 90s playlists
├── build-scripts/            # Build automation
└── .github/workflows/        # CI/CD pipelines
```

### Tech Stack

**Backend:**
- Python 3.11
- FastAPI
- SQLite
- HTTPX
- python-dotenv

**Frontend:**
- React 18
- TypeScript
- Vite
- Web Audio API

## 📋 Import Your Own Playlist

1. Create Excel file with columns: Rank, Artist, Title, Year
2. Run batch import (rate-limit safe):
   ```bash
   .venv/bin/python scripts/batch-import-playlist.py
   ```

## 🤝 Contributing

Contributions welcome! Please open an issue or submit a pull request.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🎨 Design Credits

- Windows 95 UI inspired by classic Microsoft design
- Netscape Navigator styling
- Frankfurt skyline silhouette

## 🔗 Links

- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api)
- [Setup Guide](SPOTIFY_SETUP_GUIDE.md)
- [Build Guide](BUILD_GUIDE.md)
- [Windows Portable Guide](WINDOWS_PORTABLE.md)

---

Made with ❤️ in Frankfurt am Main 🏙️
