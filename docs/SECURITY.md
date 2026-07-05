# Security Notes

This repository is designed to be safe to share.

## Never Commit

- `~/.codex/auth.json`
- real `~/.codex/config.toml` with private values
- `.env` files
- API keys
- bearer tokens
- MCP credentials
- provider credentials
- SSH keys
- local logs with prompts or tool outputs
- user-specific absolute paths unless they are examples

## Before Publishing

Run a basic secret scan:

```bash
rg -n --hidden --glob '!**/.git/**' 'sk-[A-Za-z0-9_-]+|OPENAI_API_KEY|api[_-]?key|bearer|token|password|secret|auth.json|BEGIN (RSA|OPENSSH|PRIVATE) KEY'
```

Matches in documentation warnings are expected. Real credentials are not.

## Dropbox And Cloud Sync

Cloud folders can retain file history. If a secret was ever synced, remove it from the cloud history as well as from the current checkout.

## Config Discipline

Use `config/config.toml.example` as a public snippet. Keep private config in your local Codex home or an ignored local file.
