import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HudModal } from "./hud-modal";
import { HudPanelDock } from "./hud-panel-dock";
import { HUD_DOCK_STORAGE_KEY } from "@/lib/hud-layout";

function stubBrowser(dockState: string | null) {
  vi.stubGlobal("window", {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === HUD_DOCK_STORAGE_KEY ? dockState : null),
    setItem: () => {},
  });
}

afterEach(() => vi.unstubAllGlobals());

const sections = [
  { id: "master" as const, title: "Master AI", content: "MASTER-BODY" },
  { id: "progress" as const, title: "Live app progress", content: "PROGRESS-BODY" },
];

describe("HudPanelDock", () => {
  it("starts collapsed: shows a tab per panel and no panel body", () => {
    stubBrowser(null);
    const markup = renderToStaticMarkup(<HudPanelDock sections={sections} />);
    expect(markup).toContain("Master AI");
    expect(markup).toContain("Live app progress");
    expect(markup).not.toContain("MASTER-BODY");
    expect(markup).not.toContain("fixed");
  });

  it("restores the remembered open panel from storage", () => {
    stubBrowser(JSON.stringify({ master: false, intentions: false, progress: true }));
    const markup = renderToStaticMarkup(<HudPanelDock sections={sections} />);
    expect(markup).toContain("PROGRESS-BODY");
    expect(markup).not.toContain("MASTER-BODY");
  });
});

describe("HudModal", () => {
  it("renders nothing when closed", () => {
    stubBrowser(null);
    const markup = renderToStaticMarkup(
      <HudModal open={false} onClose={() => {}} title="Overseer">body</HudModal>,
    );
    expect(markup).toBe("");
  });

  it("renders a non-fullscreen, backdrop-free dialog below the controls layer with a Close button", () => {
    stubBrowser(null);
    const markup = renderToStaticMarkup(
      <HudModal open onClose={() => {}} title="Overseer">body</HudModal>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("z-[45]");
    expect(markup).not.toContain("inset-0");
    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain("Overseer");
  });
});
