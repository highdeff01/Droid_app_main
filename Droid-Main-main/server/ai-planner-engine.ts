/**
 * AI #2: Reasoning Planner, Goal Organizer & Action Verification Engine
 * Interprets vision reports, generates multi-step Chain of Thought thinking,
 * dynamically reorganizes goals/tasks, synthesizes actions, and verifies execution outcomes.
 */

import {
  ScreenPerceptionReport,
  DetectedUIElement,
} from "./ai-perception-engine";
import {
  AiUnavailableError,
  buildVisionMessage,
  parseModelJson,
} from "./ai-endpoint";
import { aiConversations } from "./ai-conversation";

/** Default conversation for Plan when the caller names no session. */
export const PLANNER_SESSION_ID = "plan";

/** Live context sent with a planning turn. */
export interface PlannerContext {
  /** The live captured frame (data URL) so the model sees the actual screen. */
  imageData?: string;
  /** Conversation the turn belongs to; history is kept per session. */
  sessionId?: string;
}

export interface AIThinkingChain {
  observation: string;
  reasoning: string;
  strategy: string;
  /** The model's own confidence; null when the model gave none. */
  confidence: number | null;
}

/** Where a decision came from: always model output; an unreachable model is an AiUnavailableError. */
export type PlannerDecisionSource = "model";

export interface SubTask {
  id: string;
  title: string;
  actionType:
    | "click"
    | "double_click"
    | "right_click"
    | "type_text"
    | "scroll"
    | "wait";
  targetName?: string;
  x?: number;
  y?: number;
  textPayload?: string;
  delayMs: number;
  status: "pending" | "in_progress" | "completed" | "failed";
}

export interface GoalNode {
  id: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: "pending" | "in_progress" | "completed" | "blocked";
  subtasks: SubTask[];
  category?:
    | "navigation"
    | "data_entry"
    | "captcha"
    | "interaction"
    | "verification";
}

export interface VerificationRule {
  expectedChange: string;
  targetRegion: { x: number; y: number; width: number; height: number };
  successCondition: string;
  retryStrategy: string;
  verified?: boolean;
}

export interface PlannerActDecision {
  timestamp: number;
  thinking: AIThinkingChain;
  goals: GoalNode[];
  nextAction: SubTask | null;
  verificationRule: VerificationRule | null;
  statusSummary: string;
  source: PlannerDecisionSource;
  /** True only when the decision was derived from model output. */
  verified: boolean;
}

/** The model's numeric confidence clamped to [0, 1] (0 preserved); null when absent or non-numeric. */
export function readPlannerConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

export class AIPlannerActorEngine {
  private activeGoals: GoalNode[] = [];
  private actionHistory: Array<{
    action: SubTask;
    success: boolean;
    verified: boolean;
    timestamp: number;
  }> = [];

  constructor() {
    this.initializeDefaultGoals();
  }

  private initializeDefaultGoals() {
    this.activeGoals = [
      {
        id: "goal_primary",
        title: "Analyze Screen & Identify Objectives",
        description:
          "Examine interactive UI controls and plan sequential automation flow",
        priority: 1,
        status: "in_progress",
        category: "navigation",
        subtasks: [
          {
            id: "sub_1",
            title: "Inspect UI Layout",
            actionType: "wait",
            delayMs: 250,
            status: "completed",
          },
          {
            id: "sub_2",
            title: "Ground Interactive Elements",
            actionType: "click",
            x: 960,
            y: 540,
            delayMs: 400,
            status: "pending",
          },
        ],
      },
    ];
  }

