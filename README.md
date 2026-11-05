# 掼军

[简体中文](README.zh-CN.md) · [Downloads](https://github.com/RichardLoZC/guandan-study/releases)

An offline and local-network Guandan client for macOS, Windows and Android. Professor Yan Feng created the original project; Richard Lo maintains these adaptations. Original credits and component licenses are retained.

## 1.8.41

Starting hands now show the share of same-level reference hands they exceed. Post-round reports show two teams’ starting resources and four players’ lead losses (with/without opponent bombs), lead recoveries, wind receptions and bomb usage. Composite performance ratings and formula panels are removed. Historical feedback remains in local backups. The display comparison is not win probability; training rewards remain off.

The DanLM v1 adapter now matches the official history format, complete action candidates and model-based tribute decisions. Joker/wildcard history and terminal placement handling have been repaired; model weights are unchanged. Fixed-sample validation passed all 1,144 play nodes and 312 tribute cases. This does not prove equivalence for all inputs or stronger play. See [alignment evidence](docs/DANLM-ALIGNMENT.md).

The Apple Silicon release uses the official native core. Windows, Android and Intel Mac use aligned ONNX; development without an optional native runtime also uses ONNX. Shared improvements include a single hand row, flat/stack layouts, manual ordering, historical AI personas and sounds, series feedback, private relative starting-hand strength, seven-card reporting and compact local post-round statistics. Automatic arrangement and the strategy-book layer are removed. Trial statistics are uncalibrated and never automatically used as training rewards.

## Downloads and play

Download the Universal Mac ZIP, portable Windows x64 ZIP or Android APK from [Releases](https://github.com/RichardLoZC/guandan-study/releases). Extract the full desktop archive; Android needs Android8+ and WebView120+. Keep the original signing identity when updating. Mac uses ad-hoc signing without notarization; Windows has no Authenticode signature.

This GitHub distribution supports solo play and 2–4 players on the same Wi-Fi, with DanLM filling empty seats. All peers need protocol3 clients, version1.8.40 or compatible newer releases. Room codes are not encryption; do not forward the LAN port to the Internet.

Users of a separately distributed online edition should use that edition’s update channel. The historical Android package identity is shared: manually installing this public APK replaces online features and may prevent switching back to a lower build.

## Development

```sh
npm ci
npm test
npm start
npm run build:win
npm run build:android -- --debug
```

Node22.12+ is required. Android needs JDK17, Gradle8.13 and SDK36. Release APK builds require the original maintainer key; debug builds use `.dev`. See [building](docs/BUILDING.md), [optional native runtime](native/README.md) and [public distribution boundaries](docs/PUBLIC-DISTRIBUTION.md).

**DanLM is restricted to non-commercial use.** This is an independent adaptation, not an official DanLM product. See [third-party notices](THIRD_PARTY_NOTICES.md).


Ming persona update: 50 imaginative historical portraits; 25 classic and 25 ExpertStyle-v1 AI identities. ExpertStyle is a play-only variant; tribute/return always uses the original DanLM v1 checkpoint. This is a style choice, not a demonstrated strength improvement. Local human advice keeps the classic model. The jade silk tabletop and portrait atlases were generated with OpenAI ImageGen; prompts and asset hashes are in web/card-sources/ming50-generation.json. Existing DanLM license and attribution apply to the derived score head. No training rewards are enabled.
