/**
 * AI #1: Qwen Vision Perception & Feedback Positioning Engine
 * Inspects live screenshots to generate structured screen auto-descriptions,
 * detects UI elements with precise (X,Y,W,H) bounding boxes, and provides focus positioning.
 */

import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
} from "./ai-endpoint";
import { normalizeVisionReport } from "./vision-report";
import { detectScreenElementsAndSteps } from "./ai-gemini-service";
import type { AiMonitorBrowserContext } from "./ai-monitor-store";

export interface DetectedUIElement {
  id: string;
  name: string;
  type:
    | "button"
    | "input"
    | "icon"
    | "text"
    | "toggle"
    | "captcha"
    | "target"
    | "dialog"
    | "checkbox"
    | "other";
  boundingBox: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  /** Confidence the analysis reported; null when it reported none. */
  confidence: number | null;
  interactive: boolean;
  textValue?: string;
}

export interface ScreenPerceptionReport {
  timestamp: number;
  screenDescription: string;
  activeWindow: string;
  visualStateChange: string;
  elements: DetectedUIElement[];
  feedbackPosition: { x: number; y: number };
  primarySuggestion: string;
  /** Confidence the analysis reported; null when it reported none. */
  confidence: number | null;
  rawAnalysis?: string;
  /** "model" for a real analysis, "heuristic" for a placeholder. */
  source?: "model" | "heuristic";
  /** True when the report is not real analysis of the frame. */
  simulated?: boolean;
  simulationReason?: string;
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Mean of the element confidences the analysis supplied; null when none did. */
export function meanConfidence(elements: DetectedUIElement[]): number | null {
  const values = elements
    .map((el) => el.confidence)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Honest report for a failed analysis: no elements, no confidence, labelled simulated. */
export function perceptionUnavailableReport(
  errorMsg: string,
): ScreenPerceptionReport {
  return {
    timestamp: Date.now(),
    screenDescription: `Perception unavailable: ${errorMsg}`,
    activeWindow: "",
    visualStateChange: "",
    elements: [],
    feedbackPosition: { x: 0, y: 0 },
    primarySuggestion: "",
    confidence: null,
    source: "heuristic",
    simulated: true,
    simulationReason: errorMsg,
  };
}

export class QwenVisionPerceptionEngine {
  private lastDescription = "";
  private lastImageHash = "";

  async analyzeScreen(
    imageData: string,
    endpoint?: string,
    model?: string,
    browserContext?: AiMonitorBrowserContext | null,
  ): Promise<ScreenPerceptionReport> {
    const systemPrompt = `You are an expert Computer Vision Perception AI specialized in GUI and Game Automation.
Analyze the provided screenshot with high precision.
Return a STRICT valid JSON object matching this schema:
{
  "screenDescription": "Concise summary of what is currently displayed on the screen, active dialogs, and current view",
  "activeWindow": "Name or title of the main application/window in focus",
  "visualStateChange": "Notable state changes observed (e.g., modal opened, button active, input focused, page loaded, captcha prompt)",
  "feedbackPosition": { "x": 960, "y": 540 },
  "primarySuggestion": "Immediate recommended visual focus or next action candidate",
  "confidence": 0.95,
  "elements": [
    {
      "id": "elem_1",
      "name": "Submit Button",
      "type": "button",
      "boundingBox": { "x": 800, "y": 600, "width": 120, "height": 40 },
      "center": { "x": 860, "y": 620 },
      "confidence": 0.92,
      "interactive": true,
      "textValue": "Submit"
    }
  ]
}
IMPORTANT: Output ONLY the raw JSON without markdown formatting or code blocks. Coordinates must be based on a standard 1920x1080 resolution.`;

    const browserSection = this.describeBrowserContext(browserContext);
    const systemPromptWithBrowser = browserSection
      ? `${systemPrompt}\n\n${browserSection}`
      : systemPrompt;

    try {
      const response = await sendQwenChatRequest(
        [
          { role: "system", content: systemPromptWithBrowser },
          buildVisionMessage(
            "Perform complete visual breakdown of this screen, identify all interactive UI elements with bounding boxes and coordinates, and suggest the key visual focus point.",
            imageData,
          ),
        ],
        { endpoint, model, format: "json" },
      );
      if (!response.success) {
        throw new Error(response.error || "Qwen vision unavailable");
      }

      const parsed = normalizeVisionReport(
        parseModelJson(response.content),
        response.content,
      );
      const report: ScreenPerceptionReport = {
        ...parsed,
        screenDescription:
          parsed.screenDescription ||
          "Active workspace display with interactive elements.",
        activeWindow: parsed.activeWindow || "Main Application",
        visualStateChange:
          parsed.visualStateChange ||
          (this.lastDescription ? "State updated" : "Initial frame"),
        elements: this.mergeBrowserElements(parsed.elements, browserContext),
        source: "model",
        simulated: false,
      };

      this.lastDescription = report.screenDescription;
      return report;
    } catch (err) {
      if (!process.env.GEMINI_API_KEY) {
        return perceptionUnavailableReport(errorText(err));
      }
      console.warn("Qwen Vision perception failed, using configured Gemini:", err);
      try {
        return await this.analyzeWithLocalProvider(imageData, browserContext);
      } catch (geminiErr) {
        return perceptionUnavailableReport(
          `${errorText(err)}; Gemini: ${errorText(geminiErr)}`,
        );
      }
    }
  }

  /**
   * Perception via the app's configured AI provider (Gemini). Falls back to the
   * heuristic report internally when no API key is configured.
   */
  private async analyzeWithLocalProvider(
    imageData: string,
    browserContext?: AiMonitorBrowserContext | null,
  ): Promise<ScreenPerceptionReport> {
    const analysis = await detectScreenElementsAndSteps({ imageData });

    const elements: DetectedUIElement[] = (analysis.elements || []).map(
      (el, idx) => ({
        id: el.id || `elem_${idx + 1}`,
        name: el.name || `Element ${idx + 1}`,
        type: this.normalizeElementType(el.type),
        boundingBox: {
          x: el.x,
          y: el.y,
          width: el.width || 80,
          height: el.height || 35,
        },
        center: { x: el.x, y: el.y },
        confidence: finiteOrNull(el.confidence),
        interactive: true,
        textValue: el.suggestedTextPayload || "",
      }),
    );

    const focus = analysis.primaryActionTarget;
    const page = browserContext?.page;
    const simulated = analysis.simulated === true;
    const report: ScreenPerceptionReport = {
      timestamp: Date.now(),
      screenDescription:
        this.describePage(browserContext) ||
        analysis.summary ||
        "Active workspace display with interactive elements.",
      activeWindow:
        page?.title || browserContext?.activeTab?.title || "Active Application",
      visualStateChange: this.lastDescription ? "State updated" : "Initial frame",
      elements: this.mergeBrowserElements(elements, browserContext),
      feedbackPosition: focus ? { x: focus.x, y: focus.y } : { x: 0, y: 0 },
      primarySuggestion: focus?.label ? `Focus ${focus.label}` : "",
      confidence: simulated ? null : meanConfidence(elements),
      source: simulated ? "heuristic" : "model",
      simulated,
      ...(simulated ? { simulationReason: analysis.simulationReason } : {}),
    };

    this.lastDescription = report.screenDescription;
    return report;
  }

  /**
   * Builds the prompt section describing the live browser tabs and page
   * elements, so the model interprets the web page rather than only pixels.
   */
  private describeBrowserContext(
    browserContext?: AiMonitorBrowserContext | null,
  ): string {
    if (!browserContext) return "";
    const { page, tabs, elements } = browserContext;
    const lines: string[] = [
      "BROWSER CONTEXT (authoritative, captured from the live page):",
      `- Active tab: "${page?.title || browserContext.activeTab?.title || "unknown"}" at ${page?.url || browserContext.activeTab?.url || "unknown"}`,
      `- Viewport: ${page?.viewport ? `${page.viewport.width}x${page.viewport.height}` : "unknown"}`,
    ];
    if (tabs.length > 1) {
      lines.push(
        `- Open tabs (${tabs.length}): ${tabs
          .slice(0, 10)
          .map((t) => `"${t.title}"`)
          .join(", ")}`,
      );
    }
    if (elements.length > 0) {
      lines.push(
        `- Page elements (${elements.length}, coordinates are page-relative):`,
        ...elements
          .slice(0, 40)
          .map(
            (el) =>
              `  • ${el.name} [${el.type}] selector="${el.selector || "n/a"}" center=(${el.x}, ${el.y}) size=${el.width}x${el.height}`,
          ),
      );
      lines.push(
        "Prefer these page elements over visually guessed ones, and reuse their names and coordinates in your JSON output.",
      );
    }
    return lines.join("\n");
  }

  private describePage(
    browserContext?: AiMonitorBrowserContext | null,
  ): string {
    if (!browserContext) return "";
    const title = browserContext.page?.title || browserContext.activeTab?.title;
    const url = browserContext.page?.url || browserContext.activeTab?.url;
    if (!title && !url) return "";
    return `Browser tab "${title || url}"${url ? ` (${url})` : ""} with ${browserContext.elements.length} interactive page element(s).`;
  }

  /** Puts exact DOM elements from the live page in front of visually detected ones. */
  private mergeBrowserElements(
    visionElements: DetectedUIElement[],
    browserContext?: AiMonitorBrowserContext | null,
  ): DetectedUIElement[] {
    if (!browserContext || browserContext.elements.length === 0) {
      return visionElements;
    }

    const domElements: DetectedUIElement[] = browserContext.elements.map(
      (el) => ({
        id: el.id,
        name: el.name,
        type: this.normalizeElementType(el.type),
        boundingBox: {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        },
        center: { x: el.x, y: el.y },
        confidence: finiteOrNull(el.confidence),
        interactive: (el as any).interactive ?? true,
        textValue: (el as any).textValue || (el as any).text || "",
      }),
    );

    const domNames = new Set(domElements.map((el) => el.name.toLowerCase()));
    const extras = visionElements.filter(
      (el) => !domNames.has(el.name.toLowerCase()),
    );

    return [...domElements, ...extras].slice(0, 80);
  }

  private normalizeElementType(type: string): DetectedUIElement["type"] {
    switch (type) {
      case "button":
      case "input":
      case "icon":
      case "text":
      case "toggle":
      case "checkbox":
        return type;
      case "tab":
      case "link":
        return "button";
      case "dropdown":
      case "scroll_area":
        return "input";
      default:
        return "other";
    }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const qwenVisionEngine = new QwenVisionPerceptionEngine();
