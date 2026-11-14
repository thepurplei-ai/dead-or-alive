# WonderReel — Full Product Specification
Version: 1.0 (November 14, 2026)
Status: Implementation brief. Some features exist only as a demo in `reference/`.
Owner goal: Build a polished, functional AI-powered short-video creation and social entertainment app for adults (18+ public accounts), with an adult-controlled private Family Mode.
Working title: WonderReel (trademark/domain clearance outstanding).
Tagline: **Watch it. Remix it. Make it yours.**

## 1. Vision
An app where an adult takes a photo or video, tells an AI what they imagine, and receives a personalized cinematic image or short video. Examples: "Make me a superhero rescuing a puppy"; "Make me an astronaut discovering an alien city"; "Turn our holiday photo into a magical adventure"; "Santa searches for a missing present." Users can edit the results conversationally with an AI Director, combine scenes in a Studio, and share approved work in a vertical TikTok-style feed. Viewers can tap **Create My Version** to make an authorized remix of the *template* with their own assets and prompts. Family Mode is private and operated by a parent/adult account, with cloud processing of minors disabled until the required controls and provider approvals exist.

## 2. Audience and product boundaries
- Public social app is designed for adults 18+. An age declaration is not the same as verified eligibility; plan appropriate age assurance and local legal review before launch.
- Family Mode: adult initiates, supervises, owns, approves, and deletes family projects. No public child profiles, direct messages, friend discovery for minors, or public posting of content featuring identifiable minors by default.
- Private family concept stories can run locally during development. Do not transmit child images/videos/voices to cloud AI providers without verified lawful basis, parental consent workflow, provider permission and a child-protection review.
- No adult sexual content, exploitative or unsafe deepfakes, illegal content, harassment or non-consensual likeness/voice cloning.
- The app must not pretend generated content is authentic footage; preserve AI-generation labels/metadata where supported.

## 3. Brand / look and feel
**Source of truth:** `reference/android-pwa/index.html`, `styles.css`, `app.js`, artwork, and `reference/wonderreel-v2/`. Use these as functional/visual references, then port to idiomatic React Native (do not ship the web UI inside a WebView as the final native app).
- Premium cinematic dark mode. Background #0b0d17, surfaces #111421, light foreground #f8f7ff, muted #9295ab; pink #f488bd and purple #9074fc, pink-to-purple gradients.
- Modern rounded cards, cinematic 9:16 media, soft glows, restrained animations, touch-friendly controls, accessible labels and contrast.
- Android-first, responsive to small phones and tablets; iOS next using the same React Native codebase. Keyboard, notches, safe areas, permission prompts, dark theme and screen reader behavior must work.
- Navigation bottom bar: **Home**, **Discover**, **Create** (prominent central), **Studio**, **Profile**. Family Mode via Profile and a prominent Studio/Discover entry, not a public child tab.
- English initially; keep all UI strings internationalization-ready.

## 4. Screens and functional requirements

### 4.1 Splash, onboarding and age gate
- Logo, tagline, short walkthrough of AI creation + remix + sharing.
- Adult-account sign-up/sign-in via email/OAuth through Supabase, secure session persistence, password reset, verified email and sign-out.
- Ask age/date-of-birth or verified age via appropriate service (do not store more personal data than necessary). If user not eligible for adult public service, do not grant independent access. Redirect to parent-managed family experience only where lawfully possible.
- Accept terms/privacy policy/AI consent notices, with timestamps and versions. Permission requests are just-in-time; no forced camera permissions to browse the feed.

### 4.2 Home / vertical social video feed
- Fullscreen vertical autoplaying videos, swipe up/down, smooth preloading/caching, mute/unmute, pause/resume, author metadata, duration, caption, hashtags, visible AI-generated label.
- Separate **For You** and **Following** views; pagination/cursor load, deduplication, basic safe ranking (initially recency + engagement with abuse caps), avoid sharing private/family projects.
- Right-side rail: Like, Comment, Save, Share, Report, Block, Follow as appropriate.
- The most prominent creation CTA on eligible posts: **Create My Version**.
- On item tap: open creator profile or sound/details as applicable. Maintain video continuity on navigation and handle network loss gracefully.
- Public videos must have passed prepublication moderation. No public user-generated post ever appears merely because upload completed.

