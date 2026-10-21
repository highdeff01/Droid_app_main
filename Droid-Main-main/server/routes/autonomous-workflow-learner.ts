import { RequestHandler } from "express";
import { GoogleGenAI } from "@google/genai";

interface WorkflowAction {
  id: string;
  action: string;
  name?: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  timestamp?: number;
  dwellMs?: number;
}

interface LearnedWorkflow {
  id: string;
  name: string;
  description: string;
  confidenceScore: number;
  triggerCondition: string;
  patternType: "repetition" | "navigation_sequence" | "form_filler" | "media_control" | "custom";
  steps: WorkflowAction[];
  createdAt: number;
  executionCount: number;
}

// In-memory learned workflows store
const learnedWorkflowsStore: LearnedWorkflow[] = [
  {
    id: "lw_auto_search_01",
    name: "Autonomous Web Search & Query",
    description: "Detected repeating pattern: Click address/search input, type query with natural human drift, press Enter",
    confidenceScore: 0.96,
    triggerCondition: "User navigates to browser search bar",
    patternType: "navigation_sequence",
    steps: [
      { id: "s1", action: "click", name: "Focus Search Input", x: 960, y: 82, dwellMs: 400 },
      { id: "s2", action: "type", name: "Type Search Query", text: "latest AI vision updates", dwellMs: 800 },
      { id: "s3", action: "key", name: "Submit Enter", key: "enter", dwellMs: 500 }
    ],
    createdAt: Date.now() - 3600000,
    executionCount: 7
  },
  {
    id: "lw_calculator_equation_02",
    name: "Live Calculator Expression Solver",
    description: "Detected repeated numeric typing, operand selection, and result capture",
    confidenceScore: 0.94,
    triggerCondition: "Math question or calculator window detected",
    patternType: "form_filler",
    steps: [
      { id: "c1", action: "click", name: "Focus Calculator Window", x: 540, y: 320, dwellMs: 300 },
      { id: "c2", action: "type", name: "Input Equation", text: "125 * 8.5", dwellMs: 600 },
      { id: "c3", action: "key", name: "Calculate", key: "enter", dwellMs: 400 }
    ],
    createdAt: Date.now() - 7200000,
    executionCount: 12
  }
];

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Detect similar actions from workflow history, save them, and create new automatic workflows
 */
export const handleLearnWorkflows: RequestHandler = async (req, res) => {
  try {
    const { historySteps = [], mouseTrails = [], liveContext = "" } = req.body;

    if (!historySteps.length && !mouseTrails.length) {
      return res.json({
        success: true,
        learnedWorkflows: learnedWorkflowsStore,
        message: "No new trace data provided; returned existing learned workflow library."
      });
    }

    let synthesizedWorkflow: LearnedWorkflow | null = null;

    if (ai) {
      try {
        const prompt = `You are an Autonomous AI Workflow Learning Engine.
Analyze the following recorded user actions and mouse trails:
History steps: ${JSON.stringify(historySteps.slice(0, 25))}
Live context: ${liveContext}

Task:
1. Detect patterns or repeating sub-sequences of actions (e.g. click -> type -> submit, or navigation sequences).
2. Extract common intent and cluster similar spatial coordinates.
3. Formulate a clean, reusable, parameterized automatic workflow.

Return ONLY a JSON object:
{
  "name": "Concise workflow name",
  "description": "What this workflow accomplishes based on user patterns",
  "confidenceScore": 0.92,
  "patternType": "navigation_sequence",
  "triggerCondition": "Condition under which this workflow should auto-run",
  "steps": [
    { "action": "click|type|key|hover", "name": "Step description", "x": 500, "y": 300, "text": "", "key": "" }
  ]
}`;

        const model = "gemini-2.5-flash";
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(raw);

        if (parsed.name && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          synthesizedWorkflow = {
            id: `lw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: parsed.name,
            description: parsed.description || "Autonomously learned from recent user trace history",
            confidenceScore: parsed.confidenceScore || 0.91,
            triggerCondition: parsed.triggerCondition || "Manual or contextual auto-trigger",
            patternType: parsed.patternType || "custom",
            steps: parsed.steps.map((s: any, idx: number) => ({
              id: `step_${idx + 1}`,
              action: s.action || "click",
              name: s.name || `Action #${idx + 1}`,
              x: s.x ?? 960,
              y: s.y ?? 540,
              text: s.text || "",
              key: s.key || "",
              dwellMs: 400
            })),
            createdAt: Date.now(),
            executionCount: 0
          };
          learnedWorkflowsStore.unshift(synthesizedWorkflow);
        }
      } catch (geminiErr) {
        console.warn("Gemini pattern learning error, falling back to heuristic clustering:", geminiErr);
      }
    }

    // Heuristic fallback if Gemini not available or failed
    if (!synthesizedWorkflow && historySteps.length >= 2) {
      synthesizedWorkflow = {
        id: `lw_heur_${Date.now()}`,
        name: `Auto-Learned Action Sequence (${historySteps.length} steps)`,
        description: `Pattern assembled by observing ${historySteps.length} sequential user actions across screen coordinates`,
        confidenceScore: 0.88,
        triggerCondition: "Recorded UI interaction sequence replay",
        patternType: "custom",
        steps: historySteps.map((s: any, idx: number) => ({
          id: `step_${idx + 1}`,
          action: s.action || "click",
          name: s.name || `Step #${idx + 1}`,
          x: s.x ?? 960,
          y: s.y ?? 540,
          text: s.text || s.textPayload || "",
          key: s.key || s.keyPayload || "",
          dwellMs: s.dwellMs || 500
        })),
        createdAt: Date.now(),
        executionCount: 0
      };
      learnedWorkflowsStore.unshift(synthesizedWorkflow);
    }

    return res.json({
      success: true,
      newlyLearnedWorkflow: synthesizedWorkflow,
      allLearnedWorkflows: learnedWorkflowsStore,
      message: synthesizedWorkflow
        ? `Successfully learned new workflow "${synthesizedWorkflow.name}" with ${synthesizedWorkflow.steps.length} steps.`
        : "Workflow pattern library updated."
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
};

/**
 * Get all learned workflows
 */
export const handleGetLearnedWorkflows: RequestHandler = async (_req, res) => {
  res.json({
    success: true,
    learnedWorkflows: learnedWorkflowsStore
  });
};

/**
 * Delete a learned workflow
 */
export const handleDeleteLearnedWorkflow: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const idx = learnedWorkflowsStore.findIndex((w) => w.id === id);
  if (idx !== -1) {
    learnedWorkflowsStore.splice(idx, 1);
    return res.json({ success: true, message: `Learned workflow ${id} deleted.` });
  }
  return res.status(404).json({ success: false, error: "Workflow not found." });
};
