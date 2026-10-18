package com.guandan.study;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** HTTP/UDP transport only. The shared Room validates and masks every game response. */
final class LanHostServer implements AutoCloseable {
    interface Dispatcher { String request(String payload) throws Exception; }
    private final Dispatcher dispatcher;
    private final int preferredPort;
    private final Set<Socket> connections = ConcurrentHashMap.newKeySet();
    private final Map<String, long[]> attempts = new HashMap<>();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(6, 6, 30, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(12), task -> { Thread t = new Thread(task, "guandan-room-request"); t.setDaemon(true); return t; });
    private ServerSocket server;
    private DatagramSocket beacon;
    private volatile boolean closed, foreground = true;
    private volatile String announcement;
    private volatile long announcedAt;
    LanHostServer(Dispatcher dispatcher) { this(dispatcher, 0); }
    LanHostServer(Dispatcher dispatcher, int preferredPort) { this.dispatcher = dispatcher; this.preferredPort = preferredPort >= 1024 && preferredPort <= 65535 ? preferredPort : 0; }

    synchronized JSONObject start() throws Exception {
        if (closed) throw new IOException("牌桌已关闭，请重新开桌");
        if (server == null) {
            server = new ServerSocket(); server.setReuseAddress(true);
            try { server.bind(new InetSocketAddress("0.0.0.0", preferredPort)); }
            catch (BindException occupied) { server.close(); server = new ServerSocket(); server.bind(new InetSocketAddress("0.0.0.0", 0)); }
            Thread accept = new Thread(this::acceptLoop, "guandan-room-http"); accept.setDaemon(true); accept.start();
            try {
                beacon = new DatagramSocket(null); beacon.setReuseAddress(true); beacon.bind(new InetSocketAddress("0.0.0.0", 18766));
                Thread discovery = new Thread(this::discoveryLoop, "guandan-room-discovery"); discovery.setDaemon(true); discovery.start();
            } catch (IOException unavailable) { if (beacon != null) beacon.close(); beacon = null; }
        }
        JSONArray addresses = new JSONArray();
        for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!nic.isUp() || nic.isLoopback()) continue;
            for (InterfaceAddress entry : nic.getInterfaceAddresses()) {
                InetAddress ip = entry.getAddress();
                // Cellular/VPN /32 addresses are not reachable by nearby players.
                if (ip instanceof Inet4Address && entry.getBroadcast() != null && LanTransport.privateIP(ip.getHostAddress()))
                    addresses.put(ip.getHostAddress() + ":" + server.getLocalPort());
            }
        }
        return new JSONObject().put("address", "127.0.0.1:" + server.getLocalPort()).put("addresses", addresses).put("discovery", beacon != null);
    }
    void foreground(boolean value) { foreground = value; if (!value) announcement = null; }
    void announce(String json) throws Exception {
        if (json == null || json.length() > 1024) throw new IOException("牌桌公告无效");
        JSONObject source = new JSONObject(json);
        String id = source.optString("id"), name = source.optString("name").replaceAll("[\\p{Cntrl}]", "");
        int count = source.optInt("count");
        if (!id.matches("[a-f0-9]{48}") || count < 1 || count > 4) throw new IOException("牌桌公告无效");
        announcement = new JSONObject().put("id", id).put("name", name.substring(0, Math.min(12, name.length())))
            .put("count", count).put("started", source.optBoolean("started")).put("connected", source.optBoolean("connected")).toString();
        announcedAt = System.nanoTime();
    }
    private void acceptLoop() {
        while (!closed) {
            try {
                Socket socket = server.accept(); socket.setSoTimeout(5000); connections.add(socket);
                try { workers.execute(() -> handle(socket)); }
                catch (RejectedExecutionException busy) { connections.remove(socket); socket.close(); }
            } catch (IOException failure) { if (closed) return; }
        }
    }
    private static String line(InputStream input, long deadline, int[] budget) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (;;) {
            if (System.nanoTime() > deadline || --budget[0] < 0) throw new IOException("请求头超时或过大");
            int c = input.read(); if (c < 0) throw new EOFException("请求不完整");
            if (c == '\n') {
                byte[] value = bytes.toByteArray();
                if (value.length == 0 || value[value.length - 1] != '\r') throw new IOException("请求格式不正确");
                return new String(value, 0, value.length - 1, StandardCharsets.US_ASCII);
            }
            bytes.write(c);
        }
    }
    private synchronized boolean permitJoin(String ip) {
        long now = System.currentTimeMillis(); attempts.entrySet().removeIf(e -> now - e.getValue()[0] >= 60000);
        if (!attempts.containsKey(ip) && attempts.size() >= 256) return false;
        long[] item = attempts.computeIfAbsent(ip, key -> new long[]{now, 0}); return ++item[1] <= 12;
    }
    private void handle(Socket socket) {
        try (socket) {
            String result;
            try {
                if (!LanTransport.privateIP(socket.getInetAddress().getHostAddress())) throw new IOException("仅允许局域网访问");
                InputStream input = new BufferedInputStream(socket.getInputStream()); long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                int[] budget = {8192}; String first = line(input, deadline, budget);
                if (!first.matches("POST /api HTTP/1\\.[01]")) throw new IOException("请求格式不正确");
                Map<String, String> headers = new HashMap<>(); String entry;
                while (!(entry = line(input, deadline, budget)).isEmpty()) {
                    int colon = entry.indexOf(':'); if (colon < 1) throw new IOException("请求头无效");
                    String key = entry.substring(0, colon).toLowerCase(Locale.ROOT), value = entry.substring(colon + 1).trim();
                    if (!key.matches("[a-z0-9-]+") || headers.putIfAbsent(key, value) != null) throw new IOException("重复或无效的请求头");
                }
                String host = headers.getOrDefault("host", "");
                if (!host.matches("[0-9.]+:[0-9]+") || !LanTransport.privateIP(host.split(":")[0])) throw new IOException("仅允许局域网地址");
                if (headers.containsKey("origin") && !headers.get("origin").equals("http://" + host)) throw new IOException("跨站请求已拒绝");
                if (!headers.getOrDefault("content-type", "").startsWith("application/json") || headers.containsKey("transfer-encoding")) throw new IOException("请求格式不正确");
                String rawLength = headers.getOrDefault("content-length", "");
                if (!rawLength.matches("[0-9]{1,5}")) throw new IOException("请求长度无效");
                int length = Integer.parseInt(rawLength); if (length < 2 || length > 32768) throw new IOException("请求过大");
                byte[] bytes = new byte[length]; int offset = 0;
                while (offset < length) {
                    if (System.nanoTime() > deadline) throw new IOException("请求超时");
                    int count = input.read(bytes, offset, length - offset); if (count < 0) throw new EOFException("请求不完整"); offset += count;
                }
                JSONObject body = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                String auth = headers.getOrDefault("authorization", "");
                if ("join".equals(body.optString("op"))) {
                    if (!permitJoin(socket.getInetAddress().getHostAddress())) throw new IOException("尝试过于频繁，请一分钟后再试");
                } else if (!auth.matches("Bearer [a-f0-9]{48}")) throw new IOException("房间身份失效，请重新加入");
                if (closed) throw new IOException("房主暂不可用，请重新连接");
                if (!foreground) throw new IOException("房主已切到后台，请等待房主返回游戏");
                result = dispatcher.request(new JSONObject().put("token", auth.startsWith("Bearer ") ? auth.substring(7) : "").put("body", body).toString());
                if (result == null || result.length() > 4000000) throw new IOException("房间响应过大");
            } catch (Exception failure) { result = error(failure.getMessage()); }
            byte[] body = result.getBytes(StandardCharsets.UTF_8);
            OutputStream output = socket.getOutputStream();
            output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            output.write(body); output.flush();
        } catch (IOException ignored) { /* Peer may disconnect while waiting for model inference. */ }
        finally { connections.remove(socket); }
    }
    static String error(String message) {
        return "{\"error\":" + JSONObject.quote(message == null ? "牌桌处理失败，请重试" : message) + "}";
    }
    private void discoveryLoop() {
        Map<String, Long> seen = new HashMap<>();
        while (!closed && beacon != null && !beacon.isClosed()) {
            try {
                DatagramPacket packet = new DatagramPacket(new byte[257], 257); beacon.receive(packet);
                String cached = announcement, ip = packet.getAddress().getHostAddress();
                if (!foreground || cached == null || System.nanoTime() - announcedAt > TimeUnit.SECONDS.toNanos(12) || packet.getLength() > 256 || !LanTransport.privateIP(ip)) continue;
                JSONObject query = new JSONObject(new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8));
                String nonce = query.optString("nonce");
                if (!"guandan-discover".equals(query.optString("type")) || query.optInt("protocol") != 1 || !nonce.matches("[a-f0-9]{24}")) continue;
                long now = System.currentTimeMillis(); seen.entrySet().removeIf(e -> now - e.getValue() > 5000);
                if (now - seen.getOrDefault(ip, 0L) < 200 || seen.size() >= 256) continue; seen.put(ip, now);
                JSONObject reply = new JSONObject(cached); if (!reply.optBoolean("connected")) continue; reply.remove("connected");
                reply.put("type", "guandan-room").put("protocol", 1).put("nonce", nonce).put("port", server.getLocalPort());
                byte[] bytes = reply.toString().getBytes(StandardCharsets.UTF_8); beacon.send(new DatagramPacket(bytes, bytes.length, packet.getAddress(), packet.getPort()));
            } catch (Exception ignored) { if (closed) return; }
        }
    }
    @Override public synchronized void close() {
        if (closed) return; closed = true; announcement = null;
        if (beacon != null) beacon.close();
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        for (Socket socket : connections) try { socket.close(); } catch (IOException ignored) { }
        connections.clear(); workers.shutdownNow();
    }
}
