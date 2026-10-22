/**
 * Goal-driven workflows: the AI proposes and re-plans step sequences from the
 * goal and a freshly analyzed screen, assesses goal completion, reads OCR
 * text for step verification, and stores verified runs as versioned best
 * flows. All model calls go through sendQwenChatRequest (local endpoint first,
 * quantumclaw fallback). A model failure is returned as a failure.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
} from "../ai-endpoint";
import { recognizeWithProviders } from "../ocr-provider";
import { aiMonitorStore } from "../ai-monitor-store";
import { bestFlowRepository, type SaveRunInput } from "../best-flow-store";
import {
  GOAL_STEP_ACTIONS,
  goalStepSchema,
  groundFirstStep,
  parseProposedSteps,
  runEvidenceSchema,
  type GoalAssessment,
  type ScreenObservation,
} from "../../shared/goal-loop";

const observationSchema = z.object({
  signature: z.string(),
  description: z.string(),
  elements: z.array(
    z.object({
      name: z.string(),
      textValue: z.string().optional(),
      boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      center: z.object({ x: z.number(), y: z.number() }),
      confidence: z.number().optional(),
    }),
  ),
  ocrText: z.array(z.string()),
  confidence: z.number().optional(),
  capturedAt: z.number(),
});

const historyItemSchema = z.object({
  name: z.string(),
  action: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});

const imageSchema = z.string().regex(/^data:image\/(png|jpeg);base64,/);

const proposeSchema = z.object({
  goal: z.string().trim().min(1).max(2000),
  observation: observationSchema,
  screenshot: imageSchema.optional(),
  history: z.array(historyItemSchema).max(100).default([]),
  reason: z.string().max(2000).optional(),
  guidance: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  endpoint: z.string().optional(),
  model: z.string().optional(),
});

const assessSchema = z.object({
  goal: z.string().trim().min(1).max(2000),
  observation: observationSchema,
  screenshot: imageSchema.optional(),
  history: z.array(historyItemSchema).max(100).default([]),
  guidance: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  endpoint: z.string().optional(),
  model: z.string().optional(),
});

const PLAN_PROMPT = `You are the planner of a screen-control assistant. Given a user GOAL, the
elements detected on the CURRENT screen and the steps already executed, propose
the remaining steps that reach the goal. Use only elements that are listed;
never invent coordinates for elements you cannot see. Steps that act on a
later screen must name their target in "targetLabel" so it can be found on that
screen when it appears.
Return STRICT JSON: {"steps":[{"name":"...","action":"${GOAL_STEP_ACTIONS.join("|")}",
"x":0,"y":0,"targetLabel":"...","text":"...","keyPayload":"...","delayMs":500,
"expectation":{"kind":"element_present","label":"..."}|{"kind":"screen_changed"}|{"kind":"text_found","text":"..."}|{"kind":"none"}}]}`;

const ASSESS_PROMPT = `You track whether a screen-control GOAL has been reached. Compare the
CURRENT screen with the goal and the executed steps. Return STRICT JSON:
{"complete":true|false,"onTrack":true|false,"reason":"...","confidence":0.0-1.0}`;

function describeObservation(observation: ScreenObservation): string {
  const elements = observation.elements.slice(0, 40).map((el) => ({
    name: el.name,
    text: el.textValue,
    center: el.center,
    box: el.boundingBox,
  }));
  return [
    `Screen: ${observation.description}`,
    `Elements: ${JSON.stringify(elements)}`,
    observation.ocrText.length ? `OCR text: ${observation.ocrText.slice(0, 60).join(" | ")}` : "OCR text: none",
  ].join("\n");
}

/** User guidance typed during the run, applied to every later step. */
export function guidanceLines(guidance: string[] | undefined): string[] {
  if (!guidance || guidance.length === 0) return [];
  return [`USER GUIDANCE (follow it for every remaining step): ${guidance.map((g) => `- ${g}`).join(" ")}`];
}

function contextMessage(
  label: string,
  body: z.infer<typeof proposeSchema> | z.infer<typeof assessSchema>,
  extra: string[] = [],
) {
  const text = [
    `GOAL: ${body.goal}`,
    describeObservation(body.observation as ScreenObservation),
    `Executed steps: ${JSON.stringify(body.history)}`,
    ...guidanceLines(body.guidance),
    ...extra,
  ].join("\n");
  return body.screenshot
    ? buildVisionMessage(`${label}\n${text}`, body.screenshot)
    : { role: "user" as const, content: `${label}\n${text}` };
}

async function askModel(
  system: string,
  user: ReturnType<typeof contextMessage>,
  options: { endpoint?: string; model?: string },
): Promise<any> {
  const response = await sendQwenChatRequest(
    [{ role: "system", content: system }, user],
    { ...options, format: "json" },
  );
  if (!response.success) throw new Error(response.error || "AI model unavailable");
  return parseModelJson(response.content);
}

