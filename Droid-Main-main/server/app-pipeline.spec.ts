import { describe, expect, it, vi } from "vitest";
import { connectAppPipeline } from "./app-pipeline";
import type { CompanionService } from "./companion-service";
import { DurableStore } from "./durable-store";
import { NotesStore } from "./notes-store";
import type { OverseerSupervisor } from "./overseer/supervisor";
import { ProgressStream } from "./progress-stream";

describe("connectAppPipeline", () => {
  it("publishes every added note to the progress stream, not only activity notes", () => {
    const notes = new NotesStore(new DurableStore({ inMemory: true }));
    const supervisor = { subscribe: vi.fn() } as unknown as OverseerSupervisor;
    const companion = { notes, errors: { onError: vi.fn() } } as unknown as CompanionService;
    const stream = new ProgressStream();
    connectAppPipeline(supervisor, companion, stream);

    notes.add({ category: "observation", title: "manual note qq", content: "typed by the user" });
    notes.recordEvent("trigger_fired", "Trigger noted", "from a trigger");

    const titles = stream.since(0).events.filter((e) => e.kind === "note").map((e) => e.title);
    expect(titles).toEqual(["manual note qq", "Trigger noted"]);
  });
});
