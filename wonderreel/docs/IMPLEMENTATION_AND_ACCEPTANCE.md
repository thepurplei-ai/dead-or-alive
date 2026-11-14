# Implementation Plan and Acceptance Tests

Read `WONDERREEL_PRODUCT_SPEC.md` first. Do not remove scope; implement incrementally and report honest status for each feature. Avoid unnecessary preference questions; make safe defaults and record decisions.

## Phase 0 — Baseline and setup
- Run `node --test reference/wonderreel-v2/backend/tests/server.test.mjs` from correct working directory and `node --check` for browser/backend scripts. Record results.
- Inventory existing feed, remix, studio, family, image/video routes, design tokens and assets. Avoid copying prototype local-only server design into production.
- Initialize monorepo `/apps/mobile`, `/apps/admin`, `/packages/shared`, `/supabase`, `/services/worker` (or simpler equivalent documented structure).
- Add TypeScript, linting, formatting, environment example, README, and `.gitignore` (never commit `.env`, API tokens, service role keys).

## Phase 1 — Native Android UX parity
- Expo project opens on Android emulator/Expo Go or development client.
- Native UI matches main web layout concept; bottom navigation Home/Discover/Create/Studio/Profile.
- Fullscreen vertical video component with playable sample *video* assets or clearly indicated placeholder cards; swipe to next, pause and mute controls.
- Create My Version carries a template ID + generic scene structure to Create screen, not original media or face.
- Camera/gallery with runtime permissions and local previews; permission refusal and bad file handled.
- Storyboard creation local first; Studio drafts persist on app restart in secure/local storage.
- Family Mode reachable privately from Profile; no remote child media transmission.
- UI and navigation tests pass. Get at least one screenshot for major screens.

## Phase 2 — Real accounts and private persistence
- Supabase schema/migrations, RLS, private storage, adult auth and secure sessions.
- Make each user's private Studio projects visible only to owner.
- Test unauthorized user A vs B, unknown token, expired session, family private media, blocked user.
- Signed uploads/downloads, ownership checks and cleanup on delete.
- Sample feed remains separate until moderation exists.

## Phase 3 — Real AI Director and image tools
- Authenticated backend route for AI Director and images; secrets only server-side.
- Verify provider model names, format support, image edit params, quotas and rights.
- Prompt + image safety checks, per-user limits, cost quotas, queued status, retry with idempotency.
- Real generated image stored privately and displayed in Studio. No pretend-success on mock response; fixtures only in test mode.

## Phase 4 — Async real video generation
- Provider abstraction with image-to-video + video-to-video, clip duration validation, durable job status, safe callback processing and output moderation.
- Real generation e2e with provider credentials (only after explicit spend/configuration), storage and correct state transitions.
- Retry/resume/reconcile stalled jobs, refunds on failed jobs, cancellation when possible.
- Concurrency/cost caps tested. Handle provider errors and non-supported media gracefully.

## Phase 5 — Moderated public network
- Adult-only public posts submitted for approval, not directly published.
- Feed retrieves only approved eligible posts, performant vertical playback, cursor pagination.
- Follow, like, save, comment, report, block and delete; permissions/RLS tested.
- Admin moderators can review media + comments, approve/reject, investigate reports, disable posts and audit all actions.
- No public children, no DMs, no auto-approval of flagged media, AI labels present.

## Phase 6 — Create My Version on real posts
- `allow_remix` opt-in owner control, reusable template serialization, no source face/voice/media transfer.
- User B remixes allowed prompt/structure with own upload; new project stores origin and generated result.
- Approved publish includes original creator attribution and lineage.
- Disabled, deleted, blocked or disputed origins cannot be cloned or improperly reused.

## Phase 7 — Native release & monetization
- Implement Google Play Billing or an appropriate verified receipt provider for digital credits, including refunds and entitlements. Add iOS purchase path when shipping iOS.
- Data deletion/export, app policies, crash reports, admin moderation runbook, privacy safety review.
- EAS preview APK build (direct install) and production AAB build (Play Store); verify build artifact URL. Do not treat PWA install as an APK.
- Play Store release only after applicable testing, privacy declarations, legal reviews and publisher account setup.

## Basic acceptance test matrix
1. Anonymous visitor cannot view private Studio; can browse only explicitly approved public content.
2. Adult A creates a private draft; adult B cannot retrieve any A media by REST, SQL, storage path or forged URL.
3. AI Director sends a real authenticated request, stores response, and shows an honest loading/error state.
4. Image edit with user-owned image creates a new result; no unconsented upload occurs.
5. Video job survives client shutdown and recovers polling; completed result is private and downloadable.
6. If AI provider fails, credit is not permanently spent for a non-delivered job under policy.
7. Public publish cannot bypass moderation by editing a client request or DB row.
8. Report/block removes blocked content from relevant feeds and notifications.
9. Create My Version does not include the original person's face, voice or private file; opt-out is respected.
10. Family library remains private; children's media does not reach provider endpoints in dev release.
11. Android camera/gallery work on a physical device; rejection and permission revocation do not crash.
12. `eas build -p android --profile preview` yields a real APK when developer account/signing is available.
13. Every shipped page has loading, empty, error and offline handling.
14. Terms/privacy and AI disclosure screens exist before public release.
15. Build/test commands are documented and reproducible.

## Reporting per session
After implementing a tranche, supply:
- Files changed
- Commands run + pass/fail results
- Android screenshots/build artifacts if verified
- Live functions vs mocked/demo functions
- Required user actions/credentials without asking user to paste secrets into chat
- Next concrete tranche
