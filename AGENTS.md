# Peaksix Agent Guide

This file supplements the workspace-level [AGENTS.md](/Users/jake/codebases/gauntlet/hiring-partners/AGENTS.md).

The root policy still applies in full. This file only adds `peaksix`-specific onboarding and
execution guidance.

## Scope

- The active implementation repo is `/Users/jake/codebases/gauntlet/hiring-partners/peaksix`
- The parent repo is only a container and tracks `peaksix` as a submodule
- Do not treat the parent repo as the main codebase for Meridian work

## Read First

Before starting any task in `peaksix`, read these in order:

1. [AGENTS.md](/Users/jake/codebases/gauntlet/hiring-partners/AGENTS.md)
2. [requirements.md](/Users/jake/codebases/gauntlet/hiring-partners/peaksix/requirements.md)
3. [research-rubric.md](/Users/jake/codebases/gauntlet/hiring-partners/peaksix/research-rubric.md)
4. [research-codex.md](/Users/jake/codebases/gauntlet/hiring-partners/peaksix/research-codex.md)

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
2. Inspect current issue state:
   - `br ready --json`
   - `br show <epic-id> --json`
   - `br show <story-id> --json`
3. Explore the codebase enough to identify the smallest likely write surface
4. Mark the story `in_progress`
5. Start by writing the first failing test described in the story's `TDD starting point`

## TDD Workflow

Stories in Beads already include a `TDD starting point`. Use it.

Expected pattern:

1. Write a failing test at the correct layer
2. Implement the minimum code to make it pass
3. Refactor while keeping tests green
4. Add the next failing test

Layering guidance:

- Program logic: contract tests first
- Oracle and Phoenix composition: integration tests next
- Automation: pure-function and orchestration tests
- Frontend: behavior tests, not snapshot-heavy tests
- Demo readiness: smoke tests last

## Session Close

Before ending a coding session in `peaksix`:

1. Run the relevant tests
2. Update or close the Beads issue
3. `br sync --flush-only`
4. Stage only intended files
5. Commit
6. `git pull --rebase`
7. `git push`
8. Verify branch state with `git status -sb`

Do not leave the story status, git state, and remote state out of sync.
