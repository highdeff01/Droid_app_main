import { useState, useEffect, useCallback } from "react";

export const DEFAULT_LAYOUT_STORAGE_KEY = "sightline_workflow_flowchart_layout";

export interface LayoutSyncOptions {
  storageKey?: string;
  autoSyncDebounceMs?: number;
}

export function useWorkflowLayoutSync<N = any, E = any>(
  initialNodes: N[],
  initialEdges: E[],
  options: LayoutSyncOptions = {}
) {
  const storageKey = options.storageKey || DEFAULT_LAYOUT_STORAGE_KEY;
  const [nodes, setNodes] = useState<N[]>(initialNodes);
  const [edges, setEdges] = useState<E[]>(initialEdges);
  const [isSynced, setIsSynced] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.nodes) setNodes(parsed.nodes);
        if (parsed.edges) setEdges(parsed.edges);
        setLastSavedAt(parsed.savedAt || null);
      }
    } catch {} finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  const saveLayout = useCallback(
    (newNodes?: N[], newEdges?: E[], _immediate?: boolean) => {
      if (typeof window === "undefined") return;
      const targetNodes = newNodes || nodes;
      const targetEdges = newEdges || edges;
      const now = new Date().toLocaleTimeString();
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ nodes: targetNodes, edges: targetEdges, savedAt: now })
        );
        setIsSynced(true);
        setIsDirty(false);
        setLastSavedAt(now);
      } catch {}
    },
    [storageKey, nodes, edges]
  );

  const updateNodePosition = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setNodes((prev: any[]) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, position: pos } : n
        );
        setIsDirty(true);
        saveLayout(next as N[], edges);
        return next as N[];
      });
    },
    [edges, saveLayout]
  );

  const updateNodeData = useCallback(
    (id: string, data: any) => {
      setNodes((prev: any[]) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        );
        setIsDirty(true);
        saveLayout(next as N[], edges);
        return next as N[];
      });
    },
    [edges, saveLayout]
  );

  const resetLayout = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    saveLayout(initialNodes, initialEdges);
  }, [initialNodes, initialEdges, saveLayout]);

  const exportLayoutJson = useCallback(() => {
    return JSON.stringify({ nodes, edges, exportedAt: new Date().toISOString() }, null, 2);
  }, [nodes, edges]);

  const importLayoutJson = useCallback(
    (json: string) => {
      try {
        const parsed = JSON.parse(json);
        if (parsed.nodes) setNodes(parsed.nodes);
        if (parsed.edges) setEdges(parsed.edges);
        saveLayout(parsed.nodes || nodes, parsed.edges || edges);
        return true;
      } catch {
        return false;
      }
    },
    [nodes, edges, saveLayout]
  );

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    isSynced,
    isDirty,
    isLoaded,
    lastSavedAt,
    lastSavedTimestamp: lastSavedAt,
    isAutoSyncEnabled,
    setIsAutoSyncEnabled,
    saveLayout,
    resetLayout,
    updateNodePosition,
    updateNodeData,
    exportLayoutJson,
    importLayoutJson,
  };
}
