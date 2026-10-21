import { OverseerNudge, OverseerLearnedNote, WorkflowStep } from '../types/automation';
import { ActiveSection } from '../types/drive';

export interface ElementExpectation {
  id: string;
  stepId?: string;
  stepTitle: string;
  selector: string;
  targetTab?: ActiveSection;
  currentTab?: ActiveSection;
  actionType?: string;
  timeoutMs: number;
  registeredAt: number;
  resolved: boolean;
  timedOut: boolean;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  onFound?: () => void;
  onTimeout?: (exp: ElementExpectation) => void;
}

export type ObserverAlertCallback = (nudge: OverseerNudge, note: OverseerLearnedNote) => void;

/**
 * Singleton that watches the DOM via `MutationObserver` for expected
 * elements, resolving registered expectations when found or raising an
 * Overseer alert (with diagnostic recovery suggestions) when they time out.
 */
export class BackgroundUIObserver {
  private static instance: BackgroundUIObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private expectations: Map<string, ElementExpectation> = new Map();
  private alertListeners: Set<ObserverAlertCallback> = new Set();
  private isObserving: boolean = false;
  private currentActiveTab: ActiveSection = 'my-drive';
  private defaultTimeoutMs: number = 3500;
  private isEnabled: boolean = true;
  private audioContext: AudioContext | null = null;

  /** Creates the observer and starts watching the DOM for mutations. */
  constructor() {
    this.initObserver();
  }

  /** Returns the shared `BackgroundUIObserver` singleton, creating it on first use. */
  public static getInstance(): BackgroundUIObserver {
    if (!BackgroundUIObserver.instance) {
      BackgroundUIObserver.instance = new BackgroundUIObserver();
    }
    return BackgroundUIObserver.instance;
  }

