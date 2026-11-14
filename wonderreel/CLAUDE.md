# WonderReel — instructions for Claude Code

WonderReel is an 18+ AI movie studio + vertical video feed with "Create My Version" remixes
and a private, parent-controlled Family Mode. The owner works from a phone: explain in short,
plain English and run all commands yourself.

Read first: `docs/STATUS.md` (what works, what is blocked), `docs/SETUP.md`, and the original
spec in `docs/WONDERREEL_PRODUCT_SPEC.md`, `docs/IMPLEMENTATION_AND_ACCEPTANCE.md`,
`docs/PRIVACY_AND_SAFETY.md`, `docs/ANDROID_BUILD_GUIDE.md`.

## Layout
- `mobile/` — Expo SDK 58, Expo Router, TypeScript. Screens in `src/app`, logic in `src/lib`.
  Package `com.thepurpleiai.wonderreel`. EAS profiles: `preview` = APK, `production` = AAB.
- `supabase/migrations` — schema + RLS. `supabase/functions` — Edge Functions (Deno).
- `supabase/tests` — DB security tests (real Postgres) + mocked provider/worker tests.
- `reference/` — the original web prototype (design reference only; never ship it in a WebView).

## Checks (run before every commit/build)
```bash
cd mobile && npx tsc --noEmit && npm test
cd supabase/tests && npm install && DATABASE_URL=postgres://postgres@localhost:54329/postgres?host=/tmp npm test
```
Local Postgres for the DB tests (as root):
`su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/wr-test -A trust -U postgres && /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/wr-test -o '-p 54329 -k /tmp' -l /var/lib/postgresql/wr-test/log.txt start"`
Use `EXPO_OFFLINE=1` with `npx expo install` / `npx expo export` when api.expo.dev is blocked.

## Rules
- Paid AI keys and the Supabase service-role key live ONLY in Supabase secrets. Never in `mobile/`.
- Public posts are created only by `request_publish()` and go live only after moderator approval.
- Create My Version passes story data only (`toRemixTemplate`, `sanitize_template`) — never media, faces or voices.
- Family Mode stays on-device; `family_cloud_enabled` is locked off in SQL. Do not unlock it.
- Model IDs come from env vars; check current provider docs before setting them.
- Never invent an APK link: only share a URL that EAS returned for a finished build.
