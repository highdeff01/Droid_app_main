import React from "react";
import { AiMonitorPanel } from "@/components/ai-monitor-panel";
import { Bot, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function AiMonitorPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="h-8 gap-1.5 border-slate-800 hover:bg-slate-900 text-xs font-mono"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base sm:text-lg font-bold font-mono tracking-wide">
              AI Action Monitor & Telemetry Studio
            </h1>
          </div>
        </div>
      </div>
      <AiMonitorPanel />
    </div>
  );
}
