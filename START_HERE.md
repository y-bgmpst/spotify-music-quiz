# Start Here — Running Codex

## Recommended method

1. Create or open an empty repository directory in Codex.
2. Copy all files from this starter package into the repository root.
3. Open `CODEX_MASTER_BOOTSTRAP_PROMPT.md`.
4. Give Codex this instruction:

```text
Execute CODEX_MASTER_BOOTSTRAP_PROMPT.md in the current repository. Treat PROJECT_MASTER_PROMPT.md and MVP_SPECIFICATION.md as authoritative. Work directly in the repository, run all available checks, and keep docs/implementation-status.md updated. Do not stop for missing Spotify credentials; use the fake adapter and leave live playback as a documented manual check.
```

Codex should then initialize and implement the project itself.

## Alternative: only provide one prompt

When the coding environment supports attached/context files, provide `CODEX_MASTER_BOOTSTRAP_PROMPT.md` together with the four requirement/review files. The master prompt instructs Codex to create missing root files when their full contents are present in context.

## Credentials

Do not paste a Spotify Client Secret into Codex chat or frontend files. Later, place only required local values into an untracked `.env` based on the generated `.env.example`.
