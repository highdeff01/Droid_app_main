import {
  WorkflowStep,
  StepActionType,
  AutoDeploySettings,
  AutoDeployConditionRule,
  OverseerLearnedNote,
  OverseerNudge,
  SurroundingElementAnchor,
} from '../types/automation';
import { ActiveSection } from '../types/drive';
import { BackgroundUIObserver } from './uiStateObserver';

export const DEFAULT_AUTO_DEPLOY_SETTINGS: AutoDeploySettings = {
  autoContinueEnabled: true,
  autoContinueDelayMs: 1200,
  freeRoamMode: false,
  autoDeployEnabled: true,
  minConfidenceToAutoDeploy: 80,
  requireReasoningForAiStepAddition: true,
  analyzeSurroundingsBeforeStep: true,
  surroundingConsistencyThreshold: 75,
  emergencyAutoRecover: true,
  closeXAutoDismiss: true,
  autoTabRectification: true,
  overseerMonitoring: true,
  overseerAutoNudge: true,
  enableBackgroundUiObserver: true,
  expectedElementTimeoutMs: 3500,
  onElementTimeoutAction: 'alert_overseer',
  trackMouseMovementInVideo: true,
  renderMouseTrailInVideo: true,
  mouseAnomalyDetectionEnabled: true,
  mouseSpeedThresholdMultiplier: 2.2,
  customRules: [
    {
      id: 'rule-close-x',
      name: "Global 'X' Close Dismissal",
      conditionType: 'close_x_appeared',
      pattern: 'button[aria-label="Close"], .btn-close, #btn-dismiss-overlay, [data-action="close"]',
      actionToDeploy: 'dismiss_overlay',
      targetCoords: { x: 920, y: 120 },
      enabled: true,
      confidenceThreshold: 85,
      isEmergency: false,
      description: "If an 'X' button or dismiss icon appears anywhere across the viewport, auto-deploy close step to unblock UI.",
      timesTriggered: 4,
    },
    {
      id: 'rule-tab-mismatch',
      name: 'Active Tab Rectifier',
      conditionType: 'tab_mismatch',
      pattern: 'target_tab_mismatch',
      actionToDeploy: 'switch_tab',
      enabled: true,
      confidenceThreshold: 90,
      isEmergency: false,
      description: 'If a step targets elements in a different tab (e.g. Starred / Trash), automatically create and execute the switch tab step first.',
      timesTriggered: 7,
    },
    {
      id: 'rule-emergency-modal',
      name: 'Emergency Overlay Clearance',
      conditionType: 'emergency_error',
      pattern: '.alert-destructive, #emergency-modal-backdrop, .modal-blocking-error',
      actionToDeploy: 'auto_recover',
      targetCoords: { x: 500, y: 500 },
      enabled: true,
      confidenceThreshold: 95,
      isEmergency: true,
      description: 'Emergency failsafe: If fatal error banner or lock occurs, trigger safe reset and recover state.',
      timesTriggered: 1,
    },
    {
      id: 'rule-cookie-banner',
      name: 'Dismiss Floating Alerts & Toasts',
      conditionType: 'element_present',
      pattern: '.toast-notification, .consent-banner-dismiss',
      actionToDeploy: 'click',
      targetCoords: { x: 880, y: 920 },
      enabled: true,
      confidenceThreshold: 80,
      isEmergency: false,
      description: 'Dismisses floating banners so primary target coordinates remain unobstructed.',
      timesTriggered: 3,
    },
  ],
};

