# Licenses and credits

## Original project creator

**Professor Yan Feng (严锋)**, a professor in Fudan University's Department of Chinese Language and Literature and a 2024 Weibo “年度新知博主” honoree, created the original project. This repository adapts and extends his work. We thank him for providing the foundation for this project. The original distribution's license and copyright notices below are retained as supplied.

## Component licenses

This repository contains components with different licenses. Public availability does not remove their restrictions. In particular, the bundled DanLM component and distributed application containing it are for **non-commercial use** unless the DanLM copyright holder grants permission.

| Component | Source / notice | License and modifications |
| --- | --- | --- |
| Original application / rule and inference bundle | Copyright 2026 shef-wang; `web/mobile/LICENSE` | MIT notice supplied with the original Windows 1.0.0 distribution. Compiled artifacts retained; rule extraction documented in `web/app/core-source.json`. Worker adapted for offline paths, legacy Tuo 3 candidate filtering and straight-flush enforcement shared with the table rules. |
| DanLM 1.2.0 policy reference | User-supplied `Guandan-DanLM-1.2.0.apk`, Copyright 2026 shef-wang; `web/mobile/LICENSE` | This APK was reviewed as a policy reference in earlier versions. The optional policy overlay was removed in 1.8.32; the bundled model weights remain unchanged. |
| DanLM models | [dashidhy/DanLM](https://github.com/dashidhy/DanLM); `web/mobile/DanLM-LICENSE.txt` | Apache 2.0 text with an additional non-commercial restriction (Section 10); do not describe this as plain Apache-2.0. The local Mac app uses upstream checkpoint `dansformer_v1_best_eval.pt` and upstream macOS native modules at commit `d200e455f63fd46aa398e97b69a6bb94cf1ba098`. |
| Python, PyTorch and NumPy | `Contents/Resources/danlm-native/runtime/lib/python3.12/site-packages/` | Local runtime; package licenses are included with the runtime. |
| React in retained original bundle | `web/mobile/React-LICENSE.txt` | MIT; retained for original bundle provenance |
| Classic and four-color cards | [Saul Spatz SVGCards](https://github.com/saulspatz/SVGCards); `web/card-sources/SVGCards-README-license.txt` | Public domain; selected deck, four-color adaptation and larger indices. Per-file source hashes in `web/card-sources/assets-manifest.json`. |
| Other card research notices | `web/card-sources/SVG-cards-README.txt`, `SVG-cards-LGPL-2.1.txt` | Retained research attribution; current card styles use the SVGCards public-domain deck and original minimal designs |
| Avatars and application icon | Generated for this project; historical-character atlas prompt in `web/assets/avatars/historical-figures-v1.prompt.txt`, earlier avatar record in `web/card-sources/头像生成记录.txt`, approved 对家 icon record in `artwork/图标设计说明.md` | AI-generated artwork, no claim of exclusive rights. No user-provided reference photographs are redistributed. |
| Table geometry, minimal cards, UI and platform adaptations | This project | Original project code under the root MIT license; incorporated third-party parts retain the licenses above |
| Electron and build dependencies | See packaged Electron `LICENSE` / `LICENSES.chromium.html` and dependency package notices | Licenses are retained in desktop distributions; versions pinned in `package-lock.json` |

The former 3D renderer, Three.js runtime and hand meshes were removed in 1.8.6. The current flat and stacked layouts use ordinary 2D card elements and contains no reference photograph. Local game saves, signing keys, device pairing information and internal test reports are excluded from version control and release packages.
