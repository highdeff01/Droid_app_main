import { describe, expect, it } from "vitest";
import {
  PREVIEW_TRAIL_CAP,
  RECORDING_TRAIL_CAP,
  appendBounded,
  isFromHudControl,
  trailCap,
} from "./hud-pointer";

/** Minimal element tree: each node knows its tag/role and parent. */
class FakeNode {
  constructor(
    readonly tag: string,
    readonly parent: FakeNode | null = null,
    readonly attrs: Record<string, string> = {},
  ) {}
  private matches(selector: string) {
    return selector.split(",").some((part) => {
      const s = part.trim();
      if (s === this.tag) return true;
      const role = /^\[role="(.+)"\]$/.exec(s);
      if (role) return this.attrs.role === role[1];
      const attr = /^\[(.+)\]$/.exec(s);
      return !!attr && attr[1] in this.attrs;
    });
  }
  closest(selector: string): FakeNode | null {
    for (let n: FakeNode | null = this; n; n = n.parent) if (n.matches(selector)) return n;
    return null;
  }
  contains(other: unknown): boolean {
    for (let n = other as FakeNode | null; n; n = n.parent) if (n === this) return true;
    return false;
  }
}

describe("isFromHudControl", () => {
  const outside = new FakeNode("section");
  const viewport = new FakeNode("div", outside);
  const frame = new FakeNode("div", viewport);
  const toolbar = new FakeNode("div", viewport);
  const stop = new FakeNode("button", toolbar);
  const stopIcon = new FakeNode("svg", stop);

  it("treats a click on the STOP button (or its icon) as a control click, never a screen click", () => {
    expect(isFromHudControl(stop, viewport)).toBe(true);
    expect(isFromHudControl(stopIcon, viewport)).toBe(true);
  });

  it("treats inputs, role=button divs and data-hud-control areas as controls", () => {
    expect(isFromHudControl(new FakeNode("input", toolbar), viewport)).toBe(true);
    expect(isFromHudControl(new FakeNode("div", toolbar, { role: "button" }), viewport)).toBe(true);
    expect(isFromHudControl(new FakeNode("span", new FakeNode("div", toolbar, { "data-hud-control": "" })), viewport)).toBe(true);
  });

  it("lets a click on the mirrored frame through", () => {
    expect(isFromHudControl(frame, viewport)).toBe(false);
    expect(isFromHudControl(viewport, viewport)).toBe(false);
  });

  it("ignores controls that wrap the viewport rather than sit inside it", () => {
    const wrapperButton = new FakeNode("button");
    const vp = new FakeNode("div", wrapperButton);
    expect(isFromHudControl(new FakeNode("div", vp), vp)).toBe(false);
  });

  it("returns false for targets without closest()", () => {
    expect(isFromHudControl(null, viewport)).toBe(false);
    expect(isFromHudControl({}, viewport)).toBe(false);
  });
});

describe("trail caps", () => {
  it("keeps far more than 61 points while recording", () => {
    expect(trailCap(true)).toBe(RECORDING_TRAIL_CAP);
    expect(RECORDING_TRAIL_CAP).toBeGreaterThanOrEqual(1000);
    expect(trailCap(false)).toBe(PREVIEW_TRAIL_CAP);
  });

  it("does not truncate a 500-point recorded trajectory", () => {
    let trail: number[] = [];
    for (let i = 0; i < 500; i++) trail = appendBounded(trail, i, trailCap(true));
    expect(trail).toHaveLength(500);
    expect(trail[0]).toBe(0);
  });

  it("keeps only the newest points once the cap is reached", () => {
    let trail: number[] = [];
    for (let i = 0; i < 10; i++) trail = appendBounded(trail, i, 4);
    expect(trail).toEqual([6, 7, 8, 9]);
  });
});
