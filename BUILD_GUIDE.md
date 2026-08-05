# Windows Portable Build - Schritt-für-Schritt

## Aktueller Stand

**Fake Playlist:** Aktuell nutzt das System eine Test-Playlist mit 12 Generic Tracks (`fake-playlist`).
Diese wird automatisch verwendet wenn `FAKE_SPOTIFY=true` in `.env` gesetzt ist.

**Live Spotify:** Nach Login werden echte Playlists vom User-Account geladen via Spotify Web API.

## Build-Optionen

### Option 1: Auf Windows-System (Empfohlen)

```powershell
# In PowerShell
cd C:\Users\...\spotify-music-quiz
.\build-windows.ps1
```

**Voraussetzungen:**
- Windows 10/11
- Python 3.11+ (python.org)
- Node.js 18+ (nodejs.org)

**Ergebnis:**
```
build/
└── spotify-quiz-portable-2026-08-04.zip  (~ 50-80 MB)
```

### Option 2: Mit Wine auf Linux (Experimentell)

```bash
# Auf Arch/CachyOS
sudo pacman -S wine mingw-w64-python
./build-windows.sh
```

**Problem:** PyInstaller funktioniert oft nicht sauber via Wine.

### Option 3: GitHub Actions (CI/CD)

Erstelle `.github/workflows/build-windows.yml` für automatische Builds.

## Manuelle Schritte (falls Scripts nicht funktionieren)

### 1. Frontend bauen
```bash
cd /home/rhax/projects/spotify-music-quiz
npm --prefix frontend install
npm --prefix frontend run build
# → frontend/dist/
```

### 2. Backend kompilieren (auf Windows)
```cmd
pip install pyinstaller
pyinstaller windows-portable\backend.spec --clean --noconfirm
# → dist\spotify-quiz-backend.exe
```

### 3. Paket zusammenstellen
```
spotify-quiz-portable/
├── spotify-quiz-backend.exe   (von dist/)
├── frontend/                   (von frontend/dist/)
├── launcher.bat                (von windows-portable/)
├── ANLEITUNG.txt              (von windows-portable/)
├── .env                       (von .env.example, editieren!)
├── data/                      (leerer Ordner)
└── config/                    (leerer Ordner)
```

### 4. ZIP erstellen
```bash
cd build
zip -r spotify-quiz-portable-$(date +%Y%m%d).zip spotify-quiz-portable/
```

## Nach dem Build

### Testen
1. ZIP entpacken
2. `.env` editieren: `SPOTIFY_CLIENT_ID=...`
3. Doppelklick auf `launcher.bat`
4. Browser öffnet sich bei `http://127.0.0.1:8000/frontend/`

### Verteilen
- ZIP per E-Mail/USB an Kollegen
- In SharePoint/Intranet hochladen
- Anleitung: `ANLEITUNG.txt` lesen lassen

## GPO-Test

Teste auf gesperrtem System:
1. Als normaler User anmelden (nicht Admin)
2. ZIP nach `%USERPROFILE%\Documents\` entpacken
3. `launcher.bat` ausführen
4. Bei Firewall-Popup: "Zugriff erlauben"

Sollte funktionieren ohne:
- Admin-Rechte
- Installation
- Registry-Änderungen
- Systemverzeichnis-Zugriff

## Troubleshooting

**PyInstaller fehlt auf Windows:**
```cmd
pip install pyinstaller
```

**Frontend Build schlägt fehl:**
```bash
npm --prefix frontend install --force
```

**Backend startet nicht:**
→ Prüfe ob Python-Dependencies in .exe embedded sind
→ Teste mit: `spotify-quiz-backend.exe` direkt starten

**Firewall blockt:**
→ Lokale Admin-Rechte nötig für ersten Start
→ Alternativ: IT-Admin Firewall-Rule erstellen für Port 8000

## Nächste Schritte

1. **Jetzt:** Teste Build auf Windows-VM oder echtem Windows-System
2. **Dann:** ZIP an Kollegen verteilen zum Testen
3. **Optional:** GitHub Release mit fertigem ZIP erstellen
4. **Optional:** Installer mit NSIS für noch einfachere Installation
