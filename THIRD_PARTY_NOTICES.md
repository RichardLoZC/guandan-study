# Licenses and credits

This repository contains components with different licenses. Public availability does not remove their restrictions. In particular, the bundled DanLM component and distributed application containing it are for **non-commercial use** unless the DanLM copyright holder grants permission.

| Component | Source / notice | License and modifications |
| --- | --- | --- |
| Original application / rule and inference bundle | Copyright 2026 shef-wang; `web/mobile/LICENSE` | MIT notice supplied with the original Windows 1.0.0 distribution. Compiled artifacts retained; rule extraction documented in `web/app/core-source.json`. Worker adapted for offline paths and legacy Tuo 3 candidate filtering. |
| DanLM models | [dashidhy/DanLM](https://github.com/dashidhy/DanLM); `web/mobile/DanLM-LICENSE.txt` | Apache 2.0 text with an additional non-commercial restriction (Section 10); do not describe this as plain Apache-2.0. `context.onnx` and `scores.onnx` are unchanged from the supplied package. |
| ONNX Runtime Web | `web/mobile/ONNX-Runtime-LICENSE.txt` | MIT; bundled JS/WASM runtime |
| React in retained original bundle | `web/mobile/React-LICENSE.txt` | MIT; retained for original bundle provenance |
| Three.js 0.186.1 | [Three.js](https://github.com/mrdoob/three.js); `web/vendor/three/LICENSE` | MIT; addon imports changed to relative offline paths |
| Classic and four-color cards | [Saul Spatz SVGCards](https://github.com/saulspatz/SVGCards); `web/card-sources/SVGCards-README-license.txt` | Public domain; selected deck, four-color adaptation and larger indices. Per-file source hashes in `web/card-sources/assets-manifest.json`. |
| Other card research notices | `web/card-sources/SVG-cards-README.txt`, `SVG-cards-LGPL-2.1.txt` | Retained research attribution; current card styles use the SVGCards public-domain deck and original minimal designs |
| Anatomical hands | [Innerscene / MakeHuman / MPFB](https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f); `web/assets/3d/CREDITS.txt` | CC0. Pose baked, mirrored, reduced and colored; source hash in `artwork/3d-research/anatomical-hand/SOURCE.json` |
| Avatars and application icon | Generated for this project; generation record in `web/card-sources/头像生成记录.txt` | AI-generated artwork, no claim of exclusive rights. No user-provided reference photographs are redistributed. |
| Table geometry, minimal cards, UI and platform adaptations | This project | Original project code under the root MIT license; incorporated third-party parts retain the licenses above |
| Electron and build dependencies | See packaged Electron `LICENSE` / `LICENSES.chromium.html` and dependency package notices | Licenses are retained in desktop distributions; versions pinned in `package-lock.json` |

The hand-pose reference URL credits a gesture reference only. Its photograph is not included. Local game saves, signing keys, device pairing information and internal test reports are excluded from version control and release packages.
