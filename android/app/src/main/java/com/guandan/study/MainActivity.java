package com.guandan.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import android.net.wifi.WifiManager;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int EXPORT = 41;
    // UI callbacks run on the main thread. Route completion from an old Activity
    // to its replacement without retaining destroyed WebViews.
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private static final ArrayDeque<String> unclaimedNotices = new ArrayDeque<>();
    private WebView web;
    private volatile boolean phoneDevice;
    private volatile boolean foreground;
    private volatile LanHostServer hostServer;
    private WifiManager.MulticastLock hostMulticast;
    private final AtomicInteger hostSequence = new AtomicInteger();
    private final ConcurrentHashMap<Integer, CompletableFuture<String>> hostRequests = new ConcurrentHashMap<>();
    private boolean exportPending;
    private boolean pickerOpen;
    private boolean pageReady;
    private File exportFile;
    private final ArrayDeque<String> notices = new ArrayDeque<>();
    private final ExecutorService network = Executors.newFixedThreadPool(3);
    private final ExecutorService files = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        applyDeviceLayout();
        android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
        int webVersion = 0;
        try { webVersion = Integer.parseInt(provider.versionName.split("\\.")[0]); } catch (Exception ignored) { }
        if (webVersion < 120) {
            new AlertDialog.Builder(this).setTitle("请先更新系统网页组件")
                .setMessage("本应用需要 Android System WebView 120 或更新版本，以运行离线模型和复盘。请在系统中更新 WebView 后重新打开。")
                .setCancelable(false).setPositiveButton("退出", (dialog, which) -> finish()).show();
            return;
        }
        current = new WeakReference<>(this);
        if (state != null && state.getString("exportPath") != null) exportFile = new File(state.getString("exportPath"));
        exportPending = state != null && state.getBoolean("exportPending") && exportFile != null;
        pickerOpen = exportPending;
        if (state != null && state.getStringArrayList("notices") != null) notices.addAll(state.getStringArrayList("notices"));
        notices.addAll(unclaimedNotices); unclaimedNotices.clear();
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(23, 67, 52));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(23, 67, 52));
        web.setKeepScreenOn(true);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                int handledTypes = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard.bottom));
                // The native frame already reserves these areas. Forward zeroes
                // so WebView cannot apply the cutout/keyboard padding a second
                // time. Keep dispatching updates when rotation or the IME changes;
                // returning CONSUMED can leave a previous web inset stuck on screen.
                return new WindowInsets.Builder(insets).setInsets(handledTypes, Insets.NONE).build();
            });
        }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(settings.getUserAgentString() + " GuandanAndroid/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        LocalAssets assets = new LocalAssets(getAssets());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (!notices.isEmpty()) {
                    String message = notices.removeLast(); notices.clear(); notice(message);
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.load(request.getUrl(), request.getMethod());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (LocalAssets.isLocal(uri) && uri.getPath() != null && uri.getPath().endsWith(".txt")) {
                    showLicense(uri); return true;
                }
                // All navigation stays in the packaged app; exports use the document picker.
                return !LocalAssets.isLocal(uri) || !"/index.html".equals(uri.getPath());
            }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return assets.load(request.getUrl(), request.getMethod());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR)
                    Log.e("GuandanWeb", message.message() + " @ " + message.lineNumber());
                return true;
            }
        });
        web.addJavascriptInterface(new ExportBridge(), "GuandanPadNative");
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
        web.loadUrl(LocalAssets.ORIGIN + "/index.html");
        immersive();
    }

    private void applyDeviceLayout() {
        // Physical display space, not the current window or keyboard height:
        // a tablet in split screen must not suddenly become a locked phone.
        float density = getResources().getDisplayMetrics().density;
        int shortSide;
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Rect bounds = getWindowManager().getMaximumWindowMetrics().getBounds();
            shortSide = Math.min(bounds.width(), bounds.height());
        } else {
            android.util.DisplayMetrics display = new android.util.DisplayMetrics();
            getWindowManager().getDefaultDisplay().getRealMetrics(display);
            shortSide = Math.min(display.widthPixels, display.heightPixels);
        }
        phoneDevice = shortSide / density < 600;
        int orientation = phoneDevice ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        if (getRequestedOrientation() != orientation) setRequestedOrientation(orientation);
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyDeviceLayout();
        if (web != null) web.evaluateJavascript("window.GuandanPhone?.refresh()", null);
        immersive();
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else getWindow().getDecorView().setSystemUiVisibility(5894);
    }
    private void handleBack() {
        if (web == null) { moveTaskToBack(true); return; }
        web.evaluateJavascript("Boolean(window.guandanPad && window.guandanPad.back())", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() {
        foreground = false; if (hostServer != null) hostServer.foreground(false);
        if (web != null) { web.evaluateJavascript("window.guandanPad?.suspend()", null); web.onPause(); }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        foreground = true; if (hostServer != null) hostServer.foreground(true);
        if (web != null) { web.onResume(); web.evaluateJavascript("window.guandanPad?.resume()", null); immersive(); }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("exportPending", pickerOpen);
        if (pickerOpen && exportFile != null) state.putString("exportPath", exportFile.getAbsolutePath());
        state.putStringArrayList("notices", new java.util.ArrayList<>(notices));
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        stopHost();
        if (web != null) { web.removeJavascriptInterface("GuandanPadNative"); web.destroy(); }
        if (current.get() == this) current.clear();
        files.shutdown(); network.shutdownNow();
        super.onDestroy();
    }
    private void notice(String message) {
        if (isDestroyed() || current.get() != this) {
            MainActivity replacement = current.get();
            if (replacement != null && !replacement.isDestroyed()) replacement.notice(message);
            else unclaimedNotices.add(message);
            return;
        }
        if (!pageReady) { notices.add(message); return; }
        web.evaluateJavascript("window.guandanPad?.notice(" + JSONObject.quote(message) + ")", null);
    }
    private String hostRequest(String payload) throws Exception {
        int id = hostSequence.incrementAndGet();
        CompletableFuture<String> response = new CompletableFuture<>(); hostRequests.put(id, response);
        try {
            runOnUiThread(() -> {
                if (isDestroyed() || web == null || !foreground) response.completeExceptionally(new IllegalStateException("房主已切到后台"));
                else web.evaluateJavascript("window.GuandanAndroidHost?.dispatch(" + id + "," + JSONObject.quote(payload) + ")", null);
            });
            return response.get(96, TimeUnit.SECONDS);
        } catch (java.util.concurrent.TimeoutException timeout) { throw new java.io.IOException("房主响应超时，请重新连接"); }
        finally { hostRequests.remove(id); }
    }
    private synchronized String startHost() {
        try {
            if (isDestroyed() || !foreground) throw new java.io.IOException("请回到游戏再开桌");
            if (hostServer == null) hostServer = new LanHostServer(this::hostRequest, getSharedPreferences("lan-host", MODE_PRIVATE).getInt("port", 0));
            JSONObject endpoint = hostServer.start();
            if (endpoint.getJSONArray("addresses").length() == 0) throw new java.io.IOException("未找到局域网地址，请连接 Wi-Fi 或开启热点后重试");
            int port = Integer.parseInt(endpoint.getString("address").split(":")[1]);
            getSharedPreferences("lan-host", MODE_PRIVATE).edit().putInt("port", port).apply();
            if (hostMulticast == null) {
                try {
                    WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                    hostMulticast = wifi.createMulticastLock("guandan-room"); hostMulticast.setReferenceCounted(false); hostMulticast.acquire();
                } catch (RuntimeException ignored) { hostMulticast = null; }
            }
            return endpoint.toString();
        } catch (Exception error) { stopHost(); return LanHostServer.error(error.getMessage()); }
    }
    private synchronized void stopHost() {
        if (hostServer != null) { hostServer.close(); hostServer = null; }
        if (hostMulticast != null) { if (hostMulticast.isHeld()) hostMulticast.release(); hostMulticast = null; }
        for (CompletableFuture<String> response : hostRequests.values()) response.completeExceptionally(new IllegalStateException("牌桌已关闭"));
        hostRequests.clear();
    }
    public final class ExportBridge {
        @JavascriptInterface public String hostStart() { return startHost(); }
        @JavascriptInterface public void hostStop() { stopHost(); }
        @JavascriptInterface public void hostAnnounce(String json) {
            synchronized (MainActivity.this) {
                if (hostServer != null) try { hostServer.announce(json); } catch (Exception ignored) { }
            }
        }
        @JavascriptInterface public void hostReply(int id, String result) {
            CompletableFuture<String> response = hostRequests.get(id);
            if (response != null) {
                if (result == null || result.length() > 4000000) response.completeExceptionally(new IllegalArgumentException("房间响应无效"));
                else response.complete(result);
            }
        }
        @JavascriptInterface public String deviceKind() { return phoneDevice ? "phone" : "tablet"; }

        @JavascriptInterface public void lanRequest(int requestId, String raw) {
            if (raw == null || raw.length() > 32768 || network.isShutdown()) return;
            network.execute(() -> {
                String response;
                try { response = LanTransport.request(raw); }
                catch (Exception error) {
                    JSONObject failure = new JSONObject();
                    try { failure.put("error", error.getMessage() == null ? "无法连接房主，请检查 Wi-Fi 和房间地址" : error.getMessage()); } catch (Exception ignored) { }
                    response = failure.toString();
                }
                final String result = response;
                runOnUiThread(() -> { if (!isDestroyed() && web != null) web.evaluateJavascript("window.GuandanLanReply?.(" + requestId + "," + JSONObject.quote(result) + ")", null); });
            });
        }

        @JavascriptInterface public void exportText(String filename, String text) {
            if (filename == null || text == null || text.length() > 12_000_000) {
                runOnUiThread(() -> notice("导出内容过大，请稍后重试。")); return;
            }
            runOnUiThread(() -> {
                if (isDestroyed() || isFinishing()) return;
                if (exportPending) { notice("请先完成正在进行的导出。"); return; }
                exportPending = true;
                files.execute(() -> {
                    try {
                        File prepared = File.createTempFile("guandan-export-", ".txt", getCacheDir());
                        Files.write(prepared.toPath(), text.getBytes(StandardCharsets.UTF_8));
                        runOnUiThread(() -> {
                            if (isDestroyed() || isFinishing()) {
                                prepared.delete(); notice("导出准备已中断，请重新导出。"); return;
                            }
                            try {
                                exportFile = prepared;
                                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                                intent.addCategory(Intent.CATEGORY_OPENABLE);
                                intent.setType(filename.endsWith(".json") ? "application/json" : "text/plain");
                                String safeName = filename.replaceAll("[/\\\\\\p{Cntrl}]", "_");
                                intent.putExtra(Intent.EXTRA_TITLE, safeName.substring(0, Math.min(safeName.length(), 120)));
                                pickerOpen = true;
                                startActivityForResult(intent, EXPORT);
                            } catch (Exception error) {
                                pickerOpen = false; exportPending = false; prepared.delete(); notice("无法打开保存位置，请重试。");
                            }
                        });
                    } catch (Exception error) {
                        runOnUiThread(() -> { exportPending = false; notice("无法准备导出文件，请检查本机剩余空间。"); });
                    }
                });
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT) return;
        pickerOpen = false;
        final File source = exportFile; exportFile = null;
        if (result != RESULT_OK || data == null || data.getData() == null) {
            exportPending = false; if (source != null) files.execute(source::delete); notice("已取消导出。"); return;
        }
        if (source == null) { exportPending = false; notice("导出内容已失效，请重新导出。"); return; }
        exportPending = true;
        Uri destination = data.getData();
        notice("正在保存文件…");
        files.execute(() -> {
            String message;
            try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                if (output == null) throw new java.io.IOException("No output stream");
                Files.copy(source.toPath(), output);
                message = "已保存到你选择的位置。";
            } catch (Exception error) { message = "文件保存失败，请重新导出。"; }
            String feedback = message;
            source.delete();
            runOnUiThread(() -> { exportPending = false; notice(feedback); });
        });
    }
    private void showLicense(Uri uri) {
        String path = LocalAssets.assetPath(uri);
        if (path == null) return;
        try (java.io.InputStream input = getAssets().open(path)) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) buffer.write(chunk, 0, count);
            String text = buffer.toString("UTF-8");
            new AlertDialog.Builder(this).setTitle("许可与来源").setMessage(text).setPositiveButton("返回", null).show();
        } catch (Exception error) { Toast.makeText(this, "无法读取说明文件", Toast.LENGTH_SHORT).show(); }
    }
}
