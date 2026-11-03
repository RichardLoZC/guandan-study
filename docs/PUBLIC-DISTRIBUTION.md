# Public distribution boundary

This repository and its GitHub release assets contain the offline and local-network client only. Private hosted services, deployment configuration, update feeds, server addresses, credentials, personal saves and research-run data are excluded. Do not copy a private working directory into this repository.

Source changes are prepared from the public main branch and reviewed before any push. Build resources are listed in `scripts/public-runtime-manifest.json`; package builders reject unlisted resources and symbolic links. Regenerate the manifest only for reviewed changes and run the public-boundary check before packaging. Audit the extracted APK, ASAR and optional native runtime before publishing. Private runtime installers and signing keys stay outside the source tree.

The Android application preserves the original public package identity and signing certificate. Other editions historically shared that identity; users of an online edition must use that edition’s channel. Installing this offline APK replaces the app, and switching to a lower build is rejected by Android. No private update channel is included in the public APK.
