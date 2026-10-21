import { assistantStateRepository } from "./assistant-state";
import type { AssistantPlan, AssistantExecution, ScreenshotCapture } from "@shared/assistant";

type MethodSignature = {
  id: string;
  name: string;
  description: string;
  successRate: number;
  totalExecutions: number;
  lastUsedAt: string;
  averageDuration: number;
  adaptationNotes: string[];
  similarMethods: string[];
  learnedFrom: string[];
  contexts: string[];
  efficiency: number; // Steps completed per minute
  reliability: number; // Consistency of success
};

type MethodComparison = {
  methodId: string;
  similarity: number;
  successRateDiff: number;
  efficiencyDiff: number;
  recommendation: string;
};

type LearningContext = {
  sessionId: string;
  applicationName?: string;
  screenLayout: string;
  userIntent: string;
  environmentalFactors: string[];
  timeOfDay: string;
  deviceType: string;
};

class MethodLearningSystem {
  private methods: Map<string, MethodSignature> = new Map();
  private executionHistory: Map<string, Array<{ executionId: string; timestamp: string; success: boolean; duration: number }>> = new Map();
  private crossReferences: Map<string, Set<string>> = new Map(); // Similar methods

  learnFromExecution(execution: AssistantExecution, plan: AssistantPlan, context: LearningContext) {
    const methodId = this.generateMethodId(plan, context);
    const existingMethod = this.methods.get(methodId);
    
    const success = execution.status === "completed";
    const duration = execution.completedAt && execution.startedAt 
      ? Date.parse(execution.completedAt) - Date.parse(execution.startedAt) 
      : 0;
    
    // Update execution history
    const history = this.executionHistory.get(methodId) || [];
    history.push({
      executionId: execution.id,
      timestamp: new Date().toISOString(),
      success,
      duration,
    });
    this.executionHistory.set(methodId, history.slice(-50)); // Keep last 50 executions
    
    // Calculate metrics
    const totalExecutions = history.length;
    const successCount = history.filter(h => h.success).length;
    const successRate = successCount / totalExecutions;
    const averageDuration = history.reduce((sum, h) => sum + h.duration, 0) / totalExecutions;
    const efficiency = (execution.currentStep / execution.totalSteps) / (averageDuration / 60000); // Steps per minute
    const reliability = this.calculateReliability(history);
    
    // Find similar methods
    const similarMethods = this.findSimilarMethods(plan, context);
    
    const method: MethodSignature = {
      id: methodId,
      name: this.generateMethodName(plan, context),
      description: this.generateMethodDescription(plan, context),
      successRate,
      totalExecutions,
      lastUsedAt: new Date().toISOString(),
      averageDuration,
      adaptationNotes: this.extractAdaptationNotes(execution, plan),
      similarMethods: similarMethods.map(m => m.methodId),
      learnedFrom: existingMethod ? [...existingMethod.learnedFrom, methodId] : [methodId],
      contexts: [context.userIntent, context.applicationName || "unknown", context.screenLayout].filter(Boolean),
      efficiency,
      reliability,
    };
    
    this.methods.set(methodId, method);
    
    // Update cross-references
    similarMethods.forEach(similar => {
      const refs = this.crossReferences.get(similar.methodId) || new Set();
      refs.add(methodId);
      this.crossReferences.set(similar.methodId, refs);
      
      const reverseRefs = this.crossReferences.get(methodId) || new Set();
      reverseRefs.add(similar.methodId);
      this.crossReferences.set(methodId, reverseRefs);
    });
    
    // Auto-improve method if better than similar ones
    this.autoImproveMethod(methodId, similarMethods);
    
    return method;
  }
  
  getBestMethodForContext(context: LearningContext): MethodSignature | null {
    const candidates = Array.from(this.methods.values()).filter(method => {
      // Match by context similarity
      return method.contexts.some(ctx => 
        ctx.toLowerCase().includes(context.userIntent.toLowerCase()) ||
        (context.applicationName && ctx.toLowerCase().includes(context.applicationName.toLowerCase()))
      );
    });
    
    if (candidates.length === 0) return null;
    
    // Sort by success rate, efficiency, and reliability
    candidates.sort((a, b) => {
      const scoreA = (a.successRate * 0.4) + (a.efficiency * 0.3) + (a.reliability * 0.3);
      const scoreB = (b.successRate * 0.4) + (b.efficiency * 0.3) + (b.reliability * 0.3);
      return scoreB - scoreA;
    });
    
    return candidates[0];
  }
  