function badRequest(res: Parameters<RequestHandler>[1], error: z.ZodError) {
  return res.status(400).json({ success: false, error: error.issues[0]?.message ?? "Invalid request" });
}

const failMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Proposes (or, with `reason`, re-plans) the remaining steps for the goal on the current screen. */
export const handleProposeGoalPlan: RequestHandler = async (req, res) => {
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = parsed.data;
  aiMonitorStore.setStatus({ status: "planning", objective: body.goal, currentAction: "Planning goal workflow" });
  try {
    const extra = body.reason ? [`The run went off-track: ${body.reason}. Re-plan from the current screen.`] : [];
    const raw = await askModel(PLAN_PROMPT, contextMessage("Plan the steps.", body, extra), body);
    const grounded = groundFirstStep(parseProposedSteps(raw?.steps, `step_${Date.now()}`), body.observation as ScreenObservation);
    if (grounded.rejected) return res.status(422).json({ success: false, error: grounded.rejected });
    aiMonitorStore.record({
      phase: "planning",
      title: body.reason ? "Goal re-planned" : "Goal workflow proposed",
      detail: `${grounded.steps.length} step(s) for: ${body.goal}`,
      status: "completed",
      source: "Goal planner",
    });
    res.json({ success: true, proposal: { goal: body.goal, reason: body.reason ?? "Initial plan", steps: grounded.steps } });
  } catch (error) {
    res.status(502).json({ success: false, error: `Goal planning failed: ${failMessage(error)}` });
  } finally {
    aiMonitorStore.setStatus({ status: "idle", currentAction: null });
  }
};

/** Asks the model whether the goal is reached / still on track on the current screen. */
export const handleAssessGoal: RequestHandler = async (req, res) => {
  const parsed = assessSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = parsed.data;
  try {
    const raw = await askModel(ASSESS_PROMPT, contextMessage("Assess the goal.", body), body);
    if (typeof raw?.complete !== "boolean" || typeof raw?.onTrack !== "boolean") {
      throw new Error("model returned no complete/onTrack verdict");
    }
    const assessment: GoalAssessment = {
      complete: raw.complete,
      onTrack: raw.onTrack,
      reason: typeof raw.reason === "string" ? raw.reason : "",
      confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : undefined,
    };
    res.json({ success: true, assessment });
  } catch (error) {
    res.status(502).json({ success: false, error: `Goal assessment failed: ${failMessage(error)}` });
  }
};

/** OCR lines for one frame, through the configured provider chain. */
export const handleGoalOcr: RequestHandler = async (req, res) => {
  const parsed = imageSchema.safeParse(req.body?.imageData);
  if (!parsed.success) return res.status(400).json({ success: false, error: "An actual PNG/JPEG screenshot is required" });
  const { result, errors } = await recognizeWithProviders({ imageData: parsed.data });
  if (!result) return res.status(502).json({ success: false, error: `OCR failed: ${errors.join("; ")}` });
  res.json({ success: true, provider: result.provider, lines: result.text.map((block) => block.text) });
};

const saveRunSchema = z.object({
  flowId: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(2000),
  steps: z.array(goalStepSchema).min(1).max(100),
  evidence: runEvidenceSchema,
});

const confirmSchema = z.object({
  version: z.number().int().min(1),
  approvedReplace: z.boolean().default(false),
});

export const handleListBestFlows: RequestHandler = (_req, res) => {
  res.json({ success: true, flows: bestFlowRepository.list() });
};

export const handleSaveFlowRun: RequestHandler = (req, res) => {
  const parsed = saveRunSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    res.json({ success: true, flow: bestFlowRepository.saveRun(parsed.data as SaveRunInput) });
  } catch (error) {
    res.status(409).json({ success: false, error: failMessage(error) });
  }
};

export const handleConfirmBestFlow: RequestHandler = (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const flow = bestFlowRepository.confirm(req.params.id, parsed.data.version, parsed.data.approvedReplace);
    res.json({ success: true, flow });
  } catch (error) {
    res.status(409).json({ success: false, error: failMessage(error) });
  }
};

export const goalWorkflowsRouter = Router();
goalWorkflowsRouter.post("/propose", handleProposeGoalPlan);
goalWorkflowsRouter.post("/assess", handleAssessGoal);
goalWorkflowsRouter.post("/ocr", handleGoalOcr);
goalWorkflowsRouter.get("/flows", handleListBestFlows);
goalWorkflowsRouter.post("/flows", handleSaveFlowRun);
goalWorkflowsRouter.post("/flows/:id/confirm", handleConfirmBestFlow);
