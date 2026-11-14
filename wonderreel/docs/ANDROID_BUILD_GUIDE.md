# Android Implementation and Install Link Guide

## Target outputs
- **APK** for Android direct install/testing.
- **AAB** for Google Play production distribution.
- Public web PWA is optional, but does not substitute for a native Android build.

## Stack
- React Native with Expo + Expo Router + TypeScript.
- Use Expo's current supported SDK, pinned dependencies, tested Android permissions and build tooling.
- Prefer EAS cloud builds; a MacBook is not necessary for Android development/cloud builds.

## Required files
- `app.config.ts` or `app.json` (unique application ID, scheme, icons, splash, permission strings, versioning).
- `eas.json` with at least:

```json
{
  "build": {
    "preview": {"distribution": "internal", "android": {"buildType": "apk"}},
    "production": {"android": {"buildType": "app-bundle"}}
  }
}
```

Actual fields and compatibility must be verified against current Expo docs. `app-bundle` may be the EAS default; correct if current schema differs.

## Example command
```
npx eas-cli build --platform android --profile preview
```

Claude Code must check installed tooling and documentation, then log in through authorized developer credentials, configure Android signing and run the build. A paid/registered account, keystore, available network and device testing may be required. If credentials/access are missing, Claude must leave working build config, document exact user actions and never fabricate a build URL.

## How to share link
Only when the build provider returns a finished verified .apk artifact: provide the actual artifact URL (not a guessed domain) plus checksum/version/build date when available. Provide Android installation guidance and note Google Play Protect/unknown-app install prompts. For Google Play, use closed testing and upload signed AAB.

## Reference links
- https://docs.expo.dev/build-reference/apk/
- https://docs.expo.dev/tutorial/eas/internal-distribution-builds/
