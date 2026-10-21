import { z } from "zod";

export const replayStepSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(500),
  action: z.enum([
    "click",
    "double_click",
    "right_click",
    "clear_and_type",
    "type_text",
    "press_key",
    "hotkey",
    "scroll",
    "wait",
  ]),
  x: z.number().finite().min(0).max(16384),
  y: z.number().finite().min(0).max(16384),
  text: z.string().max(4000).optional(),
  keyPayload: z.string().max(100).optional(),
  delayMs: z.number().int().min(0).max(5000).default(500),
  referenceScreenshotUrl: z
    .string()
    .max(8_000_000)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  targetOcrLabel: z.string().max(500).optional(),
  expectedOutcome: z.string().max(1000).optional(),
  breakpoint: z.boolean().optional(),
  conditionType: z.enum(["always"]).optional(),
});
export const replayRequestSchema = z
  .object({
    targetDevice: z.enum(["desktop", "android"]),
    deviceId: z.string().max(200).optional(),
    steps: z.array(replayStepSchema).min(1).max(100),
    iterations: z.number().int().min(1).max(25).default(1),
    confirmation: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (value.targetDevice === "android" && !value.deviceId)
      ctx.addIssue({ code: "custom", message: "Select an Android device" });
    if (
      value.steps.reduce(
        (sum, step) => sum + (step.referenceScreenshotUrl?.length || 0),
        0,
      ) > 20_000_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Reference screenshots must total at most 20 MB",
      });
    if (new Set(value.steps.map((s) => s.id)).size !== value.steps.length)
      ctx.addIssue({ code: "custom", message: "Step IDs must be unique" });
    if (value.steps.length * value.iterations > 100)
      ctx.addIssue({
        code: "custom",
        message: "A run may contain at most 100 actions",
      });
  });
export type ReplayStep = z.infer<typeof replayStepSchema>;
export type ReplayRequest = z.infer<typeof replayRequestSchema>;
export interface ReplayEvent {
  id: string;
  at: number;
  stepId?: string;
  attempt?: number;
  phase:
    | "perception"
    | "planning"
    | "execution"
    | "verification"
    | "recovery"
    | "system";
  detail: string;
  beforeHash?: string;
  afterHash?: string;
}
export interface ReplayRun {
  id: string;
  target: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  currentStep: number;
  iteration: number;
  completed: number;
  total: number;
  steps: Array<{
    id: string;
    status: "pending" | "running" | "completed" | "failed";
  }>;
  events: ReplayEvent[];
  error?: string;
  startedAt: number;
}
