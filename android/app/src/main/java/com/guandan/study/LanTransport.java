package com.guandan.study;

import java.net.HttpURLConnection;
import java.net.URL;
import java.net.DatagramSocket;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.net.InterfaceAddress;
import java.net.SocketTimeoutException;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;

/** Narrow native LAN transport; packaged WebView content still has no network fallback. */
final class LanTransport {
    private static boolean privateIP(String value) {
        if (!value.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return false;
        String[] parts = value.split("\\."); int[] ip = new int[4];
        for (int i = 0; i < 4; i++) { ip[i] = Integer.parseInt(parts[i]); if (ip[i] > 255) return false; }
        return ip[0] == 10 || ip[0] == 192 && ip[1] == 168 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] == 127;
    }
    private static String discover() throws Exception {
        String nonce = UUID.randomUUID().toString().replace("-", "").substring(0, 24);
        byte[] query = new JSONObject().put("type", "guandan-discover").put("protocol", 1).put("nonce", nonce).toString().getBytes(StandardCharsets.UTF_8);
        LinkedHashSet<InetAddress> targets = new LinkedHashSet<>();
        targets.add(InetAddress.getByName("255.255.255.255"));
        for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!nic.isUp() || nic.isLoopback()) continue;
            for (InterfaceAddress address : nic.getInterfaceAddresses()) {
                if (address.getAddress() instanceof Inet4Address && privateIP(address.getAddress().getHostAddress()) && address.getBroadcast() != null) targets.add(address.getBroadcast());
            }
        }
        LinkedHashMap<String, JSONObject> rooms = new LinkedHashMap<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true); socket.setSoTimeout(200);
            long start = System.nanoTime(), lastSend = 0;
            while ((System.nanoTime() - start) / 1_000_000 < 1300) {
                long elapsed = (System.nanoTime() - start) / 1_000_000;
                if (lastSend == 0 || lastSend == 1 && elapsed >= 400) {
                    int sent = 0;
                    for (InetAddress target : targets) {
                        if (++sent > 16) break;
                        try { socket.send(new DatagramPacket(query, query.length, target, 18766)); } catch (java.io.IOException ignored) { }
                    }
                    lastSend++;
                }
                byte[] buffer = new byte[1025]; DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try { socket.receive(packet); } catch (SocketTimeoutException ignored) { continue; }
                if (packet.getLength() > 1024 || !privateIP(packet.getAddress().getHostAddress()) || rooms.size() >= 16) continue;
                try {
                    JSONObject room = new JSONObject(new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8));
                    int port = room.optInt("port"), count = room.optInt("count"); String id = room.optString("id");
                    if (!"guandan-room".equals(room.optString("type")) || room.optInt("protocol") != 1 || !nonce.equals(room.optString("nonce")) || !id.matches("[a-f0-9]{48}") || port < 1024 || port > 65535 || count < 1 || count > 4) continue;
                    String name = room.optString("name", "朋友");
                    rooms.put(id, new JSONObject().put("id", id).put("address", packet.getAddress().getHostAddress() + ":" + port)
                        .put("name", name.substring(0, Math.min(12, name.length()))).put("count", count).put("started", room.optBoolean("started")));
                } catch (org.json.JSONException ignored) { }
            }
        }
        return new JSONObject().put("rooms", new JSONArray(rooms.values())).toString();
    }
    static String request(String raw) throws Exception {
        JSONObject payload = new JSONObject(raw);
        if ("discover".equals(payload.optString("action"))) return discover();
        if (!"request".equals(payload.optString("action"))) throw new Exception("Pad 请加入 Mac 创建的房间");
        String address = payload.getString("address");
        if (!address.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}:[0-9]{1,5}")) throw new Exception("请输入 Mac 显示的地址和端口");
        String[] parts = address.split(":"), octets = parts[0].split("\\.");
        int[] ip = new int[4];
        for (int i = 0; i < 4; i++) { ip[i] = Integer.parseInt(octets[i]); if (ip[i] > 255 || !Integer.toString(ip[i]).equals(octets[i])) throw new Exception("地址格式不正确"); }
        int port = Integer.parseInt(parts[1]);
        boolean local = ip[0] == 10 || ip[0] == 192 && ip[1] == 168 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] == 127;
        if (!local || port < 1024 || port > 65535) throw new Exception("仅支持局域网地址");
        String token = payload.optString("token", "");
        if (!token.isEmpty() && !token.matches("[a-f0-9]{48}")) throw new Exception("房间身份失效，请重新加入");
        byte[] bytes = payload.getJSONObject("body").toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = (HttpURLConnection) new URL("http://" + address + "/api").openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(5000); connection.setReadTimeout(100000);
        connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + token); connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
        try {
            try (java.io.OutputStream stream = connection.getOutputStream()) { stream.write(bytes); }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new Exception("不接受房间地址重定向");
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) throw new Exception("Mac 房间没有响应");
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int size;
                while ((size = input.read(buffer)) != -1) { if (output.size() + size > 4000000) throw new Exception("房间响应过大"); output.write(buffer, 0, size); }
                String result = output.toString("UTF-8"); new JSONObject(result); return result;
            }
        } finally { connection.disconnect(); }
    }
}
