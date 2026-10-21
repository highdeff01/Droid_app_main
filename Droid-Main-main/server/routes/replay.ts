import { Router } from "express";
import { z } from "zod";
import { replayEngine } from "../replay-engine";
import { createReplayAdapter } from "../replay-adapter";
export const replayRouter = Router();
replayRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
replayRouter.post("/", (req, res) => {
  try {
    res.status(202).json({ success: true, run: replayEngine.start(req.body) });
  } catch (error) {
    res
      .status(error instanceof z.ZodError ? 400 : 409)
      .json({ success: false, error: error.message });
  }
});
replayRouter.post("/capture", async (req, res) => {
  try {
    const target = z
      .object({
        targetDevice: z.enum(["desktop", "android"]),
        deviceId: z.string().min(1).optional(),
      })
      .parse(req.body);
    if (target.targetDevice === "android" && !target.deviceId)
      return res.status(400).json({ success: false, error: "Select a device" });
    res.json({
      success: true,
      frame: await createReplayAdapter(target).capture(),
    });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});
replayRouter.get("/:id", (req, res) => {
  const run = replayEngine.get(req.params.id);
  res
    .status(run ? 200 : 404)
    .json(
      run
        ? { success: true, run }
        : { success: false, error: "Run no longer retained" },
    );
});
replayRouter.get("/:id/frames/:hash", (req, res) => {
  const frame = replayEngine.frame(req.params.id, req.params.hash);
  if (!frame)
    return res
      .status(404)
      .json({
        error: "Evidence expired; only the latest 12 frames are retained",
      });
  res.type("png").send(Buffer.from(frame.image.split(",")[1], "base64"));
});
replayRouter.post("/:id/:command", (req, res) => {
  const command = z
    .enum(["pause", "resume", "cancel"])
    .safeParse(req.params.command);
  if (!command.success)
    return res
      .status(400)
      .json({ success: false, error: "Invalid replay command" });
  const run = replayEngine.control(req.params.id, command.data);
  res.status(run ? 200 : 404).json({ success: !!run, run });
});