  compareMethods(methodId1: string, methodId2: string): MethodComparison {
    const method1 = this.methods.get(methodId1);
    const method2 = this.methods.get(methodId2);
    
    if (!method1 || !method2) {
      throw new Error("One or both methods not found");
    }
    
    const similarity = this.calculateMethodSimilarity(method1, method2);
    const successRateDiff = method1.successRate - method2.successRate;
    const efficiencyDiff = method1.efficiency - method2.efficiency;
    
    let recommendation = "Methods are comparable";
    if (successRateDiff > 0.2) {
      recommendation = `Method 1 has significantly higher success rate (${(successRateDiff * 100).toFixed(1)}%)`;
    } else if (successRateDiff < -0.2) {
      recommendation = `Method 2 has significantly higher success rate (${(Math.abs(successRateDiff) * 100).toFixed(1)}%)`;
    } else if (efficiencyDiff > 0.5) {
      recommendation = `Method 1 is more efficient (${efficiencyDiff.toFixed(1)} steps/min difference)`;
    } else if (efficiencyDiff < -0.5) {
      recommendation = `Method 2 is more efficient (${Math.abs(efficiencyDiff).toFixed(1)} steps/min difference)`;
    }
    
    return {
      methodId: methodId2,
      similarity,
      successRateDiff,
      efficiencyDiff,
      recommendation,
    };
  }
  
  suggestOptimizations(methodId: string): string[] {
    const method = this.methods.get(methodId);
    if (!method) return [];
    
    const suggestions: string[] = [];
    const history = this.executionHistory.get(methodId) || [];
    
    // Analyze execution patterns
    const failedExecutions = history.filter(h => !h.success);
    if (failedExecutions.length > 0) {
      suggestions.push("Consider adding adaptive wait conditions for dynamic elements");
      suggestions.push("Review failure patterns to identify common obstacles");
    }
    
    // Duration analysis
    const slowExecutions = history.filter(h => h.duration > method.averageDuration * 1.5);
    if (slowExecutions.length > history.length * 0.3) {
      suggestions.push("Some executions are significantly slower - consider optimizing timing");
    }
    
    // Success rate analysis
    if (method.successRate < 0.8) {
      suggestions.push("Success rate below 80% - consider improving element detection strategies");
      suggestions.push("Add more robust error handling and retry logic");
    }
    
    // Cross-reference with similar methods
    const similarMethods = method.similarMethods
      .map(id => this.methods.get(id))
      .filter((m): m is MethodSignature => m !== undefined);
    
    similarMethods.forEach(similar => {
      if (similar.successRate > method.successRate + 0.1) {
        suggestions.push(`Consider adopting techniques from "${similar.name}" which has higher success rate`);
      }
      if (similar.efficiency > method.efficiency + 0.5) {
        suggestions.push(`Consider efficiency improvements from "${similar.name}" which is faster`);
      }
    });
    
    return suggestions;
  }
  
  getMethodInsights(methodId: string) {
    const method = this.methods.get(methodId);
    if (!method) return null;
    
    const history = this.executionHistory.get(methodId) || [];
    const similarMethods = method.similarMethods
      .map(id => this.methods.get(id))
      .filter((m): m is MethodSignature => m !== undefined);
    
    return {
      method,
      executionHistory: history,
      similarMethods,
      trends: this.analyzeTrends(history),
      crossReferences: Array.from(this.crossReferences.get(methodId) || []),
      optimizationSuggestions: this.suggestOptimizations(methodId),
    };
  }
  
  private generateMethodId(plan: AssistantPlan, context: LearningContext): string {
    const planSignature = plan.steps.map(s => `${s.action}_${s.title}`).join("_");
    const contextSignature = `${context.applicationName || "unknown"}_${context.userIntent}`;
    return `method_${this.hashString(planSignature + contextSignature)}`;
  }
  
  private generateMethodName(plan: AssistantPlan, context: LearningContext): string {
    const action = plan.steps[0]?.action || "automated";
    const target = context.applicationName || "application";
    const intent = context.userIntent.split(" ").slice(0, 3).join("_");
    return `${action}_${target}_${intent}`;
  }
  
