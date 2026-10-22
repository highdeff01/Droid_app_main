import { describe, it, expect, vi, beforeEach } from "vitest";

import { htmlToText, generatePresentation, type PresentationDeps } from "./presentation-generator";
import type { ReplayRun } from "@shared/replay";
import type { PresentationGenerateRequest, StruggleTopic } from "@shared/story";

function presentationContent(slides: any[], title = "Title"): string {
  return JSON.stringify({ title, slides });
}

function makeDeps(): PresentationDeps {
  return {
    chat: vi.fn(),
    fetchPage: vi.fn(),
    getRun: vi.fn(),
    struggles: vi.fn().mockReturnValue([]),
  };
}

function makeRun(overrides: Partial<ReplayRun> = {}): ReplayRun {
  return {
    id: "run1",
    target: "app",
    status: "completed",
    currentStep: 1,
    iteration: 1,
    completed: 1,
    total: 1,
    steps: [{ id: "s1", status: "completed" }],
    events: [{ id: "e1", at: 1000, phase: "execution", detail: "did a thing" }],
    startedAt: 0,
    ...overrides,
  };
}

function makeTopic(overrides: Partial<StruggleTopic> = {}): StruggleTopic {
  return {
    id: "topic1",
    label: "CAPTCHA step",
    occurrences: 3,
    sources: ["fix_task"],
    examples: ["failed again"],
    lastSeen: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("htmlToText", () => {
  it("strips script and style blocks and tags, collapsing whitespace", () => {
    const html = `<html><head><style>.x{color:red}</style><script>var x=1;</script></head>
      <body>  <h1>Title</h1>\n\n<p>Hello   world</p>  </body></html>`;

    const result = htmlToText(html);

    expect(result).not.toContain("color:red");
    expect(result).not.toContain("var x=1");
    expect(result).not.toMatch(/<[^>]+>/);
    expect(result).toBe("Title Hello world");
  });
});

describe("generatePresentation", () => {
  let deps: PresentationDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("uses getRun facts for a task presentation and 404s for an unknown run", async () => {
    (deps.getRun as any).mockReturnValue(undefined);

    await expect(
      generatePresentation({ kind: "task", runId: "missing" } as PresentationGenerateRequest, deps),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("calls fetchPage for a web request with a url and includes the page text in the prompt", async () => {
    (deps.fetchPage as any).mockResolvedValueOnce("Page body text");
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: presentationContent([{ title: "S1", bullets: ["a"] }]),
      endpoint: "e",
    });

    const result = await generatePresentation({ kind: "web", url: "https://example.com" }, deps);

    expect(deps.fetchPage).toHaveBeenCalledWith("https://example.com/");
    const [messages] = (deps.chat as any).mock.calls[0];
    expect(messages[1].content).toContain("Page body text");
    expect(result.source).toBe("https://example.com/");
  });

  it("rejects with 502 when fetchPage rejects", async () => {
    (deps.fetchPage as any).mockRejectedValueOnce(new Error("timeout"));

    await expect(
      generatePresentation({ kind: "web", url: "https://example.com" }, deps),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects with 400 for a non-http(s) web url", async () => {
    await expect(
      generatePresentation({ kind: "web", url: "ftp://example.com" }, deps),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uses model_knowledge and does not call fetchPage for a web request with only a topic", async () => {
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: presentationContent([{ title: "S1", bullets: ["a"] }]),
      endpoint: "e",
    });

    const result = await generatePresentation({ kind: "web", text: "quantum computing" }, deps);

    expect(deps.fetchPage).not.toHaveBeenCalled();
    expect(result.source).toBe("model_knowledge");
  });

  it("uses user_input as the source for a user-kind presentation", async () => {
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: presentationContent([{ title: "S1", bullets: ["a"] }]),
      endpoint: "e",
    });

    const result = await generatePresentation({ kind: "user", text: "my content" }, deps);

    expect(result.source).toBe("user_input");
  });

  it("succeeds for a teach presentation whose topicId is in struggles()", async () => {
    (deps.struggles as any).mockReturnValue([makeTopic()]);
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: presentationContent([{ title: "S1", bullets: ["a"] }]),
      endpoint: "e",
    });

    const result = await generatePresentation({ kind: "teach", topicId: "topic1" }, deps);

    expect(result.source).toBe("struggle:topic1");
  });

  it("rejects with 404 for an unknown teach topicId", async () => {
    (deps.struggles as any).mockReturnValue([]);

    await expect(
      generatePresentation({ kind: "teach", topicId: "missing" }, deps),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 502 when chat reports failure", async () => {
    (deps.chat as any).mockResolvedValueOnce({ success: false, error: "down" });

    await expect(generatePresentation({ kind: "user", text: "stuff" }, deps)).rejects.toMatchObject({ status: 502 });
  });

  it("parses slides with their title and bullets for a task presentation", async () => {
    (deps.getRun as any).mockReturnValue(makeRun());
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: presentationContent([{ title: "Overview", bullets: ["step done", "verified"] }], "My run"),
      endpoint: "e",
    });

    const result = await generatePresentation({ kind: "task", runId: "run1" }, deps);

    expect(result.title).toBe("My run");
    expect(result.slides).toEqual([{ title: "Overview", bullets: ["step done", "verified"] }]);
  });
});
