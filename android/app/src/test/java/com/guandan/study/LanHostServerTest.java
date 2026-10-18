package com.guandan.study;

import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

public class LanHostServerTest {
    private static final String TOKEN = "a".repeat(48);
    private JSONObject post(int port, String body, String headers) throws Exception {
        try (Socket socket = new Socket("127.0.0.1", port)) {
            socket.setSoTimeout(2500);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            String head = "POST /api HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\nContent-Type: application/json\r\nContent-Length: " + bytes.length + "\r\n" + headers + "\r\n";
            socket.getOutputStream().write(head.getBytes(StandardCharsets.US_ASCII));
            // Split a multibyte player name across writes as real TCP peers may do.
            for (byte b : bytes) socket.getOutputStream().write(b);
            socket.getOutputStream().flush();
            String reply = new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return new JSONObject(reply.substring(reply.indexOf("\r\n\r\n") + 4));
        }
    }
    private int port(JSONObject endpoint) throws Exception { return Integer.parseInt(endpoint.getString("address").split(":")[1]); }
    @Test(timeout=5000) public void validatesNetworkRequestsAndKeepsChineseBytes() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        try (LanHostServer host = new LanHostServer(raw -> { calls.incrementAndGet(); return raw; })) {
            int port = port(host.start());
            JSONObject reply = post(port, "{\"op\":\"join\",\"name\":\"手机甲♥\"}", "");
            assertEquals("手机甲♥", reply.getJSONObject("body").getString("name"));
            assertEquals(TOKEN, post(port, "{\"op\":\"poll\"}", "Authorization: Bearer " + TOKEN + "\r\n").getString("token"));
            assertTrue(post(port, "{\"op\":\"poll\"}", "").has("error"));
            assertTrue(post(port, "{\"op\":\"join\"}", "Origin: https://example.com\r\n").has("error"));
            assertTrue(post(port, "{}", "Transfer-Encoding: chunked\r\n").has("error"));
            assertTrue(post(port, "{}", "Content-Length: 2\r\n").has("error"));
            assertTrue(post(port, "[]", "").has("error"));
            assertEquals(2, calls.get());
            host.foreground(false);
            assertTrue(post(port, "{\"op\":\"poll\"}", "Authorization: Bearer " + TOKEN + "\r\n").getString("error").contains("后台"));
            assertEquals(2, calls.get());
            host.foreground(true);
            assertFalse(post(port, "{\"op\":\"poll\"}", "Authorization: Bearer " + TOKEN + "\r\n").has("error"));
        }
    }
    @Test(timeout=5000) public void limitsJoinAttemptsAndClosesSockets() throws Exception {
        LanHostServer host = new LanHostServer(raw -> "{}"); int port = port(host.start());
        try {
            for (int i=0;i<12;i++) assertFalse(post(port, "{\"op\":\"join\"}", "").has("error"));
            assertTrue(post(port, "{\"op\":\"join\"}", "").getString("error").contains("频繁"));
        } finally { host.close(); }
        try (ServerSocket again = new ServerSocket()) { again.setReuseAddress(true); again.bind(new InetSocketAddress("0.0.0.0", port)); }
    }
    @Test(timeout=5000) public void discoveryExposesOnlyPublicLobbyMetadata() throws Exception {
        try (LanHostServer host = new LanHostServer(raw -> "{}")) {
            JSONObject endpoint = host.start(); assertTrue(endpoint.getBoolean("discovery"));
            host.announce(new JSONObject().put("id", TOKEN).put("name", "手机房主").put("count", 2).put("started", false).put("connected", true).put("code", "123456").put("token", TOKEN).toString());
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setSoTimeout(1500); String nonce = "b".repeat(24);
                byte[] bytes = new JSONObject().put("type", "guandan-discover").put("protocol", 1).put("nonce", nonce).toString().getBytes(StandardCharsets.UTF_8);
                socket.send(new DatagramPacket(bytes, bytes.length, InetAddress.getByName("127.0.0.1"), 18766));
                DatagramPacket received = new DatagramPacket(new byte[1024], 1024); socket.receive(received);
                JSONObject reply = new JSONObject(new String(received.getData(), 0, received.getLength(), StandardCharsets.UTF_8));
                assertEquals(nonce, reply.getString("nonce")); assertEquals("手机房主", reply.getString("name"));
                assertEquals(port(endpoint), reply.getInt("port")); assertEquals(2, reply.getInt("count"));
                assertFalse(reply.has("token")); assertFalse(reply.has("code")); assertFalse(reply.has("connected"));
            }
        }
    }
}
