import { SequenceStep, UIElementBox } from "@/components/live-screen-hud";

export interface WorkflowStep extends SequenceStep {
  selector?: string;
  originalX?: number;
  originalY?: number;
  offsetX?: number;
  offsetY?: number;
  driftDistancePx?: number;
  breakpoint?: boolean;
  lastCalibratedAt?: number;
  failureCount?: number;
  stabilityScore?: number; // 0 to 100%
}

export interface DriftHeatmapPoint {
  id: string;
  x: number;
  y: number;
  radius: number;
  driftPx: number;
  intensity: number; // 0 to 1
  frequency: number;
  selectorName: string;
  isProblematic: boolean;
  status: "critical" | "moderate" | "stable";
}

export interface AutoCalibrationResult {
  success: boolean;
  calibratedSteps: WorkflowStep[];
  recalibratedCount: number;
  thresholdPx: number;
  driftPoints: DriftHeatmapPoint[];
  summary: string;
  timestamp: number;
  logs: string[];
}

export const DEFAULT_DRIFT_THRESHOLD_PX = 8;

export const INITIAL_RECORDED_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "step_login_nav",
    stepNumber: 1,
    name: "Click Primary Navigation / Login Anchor",
    action: "click",
    selector: "#nav-auth-login-button",
    x: 1720,
    y: 52,
    originalX: 1720,
    originalY: 52,
    offsetX: 0,
    offsetY: 0,
    driftDistancePx: 2.1,
    delayMs: 350,
    status: "pending",
    stabilityScore: 94,
    breakpoint: false,
    targetOcrLabel: "Log In",
  },
  {
    id: "step_email_input",
    stepNumber: 2,
    name: "Focus & Enter User Account Email",
    action: "type_text",
    selector: "input[type='email']#user-id-field",
    x: 960,
    y: 380,
    originalX: 960,
    originalY: 380,
    offsetX: 14,
    offsetY: -8,
    driftDistancePx: 16.1, // Drifting > threshold (8px)
    delayMs: 450,
    text: "operator.lead@enterprise.ai",
    status: "pending",
    stabilityScore: 62,
    breakpoint: false,
    targetOcrLabel: "Email or Username",
  },
  {
    id: "step_remember_chk",
    stepNumber: 3,
    name: "Toggle Keep Session Active Checkbox",
    action: "click",
    selector: ".auth-card label.checkbox-remember-session",
    x: 885,
    y: 490,
    originalX: 885,
    originalY: 490,
    offsetX: 12,
    offsetY: 6,
    driftDistancePx: 13.4, // Problematic selector
    delayMs: 300,
    status: "pending",
    stabilityScore: 58,
    breakpoint: true, // Sample breakpoint
    targetOcrLabel: "Stay signed in for 30 days",
  },
  {
    id: "step_auth_submit",
    stepNumber: 4,
    name: "Click Confirm & Authenticate Button",
    action: "click",
    selector: "button#btn-submit-credentials",
    x: 960,
    y: 560,
    originalX: 960,
    originalY: 560,
    offsetX: 0,
    offsetY: 0,
    driftDistancePx: 3.5,
    delayMs: 600,
    status: "pending",
    stabilityScore: 96,
    breakpoint: false,
    targetOcrLabel: "Authenticate",
  },
  {
    id: "step_dashboard_ready",
    stepNumber: 5,
    name: "Verify Main Application Dashboard Ready",
    action: "wait",
    selector: "main.dashboard-container .header-metrics",
    x: 960,
    y: 120,
    originalX: 960,
    originalY: 120,
    offsetX: 0,
    offsetY: 0,
    driftDistancePx: 1.2,
    delayMs: 800,
    status: "pending",
    stabilityScore: 98,
    breakpoint: false,
    targetOcrLabel: "Dashboard Overview",
  },
];

const STORAGE_KEY = "unified_sequence";
const CALIBRATION_HIST_KEY = "workflow_calibration_history";

/**
 * Loads the persisted workflow steps from local storage, normalizing
 * legacy fields and seeding the default steps on first use.
 */
export function loadStoredWorkflowSteps(): WorkflowStep[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveStoredWorkflowSteps(INITIAL_RECORDED_WORKFLOW_STEPS);
      return INITIAL_RECORDED_WORKFLOW_STEPS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((s, idx) => ({
        ...s,
        stepNumber: s.stepNumber || idx + 1,
        originalX: s.originalX ?? s.x,
        originalY: s.originalY ?? s.y,
        offsetX: s.offsetX ?? 0,
        offsetY: s.offsetY ?? 0,
        driftDistancePx: s.driftDistancePx ?? 0,
        selector: s.selector || s.targetOcrLabel || s.name || `Selector #${idx + 1}`,
      }));
    }
  } catch (err) {
    console.error("Failed to load workflow steps from storage:", err);
  }
  return INITIAL_RECORDED_WORKFLOW_STEPS;
}

