# WonderReel — what the owner needs to connect

Everything below is done once. Never paste secret keys into a chat: use the settings pages named here.

## 1. Android APK (Expo / EAS) — needed for the install link
1. expo.dev → Account settings → Access tokens → Create token.
2. In Claude Code, use a cloud environment that has:
   - variable `EXPO_TOKEN` = that token
   - allowed hosts: `api.expo.dev`, `expo.dev`, `u.expo.dev`, `exp.host`, `storage.googleapis.com`
   (Your existing environment named **EXPO_TOKEN** already has this.)
3. Start a **new** session in that environment and ask: "Build the WonderReel APK".
   Claude runs: `cd wonderreel/mobile && npx eas-cli@latest init --non-interactive --force`
   then `npx eas-cli@latest build -p android --profile preview --non-interactive`.
   EAS creates and stores the Android signing key for you.
4. For Google Play later: `--profile production` makes an `.aab`.

## 2. Supabase (accounts, cloud Studio, feed, moderation)
1. supabase.com → New project. Note the Project URL and the `anon` public key.
2. Give Claude a Supabase access token (supabase.com → Account → Access tokens) through the
   environment's secret settings, and allow host `api.supabase.com` plus `<ref>.supabase.co`.
3. Claude then runs `npx supabase link`, `npx supabase db push`, `npx supabase functions deploy`.
4. In the app build, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (EAS environment variables). These two are safe to ship; nothing else is.
5. Run `supabase/cron.sql` once in the SQL editor (turn on pg_cron + pg_net first).
6. Make yourself admin: `update profiles set role='admin' where id='<your user id>';`

## 3. AI providers (paid — only when you decide to spend)
Set as Supabase secrets (`supabase/functions/.env.example` lists them):
- **Claude** (console.anthropic.com → API keys): `ANTHROPIC_API_KEY`. Claude is the AI Director and checks
  prompts, photos, results and comments for safety. Model: `claude-opus-5-5` (change with `CLAUDE_MODEL`).
- **Runway** (makes the pictures and videos — Claude cannot draw): `RUNWAYML_API_SECRET`, `RUNWAY_IMAGE_MODEL`,
  `RUNWAY_IMAGE_TO_VIDEO_MODEL`, `RUNWAY_VIDEO_TO_VIDEO_MODEL` (current model IDs from Runway's docs).
- `WORKER_SECRET`: any long random string (also put it in `cron.sql`).
Set spending limits in both provider dashboards first.

## 4. Later
- Google Play Console account ($25 once) for Play testing and in-app purchases.
- Apple Developer account ($99/year) for iPhone.
- Lawyer review of Terms/Privacy, age assurance provider, and child-safety review before public launch.
