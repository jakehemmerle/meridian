# Meridian Agent Guide

This file supplements the workspace-level [AGENTS.md](../../AGENTS.md).

The root policy still applies in full. This file only adds `Meridian`-specific onboarding and
execution guidance.

## Scope

- The active implementation repo is this worktree root (`.`)
- If you are working from a parent container repo, treat this checkout as the source of truth
- Do not treat the parent repo as the main codebase for Meridian work

## Read First

Before starting any task in this repo, read these in order:

1. [AGENTS.md](../../AGENTS.md)
2. [requirements.md](./requirements.md)
3. [research-rubric.md](./research-rubric.md)
4. [research-codex.md](./research-codex.md)

These documents contain the current product requirements, resolved architecture decisions, and
research-backed implementation assumptions.

## Current Decisions

Treat these as fixed unless a new issue explicitly changes them:

- Smart contract framework: Anchor on Solana
- CLOB: Phoenix
- Oracle: Pyth
- Market close: 4:00 PM ET
- Settlement source of truth: last regular-session Pyth update published at or before 4:00 PM ET
- `Sell No` baseline: buy Yes, then `merge`
- `merge` is a required protocol primitive, not a frontend workaround

## Onboarding Flow

Use this sequence when picking up work:

1. Read the required docs listed above
2. Pull latest and check `.reservations/*.json` for active claims before selecting work
3. Inspect current issue state:
   - `br ready --json`
   - `br show <epic-id> --json`
   - `br show <story-id> --json`
4. Explore the codebase enough to identify the smallest likely write surface
5. Mark the story `in_progress`
6. Start by writing the first failing test described in the story's `TDD starting point`

## TDD Workflow

Stories in Beads already include a `TDD starting point`. Use it.

Expected pattern:

1. Write a failing test at the correct layer
2. Implement the minimum code to make it pass
3. Refactor while keeping tests green
4. **Commit** the passing cycle before starting the next one
5. Add the next failing test

**Commit after every green cycle.** Do not batch multiple TDD cycles into a single commit.
Uncommitted files on disk are vulnerable to being staged by another concurrent agent.

Layering guidance:

- Program logic: contract tests first
- Oracle and Phoenix composition: integration tests next
- Automation: pure-function and orchestration tests
- Frontend: behavior tests, not snapshot-heavy tests
- Demo readiness: smoke tests last

## Git Staging Discipline

**NEVER use `git add .`, `git add -A`, or any broad staging command.**
Always stage files by name: `git add path/to/file1 path/to/file2`.

Before every commit, verify the staging area contains only your files:

```bash
git diff --cached --name-only
```

If any file in the output is not in your ownership set, unstage it with `git reset HEAD <file>` before committing.

**Why this matters:** When multiple agents share a working tree, broad staging will pick up
other agents' uncommitted work and attribute it to the wrong commit. This has caused
cross-contamination in practice.

## Session Close

Before ending a coding session in this repo:

0. Delete your `.reservations/{your-agent-name}.json`, commit, and push the deletion
1. Run the relevant tests
2. Update or close the Beads issue
3. `br sync --flush-only`
4. Stage only intended files **by name** (never `git add .`)
5. Run `git diff --cached --name-only` and verify only your files are staged
6. Commit
7. `git pull --rebase`
8. `git push`
9. Verify branch state with `git status -sb`

Do not leave the story status, git state, and remote state out of sync.

## Multi-Agent Coordination

When multiple agents work in this repo concurrently, use the `.reservations/` directory to avoid merge conflicts on shared files.

### Module Ownership Table

| Module | Primary Path | Shared Config Touched |
|--------|-------------|----------------------|
| Anchor program | `programs/meridian/src/` | `Cargo.toml`, `programs/meridian/Cargo.toml`, `Anchor.toml` |
| Frontend | `app/src/` | `app/package.json`, root `package.json` |
| Automation | `automation/src/` | `automation/package.json`, root `package.json` |
| Domain types | `packages/domain/src/` | `packages/domain/package.json` |
| Test kit | `packages/testkit/src/` | `packages/testkit/package.json` |
| Integration tests | `tests/` | root `package.json` |

### Dangerous Shared Files

These require a reservation before editing:

- `Cargo.toml`, `Cargo.lock`
- `package.json`, `pnpm-lock.yaml`
- `Anchor.toml`
- `programs/meridian/Cargo.toml`
- `pnpm-workspace.yaml`, `tsconfig.base.json`
- `.env.example`
- `packages/domain/src/index.ts`

### Reservation Protocol

**Claim flow:**

1. `git pull --rebase` to get latest reservations.
2. Read all `.reservations/*.json` files. Check for conflicts with your intended files. Skip any with `expires_at` in the past.
3. If no conflict, create `.reservations/{your-agent-name}.json`:
   ```json
   {
     "agent": "{your-agent-name}",
     "issue": "br-{id}",
     "files": ["path/to/file.rs", "other/file.ts"],
     "claimed_at": "2026-03-12T15:30:00Z",
     "expires_at": "2026-03-12T16:30:00Z",
     "reason": "br-{id}: short description"
   }
   ```
4. Commit and push the reservation file immediately (standalone commit: `chore: reserve files for br-{id}`).
5. If push fails due to remote changes, pull and re-check for conflicts before retrying.

**TTL guidelines:**

- Module-internal files: 10 minutes (`expires_at` = claimed_at + 600s)
- Shared/dangerous config files: 2 minutes (`expires_at` = claimed_at + 120s). Edit → commit → push → release immediately.
- Renew by updating `expires_at` and pushing if you need more time.

**Release flow:**

1. Delete your `.reservations/{your-agent-name}.json` file.
2. Commit and push (standalone commit: `chore: release reservations for br-{id}`).

**Conflict handling:**

- If your intended files overlap with an active (non-expired) reservation, do NOT proceed. Either:
  - Pick a different Beads issue that doesn't conflict.
  - Wait and re-check after the reservation expires.
  - If the reservation looks stale (agent crashed, well past expiry), delete it and claim yours.

**Expired reservation cleanup:** Any agent may delete reservation files where `expires_at` is in the past. Include cleanup in the same commit as your own reservation if convenient.

### Shared-File Editing Protocol

For dangerous shared files, minimize the hold window:

1. Reserve the file (short TTL, 600s).
2. `git pull --rebase`.
3. Make the edit.
4. Commit the shared-file change as a standalone commit.
5. `git push`.
6. Release the reservation immediately.
7. Continue with your other work.

If `git push` is rejected due to lock file conflicts (`pnpm-lock.yaml`, `Cargo.lock`), accept the remote version and regenerate (`pnpm install` or `cargo check`).

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
