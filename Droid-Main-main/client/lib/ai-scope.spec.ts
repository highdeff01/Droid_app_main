import { describe, expect, it } from "vitest";
import { runActionGate, type GatePost } from "./action-gate";
import {
  AI_SCOPE_STORAGE_KEY,
  clientRectToScreenRegion,
  loadScopeMode,
  scopeTarget,
  setScopeMode,
  getAiScope,
  stepsOutsideScope,
  type AiScope,
} from "./ai-scope";

const REGION = { x: 100, y: 100, width: 200, height: 200 };
const HUD: AiScope = { mode: "hud", region: REGION };
const FULL: AiScope = { mode: "full", region: REGION };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

/** A gate post fake whose analysis reports one element at (480..520, 480..520) and one at (190..210, 190..210). */
function gatePost(): { post: GatePost; urls: string[] } {
  const urls: string[] = [];
  const post: GatePost = async (url) => {
    urls.push(url);
    if (url === "/api/replay/capture") return { success: true, frame: { image: "data:x", width: 1000, height: 1000 } };
    return {
      success: true,
      report: {
        elements: [
          { name: "Outside", boundingBox: { x: 480, y: 480, width: 40, height: 40 }, confidence: 0.9 },
          { name: "Inside", boundingBox: { x: 190, y: 190, width: 20, height: 20 }, confidence: 0.8 },
        ],
      },
    };
  };
  return { post, urls };
}

describe("scope persistence", () => {
  it("defaults to the entire screen when nothing is stored", () => {
    expect(loadScopeMode(memoryStorage())).toBe("full");
  });

  it("restores the stored HUD choice", () => {
    const storage = memoryStorage();
    setScopeMode("hud", storage);
    expect(storage.data[AI_SCOPE_STORAGE_KEY]).toBe("hud");
    expect(loadScopeMode(storage)).toBe("hud");
    expect(getAiScope().mode).toBe("hud");
    setScopeMode("full", storage);
    expect(getAiScope().mode).toBe("full");
  });
});

describe("scopeTarget", () => {
  it("leaves targets unchanged under the full-screen scope", () => {
    const target = { x: 500, y: 500, needsTarget: true };
    expect(scopeTarget(target, FULL, "desktop")).toEqual({ target });
  });

  it("refuses a desktop target outside the HUD region instead of clamping it", () => {
    const result = scopeTarget({ x: 500, y: 500, needsTarget: true }, HUD, "desktop");
    expect(result.target).toBeUndefined();
    expect(result.reason).toContain("outside the HUD canvas region");
  });

  it("accepts a target inside the region unchanged", () => {
    const target = { x: 150, y: 250, needsTarget: true };
    expect(scopeTarget(target, HUD, "desktop").target).toEqual(target);
  });

  it("maps relative targets into the region, not the whole frame", () => {
    const result = scopeTarget({ x: 0.5, y: 0.25, needsTarget: true, relative: true }, HUD, "desktop");
    expect(result.target).toMatchObject({ x: 200, y: 150, relative: false });
  });

  it("blocks when the HUD scope is chosen but no HUD region is measured", () => {
    expect(scopeTarget({ x: 1, y: 1, needsTarget: true }, { mode: "hud", region: null }, "desktop").reason).toContain("no HUD canvas");
  });

  it("does not constrain phone coordinates or non-positional actions", () => {
    expect(scopeTarget({ x: 900, y: 900, needsTarget: true }, HUD, "android").target).toBeDefined();
    expect(scopeTarget({ x: 900, y: 900, needsTarget: false }, HUD, "desktop").target).toBeDefined();
  });
});

describe("runActionGate under the scope", () => {
  it("blocks an out-of-region target before capturing anything", async () => {
    const { post, urls } = gatePost();
    const result = await runActionGate(
      { targetDevice: "desktop", target: { x: 500, y: 500, needsTarget: true }, signal: new AbortController().signal, scope: HUD },
      post,
    );
    expect(result.status).toBe("blocked");
    expect(urls).toEqual([]);
  });

  it("verifies the same target under the full-screen scope", async () => {
    const { post } = gatePost();
    const result = await runActionGate(
      { targetDevice: "desktop", target: { x: 500, y: 500, needsTarget: true }, signal: new AbortController().signal, scope: FULL },
      post,
    );
    expect(result.status).toBe("verified");
    if (result.status === "verified") expect(result.element?.name).toBe("Outside");
  });

  it("verifies a relative target against elements inside the region", async () => {
    const { post } = gatePost();
    const result = await runActionGate(
      { targetDevice: "desktop", target: { x: 0.5, y: 0.5, needsTarget: true, relative: true }, signal: new AbortController().signal, scope: HUD },
      post,
    );
    expect(result.status).toBe("verified");
    if (result.status === "verified") expect(result.element?.name).toBe("Inside");
  });
});

describe("replay dispatch scope", () => {
  it("names the first positional step outside the region", () => {
    const steps = [
      { action: "wait", x: 900, y: 900, name: "Wait" },
      { action: "click", x: 150, y: 150, name: "Inside" },
      { action: "click", x: 500, y: 500, name: "Far" },
    ];
    expect(stepsOutsideScope(steps, HUD, "desktop")).toContain('Step "Far"');
    expect(stepsOutsideScope(steps, FULL, "desktop")).toBeNull();
  });
});

describe("clientRectToScreenRegion", () => {
  it("adds the window position, browser chrome and pixel ratio", () => {
    const region = clientRectToScreenRegion(
      { left: 10, top: 20, width: 300, height: 200 },
      { screenX: 50, screenY: 40, outerWidth: 1016, outerHeight: 900, innerWidth: 1000, innerHeight: 800, devicePixelRatio: 2 },
    );
    expect(region).toEqual({ x: (50 + 8 + 10) * 2, y: (40 + 92 + 20) * 2, width: 600, height: 400 });
  });
});
