# Building Guandan Study

Use Node.js 22.12+ and `npm ci`. `npm test` runs the rules, saves, LAN, presentation and localization regressions. Production runtime files are explicitly allowlisted by `scripts/package-options.mjs`.

## Desktop

```sh
npm run build:win   # Windows x64 portable ZIP; also works from macOS
npm run verify:win  # Extract ZIP and check packaged resources; native EXE check on Windows
npm run build:mac   # macOS only; Universal archive and ad-hoc signature
```

Set `GUANDAN_BUILD_ARCH=x64` or `arm64` for a single architecture. The Mac default is `universal`; Windows defaults to `x64`. Output is in `dist/`. The desktop build downloads the pinned Electron runtime on first use. No external models are downloaded while playing.

Mac builds use a local temporary staging directory to keep cloud-drive metadata out of code signatures. Windows builds edit PE resources with the packager's JavaScript resource editor; Wine is not required. Windows archives must be fully extracted before launch.

The `Windows package` GitHub workflow builds on a Windows runner, verifies the extracted ZIP against source, and runs the shipped EXE in Electron's Node CLI mode. The CLI check exercises runtime startup, rules, English text and portable storage; it does not test the graphical interface or model inference. `build-info.json` records the source commit and build platform; `verification.json` records the results and model hashes. Rebuilds create a fresh ZIP so removed files cannot remain in an older archive.

## Android

Install JDK 17, Gradle 8.13, Android SDK Platform 36 and Build Tools 36.0.0. Set these environment variables for your machine:

```sh
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
export GUANDAN_GRADLE=/path/to/gradle-8.13/bin/gradle
npm run build:android
# Optional after all Gradle dependencies are cached:
npm run build:android -- --offline
# Separate test application ID:
npm run build:android -- --debug
```

Default SDK/JDK lookup paths suit a Homebrew macOS setup. Windows developers should build in `android/` using Gradle and provide signing environment variables, or adapt the helper's executable paths for their shell.

The helper creates a personal release key under `~/.local/share/guandan-study` if no key is provided. Keep this directory backed up privately. A new key cannot update an existing APK signed with a different key. For controlled releases, provide `GUANDAN_STORE_FILE` and `GUANDAN_STORE_PASSWORD`; the key alias is `guandan`. Never commit these values or the key. The public repository contains no release signing credentials.

Android shares `web/`, then adds `android/web/pad.css` and `pad.js`. `mobile.css` supplies phone portrait and landscape layouts. The package ID remains `com.guandan.study` for update compatibility. The app handles system bars and display cutouts in its native window insets.

## Assets

Runtime models and artwork are included in the repository under their individual licenses. `scripts/build-icons.mjs` regenerates platform icons on macOS. The hand converter requires Blender and reads the included CC0 source under `artwork/3d-research/anatomical-hand/`.

## Isolated development data

Set `GUANDAN_DATA_DIR` to an absolute temporary directory before running Electron to avoid changing your daily game. `GUANDAN_LEGACY_DATA_DIR` can identify an old Windows save directory for one-time migration. Never use real player saves in public test fixtures.
