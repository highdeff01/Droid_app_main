import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { AssistFrame } from "../../shared/assist-bridge";
import type { CaptureResult } from "../capture-frame";

const JPEG_QUALITY = 70;

export type FrameOutcome = { live: true; frame: AssistFrame } | { live: false; message: string };

function splitDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  return match ? { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") } : null;
}

/** Reads width/height from a JPEG's start-of-frame marker. */
export function jpegSize(bytes: Buffer): { w: number; h: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { h: bytes.readUInt16BE(offset + 5), w: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

function jpegFrame(bytes: Buffer, ts: number): AssistFrame {
  const size = jpegSize(bytes);
  if (!size) throw new Error("JPEG frame has no readable size");
  return { jpeg: `data:image/jpeg;base64,${bytes.toString("base64")}`, ...size, ts };
}

function pngToJpegFrame(bytes: Buffer, ts: number): AssistFrame {
  const png = PNG.sync.read(bytes);
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, JPEG_QUALITY);
  return { jpeg: `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`, w: png.width, h: png.height, ts };
}

/** Turns a live capture into a JPEG frame; standby stays standby, never a placeholder. */
export function toAssistFrame(capture: CaptureResult): FrameOutcome {
  if (capture.success === false) return { live: false, message: capture.message };
  const parts = splitDataUrl(capture.imageData);
  if (!parts) throw new Error("Live frame is not a base64 data URL");
  const ts = capture.timestamp;
  if (parts.mime === "image/jpeg" || parts.mime === "image/jpg") return { live: true, frame: jpegFrame(parts.bytes, ts) };
  if (parts.mime === "image/png") return { live: true, frame: pngToJpegFrame(parts.bytes, ts) };
  throw new Error(`Unsupported live frame format ${parts.mime}`);
}