### 4.3 Discover
- Search adult creators, tags, template names, story ideas; category chips: Superhero, Holiday, Fantasy, Space, Action, Adventure, Comedy, Travel.
- Trending/featured templates, curated collections, creator spotlights, content previews and deep links to the creation flow.
- Respect blocked users and content visibility. No unmoderated search results with minor data.

### 4.4 AI Create (primary feature)
- Capture image or short video with in-app camera or select from gallery; request Android/iOS permissions only as needed.
- File type/size/duration validation, client preview, trimming/cropping/format conversion as needed, clear user consent before upload.
- Multi-line natural-language prompt and optional speech-to-text. Provide quick prompt chips: Superhero, Santa Mission, Astronaut, Pirate, Wizard, Fantasy, Comedy, etc.
- Style controls: Cinematic, Animated, Fantasy, 3D, Comic. Output options: 9:16 default, 1:1/16:9 where supported; selectable clip length and quality based on provider support and credits.
- Workflows: **text-to-image**, **image edit/transform**, **image-to-video**, **video-to-video**, and **prompt-to-storyboard**. Only expose text-to-video if actual supported provider route and tested credentials exist.
- Optional "AI Director" chat: user describes story, AI asks targeted clarifications only when needed, presents editable 4-scene outline, offers prompt enhancements, and supports edit requests like "change the ending", "add a friendly robot" or "make it more dramatic".
- Storyboard is distinct from actual media generation. Clearly label it as a plan, never as rendered video.
- Before rendering: transparent credit/cost estimate, confirm action, submit async generation job, immediately show Queued/Processing/Ready/Failed/Cancelled status and estimated quota consumption (do not fabricate completion times).
- Real generation results: stream/download from private storage, preview, regenerate selected scene, retake a source shot, save, export, optionally submit for moderated publishing. Always show actual provider-generated outputs, not placeholder art presented as final output.
- Provider failures: preserve project and input; retries should not double-charge; refund/reserve credits correctly.

### 4.5 Create My Version (signature viral mechanic)
- Visible CTA on public posts only if `allow_remix=true` and content passes policy checks.
- Opens pre-populated creator with allowed template metadata: story structure, generic scene descriptions, style, timings, camera directions and optional licensed assets.
- Require the remixing user to bring their **own** photo/video or choose generic generated characters. Never silently inherit original uploader's face/voice/source image, or another person's identifying media.
- User may edit scenes/setting/character/outcome, then generate, preview, save, and request publish.
- Show linked attribution `Remixed from @creator` on authorized public remixes, link to origin, store lineage. Respect opt-out, deleted origin, blocked creators, takedowns and rights disputes.
- Avoid true "duplicate video" functionality unless explicit media reuse rights cover all assets and likenesses.
- Trending remixes can show counts and a safe template gallery; preserve remix lineage and attribution in database.

### 4.6 My Studio
- Persistent draft project list synced to user's account, with thumbnails, updated time, status and search/filter.
- Open/edit/storyboard/rename/duplicate/delete projects. For each project show original media, storyboard scenes, generated variants, provider job statuses and export/share controls.
- Versions: source file, prompts, selected model/style, generated output and parent project; give users the ability to regenerate a specific shot.
- Export images/videos to device, subject to permissions, watermarking/AI labeling policy. Generate a multi-scene movie by ordering clips and rendering them server-side if technically supported.
- Offline support for drafts and deferred upload; sensitive private media should remain encrypted/isolated and not leak into public caches.

### 4.7 Profiles, relationships, comments
- Public adult creator profile with avatar, bio, handle, follower/following count, eligible public creations, remixes and liked videos if user opts in.
- Profile editing, privacy and remix preferences, notifications, block/mute/report, settings, data export/deletion.
- Like/unlike, follow/unfollow, save/unsave, moderated comments/replies. Rate limits and spam defense.
- Do NOT add stranger direct messages in initial launch. Public social features require report handling and moderator/admin workflows.

