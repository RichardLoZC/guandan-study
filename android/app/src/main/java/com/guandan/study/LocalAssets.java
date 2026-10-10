package com.guandan.study;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** Local HTTPS origin for ES modules, Workers and WebAssembly, with no network fallback. */
final class LocalAssets {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private final AssetManager assets;
    LocalAssets(AssetManager assets) { this.assets = assets; }

    static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null;
    }
    static String assetPath(Uri uri) {
        if (!isLocal(uri)) return null;
        String path = uri.getPath();
        if (path == null || path.contains("\\") || path.indexOf('\0') >= 0) return null;
        for (String part : path.split("/")) if (part.equals("..") || part.equals(".")) return null;
        return "web" + (path.equals("/") ? "/index.html" : path);
    }
    static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".wasm")) return "application/wasm";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg")) return "image/jpeg";
        if (path.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }
    WebResourceResponse load(Uri uri, String method) {
        String path = assetPath(uri);
        if (path == null || !"GET".equals(method)) return missing(403, "Forbidden");
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Cross-Origin-Opener-Policy", "same-origin");
            headers.put("Cross-Origin-Embedder-Policy", "require-corp");
            headers.put("Cross-Origin-Resource-Policy", "same-origin");
            headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'");
            String mime = mime(path);
            return new WebResourceResponse(mime, mime.startsWith("text/") ? "UTF-8" : null,
                200, "OK", headers, assets.open(path, AssetManager.ACCESS_STREAMING));
        } catch (IOException error) { return missing(404, "Not Found"); }
    }
    private static WebResourceResponse missing(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, java.util.Collections.singletonMap("Cache-Control", "no-store"),
            new ByteArrayInputStream(reason.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
