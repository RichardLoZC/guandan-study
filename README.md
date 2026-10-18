# Guandan Study · 掼蛋研习社

<p><img src="web/assets/brand/app-icon.png" width="96" height="96" alt="Guandan Study · 对家"></p>

[简体中文](README.zh-CN.md) · [Downloads](https://github.com/RichardLoZC/guandan-study/releases)

## Original creator · 原作者鸣谢

**原项目由严锋教授创建。严锋教授是复旦大学中文系教授、2024 微博年度新知博主。** 本项目是在严锋教授原有工作基础上的改编与扩展。感谢严锋教授的原创工作，为本项目提供了基础。

**The original project was created by Professor Yan Feng (严锋)**, a professor in Fudan University's Department of Chinese Language and Literature. He was recognized as a 2024 Weibo “年度新知博主” (New Knowledge Blogger of the Year). This repository adapts and extends his original work. We thank Professor Yan Feng for creating the project on which this adaptation is built.

The platform ports, redesigned interface, localization and LAN features in this repository are subsequent adaptations by Richard Lo.

## About

Play Guandan offline against DanLM, or share a table with friends on your local network. Available for macOS, Windows and Android phones/tablets. Switch between Chinese and English with the button at the top of the table.

**The bundled DanLM model has a non-commercial license.** This public repository is not a claim that every included component is unrestricted open source. See [licenses and credits](THIRD_PARTY_NOTICES.md).

## Features

- A 2D table with flat or curved fan hand layouts on computers/tablets. Phones use a fixed landscape table with same-rank cards stacked vertically in one hand area.
- Three card styles, day/night themes and larger text. Level cards carry a gold star in hands, table plays and replays.
- Smaller desktop windows scale the whole table proportionally, including players, cards and controls. View → Actual Size restores automatic fitting.
- One-click hand arrangements that search complete partitions, including alternative suits and wild-card allocation, and cycle through different combinations.
- Free arrangement: computers/tablets reserve an upper row for confirmed groups and rearrange only the lower row; phones arrange the entire hand in one area. Dragged groups sort their cards, recognize updated combinations and support undo. Layouts survive plays and reopening the same round.
- DanLM suggestions, a teaching layer, round reviews, replay and text exports.
- Independent strategy-book switches for AI players and hints in Settings. AI choices persist locally; LAN rooms share the host’s setting.
- Visible tribute/return/exemption cards, each player's latest play or pass, and all remaining cards after a round.
- AI turns have a randomized minimum display time of 1.12–1.82 seconds while inference runs. Highlighted avatars distinguish AI thinking from human turns.
- Solo practice and LAN games with 2–4 human players. DanLM fills empty seats; four humans can play without bots.
- Automatic room discovery and six-digit room codes. Android phones/tablets and Mac/Windows computers can all host or join.
- Local saves, offline assets, no account and no hosted inference service.

## Install

Get an archive or APK from [Releases](https://github.com/RichardLoZC/guandan-study/releases).

| Platform | Package | Start |
| --- | --- | --- |
| macOS | Universal ZIP (Apple silicon + Intel) | Extract and copy `掼蛋研习社.app` to Applications |
| Windows | x64 portable ZIP | Extract the whole folder, then run `GuandanStudy.exe` |
| Android | Phone/tablet APK | Install the APK; Android 8+ and System WebView 120+ are required |

The Mac build uses an ad-hoc signature and is not notarized. The Windows build has no Authenticode signature. Android releases use a dedicated release key. Existing Android installations with the same application ID and signing key can update in place.

For multiplayer, connect devices to the same trusted Wi-Fi. Choose **Solo practice → Multiplayer**. Choose **Host a table** on any Android phone/tablet or computer; others join using its code. Phone-to-phone play needs no computer. New games and clearing A randomize seats. Guest Wi-Fi isolation can prevent discovery; manual entry uses the address shown in Room options. Keep the host game open. An Android host pauses the table when sent to the background; reopen it and choose **Resume game**. A hosted save is separate from solo practice.

## Arrange your hand

On computers and tablets, each round starts with all cards in descending rank order on the lower row; the upper row is empty for your combinations. Phones have one hand area, with adjacent same-rank cards stacked up to three per column. Tap to select a card, or press and drag to arrange it immediately. There is no hold delay; a small movement tolerance prevents accidental drags. Release to finish. Select several cards first, then drag any selected card to move the group. The gold marker shows the insertion point; **Undo arrange** reverses the last manual or automatic arrangement. Mouse, touch and pen share this behavior; dragging across cards moves them. Tap cards individually to select a group.

Keyboard users can focus a card and use Alt/Option + arrow keys directly. Swipe empty space in narrow 2D rows to scroll sideways. Pass and Play stay prominent in the bottom dock. Layout and arrangement tools sit together, with Hint and History at the bottom right. Choose straight flushes, bombs, runs or pairs as a priority, then click **Arrange** to cycle alternatives. **Sort by rank** sorts the lower row while preserving the upper row; on phones it sorts the whole hand. **Undo arrange** reverses that change.

Select and arrange while opponents are acting, while paused or while a LAN response is pending. Only a legal move on your turn can be submitted. Dealing animations and finished rounds disable hand preparation. On computers/tablets, both shelves reserve the same space when empty or occupied, so moving cards does not resize the hand area or displace the table and dock.

Automatic arrangement uses a bounded search over complete partitions of the lower row on computers/tablets, or the whole hand on phones. Upper-row cards and groups remain untouched. It compares competing uses of natural cards and wild cards, including preserving one bomb while completing a straight flush. Priority modes offer alternatives; this is not a guarantee of a globally optimal partition.

Drag the mouse from empty hand space to box-select cards. Drag right for a blue window that fully encloses visible card faces; drag left for a green crossing box that selects touched faces. Hold **Shift** to add to your selection, or **Esc** to cancel the box. Flat and curved layouts use visible face geometry across both rows. Dragging a card still rearranges it; touch gestures on empty space still scroll.

Tap empty table or hand space to clear the selection. Scrolling and drag releases do not clear it. **Shift-click** adds a range from the last selected card in displayed order: upper row left to right, then lower row. **Esc** cancels an active drag or box while preserving the original selection; press it again to clear. An open dialog owns Escape. Switching layouts preserves selection; rearranging cards resets the next Shift-click anchor.

Layouts stay on your device. On computers/tablets, switching between flat and fan layouts preserves selected cards and both rows. The phone layout merges older two-row saves into a single area without losing cards or groups. Played cards disappear without re-sorting the rest; a new round starts with a fresh arrangement. Auto arrangement remains available. Neither manual nor automatic display arrangements change game rules or DanLM inputs.

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

The game engine validates cards and moves. The bundled DanLM ONNX model ranks legal play candidates with ONNX Runtime Web. Optional strategy guidance adjusts candidate selection. Bots and hints use the same model weights; those weights were not retrained for this project. In **Settings → AI play strategy**, turn off strategy-book guidance to use the original DanLM scores. It applies from the next AI move and does not change hint preferences or tribute returns. Only the host can change the shared bot setting in a LAN room.

With strategy guidance enabled, the overlay uses the saved public action sequence to compare recent partner/opponent routes, discounts older evidence as cards are spent, and checks whether a same-type follow-up can strictly beat the unseen-card ceiling. Passing over a partner is not evidence of weakness; repeated passes are only a small, uncertain signal. Early bombs/straight flushes are deprioritized when an ordinary alternative preserves their physical cards with comparable residual structure. Immediate finishes and urgent endgames remain exempt. These are heuristic improvements, not a measured win-rate claim. Decision evidence is saved for completed-round review/export and stays private during live LAN play.

Players holding at most three cards automatically pass when the target requires more cards; this uses public counts only, never assumed ranks. Players with four or more cards are not skipped because a bomb may be possible. Normal AI turns retain a random 1.12–1.82 second thinking period, overlapping inference; actual time can be longer when computation or network scheduling takes longer.

Tribute returns use a separate deterministic hand-structure policy. It evaluates legal return cards using only the bot's own hand and level, preserving useful combinations before using lower rank as a tie-breaker. This is a bounded heuristic, not a DanLM return decision or a guarantee of optimal play.

The teaching text is a separate presentation layer. English advice summarizes the chosen move, actual card counts, candidates and information limits. It does not expose the neural network's internal reasoning or claim a win probability. Stored game facts and model inputs do not change when the language changes.

`web/app/core.js` is a documented extraction of the original distributed rule code. `match.js` manages validated state, saves, tribute and reviews. `table.js` / `review.js` render the UI; `i18n.js` and `locales/en.js` localize presentation while keeping canonical game state unchanged. Flat and fan layouts share the same DOM card buttons and hand editor. The shared `web/app/lan-room.js` is authoritative on desktop and Android hosts and sends each guest a view with opponents' hands masked.

The original Windows 1.0.0 distribution did not include its React/TypeScript sources. Its compiled source remains in `web/assets/` for provenance; extraction hashes are in `web/app/core-source.json`. Upstream MIT and DanLM license notices are retained. This is an independent application adaptation, not an official DanLM release.

## Data and boundaries

- macOS saves: `~/Library/Application Support/GuandanStudyOffline`.
- Windows saves: `掼蛋数据` next to the executable; `%APPDATA%/GuandanStudyOffline` if that folder is not writable.
- Android saves: private app storage. Export backups from Settings. Uninstalling removes local saves.
- LAN uses HTTP and UDP on a trusted private network. Room codes are not encryption. Do not expose the host port to the Internet.
- Legacy Tuo 3 saves remain readable, but new Tuo 3 games are disabled because the model was not trained for that ruleset.
- Tests cover rules, card conservation, saves, tribute, LAN isolation/reconnection, localization and rendering projections. See [verification notes](docs/TESTING.md).

## Credits

Original project creator: **Professor Yan Feng (严锋)**. This repository is an adaptation of his work.

DanLM: [dashidhy/DanLM](https://github.com/dashidhy/DanLM). The original distribution's copyright notice, Copyright 2026 shef-wang, is retained as supplied. ONNX Runtime is included under its license. Cards derive from public-domain SVGCards. All notices and modification details are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
