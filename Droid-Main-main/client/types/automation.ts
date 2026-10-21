export type StepActionType =
  | 'click'
  | 'type'
  | 'key'
  | 'wait'
  | 'screenshot'
  | 'switch_tab'
  | 'dismiss_overlay'
  | 'auto_recover'
  | 'verify_anchor'
  | 'scroll';

export interface WorkflowStep {
  id?: string;
  title: string;
  actionType: StepActionType | string;
  targetSelector?: string;
  targetCoords?: { x: number; y: number };
  targetTab?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  reasoning?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface SurroundingElementAnchor {
  selector?: string;
  text?: string;
  role?: string;
  x?: number;
  y?: number;
  distancePx?: number;
  confidence?: number;
}

export interface AutoDeployConditionRule {
  id: string;
  name: string;
  conditionType: 'close_x_appeared' | 'tab_mismatch' | 'emergency_error' | 'element_present' | string;
  pattern: string;
  actionToDeploy: StepActionType | string;
  targetCoords?: { x: number; y: number };
  enabled: boolean;
  confidenceThreshold: number;
  isEmergency: boolean;
  description: string;
  timesTriggered?: number;
}

export interface AutoDeploySettings {
  autoContinueEnabled: boolean;
  autoContinueDelayMs: number;
  freeRoamMode: boolean;
  autoDeployEnabled: boolean;
  minConfidenceToAutoDeploy: number;
  requireReasoningForAiStepAddition: boolean;
  analyzeSurroundingsBeforeStep: boolean;
  surroundingConsistencyThreshold: number;
  emergencyAutoRecover: boolean;
  closeXAutoDismiss: boolean;
  autoTabRectification: boolean;
  overseerMonitoring: boolean;
  overseerAutoNudge: boolean;
  enableBackgroundUiObserver: boolean;
  expectedElementTimeoutMs: number;
  onElementTimeoutAction: string;
  trackMouseMovementInVideo: boolean;
  renderMouseTrailInVideo?: boolean;
  mouseAnomalyDetectionEnabled?: boolean;
  mouseSpeedThresholdMultiplier?: number;
  customRules: AutoDeployConditionRule[];
}

export interface OverseerLearnedNote {
  id: string;
  timestamp: string;
  category: 'ui_pattern' | 'element_anchor' | 'drift_correction' | string;
  title: string;
  observation: string;
  confidence: number;
  actionTaken: string;
  frameDifferenceScore?: number;
}

export interface OverseerNudge {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  targetTab?: string;
  suggestedAction?: {
    label: string;
    step?: WorkflowStep;
  };
  elementTimeoutDetails?: {
    expectedSelector: string;
    stepId?: string;
    stepTitle: string;
    timeoutMs: number;
    timeElapsed: number;
    currentTab?: string;
    targetTab?: string;
    potentialReason: string;
  };
  pathAnomalyDetails?: {
    currentSpeed: number;
    baselineSpeed: number;
    deviationPercentage: number;
    anomalyType: string;
    stepTitle?: string;
    targetSelector?: string;
    originalCoords?: { x: number; y: number };
    correctedWaypoints?: Array<{ x: number; y: number; time?: number }>;
    correctionMethod?: string;
    applied?: boolean;
  };
  [key: string]: any;
}
