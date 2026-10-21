import React, { useState } from "react";
import {
  Sliders,
  Sparkles,
  Zap,
  Shield,
  RotateCcw,
  Settings2,
  Gauge,
  Cpu,
  Eye,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export interface TabSettingItem {
  id: string;
  label: string;
  type: "switch" | "slider" | "select" | "button";
  value: boolean | number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
}

export interface TabContextualSettingsBarProps {
  tabType: string;
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  settings: TabSettingItem[];
  quickActions?: Array<{
    label: string;
    action: () => void;
    variant?: "default" | "outline" | "secondary" | "ghost";
  }>;
  onSettingChange?: (id: string, value: any) => void;
}

export const TabContextualSettingsBar: React.FC<
  TabContextualSettingsBarProps
> = ({
  tabType,
  title,
  icon,
  badge,
  settings: initialSettings,
  quickActions = [],
  onSettingChange,
}) => {
  const [settings, setSettings] = useState<TabSettingItem[]>(initialSettings);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleSwitch = (id: string, currentVal: boolean) => {
    const newVal = !currentVal;
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value: newVal } : s)),
    );
    onSettingChange?.(id, newVal);
  };

  const handleSliderChange = (id: string, val: number) => {
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value: val } : s)),
    );
    onSettingChange?.(id, val);
  };

  return (
    <Card className="bg-slate-900/95 border-slate-800 shadow-xl mb-4 overflow-hidden">
      {/* Header bar: all title, badge, quick actions & collapse formatted cleanly */}
      <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {icon || <Settings2 className="w-4 h-4 text-cyan-400 shrink-0" />}
          <span className="text-xs font-bold text-white font-mono tracking-wide">
            {title}
          </span>
          <span className="text-[11px] font-mono text-cyan-400/90 hidden lg:inline">
            — Contextual Settings & Active Controls
          </span>
          {badge && (
            <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono py-0.5 px-2 font-bold shadow-sm whitespace-nowrap">
              {badge}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {quickActions.map((qa, idx) => (
            <Button
              key={idx}
              size="sm"
              variant={qa.variant || "secondary"}
              onClick={qa.action}
              className="h-6 text-[10px] font-mono font-bold px-2.5 py-0 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 whitespace-nowrap shadow-sm"
            >
              {qa.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 text-[10px] font-mono font-bold text-cyan-300 hover:text-white hover:bg-slate-800 px-2 border border-slate-800 whitespace-nowrap"
          >
            {isExpanded ? "Collapse Controls" : "Expand Controls"}
          </Button>
        </div>
      </div>

      {/* Settings Rows: All text formatted in a clean single line across the panoramic section */}
      {isExpanded && (
        <CardContent className="p-3.5 bg-slate-900/60">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {settings.map((st) => (
              <div
                key={st.id}
                className="px-4 py-3 rounded-lg bg-slate-950/90 border border-slate-800 shadow-sm flex flex-nowrap items-center justify-between gap-4 hover:border-cyan-700/60 transition-colors min-h-[48px]"
              >
                {/* Left side: Label and description in a single line */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-nowrap overflow-hidden">
                  <span className="text-xs font-mono font-bold text-white whitespace-nowrap shrink-0">
                    {st.label}
                  </span>
                  {st.description && (
                    <span className="text-[11px] font-mono text-slate-300 font-normal whitespace-nowrap truncate">
                      — {st.description}
                    </span>
                  )}
                </div>

                {/* Right side: Values & Controls formatted on the same line */}
                <div className="flex items-center gap-3 shrink-0 ml-auto">
                  {st.type === "switch" && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          Boolean(st.value)
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}
                      >
                        {Boolean(st.value) ? "ON" : "OFF"}
                      </span>
                      <Switch
                        aria-label={st.label}
                        checked={Boolean(st.value)}
                        onCheckedChange={() =>
                          handleToggleSwitch(st.id, Boolean(st.value))
                        }
                      />
                    </div>
                  )}

                  {st.type === "slider" && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-28 sm:w-40">
                        <Slider
                          aria-label={st.label}
                          value={[
                            typeof st.value === "number" ? st.value : 50,
                          ]}
                          min={st.min || 0}
                          max={st.max || 100}
                          step={st.step || 1}
                          onValueChange={([v]) =>
                            handleSliderChange(st.id, v)
                          }
                        />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/90 px-2.5 py-0.5 rounded border border-cyan-800 whitespace-nowrap min-w-[68px] text-center">
                        {String(st.value)} {st.unit || ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