export const INITIAL_OVERSEER_NOTES: OverseerLearnedNote[] = [
  {
    id: 'note-1',
    timestamp: '1:15 PM',
    category: 'ui_pattern',
    title: 'Drive Search Bar Coordinates Stable',
    observation: 'Search input anchored at (X: 50%, Y: 32px) consistently across standard and high-DPI screens.',
    confidence: 99,
    actionTaken: 'Cached absolute visual bounds for instantaneous click targeting.',
    frameDifferenceScore: 0.98,
  },
  {
    id: 'note-2',
    timestamp: '1:24 PM',
    category: 'modal_dismiss',
    title: "Learned Close 'X' Behavior",
    observation: "When preview modal or dialog opens, 'X' button is positioned at top-right quadrant (X: 94%, Y: 8%).",
    confidence: 94,
    actionTaken: "Pre-generated dismiss rule candidate for instant one-click clearance.",
    frameDifferenceScore: 0.88,
  },
  {
    id: 'note-3',
    timestamp: '1:31 PM',
    category: 'tab_navigation',
    title: 'Cross-Tab Context Switch Heuristic',
    observation: 'Operations on starred files require active tab = "starred"; auto-injecting switch_tab prevents 100% of missed target events.',
    confidence: 96,
    actionTaken: 'Created autonomous tab verification prerequisite.',
    frameDifferenceScore: 0.92,
  },
  {
    id: 'note-4',
    timestamp: '1:38 PM',
    category: 'element_anchor',
    title: 'Surrounding Context Stability',
    observation: 'File table row items maintain 98.4% visual consistency when bordered by #app-header and #app-sidebar.',
    confidence: 95,
    actionTaken: 'Validated frame surrounding anchors before click dispatch.',
    frameDifferenceScore: 0.96,
  },
];

/**
 * Decides when to auto-deploy corrective workflow steps (tab switches,
 * overlay dismissal, emergency recovery) based on configured settings and
 * custom rules, and assists with AI-driven discovery of follow-up steps.
 */
export class AutoDeployEngine {
  private settings: AutoDeploySettings;
  private learnedNotes: OverseerLearnedNote[] = [];

  /** Creates the engine with the given settings (or defaults) and seeds learned notes. */
  constructor(initialSettings?: AutoDeploySettings) {
    this.settings = initialSettings || DEFAULT_AUTO_DEPLOY_SETTINGS;
    this.learnedNotes = [...INITIAL_OVERSEER_NOTES];
    this.syncObserverSettings();
  }

  /** Propagates relevant settings to the shared background UI observer instance. */
  private syncObserverSettings(): void {
    const observer = BackgroundUIObserver.getInstance();
    observer.setEnabled(this.settings.enableBackgroundUiObserver);
    observer.setDefaultTimeoutMs(this.settings.expectedElementTimeoutMs);
  }

  /** Returns a copy of the current auto-deploy settings. */
  public getSettings(): AutoDeploySettings {
    return { ...this.settings };
  }

  /** Merges `newSettings` into the current settings and resyncs the observer. */
  public updateSettings(newSettings: Partial<AutoDeploySettings>): AutoDeploySettings {
    this.settings = { ...this.settings, ...newSettings };
    this.syncObserverSettings();
    return this.settings;
  }

  /** Returns the shared `BackgroundUIObserver` singleton. */
  public getObserver(): BackgroundUIObserver {
    return BackgroundUIObserver.getInstance();
  }

  /** Returns a copy of the overseer's learned notes, most recent first. */
  public getLearnedNotes(): OverseerLearnedNote[] {
    return [...this.learnedNotes];
  }

