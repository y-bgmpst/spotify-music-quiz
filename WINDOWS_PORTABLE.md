# Windows Portable Build - Öffentlicher Dienst Edition

Standalone-Version für Windows-Laptops mit Group Policy Restrictions (GPO).
Läuft ohne Installation, keine Admin-Rechte erforderlich.

## Zielumgebung

- Windows 10/11 (öD Standard)
- Eingeschränkte Benutzerrechte (keine Admin)
- GPO-Restriktionen:
  - Keine Software-Installation
  - Kein Python/Node.js systemweit
  - AppData/LocalAppData meist erlaubt
  - Portable Apps aus Benutzerverzeichnis meist OK

## Technische Strategie

### Option A: Electron App (Empfohlen)
- Backend + Frontend in einer .exe
- Python-Backend via PyInstaller embedded
- Kein externes Browser-Fenster nötig
- Doppelklick → läuft

### Option B: Standalone Executable + Browser
- Backend als einzelne .exe (PyInstaller)
- Frontend pre-built (statische HTML/JS/CSS)
- Öffnet automatisch Standard-Browser
- Leichtgewichtiger

## Build-Prozess

### Phase 1: Backend als .exe kompilieren
```bash
# Auf Windows oder via Wine
pip install pyinstaller
pyinstaller --onefile \
  --add-data "backend/src/music_quiz/persistence/schema.sql:music_quiz/persistence" \
  --hidden-import uvicorn \
  --hidden-import httpx \
  backend/src/music_quiz/main.py \
  -n spotify-quiz-backend.exe
```

### Phase 2: Frontend als statische Dateien
```bash
npm --prefix frontend run build
# Ergebnis: frontend/dist/ enthält index.html + assets/
```

### Phase 3: Launcher-Skript
Windows Batch (.bat) oder PowerShell (.ps1):
1. Startet Backend im Hintergrund
2. Wartet auf Server-Ready (Health-Check)
3. Öffnet Browser mit Frontend
4. Bei Beenden: Backend-Prozess killen

### Phase 4: Paketierung
```
spotify-quiz-portable/
├── spotify-quiz.bat          # Launcher
├── backend.exe               # PyInstaller-Build
├── frontend/                 # Vite Build Output
│   ├── index.html
│   └── assets/
├── .env.example
├── ANLEITUNG.txt
└── config/
    └── (leere Ordner für DB)
```

## GPO-Kompatibilität

### Was funktioniert:
✅ Portable Apps aus `%USERPROFILE%\Documents\`
✅ Schreiben nach `%LOCALAPPDATA%\spotify-quiz\`
✅ Browser öffnen via `start http://...`
✅ SQLite-DB in Benutzerverzeichnis

### Was problematisch sein kann:
⚠️ PowerShell Execution Policy (Lösung: .bat statt .ps1)
⚠️ Windows Defender SmartScreen (Lösung: Signatur oder Whitelist)
⚠️ Firewall-Popup bei localhost-Server (Lösung: User muss einmal erlauben)

## Alternativen für maximale Kompatibilität

### Option C: WASM + Tauri
- Komplett Rust-basiert
- Kleinste Binary
- Aber: komplexer Build

### Option D: Web-Only (Cloud-Hosting)
- Keine lokale Installation
- Aber: Spotify OAuth Redirect muss zu Cloud-URL
- Nur wenn Admin Redirect URI anpassen kann

## Empfehlung

**Starte mit Option B** (Standalone .exe + Browser):
- Einfachster Build
- Transparent für IT-Support
- Funktioniert in 90% der öD-Umgebungen
- Bei Problemen: Electron-Wrapper nachliefern

## Nächste Schritte

1. PyInstaller-Spec für Backend schreiben
2. Vite-Build-Config optimieren (base path, asset handling)
3. Launcher.bat schreiben (Backend starten, Browser öffnen, Cleanup)
4. Testen auf GPO-gesperrtem Windows-Test-System
5. ZIP-Paket mit Anleitung erstellen
