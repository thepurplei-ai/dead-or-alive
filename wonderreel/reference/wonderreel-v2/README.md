# WonderReel V2 — AI generation backend connected (developer build)

**Status: Working local web prototype + real API integration code + mocked tests. Not a hosted service, native mobile app, or live public social network.**

This release builds on the original WonderReel concept: a short-video sample feed, opt-in **Create My Version** concept remixes, AI storyboards, a local Studio, Discover, and a parent-supervised Family Mode concept. **The new step** is a server-side integration for real OpenAI image generation / editing and Runway image-to-video / video-to-video generation, with generation job status and private local downloads. No API key is bundled. The integrations were verified with automated mocks, **not** charged live generations.

## Quick start

Requires **Node.js 22 or newer** and a computer or cloud development environment. No Mac is required. Extract this ZIP, open a terminal **inside the `wonderreel` folder**, then:

```bash
# Without credentials: browse the interface and create storyboards locally
node backend/server.mjs
# Open http://127.0.0.1:3000 in a browser
```

To enable live AI **using your own paid provider accounts**:

```bash
cp .env.example .env
# Edit .env and supply OPENAI_API_KEY and optionally RUNWAYML_API_SECRET
node --env-file=.env backend/server.mjs
# Open http://127.0.0.1:3000
```

On Windows PowerShell, duplicate `.env.example` as `.env` and fill it in using an editor. The `node --env-file=.env` command is the same. Do not paste your secret keys into the browser or a chat message. API usage may incur charges. **Never forward or publicly expose port 3000.**

## Generate something

1. Choose **AI Create** or **Create My Version** from a feed template.
2. Enter a detailed prompt. You can **Generate AI image** without uploading a source, or upload a JPG/PNG/WEBP image to edit it.
3. To **Generate AI video**, upload an image to animate or an existing MP4 clip to transform. In this local developer integration, cloud AI media inputs must be **under 3 MB**. This is a development constraint; production will use private cloud uploads instead.
4. If sending a file, confirm you have permission from every person visible. Confirm you are an adult and all identifiable people in the submitted media are adults (18+). Never submit children's media to the current cloud AI endpoints.
5. Watch the status panel. For videos, the browser checks the backend until the Runway job completes. Save a result while it is accessible.

**If you do not configure keys:** the sample feed, templates, remix prompt flow, storyboards, and locally saved Studio projects remain usable. Live AI requests will show a configuration error rather than faking an output.

## API integration summary

| Endpoint | Behavior | Required env |
| --- | --- | --- |
| `GET /api/health` | Local provider readiness | None |
| `POST /api/director` | AI four-scene storyboard | `OPENAI_API_KEY` |
| `POST /api/generate/image` | OpenAI image generation or edit based on source image | `OPENAI_API_KEY` |
| `POST /api/generate/video` | Asynchronously starts Runway image-to-video or video-to-video | OpenAI + Runway keys |
| `GET /api/generate/video/{jobId}` | Polls job, downloads succeeded output to local storage | Runway key |
| `GET /api/generated/{randomId}` | Shows locally generated private-by-unguessable-URL asset | None |

All API keys are held in the server process, never exposed to the browser. Local dev hardening includes HTTP body size limits, input media signature checks, explicit rights/adult confirmations, prompt and image moderation, a limited generation quota (8 images/hour, 3 videos/hour), one in-flight video job, secure random asset IDs, one-hour result expiry, and loopback-only binding. Runway outputs are downloaded rather than exposing expiring provider URLs. The tests use mocked OpenAI and Runway results.

**Limitations / serious launch blockers:** This is still **not production safe**. Confirmation checkboxes don't establish age or legal consent; the video uploads and rendered video frames have **no comprehensive frame-by-frame/video/audio moderation**; there is no independent CSAM prevention pipeline, authentication, abuse protection per user, secure multi-tenant storage, durable job queue, verified parental controls, human-review tooling, public moderation, account deletion, copyright/likeness claims handling, billing, or privacy compliance. Do not upload identifiable child media or deploy this local backend publicly. Moderation APIs are not substitutes for those protections.

### Safety and privacy notes

- Family Mode is intentionally **local storyboard only**. Cloud AI calls are blocked for this mode until proper parental permissions, independent age/identity controls, and child-safety workflows exist.
- A source file stays in your browser for preview; it is sent to a configured provider only when you explicitly request generation. A successful generation returns temporary private local-server output, not a published post.
- The server stores generated output in an OS temporary folder, with expiry after around one hour. It does not intentionally save original input media to disk. Third-party API providers process inputs under their own service terms; review those before enabling the service.
- The mock social feed is not a public network. All likes, comments, and draft storyboards remain in your own browser's storage.
- AI image/text moderation is in place as a **basic developer control**, not a complete protection stack. Video uploads are only prompt-checked. Video output is not currently fully moderated.
- `wonderreel` is a provisional name; trademark availability has not been checked.

## Run tests

```bash
node --test backend/tests/server.test.mjs
node --check app.js
node --check backend/server.mjs
```

Tests cover unauthenticated local static serving, missing-key errors, input gating, OpenAI generation/edit paths, prompt/image moderation, asynchronous Runway image-to-video and video-to-video task handling, and local result downloads. Tests use fake provider responses and **do not invoke or charge a real API**.

## Project files

- `index.html`, `styles.css`, `app.js` — responsive web UI and local interactions
- `assets/` — original placeholder concept illustrations
- `backend/server.mjs` — local-only Node HTTP server with real provider calls
- `backend/tests/server.test.mjs` — mocked integration tests
- `supabase/schema.reference.sql` — un-deployed, unreviewed future database draft
- `.env.example` — configuration template, **not** a credentials file

## Next milestone: real accounts, cloud media, and moderated posts

1. Port to React Native/Expo for iOS/Android or evolve the existing mobile web experience as a PWA.
2. Build verified adult accounts and age handling; create private media uploads, ownership checks, secure cloud storage, and a durable async media-generation job queue.
3. Replace local temporary results with a real Studio library and credit/cost accounting.
4. Build real feed publishing only after upload/output moderation, adult/likeness controls, reporting, blocking, review, appeals and deletion tooling are in place.
5. Implement the original-creator-linked remix permission system and parent-supervised family experiences after independent child-safety review.

## API documentation used

- OpenAI image generation: https://developers.openai.com/api/reference/resources/images/methods/generate
- OpenAI image edits: https://developers.openai.com/api/reference/resources/images/methods/edit
- OpenAI moderation: https://developers.openai.com/api/docs/guides/moderation
- Runway API: https://docs.dev.runwayml.com/api/
- Runway task output: https://docs.dev.runwayml.com/assets/outputs/

### Hand-off to Codex or Claude Code

> Continue WonderReel V2 from this repository. Read README.md first. Maintain strict local-only server restrictions until implementing real authenticated/authorized backend routes. Never expose API keys to a public client. The next milestone is a native Expo application with Supabase Auth, private cloud media storage, durable jobs, secure credit budgets, and production-grade video + child safeguards; keep Family Mode private and cloud-disabled until legally reviewed. Reuse the existing UI and preserve the Create My Version template remix feature. Start by running the Node tests.
