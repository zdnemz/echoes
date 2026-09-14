# AGENTS.md — working rules for this repo

## Atomic commits

Every commit is **one logical change** and nothing else.

- One commit = one thing you can describe in a single imperative sentence
  (`fix(cache): …`, `refactor(ui): …`). If the message needs "and", split it.
- Each commit must pass the gates on its own: `bun run typecheck`,
  `bun run lint`, `prettier --check`, and for logic changes `bun test`.
  An intermediate commit that does not build is a broken promise — anyone
  bisecting through it lands on red.
- `git checkout <commit> -- <paths>` replays file states; for a file shared
  by two concerns, patch the first concern by hand and let the later one take
  the full file — the diff then shows exactly the remainder.
- Verify the split with `git diff <original-commit>` (empty = identical tree).
- Commit messages explain **why**, not what. The diff shows what.
- Conventional type prefixes: `feat`, `fix`, `refactor`, `chore`, `docs`,
  `test`, `build`. Scope in parentheses when it helps (`fix(cache): …`).
- Author stays `zdnemz <zidanemz69@gmail.com>`. Never change git identity.

## Verification before reporting

- Typecheck, lint and format on every commit; `bun test` for logic.
- Live checks against the local stack for anything touching the API or UI
  (`bun run stack:start`, health, then the flow). Never claim a fix works
  from reading code alone.
- If a finding turns out wrong, say so plainly instead of quietly dropping it.

## Local vs remote

- `main` and `origin/main` have diverged before. Never force-push. Never
  rewrite a commit that exists on the remote. Local-only rewrites are
  recoverable via reflog; pushed ones are not.
