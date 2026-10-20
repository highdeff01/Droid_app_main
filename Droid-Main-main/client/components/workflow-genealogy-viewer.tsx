import React, { useState, useEffect } from "react";
import {
  GitFork,
  Brain,
  Sparkles,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  Wand2,
  RefreshCw,
  Layers,
  Clock,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";

export interface GenealogyNode {
  id: string;
  parentId: string | null;
  name: string;
  screenTitle: string;
  actionType: string;
  operationKey: string;
  level: number;
  executionCount: number;
  successRate: number;
  avgLatencyMs: number;
  childrenIds: string[];
  isSuccessLeaf: boolean;
  isBottleneck: boolean;
  isDeadEnd: boolean;
  patternTag?: string;
  aiPatternInsight?: string;
  sampleStep: any;
}

export interface SuccessPattern {
  id: string;
  name: string;
  description: string;
  successRate: number;
  stepCount: number;
  frequency: string;
  status: "optimal" | "good" | "bottleneck";
  rootNodeId: string;
}

interface WorkflowGenealogyViewerProps {
  onSelectNode?: (node: GenealogyNode) => void;
  onSynthesizeBranch?: (workflow: any) => void;
  className?: string;
}

export function WorkflowGenealogyViewer({
  onSelectNode,
  onSynthesizeBranch,
  className = "",
}: WorkflowGenealogyViewerProps) {
  const [nodes, setNodes] = useState<GenealogyNode[]>([]);
  const [patterns, setPatterns] = useState<SuccessPattern[]>([]);
  const [selectedNode, setSelectedNode] = useState<GenealogyNode | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<SuccessPattern | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const fetchGenealogy = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson<{
        success?: boolean;
        nodes?: GenealogyNode[];
        patterns?: SuccessPattern[];
      }>("/api/mobile-stream/genealogy");
      if (data.success) {
        setNodes(data.nodes || []);
        setPatterns(data.patterns || []);
        if (data.nodes && data.nodes.length > 0 && !selectedNode) {
          setSelectedNode(data.nodes[1] || data.nodes[0]);
        }
      }
    } catch (err) {
      console.warn("Genealogy fetch note:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGenealogy();
  }, []);

  const handleSynthesize = async (node: GenealogyNode) => {
    setIsSynthesizing(true);
    try {
      const data = await safePostJson("/api/mobile-stream/genealogy/synthesize", {
        branchId: node.id,
        customName: `Lineage Master: ${node.name}`,
      });
      if (data.success && data.workflow) {
        toast.success(`Synthesized Workflow from Genealogy: "${data.workflow.name}"!`);
        if (onSynthesizeBranch) {
          onSynthesizeBranch(data.workflow);
        }
      } else {
        toast.error(data.error || "Failed to synthesize branch");
      }
    } catch {
      toast.error("Failed to synthesize branch");
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Pattern Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {patterns.map((pat) => (
          <div
            key={pat.id}
            onClick={() => setSelectedPattern(pat)}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              selectedPattern?.id === pat.id
                ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500"
                : pat.status === "optimal"
                ? "bg-emerald-950/20 border-emerald-700/40 hover:border-emerald-500"
                : pat.status === "bottleneck"
                ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                : "bg-slate-950 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">{pat.name}</h4>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                  pat.status === "optimal"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                    : pat.status === "bottleneck"
                    ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                    : "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                }`}
              >
                {(pat.successRate * 100).toFixed(0)}% SUCCESS
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1">{pat.description}</p>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 pt-1 border-t border-slate-800">
              <span>{pat.stepCount} steps</span>
              <span>Freq: {pat.frequency}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Genealogy Hierarchical View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Genealogy Tree List */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <GitFork className="w-3.5 h-3.5 text-indigo-400" /> Parent-Child Navigation Lineage ({nodes.length} nodes)
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchGenealogy}
              disabled={isLoading}
              className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 max-h-[440px] overflow-y-auto">
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const indent =
                node.level === 0 ? "ml-0" : node.level === 1 ? "ml-4" : node.level === 2 ? "ml-8" : "ml-12";

              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedNode(node);
                    if (onSelectNode) onSelectNode(node);
                  }}
                  className={`${indent} p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? "bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                      : node.isDeadEnd
                      ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                      : node.isBottleneck
                      ? "bg-amber-950/20 border-amber-800/40 hover:border-amber-600"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {node.level > 0 && <ChevronRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white truncate">{node.name}</span>
                        {node.isSuccessLeaf && (
                          <span className="px-1 py-0.2 rounded bg-emerald-950 border border-emerald-500/30 text-[9px] text-emerald-400 font-mono">
                            LEAF
                          </span>
                        )}
                        {node.isDeadEnd && (
                          <span className="px-1 py-0.2 rounded bg-rose-950 border border-rose-500/30 text-[9px] text-rose-400 font-mono">
                            DEAD ROUTE
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block truncate">
                        {node.screenTitle} • {node.actionType}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        node.successRate >= 0.9
                          ? "text-emerald-400 bg-emerald-950/60"
                          : node.successRate >= 0.7
                          ? "text-amber-400 bg-amber-950/60"
                          : "text-rose-400 bg-rose-950/60"
                      }`}
                    >
                      {(node.successRate * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{node.avgLatencyMs}ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Node Pattern Inspector & Synthesis */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-indigo-400" /> Pattern Inspector & Synthesis
            </span>
          </div>

          {selectedNode ? (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div>
                <span className="text-[10px] font-mono text-indigo-400 uppercase">
                  {selectedNode.patternTag || "Genealogy Lineage"}
                </span>
                <h4 className="text-sm font-bold text-white">{selectedNode.name}</h4>
                <span className="text-xs text-slate-400 font-mono">Key: {selectedNode.operationKey}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">Success Rate</span>
                  <p className="text-sm font-bold text-emerald-400 font-mono">
                    {(selectedNode.successRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">Avg Latency</span>
                  <p className="text-sm font-bold text-cyan-400 font-mono">{selectedNode.avgLatencyMs}ms</p>
                </div>
              </div>

              {selectedNode.aiPatternInsight && (
                <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200">
                  <span className="font-bold text-indigo-300 block text-[10px] uppercase mb-0.5">
                    AI Pattern Recognition:
                  </span>
                  {selectedNode.aiPatternInsight}
                </div>
              )}

              <Button
                size="sm"
                onClick={() => handleSynthesize(selectedNode)}
                disabled={isSynthesizing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold gap-1.5 shadow-md"
              >
                {isSynthesizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Synthesize Master Workflow
              </Button>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
              Select a node to inspect parent-child patterns.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
