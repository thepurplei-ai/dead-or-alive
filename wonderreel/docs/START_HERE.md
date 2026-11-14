# Start Here — WonderReel for Claude Code

**Your goal:** Ask Claude Code to turn our WonderReel prototype into a real Android-first app (and iOS-ready later) while preserving its design and all agreed features.

## Fastest handoff
1. Download/extract the entire handoff ZIP.
2. Open the extracted `WonderReel_Claude_Code_Handoff` folder as the project in Claude Code.
3. Paste `COPY_PASTE_INTO_CLAUDE_CODE.txt` into Claude Code chat, or simply say: **Read CLAUDE.md and all docs, then begin Phase 0 and Phase 1.**
4. When Claude asks for services, connect Supabase, an AI provider, Expo/EAS, and Google Play only through your secure account login. Don't paste secret tokens into chat. Claude should implement local/non-billable portions without credentials first.
5. Review progress reports and test an actual APK once created. A PWA/home-screen icon is not the same thing as an APK.

## What is inside
- `CLAUDE.md`: persistent instructions automatically useful to Claude Code.
- `COPY_PASTE_INTO_CLAUDE_CODE.txt`: ready-to-paste launch prompt.
- `docs/WONDERREEL_PRODUCT_SPEC.md`: complete feature and visual brief.
- `docs/IMPLEMENTATION_AND_ACCEPTANCE.md`: build phases and test checklist.
- `docs/PRIVACY_AND_SAFETY.md`: essential guardrails for AI/media/public posting/family.
- `docs/ANDROID_BUILD_GUIDE.md`: real direct-install APK requirements.
- `reference/wonderreel-v2/`: V2 prototype and developer-only API backend.
- `reference/android-pwa/`: installable web preview and icons.

## Current state accurately described
- V2 web UI works locally; sample social interactions are simulated/local.
- Developer AI backend contains working integration code tested with simulated provider responses. It has not been live-tested using paid API keys in this handoff.
- Android PWA is browser-based; it is **not a native Android package**.
- Public profiles, moderation, billing, persistent cloud accounts, and native mobile packaging still need implementation.
- Child cloud processing must not be turned on without policy, parental consent, privacy/legal and provider clearance.

## Verification performed for this handoff
At packaging time, Node.js v22 ran `node --test backend/tests/server.test.mjs`: **4 passed, 0 failed**, plus syntax checks for legacy `app.js` and `backend/server.mjs`. Tests are mocked provider integrations, not live generation or native mobile tests.