/**
 * Persists the given workflow steps to local storage and notifies listeners
 * via a `workflow-sequence-updated` custom event.
 */
export function saveStoredWorkflowSteps(steps: WorkflowStep[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    window.dispatchEvent(
      new CustomEvent("workflow-sequence-updated", { detail: { steps } })
    );
  } catch (err) {
    console.error("Failed to save workflow steps:", err);
  }
}

export const loadUnifiedSequence = loadStoredWorkflowSteps;
export const saveUnifiedSequence = saveStoredWorkflowSteps;


/**
 * Computes color-coded pixel comparison drift heatmap points
 */
export function computePixelDriftHeatmap(
  steps: WorkflowStep[],
  thresholdPx: number = DEFAULT_DRIFT_THRESHOLD_PX,
  elements: UIElementBox[] = []
): DriftHeatmapPoint[] {
  const points: DriftHeatmapPoint[] = [];

  // 1. Add points from workflow steps
  steps.forEach((step, idx) => {
    const drift = step.driftDistancePx ?? Math.hypot(step.offsetX || 0, step.offsetY || 0);
    const isProblematic = drift > thresholdPx;
    const status: DriftHeatmapPoint["status"] =
      drift > thresholdPx ? "critical" : drift > thresholdPx / 2 ? "moderate" : "stable";

    // Effective display coordinates
    const curX = (step.originalX ?? step.x) + (step.offsetX ?? 0);
    const curY = (step.originalY ?? step.y) + (step.offsetY ?? 0);

    points.push({
      id: `pt_step_${step.id || idx}`,
      x: curX,
      y: curY,
      radius: isProblematic ? 48 : 32,
      driftPx: Math.round(drift * 10) / 10,
      intensity: Math.min(1, Math.max(0.15, drift / (thresholdPx * 1.5))),
      frequency: isProblematic ? 5 : 1,
      selectorName: step.selector || step.name,
      isProblematic,
      status,
    });
  });

  // 2. Add points from elements if available
  elements.forEach((el, idx) => {
    const center = el.center || {
      x: el.boundingBox.x + el.boundingBox.width / 2,
      y: el.boundingBox.y + el.boundingBox.height / 2,
    };
    // If not already close to a step point
    const hasClosePoint = points.some(
      (p) => Math.hypot(p.x - center.x, p.y - center.y) < 30
    );
    if (!hasClosePoint) {
      points.push({
        id: `pt_el_${el.id || idx}`,
        x: center.x,
        y: center.y,
        radius: 24,
        driftPx: 1.5,
        intensity: 0.15,
        frequency: 1,
        selectorName: el.name,
        isProblematic: false,
        status: "stable",
      });
    }
  });

  return points;
}

/**
 * Triggers a re-scan of the current UI state to update coordinate offsets
 * for stored automation steps when pixel-drift exceeds the predefined threshold.
 */
export async function executeAutoCalibration(options: {
  steps: WorkflowStep[];
  thresholdPx?: number;
  elements?: UIElementBox[];
  screenshotUrl?: string;
  onProgress?: (status: string) => void;
}): Promise<AutoCalibrationResult> {
  const threshold = options.thresholdPx ?? DEFAULT_DRIFT_THRESHOLD_PX;
  options.onProgress?.(`Initiating UI state scan with ${threshold}px threshold...`);
  let failureReason = "Calibration service did not return verified element positions.";

  try {
    const response = await fetch("/api/ai/auto-calibrate-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: options.steps,
        thresholdPx: threshold,
        elements: options.elements || [],
        screenshotUrl: options.screenshotUrl,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && Array.isArray(data.calibratedSteps)) {
        const calibrated = data.calibratedSteps as WorkflowStep[];
        saveStoredWorkflowSteps(calibrated);

        const result: AutoCalibrationResult = {
          success: true,
          calibratedSteps: calibrated,
          recalibratedCount: data.recalibratedCount,
          thresholdPx: threshold,
          driftPoints: data.driftPoints || computePixelDriftHeatmap(calibrated, threshold),
          summary: data.summary,
          timestamp: Date.now(),
          logs: data.logs || [],
        };

        // Notify app components
        window.dispatchEvent(
          new CustomEvent("workflow-auto-calibrated", { detail: result })
        );

        return result;
      }
      failureReason = data.error || data.summary || failureReason;
    } else {
      const errorBody = await response.json().catch(() => null);
      failureReason = errorBody?.error || `Calibration service returned HTTP ${response.status}.`;
    }
  } catch (err) {
    failureReason = `Calibration service is unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }

  options.onProgress?.(failureReason);
  return {
    success: false,
    calibratedSteps: options.steps,
    recalibratedCount: 0,
    thresholdPx: threshold,
    driftPoints: [],
    summary: failureReason,
    timestamp: Date.now(),
    logs: [failureReason],
  };
}
