package com.drive.workspace.remote;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;

final class RecordingStore {
    static File directory(Context context) {
        File dir = new File(context.getFilesDir(), "recordings");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Cannot create recording directory");
        return dir;
    }
    static File video(Context context, String id) {
        if (!id.matches("[a-f0-9-]{36}") || !UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Invalid recording ID");
        return new File(directory(context), id + ".mp4");
    }
    static synchronized void save(Context context, JSONObject record) throws Exception {
        File file = new File(directory(context), record.getString("id") + ".json");
        File tmp = new File(directory(context), record.getString("id") + ".tmp");
        Files.write(tmp.toPath(), record.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
    static synchronized JSONArray list(Context context) {
        JSONArray result = new JSONArray();
        File[] files = directory(context).listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return result;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File file : files) {
            try {
                JSONObject record = new JSONObject(new String(Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8));
                if ((record.optString("state").equals("recording") || record.optString("state").equals("stopping")) && !ScreenCaptureService.isRecording(record.getString("id"))) {
                    record.put("state", "failed").put("error", "Android ended recording before it could be finalized").put("stoppedAt", System.currentTimeMillis());
                    save(context, record);
                }
                result.put(record);
            } catch (Exception ignored) { /* A damaged sidecar does not hide other recordings. */ }
        }
        return result;
    }
}
