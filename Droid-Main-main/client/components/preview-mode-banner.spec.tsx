import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

import { PreviewModeBadge, PreviewModeBanner } from "./preview-mode-banner";
import { PREVIEW_BADGE, PREVIEW_REASON_CONTROL, applyPreviewDetection, resetPreviewMode, setPreviewOverride } from "@/lib/preview-mode";

const render = (component: React.FC<any>) => renderToStaticMarkup(React.createElement(component));

afterEach(() => resetPreviewMode());

describe("PreviewModeBanner / PreviewModeBadge", () => {
  it("render nothing in real mode", () => {
    expect(render(PreviewModeBanner)).toBe("");
    expect(render(PreviewModeBadge)).toBe("");
  });

  it("show the PREVIEW (simulated) badge and the detection reason when auto-entered", () => {
    applyPreviewDetection(PREVIEW_REASON_CONTROL);
    const banner = render(PreviewModeBanner);
    expect(banner).toContain('role="status"');
    expect(banner).toContain(PREVIEW_BADGE);
    expect(banner).toContain(PREVIEW_REASON_CONTROL);
    expect(banner).toContain("nothing is executed on a device");
    expect(render(PreviewModeBadge)).toContain(PREVIEW_BADGE);
  });

  it("show the badge when enabled manually in Settings", () => {
    setPreviewOverride(true);
    expect(render(PreviewModeBadge)).toContain(PREVIEW_BADGE);
  });
});