### 4.8 Family Mode
- Available only from adult-controlled session. Parent owns child profiles optionally using non-identifying nicknames and must explicitly initiate generation.
- Private projects only. Guided child-appropriate story prompts; suggested Santa mission, superheroes helping people, space explorer, bedtime adventure.
- Parent reviews the story, source media, consent and sharing intent. No public feed placement, child-to-child communication, discovery, public comments, or child account access.
- Development release: Family Mode supports private local storyboard generation only, and cloud AI submissions of children's photos, voices, or videos remain blocked until a dedicated policy/legal/provider review and real parental verification is complete.
- Later: privacy controls, deletion, parental export and real consent logs. Never use uploaded children's media for marketing or training by default.

### 4.9 Subscription and credits
- Free onboarding quota, paid subscription tiers, additional generation credits. Final prices TBD based on measured provider costs; do not hard-code invented commercial prices.
- Show credits remaining, generation estimated cost, actual cost and transaction history. Backend-enforced credit ledger with reserved/settled/refunded states and idempotent payments/jobs.
- For native digital content/subscriptions implement Google Play Billing and Apple In-App Purchase according to current rules, verify receipts server-side (RevenueCat optional if it fits). Never rely on a browser-only payment form in native apps for in-app digital credits without policy review.

### 4.10 Admin dashboard (separate restricted web app)
- Moderator roles, manual review queues for generated/posted content, reported comments/media, enforcement/takedown, appeals, abuse signals, creator bans, credit disputes and provider outages.
- Feature flags to disable generation, family processing or publishing instantly.
- Metrics: generation success/failure, median latency, credits/cost, spam reports, moderation queue backlog, retention and privacy deletion requests. Access audited, least privilege.

## 5. Information architecture and data model
Use Supabase Postgres with migrated schema, tenant-level RLS, encrypted/signed media storage and least-privileged server routes. Suggested tables (refine after actual schema review):
- `profiles` (auth user id, handle, adult eligibility status, avatar, bio, role in trusted app metadata/server-admin tables).
- `consent_records`, `family_profiles`, `parental_permissions` (private and nonpublic).
- `projects`, `project_scenes`, `media_assets`, `generation_jobs`, `generation_outputs`, `creation_versions`.
- `posts` (approval state), `post_media`, `tags`, `post_tags`, `likes`, `comments` (moderation state), `follows`, `saves`, `blocks`, `reports`, `moderation_cases`.
- `remix_templates`, `remix_lineage`, `template_permissions` / origin tracking.
- `credit_wallets`, `credit_ledger`, `purchases`, `subscription_entitlements`.
- `notifications`, `audit_logs`, `provider_webhook_events` (idempotent receipt).
- Clear `owner_id` foreign key on all private resources; privacy and publication are server-trusted states. Avoid client-editable `is_approved`, `is_adult`, `role`, or payment balances.

RLS coverage:
- Private projects/media/jobs can be read/written only by owner or authorized parent/guardian where appropriate; public query only returns approved adult posts.
- User comments/likes/follows must check auth and target visibility; use server-side role checks for moderators.
- Write RLS tests using multiple identities that prove one user cannot access another user's private projects or any family content via URLs, SQL, API or storage.
- Lock down Storage buckets with owner paths and signed URLs, validate object ownership server-side before any provider call.

## 6. Backend AI/media job architecture
- Expo client never calls paid AI provider APIs directly. Only authenticated API/Edge Function endpoints issue jobs.
- Use private upload URLs/buckets, media validation, moderation of prompts and media, quota/credit reservation, provider adapter, durable queue, provider callbacks/polling, output retrieval, output moderation and conversion/transcoding into permanent storage.
- Job states: `draft -> pending_review -> queued -> processing -> output_review -> completed` or `rejected | failed | cancelled`.
- Adapter interface methods: `validateInput`, `estimateCost`, `start`, `poll/handleWebhook`, `retrieveOutput`, `cancel (if supported)`. Keep providers swappable; use verified model IDs/capabilities from current docs. Image/video APIs and terms change rapidly.
- Store user input securely; delete according to explicit retention schedule. Never log raw personal media, prompts containing private user data, or credentials.
- Video uploads and outputs require appropriate visual and audio/frame moderation; a text filter is insufficient. Add human review and escalation for safety-sensitive flags.
- Original prototype backend in `reference/wonderreel-v2/backend/server.mjs` is local-only, 127.0.0.1. It is **not suitable for internet deployment**. Port/adapt functionality rather than simply exposing that server.

