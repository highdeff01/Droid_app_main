package com.drive.workspace.remote;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.media.projection.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.widget.*;
import org.json.*;
import java.net.URI;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private EditText link, minutes;
    private TextView status;
    private Button connect;
    private boolean pendingRecord;
    private int pendingMinutes;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        public void run() {
            status.setText(ScreenCaptureService.status(MainActivity.this) + "\nAccessibility: " + (PhoneAccessibilityService.current() == null ? "disabled" : "enabled"));
            main.postDelayed(this, 1500);
        }
    };
    public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32, 48, 32, 32);
        ScrollView scroll = new ScrollView(this); scroll.addView(layout); setContentView(scroll);
        TextView title = new TextView(this); title.setText("Sightline Remote"); title.setTextSize(26); layout.addView(title);
        TextView help = new TextView(this); help.setText("Connect to your server using its desktop QR link. Accessibility shares the full display and executes approved actions. Record full phone saves video locally and continues when you switch apps. No audio is captured."); layout.addView(help);
        link = new EditText(this); link.setHint("Paste QR link from desktop"); link.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); layout.addView(link);
        connect = button(layout, "Connect QR link", this::connect);
        button(layout, "Enable accessibility for mirror and control", () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        button(layout, "Start sharing", () -> requestCapture(false));
        minutes = new EditText(this); minutes.setHint("Recording limit, 1–60 minutes"); minutes.setText("10"); minutes.setInputType(InputType.TYPE_CLASS_NUMBER); layout.addView(minutes);
        button(layout, "Record full phone", () -> requestCapture(true));
        button(layout, "Stop recording and save", () -> { if (ScreenCaptureService.isSharing()) startService(new Intent(this, ScreenCaptureService.class).setAction(ScreenCaptureService.STOP_RECORD)); });
        button(layout, "Stop sharing and recording", () -> stopService(new Intent(this, ScreenCaptureService.class)));
        button(layout, "Saved recordings / Share video", this::saved);
        status = new TextView(this); layout.addView(status);
        acceptLink(getIntent());
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2);
    }
    private Button button(LinearLayout layout, String label, Runnable work) {
        Button button = new Button(this); button.setText(label); button.setOnClickListener(view -> work.run()); layout.addView(button); return button;
    }
    public void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); acceptLink(intent); }
    private void acceptLink(Intent intent) {
        Uri uri = intent.getData();
        if (uri != null && "sightline".equals(uri.getScheme()) && "pair".equals(uri.getHost())) {
            String server = uri.getQueryParameter("server"), pairing = uri.getQueryParameter("pair");
            if (server != null && pairing != null) link.setText(server + "/phone-control#pair=" + Uri.encode(pairing));
        }
    }
    private void connect() {
        if (ScreenCaptureService.isSharing()) { message("Stop sharing before changing the paired server"); return; }
        final String server, pairing;
        try {
            URI qr = new URI(link.getText().toString().trim());
            if (!("http".equals(qr.getScheme()) || "https".equals(qr.getScheme())) || qr.getHost() == null || qr.getUserInfo() != null) throw new IllegalArgumentException("Use the desktop's HTTP/HTTPS QR link");
            pairing = Uri.parse("https://local/?" + qr.getRawFragment()).getQueryParameter("pair");
            if (pairing == null || !pairing.matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("This is not an Android app pairing QR");
            server = new URI(qr.getScheme(), null, qr.getHost(), qr.getPort(), null, null, null).toString();
        } catch (Exception error) { message(error.getMessage()); return; }
        new AlertDialog.Builder(this).setTitle("Connect to " + server + "?")
            .setMessage("This server will receive your display screenshots while sharing is active and may execute actions through accessibility. Only connect to a server you trust.")
            .setNegativeButton("Cancel", null).setPositiveButton("Connect", (dialog, which) -> {
                connect.setEnabled(false);
                java.util.concurrent.ExecutorService worker = Executors.newSingleThreadExecutor();
                worker.execute(() -> {
                    try {
                        JSONObject result = PhoneApi.request(server, "", "/native/register", "application/json", new JSONObject().put("pairing", pairing).put("name", Build.MANUFACTURER + " " + Build.MODEL).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        PhoneApi.prefs(this).edit().putString("server", server).putString("token", result.getString("token")).putString("status", "Connected to " + server + ". Enable accessibility, then Start sharing.").apply();
                        runOnUiThread(() -> { link.setText(""); message("Paired. Enable accessibility, then Start sharing."); });
                    } catch (Exception error) { runOnUiThread(() -> message(error.getMessage())); }
                    finally { runOnUiThread(() -> connect.setEnabled(true)); worker.shutdown(); }
                });
            }).show();
    }
    private void requestCapture(boolean record) {
        try {
            pendingMinutes = Integer.parseInt(minutes.getText().toString());
            if (pendingMinutes < 1 || pendingMinutes > 60) throw new IllegalArgumentException("Limit must be 1–60 minutes");
            if (ScreenCaptureService.isSharing()) {
                if (record) startService(new Intent(this, ScreenCaptureService.class).setAction(ScreenCaptureService.RECORD).putExtra("minutes", pendingMinutes));
                else message("Sharing is already running");
                return;
            }
            pendingRecord = record;
            MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
            Intent capture = Build.VERSION.SDK_INT >= 34 ? manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()) : manager.createScreenCaptureIntent();
            startActivityForResult(capture, 1);
        } catch (Exception error) { message(error.getMessage()); }
    }
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 1) return;
        if (result != RESULT_OK || data == null) { message("Screen capture permission was declined"); return; }
        startForegroundService(new Intent(this, ScreenCaptureService.class).setAction(ScreenCaptureService.START).putExtra("consent", data).putExtra("result", result).putExtra("record", pendingRecord).putExtra("minutes", pendingMinutes));
    }
    private void saved() {
        JSONArray records = RecordingStore.list(this);
        if (records.length() == 0) { message("No saved recordings yet"); return; }
        String[] labels = new String[records.length()];
        for (int i = 0; i < labels.length; i++) {
            JSONObject record = records.optJSONObject(i);
            labels[i] = new java.util.Date(record.optLong("startedAt")) + " · " + record.optString("state") + (record.has("error") ? "\n" + record.optString("error") : "");
        }
        new AlertDialog.Builder(this).setTitle("Saved recordings — tap to share").setItems(labels, (dialog, index) -> {
            JSONObject record = records.optJSONObject(index);
            if (record.optInt("segments") == 0) { message("This recording has no finalized video"); return; }
            Uri uri = Uri.parse("content://" + getPackageName() + ".recordings/" + record.optString("id"));
            Intent share = new Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            share.setClipData(ClipData.newRawUri("Sightline recording", uri));
            startActivity(Intent.createChooser(share, "Save or share full phone video"));
        }).setNegativeButton("Close", null).show();
    }
    private void message(String text) { Toast.makeText(this, text == null ? "Operation failed" : text, Toast.LENGTH_LONG).show(); }
    protected void onResume() { super.onResume(); main.post(refresh); }
    protected void onPause() { main.removeCallbacks(refresh); super.onPause(); }
}