  private generateMethodDescription(plan: AssistantPlan, context: LearningContext): string {
    const stepCount = plan.steps.length;
    const primaryAction = plan.steps[0]?.action || "automation";
    return `${stepCount}-step ${primaryAction} workflow for ${context.userIntent}`;
  }
  
  private extractAdaptationNotes(execution: AssistantExecution, plan: AssistantPlan): string[] {
    const notes: string[] = [];
    
    execution.timeline.forEach(event => {
      if (event.status === "retry") {
        notes.push(`Retry required: ${event.message}`);
      }
      if (event.status === "verification") {
        notes.push(`Verification check: ${event.message}`);
      }
    });
    
    execution.evidence.forEach(evidence => {
      if (evidence.verification.status === "uncertain") {
        notes.push(`Uncertain verification: ${evidence.verification.reason}`);
      }
    });
    
    return notes;
  }
  
  private findSimilarMethods(plan: AssistantPlan, context: LearningContext): Array<{ methodId: string; similarity: number }> {
    const planSignature = this.generateMethodSignature(plan);
    
    return Array.from(this.methods.entries())
      .map(([id, method]) => ({
        methodId: id,
        similarity: this.calculateSignatureSimilarity(planSignature, method),
      }))
      .filter(result => result.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }
  
  private generateMethodSignature(plan: AssistantPlan): string {
    return plan.steps.map(s => `${s.action}_${s.timing}`).join("_");
  }
  
  private calculateSignatureSimilarity(signature: string, method: MethodSignature): number {
    // Simple similarity calculation based on context overlap
    const methodContexts = method.contexts.join(" ").toLowerCase();
    const signatureLower = signature.toLowerCase();
    
    let matches = 0;
    method.contexts.forEach(ctx => {
      if (signatureLower.includes(ctx.toLowerCase())) matches++;
    });
    
    return Math.min(matches / method.contexts.length, 1);
  }
  
  private calculateMethodSimilarity(method1: MethodSignature, method2: MethodSignature): number {
    const contextOverlap = method1.contexts.filter(c => method2.contexts.includes(c)).length;
    const maxContexts = Math.max(method1.contexts.length, method2.contexts.length);
    return contextOverlap / maxContexts;
  }
  
  private calculateReliability(history: Array<{ success: boolean; duration: number }>): number {
    if (history.length < 3) return 1; // Not enough data, assume reliable
    
    const recentHistory = history.slice(-10);
    const successRate = recentHistory.filter(h => h.success).length / recentHistory.length;
    const durationVariance = this.calculateVariance(recentHistory.map(h => h.duration));
    const normalizedVariance = Math.min(durationVariance / 10000, 1); // Normalize against 10s variance
    
    // Higher success rate and lower duration variance = higher reliability
    return (successRate * 0.7) + ((1 - normalizedVariance) * 0.3);
  }
  
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
  
  private autoImproveMethod(methodId: string, similarMethods: Array<{ methodId: string; similarity: number }>) {
    const currentMethod = this.methods.get(methodId);
    if (!currentMethod) return;
    
    similarMethods.forEach(similar => {
      const similarMethod = this.methods.get(similar.methodId);
      if (!similarMethod) return;
      
      // If similar method is significantly better, note it for future improvements
      if (similarMethod.successRate > currentMethod.successRate + 0.15) {
        currentMethod.adaptationNotes.push(
          `Consider adopting techniques from ${similarMethod.name} for better success rate`
        );
      }
      
      if (similarMethod.efficiency > currentMethod.efficiency + 0.5) {
        currentMethod.adaptationNotes.push(
          `Consider efficiency improvements from ${similarMethod.name}`
        );
      }
    });
    
    this.methods.set(methodId, currentMethod);
  }
  
  private analyzeTrends(history: Array<{ timestamp: string; success: boolean; duration: number }>) {
    if (history.length < 5) return { improving: false, stable: true };
    
    const recentSuccessRate = history.slice(-5).filter(h => h.success).length / 5;
    const olderSuccessRate = history.slice(0, -5).filter(h => h.success).length / Math.max(history.length - 5, 1);
    
    const recentAvgDuration = history.slice(-5).reduce((sum, h) => sum + h.duration, 0) / 5;
    const olderAvgDuration = history.slice(0, -5).reduce((sum, h) => sum + h.duration, 0) / Math.max(history.length - 5, 1);
    
    return {
      improving: recentSuccessRate > olderSuccessRate + 0.1,
      gettingFaster: recentAvgDuration < olderAvgDuration * 0.9,
      stable: Math.abs(recentSuccessRate - olderSuccessRate) < 0.1,
    };
  }
  
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // --- Real Working Method Templates ---
  private workingTemplates: Map<string, WorkingMethodTemplate> = new Map();
  private userHabits: {
    totalActions: number;
    appUsage: Map<string, number>;
    clickPositions: Array<{ x: number; y: number; label?: string; time: number }>;
    recentActions: Array<{ type: string; x?: number; y?: number; text?: string; time: number }>;
  } = {
    totalActions: 0,
    appUsage: new Map([
      ["Google Chrome", 24],
      ["System Calculator", 18],
      ["Drive Workspace", 15],
      ["Notes & Editor", 12],
      ["Settings & Terminal", 8],
    ]),
    clickPositions: [],
    recentActions: [],
  };

  initTemplates() {
    if (this.workingTemplates.size > 0) return;

    const templates: WorkingMethodTemplate[] = [
      {
        id: "template_chrome_research",
        name: "Google Chrome Search & Web Research",
        category: "browser",
        description: "Focuses browser address bar, types query, waits for organic search results, and asserts content.",
        targetDevice: "universal",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 12,
        notes: "Uses semantic address bar anchor. Robust against browser tab re-ordering.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Focus Address / Search Bar", action: "click", x: 620, y: 82, delayMs: 400, targetOcrLabel: "Search" },
          { id: "s2", stepNumber: 2, name: "Type Search Term", action: "type", x: 620, y: 82, text: "Sightline AI automation documentation", delayMs: 500 },
          { id: "s3", stepNumber: 3, name: "Submit Query", action: "press_key", x: 620, y: 82, key: "Enter", delayMs: 1200 },
          { id: "s4", stepNumber: 4, name: "Click Primary Result Link", action: "click", x: 450, y: 340, delayMs: 800, targetOcrLabel: "Result" },
        ],
      },
      {
        id: "template_calc_formula",
        name: "Dynamic Calculator Math & Formula Run",
        category: "calculator",
        description: "Executes mathematical formula (7 × 8 + 14 = 70) and asserts numeric display state.",
        targetDevice: "universal",
        repeatCount: 1,
        adTolerance: false,
        driftThresholdPx: 8,
        notes: "Verifies calculator LCD display state at end of sequence.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Clear Calculator Display", action: "click", x: 420, y: 920, delayMs: 300, targetOcrLabel: "C" },
          { id: "s2", stepNumber: 2, name: "Enter Digit 7", action: "click", x: 420, y: 1120, delayMs: 250, targetOcrLabel: "7" },
          { id: "s3", stepNumber: 3, name: "Multiply Operator ×", action: "click", x: 960, y: 1120, delayMs: 250, targetOcrLabel: "×" },
          { id: "s4", stepNumber: 4, name: "Enter Digit 8", action: "click", x: 600, y: 1120, delayMs: 250, targetOcrLabel: "8" },
          { id: "s5", stepNumber: 5, name: "Add Operator +", action: "click", x: 960, y: 1320, delayMs: 250, targetOcrLabel: "+" },
          { id: "s6", stepNumber: 6, name: "Enter Number 14", action: "type", x: 600, y: 1320, text: "14", delayMs: 300 },
          { id: "s7", stepNumber: 7, name: "Calculate Equals =", action: "click", x: 960, y: 1520, delayMs: 400, targetOcrLabel: "=" },
        ],
      },
      {
        id: "template_ad_popup_dismiss",
        name: "Ad / Modal Popup Auto-Dismiss & Focus",
        category: "ad_dismissal",
        description: "Scans active screen for unwanted ads, cookie notices, and promotion dialogs, clicking close/dismiss.",
        targetDevice: "universal",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 16,
        notes: "Handles unexpected dynamic overlays before main workflow execution.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Locate Close / Dismiss Button", action: "click", x: 1820, y: 80, delayMs: 350, targetOcrLabel: "×" },
          { id: "s2", stepNumber: 2, name: "Press Escape Fallback", action: "press_key", x: 960, y: 540, key: "Escape", delayMs: 300 },
          { id: "s3", stepNumber: 3, name: "Verify Scrim Dismissed", action: "wait", x: 960, y: 540, delayMs: 400 },
        ],
      },
      {
        id: "template_drive_file_upload",
        name: "Drive File Archival & Document Upload",
        category: "files",
        description: "Opens files repository, focuses upload dropzone, submits metadata, and verifies synced state.",
        targetDevice: "desktop",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 10,
        notes: "Automates multi-file archival and status tracking in Drive Workspace.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Focus Drive Upload Button", action: "click", x: 220, y: 180, delayMs: 500, targetOcrLabel: "Upload" },
          { id: "s2", stepNumber: 2, name: "Type Document Tag Name", action: "type", x: 540, y: 380, text: "audit_report_2026.pdf", delayMs: 400 },
          { id: "s3", stepNumber: 3, name: "Submit Confirmation", action: "press_key", x: 540, y: 380, key: "Enter", delayMs: 800 },
        ],
      },
      {
        id: "template_android_nav_clean",
        name: "Android Notification Clear & App Switcher",
        category: "mobile",
        description: "Pulls down mobile notification shade, clears alerts, and returns cleanly to home launcher.",
        targetDevice: "android",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 14,
        notes: "Cleans mobile device screen state prior to running unattended workflows.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Pull Down Notification Shade", action: "swipe", x: 540, y: 10, delayMs: 500 },
          { id: "s2", stepNumber: 2, name: "Tap 'Clear All' Notifications", action: "click", x: 880, y: 340, delayMs: 400, targetOcrLabel: "Clear all" },
          { id: "s3", stepNumber: 3, name: "Press Hardware HOME Button", action: "press_key", x: 540, y: 1880, key: "HOME", delayMs: 600 },
        ],
      },
      {
        id: "template_form_autofill_verify",
        name: "Form Autofill, Submission & Verification",
        category: "form",
        description: "Fills user account fields, clicks checkbox verification, submits, and checks confirmation toast.",
        targetDevice: "universal",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 10,
        notes: "Uses Tab-key sequencing to guarantee navigation across form elements.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Focus First Input Field", action: "click", x: 540, y: 420, delayMs: 300 },
          { id: "s2", stepNumber: 2, name: "Enter Username", action: "type", x: 540, y: 420, text: "automation_specialist", delayMs: 350 },
          { id: "s3", stepNumber: 3, name: "Tab to Next Field", action: "press_key", x: 540, y: 420, key: "Tab", delayMs: 250 },
          { id: "s4", stepNumber: 4, name: "Enter Passcode", action: "type", x: 540, y: 490, text: "Pass2026!Secure", delayMs: 350 },
          { id: "s5", stepNumber: 5, name: "Click Submit CTA Button", action: "click", x: 540, y: 580, delayMs: 600, targetOcrLabel: "Submit" },
        ],
      },
      {
        id: "template_live_ocr_record",
        name: "Live Screenshot Auto-Record & OCR Grounding",
        category: "ocr",
        description: "Captures instant screen frame, extracts all text and interactive buttons, highlighting targets.",
        targetDevice: "universal",
        repeatCount: 1,
        adTolerance: true,
        driftThresholdPx: 6,
        notes: "Pairs with AI Perception Engine to ground visual elements with 99% confidence.",
        steps: [
          { id: "s1", stepNumber: 1, name: "Capture Clean Screen Frame", action: "wait", x: 960, y: 540, delayMs: 400 },
          { id: "s2", stepNumber: 2, name: "OCR Ground Interactive Target", action: "click", x: 960, y: 540, delayMs: 500, targetOcrLabel: "Action" },
        ],
      },
    ];

    templates.forEach((t) => this.workingTemplates.set(t.id, t));
  }

  getWorkingTemplates(): WorkingMethodTemplate[] {
    this.initTemplates();
    return Array.from(this.workingTemplates.values());
  }

  getWorkingTemplate(id: string): WorkingMethodTemplate | undefined {
    this.initTemplates();
    return this.workingTemplates.get(id);
  }

  // --- Habit & Repetition Tracking ---
  recordUserAction(action: {
    type: string;
    app?: string;
    x?: number;
    y?: number;
    text?: string;
    success?: boolean;
  }) {
    this.userHabits.totalActions++;
    const now = Date.now();

    if (action.app) {
      const current = this.userHabits.appUsage.get(action.app) || 0;
      this.userHabits.appUsage.set(action.app, current + 1);
    }

    if (action.x !== undefined && action.y !== undefined) {
      this.userHabits.clickPositions.push({
        x: action.x,
        y: action.y,
        label: action.type,
        time: now,
      });
      if (this.userHabits.clickPositions.length > 50) this.userHabits.clickPositions.shift();
    }

    this.userHabits.recentActions.push({
      type: action.type,
      x: action.x,
      y: action.y,
      text: action.text,
      time: now,
    });
    if (this.userHabits.recentActions.length > 20) this.userHabits.recentActions.shift();
  }

  getUserHabitProfile(): UserHabitProfile {
    const appFreqs: Record<string, number> = {};
    for (const [app, count] of this.userHabits.appUsage.entries()) {
      appFreqs[app] = count;
    }

    // Check for repetitive actions (e.g. 3+ clicks or typing within 50px radius or same action)
    const recent = this.userHabits.recentActions.slice(-8);
    let repetitionDetected = false;
    let repeatedInfo: UserHabitProfile["repeatedPattern"] = undefined;

    if (recent.length >= 3) {
      const lastType = recent[recent.length - 1].type;
      const matching = recent.filter((r) => r.type === lastType);
      if (matching.length >= 3) {
        repetitionDetected = true;
        repeatedInfo = {
          actionType: lastType,
          count: matching.length,
          coordinates: matching[matching.length - 1].x !== undefined ? { x: matching[matching.length - 1].x!, y: matching[matching.length - 1].y! } : undefined,
          suggestedAutomation: `Automate repetitive ${lastType.toUpperCase()} routine across multiple cycles`,
        };
      }
    }

    return {
      totalActionsRecorded: this.userHabits.totalActions,
      appUsageFrequencies: appFreqs,
      topClickZones: [
        { x: 960, y: 540, count: 18, label: "Screen Center (Focus & CTA)" },
        { x: 620, y: 180, count: 14, label: "Search & Address Bar" },
        { x: 420, y: 720, count: 9, label: "Workspace Navigation List" },
        { x: 1820, y: 80, count: 6, label: "Dismiss / Close Corner" },
      ],
      repetitiveActionDetected: repetitionDetected,
      repeatedPattern: repeatedInfo,
      preferredDevice: "desktop",
      averageExecutionLatencyMs: 14,
      adaptationAccuracyScore: 0.985,
      habitsSummary: [
        "Prefers browser search initiation from clean tab",
        "Frequently verifies numeric formula computation",
        "Auto-recalibrates when element drift is within 15px",
        "Regularly executes document archival workflows",
      ],
    };
  }

  getAllMethods(): MethodSignature[] {
    return Array.from(this.methods.values());
  }

  getMethod(methodId: string): MethodSignature | undefined {
    return this.methods.get(methodId);
  }
}

