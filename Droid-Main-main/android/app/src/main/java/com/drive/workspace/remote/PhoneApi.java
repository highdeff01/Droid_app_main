package com.drive.workspace.remote;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class PhoneApi {
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("connection", Context.MODE_PRIVATE); }
    static JSONObject post(Context context, String route, JSONObject body) throws Exception {
        return request(prefs(context).getString("server", ""), prefs(context).getString("token", ""), route, "application/json", body.toString().getBytes(StandardCharsets.UTF_8));
    }
    static JSONObject get(Context context, String route) throws Exception {
        return request(prefs(context).getString("server", ""), prefs(context).getString("token", ""), route, "application/json", null);
    }
    static JSONObject request(String server, String token, String route, String type, byte[] body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(server + "/api/phone" + route).openConnection();
        connection.setRequestMethod(body == null ? "GET" : "POST"); connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
        connection.setInstanceFollowRedirects(false); connection.setDoOutput(body != null);
        connection.setRequestProperty("Content-Type", type);
        if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) connection.setFixedLengthStreamingMode(body.length);
        try {
            if (body != null) try (OutputStream out = connection.getOutputStream()) { out.write(body); }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = "";
            if (stream != null) try (InputStream in = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) { byte[] buffer = new byte[8192]; int count; while ((count = in.read(buffer)) != -1) bytes.write(buffer, 0, count); text = bytes.toString("UTF-8"); }
            JSONObject result = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            if (status == 401) throw new RevokedException(result.optString("error", "Connection revoked"));
            if (status < 200 || status >= 300) throw new ServerException(result.optString("error", "Server returned " + status));
            return result;
        } finally { connection.disconnect(); }
    }
    static class RevokedException extends IOException { RevokedException(String message) { super(message); } }
    /** The server answered with an error; distinct from a network failure where it was never reached. */
    static class ServerException extends IOException { ServerException(String message) { super(message); } }
}
