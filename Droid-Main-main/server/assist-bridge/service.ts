import { z } from "zod";
import {
  ASSIST_BRIDGE_DEFAULT_HOST,
  ASSIST_BRIDGE_DEFAULT_INTERVAL_MS,
  ASSIST_BRIDGE_DEFAULT_PORT,
  ASSIST_BRIDGE_MAX_INTERVAL_MS,
  ASSIST_BRIDGE_MIN_INTERVAL_MS,
  type AssistBridgeSettings,
  type AssistBridgeStatus,
  type AssistEventType,
  type InterceptNoticePayload,
} from "../../shared/assist-bridge";
import { handleCommand } from "./commands";
import type { FrameOutcome } from "./frames";
import { BridgeListener } from "./listener";
import { makeEnvelope } from "./protocol";
import { ScriptRunner, type DeviceExecutor } from "./script-runner";

export const settingsUpdateSchema = z
  .object({
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535),
    token: z.string().max(512),
    intervalMs: z.number(),
  })
  .partial()
  .strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export function clampInterval(ms: number): number {
  if (!Number.isFinite(ms)) return ASSIST_BRIDGE_DEFAULT_INTERVAL_MS;
  return Math.min(ASSIST_BRIDGE_MAX_INTERVAL_MS, Math.max(ASSIST_BRIDGE_MIN_INTERVAL_MS, Math.round(ms)));
}

export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): AssistBridgeSettings {
  const port = Number(env.ASSIST_BRIDGE_PORT);
  return {
    host: env.ASSIST_BRIDGE_HOST?.trim() || ASSIST_BRIDGE_DEFAULT_HOST,
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : ASSIST_BRIDGE_DEFAULT_PORT,
    token: env.ASSIST_BRIDGE_TOKEN ?? "",
    intervalMs: clampInterval(Number(env.ASSIST_BRIDGE_FRAME_MS ?? ASSIST_BRIDGE_DEFAULT_INTERVAL_MS)),
  };
}

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127\.\d+\.\d+\.\d+$/.test(h);
}

export interface BridgeServiceDeps {
  readFrame: () => Promise<FrameOutcome>;
  execute: DeviceExecutor;
  appState: () => Promise<Record<string, unknown>>;
  logNotice: (notice: InterceptNoticePayload) => void;
}

/** Owns the bridge: settings, kill switch, listener lifecycle and status. */
export class AssistBridgeService {
  private listener: BridgeListener | null = null;
  private killSwitch = false;
  private startError: string | null = null;
  readonly runner: ScriptRunner;

  constructor(private settings: AssistBridgeSettings, private readonly deps: BridgeServiceDeps) {
    this.runner = new ScriptRunner({ execute: deps.execute, isKilled: () => this.killSwitch });
  }

  async start(): Promise<void> {
    await this.stop();
    const listener = new BridgeListener({
      settings: this.settings,
      readFrame: this.deps.readFrame,
      handleCommand: (raw) => handleCommand(raw, this.commandDeps()),
    });
    this.listener = listener;
    try {
      await listener.start();
      this.startError = null;
    } catch (err) {
      this.startError = `Bridge could not listen on ${this.settings.host}:${this.settings.port}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async stop(): Promise<void> {
    const listener = this.listener;
    this.listener = null;
    await listener?.stop();
  }

  /** Applies new settings and restarts the listener so they take effect. */
  async updateSettings(update: SettingsUpdate): Promise<AssistBridgeStatus> {
    const next = { ...this.settings, ...update };
    this.settings = { ...next, intervalMs: clampInterval(next.intervalMs) };
    await this.start();
    return this.status();
  }

  setKillSwitch(tripped: boolean): AssistBridgeStatus {
    this.killSwitch = tripped;
    return this.status();
  }

  emit(type: AssistEventType, payload: unknown): void {
    this.listener?.broadcast(makeEnvelope(type, payload));
  }

  get port(): number | null {
    return this.listener?.port ?? null;
  }

  status(): AssistBridgeStatus {
    const listening = Boolean(this.listener?.listening);
    const lastError = this.startError ?? this.listener?.lastError ?? null;
    const { token, ...rest } = this.settings;
    const state = !listening || this.startError ? "error" : this.listener.connected ? "connected" : "waiting";
    return {
      state,
      listening,
      url: listening ? `ws://${this.settings.host}:${this.port}/bridge` : null,
      peer: this.listener?.connected ? this.listener.peer : null,
      lastError,
      insecure: !isLoopbackHost(this.settings.host),
      killSwitch: this.killSwitch,
      settings: { ...rest, tokenSet: token.length > 0 },
    };
  }

  private commandDeps() {
    return {
      freshFrame: this.deps.readFrame,
      runner: this.runner,
      logNotice: this.deps.logNotice,
      reportState: async () => ({
        ...(await this.deps.appState()),
        bridge: { killSwitch: this.killSwitch, scriptRunning: this.runner.busy },
      }),
    };
  }
}
