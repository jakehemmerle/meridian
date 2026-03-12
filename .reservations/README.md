# File Reservations

This directory holds agent file-reservation claims to prevent merge conflicts when multiple Claude Code agents work concurrently.

## Format

Each agent creates a single JSON file named `{agent-name}.json`:

```json
{
  "agent": "agent-name",
  "issue": "br-123",
  "files": ["path/to/file.rs", "other/file.ts"],
  "claimed_at": "2026-03-12T15:30:00Z",
  "expires_at": "2026-03-12T16:30:00Z",
  "reason": "br-123: short description"
}
```

## Protocol

1. **Check:** `git pull --rebase`, then read all `*.json` files here. Skip any with `expires_at` in the past.
2. **Claim:** If no conflict with active reservations, create your JSON file, commit, and push immediately.
3. **Work:** Edit your reserved files. For shared config files, keep the hold window short (10 min TTL).
4. **Release:** Delete your JSON file, commit, and push.

See `../AGENTS.md` → **Multi-Agent Coordination** for full rules.
