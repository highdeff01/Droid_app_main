import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  scanBarcodeFromCanvas,
  fetchInventoryItems,
  lookupBarcodeItem,
  recordBarcodeScan,
  playScanBeep,
} from "./barcode-scanner";

describe("Universal Barcode & QR Code Scanner Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles blank canvas gracefully without throwing", async () => {
    // Canvas mock
    const canvas = {
      width: 200,
      height: 200,
      getContext: vi.fn().mockReturnValue({
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(200 * 200 * 4),
          width: 200,
          height: 200,
        }),
      }),
    } as unknown as HTMLCanvasElement;

    const result = await scanBarcodeFromCanvas(canvas);
    expect(result).toBeNull();
  });

  it("fetches inventory items from server API", async () => {
    const mockItems = [
      {
        barcode: "8901030865412",
        sku: "SKU-ZEBRA-2208",
        name: "Industrial 2D Barcode Scanner",
        category: "Hardware",
        quantity: 18,
        price: 189.5,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, items: mockItems }),
    } as any);

    const items = await fetchInventoryItems();
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("SKU-ZEBRA-2208");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/mobile-stream/inventory");
  });

  it("looks up an item by barcode", async () => {
    const mockItem = {
      barcode: "012345678905",
      sku: "SKU-LOGI-MX3S",
      name: "Logitech MX Master 3S",
      category: "Electronics",
      quantity: 42,
      price: 99.99,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, item: mockItem }),
    } as any);

    const item = await lookupBarcodeItem("012345678905");
    expect(item).not.toBeNull();
    expect(item?.sku).toBe("SKU-LOGI-MX3S");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/mobile-stream/inventory/012345678905");
  });

  it("records a barcode scan and updates quantity", async () => {
    const mockResponse = {
      success: true,
      item: {
        barcode: "PKG-99201-US",
        sku: "SKU-ROLL-THERMAL",
        name: "Thermal Paper Rolls",
        quantity: 151,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await recordBarcodeScan({
      barcode: "PKG-99201-US",
      delta: 1,
    });

    expect(result.success).toBe(true);
    expect(result.item?.quantity).toBe(151);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/mobile-stream/inventory/scan",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: "PKG-99201-US", delta: 1 }),
      })
    );
  });

  it("plays scan beep safely without runtime errors", () => {
    expect(() => playScanBeep(true)).not.toThrow();
    expect(() => playScanBeep(false)).not.toThrow();
  });
});
