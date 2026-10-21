import type { VisualLookout } from "@shared/assistant";

export interface VisualElementCandidate {
  name?: string;
  textValue?: string;
  confidence?: number;
  center?: { x: number; y: number };
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface LookoutResult {
  lookout: VisualLookout;
  satisfied: boolean;
  matchedElement?: VisualElementCandidate;
  reason: string;
}

/** Returns the center point of a visual element, deriving it from the bounding box if needed. */
function elementCenter(element: VisualElementCandidate) {
  if (element.center) return element.center;
  if (!element.boundingBox) return undefined;
  return {
    x: element.boundingBox.x + element.boundingBox.width / 2,
    y: element.boundingBox.y + element.boundingBox.height / 2,
  };
}

/** Returns true when the element's center point falls within the lookout's region. */
function isInsideLookout(element: VisualElementCandidate, lookout: VisualLookout) {
  const center = elementCenter(element);
  if (!center) return false;
  const { x, y, width, height } = lookout.region;
  return center.x >= x && center.x <= x + width && center.y >= y && center.y <= y + height;
}

/**
 * Evaluates each configured visual lookout against the detected elements
 * (and whether the frame changed), returning per-lookout satisfaction
 * results along with aggregate stop/retry signals.
 */
export function evaluateVisualLookouts(
  lookouts: VisualLookout[],
  elements: VisualElementCandidate[],
  frameChanged: boolean,
) {
  const results: LookoutResult[] = lookouts.map((lookout) => {
    if (lookout.expectation === "changed") {
      return {
        lookout,
        satisfied: frameChanged,
        reason: frameChanged
          ? `${lookout.label}: the captured screen changed.`
          : `${lookout.label}: the captured screen has not changed yet.`,
      };
    }

    const expected = lookout.expectedText?.trim().toLowerCase();
    const matchedElement = elements.find((element) => {
      if ((element.confidence ?? 0) < lookout.minConfidence) return false;
      if (!isInsideLookout(element, lookout)) return false;
      if (!expected) return true;
      return `${element.name ?? ""} ${element.textValue ?? ""}`
        .toLowerCase()
        .includes(expected);
    });
    const found = Boolean(matchedElement);
    const satisfied = lookout.expectation === "present" ? found : !found;
    return {
      lookout,
      satisfied,
      matchedElement,
      reason: `${lookout.label}: ${expected ? `“${lookout.expectedText}” ` : "an element "}${
        found ? "was" : "was not"
      } detected in the selected region.`,
    };
  });

  return {
    results,
    allSatisfied: results.every((result) => result.satisfied),
    shouldStop: results.some(
      (result) =>
        (result.satisfied && result.lookout.onMatch === "stop") ||
        (!result.satisfied && result.lookout.onMiss === "stop"),
    ),
    shouldRetry: results.some(
      (result) => !result.satisfied && result.lookout.onMiss === "retry",
    ),
  };
}
