/**
 * Multi-layer Universal Barcode & QR Code Scanning Engine
 * 
 * Supports 1D barcodes (EAN-13, UPC-A, Code-128, Code-39, ITF) and 2D codes (QR Code, DataMatrix).
 * Utilizes a 3-tier detection pipeline:
 *  1. Native browser BarcodeDetector API (fastest, hardware accelerated when available)
 *  2. ZXing BrowserMultiFormatReader (industry standard pure JS fallback for 1D/2D)
 *  3. jsQR (high-speed QR matrix parser on raw ImageData)
 *  4. Server-assisted fallback via /api/mobile-stream/decode-barcode
 */

import {
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
  MultiFormatReader,
} from "@zxing/library";
import jsQR from "jsqr";

export interface ScannedBarcode {
  rawValue: string;
  format: string;
  timestamp: number;
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface InventoryItem {
  barcode: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  location?: string;
  lastScanned?: string;
  notes?: string;
}

// Single multi-format reader instance
let multiFormatReader: MultiFormatReader | null = null;

function getMultiFormatReader(): MultiFormatReader {
  if (!multiFormatReader) {
    multiFormatReader = new MultiFormatReader();
  }
  return multiFormatReader;
}

// Native BarcodeDetector instance if supported
let nativeDetector: any = null;
let nativeDetectorTested = false;

function getNativeBarcodeDetector(): any | null {
  if (nativeDetectorTested) return nativeDetector;
  nativeDetectorTested = true;
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      const Formats = [
        "qr_code",
        "ean_13",
        "ean_8",
        "code_128",
        "code_39",
        "code_93",
        "upc_a",
        "upc_e",
        "itf",
        "data_matrix",
      ];
      nativeDetector = new (window as any).BarcodeDetector({ formats: Formats });
    } catch {
      nativeDetector = null;
    }
  }
  return nativeDetector;
}

/**
 * Scan barcode from an HTMLCanvasElement
 */
export async function scanBarcodeFromCanvas(
  canvas: HTMLCanvasElement
): Promise<ScannedBarcode | null> {
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return null;

  // 1. Try Native BarcodeDetector
  const native = getNativeBarcodeDetector();
  if (native) {
    try {
      const results = await native.detect(canvas);
      if (results && results.length > 0) {
        const item = results[0];
        const box = item.boundingBox;
        return {
          rawValue: item.rawValue,
          format: item.format || "BARCODE",
          timestamp: Date.now(),
          confidence: 0.99,
          boundingBox: box
            ? {
                x: box.x / width,
                y: box.y / height,
                width: box.width / width,
                height: box.height / height,
              }
            : undefined,
        };
      }
    } catch {
      // Fall through to ZXing
    }
  }

  // 2. Try ZXing MultiFormatReader
  try {
    const reader = getMultiFormatReader();
    const lumSource = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(lumSource));
    const result = reader.decode(bitmap);
    if (result && result.getText()) {
      return {
        rawValue: result.getText(),
        format: result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : "BARCODE",
        timestamp: Date.now(),
        confidence: 0.95,
      };
    }
  } catch {
    // NotFoundException is standard when no barcode is in frame
  }

  // 3. Try jsQR on raw ImageData for QR codes
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const qrCode = jsQR(imgData.data, width, height, {
        inversionAttempts: "attemptBoth",
      });
      if (qrCode && qrCode.data) {
        const loc = qrCode.location;
        const minX = Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x);
        const minY = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y);
        const maxX = Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x);
        const maxY = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);

        return {
          rawValue: qrCode.data,
          format: "QR_CODE",
          timestamp: Date.now(),
          confidence: 0.98,
          boundingBox: {
            x: Math.max(0, minX / width),
            y: Math.max(0, minY / height),
            width: Math.min(1, (maxX - minX) / width),
            height: Math.min(1, (maxY - minY) / height),
          },
        };
      }
    }
  } catch {
    // Ignore canvas read errors
  }

  return null;
}

/**
 * Scan barcode from HTMLVideoElement (live camera stream)
 */
export async function scanBarcodeFromVideo(
  video: HTMLVideoElement,
  tempCanvas?: HTMLCanvasElement
): Promise<ScannedBarcode | null> {
  if (video.readyState < 2) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  // 1. Try Native BarcodeDetector directly on video
  const native = getNativeBarcodeDetector();
  if (native) {
    try {
      const results = await native.detect(video);
      if (results && results.length > 0) {
        const item = results[0];
        const box = item.boundingBox;
        return {
          rawValue: item.rawValue,
          format: item.format || "BARCODE",
          timestamp: Date.now(),
          confidence: 0.99,
          boundingBox: box
            ? {
                x: box.x / w,
                y: box.y / h,
                width: box.width / w,
                height: box.height / h,
              }
            : undefined,
        };
      }
    } catch {
      // Fall through to canvas-based readers
    }
  }

  // Draw frame to temporary canvas
  const canvas = tempCanvas || document.createElement("canvas");
  const targetW = Math.min(w, 800);
  const targetH = Math.round((h * targetW) / w);
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, targetW, targetH);
  return scanBarcodeFromCanvas(canvas);
}

/**
 * Scan barcode from base64 data URL
 */
export async function scanBarcodeFromDataUrl(
  dataUrl: string
): Promise<ScannedBarcode | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const res = await scanBarcodeFromCanvas(canvas);
      if (res) {
        resolve(res);
        return;
      }

      // If client scan returns null, try server assisted decode
      try {
        const serverRes = await fetch("/api/mobile-stream/decode-barcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: dataUrl }),
        });
        if (serverRes.ok) {
          const data = await serverRes.json();
          if (data.success && data.barcodes && data.barcodes.length > 0) {
            resolve({
              rawValue: data.barcodes[0].rawValue,
              format: data.barcodes[0].format || "BARCODE",
              timestamp: Date.now(),
              confidence: data.barcodes[0].confidence || 0.9,
            });
            return;
          }
        }
      } catch {}

      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Inventory API Client Helpers
 */
export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  try {
    const res = await fetch("/api/mobile-stream/inventory");
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function lookupBarcodeItem(barcode: string): Promise<InventoryItem | null> {
  try {
    const res = await fetch(`/api/mobile-stream/inventory/${encodeURIComponent(barcode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.item || null;
  } catch {
    return null;
  }
}

export async function recordBarcodeScan(params: {
  barcode: string;
  delta?: number;
  productName?: string;
  category?: string;
  notes?: string;
}): Promise<{ success: boolean; item?: InventoryItem }> {
  try {
    const res = await fetch("/api/mobile-stream/inventory/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

/**
 * Play standard barcode scanner confirmation chime
 */
export function playScanBeep(success = true) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (success) {
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // A6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }

    if (navigator.vibrate) {
      navigator.vibrate(success ? [40] : [80, 50, 80]);
    }
  } catch {
    // Audio context may be restricted by browser policy
  }
}
