import http from "http";
import { timingSafeEqual } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  ASSIST_BRIDGE_PROTOCOL_VERSION,
  ASSIST_COMMAND_TYPES,
  type AssistBridgeSettings,
  type AssistEnvelope,
} from "../../shared/assist-bridge";
import type { FrameOutcome } from "./frames";
import { makeEnvelope } from "./protocol";

export interface ListenerDeps {
  settings: AssistBridgeSettings;
  readFrame: () => Promise<FrameOutcome>;
  handleCommand: (raw: unknown) => Promise<AssistEnvelope>;
}

const WS_PATH = "/bridge";
const MAX_BODY_BYTES = 64 * 1024;
const EVENT_QUEUE_LIMIT = 200;
const POLL_CONNECTED_MS = 5000;

type AuthVerdict = { ok: true } | { ok: false; status: 401 | 403; error: string };

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function offeredProtocols(req: http.IncomingMessage): string[] {
  const header = req.headers["sec-websocket-protocol"];
  return typeof header === "string" ? header.split(",").map((p) => p.trim()).filter(Boolean) : [];
}

/** Bearer header (or `bearer.<token>` subprotocol) when a token is set; no browser origins otherwise. */
export function authorize(req: http.IncomingMessage, token: string): AuthVerdict {
  if (!token) {
    return req.headers.origin
      ? { ok: false, status: 403, error: "Browser origins are refused while no bridge token is set" }
      : { ok: true };
  }
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1]?.trim();
  const fromProtocol = offeredProtocols(req).find((p) => p.startsWith("bearer."))?.slice("bearer.".length);
  const given = bearer ?? fromProtocol;
  return given && tokenMatches(given, token) ? { ok: true } : { ok: false, status: 401, error: "Missing or invalid bridge token" };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Command body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function remoteAddress(req: http.IncomingMessage): string {
  const { remoteAddress: addr, remotePort: port } = req.socket;
  return addr ? `${addr}:${port}` : "unknown";
}

/** The bridge's own HTTP + WebSocket listener: auth, frame streaming, commands, event fan-out. */
export class BridgeListener {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private frameTimer: NodeJS.Timeout | null = null;
  private frameInFlight = false;
  private lastFrameLive: boolean | null = null;
  private events: { seq: number; envelope: AssistEnvelope }[] = [];
  private seq = 0;
  private lastPollAt = 0;
  peer: string | null = null;
  lastError: string | null = null;

  constructor(private readonly deps: ListenerDeps) {}

  get settings(): AssistBridgeSettings {
    return this.deps.settings;
  }

  get listening(): boolean {
    return Boolean(this.server?.listening);
  }

  /** Port actually bound (differs from settings when port 0 is requested). */
  get port(): number | null {
    const address = this.server?.address();
    return address && typeof address === "object" ? address.port : null;
  }

  get connected(): boolean {
    return (this.wss?.clients.size ?? 0) > 0 || Date.now() - this.lastPollAt < POLL_CONNECTED_MS;
  }

