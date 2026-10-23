import { describe, expect, it, vi } from "vitest";
import { isSubmitKey, submitOnEnter } from "./chat-submit";

const key = (init: { key: string; shiftKey?: boolean; isComposing?: boolean }) => ({
  key: init.key,
  shiftKey: init.shiftKey,
  nativeEvent: { isComposing: init.isComposing },
  preventDefault: vi.fn(),
});

describe("chat-submit", () => {
  it("treats plain Enter as send", () => {
    expect(isSubmitKey(key({ key: "Enter" }))).toBe(true);
  });

  it("keeps Shift+Enter as a newline and ignores other keys and IME composition", () => {
    expect(isSubmitKey(key({ key: "Enter", shiftKey: true }))).toBe(false);
    expect(isSubmitKey(key({ key: "a" }))).toBe(false);
    expect(isSubmitKey(key({ key: "Enter", isComposing: true }))).toBe(false);
  });

  it("sends once on Enter and prevents the newline", () => {
    const onSubmit = vi.fn();
    const event = key({ key: "Enter" });
    submitOnEnter(onSubmit)(event);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not send while a request is in flight", () => {
    const onSubmit = vi.fn();
    const event = key({ key: "Enter" });
    submitOnEnter(onSubmit, true)(event);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("lets Shift+Enter through without sending", () => {
    const onSubmit = vi.fn();
    const event = key({ key: "Enter", shiftKey: true });
    submitOnEnter(onSubmit)(event);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
