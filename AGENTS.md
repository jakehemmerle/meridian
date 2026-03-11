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

## Roadmap Structure

The work hierarchy is:

1. Foundation epic: `br-guy`
2. Roadmap umbrella epic: `br-2a9`
3. Feature epics:
   - `br-378` on-chain market engine
   - `br-2xe` Phoenix trading and four trade flows
   - `br-2gm` oracle settlement and redemption
   - `br-29f` daily automation and market operations
   - `br-3ar` trader-facing frontend experience
   - `br-3h0` devnet deployment, testing, and demo readiness
4. Child stories under each feature epic

When starting work, operate at the story level, not the epic level.

## Onboarding Flow

Use this sequence when picking up work:

1. Read the required docs listed above
2. Inspect current issue state:
   - `br ready --json`
   - `br show br-2a9 --json`
   - `br show <epic-id> --json`
   - `br show <story-id> --json`
3. Explore the codebase enough to identify the smallest likely write surface
4. Only after file discovery:
   - register or continue the agent session in `peaksix`
   - reserve only the files or globs you actually expect to edit
   - mark the story `in_progress`
5. Start by writing the first failing test described in the story's `TDD starting point`

## File Reservation Policy

Do not reserve broad paths before you know what you are changing.

Preferred order:

1. Select the story
2. Read the relevant code
3. Identify the exact files
4. Reserve only those files
5. Implement

This is required so multiple agents can work in parallel without unnecessary conflicts.

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

## Recommended Starting Stories

If no higher-priority assignment exists, start here:

1. `br-1le` initialize program config and authority model
2. `br-36c` create strike markets with vaults and token mints
3. `br-1xh` support mint, merge, and pause with invariant checks
4. `br-15f` implement Pyth price adapter and validation rules
5. `br-3ic` implement settlement and override instructions

These stories establish the core protocol before Phoenix UI and automation layers depend on it.

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
