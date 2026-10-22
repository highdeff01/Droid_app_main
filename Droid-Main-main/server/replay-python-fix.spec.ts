import { describe, expect, it } from "vitest";
import { withPythonFix } from "./replay-adapter";
import { PYTHON_SETUP_FIX } from "../shared/device-execution";

describe("withPythonFix", () => {
  it("adds the setup fix when the interpreter cannot be spawned", () => {
    const err = Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" });
    expect(withPythonFix(err).message).toContain(`Fix: ${PYTHON_SETUP_FIX}`);
  });

  it("adds the setup fix when pyautogui is missing", () => {
    expect(withPythonFix(new Error("No module named 'pyautogui'")).message).toContain("Fix:");
  });

  it("leaves unrelated errors unchanged", () => {
    const err = new Error("Desktop operation timed out; its effect is uncertain");
    expect(withPythonFix(err)).toBe(err);
  });
});
