# Guandan Study · 掼蛋研习社

[简体中文](README.zh-CN.md) · [Downloads](https://github.com/RichardLoZC/guandan-study/releases)

Play Guandan offline against DanLM, or share a table with friends on your local network. Available for macOS, Windows and Android phones/tablets. Switch between Chinese and English with the button at the top of the table.

**The bundled DanLM model has a non-commercial license.** This public repository is not a claim that every included component is unrestricted open source. See [licenses and credits](THIRD_PARTY_NOTICES.md).

## Features

- First-person 3D cards and hands, with a 2D alternative and automatic graphics fallback.
- Three card styles, day/night themes and larger text.
- One-click hand arrangements that cycle through different possible combinations.
- DanLM suggestions, a teaching layer, round reviews, replay and text exports.
- Visible tribute/return/exemption cards, each player's latest play or pass, and all remaining cards after a round.
- Solo practice and LAN games with 2–4 human players. DanLM fills empty seats; four humans can play without bots.
- Automatic room discovery and six-digit room codes. A Mac or Windows computer hosts; desktop and Android devices can join.
- Local saves, offline assets, no account and no hosted inference service.

## Install

Get an archive or APK from [Releases](https://github.com/RichardLoZC/guandan-study/releases).

| Platform | Package | Start |
| --- | --- | --- |
| macOS | Universal ZIP (Apple silicon + Intel) | Extract and copy `掼蛋研习社.app` to Applications |
| Windows | x64 portable ZIP | Extract the whole folder, then run `GuandanStudy.exe` |
| Android | Phone/tablet APK | Install the APK; Android 8+ and System WebView 120+ are required |

The Mac build uses an ad-hoc signature and is not notarized. The Windows build has no Authenticode signature. Android releases use a dedicated release key. Existing Android installations with the same application ID and signing key can update in place.

For multiplayer, connect devices to the same trusted Wi-Fi. Choose **Solo practice → Multiplayer**. Host a room on a computer, then join using its code. New games and clearing A randomize seats. Android joins rooms; it does not host them. Guest Wi-Fi isolation can prevent discovery; manual entry uses the address shown in Room options. The host must remain awake.

## Develop

Node.js 22.12 or newer is required. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm test
npm start
npm run build:win
npm run build:mac
npm run build:android
```

Mac packaging must run on macOS. Windows packaging supports cross-builds from macOS and native builds on Windows. Android builds require JDK 17, Gradle 8.13, Android SDK 36 and Build Tools 36.0.0. See [build instructions](docs/BUILDING.md).

## How it works

The game engine validates cards and moves. The bundled DanLM ONNX model ranks legal candidates with ONNX Runtime Web. Optional strategy guidance adjusts candidate selection. Bots and hints use the same model weights; those weights were not retrained for this project.

The teaching text is a separate presentation layer. English advice summarizes the chosen move, actual card counts, candidates and information limits. It does not expose the neural network's internal reasoning or claim a win probability. Stored game facts and model inputs do not change when the language changes.

`web/app/core.js` is a documented extraction of the original distributed rule code. `match.js` manages validated state, saves, tribute and reviews. `table.js` / `review.js` render the UI; `i18n.js` and `locales/en.js` localize presentation while keeping canonical game state unchanged. `table3d.js` adds Three.js rendering. Desktop LAN rooms are authoritative and send each guest a view with opponents' hands masked.

The original Windows 1.0.0 distribution did not include its React/TypeScript sources. Its compiled source remains in `web/assets/` for provenance; extraction hashes are in `web/app/core-source.json`. Upstream MIT and DanLM license notices are retained. This is an independent application adaptation, not an official DanLM release.

## Data and boundaries

- macOS saves: `~/Library/Application Support/GuandanStudyOffline`.
- Windows saves: `掼蛋数据` next to the executable; `%APPDATA%/GuandanStudyOffline` if that folder is not writable.
- Android saves: private app storage. Export backups from Settings. Uninstalling removes local saves.
- LAN uses HTTP and UDP on a trusted private network. Room codes are not encryption. Do not expose the host port to the Internet.
- Legacy Tuo 3 saves remain readable, but new Tuo 3 games are disabled because the model was not trained for that ruleset.
- Tests cover rules, card conservation, saves, tribute, LAN isolation/reconnection, localization and rendering projections. See [verification notes](docs/TESTING.md).

## Credits

DanLM: [dashidhy/DanLM](https://github.com/dashidhy/DanLM). Original application notice: Copyright 2026 shef-wang. Three.js and ONNX Runtime are included under their respective licenses. Cards derive from public-domain SVGCards; the hand mesh derives from a CC0 Innerscene/MakeHuman asset. All notices and modification details are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
