import { Router, type Response } from "express";
import { z } from "zod";
import type {
  CompanionChatRequest,
  CompanionErrorEvent,
} from "@shared/companion";
import { LEDGER_DECISIONS, LEDGER_OUTCOMES } from "../../shared/feedback";
import { CompanionService, workflowStepsFromActions } from "../companion-service";
import type { NoteInput } from "../notes-store";
import type { DecisionInput, ProposalInput } from "../feedback-ledger";
import type { ObservationTarget } from "../screen-observer";
import type { TriggerInput } from "../trigger-engine";
import { getSavedDeviceWorkflows } from "./mobile-stream";

const lookupWorkflow = (id: string) => {
  const workflow = getSavedDeviceWorkflows().find((w) => w.id === id);
  return workflow && { name: workflow.name, steps: workflowStepsFromActions(workflow.actions) };
};

export const companionService = new CompanionService({
  lookupWorkflow,
  listWorkflows: () => getSavedDeviceWorkflows().map((w) => ({ id: w.id, name: w.name })),
});
companionService.connect();

const targetSchema = z.object({
  targetDevice: z.enum(["desktop", "android"]).default("desktop"),
  deviceId: z.string().min(1).optional(),
});

const screenshotSchema = z.string().regex(/^data:image\/(png|jpeg);base64,/).max(8_000_000);

const noteSchema = z.object({
  category: z.enum(["user_request", "observation", "decision", "goal_state", "event"]),
  title: z.string().min(1).max(300),
  content: z.string().max(10_000).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  event: z
    .enum(["workflow_completed", "workflow_failed", "goal_reached", "error", "trigger_fired"])
    .optional(),
  screenshot: screenshotSchema.optional(),
});

const triggerSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  condition: z.object({
    kind: z.enum([
      "screen_state",
      "element_appears",
      "element_disappears",
      "ocr_text",
      "error_observed",
      "time_interval",
    ]),
    pattern: z.string().max(500).optional(),
    intervalMs: z.number().int().optional(),
  }),
  action: z.object({
    kind: z.enum(["run_workflow", "take_note", "capture_screenshot", "notify_user", "ask_approval"]),
    workflowId: z.string().optional(),
    message: z.string().max(1000).optional(),
  }),
});

const errorSchema = z.object({
  source: z.enum(["replay", "action_gate", "trigger", "device_command"]),
  message: z.string().min(1).max(4000),
  failedStep: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      action: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .optional(),
  screenshot: screenshotSchema.optional(),
  workflowId: z.string().optional(),
});