  /** Enables or disables the observer, clearing pending expectations when disabled. */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearAllExpectations();
    }
  }

  /** Returns true when the observer is actively watching the DOM and enabled. */
  public isObserverActive(): boolean {
    return this.isObserving && this.isEnabled;
  }

  /** Sets the default expectation timeout in milliseconds (minimum 500ms). */
  public setDefaultTimeoutMs(timeoutMs: number): void {
    if (timeoutMs >= 500) {
      this.defaultTimeoutMs = timeoutMs;
    }
  }

  /** Returns the current default expectation timeout in milliseconds. */
  public getDefaultTimeoutMs(): number {
    return this.defaultTimeoutMs;
  }

  /** Updates the currently active tab and re-checks pending expectations. */
  public setActiveTab(tab: ActiveSection): void {
    this.currentActiveTab = tab;
    // Check pending expectations when tab changes
    this.checkAllPendingExpectations();
  }

  /** Subscribes to timeout alerts, returning an unsubscribe function. */
  public subscribe(callback: ObserverAlertCallback): () => void {
    this.alertListeners.add(callback);
    return () => {
      this.alertListeners.delete(callback);
    };
  }

  /** Sets up the `MutationObserver` watching `document.body` for relevant DOM changes. */
  private initObserver(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    try {
      this.mutationObserver = new MutationObserver((mutations) => {
        if (!this.isEnabled) return;
        this.checkAllPendingExpectations();
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'id', 'aria-hidden', 'data-state'],
      });

      this.isObserving = true;
    } catch (e) {
      console.warn('[BackgroundUIObserver] Failed to initialize MutationObserver:', e);
    }
  }

  /**
   * Registers an expectation that `config.selector` will appear in the DOM,
   * invoking `onFound` immediately or once detected, or `onTimeout` (and
   * raising an Overseer alert) if it does not appear within the timeout.
   */
  public expectElement(config: {
    selector: string;
    stepTitle?: string;
    stepId?: string;
    targetTab?: ActiveSection;
    actionType?: string;
    timeoutMs?: number;
    onFound?: () => void;
    onTimeout?: (exp: ElementExpectation) => void;
  }): string {
    if (!this.isEnabled) return '';

    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timeout = config.timeoutMs || this.defaultTimeoutMs;

    // Check if element is already present immediately
    if (this.isElementPresentInDOM(config.selector)) {
      if (config.onFound) config.onFound();
      return id;
    }

    const expectation: ElementExpectation = {
      id,
      stepId: config.stepId,
      stepTitle: config.stepTitle || `Step target: ${config.selector}`,
      selector: config.selector,
      targetTab: config.targetTab,
      currentTab: this.currentActiveTab,
      actionType: config.actionType,
      timeoutMs: timeout,
      registeredAt: Date.now(),
      resolved: false,
      timedOut: false,
      onFound: config.onFound,
      onTimeout: config.onTimeout,
    };

    // Schedule timeout watchdog
    expectation.timeoutTimer = setTimeout(() => {
      this.handleExpectationTimeout(id);
    }, timeout);

    this.expectations.set(id, expectation);
    return id;
  }

  /** Cancels a pending expectation by id, clearing its timeout timer. */
  public cancelExpectation(id: string): void {
    const exp = this.expectations.get(id);
    if (exp) {
      if (exp.timeoutTimer) clearTimeout(exp.timeoutTimer);
      this.expectations.delete(id);
    }
  }

  /** Cancels and removes all pending expectations. */
  public clearAllExpectations(): void {
    this.expectations.forEach((exp) => {
      if (exp.timeoutTimer) clearTimeout(exp.timeoutTimer);
    });
    this.expectations.clear();
  }

  /** Returns all expectations that have neither resolved nor timed out. */
  public getActiveExpectations(): ElementExpectation[] {
    return Array.from(this.expectations.values()).filter((e) => !e.resolved && !e.timedOut);
  }

  /** Returns true when `selector` matches a visible element in the DOM. */
  private isElementPresentInDOM(selector: string): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const el = document.querySelector(selector);
      if (!el) return false;

      // Ensure element is not hidden
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      return isVisible;
    } catch {
      // If invalid CSS selector, do fallback check
      return false;
    }
  }

  /** Resolves any pending expectations whose selector is now present in the DOM. */
  private checkAllPendingExpectations(): void {
    if (this.expectations.size === 0) return;

    this.expectations.forEach((exp, id) => {
      if (exp.resolved || exp.timedOut) return;

      if (this.isElementPresentInDOM(exp.selector)) {
        exp.resolved = true;
        if (exp.timeoutTimer) clearTimeout(exp.timeoutTimer);

        if (exp.onFound) exp.onFound();
        this.expectations.delete(id);
      }
    });
  }

  /** Plays a short rising alert chime via the Web Audio API, if available. */
  private playAlertChime(): void {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        if (!this.audioContext) {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, this.audioContext.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.35);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Handles an expectation's timeout firing: re-checks the DOM once more,
   * then (if still missing) diagnoses the probable cause and emits an
   * Overseer nudge/learned-note alert with a suggested recovery action.
   */
  private handleExpectationTimeout(id: string): void {
    const exp = this.expectations.get(id);
    if (!exp || exp.resolved) return;

    // Double check if it appeared right at the cutoff
    if (this.isElementPresentInDOM(exp.selector)) {
      exp.resolved = true;
      if (exp.onFound) exp.onFound();
      this.expectations.delete(id);
      return;
    }

    exp.timedOut = true;
    this.expectations.delete(id);

    // Analyze probable root causes
    const tabMismatch = exp.targetTab && exp.targetTab !== this.currentActiveTab;
    const hasModalBackdrop = typeof document !== 'undefined' && !!document.querySelector('.modal-backdrop, [role="dialog"], .alert-destructive');

    let potentialReason = `Element with selector "${exp.selector}" was not mounted in DOM after ${exp.timeoutMs}ms.`;
    if (tabMismatch) {
      potentialReason = `Tab Context Mismatch: Active view is "${this.currentActiveTab}", but target element expects "${exp.targetTab}".`;
    } else if (hasModalBackdrop) {
      potentialReason = `Modal Overlay Conflict: A dialog or backdrop may be obscuring target element "${exp.selector}".`;
    }

    // Build Overseer Nudge alert
    const nudgeId = `nudge-timeout-${Date.now()}`;
    const nudge: OverseerNudge = {
      id: nudgeId,
      title: `⚠️ Expected Element Timeout Alert: ${exp.stepTitle}`,
      message: `The sequence element "${exp.selector}" did not appear after ${exp.timeoutMs}ms. ${potentialReason}`,
      severity: 'warning',
      targetTab: exp.targetTab,
      suggestedAction: {
        label: tabMismatch
          ? `Switch to ${exp.targetTab?.toUpperCase()} Tab & Retry`
          : hasModalBackdrop
          ? "Dismiss Blocking Modal ('X')"
          : `Retry Anchor Search for ${exp.selector}`,
        step: {
          title: `Recover: ${exp.stepTitle}`,
          targetSelector: tabMismatch ? `#nav-item-${exp.targetTab}` : hasModalBackdrop ? '#btn-close-modal' : exp.selector,
          actionType: tabMismatch ? 'switch_tab' : hasModalBackdrop ? 'dismiss_overlay' : 'verify_anchor',
          targetTab: exp.targetTab || this.currentActiveTab,
          status: 'pending',
          reasoning: `Automatic recovery from UI element timeout (${exp.timeoutMs}ms elapsed).`,
        },
      },
      elementTimeoutDetails: {
        expectedSelector: exp.selector,
        stepId: exp.stepId,
        stepTitle: exp.stepTitle,
        timeoutMs: exp.timeoutMs,
        timeElapsed: exp.timeoutMs,
        currentTab: this.currentActiveTab,
        targetTab: exp.targetTab,
        potentialReason,
      },
    };

    // Build Overseer Learned Note
    const noteId = `note-timeout-${Date.now()}`;
    const note: OverseerLearnedNote = {
      id: noteId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      category: 'element_anchor',
      title: `Timeout Watchdog: Missing ${exp.selector}`,
      observation: `Background observer waited ${exp.timeoutMs}ms for "${exp.selector}" during "${exp.stepTitle}". Not found on tab "${this.currentActiveTab}".`,
      confidence: 96,
      actionTaken: 'Emitted Overseer warning alert with diagnostic recovery options.',
      frameDifferenceScore: 0.22,
    };

    // Sound alert chime
    this.playAlertChime();

    if (exp.onTimeout) {
      exp.onTimeout(exp);
    }

    // Notify Overseer panel subscribers
    this.alertListeners.forEach((listener) => {
      try {
        listener(nudge, note);
      } catch (err) {
        console.error('[BackgroundUIObserver] Error in alert listener:', err);
      }
    });
  }

  /**
   * Diagnostic tester to simulate an element timeout alert so users can test and inspect the Overseer watchdog
   */
  public simulateTimeoutAlert(params?: {
    selector?: string;
    stepTitle?: string;
    targetTab?: ActiveSection;
    timeoutMs?: number;
  }): void {
    const selector = params?.selector || '#non-existent-element-button';
    const stepTitle = params?.stepTitle || 'Simulated Starred Filter Click';
    const targetTab = params?.targetTab || (this.currentActiveTab === 'my-drive' ? 'starred' : 'my-drive');
    const timeoutMs = params?.timeoutMs || 2500;

    this.expectElement({
      selector,
      stepTitle,
      targetTab,
      timeoutMs,
    });
  }
}
