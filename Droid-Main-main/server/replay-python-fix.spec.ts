import { describe, expect, it } from "vitest";
import { withPythonFix } from "./replay-adapter";
import { describeTargetDrift } from "./replay-engine";
import { PYTHON_SETUP_FIX } from "../shared/device-execution";

describe("withPythonFix", () => {
  it("asks to start the python-service when the interpreter cannot be spawned", () => {
    const err = Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" });
    const message = withPythonFix(err).message;
    expect(message).toContain("start the python-service");
    expect(message).toContain(`Fix: ${PYTHON_SETUP_FIX}`);
  });

  it("asks to start the python-service when pyautogui is missing", () => {
    expect(withPythonFix(new Error("No module named 'pyautogui'")).message).toContain("start the python-service");
  });

  it("leaves unrelated errors unchanged", () => {
    const err = new Error("Desktop operation timed out; its effect is uncertain");
    expect(withPythonFix(err)).toBe(err);
  });
});

describe("describeTargetDrift", () => {
  it("logs the measured drift between the recorded and located target", () => {
    expect(describeTargetDrift({ x: 100, y: 200 }, { x: 103, y: 196 })).toBe(
      "Measured drift (+3, -4) px = 5.0 px: recorded (100, 200) → acting at (103, 196)",
    );
  });
});