const chatSchema = z.object({
  sessionId: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  currentTab: z.string().max(100).optional(),
  screenSummary: z.string().max(4000).optional(),
  screenshot: screenshotSchema.optional(),
  workflowHistory: z
    .array(
      z.object({
        name: z.string(),
        status: z.string(),
        at: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
});

const decisionSchema = z.object({ approved: z.boolean() });

const proposalDecisionSchema = z.object({
  approved: z.boolean(),
  editedText: z.string().min(1).max(4000).optional(),
  comment: z.string().max(2000).optional(),
});

const ledgerProposalSchema = z.object({
  topic: z.string().min(1).max(60),
  summary: z.string().min(1).max(4000),
  source: z.string().min(1).max(100),
  workflowId: z.string().max(200).optional(),
});

const ledgerDecisionSchema = z.object({
  decision: z.enum(LEDGER_DECISIONS),
  originalText: z.string().max(4000).optional(),
  editedText: z.string().max(4000).optional(),
  comment: z.string().max(2000).optional(),
});

const ledgerExtensionSchema = z.object({
  description: z.string().min(1).max(4000),
  addedSteps: z.number().int().min(0).max(500),
  workflowId: z.string().max(200).optional(),
});

const ledgerOutcomeSchema = z.object({
  outcome: z.enum(LEDGER_OUTCOMES),
  detail: z.string().max(4000).default(""),
});

function fail(res: Response, error: unknown) {
  const status = error instanceof z.ZodError ? 400 : /not found/i.test(String((error as Error)?.message)) ? 404 : 409;
  res.status(status).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

/** Wraps a handler so validation and domain errors become JSON error responses. */
const handle =
  (fn: (req: any, res: Response) => unknown) =>
  async (req: any, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      fail(res, error);
    }
  };

/** Periodic server-side trigger evaluation against fresh captures of one device. */
const watcher = {
  timer: null as ReturnType<typeof setTimeout> | null,
  target: null as ObservationTarget | null,
  intervalMs: 0,
  lastError: null as string | null,
};

const scheduleWatch = () => {
  watcher.timer = setTimeout(async () => {
    if (!watcher.target) return;
    try {
      if (companionService.triggers.list().some((t) => t.enabled && t.condition.kind !== "error_observed"))
        await companionService.evaluateTriggers(watcher.target);
      watcher.lastError = null;
    } catch (error) {
      watcher.lastError = error instanceof Error ? error.message : String(error);
      companionService.reportError({ source: "trigger", message: `Trigger capture failed: ${watcher.lastError}` });
    }
    if (watcher.target) scheduleWatch();
  }, watcher.intervalMs);
};

const stopWatch = () => {
  if (watcher.timer) clearTimeout(watcher.timer);
  watcher.timer = null;
  watcher.target = null;
};

export const companionRouter = Router();

companionRouter.get("/notes", handle((req, res) => {
  res.json({
    success: true,
    notes: companionService.notes.list({
      tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
      withScreenshot: req.query.screenshots === "true",
    }),
  });
}));
companionRouter.get("/notes/search", handle((req, res) => {
  res.json({ success: true, notes: companionService.notes.searchScreenshots(String(req.query.q ?? ""), 5) });
}));
companionRouter.post("/notes", handle((req, res) => {
  res.status(201).json({ success: true, note: companionService.notes.add(noteSchema.parse(req.body) as NoteInput) });
}));
companionRouter.delete("/notes/:id", handle((req, res) => {
  const removed = companionService.notes.remove(req.params.id);
  res.status(removed ? 200 : 404).json({ success: removed });
}));

companionRouter.get("/triggers", handle((_req, res) => {
  res.json({
    success: true,
    triggers: companionService.triggers.list(),
    watch: { active: !!watcher.target, target: watcher.target, intervalMs: watcher.intervalMs, lastError: watcher.lastError },
  });
}));
companionRouter.post("/triggers", handle((req, res) => {
  res.status(201).json({ success: true, trigger: companionService.triggers.create(triggerSchema.parse(req.body) as TriggerInput) });
}));
companionRouter.patch("/triggers/:id", handle((req, res) => {
  res.json({ success: true, trigger: companionService.triggers.update(req.params.id, triggerSchema.partial().parse(req.body) as Partial<TriggerInput>) });
}));
companionRouter.delete("/triggers/:id", handle((req, res) => {
  const removed = companionService.triggers.remove(req.params.id);
  res.status(removed ? 200 : 404).json({ success: removed });
}));
companionRouter.post("/triggers/evaluate", handle(async (req, res) => {
  const result = await companionService.evaluateTriggers(targetSchema.parse(req.body ?? {}) as ObservationTarget);
  res.json({ success: true, firings: result.firings, observedAt: result.observation.at });
}));
companionRouter.post("/triggers/watch", handle((req, res) => {
  const body = targetSchema.extend({ intervalMs: z.number().int().min(5000).max(3_600_000).default(15000) }).parse(req.body ?? {});
  stopWatch();
  watcher.target = { targetDevice: body.targetDevice, deviceId: body.deviceId };
  watcher.intervalMs = body.intervalMs;
  scheduleWatch();
  res.json({ success: true, watch: { active: true, target: watcher.target, intervalMs: watcher.intervalMs } });
}));
companionRouter.delete("/triggers/watch", handle((_req, res) => {
  stopWatch();
  res.json({ success: true, watch: { active: false } });
}));

companionRouter.get("/pending-actions", handle((_req, res) => {
  res.json({ success: true, actions: companionService.triggers.listPendingActions() });
}));
companionRouter.post("/pending-actions/:id/decision", handle((req, res) => {
  const { approved } = decisionSchema.parse(req.body);
  const action = companionService.triggers.decidePendingAction(req.params.id, approved);
  const workflow = approved && action.workflowId ? lookupWorkflow(action.workflowId) : undefined;
  res.json({ success: true, action, workflow });
}));
companionRouter.post("/pending-actions/:id/dispatched", handle((req, res) => {
  res.json({ success: true, action: companionService.triggers.markDispatched(req.params.id) });
}));

companionRouter.post("/errors", handle((req, res) => {
  res.status(201).json({ success: true, task: companionService.reportError(errorSchema.parse(req.body) as CompanionErrorEvent) });
}));
companionRouter.get("/tasks", handle((_req, res) => {
  res.json({ success: true, tasks: companionService.errors.listTasks() });
}));
companionRouter.post("/tasks/:id/propose-fix", handle(async (req, res) => {
  res.status(201).json({ success: true, proposal: await companionService.errors.proposeFix(req.params.id) });
}));
companionRouter.post("/tasks/:id/dismiss", handle((req, res) => {
  const task = companionService.errors.dismissTask(req.params.id);
  res.status(task ? 200 : 404).json({ success: !!task, task });
}));

companionRouter.get("/proposals", handle((_req, res) => {
  res.json({ success: true, proposals: companionService.errors.listProposals() });
}));
companionRouter.post("/workflows/:id/propose-improvement", handle(async (req, res) => {
  res.status(201).json({ success: true, proposal: await companionService.errors.proposeImprovement(req.params.id) });
}));
companionRouter.post("/proposals/:id/decision", handle((req, res) => {
  const { approved, editedText, comment } = proposalDecisionSchema.parse(req.body);
  const edit = editedText ? { editedText, comment } : undefined;
  res.json({ success: true, proposal: companionService.errors.decideProposal(req.params.id, approved, edit) });
}));

// Follow-up / feedback ledger: proposal → decision → extension → outcome.
const ledger = () => companionService.errors.ledger;
companionRouter.get("/ledger", handle((req, res) => {
  res.json({ success: true, threads: ledger().threads(typeof req.query.topic === "string" ? req.query.topic : undefined) });
}));
companionRouter.get("/ledger/feedback/:topic", handle((req, res) => {
  res.json({ success: true, feedback: ledger().feedbackFor(req.params.topic) });
}));
companionRouter.get("/ledger/:proposalId", handle((req, res) => {
  const entries = ledger().forProposal(req.params.proposalId);
  res.status(entries.length ? 200 : 404).json(entries.length ? { success: true, entries } : { success: false, error: "Proposal not found in the ledger" });
}));
companionRouter.post("/ledger/proposals", handle((req, res) => {
  res.status(201).json({ success: true, entry: ledger().recordProposal(ledgerProposalSchema.parse(req.body) as ProposalInput) });
}));
companionRouter.post("/ledger/:proposalId/decision", handle((req, res) => {
  res.status(201).json({ success: true, entry: ledger().recordDecision(req.params.proposalId, ledgerDecisionSchema.parse(req.body) as DecisionInput) });
}));
companionRouter.post("/ledger/:proposalId/extension", handle((req, res) => {
  const body = ledgerExtensionSchema.parse(req.body);
  res.status(201).json({ success: true, entry: ledger().recordExtension(req.params.proposalId, body.description, body.addedSteps, body.workflowId) });
}));
companionRouter.post("/ledger/:proposalId/outcome", handle((req, res) => {
  const body = ledgerOutcomeSchema.parse(req.body);
  res.status(201).json({ success: true, entry: ledger().recordOutcome(req.params.proposalId, body.outcome, body.detail) });
}));

companionRouter.get("/workflows/:id", handle((req, res) => {
  const workflow = lookupWorkflow(req.params.id);
  res.status(workflow ? 200 : 404).json(workflow ? { success: true, workflow: { id: req.params.id, ...workflow } } : { success: false, error: "Workflow not found" });
}));

companionRouter.get("/chat/:sessionId", handle((req, res) => {
  res.json({ success: true, turns: companionService.chatMemory.history(req.params.sessionId, 100) });
}));
companionRouter.post("/chat", handle(async (req, res) => {
  const result = await companionService.converse(chatSchema.parse(req.body) as CompanionChatRequest);
  res.status(result.success ? 200 : 502).json(result);
}));
