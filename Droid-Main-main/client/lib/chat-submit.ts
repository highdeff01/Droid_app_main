/**
 * Enter-to-send for HUD chat/question inputs. Enter sends; Shift+Enter keeps a
 * newline in multiline inputs; an IME composition Enter never sends.
 */

export interface SubmitKeyEvent {
  key: string;
  shiftKey?: boolean;
  nativeEvent?: { isComposing?: boolean };
  preventDefault: () => void;
}

/** True when this keydown should send the message. */
export function isSubmitKey(event: Pick<SubmitKeyEvent, "key" | "shiftKey" | "nativeEvent">): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing;
}

/** onKeyDown handler: on a submit key, prevent the newline and send unless a request is in flight. */
export function submitOnEnter(onSubmit: () => void, busy = false) {
  return (event: SubmitKeyEvent) => {
    if (!isSubmitKey(event)) return;
    event.preventDefault();
    if (!busy) onSubmit();
  };
}
