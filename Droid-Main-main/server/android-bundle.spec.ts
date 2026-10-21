import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createAndroidBundle } from "./android-bundle";

describe("Android companion download", () => {
  it("ships the native capture and control implementation without local build artifacts", async () => {
    const zip = await JSZip.loadAsync(await createAndroidBundle());
    const base = "app/src/main/java/com/drive/workspace/remote/";
    expect(await zip.file(base + "ScreenCaptureService.java")!.async("string")).toContain("createVirtualDisplay");
    expect(await zip.file(base + "PhoneAccessibilityService.java")!.async("string")).toContain("dispatchGesture");
    expect(await zip.file("app/src/main/AndroidManifest.xml")!.async("string")).toContain('android:stopWithTask="false"');
    expect(Object.keys(zip.files).some(file => /(^|\/)(build|\.gradle)\//.test(file) || file === "local.properties")).toBe(false);
  });
});
