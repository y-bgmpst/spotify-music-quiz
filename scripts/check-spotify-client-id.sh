#!/usr/bin/env bash
set -Eeuo pipefail

package_dir="${1:-$PWD}"
env_file="$package_dir/.env"
redirect_uri="${SPOTIFY_REDIRECT_URI:-http://127.0.0.1:8000/api/v1/auth/callback}"

read -r -p 'Spotify Client ID: ' client_id

if [[ ! "$client_id" =~ ^[0-9a-f]{32}$ ]]; then
  echo 'FEHLER: Die Client-ID muss aus genau 32 Kleinbuchstaben/Ziffern bestehen.' >&2
  exit 1
fi

echo 'Prüfe Client-ID und Redirect-URI bei Spotify ...'
status="$({
  curl --silent --show-error --location=false \
    --connect-timeout 5 --max-time 15 \
    --output /dev/null --write-out '%{http_code}' \
    --get 'https://accounts.spotify.com/authorize' \
    --data-urlencode 'response_type=code' \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "redirect_uri=$redirect_uri" \
    --data-urlencode 'state=configuration-check' \
    --data-urlencode 'code_challenge_method=S256' \
    --data-urlencode 'code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
} 2>/dev/null)" || {
  echo 'FEHLER: Spotify ist nicht erreichbar.' >&2
  exit 1
}

case "$status" in
  200|302|303)
    echo "Spotify akzeptiert die OAuth-Konfiguration (HTTP $status)."
    ;;
  400)
    echo 'FEHLER: Spotify weist Client-ID oder Redirect-URI zurück.' >&2
    echo "Registriert sein muss exakt: $redirect_uri" >&2
    exit 1
    ;;
  *)
    echo "FEHLER: Unerwartete Spotify-Antwort: HTTP $status" >&2
    exit 1
    ;;
esac

mkdir -p "$package_dir/data"
umask 077
session_secret="$(openssl rand -hex 32 2>/dev/null || od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
cat > "$env_file" <<EOF
SPOTIFY_CLIENT_ID=$client_id
SPOTIFY_REDIRECT_URI=$redirect_uri
BACKEND_ORIGIN=http://127.0.0.1:8000
FRONTEND_ORIGIN=http://127.0.0.1:8000
SESSION_SECRET=$session_secret
DATABASE_PATH=$package_dir/data/quiz.db
FAKE_SPOTIFY=false
EOF

echo "Gespeichert: $env_file"
echo 'Starte danach mit: ./start.sh'
