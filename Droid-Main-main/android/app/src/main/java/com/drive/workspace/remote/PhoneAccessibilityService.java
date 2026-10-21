package com.drive.workspace.remote;

import android.accessibilityservice.*;
import android.graphics.*;
import android.hardware.HardwareBuffer;
import android.os.Bundle;
import android.view.Display;
import android.view.accessibility.*;
import org.json.JSONObject;
import java.util.function.Consumer;

public class PhoneAccessibilityService extends AccessibilityService {
    private static volatile PhoneAccessibilityService instance;
    private android.widget.TextView overlay;
    static PhoneAccessibilityService current() { return instance; }
    protected void onServiceConnected() { instance = this; }
    public void onAccessibilityEvent(AccessibilityEvent event) { ActionRecorder.onEvent(event, getPackageName()); }
    protected boolean onKeyEvent(android.view.KeyEvent event) { ActionRecorder.onKey(event); return false; }
    public void onInterrupt() { }
    public void onDestroy() { showIndicator(null); if (instance == this) instance = null; super.onDestroy(); }

    /**
     * Small on-screen status badge drawn as an accessibility overlay, which an enabled accessibility
     * service may show over other apps without the "display over other apps" permission. Null hides it.
     */
    void showIndicator(String text) {
        getMainExecutor().execute(() -> {
            android.view.WindowManager windows = getSystemService(android.view.WindowManager.class);
            if (text == null) { if (overlay != null) { windows.removeView(overlay); overlay = null; } return; }
            if (overlay == null) {
                overlay = new android.widget.TextView(this);
                overlay.setBackgroundColor(0xCC0F172A); overlay.setTextColor(Color.WHITE); overlay.setTextSize(11); overlay.setPadding(16, 6, 16, 6);
                android.view.WindowManager.LayoutParams params = new android.view.WindowManager.LayoutParams(
                    android.view.WindowManager.LayoutParams.WRAP_CONTENT, android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                    android.view.WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
                params.gravity = android.view.Gravity.TOP | android.view.Gravity.END;
                windows.addView(overlay, params);
            }
            overlay.setText(text);
        });
    }

    void screenshot(Consumer<Bitmap> success, Consumer<String> failure) {
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            public void onSuccess(ScreenshotResult result) {
                HardwareBuffer buffer = result.getHardwareBuffer(); Bitmap hardware = null, copy = null;
                try {
                    hardware = Bitmap.wrapHardwareBuffer(buffer, result.getColorSpace());
                    if (hardware == null) throw new IllegalStateException("No screen bitmap");
                    copy = hardware.copy(Bitmap.Config.ARGB_8888, false);
                    success.accept(copy); copy = null;
                } catch (Exception error) { failure.accept(error.getMessage()); }
                finally { if (copy != null) copy.recycle(); if (hardware != null) hardware.recycle(); buffer.close(); }
            }
            public void onFailure(int errorCode) { failure.accept("Android could not share this screen (" + errorCode + ")"); }
        });
    }
    void execute(JSONObject action, int width, int height, Consumer<String> done) {
        ActionRecorder.markRemoteAction();
        try {
            String type = action.getString("type");
            if (type.equals("tap") || type.equals("swipe")) {
                if (width < 1 || height < 1) throw new IllegalStateException("No current display size");
                Path path = new Path();
                path.moveTo(coord(action.getDouble("x"), width), coord(action.getDouble("y"), height));
                long duration = 100;
                if (type.equals("swipe")) {
                    path.lineTo(coord(action.getDouble("endX"), width), coord(action.getDouble("endY"), height));
                    duration = action.optInt("duration", 350);
                    if (duration < 100 || duration > 2000) throw new IllegalArgumentException("Invalid gesture duration");
                }
                GestureDescription gesture = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path, 0, duration)).build();
                boolean accepted = dispatchGesture(gesture, new GestureResultCallback() {
                    public void onCompleted(GestureDescription gesture) { done.accept(null); }
                    public void onCancelled(GestureDescription gesture) { done.accept("Android cancelled the gesture"); }
                }, null);
                if (!accepted) done.accept("Android rejected the gesture");
                return;
            }
            String key = action.optString("key"); int global = 0;
            if (key.equals("HOME")) global = GLOBAL_ACTION_HOME;
            if (key.equals("BACK")) global = GLOBAL_ACTION_BACK;
            if (key.equals("APP_SWITCH")) global = GLOBAL_ACTION_RECENTS;
            if (global != 0) { done.accept(performGlobalAction(global) ? null : "Android rejected navigation"); return; }
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) throw new IllegalStateException("No accessible window");
            AccessibilityNodeInfo node = null;
            try {
                node = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                if (node == null) throw new IllegalStateException("Focus a text field on the phone first");
                boolean accepted;
                if (type.equals("text") || key.equals("DEL")) {
                    String existing = node.getText() == null ? "" : node.getText().toString();
                    String text = type.equals("text") ? existing + action.getString("text") : existing.isEmpty() ? "" : existing.substring(0, existing.length() - 1);
                    Bundle args = new Bundle(); args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                    accepted = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                } else if (key.equals("COPY") || key.equals("PASTE")) {
                    accepted = node.performAction(key.equals("COPY") ? AccessibilityNodeInfo.ACTION_COPY : AccessibilityNodeInfo.ACTION_PASTE);
                } else if (key.equals("ENTER")) {
                    accepted = node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                } else if (key.equals("TAB")) {
                    AccessibilityNodeInfo next = node.focusSearch(android.view.View.FOCUS_FORWARD);
                    accepted = next != null && next.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                    if (next != null) next.recycle();
                } else throw new IllegalArgumentException("Unsupported action");
                done.accept(accepted ? null : "The focused app rejected this text action");
            } finally { if (node != null) node.recycle(); root.recycle(); }
        } catch (Exception error) { done.accept(error.getMessage()); }
    }
    private static float coord(double value, int size) {
        if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException("Invalid coordinate");
        return (float) (value * (size - 1));
    }
}
