import type { RequestHandler } from "express";
import { spawnPython } from "../python-resolver";
import { failedOutcome, unavailableOutcome } from "../../shared/device-execution";

export const COMPARE_TIMEOUT_MS = 4000;

/**
 * PIL comparison script. It prints a similarity only when PIL computed one;
 * any exception (including a missing PIL) is reported as a failure.
 */
const PIL_COMPARE_SCRIPT = `
import json, sys, base64
from io import BytesIO
try:
    from PIL import Image
    import math
    payload=json.load(sys.stdin)
    def b64_to_img(s):
        if "," in s: s=s.split(",")[1]
        return Image.open(BytesIO(base64.b64decode(s))).convert("L").resize((256,144))
    ref=b64_to_img(payload["referenceImage"])
    live=b64_to_img(payload["liveImage"])
    mse=sum((a-b)**2 for a,b in zip(ref.getdata(), live.getdata()))/(256*144)
    similarity=max(0, 1 - math.sqrt(mse)/80)
    print(json.dumps({"success":True,"similarity":round(similarity,4),"mse":round(mse,2)}))
except Exception as e:
    print(json.dumps({"success":False,"similarity":None,"error":str(e)}))
`;

export interface ComparisonReply {
  status: number;
  body: Record<string, unknown>;
}

function failure(status: number, outcome: { error?: string }, extra: Record<string, unknown> = {}): ComparisonReply {
  return { status, body: { ...outcome, similarity: null, ...extra } };
}

/** Maps the script's stdout to a reply; only a numeric PIL similarity is reported as success. */
export function comparisonFromOutput(out: string, stderr: string, code: number | null): ComparisonReply {
  let parsed: { success?: unknown; similarity?: unknown; mse?: unknown; error?: unknown } | null = null;
  try {
    parsed = out.trim() ? JSON.parse(out.trim()) : null;
  } catch {
    parsed = null;
  }
  if (parsed?.success === true && typeof parsed.similarity === "number" && Number.isFinite(parsed.similarity)) {
    return { status: 200, body: { success: true, similarity: parsed.similarity, mse: parsed.mse ?? null } };
  }
  const reason =
    (typeof parsed?.error === "string" && parsed.error) ||
    stderr.trim() ||
    `Screenshot comparison produced no result (exit code ${code ?? "unknown"}).`;
  return failure(500, failedOutcome(`Screenshot comparison failed: ${reason}`), { code });
}

/** POST /api/compare-screenshots: PIL similarity of two images, or an honest failure. */
export const handleCompareScreenshots: RequestHandler = (req, res) => {
  let responded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sendOnce = (reply: ComparisonReply) => {
    if (responded) return;
    responded = true;
    if (timer) clearTimeout(timer);
    res.status(reply.status).json(reply.body);
  };
  try {
    const { referenceImage, liveImage } = req.body ?? {};
    if (!referenceImage || !liveImage) {
      res.status(400).json({ success: false, similarity: null, error: "Missing referenceImage or liveImage" });
      return;
    }
    const py = spawnPython(["-c", PIL_COMPARE_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    py.stdin.on("error", () => {});
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (err += d.toString()));
    py.on("error", (e) =>
      sendOnce(failure(503, unavailableOutcome(`python is not available (${e.message}); screenshots were not compared.`))),
    );
    py.on("close", (code) => sendOnce(comparisonFromOutput(out, err, code)));
    timer = setTimeout(() => {
      try {
        py.kill();
      } catch {}
      sendOnce(
        failure(503, unavailableOutcome(`Screenshot comparison timed out after ${COMPARE_TIMEOUT_MS}ms.`), { timeout: true }),
      );
    }, COMPARE_TIMEOUT_MS);
    py.stdin.write(JSON.stringify({ referenceImage, liveImage }));
    py.stdin.end();
  } catch (e) {
    sendOnce(failure(500, failedOutcome(`Screenshot comparison failed: ${e instanceof Error ? e.message : String(e)}`)));
  }
};
