# scripts/legacy/

Archived one-off operational scripts that were previously sitting at the
repo root. They are kept for historical reference only — they are **not**
wired into `pnpm`, are excluded from `tsconfig` and `prettier`, and must
not be run on production.

If you genuinely need to use one of these, copy it out, vet it, and add a
modern, tested replacement in `scripts/`.

| File | Purpose |
| --- | --- |
| `fix_founder_account.ts` | One-off founder account fixup. |
| `clear_stores.mjs` | Wipe `stores` table during early dev. |
| `insert_token.mjs` | Manually inject a platform credential row. |
| `apply-autonomy-migration.mjs` | Pre-Drizzle autonomy column migration. |
| `add_platforms.mjs` | Bulk-seed `platform_integrations`. |
| `add-watermarks.py` | Image watermarking helper. |
| `check_store_status.ts` | Ad-hoc store-status report. |
| `launch_buildout.ts` | Direct workflow launcher (bypasses HTTP). |
| `promote_owner.ts` | Promote a user to org owner. |
| `restart_workflow.ts` | Restart a stuck workflow. |
| `create_platform_integrations.mjs` | Bulk-seed `platform_integrations`. |
