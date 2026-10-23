import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HudEmptyState } from "./hud-empty-state";
import { NO_PHONE_CONNECTED_MESSAGE } from "@/lib/hud-frame-status";

const render = (props: Partial<React.ComponentProps<typeof HudEmptyState>> = {}) =>
  renderToStaticMarkup(
    React.createElement(HudEmptyState, { isRequestingShare: false, onStartShare: () => {}, ...props }),
  );

describe("HudEmptyState", () => {
  it("offers a real desktop stream start and setup steps, never a drawn frame", () => {
    const markup = render();
    expect(markup).toContain("Start Real Desktop Stream");
    expect(markup).toContain("<ol");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<canvas");
  });

  it("surfaces the share error and switches the action to a retry", () => {
    const markup = render({ shareError: { title: "Share denied", message: "Permission was refused" } });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Share denied");
    expect(markup).toContain("Permission was refused");
    expect(markup).toContain("Retry Share");
  });

  it("disables the action while a share request is pending", () => {
    const markup = render({ isRequestingShare: true });
    expect(markup).toContain("Connecting…");
    expect(markup).toMatch(/<button[^>]*disabled/);
  });

  it("names the missing phone instead of drawing a phone template", () => {
    const markup = render({ notice: NO_PHONE_CONNECTED_MESSAGE });
    expect(markup).toContain("No phone connected — pair a device or start phone screen share");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<canvas");
  });
});
