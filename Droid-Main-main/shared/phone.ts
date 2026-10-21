import { z } from "zod";

const coordinate = z.number().finite().min(0).max(1);

export const phoneActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tap"), x: coordinate, y: coordinate }),
  z.object({
    type: z.literal("swipe"),
    x: coordinate,
    y: coordinate,
    endX: coordinate,
    endY: coordinate,
    duration: z.number().int().min(100).max(2000).default(350),
  }),
  z.object({
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(2000)
      .regex(
        /^[\x20-\x7e]+$/,
        "ADB text input supports printable ASCII; use the phone keyboard for other text",
      ),
  }),
  z.object({
    type: z.literal("key"),
    key: z.enum([
      "HOME",
      "BACK",
      "APP_SWITCH",
      "ENTER",
      "DEL",
      "TAB",
      "PASTE",
      "COPY",
    ]),
  }),
]);

export type PhoneAction = z.infer<typeof phoneActionSchema>;

export interface PhoneFrame {
  image: string;
  width: number;
  height: number;
  timestamp?: number;
  capturedAt?: number;
  hash?: string;
}

export interface PhoneRecording {
  id: string;
  startTime?: number;
  endTime?: number;
  startedAt?: number;
  stoppedAt?: number;
  frames?: PhoneFrame[];
  actions?: PhoneAction[];
  status?: string;
  state?: "recording" | "stopping" | "complete" | "failed" | string;
  segments?: any;
  storage?: "phone" | string;
  error?: any;
}
