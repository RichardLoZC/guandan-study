# Guandan Study

[简体中文](README.zh-CN.md) · [Downloads](https://github.com/RichardLoZC/guandan-study/releases)

An offline and local-network Guandan client for macOS, Windows and Android. Professor Yan Feng created the original project; Richard Lo maintains these adaptations. Original credits and component licenses are retained.

## 1.8.40

The DanLM v1 adapter now matches the official history format, complete action candidates and model-based tribute decisions. Joker/wildcard history and terminal placement handling have been repaired; model weights are unchanged. Fixed-sample validation passed all 1,144 play nodes and 312 tribute cases. This does not prove equivalence for all inputs or stronger play. See [alignment evidence](docs/DANLM-ALIGNMENT.md).

The Apple Silicon release uses the official native core. Windows, Android and Intel Mac use aligned ONNX; development without an optional native runtime also uses ONNX. Shared improvements include a single hand row, flat/stack layouts, manual ordering, historical AI personas and sounds, series feedback, private starting-hand scores, seven-card reporting and local post-round pilot statistics. Automatic arrangement and the strategy-book layer are removed. Trial statistics are uncalibrated and never automatically used as training rewards.

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