## 7. Tech stack (preferred)
- Mobile: **React Native + Expo + Expo Router + TypeScript**; native media/camera/gallery, Safe Area, video player, notifications, deep links. Use currently supported Expo SDK and pinned packages.
- Native state/network: TanStack Query for network state; lightweight local store such as Zustand if helpful; proper secure token storage.
- Backend: Supabase Auth, Postgres/RLS, private Supabase Storage. Authenticated server routes/Edge Functions for control-plane requests; durable worker/queue + transcoding service for long video tasks (avoid a short-timeout function for video waiting).
- AI Director/images: OpenAI API via server-side credentials; verify current model capability and prices. Video: Runway Dev API or a currently accessible alternative, behind an interface; test live when keys available.
- Analytics/observability: privacy-conscious error logging, app crash reporting, abuse/usage metrics. Provider spend limits and feature flags.
- Admin: authenticated web app on a secure hosting platform.
- Testing: unit, API integration with mocks, DB RLS/authorization tests, E2E on Android, smoke tests on at least one physical device; production readiness review.

## 8. Android deliverables — non-negotiable
- A real native Android app built with Expo/React Native, **not merely an installed website/WebView**.
- `app.json` or `app.config.ts` with valid application ID, permissions, icons, splash, build version, deep links.
- `eas.json` with `preview` profile producing **.apk** for direct installation; `production` profile producing **.aab** for Google Play. Build configurations must be tested or clearly marked untested pending Expo credentials.
- If EAS account/keystore credentials are unavailable, provide exact build commands and do not invent an APK/download link. When possible run `eas build --platform android --profile preview`, inspect build result and share genuine URL.
- Preserve web prototype as a reference/PWA until native application parity is tested.

## 9. Implementation priority
1. Inspect existing sources, reproduce baseline UI, run V2 tests, write a concise gap list.
2. Scaffold Expo Router Android application with navigation and functional prototype screens, working camera/gallery pick, template selection and local storyboard flow.
3. Set up real adult accounts, Supabase schema with RLS, private storage, projects, and Studio persistence.
4. Add authenticated AI Director and image generation/edit with quota/credits and end-to-end live testing when access is available.
5. Add asynchronous video-to-video/image-to-video generation with secure upload, status and private outputs.
6. Add approval-gated public feed, likes/follows/comments, reporting/blocking and admin moderation.
7. Add complete permission-aware Create My Version / remix lineage and creator credit.
8. Add native purchase handling, notifications, accessibility, deletion/export, policy/legal review, release preparation.
9. Generate real Android APK and provide verified install link, then prepare AAB and Play closed-testing release.

## 10. Definition of done
Each feature must be classified in a release note as: (A) implemented and tested end-to-end, (B) implemented but requires credentials/real test, or (C) demo/placeholder. No fake feed interactions or sample images presented as production functionality. Demonstrate: adult can sign in, upload owned image, create a private project, call real provider with configured keys, track async job, view/save output, request approval, then see it in feed only if approved; another eligible adult can tap Create My Version and make an attributed remix of reusable template information; parent-owned Family Mode is private and child cloud media remains blocked until safeguards complete. Automated tests + build artifact paths are required for implementation claims.

## 11. Key reference sources (consult current docs during coding)
- Expo Android APK: https://docs.expo.dev/build-reference/apk/
- Expo internal distribution: https://docs.expo.dev/tutorial/eas/internal-distribution-builds/
- Expo Router: https://docs.expo.dev/router/introduction/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase security: https://supabase.com/docs/guides/security/product-security
- Runway: https://docs.dev.runwayml.com/api/
- Runway Claude Code setup: https://docs.dev.runwayml.com/guides/mcp/
- OpenAI API official docs: https://platform.openai.com/docs/
- Google Play policy center: https://support.google.com/googleplay/android-developer/topic/9858052

## 12. Important distinction between current source and target product
`reference/android-pwa/` is an installable *web preview*, with real AI buttons disabled and local sample data only. `reference/wonderreel-v2/` contains a **developer-only** Node backend with image and video provider integration code tested with mocks; no real provider credentials and no safe public launch backend. Neither is a native APK or production social network. Build the real product described in this specification, preserving the design and useful code, and communicate blockers without overclaiming.
