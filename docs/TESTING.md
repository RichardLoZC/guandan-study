# Verification

Run `npm test` before packaging. Tests cover physical card conservation, valid moves, tribute and exemption, review reconstruction, save failures, model-response validation, host/guest state, reconnection, four-human rooms, localization and phone hand projections.

Release 1.7.0 adds browser checks of Chinese/English switching, selection retention, real model advice, 2D/3D views and phone portrait/landscape layouts. English teaching summaries use actual move data and explicitly distinguish model ranking from explanatory text.

macOS packaging includes a strict code-signature integrity check. Android packaging checks the APK signature. The `Windows package` workflow builds a ZIP on Windows, extracts it, compares bundled resources and model hashes to source, and launches the shipped EXE in Electron's Node CLI mode to check the runtime, rules, localization and portable storage. This is separate from native Windows graphical gameplay testing. No physical Android phone was available for this release; responsive browser checks do not establish GPU performance on every phone. Existing tablet support shares the same Android package.

`.gitattributes` preserves upstream bundle bytes on Windows. Git's automatic CRLF conversion caused the initial provenance-hash test failure; the test remains strict and the original hashes are unchanged.

The optional `test:mac` script is an existing developer smoke harness; it uses isolated data. UI screenshots and internal reports under `test-results/` are deliberately excluded from publication.
