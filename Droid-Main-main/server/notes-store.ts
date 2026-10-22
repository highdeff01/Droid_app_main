import type {
  CompanionNote,
  ImportantEventKind,
  NoteCategory,
} from "@shared/companion";
import type { DurableStore } from "./durable-store";
import { CompanionCollection, createCompanionId, nowIso } from "./companion-store";

export interface NoteInput {
  category: NoteCategory;
  title: string;
  content?: string;
  tags?: string[];
  event?: ImportantEventKind;
  screenshot?: string;
}

const SCREENSHOT_PATTERN = /^data:image\/(png|jpeg);base64,/;

const STOP_WORDS = new Set([
  "show", "me", "the", "a", "an", "when", "what", "happened", "screenshot",
  "screenshots", "of", "to", "it", "was", "is", "did", "and", "or", "my", "i",
  "in", "on", "at", "for", "that", "this", "with", "from", "please", "can", "you",
]);

/** Lowercase search keywords of a free-text query, minus filler words. */
export function keywords(text: string): string[] {
  const words: string[] = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
  return words.filter(
    (word) => word.length > 1 && !STOP_WORDS.has(word),
  );
}

function matchScore(note: CompanionNote, words: string[]): number {
  const haystack =
    `${note.title} ${note.content} ${note.tags.join(" ")} ${note.event ?? ""}`.toLowerCase();
  return words.filter((word) => haystack.includes(word)).length;
}

/** Notes the AI saves (requests, observations, decisions, goal states) and important-event screenshots. */
export class NotesStore {
  private readonly notes: CompanionCollection<CompanionNote>;
  private readonly listeners = new Set<(note: CompanionNote) => void>();

  constructor(store: DurableStore) {
    this.notes = new CompanionCollection<CompanionNote>(store, "companionNotes");
  }

  add(input: NoteInput): CompanionNote {
    if (!input.title?.trim()) throw new Error("A note needs a title");
    if (input.screenshot && !SCREENSHOT_PATTERN.test(input.screenshot))
      throw new Error("A note screenshot must be a PNG/JPEG data URL");
    const tags = (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const note = this.notes.insert({
      id: createCompanionId("note"),
      category: input.category,
      title: input.title.trim(),
      content: input.content ?? "",
      tags: [...new Set(tags)],
      event: input.event,
      screenshot: input.screenshot,
      createdAt: nowIso(),
    });
    this.listeners.forEach((listener) => listener(note));
    return note;
  }

  /** Calls the listener with every note added from now on; returns the unsubscribe. */
  onAdd(listener: (note: CompanionNote) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Records an important event, tagged with its kind; the screenshot is the frame at that moment. */
  recordEvent(
    event: ImportantEventKind,
    title: string,
    content: string,
    screenshot?: string,
    tags: string[] = [],
  ): CompanionNote {
    return this.add({ category: "event", title, content, event, screenshot, tags: [event, ...tags] });
  }

  get(id: string): CompanionNote | undefined {
    return this.notes.get(id);
  }

  remove(id: string): boolean {
    return this.notes.remove(id);
  }

  /** Newest first, optionally only one tag or only notes carrying a screenshot. */
  list(filter: { tag?: string; withScreenshot?: boolean } = {}): CompanionNote[] {
    const tag = filter.tag?.toLowerCase();
    return this.notes
      .all()
      .filter((note) => !tag || note.tags.includes(tag))
      .filter((note) => !filter.withScreenshot || !!note.screenshot)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Screenshot notes matching any keyword of the query, best match then newest first. */
  searchScreenshots(query: string, limit = 3): CompanionNote[] {
    const words = keywords(query);
    if (words.length === 0) return [];
    return this.list({ withScreenshot: true })
      .map((note) => ({ note, score: matchScore(note, words) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((match) => match.note);
  }
}
