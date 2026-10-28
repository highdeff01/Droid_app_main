import { Router } from "express";
import { z } from "zod";
import type { AssistBridgeService } from "../assist-bridge/service";
import { settingsUpdateSchema } from "../assist-bridge/service";

const killSwitchSchema = z.object({ tripped: z.boolean() });

/** /api/assist-bridge: status, settings and kill switch for the main app's UI. */
export function createAssistBridgeRouter(bridge: AssistBridgeService): Router {
  const router = Router();
  router.get("/status", (_req, res) => {
    res.json({ success: true, status: bridge.status() });
  });
  router.post("/settings", async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    res.json({ success: true, status: await bridge.updateSettings(parsed.data) });
  });
  router.post("/kill-switch", (req, res) => {
    const parsed = killSwitchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Body must be { tripped: boolean }" });
      return;
    }
    res.json({ success: true, status: bridge.setKillSwitch(parsed.data.tripped) });
  });
  return router;
}
