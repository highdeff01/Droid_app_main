import { createHash } from "crypto";
import type {
  OCRTextBlock,
  WaitCondition,
  WaitConditionObservation,
} from "@shared/assistant";
import { captureDesktopFrame } from "./routes/screen-capture";
import { recognizeWithProviders } from "./ocr-provider";

type StabilityState = {
  fingerprint: string;
  stableSince: number;
};

const stability = new Map<string, StabilityState>();

/** Computes a stable SHA-256 fingerprint of raw image data for change detection. */
const fingerprint = (imageData: string) =>
  createHash("sha256").update(imageData).digest("hex");

/** Infers close/next UI controls from OCR text blocks based on common button phrasing. */
function controlsFromText(text: OCRTextBlock[]) {
  return text.flatMap((block) => {
    const value = block.text.trim();
    const normalized = value.toLocaleLowerCase();
    const type =
      /^(close|dismiss|cancel|skip|no thanks|×)$/i.test(value) ||
      normalized.includes("close") ||
      normalized.includes("dismiss")
        ? "close"
        : /^(next|continue|proceed|submit|done)$/i.test(value) ||
            normalized.includes("next") ||
            normalized.includes("continue")
          ? "next"
          : undefined;
    return type
      ? [
          {
            type: type as "close" | "next",
            label: value,
            confidence: block.confidence,
          },
        ]
      : [];
  });
}

/** Error raised when a fresh wait observation (capture or OCR) cannot be obtained. */
export class WaitObservationError extends Error {
  /** Creates the error with the given message. */
  constructor(message: string) {
    super(message);
    this.name = "WaitObservationError";
  }
}

/** Tracks page-load stability across observations so conditions can detect when the screen stops changing. */
export class WaitObservationTracker {
  /**
   * Builds a `WaitConditionObservation` from the latest OCR text, updating
   * the page-load stability tracker for `page_load_stable` conditions.
   */
  observe(
    condition: WaitCondition,
    imageData: string,
    text: OCRTextBlock[],
    now = Date.now(),
  ): WaitConditionObservation {
    const observation: WaitConditionObservation = {
      visibleText: text.map((block) => block.text).join(" "),
      regions: text.flatMap((block) => (block.region ? [block.region] : [])),
      controls: controlsFromText(text),
    };

    if (condition.type === "page_load_stable") {
      const currentFingerprint = fingerprint(imageData);
      const previous = stability.get(condition.id);
      const stableSince =
        previous?.fingerprint === currentFingerprint
          ? previous.stableSince
          : now;
      stability.set(condition.id, {
        fingerprint: currentFingerprint,
        stableSince,
      });
      observation.pageLoadStable = now - stableSince >= condition.stableForMs;
    }

    return observation;
  }

  /** Clears stability tracking state for `conditionId`, or for all conditions if omitted. */
  reset(conditionId?: string) {
    if (conditionId) stability.delete(conditionId);
    else stability.clear();
  }
}

export const waitObservationTracker = new WaitObservationTracker();

/**
 * Captures a fresh desktop frame, runs OCR on it, and builds the resulting
 * wait-condition observation, throwing a `WaitObservationError` if the
 * capture or OCR step fails.
 */
export async function captureWaitObservation(
  condition: WaitCondition,
  startedAt: number,
): Promise<{
  observation: WaitConditionObservation;
  ocrProvider: string;
  ocrErrors: string[];
}> {
  const frame = await captureDesktopFrame();
  if (!frame.success || !frame.imageData) {
    throw new WaitObservationError(
      frame.error ?? "Fresh screen capture was unavailable",
    );
  }
  const ocr = await recognizeWithProviders({ imageData: frame.imageData });
  if (!ocr.result) {
    throw new WaitObservationError(
      `Fresh OCR analysis was unavailable${ocr.errors.length ? `: ${ocr.errors.join("; ")}` : ""}`,
    );
  }
  const observation = waitObservationTracker.observe(
    condition,
    frame.imageData,
    ocr.result.text,
  );
  if (condition.type === "timer") {
    observation.timerElapsedMs = Date.now() - startedAt;
  }
  return {
    observation,
    ocrProvider: ocr.result.provider,
    ocrErrors: ocr.errors,
  };
}