  start(): Promise<void> {
    const server = http.createServer((req, res) => void this.handleHttp(req, res));
    const wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => [...protocols].find((p) => p.startsWith("bearer.")) ?? false });
    server.on("upgrade", (req, socket, head) => this.handleUpgrade(wss, req, socket, head));
    this.server = server;
    this.wss = wss;
    return new Promise((resolve, reject) => {
      server.once("error", (err) => {
        this.lastError = `Bridge listener failed: ${err.message}`;
        reject(err);
      });
      server.listen(this.deps.settings.port, this.deps.settings.host, () => resolve());
    });
  }

  async stop(): Promise<void> {
    this.stopFrames();
    for (const client of this.wss?.clients ?? []) client.terminate();
    this.wss?.close();
    const server = this.server;
    this.server = null;
    this.wss = null;
    if (server?.listening) {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
    }
  }

  /** Pushes an envelope to every WS client and the polling queue. */
  broadcast(envelope: AssistEnvelope): void {
    this.seq += 1;
    this.events.push({ seq: this.seq, envelope });
    if (this.events.length > EVENT_QUEUE_LIMIT) this.events.shift();
    this.sendToClients(envelope);
  }

  private sendToClients(envelope: AssistEnvelope): void {
    const text = JSON.stringify(envelope);
    for (const client of this.wss?.clients ?? []) {
      if (client.readyState === WebSocket.OPEN) client.send(text);
    }
  }

  private handleUpgrade(wss: WebSocketServer, req: http.IncomingMessage, socket: any, head: Buffer) {
    const path = new URL(req.url ?? "/", "http://bridge").pathname;
    const verdict = authorize(req, this.deps.settings.token);
    if (path !== WS_PATH || verdict.ok === false) {
      const status = path !== WS_PATH ? "404 Not Found" : verdict.ok === false && verdict.status === 403 ? "403 Forbidden" : "401 Unauthorized";
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req));
  }

  private onConnection(ws: WebSocket, req: http.IncomingMessage) {
    this.peer = remoteAddress(req);
    this.lastError = null;
    ws.send(JSON.stringify(makeEnvelope("hello", {
      protocol: ASSIST_BRIDGE_PROTOCOL_VERSION,
      intervalMs: this.deps.settings.intervalMs,
      commands: ASSIST_COMMAND_TYPES,
    })));
    ws.on("message", async (data) => {
      const reply = await this.deps.handleCommand(data.toString());
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
    });
    ws.on("error", (err) => {
      this.lastError = `WebSocket error: ${err.message}`;
    });
    ws.on("close", () => {
      if (this.wss?.clients.size === 0) this.stopFrames();
    });
    this.startFrames();
  }

  private startFrames() {
    if (this.frameTimer) return;
    this.lastFrameLive = null;
    this.frameTimer = setInterval(() => void this.streamTick(), this.deps.settings.intervalMs);
    void this.streamTick();
  }

  private stopFrames() {
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
  }

  /** One frame per interval while a client is connected; standby is announced once per transition. */
  private async streamTick() {
    if (this.frameInFlight) return;
    this.frameInFlight = true;
    try {
      const outcome = await this.deps.readFrame();
      if (outcome.live === false) {
        if (this.lastFrameLive !== false) this.broadcast(makeEnvelope("frame_standby", { message: outcome.message }));
      } else this.sendToClients(makeEnvelope("frame", outcome.frame));
      this.lastFrameLive = outcome.live;
    } catch (err) {
      this.lastError = `Frame read failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.frameInFlight = false;
    }
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const verdict = authorize(req, this.deps.settings.token);
    if (verdict.ok === false) return sendJson(res, verdict.status, { success: false, error: verdict.error });
    const url = new URL(req.url ?? "/", "http://bridge");
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === "GET /bridge/health") return sendJson(res, 200, { ok: true, protocol: ASSIST_BRIDGE_PROTOCOL_VERSION });
      this.notePoll(req);
      if (route === "GET /bridge/frame") return await this.httpFrame(res);
      if (route === "GET /bridge/events") return this.httpEvents(res, Number(url.searchParams.get("since")) || 0);
      if (route === "POST /bridge/command") return await this.httpCommand(req, res);
      sendJson(res, 404, { success: false, error: `No bridge route ${route}` });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private notePoll(req: http.IncomingMessage) {
    this.lastPollAt = Date.now();
    this.peer = remoteAddress(req);
  }

  private async httpFrame(res: http.ServerResponse) {
    const outcome = await this.deps.readFrame();
    if (outcome.live === false) return sendJson(res, 503, { success: false, status: "standby", message: outcome.message });
    sendJson(res, 200, { success: true, frame: outcome.frame });
  }

  private httpEvents(res: http.ServerResponse, since: number) {
    sendJson(res, 200, { events: this.events.filter((e) => e.seq > since).map((e) => e.envelope), next: this.seq });
  }

  private async httpCommand(req: http.IncomingMessage, res: http.ServerResponse) {
    const reply = await this.deps.handleCommand(await readBody(req));
    sendJson(res, (reply.payload as any).ok ? 200 : 400, reply);
  }
}
