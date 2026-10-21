import { useEffect, useState } from "react";
import type { FrameSize } from "@/lib/frame-viewport";
import { DEFAULT_FRAME, isFrameStalled, resolveFrameSize } from "@/lib/hud-layout";

export interface BufferedFrame {
  /** Last frame that finished loading; never cleared by a pending or failed poll. */
  url: string | null;
  /** Natural pixel size of that frame (DEFAULT_FRAME until one loads). */
  size: FrameSize;
  /** True while capturing when no new frame has loaded for the stall threshold. */
  stalled: boolean;
}

/**
 * Double-buffers a polled screenshot: a new URL is shown only after it has
 * decoded, so the HUD never flashes blank between polls, and a stalled stream
 * keeps showing its last good frame.
 */
export function useBufferedFrame(candidateUrl: string | null | undefined, isCapturing: boolean): BufferedFrame {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<FrameSize>(DEFAULT_FRAME);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!candidateUrl || candidateUrl === url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setUrl(candidateUrl);
      setSize(resolveFrameSize({ width: image.naturalWidth, height: image.naturalHeight }));
      setLoadedAt(Date.now());
    };
    image.src = candidateUrl;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [candidateUrl, url]);

  useEffect(() => {
    if (!isCapturing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isCapturing]);

  return { url, size, stalled: isFrameStalled(isCapturing, loadedAt, now) };
}
