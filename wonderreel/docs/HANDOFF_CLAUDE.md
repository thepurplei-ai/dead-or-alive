# CLAUDE.md — WonderReel AI Creation Social App

## Goal
You are building a real **React Native/Expo Android-first and iOS-ready app** called WonderReel from existing prototype sources. The product is an 18+ adult AI movie creation/social network with **Create My Version** remix and private parent-controlled Family Mode. Read every file in `docs/` before changing code.

## What already exists
- `reference/wonderreel-v2/`: functional mobile-first web prototype plus local-only Node AI gateway (OpenAI AI Director/image/edit + Runway image-to-video/video-to-video), with tests using mocked responses. Not production safe. Run `node --test backend/tests/server.test.mjs` in that folder before porting.
- `reference/android-pwa/`: Android-installable PWA preview. The AI call buttons are intentionally disabled for public web exposure, and public feed likes/comments/follows are local demo actions. It is **not a native Android APK**.
- `docs/WONDERREEL_PRODUCT_SPEC.md`: canonical product requirements; `IMPLEMENTATION_AND_ACCEPTANCE.md`: phase order and acceptance; `PRIVACY_AND_SAFETY.md` and `ANDROID_BUILD_GUIDE.md`: launch safety and build gates.

## Non-negotiable delivery standards
1. Build native screens in React Native/Expo + TypeScript. Do not put the legacy HTML inside a WebView and call that the completed Android app.
2. Preserve the recognizable WonderReel look: dark #0b0d17, surfaces #111421, pink #f488bd and purple #9074fc; vertically swiping cinematic feed and large Create My Version CTA.
3. Preserve all product areas: Feed, Discover, AI Create/AI Director, My Studio, Profile, Create My Version, and private Family Mode.
4. Connect real services only through secure authenticated server-side routes. NEVER put paid API or Supabase service keys into client code; do not expose the legacy local-only Node server on the public internet.
5. Require moderation before public publishing. Never expose private user/family media through public paths. Cloud child media processing disabled until safeguards, consent and vendor terms are validated.
6. Build real functioning flows with valid test accounts and services as soon as credentials are available. For inaccessible systems, build/test secure interfaces with mocks, mark clearly as unconfigured, and document exactly what user has to connect. No fake claims of live integration, APK or deployment.
7. Stay current: verify SDK/provider APIs and package versions against official docs. Avoid hardcoding legacy model names from V2 without confirmation.
8. After each phase run relevant checks and summarize actual working vs blocked features. Never invent test outcomes.
9. Start building promptly: inspect repo, establish an Expo project, implement Phase 1 with strong UX parity and prepare the APK build profile. Proceed to secure cloud backend phases in order.
10. Ask only genuinely blocking questions (such as account login or paid API setup). Apply sensible defaults otherwise; do not re-ask already supplied product requirements.

## Important specific product behaviors
- The public feed is for adults 18+, not a children's social network.
- User-generated video must have state `pending_review` until approved by trusted backend/moderation.
- **Create My Version** copies permissible *story/template data* only, never an unknown person's face/voice/media by default; keeps opt-in rights and original credit.
- Users can upload a photo/video, write a prompt, select cinematic/animated/fantasy style, ask AI Director for a 4-scene storyboard, generate an actual image/video via provider, view queued/processing/completed status, save privately, then optionally request public moderation.
- Family Mode is private and adult-operated; no public children, DMs or child processing to unapproved cloud providers.
- EAS preview is a direct-install **.apk**. Google Play production is **.aab**. The existing PWA link does not count as a native APK.

## Requested outputs
- Native Expo app with clear run/build commands.
- Versioned Supabase SQL migrations, RLS tests, storage policies, private backend/worker.
- AI model adapters and documented environment variables; unit/integration/E2E tests.
- Admin moderation UI and protected publishing/approval pipeline.
- `eas.json` and verified Android APK URL if build credentials permit, otherwise build instructions and exact blockers.
- Progress/status report per phase, with screenshots or relevant verified artifacts.
