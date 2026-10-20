package com.drive.workspace.remote;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.hardware.display.*;
import android.media.MediaRecorder;
import android.media.projection.*;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import org.json.*;
import java.io.*;
import java.util.UUID;

/** Android owns capture; Activity/WebView lifetime has no effect on the recorder. */
public class ScreenCaptureService extends Service {
    static final String START = "start", STOP = "stop", RECORD = "record", STOP_RECORD = "stop-record";
    private static volatile ScreenCaptureService active;
    private static volatile String activeRecordId;
    private final Handler main = new Handler(Looper.getMainLooper());
    private HandlerThread networkThread;
    private Handler network;
    private MediaProjection projection;
    private VirtualDisplay display;
    private MediaRecorder recorder;
    private JSONObject recording;
    private volatile int screenWidth, screenHeight;
    private volatile boolean closed, networkRevoked, screenshotPending;
    private int density, captureWidth, captureHeight;
    private boolean shuttingDown;
    static boolean isRecording(String id) { return id.equals(activeRecordId); }
    static boolean isSharing() { return active != null; }
    static String status(Context context) { return PhoneApi.prefs(context).getString("status", "Disconnected"); }
    private void status(String text) { PhoneApi.prefs(this).edit().putString("status", text).apply(); }

    public void onCreate() {
        super.onCreate(); active = this;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("capture", "Phone screen sharing and recording", NotificationManager.IMPORTANCE_LOW));
        networkThread = new HandlerThread("phone-network"); networkThread.start(); network = new Handler(networkThread.getLooper());
    }
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (STOP.equals(action)) { stopSelf(); return START_NOT_STICKY; }
        if (STOP_RECORD.equals(action)) { stopRecording(null); return START_NOT_STICKY; }
        if (RECORD.equals(action)) {
            try { startRecording(intent.getIntExtra("minutes", 10)); } catch (Exception error) { status(error.getMessage()); }
            return START_NOT_STICKY;
        }
        if (!START.equals(action) || projection != null) return START_NOT_STICKY;
        try {
            startForeground(101, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            Intent consent = intent.getParcelableExtra("consent");
            if (consent == null || intent.getIntExtra("result", 0) != Activity.RESULT_OK) throw new IllegalArgumentException("Screen capture consent is required");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(Activity.RESULT_OK, consent);
            projection.registerCallback(new MediaProjection.Callback() {
                public void onStop() { if (!shuttingDown) { stopRecording("Android stopped screen capture"); stopSelf(); } }
                public void onCapturedContentResize(int width, int height) {
                    if (screenWidth != 0 && (captureWidth != width || captureHeight != height)) stopRecording("Display size changed; recording saved. Start a new recording in this orientation.");
                }
            }, main);
            status("Sharing started. Enable accessibility for mirroring and control.");
            if (intent.getBooleanExtra("record", false)) startRecording(intent.getIntExtra("minutes", 10));
            network.post(poll);
        } catch (Exception error) { status("Cannot start capture: " + error.getMessage()); stopSelf(); }
        // A killed projection cannot be recreated using an old consent token.
        return START_NOT_STICKY;
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, ScreenCaptureService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = new Notification.Builder(this, "capture").setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle(recorder == null ? "Sightline screen sharing" : "Sightline recording full phone")
            .setContentText(recorder == null ? "Paired server can view and control your screen. Tap Stop to disconnect." : "Video is saved on this phone. Recording continues across apps.")
            .setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop", stop).build());
        if (recorder != null) {
            PendingIntent save = PendingIntent.getService(this, 3, new Intent(this, ScreenCaptureService.class).setAction(STOP_RECORD), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            builder.addAction(new Notification.Action.Builder(null, "Stop recording", save).build());
        }
        return builder.build();
    }
    private void updateNotification() { getSystemService(NotificationManager.class).notify(101, notification()); }
    private void metrics() {
        DisplayMetrics size = new DisplayMetrics(); getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(size);
        screenWidth = size.widthPixels; screenHeight = size.heightPixels; density = size.densityDpi;
    }
    private JSONObject startRecording(int minutes) throws Exception {
        if (projection == null) throw new IllegalStateException("Start sharing and approve screen capture on the phone first");
        if (recorder != null) throw new IllegalStateException("Already recording");
        if (minutes < 1 || minutes > 60) throw new IllegalArgumentException("Limit must be 1–60 minutes");
        if (RecordingStore.directory(this).getUsableSpace() < 100 * 1024 * 1024L) throw new IOException("Free at least 100 MB on the phone");
        metrics(); captureWidth = screenWidth; captureHeight = screenHeight;
        String id = UUID.randomUUID().toString();
        recording = new JSONObject().put("id", id).put("state", "recording").put("startedAt", System.currentTimeMillis()).put("segments", 0).put("storage", "phone");
        activeRecordId = id;
        try {
            recorder = new MediaRecorder(); recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4); recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            // Bound encoding resolution without changing the full-display capture coordinates.
            double scale = Math.min(1.0, 1920.0 / Math.max(screenWidth, screenHeight));
            int width = Math.max(2, ((int) (screenWidth * scale) / 2) * 2), height = Math.max(2, ((int) (screenHeight * scale) / 2) * 2);
            recorder.setVideoSize(width, height); recorder.setVideoFrameRate(30); recorder.setVideoEncodingBitRate(6000000);
            recorder.setOutputFile(RecordingStore.video(this, id).getAbsolutePath()); recorder.setMaxDuration(minutes * 60000);
            recorder.setMaxFileSize(Math.max(1, RecordingStore.directory(this).getUsableSpace() - 50 * 1024 * 1024L));
            recorder.setOnInfoListener((source, what, extra) -> { if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) main.post(() -> stopRecording(null)); });
            recorder.setOnErrorListener((source, what, extra) -> main.post(() -> stopRecording("Android encoder error " + what)));
            recorder.prepare();
            // Android 14 permits a single VirtualDisplay per projection; reuse it with a new Surface.
            if (display == null) display = projection.createVirtualDisplay("Sightline recording", width, height, density, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, recorder.getSurface(), null, main);
            else { display.resize(width, height, density); display.setSurface(recorder.getSurface()); }
            recorder.start(); RecordingStore.save(this, recording);
            status("Recording full display. Leave the app to capture other phone apps."); updateNotification();
            main.postDelayed(recordingLimit, minutes * 60000L);
            return new JSONObject(recording.toString());
        } catch (Exception error) { stopRecording("Cannot start recording: " + error.getMessage()); throw error; }
    }
    private final Runnable recordingLimit = () -> stopRecording(null);
    private void stopRecording(String reason) {
        main.removeCallbacks(recordingLimit);
        if (recorder == null) return;
        String failure = reason;
        boolean saved = false;
        try {
            recorder.stop();
            saved = RecordingStore.video(this, recording.getString("id")).length() > 32;
            if (!saved) failure = "The phone returned an empty video";
        } catch (Exception error) { failure = error.getMessage(); }
        finally {
            if (display != null) display.setSurface(null);
            recorder.release(); recorder = null;
            try {
                recording.put("state", saved ? "complete" : "failed").put("stoppedAt", System.currentTimeMillis()).put("segments", saved ? 1 : 0);
                if (failure != null) recording.put("error", failure);
                RecordingStore.save(this, recording);
            } catch (Exception error) { status("Could not save video metadata: " + error.getMessage()); }
            activeRecordId = null;
            status(saved ? "Video saved on phone. Open Saved recordings to share it." : "Recording failed: " + failure);
            if (!closed) { updateNotification(); if (networkRevoked) stopSelf(); }
        }
    }
    private final Runnable poll = new Runnable() {
        public void run() {
            if (closed || networkRevoked) return;
            try {
                if (!PhoneApi.prefs(ScreenCaptureService.this).getString("token", "").isEmpty()) {
                    JSONArray all = RecordingStore.list(ScreenCaptureService.this), recent = new JSONArray();
                    for (int i = Math.max(0, all.length() - 50); i < all.length(); i++) recent.put(all.get(i));
                    JSONObject response = PhoneApi.post(ScreenCaptureService.this, "/native/poll", new JSONObject().put("controlEnabled", PhoneAccessibilityService.current() != null).put("recordings", recent));
                    JSONObject command = response.optJSONObject("command");
                    if (command != null) {
                        long deadline = SystemClock.elapsedRealtime() + command.optLong("ttlMs", 0);
                        main.post(() -> handleCommand(command, deadline));
                    }
                    if (!screenshotPending) main.post(() -> captureScreen());
                }
            } catch (PhoneApi.RevokedException error) {
                networkRevoked = true; status("Server connection revoked. A local recording continues until Stop or its limit.");
                // Stop sharing after revocation; preserve the local recording explicitly requested by the user.
                main.post(() -> { if (recorder == null) stopSelf(); });
            } catch (Exception error) { status("Server unavailable: " + error.getMessage() + ". Local recording continues."); }
            if (!closed && !networkRevoked) network.postDelayed(this, 1000);
        }
    };
    private void captureScreen() {
        PhoneAccessibilityService service = PhoneAccessibilityService.current();
        if (service == null || screenshotPending || closed || networkRevoked) return;
        screenshotPending = true;
        service.screenshot(bitmap -> {
            screenWidth = bitmap.getWidth(); screenHeight = bitmap.getHeight();
            network.post(() -> {
                Bitmap scaled = null;
                try {
                    double scale = Math.min(1.0, 1280.0 / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                    scaled = Bitmap.createScaledBitmap(bitmap, Math.max(1, (int)(bitmap.getWidth() * scale)), Math.max(1, (int)(bitmap.getHeight() * scale)), true);
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream(); scaled.compress(Bitmap.CompressFormat.PNG, 100, bytes);
                    if (!closed && !networkRevoked) PhoneApi.request(PhoneApi.prefs(this).getString("server", ""), PhoneApi.prefs(this).getString("token", ""), "/native/frame", "image/png", bytes.toByteArray());
                } catch (PhoneApi.RevokedException error) { networkRevoked = true; }
                catch (Exception error) { status("Mirror upload failed: " + error.getMessage()); }
                finally { if (scaled != null && scaled != bitmap) scaled.recycle(); bitmap.recycle(); screenshotPending = false; }
            });
        }, error -> { screenshotPending = false; status(error); });
    }
    private void handleCommand(JSONObject command, long deadline) {
        String id = command.optString("id");
        if (closed || networkRevoked || deadline <= SystemClock.elapsedRealtime()) { acknowledge(id, "Command expired; refresh and try again", null); return; }
        try {
            switch (command.getString("type")) {
                case "action":
                    PhoneAccessibilityService service = PhoneAccessibilityService.current();
                    if (service == null) throw new IllegalStateException("Enable accessibility on the phone");
                    service.execute(command.getJSONObject("action"), screenWidth, screenHeight, error -> acknowledge(id, error, null));
                    break;
                case "record-start": acknowledge(id, null, startRecording(command.getInt("minutes"))); break;
                case "record-stop": stopRecording(null); acknowledge(id, null, null); break;
                default: throw new IllegalArgumentException("Unknown command");
            }
        } catch (Exception error) { acknowledge(id, error.getMessage(), null); }
    }
    private void acknowledge(String id, String error, JSONObject result) {
        network.post(() -> {
            try {
                JSONObject body = new JSONObject().put("id", id).put("success", error == null).put("result", result == null ? JSONObject.NULL : result);
                if (error != null) body.put("error", error);
                PhoneApi.post(this, "/native/result", body);
            }
            catch (Exception failure) { status("Operation completed but server acknowledgment failed. Check the phone before retrying."); }
        });
    }
    public void onDestroy() {
        closed = true; shuttingDown = true;
        stopRecording(null);
        if (display != null) { display.release(); display = null; }
        if (projection != null) { projection.stop(); projection = null; }
        if (network != null) network.removeCallbacksAndMessages(null);
        if (networkThread != null) networkThread.quitSafely();
        if (active == this) active = null;
        super.onDestroy();
    }
    public IBinder onBind(Intent intent) { return null; }
}