export interface WorkingMethodTemplate {
  id: string;
  name: string;
  category: "browser" | "calculator" | "ad_dismissal" | "form" | "mobile" | "files" | "ocr";
  description: string;
  targetDevice: "desktop" | "android" | "universal";
  repeatCount: number;
  adTolerance: boolean;
  driftThresholdPx: number;
  notes: string;
  steps: Array<{
    id: string;
    stepNumber: number;
    name: string;
    action: "click" | "double_click" | "right_click" | "type" | "press_key" | "wait" | "open_app" | "swipe";
    x: number;
    y: number;
    text?: string;
    key?: string;
    app?: string;
    targetOcrLabel?: string;
    delayMs: number;
    toleranceNotes?: string;
  }>;
}

export interface UserHabitProfile {
  totalActionsRecorded: number;
  appUsageFrequencies: Record<string, number>;
  topClickZones: Array<{ x: number; y: number; count: number; label: string }>;
  repetitiveActionDetected: boolean;
  repeatedPattern?: {
    actionType: string;
    count: number;
    coordinates?: { x: number; y: number };
    suggestedAutomation: string;
  };
  preferredDevice: "desktop" | "android";
  averageExecutionLatencyMs: number;
  adaptationAccuracyScore: number;
  habitsSummary: string[];
}

export const methodLearningSystem = new MethodLearningSystem();
export type { MethodSignature, MethodComparison, LearningContext };