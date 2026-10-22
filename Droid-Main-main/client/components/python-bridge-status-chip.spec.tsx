import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BridgeStatusChipView } from "./python-bridge-status-chip";

describe("BridgeStatusChipView", () => {
  it("shows the missing state with the exact fix", () => {
    const html = renderToStaticMarkup(
      <BridgeStatusChipView
        status={{ pythonOk: false, pyautoguiOk: false, label: "Python: missing · pyautogui: missing", fix: "run setup-python.bat", interpreter: "not found" }}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain("Python: missing · pyautogui: missing");
    expect(html).toContain("Fix: run setup-python.bat");
    expect(html).toContain("Dismiss Python bridge status");
  });

  it("shows no fix when everything is OK", () => {
    const html = renderToStaticMarkup(
      <BridgeStatusChipView
        status={{ pythonOk: true, pyautoguiOk: true, label: "Python: OK · pyautogui: OK", fix: null, interpreter: "python3" }}
        onDismiss={() => {}}
      />,
    );
    expect(html).toContain("Python: OK · pyautogui: OK");
    expect(html).not.toContain("Fix:");
  });
});
