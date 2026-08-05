#!/usr/bin/env sh
set -eu
python3 -m venv .venv
.venv/bin/pip install -e './backend[dev]'
npm --prefix frontend install

