package com.drive.workspace.remote;

import android.content.Context;
import android.graphics.Rect;
import android.os.Build;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Records the user's own taps, scrolls, text entry and navigation from accessibility events.
 * Events are raw screen pixels; the server converts them into an executable workflow.
 */
final class ActionRecorder {
    /** Events this soon after a gesture the server dispatched belong to that gesture, not to the user. */
    private static final long REMOTE_ACTION_GRACE_MS = 600;
    private static final int MAX_EVENTS = 500;
    private static JSONArray events;
    private static long lastRemoteAction;

    private ActionRecorder() { }

    static synchronized void start() { events = new JSONArray(); }
    static synchronized boolean isActive() { return events != null; }
    static synchronized int count() { return events == null ? 0 : events.length(); }
    static synchronized JSONArray stop() { JSONArray done = events; events = null; return done == null ? new JSONArray() : done; }
    static synchronized void markRemoteAction() { lastRemoteAction = SystemClock.elapsedRealtime(); }

    static void onEvent(AccessibilityEvent event, String ownPackage) {
        if (!isActive() || ignored(event.getPackageName(), ownPackage)) return;
        try {
            switch (event.getEventType()) {
                case AccessibilityEvent.TYPE_VIEW_CLICKED: click(event); break;
                case AccessibilityEvent.TYPE_VIEW_SCROLLED: scroll(event); break;
                case AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED: text(event); break;
                default: break;
            }
        } catch (Exception ignored) {
            // A malformed event is not recorded; recording never invents a step.
        }
    }

    static void onKey(KeyEvent event) {
        if (!isActive() || event.getAction() != KeyEvent.ACTION_UP || remoteActionInProgress()) return;
        String key = event.getKeyCode() == KeyEvent.KEYCODE_BACK ? "BACK"
            : event.getKeyCode() == KeyEvent.KEYCODE_HOME ? "HOME"
            : event.getKeyCode() == KeyEvent.KEYCODE_APP_SWITCH ? "APP_SWITCH" : null;
        if (key == null) return;
        try { add(new JSONObject().put("kind", "key").put("at", System.currentTimeMillis()).put("key", key)); }
        catch (Exception ignored) { }
    }

    private static boolean ignored(CharSequence pkg, String ownPackage) {
        return (pkg != null && ownPackage.contentEquals(pkg)) || remoteActionInProgress();
    }
    private static synchronized boolean remoteActionInProgress() {
        return SystemClock.elapsedRealtime() - lastRemoteAction < REMOTE_ACTION_GRACE_MS;
    }

    private static void click(AccessibilityEvent event) throws Exception {
        Rect bounds = bounds(event);
        if (bounds == null) return;
        JSONObject item = new JSONObject().put("kind", "click").put("at", System.currentTimeMillis())
            .put("x", bounds.exactCenterX()).put("y", bounds.exactCenterY());
        CharSequence label = event.getContentDescription() != null ? event.getContentDescription() : event.getText().isEmpty() ? null : event.getText().get(0);
        if (label != null) item.put("label", truncate(label.toString(), 200));
        add(item);
    }

    private static void scroll(AccessibilityEvent event) throws Exception {
        Rect bounds = bounds(event);
        if (bounds == null) return;
        int dx = Build.VERSION.SDK_INT >= 28 ? event.getScrollDeltaX() : 0, dy = Build.VERSION.SDK_INT >= 28 ? event.getScrollDeltaY() : 0;
        if (dx == 0 && dy == 0) return; // Android did not say which way the content moved.
        String direction = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? "down" : "up") : (dx > 0 ? "right" : "left");
        add(new JSONObject().put("kind", "scroll").put("at", System.currentTimeMillis())
            .put("x", bounds.exactCenterX()).put("y", bounds.exactCenterY()).put("direction", direction));
    }

    private static void text(AccessibilityEvent event) throws Exception {
        AccessibilityNodeInfo source = event.getSource();
        String field = event.getClassName() == null ? "field" : event.getClassName().toString();
        if (source != null) {
            if (source.getViewIdResourceName() != null) field = source.getViewIdResourceName();
            source.recycle();
        }
        String text = event.getText().isEmpty() || event.getText().get(0) == null ? "" : event.getText().get(0).toString();
        String previous = event.getBeforeText() == null ? "" : event.getBeforeText().toString();
        // Password text is never stored; the server reports the step as skipped.
        boolean password = event.isPassword();
        add(new JSONObject().put("kind", "text").put("at", System.currentTimeMillis()).put("field", truncate(field, 200))
            .put("text", password ? "" : truncate(text, 4000)).put("previous", password ? "" : truncate(previous, 4000)).put("password", password));
    }

    private static Rect bounds(AccessibilityEvent event) {
        AccessibilityNodeInfo source = event.getSource();
        if (source == null) return null;
        try {
            Rect rect = new Rect();
            source.getBoundsInScreen(rect);
            return rect.isEmpty() ? null : rect;
        } finally { source.recycle(); }
    }

    private static synchronized void add(JSONObject item) {
        if (events != null && events.length() < MAX_EVENTS) events.put(item);
    }

    private static String truncate(String value, int max) { return value.length() > max ? value.substring(0, max) : value; }

    /** Uploads the recorded events as a workflow and returns the server's summary; throws with the server's reason otherwise. */
    static String upload(Context context, String name, JSONArray recorded) throws Exception {
        if (recorded.length() == 0) throw new IllegalStateException("Nothing was recorded. Use other apps while recording, then stop.");
        DisplayMetrics size = new DisplayMetrics();
        context.getSystemService(WindowManager.class).getDefaultDisplay().getRealMetrics(size);
        JSONObject body = new JSONObject().put("name", name).put("screenWidth", size.widthPixels).put("screenHeight", size.heightPixels).put("events", recorded);
        JSONObject result = PhoneApi.post(context, "/native/workflows", body);
        JSONObject workflow = result.getJSONObject("workflow");
        int skipped = result.optJSONArray("skipped") == null ? 0 : result.getJSONArray("skipped").length();
        return "Saved workflow \"" + workflow.optString("name") + "\" with " + workflow.optInt("steps") + " step(s)"
            + (skipped > 0 ? "; " + skipped + " event(s) could not be replayed and were left out" : "");
    }
}
