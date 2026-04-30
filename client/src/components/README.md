# `client/src/components/` — patterns and contributor guide

Audit P3 #17 (`AUDIT_2026_04.md`).

This directory holds the project's shared UI primitives and feature
components. Use it as a checklist when adding a new component or
reviewing one in a PR.

---

## Canonical examples

When in doubt, read these first — they are the patterns we want every
new component to mirror.

| Component | Why it's the reference |
| --- | --- |
| `PageHeader.tsx` | Token-only colour usage. The `accent` prop drives icon-plate background, border, and outer glow via the `sky` / `cyan` / `violet` / `emerald` / `fuchsia` / `amber` palette declared in `index.css`. No raw hex anywhere. |
| `EmptyState.tsx` | Composes the existing `.empty-state` CSS classes from `index.css` instead of re-declaring colours. Fully accessible (semantic heading hierarchy, action defaults to a `<Link>` when `href` is set). |
| `BotPageShell.tsx` | Shows how to wrap a bot dashboard with the standard header + workflow surface and surfaces the bot's brand colour through props rather than hardcoded values. |

---

## Design-token rules

1. **Surfaces** — use the Tailwind utilities backed by `--surface-*` /
   `--terminal-*` tokens (`bg-surface-base`, `bg-surface-overlay`,
   `bg-surface-deep`, `bg-terminal-bg`, `bg-terminal-accent`,
   `bg-terminal-muted`). Never write `bg-[#050507]` etc.
2. **Brand / chart palette** — pull from `client/src/lib/platformBrand.ts`
   and `client/src/lib/chartTheme.ts`. Recharts callers should consume
   `CHART_COLORS`, `TOOLTIP_STYLE`, `LABEL_STYLE` from `chartTheme.ts`
   rather than hardcoding hex.
3. **Bot accent colours** — the three bots have stable identity colours
   (Builder = sky / Merchant = cyan / Social = orange / Communicator =
   emerald). Pass them as props (e.g. `<PulseStream color={...} />`) or
   read from `BOT_COLORS` data — don't redeclare per file.
4. **Allowed escape hatches** — runtime CSS variable strings produced
   from data (e.g. `style={{ "--hover-glow": rgba(${rgb}, 0.18) }}`)
   are fine, since the values come from a registry rather than a magic
   number.

The preflight script (`scripts/preflight-sync.mjs`) flags the most
common regression — `bg-[#…]` / `text-[#…]` / `border-[#…]` Tailwind
arbitrary values — inside `client/src/pages/*.tsx`. Components are
exempt from the lint, but the same conventions apply.

---

## Library-bound wrappers

`InfraTopology.tsx`, `Map.tsx`, and `Celebration.tsx` wrap third-party
visualization libraries that own their own palettes. Tracked as audit
P2 #12 — the long-term plan is for these wrappers to read CSS variable
values at render time and pass them through to the underlying library.
Until then: keep their hardcoded palettes confined to the wrapper
itself.

---

## Adding a new component

1. **Decide whether you need a top-level route or a tab inside an
   existing shell.** See the comment block at the top of `App.tsx` —
   most new feature surfaces should be tabs, not routes.
2. **Reuse before you create.** `PageHeader`, `EmptyState`,
   `BotPageShell`, `RecommendedWorkflows`, `LiveWorkflowRunner` cover
   most layouts. The `ui/` subdirectory holds the shadcn primitives
   (button, card, dialog, …) — start there for atoms.
3. **Token-only styling.** No raw hex. If you need a new semantic
   colour, add a token to `index.css` first.
4. **Stateless first, fetch second.** Hooks in `client/src/hooks/`
   (`useScrollReveal`, `useConnectionStatus`, …) handle most ambient
   state. tRPC queries belong in feature components, not in primitives.
5. **One file, one default export.** Keep components co-located when
   they're tightly coupled (e.g. `LiveWorkflowRunner` + its row
   subcomponent).
