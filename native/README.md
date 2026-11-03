# Optional official macOS runtime

Apple Silicon releases include the official DanLM v1 core, pinned to upstream commit `d200e455f63fd46aa398e97b69a6bb94cf1ba098`. The adapter source is `worker.py`. ONNX is used on Windows, Android, Intel Mac and development builds without this optional runtime.

The runtime directory passed through `GUANDAN_BUILD_NATIVE_DIR` must contain `worker.py`, a relocatable Python 3.12 arm64 runtime under `runtime/`, and upstream modules/checkpoint under `upstream/`. Python dependencies are PyTorch 2.8.0 and NumPy 2.2.6. Download upstream modules and checkpoint from the pinned public DanLM repository; keep its LICENSE. The checkpoint SHA-256 is `5341d7316bac1ead4098c796ea03f7e38fb47f001cc647a52be3ed0d15cd7244`.

Keep installed runtimes outside this source tree. Remove bytecode caches and installation metadata containing machine paths. Validate internal symlinks, dependencies, checkpoint hashes and clean-machine startup before packaging. Private server files, credentials and personal game saves are not part of this distribution.
