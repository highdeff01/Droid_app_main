import React, { useState, useEffect, useRef } from "react";
import {
  Scan,
  Barcode,
  QrCode,
  Package,
  Plus,
  Minus,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  Download,
  Trash2,
  Volume2,
  VolumeX,
  Camera,
  X,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  scanBarcodeFromVideo,
  scanBarcodeFromCanvas,
  fetchInventoryItems,
  lookupBarcodeItem,
  recordBarcodeScan,
  playScanBeep,
  ScannedBarcode,
  InventoryItem,
} from "@/lib/barcode-scanner";

interface BarcodeInventoryScannerProps {
  isOpen: boolean;
  onClose: () => void;
  videoElement?: HTMLVideoElement | null;
  onBarcodeDetected?: (barcode: ScannedBarcode, item?: InventoryItem | null) => void;
  initialBarcode?: string;
}

export function BarcodeInventoryScannerModal({
  isOpen,
  onClose,
  videoElement,
  onBarcodeDetected,
  initialBarcode,
}: BarcodeInventoryScannerProps) {
  const [activeTab, setActiveTab] = useState<"scanner" | "ledger" | "manual">("scanner");
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastScanned, setLastScanned] = useState<ScannedBarcode | null>(null);
  const [matchedItem, setMatchedItem] = useState<InventoryItem | null>(null);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [manualCode, setManualCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [recentScanLog, setRecentScanLog] = useState<Array<{ code: string; format: string; time: string; name?: string }>>([]);

  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");

  // Load inventory ledger on open
  useEffect(() => {
    if (isOpen) {
      loadInventory();
      if (initialBarcode) {
        handleProcessBarcode({
          rawValue: initialBarcode,
          format: initialBarcode.length === 13 ? "EAN_13" : "CODE_128",
          timestamp: Date.now(),
        });
      }
    } else {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isOpen, initialBarcode]);

  const loadInventory = async () => {
    setIsLoading(true);
    try {
      const items = await fetchInventoryItems();
      setInventoryList(items);
    } finally {
      setIsLoading(false);
    }
  };

  // Continuous scanner loop on provided video element
  useEffect(() => {
    if (!isOpen || !isScanning || !videoElement) return;

    const runScan = async () => {
      try {
        const result = await scanBarcodeFromVideo(videoElement);
        if (result && result.rawValue) {
          const now = Date.now();
          // Debounce same barcode within 2 seconds
          if (result.rawValue === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2000) {
            return;
          }
          lastScannedTimeRef.current = now;
          lastScannedCodeRef.current = result.rawValue;
          await handleProcessBarcode(result);
        }
      } catch {}
    };

    scanIntervalRef.current = setInterval(runScan, 400);
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isOpen, isScanning, videoElement]);

  const handleProcessBarcode = async (scanned: ScannedBarcode) => {
    setLastScanned(scanned);
    if (soundEnabled) {
      playScanBeep(true);
    }

    // Lookup item in inventory
    const item = await lookupBarcodeItem(scanned.rawValue);
    setMatchedItem(item);

    setRecentScanLog((prev) => [
      {
        code: scanned.rawValue,
        format: scanned.format,
        time: new Date().toLocaleTimeString(),
        name: item?.name,
      },
      ...prev.slice(0, 19),
    ]);

    onBarcodeDetected?.(scanned, item);
    toast.success(`Scanned [${scanned.format}]: ${scanned.rawValue}`);
  };

  const handleStockAdjustment = async (delta: number) => {
    if (!lastScanned) return;
    const res = await recordBarcodeScan({
      barcode: lastScanned.rawValue,
      delta,
      productName: matchedItem?.name,
    });
    if (res.success && res.item) {
      setMatchedItem(res.item);
      loadInventory();
      toast.success(`${delta > 0 ? "Added" : "Deducted"} ${Math.abs(delta)} stock. Current: ${res.item.quantity}`);
    } else {
      toast.error("Failed updating inventory");
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) return;
    const clean = manualCode.trim();
    setManualCode("");
    await handleProcessBarcode({
      rawValue: clean,
      format: clean.startsWith("http") ? "QR_CODE" : clean.length === 13 ? "EAN_13" : "CODE_128",
      timestamp: Date.now(),
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.info("Copied barcode to clipboard");
  };

  const handleExportCsv = () => {
    if (inventoryList.length === 0) {
      toast.error("No inventory to export");
      return;
    }
    const headers = ["Barcode", "SKU", "Item Name", "Category", "Quantity", "Price", "Location", "Last Scanned"];
    const rows = inventoryList.map((i) => [
      `"${i.barcode}"`,
      `"${i.sku}"`,
      `"${i.name}"`,
      `"${i.category}"`,
      i.quantity,
      i.price,
      `"${i.location || ""}"`,
      `"${i.lastScanned || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventory_manifest_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Downloaded Inventory CSV Manifest");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Barcode & Inventory Scanner</h3>
                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[9px] font-mono">
                  Multi-Format 1D/2D
                </Badge>
              </div>
              <p className="text-[10px] text-slate-400">
                Hardware & Camera Barcode Decoder with Real-time Stock Sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded-lg border text-xs transition-all ${
                soundEnabled
                  ? "bg-slate-800 border-emerald-500/40 text-emerald-400"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}
              title={soundEnabled ? "Mute scan audio beep" : "Enable scan audio beep"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-3 pt-2 gap-1 text-xs">
          <button
            onClick={() => setActiveTab("scanner")}
            className={`px-3 py-1.5 font-bold rounded-t-lg transition-all flex items-center gap-1.5 ${
              activeTab === "scanner"
                ? "bg-slate-950 text-emerald-400 border-t border-x border-slate-800"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scan className="w-3.5 h-3.5" /> Live Scanner
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 font-bold rounded-t-lg transition-all flex items-center gap-1.5 ${
              activeTab === "ledger"
                ? "bg-slate-950 text-emerald-400 border-t border-x border-slate-800"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="w-3.5 h-3.5" /> Stock Ledger ({inventoryList.length})
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`px-3 py-1.5 font-bold rounded-t-lg transition-all flex items-center gap-1.5 ${
              activeTab === "manual"
                ? "bg-slate-950 text-emerald-400 border-t border-x border-slate-800"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Barcode className="w-3.5 h-3.5" /> Manual Entry
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: LIVE SCANNER */}
          {activeTab === "scanner" && (
            <div className="space-y-3">
              {/* Scanner Viewfinder Box */}
              <div className="relative rounded-2xl border-2 border-emerald-500/50 bg-black overflow-hidden h-48 sm:h-56 flex items-center justify-center shadow-inner">
                {/* Aiming Reticle Laser Line */}
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse pointer-events-none" />

                {/* Corner reticle markers */}
                <div className="absolute w-6 h-6 border-t-2 border-l-2 border-emerald-400 top-4 left-4" />
                <div className="absolute w-6 h-6 border-t-2 border-r-2 border-emerald-400 top-4 right-4" />
                <div className="absolute w-6 h-6 border-b-2 border-l-2 border-emerald-400 bottom-4 left-4" />
                <div className="absolute w-6 h-6 border-b-2 border-r-2 border-emerald-400 bottom-4 right-4" />

                <div className="flex flex-col items-center justify-center text-center p-4 z-10 space-y-2 pointer-events-none">
                  <Scan className="w-8 h-8 text-emerald-400/80 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-emerald-300">
                    ALIGN BARCODE OR QR CODE IN FRAME
                  </span>
                  <span className="text-[10px] text-slate-400 max-w-xs">
                    Point rear or front camera directly at 1D UPC/EAN or 2D QR code
                  </span>
                </div>

                <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
                  <Badge className="bg-black/70 text-[9px] font-mono text-emerald-300 border border-emerald-500/30">
                    🟢 AUTO-DETECT ACTIVE
                  </Badge>
                </div>
              </div>

              {/* Instant Test / Sample Barcode Simulator Triggers */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> One-Click Test Barcodes:
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">Instant test without physical scanner</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: "Zebra DS2208", code: "8901030865412", fmt: "EAN_13" },
                    { label: "Logitech MX 3S", code: "012345678905", fmt: "UPC_A" },
                    { label: "Thermal Rolls", code: "PKG-99201-US", fmt: "CODE_128" },
                    { label: "Stabilo Boss", code: "4006381333931", fmt: "EAN_13" },
                    { label: "Anker Cable", code: "793573187654", fmt: "UPC_A" },
                    { label: "IoT Node QR", code: "https://sightline.io/asset/DEV-0428", fmt: "QR_CODE" },
                  ].map((sample) => (
                    <button
                      key={sample.code}
                      onClick={() =>
                        handleProcessBarcode({
                          rawValue: sample.code,
                          format: sample.fmt,
                          timestamp: Date.now(),
                        })
                      }
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/60 text-left transition-all group"
                    >
                      <div className="text-[10px] font-bold text-white group-hover:text-emerald-300 truncate">
                        {sample.label}
                      </div>
                      <div className="text-[8px] font-mono text-slate-400 truncate">{sample.code}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scanned Barcode Result Card */}
              {lastScanned ? (
                <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 border-2 border-emerald-500/60 shadow-xl space-y-2.5 animate-in fade-in zoom-in-95">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-emerald-600 text-white text-[9px] font-mono">
                          {lastScanned.format}
                        </Badge>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(lastScanned.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <h4 className="text-base font-mono font-bold text-white break-all pt-1">
                        {lastScanned.rawValue}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(lastScanned.rawValue)}
                        className="h-7 px-2 border-slate-700 text-slate-300 text-xs"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </Button>
                      {lastScanned.rawValue.startsWith("http") && (
                        <Button
                          size="sm"
                          onClick={() => window.open(lastScanned.rawValue, "_blank")}
                          className="h-7 px-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Matched Inventory Details */}
                  {matchedItem ? (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">{matchedItem.name}</div>
                        <div className="text-[9px] font-mono text-cyan-400">
                          SKU: {matchedItem.sku} • {matchedItem.category} • ${matchedItem.price.toFixed(2)}
                        </div>
                        {matchedItem.location && (
                          <div className="text-[9px] text-slate-400">📍 {matchedItem.location}</div>
                        )}
                      </div>

                      {/* Stock Adjuster */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-[10px] text-slate-400 font-mono">Stock Level:</div>
                        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                          <button
                            onClick={() => handleStockAdjustment(-1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 flex items-center justify-center font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-xs text-white">
                            {matchedItem.quantity}
                          </span>
                          <button
                            onClick={() => handleStockAdjustment(1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-emerald-900/60 text-slate-300 hover:text-emerald-300 flex items-center justify-center font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/40 flex items-center justify-between">
                      <div className="text-xs text-amber-300 font-medium">
                        Unregistered Barcode: Click "+1 Stock" to auto-register
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleStockAdjustment(1)}
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1"
                      >
                        <Plus className="w-3 h-3" /> Register & Add
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-500">
                  No barcode scanned yet. Target camera or tap one of the test barcodes above.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STOCK LEDGER */}
          {activeTab === "ledger" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">
                  Total Items: {inventoryList.length} • Units in Stock:{" "}
                  {inventoryList.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadInventory}
                    className="h-7 px-2 border-slate-700 text-xs text-slate-300"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-7 px-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold gap-1"
                  >
                    <Download className="w-3 h-3" /> Export CSV
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                {inventoryList.map((item) => (
                  <div key={item.barcode} className="p-2.5 flex items-center justify-between hover:bg-slate-900/90">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-white">{item.name}</div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                        <span className="text-cyan-400 font-bold">{item.sku}</span>
                        <span>•</span>
                        <span className="text-slate-300">{item.barcode}</span>
                        <span>•</span>
                        <span>{item.category}</span>
                      </div>
                      {item.location && (
                        <div className="text-[9px] text-slate-500">📍 {item.location}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-800 text-white font-mono text-xs px-2 py-0.5">
                        {item.quantity} units
                      </Badge>
                      <button
                        onClick={() =>
                          handleProcessBarcode({
                            rawValue: item.barcode,
                            format: "EAN_13",
                            timestamp: Date.now(),
                          })
                        }
                        className="p-1.5 rounded bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all"
                        title="Scan/Select Item"
                      >
                        <Scan className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MANUAL ENTRY */}
          {activeTab === "manual" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-emerald-400" /> Enter Barcode, SKU or Serial Number:
                </label>
                <div className="flex gap-2">
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                    placeholder="e.g. 8901030865412, SKU-ZEBRA-2208..."
                    className="bg-slate-950 border-slate-700 text-white text-xs font-mono"
                  />
                  <Button
                    onClick={handleManualSubmit}
                    disabled={!manualCode.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    Lookup
                  </Button>
                </div>
              </div>

              {/* Recent Scan History */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Session Scan History ({recentScanLog.length})
                </span>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {recentScanLog.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono font-bold text-white text-[11px]">{log.code}</div>
                        <div className="text-[9px] text-slate-400">
                          {log.name || "Custom Code"} • {log.format}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">{log.time}</span>
                    </div>
                  ))}
                  {recentScanLog.length === 0 && (
                    <div className="text-[11px] text-slate-600 p-2 italic">No scans in this session yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>Sightline Barcode Core v2.4 • Active</span>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-6 text-xs text-slate-300">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
