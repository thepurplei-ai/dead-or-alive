# WonderReel — status report (2026-11-14)

Legend: **A** = built and tested · **B** = built, needs credentials/real-service test · **C** = demo/placeholder or not built

## Verified checks
| Check | Result |
|---|---|
| Original V2 tests (`node --test backend/tests/server.test.mjs`) | 4 passed, 0 failed |
| App typecheck (`npx tsc --noEmit`) | passes |
| App logic tests (`mobile: npm test`) | 9 passed |
| Android JS bundle (`npx expo export --platform android`) | builds (5.4 MB Hermes bytecode) |
| Click-through of all main screens (web render, phone size) | no runtime errors; screenshots in `docs/screenshots/` |
| Database security tests on real Postgres 16 | 15 passed |
| Provider adapter + job worker tests (mocked HTTP) | 10 passed |
| Edge Functions typecheck (`deno check`) | 12/12 pass |
| **Native APK / AAB** | **not built yet** — blocked: no `EXPO_TOKEN`, api.expo.dev blocked in this session |

## Features
| Feature | Status | Notes |
|---|---|---|
| Native Expo app, dark #0b0d17 design, pink/purple gradients, bottom nav with big Create | A | Native screens, no WebView |
| Onboarding, date-of-birth age gate (stores result only), terms/AI consent | A | Self-declaration is not verification (launch blocker) |
| Home vertical feed, For You / Following, like/save/follow/share/report/block | A (local) / B (cloud) | Sample concepts are clearly labelled "not a real video" |
| Video playback (expo-video, autoplay active card, tap pause, mute) | B | Needs real approved video posts |
| Create My Version (story data only, opt-out, blocked creators) | A | Server lineage via `start_remix` + `request_publish` tested in SQL |
| Discover: search, categories, templates, creators | A | Uses built-in templates until real posts exist |
| Create: camera/gallery with permission handling, prompt chips, styles, aspect | A* | *Needs a physical-device check for camera |
| AI Director storyboard + chat edits | A (on-device) / B (cloud OpenAI) | |
| Private Studio, persists across restarts, search/filter, rename/duplicate/delete/export | A | |
| AI image (text-to-image, photo edit) | B | OpenAI adapter + worker tested with mocks |
| AI video (image-to-video, video-to-video), durable jobs, resume after restart, cancel | B | Runway adapter + worker tested with mocks |
| Credits ledger: reserve, idempotent retry, refund on failure | A (SQL) | |
| Accounts (Supabase email auth, reset password, secure session storage) | B | |
| Moderated publishing, comments, reports, takedown, audit log | A (SQL) / B (app+functions) | |
| Moderation dashboard + kill switches (in-app, server-checked role) | B | |
| Family Mode: parent PIN, nicknames only, private, no cloud AI | A | Cloud processing locked off in SQL |
| Export data, delete account | A (local) / B (cloud) | |
| Purchases (Google Play Billing / App Store) | C | Placeholder refuses all purchases; needs Play Console |
| Push notifications, speech-to-text, multi-scene movie stitching | C | Not built yet |
| Separate web admin app | C | Admin is inside the app for now |

## Launch blockers (not code)
Age assurance provider, automatic video frame/audio moderation and CSAM hash matching,
lawyer-reviewed Terms/Privacy (COPPA, GDPR, DSA), provider terms review, Play Console setup.

## Next steps
1. Build the APK in a session that has `EXPO_TOKEN` (see SETUP.md §1).
2. Connect Supabase and deploy migrations/functions (SETUP.md §2), then test sign-up on the phone.
3. Add OpenAI/Runway keys with spend limits and run one real image and one real video job.
4. Google Play Billing with server verification; push notifications.
