import type { TriggerObservation } from "@shared/companion";
import { buildVisionMessage, parseModelJson, sendQwenChatRequest } from "./ai-endpoint";
import { recognizeWithProviders } from "./ocr-provider";
import { createReplayAdapter } from "./replay-adapter";
import { VISION_REPORT_PROMPT, normalizeVisionReport } from "./vision-report";

export interface ObservationTarget {
  targetDevice: "desktop" | "android";
  deviceId?: string;
}

/**
 * Builds a trigger observation from a fresh capture: the vision report gives
 * the screen description and elements, OCR gives the text. A failing analysis
 * leaves its fields unset so conditions depending on it are not evaluated.
 */
export async function observeScreen(
  target: ObservationTarget,
  needs: { vision: boolean; ocr: boolean },
): Promise<TriggerObservation> {
  const frame = await createReplayAdapter(target).capture();
  const observation: TriggerObservation = { at: Date.now(), frame: frame.image };
  const [vision, ocr] = await Promise.all([
    needs.vision ? analyzeFrame(frame.image) : undefined,
    needs.ocr ? recognizeWithProviders({ imageData: frame.image }) : undefined,
  ]);
  if (vision) {
    observation.screenDescription = vision.screenDescription;
    observation.elements = vision.elements.map((e) => ({ name: e.name, textValue: e.textValue }));
  }
  if (ocr?.result) observation.ocrText = ocr.result.text.map((block) => block.text).join("\n");
  return observation;
}

async function analyzeFrame(image: string) {
  const response = await sendQwenChatRequest(
    [
      { role: "system", content: VISION_REPORT_PROMPT },
      buildVisionMessage("Inspect this current screen", image),
    ],
    { format: "json" },
  );
  if (!response.success) return undefined;
  try {
    return normalizeVisionReport(parseModelJson(response.content), response.content);
  } catch {
    return undefined;
  }
}
