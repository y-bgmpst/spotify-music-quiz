$ErrorActionPreference = 'Stop'
python -m venv .venv
.venv\Scripts\pip install -e '.\backend[dev]'
npm --prefix frontend install