  /** Records a new overseer learned note, generating its id and timestamp. */
  public addLearnedNote(note: Omit<OverseerLearnedNote, 'id' | 'timestamp'>): OverseerLearnedNote {
    const fullNote: OverseerLearnedNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ...note,
    };
    this.learnedNotes = [fullNote, ...this.learnedNotes];
    return fullNote;
  }

  /**
   * Evaluates if any auto-deploy rules trigger given current screen elements & state
   */
  public evaluateAutoDeployTriggers(
    activeSection: ActiveSection,
    currentStep?: WorkflowStep,
    detectedElements: string[] = []
  ): { shouldDeploy: boolean; rule?: AutoDeployConditionRule; reasoning: string; action?: StepActionType } {
    if (!this.settings.autoDeployEnabled && !this.settings.freeRoamMode) {
      return { shouldDeploy: false, reasoning: 'Auto-deploy disabled in settings.' };
    }

    // 1. Check for tab mismatch if current step is intended for another tab
    if (currentStep?.targetTab && currentStep.targetTab !== activeSection && this.settings.autoTabRectification) {
      const tabRule = this.settings.customRules.find((r) => r.conditionType === 'tab_mismatch' && r.enabled);
      if (tabRule || this.settings.freeRoamMode) {
        return {
          shouldDeploy: true,
          rule: tabRule,
          action: 'switch_tab',
          reasoning: `Target operation belongs to '${currentStep.targetTab}', but current tab is '${activeSection}'. Auto-deploying tab transition.`,
        };
      }
    }

    // 2. Check for Close 'X' appearance
    if (this.settings.closeXAutoDismiss) {
      const closeRule = this.settings.customRules.find((r) => r.conditionType === 'close_x_appeared' && r.enabled);
      if (closeRule && (detectedElements.includes('modal-close-x') || detectedElements.includes('btn-close') || detectedElements.includes('dialog_active'))) {
        return {
          shouldDeploy: true,
          rule: closeRule,
          action: 'dismiss_overlay',
          reasoning: "Detected active blocking modal with 'X' close button. Auto-deploying dismiss action based on user parameter.",
        };
      }
    }

    // 3. Check for Emergency conditions
    if (this.settings.emergencyAutoRecover) {
      const emergencyRule = this.settings.customRules.find((r) => r.isEmergency && r.enabled);
      if (emergencyRule && detectedElements.includes('emergency_error')) {
        return {
          shouldDeploy: true,
          rule: emergencyRule,
          action: 'auto_recover',
          reasoning: 'Emergency condition triggered. Executing autonomous error recovery pipeline.',
        };
      }
    }

    // 4. Check custom rules
    for (const rule of this.settings.customRules) {
      if (!rule.enabled) continue;
      if (detectedElements.includes(rule.pattern)) {
        if (this.settings.freeRoamMode || rule.confidenceThreshold <= this.settings.minConfidenceToAutoDeploy) {
          return {
            shouldDeploy: true,
            rule,
            action: rule.actionToDeploy,
            reasoning: `Custom rule '${rule.name}' condition matched (${rule.pattern}). Auto-deploy criteria satisfied.`,
          };
        }
      }
    }

    return { shouldDeploy: false, reasoning: 'No auto-deploy condition triggered.' };
  }

  /**
   * Analyzes surroundings consistency for a step
   */
  public analyzeSurroundingConsistency(
    step: WorkflowStep,
    anchors: SurroundingElementAnchor[]
  ): { passed: boolean; score: number; reasoning: string; missingAnchors: string[] } {
    if (this.settings.freeRoamMode) {
      return {
        passed: true,
        score: 100,
        reasoning: 'Free Roam Mode enabled: Surrounding element consistency check bypassed for high-velocity execution.',
        missingAnchors: [],
      };
    }

    if (!this.settings.analyzeSurroundingsBeforeStep || anchors.length === 0) {
      return {
        passed: true,
        score: 100,
        reasoning: 'Surroundings analysis not required for this step.',
        missingAnchors: [],
      };
    }

    const presentCount = anchors.filter((a) => a.present).length;
    const score = Math.round((presentCount / anchors.length) * 100);
    const passed = score >= this.settings.surroundingConsistencyThreshold;
    const missing = anchors.filter((a) => !a.present).map((a) => a.selectorOrTag);

    return {
      passed,
      score,
      reasoning: passed
        ? `Surrounding element anchors verified at ${score}% consistency (threshold: ${this.settings.surroundingConsistencyThreshold}%). Target element is safe to execute.`
        : `Surrounding element mismatch detected (${score}% vs required ${this.settings.surroundingConsistencyThreshold}%). Missing anchors: ${missing.join(', ')}. Execution paused for frame realignment.`,
      missingAnchors: missing,
    };
  }

  /**
   * AI Step Discovery & Reasoning Method
   * Discovers subsequent operations around current target and evaluates if reasoning is available.
   */
  public discoverNextOperationSteps(
    currentStep: WorkflowStep,
    activeSection: ActiveSection,
    detectedCanvasContext: { hasModal: boolean; hasUnstarredFiles: boolean; currentQuery: string }
  ): {
    canAutoAdd: boolean;
    availableReasoning?: string;
    discoveredSteps: WorkflowStep[];
  } {
    const discovered: WorkflowStep[] = [];
    let reasoning = '';

    // If modal is active, suggest close or confirm
    if (detectedCanvasContext.hasModal) {
      reasoning = 'Visual inspection identifies an active modal overlay with actionable primary button and top-right dismiss anchor.';
      discovered.push({
        id: `step-ai-discover-${Date.now()}-1`,
        title: 'Auto-Dismiss Preview Overlay',
        description: 'Close active preview dialog using top-right anchor coordinates',
        targetSelector: '#btn-close-modal',
        actionType: 'dismiss_overlay',
        targetCoords: { x: 920, y: 120 },
        targetTab: activeSection,
        status: 'pending',
        reasoning: 'Reasoning Method [Vision Heuristic #4]: Modal is currently blocking viewport access to underlying Drive item list.',
        addedBy: 'ai',
        surroundingAnchors: [
          { selectorOrTag: '.modal-backdrop', relativePosition: 'parent', present: true, confidence: 0.98 },
          { selectorOrTag: '.modal-header-title', relativePosition: 'left', present: true, confidence: 0.92 },
        ],
      });
    }

    // If on search query
    if (detectedCanvasContext.currentQuery) {
      reasoning = `Active query filter '${detectedCanvasContext.currentQuery}' is applied. Recommended operation: clear search to restore full directory visibility.`;
      discovered.push({
        id: `step-ai-discover-${Date.now()}-2`,
        title: 'Clear Drive Search Query',
        description: 'Reset search filter input to restore complete directory index',
        targetSelector: '#btn-clear-search',
        actionType: 'click',
        targetCoords: { x: 620, y: 32 },
        targetTab: activeSection,
        status: 'pending',
        reasoning: 'Reasoning Method [Query Context Analyzer]: User initiated a bulk batch operation which requires unscoped folder access.',
        addedBy: 'ai',
        surroundingAnchors: [
          { selectorOrTag: '#drive-search-input', relativePosition: 'parent', present: true, confidence: 0.99 },
        ],
      });
    }

    // If active section is not My Drive and next operation needs My Drive
    if (activeSection !== 'my-drive') {
      reasoning = `Current view is '${activeSection}'. Adding tab navigation step to return to root workspace.`;
      discovered.push({
        id: `step-ai-discover-${Date.now()}-3`,
        title: 'Navigate to My Drive Tab',
        description: 'Switch active view back to main Drive root hierarchy',
        targetSelector: '#nav-item-my-drive',
        actionType: 'switch_tab',
        targetCoords: { x: 120, y: 180 },
        targetTab: 'my-drive',
        status: 'pending',
        reasoning: 'Reasoning Method [Tab Consistency Engine]: Target operations require access to root folder items.',
        addedBy: 'ai',
        surroundingAnchors: [
          { selectorOrTag: '#app-sidebar', relativePosition: 'parent', present: true, confidence: 0.99 },
          { selectorOrTag: '#nav-item-starred', relativePosition: 'below', present: true, confidence: 0.96 },
        ],
      });
    }

    // In Free Roam Mode, we can auto-add even without strict reasoning confirmation
    const canAutoAdd = this.settings.freeRoamMode || (this.settings.requireReasoningForAiStepAddition ? reasoning.length > 0 : true);

    return {
      canAutoAdd,
      availableReasoning: reasoning || 'AI reasoning available via DOM tree traversal & visual perception bounds.',
      discoveredSteps: discovered,
    };
  }
}
