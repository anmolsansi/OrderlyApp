# Git Workflow

## Branching
- `main` stays releasable.
- Use short-lived feature branches:
  - `feat/<slice>` for features
  - `fix/<issue>` for bugs
  - `chore/<maintenance>` for setup/docs/tooling

## Commit rules
- Keep commits small and verifiable.
- Every feature commit should pass:
  - `npm run build`
  - `npm run lint`
- Commit messages use conventional style where useful:
  - `feat: ...`
  - `fix: ...`
  - `chore: ...`
  - `docs: ...`

## PR strategy
- For remote collaboration, no direct pushes to `main`.
- Open a PR per vertical slice.
- Include test/build evidence in PR description.
- Keep risky backend/voice changes separate from UI-only polish.

## Current local mode
This local restart is being developed directly on `main` until a remote is configured. Once a remote exists, switch to feature branches and PRs.