  async planAndFormulateAction(
    perception: ScreenPerceptionReport,
    userObjective?: string,
    endpoint?: string,
    model?: string,
    context: PlannerContext = {},
  ): Promise<PlannerActDecision> {
    const systemPrompt = `You are an elite Autonomous AI Planner and Action Synthesizer.
You receive a Vision Perception Report of the active user desktop/application screen.
Your job is to:
1. THINK systematically (Observation -> Reasoning -> Strategic Plan).
2. DECIDE: INTERACT or WATCH. If the screen shows moving elements, animations
   in progress, loading spinners, obstacles (modals, popups, permission
   dialogs), or the state is still settling, choose WATCH: return a nextAction
   with actionType "wait", a clear title like "Watching: <reason>", and the
   reason in your reasoning. Only choose INTERACT when the target is stable
   and the action is safe to perform now.
3. REORGANIZE and refine the high-level Goals and actionable SubTasks.
4. FORMULATE the exact immediate next Action with (X,Y) coordinates and delay
   (or the "wait" watch action from step 2).
5. SPECIFY the Verification Rule to validate whether the action succeeded visually.

Respond with STRICT JSON matching this schema:
{
  "thinking": {
    "observation": "Detailed observation from vision report and screen state",
    "reasoning": "Logical deduction of why the next action is needed",
    "strategy": "Strategic plan for upcoming sequence",
    "confidence": 0.94
  },
  "goals": [
    {
      "id": "goal_1",
      "title": "Complete Form Entry & Verification",
      "description": "Fill required fields and click submit",
      "priority": 1,
      "status": "in_progress",
      "category": "data_entry",
      "subtasks": [
        {
          "id": "sub_1",
          "title": "Click Input Field",
          "actionType": "click",
          "targetName": "Username Field",
          "x": 860,
          "y": 420,
          "delayMs": 400,
          "status": "in_progress"
        }
      ]
    }
  ],
  "nextAction": {
    "id": "sub_1",
    "title": "Click Input Field",
    "actionType": "click",
    "targetName": "Username Field",
    "x": 860,
    "y": 420,
    "delayMs": 400,
    "status": "in_progress"
  },
  "verificationRule": {
    "expectedChange": "Cursor focus appears inside input box or highlight border turns blue",
    "targetRegion": { "x": 800, "y": 400, "width": 120, "height": 40 },
    "successCondition": "Input field state changes to active/focused",
    "retryStrategy": "Re-click element with +5px offset and increase delay to 800ms"
  },
  "statusSummary": "Executing Step: Click Input Field"
}
IMPORTANT: Output ONLY the raw JSON without code blocks or extra text.`;

    const userPrompt = `Vision Report:
- Screen Description: ${perception.screenDescription}
- Active Window: ${perception.activeWindow}
- State Delta: ${perception.visualStateChange}
- Suggested Focus Point: (${perception.feedbackPosition.x}, ${perception.feedbackPosition.y})
- Detected Elements (${perception.elements.length}): ${JSON.stringify(perception.elements.slice(0, 8))}
- User High-Level Objective: ${userObjective || "Automatically navigate, interact, and solve any challenges on screen"}
- Current Active Goals: ${JSON.stringify(this.activeGoals.map((g) => ({ title: g.title, status: g.status })))}`;

    const response = await aiConversations.send(
      context.sessionId || PLANNER_SESSION_ID,
      context.imageData
        ? buildVisionMessage(userPrompt, context.imageData)
        : { role: "user", content: userPrompt },
      { system: systemPrompt, endpoint, model, format: "json" },
    );
    if (!response.success) {
      throw new AiUnavailableError(
        `AI endpoint unreachable: ${response.error || "no response"}`,
      );
    }

    let parsed: any;
    try {
      parsed = parseModelJson(response.content || "");
    } catch (parseErr) {
      throw new AiUnavailableError(
        `AI model returned an unreadable plan: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }

    if (Array.isArray(parsed.goals) && parsed.goals.length > 0) {
      this.activeGoals = parsed.goals;
    }

    const nextAction: SubTask | null = parsed.nextAction
      ? {
          id: parsed.nextAction.id || `act_${Date.now()}`,
          title: parsed.nextAction.title || "Execute Next Step",
          actionType: parsed.nextAction.actionType || "click",
          targetName: parsed.nextAction.targetName || "Target Element",
          x: parsed.nextAction.x ?? perception.feedbackPosition.x,
          y: parsed.nextAction.y ?? perception.feedbackPosition.y,
          textPayload: parsed.nextAction.textPayload,
          delayMs: parsed.nextAction.delayMs || 500,
          status: "in_progress",
        }
      : null;

    const decision: PlannerActDecision = {
      timestamp: Date.now(),
      thinking: {
        observation:
          parsed.thinking?.observation || perception.screenDescription,
        reasoning:
          parsed.thinking?.reasoning ||
          "Analyzing element geometry to ground coordinates.",
        strategy:
          parsed.thinking?.strategy ||
          "Execute immediate target action, then verify UI response.",
        confidence: readPlannerConfidence(parsed.thinking?.confidence),
      },
      goals: this.activeGoals,
      nextAction,
      verificationRule: parsed.verificationRule || {
        expectedChange: "Visual update in target coordinate region",
        targetRegion: {
          x: (nextAction?.x || 960) - 40,
          y: (nextAction?.y || 540) - 20,
          width: 80,
          height: 40,
        },
        successCondition: "State difference confirmed on subsequent frame",
        retryStrategy: "Retry with adjusted delay (+200ms)",
      },
      statusSummary:
        parsed.statusSummary || `Ready: ${nextAction?.title || "Monitoring"}`,
      source: "model",
      verified: true,
    };

    return decision;
  }

  async verifyActionOutcome(
    previousPerception: ScreenPerceptionReport,
    currentPerception: ScreenPerceptionReport,
    verificationRule: VerificationRule,
  ): Promise<{ verified: boolean; feedback: string }> {
    // Check if visual state or elements changed
    const stateChanged =
      previousPerception.screenDescription !==
        currentPerception.screenDescription ||
      previousPerception.elements.length !==
        currentPerception.elements.length ||
      currentPerception.visualStateChange.toLowerCase().includes("change") ||
      currentPerception.visualStateChange.toLowerCase().includes("submit") ||
      currentPerception.visualStateChange.toLowerCase().includes("loaded") ||
      currentPerception.visualStateChange.toLowerCase().includes("success");

    if (stateChanged) {
      return {
        verified: true,
        feedback: `Verified: ${verificationRule.expectedChange || "Screen state transition confirmed"}`,
      };
    }

    return {
      verified: false,
      feedback: `Unverified: no screen state change detected after dispatch (${currentPerception.visualStateChange}).`,
    };
  }

  getGoals(): GoalNode[] {
    return this.activeGoals;
  }

  setGoals(goals: GoalNode[]) {
    this.activeGoals = goals;
  }

  refineStepsWithFreshPerception(
    steps: SubTask[],
    report: ScreenPerceptionReport,
  ): {
    refined: SubTask[];
    report: Array<{ step: SubTask; status: "kept" | "regrounded" | "dropped"; reason: string }>;
  } {
    const reportItems: Array<{ step: SubTask; status: "kept" | "regrounded" | "dropped"; reason: string }> = [];
    const refined: SubTask[] = [];

    for (const s of steps) {
      if (s.actionType === "click" && report.elements && report.elements.length > 0) {
        const match = report.elements.find(
          (e) =>
            e.name.toLowerCase().includes(s.targetName.toLowerCase()) ||
            s.targetName.toLowerCase().includes(e.name.toLowerCase()),
        );
        if (match) {
          const regrounded = s.x !== match.center.x || s.y !== match.center.y;
          const updated = {
            ...s,
            x: match.center.x,
            y: match.center.y,
          };
          refined.push(updated);
          reportItems.push({
            step: updated,
            status: regrounded ? "regrounded" : "kept",
            reason: regrounded
              ? `Re-grounded to (${match.center.x}, ${match.center.y})`
              : "Exact target match on screen",
          });
          continue;
        }
      }
      refined.push(s);
      reportItems.push({
        step: s,
        status: "kept",
        reason: "Original target retained",
      });
    }

    return { refined, report: reportItems };
  }
}

export const aiPlannerEngine = new AIPlannerActorEngine();
