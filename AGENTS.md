# AGENTS.md

Rules for **every AI agent** (Copilot, Claude, GPT, Manus, Gemini, etc.) and
every human contributor working in this repository.

This project's database and backend run on **Manus**. After a PR is merged
on GitHub, a maintainer clicks **"Sync GitHub changes"** in the Manus
console to pull the new code onto the live backend. That sync can fail —
and historically has failed — when AI-generated edits leave the repo in a
state Manus rejects. The rules below exist to prevent that.

> **Before you push, run `pnpm preflight`.** If it exits non‑zero, fix the
> errors before opening or merging a PR.

---

## 1. Validation pipeline (run all of these locally)

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm preflight        # static checks for sync-blocking issues
pnpm check            # tsc --noEmit
pnpm test             # vitest run
pnpm build            # vite + esbuild
```

A PR is **not ready to merge** until all five succeed.

---

## 2. Database / Drizzle migrations

Manus runs the SQL files in `drizzle/` against the live database when it
syncs. Getting these wrong is the #1 cause of failed syncs.

- **Never edit an existing migration `.sql` file.** Migrations are
  append-only. To change the schema:
  1. Edit `shared/schema.ts` (or wherever the schema lives).
  2. Run `pnpm drizzle-kit generate` — this creates the next
     `drizzle/000N_*.sql` and `drizzle/meta/000N_snapshot.json`.
  3. Commit **both** the new `.sql` and the new snapshot, plus the updated
     `drizzle/meta/_journal.json`.
- **Never hand-edit `drizzle/meta/_journal.json`.** Let `drizzle-kit`
  manage it.
- **Never delete or rename a migration that has already shipped to Manus.**
- If a migration needs a fix, write a _new_ migration that corrects it.
- Keep `shared/schema.ts` in sync with the latest snapshot — they are the
  same source of truth in different forms.

The preflight script verifies journal/SQL/snapshot consistency and blocks
modifications to historical migrations.

---

## 3. Files that must never be committed

These are listed in `.gitignore`, but agents sometimes use `git add -f` or
create new files in the wrong place. Don't.

- `.env`, `.env.*` — secrets.
- `CREDENTIALS_COLLECTED.md`, `CREDENTIALS*.md`, `*.credentials.md` —
  secrets.
- `client/public/__manus__/version.json` — Manus auto-generates this; if
  you commit it, Manus's writer collides on sync.
- `node_modules/`, `dist/`, `build/`, `coverage/`.
- `package-lock.json`, `yarn.lock` — this repo uses pnpm only.

The preflight script enforces all of these.

---

## 4. Lockfile rules

- This repo uses **pnpm** (see `packageManager` in `package.json`). Do not
  introduce npm or yarn lockfiles.
- If you change `package.json`, regenerate `pnpm-lock.yaml` in the same
  commit (`pnpm install`).
- Use `pnpm install --frozen-lockfile` in CI / preflight environments to
  catch lockfile drift.

---

## 5. Merging and conflict resolution

- Resolve all conflicts before committing. Leftover `<<<<<<<`, `=======`,
  `>>>>>>>` markers will fail TypeScript and the preflight check.
- When merging a feature branch, run `pnpm check && pnpm test && pnpm build`
  on the merged result, not just on each branch individually. Two branches
  that each compile in isolation can break when combined.
- Don't squash-merge a PR that contains a Drizzle migration without
  double-checking the journal numbering still increases monotonically with
  `main`'s latest migration.

---

## 6. What to do when "Sync GitHub changes" fails on Manus

1. Read the error message in the Manus console — it almost always names
   the failing step (install, build, migrate, etc.).
2. Map it to the matching section here:

   | Error mentions…                          | Fix in this section |
   | ---------------------------------------- | ------------------- |
   | `drizzle`, `migration`, `journal`        | §2                  |
   | `__manus__`, `version.json`              | §3                  |
   | `secret`, `credential`, `.env`           | §3                  |
   | `pnpm install`, `lockfile`, `ERR_PNPM_*` | §4                  |
   | `tsc`, `type error`, `build failed`      | §1                  |
   | conflict marker, `<<<<<<<`               | §5                  |

3. Reproduce locally with `pnpm preflight && pnpm check && pnpm build`.
4. Push the fix as a new PR; do **not** force-push to a branch Manus has
   already partially synced from.

---

## 7. Product model — per-store workspaces

The product model is **"every connected store is its own workspace"**.
When you build new operator-facing surfaces, default to mounting them
inside the workspace shell, not as cross-store sidebar pages.

- Per-store routes live under `/store/:storeId/*`. The
  `WorkspaceShell` (`client/src/components/workspace/WorkspaceShell.tsx`)
  wraps every workspace page with: a platform-tinted breadcrumb +
  identity row, a workspace sub-nav strip, and a context provider that
  broadcasts `inside: true` to nested components.
- Existing surfaces: Overview · Chat · Workflows · Builder · Connectors ·
  Memory · Instructions · Insights · Activity (9 tabs).
- The shell self-syncs the URL `:storeId` into
  `WorkspaceContext.activeStoreId`, so existing context-scoped tRPC
  queries Just Work without the page being rewritten.
- Pages rendered inside the shell can call
  `useIsInsideWorkspaceShell()` / `useWorkspaceShellStoreId()` to
  detect nesting and (a) suppress redundant page chrome and (b)
  scope queries to THIS store. `Workflows.tsx` is the canonical
  example — it passes `storeId` into `workflows.list/active/counts`
  only when nested.
- New per-store surfaces should add an entry to `TAB_REGISTRY` in
  `WorkspaceShell.tsx`, mount the page wrapper at
  `/store/:storeId/<route>` in `App.tsx`, and add a `WorkspaceSidebarNav`
  link in `DashboardLayout.tsx`.
- `server/workspace-shell.test.ts` pins the surface contract with
  grep-style regression assertions. When you add a new tab, extend
  the route-list assertion.
- Operator-facing copy uses **Store Bot** as the unified bot name.
  The legacy `architect / merchant / social` triad is still the
  internal `agentType` enum but should not appear in operator-facing
  notifications, page subtitles, or empty-state copy.

---

## 8. Scope discipline

- Make the smallest change that solves the task. Do not refactor unrelated
  files.
- Do not "fix" pre-existing warnings/issues outside the scope of your task
  unless you are explicitly asked.
- Do not delete or rewrite tests to make CI pass. If a test breaks, fix
  the code or the test deliberately and explain why in the PR.

---

## 9. PR description checklist

Every AI-authored PR description should answer:

- [ ] What problem does this solve? (one sentence)
- [ ] What files changed and why?
- [ ] Does this include a Drizzle migration? If yes, paste the new
      migration file name.
- [ ] Did `pnpm preflight && pnpm check && pnpm test && pnpm build` all
      pass locally?
- [ ] Any follow-up work needed before clicking "Sync GitHub changes"?

Following these rules will make Manus syncs boring and reliable, which is
the whole point.
