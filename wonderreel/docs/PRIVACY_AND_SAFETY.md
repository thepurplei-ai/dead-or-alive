# Security, Moderation and Family Safety — Release Gates

This is a safety design checklist, not legal advice. Get qualified counsel for jurisdictions served and review the latest Google Play/Apple rules and AI provider terms.

## Non-negotiable boundaries
- Adult-only public creator accounts, with eligibility assurance appropriate to market.
- Family projects are parent-owned, private by default. Disable cloud upload/generation of minors' identifiable media until appropriate consent, safeguards and provider agreements are implemented and reviewed.
- No child-controlled public profiles, open public child feed, DMs, geolocation or targeted advertising to children.
- No non-consensual face swap, likeness/voice replication or sexualized images of anyone, especially minors.
- No blanket permission to remix faces/voices: permission is scoped to template/style/story structure and expressly licensed assets.

## Safety sequence
1. Validate file signature, MIME, size, length and uploaded media ownership at trusted backend.
2. Detect and enforce relevant content/safety categories before third-party processing; escalate ambiguous cases to human review.
3. Validate prompt and block known harmful requests; take care around self-harm, exploitation, violence and impersonation.
4. Confirm adult-account eligibility, third-party AI processing disclosure and media likeness consent as legally required.
5. Reserve credits and generate through a private provider integration with limited spend/concurrency.
6. Retrieve output into private storage, inspect output media including frames/audio/transcript where appropriate; block unsafe outputs.
7. User preview stays private. Public publication is a separate request, pending review and server approval.
8. Support user reports, takedowns, appeal, legal preservation only when required, privacy deletion and evidence trails.

## Security
- Supabase RLS enabled on every exposed table; test cross-account data access.
- Do not use user-editable `user_metadata` for authorization. Roles/approval/eligibility trusted server-side.
- Service role / OpenAI / Runway API keys never in Android code, browser code, client logs or public env vars.
- Private media buckets with signed upload/download URLs; expire and revoke URLs where possible.
- Rate limit sign-in, upload, prompt generation, remix, comments, follows and purchase actions.
- Idempotent webhooks, signature verification, anti-replay, server-side credit ledger, no double charges.
- Document retention, purge and backups. Include full account deletion and portable exports.
- Add abuse dashboards/alerts and an emergency kill switch for generation and public posting.
- Never describe a front-end checkbox as legally sufficient parental consent or age verification.

## Review topics before public launch
COPPA (when applicable), GDPR and GDPR-K, local child data laws, EU Digital Services Act where applicable, UGC platform obligations, AI disclosure rules, copyright and performer/likeness rights, app-store child/family policies, export/deletion requirements, tax and digital purchase rules.
