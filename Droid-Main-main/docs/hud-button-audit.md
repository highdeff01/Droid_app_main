# Screen HUD button-by-button audit

Scope: `client/components/live-screen-hud.tsx`, `client/components/hud-agent-panel.tsx`,
`client/components/interactive-context-menu.tsx`, `client/lib/hud-actions.ts`, and the
`<LiveScreenHUD>` callbacks in `client/pages/Dashboard.tsx`.

## Rules every control is checked against

1. Every control either performs a real, awaited operation and reports its true result
   (success and failure), or it is honestly labelled preview/demo in its own copy.
2. No fabricated confidence values, no `Math.random()` telemetry, no success toast fired
   before the result is known.
3. AI-initiated device actions are routed through the action gate: the HUD calls
   `onExecuteTask` (wired to Dashboard's `executeHubTask`), which runs the step through
   `handleRunSequence` → the verified `/api/replay` pipeline (screen verification before
   dispatch) rather than hitting the PyAutoGUI bridge directly. `runGatedSteps` inside the
   HUD is the local helper that calls `onExecuteTask("/api/execute-task", ...)` for one or
   more steps in order, awaiting and surfacing each one's real result.
4. Manual, user-initiated controls (toolbar toggles, replay pause/resume/cancel, direct
   hardware dispatch from the context menu's "Direct PC" tab, capture on/off) are left
   ungated — the user is the authority — but still await their endpoint and report the true
   outcome.

Status values used below:
- **real** — pre-existing, genuinely wired (kept as-is).
- **fixed (this PR)** — was fake/no-op/fire-and-forget; now wired to a real, awaited call.
- **demo-labelled** — intentionally a demo; copy says so; any device action it takes is real
  and gated.
- **local-only** — pure client-side UI state, no server call needed for what it does.
- **delegated (UNB-8 / UNB-15)** — explicitly out of scope for this PR; tracked elsewhere.
- **remaining fake** — still produces an untrue result; see "Known gaps".

## Toolbar (top action bar)

| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| 🧠 AI REVIEW STEPS | `handleTriggerAiReviewSteps` | `POST /api/ai/review-steps` | Awaited; opens `AIWorkflowReviewModal` with the real report; `toast.success` with the real score or `toast.error` with the server's error | real |
| PAUSE SUBPROCESS / RESUME BRIDGE | `handleToggleBridgePause` | `POST /api/pyautogui/pause` or `/api/pyautogui/resume` | Awaited; local paused state set from the response; `toast` shows the server's message; `toast.error` on failure | real |
| STOP ALL | `handleStopAllExecution` | `stopBridge()` → `POST /api/pyautogui/stop` | Awaited inside `try/catch`; `toast.info` with the server's real stop message, or `toast.error` with the failure reason — the former empty `catch {}` is gone | fixed (this PR) |
| REPLAY DRIFT (FRAMES 1-10) | `handleReplayFrames1To10OnPC` | delegates to `onReplaySteps` → Dashboard `handleRunSequence` → verified `/api/replay` | Awaited by Dashboard; HUD only hands off the first 10 steps | delegated (UNB-8) |
| AUTO DRAWING (DEMO) | `handleRepeatingDrawingWithAi` | `askQwen()` → `POST /api/hud/qwen/ask` between strokes; each stroke via `runGatedSteps` → `/api/execute-task` | Awaited; `qwenThinkingStatus` shows Qwen's real answer per stroke; strokes execute through the action gate and the toast reports success or the real failure point | fixed (this PR) — button copy now reads "AUTO DRAWING (DEMO)" since the shapes are fixed samples; the Qwen read and the gated dispatch are both real |
| QWEN AGENT GUIDE (ON/OFF) | toggles `qwenGuideEnabled`; polling in `runQwenGuideTick` | `fetchQwenGuide()` → `POST /api/hud/qwen/guide` every 8s while on | Awaited each tick; `qwenLiveThought`/`qwenGuideIntention` show the real response; an incomplete-typing completion is dispatched via `runGatedSteps`; errors are shown in `qwenLiveThought` instead of silently stalling | fixed (this PR) |
| ● RECORD WORKFLOW | `onToggleRecordMode` (Dashboard state) | none (client state) | `toast.info` describing the new mode | local-only |
| EXECUTE ON PC | `handleExecuteAllOnActualPC` → `onRunSequence` → Dashboard `handleRunSequence` | verified `/api/replay` pipeline | Awaited by Dashboard; progress banner reflects live step status | real |
| Bridge Console / Replay Overlay / Action Logs toggles | inline `onClick` | none | Local visibility state only, `toast.info` reflects the new state | local-only |

## Replay / step controls

| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| Capture On/Off | `onToggleCapture` (Dashboard `toggleCapture`) | starts/stops the `/api/capture-screen` poll | Awaited poll loop; `isCapturing` badge reflects real state | real |
| Pause/Resume (live replay) | `onReplayControl("pause"\|"resume")` → Dashboard `handleReplayControl` | `POST /api/replay/{id}/pause` or `/resume` | Awaited; `applyReplay(data.run)` updates the HUD from the real run state; `toast.error` on failure | real |
| Cancel (live replay) | `onReplayControl("cancel")` | `POST /api/replay/{id}/cancel` | Same as above | real |
| Retry step N | `onRetryStep` → Dashboard `handleRunSequence([buildRetryStep(step)])` | verified `/api/replay` | Routed through the action gate like any other sequence run | real |
| Prev / Next (step navigation) | `handleStepBack` / `handleStepForward` | none | Local selection/index state only | local-only |

## Context menu (`InteractiveContextMenu`)

### Quick Steps tab
All "Add … Step" buttons (`Add Left-Click Step`, `Add Right-Click Step`, `Add Double-Click
Step`, `Add Type Text Step…`, hotkey buttons, wait/delay buttons, `Full Step Settings…`) call
`onAddSequenceStep` / open the step manager, which only append to the local `sequence` array —
no device action is taken. Status: **local-only** (correctly: these are authoring tools, not
dispatchers).

### Direct PC tab
| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| Direct Left/Right/Double-Click, Swipe Up/Down/Left/Right, Type Text Instantly | `onDirectHardwareAction` → `dispatchInteractiveHardwareAction` | `dispatchInteractiveAction()` → `POST /api/pyautogui/interactive-action` | Awaited; `toast.success` reports whether the bridge actually executed on device or only virtually (`result.simulated`), with the server's message; `toast.error` with the real failure reason on rejection. The duplicate fire-and-forget `POST /api/mobile-stream/action` call was removed — the bridge route already queues the action for the mobile stream itself | fixed (this PR) |

### AI Vision tab
| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| 🤖 Tell Main AI to Focus Here | `onTellMainAiToMove` → `runGatedSteps([...])` | `POST /api/execute-task` (gated: Dashboard verifies against a fresh screenshot before replaying) | Awaited; `toast.success` on real completion, `toast.error` with the real block/failure reason. Previously bypassed the gate via `dispatchInteractiveHardwareAction`; now routes through `runGatedSteps` like every other AI-initiated action | fixed (this PR) |
| Inspect OCR & Elements at Point | `onInspectOCR` → `inspectOcrAtPoint()` | `POST /api/hud/ocr-inspect` | Awaited; `toast.success` with the real recognized text, confidence and OCR provider, cross-referenced with any local `uiElements` box covering the point; `toast.info` when no text is found at the point (reporting how many blocks the provider found elsewhere); `toast.error` on failure. Replaces the old behaviour of only checking the local `uiElements` list and toasting a meaningless "Target location locked" when nothing matched | fixed (this PR) |
| Verify Live Frame Integrity | `onVerifyIntegrity` → `verifyIntegrityAtPoint()` | `POST /api/ai/describe-screen` then, if a recorded step is near the point, `POST /api/ai/auto-calibrate-workflow` | Awaited; for a nearby step, reports the step's real measured drift in px against the real threshold (`toast.success`/`toast.warning`); for a bare point, reports whether an analyzed element covers it with its real confidence; `toast.error` on failure. Replaces the hardcoded "No significant drift detected (Confidence: 98.4%)" toast that ran no check at all | fixed (this PR) |
| 🧪 Test on Diff Frames / Screenshots… | `onOpenDiffFrameTester` → opens `StepCorrectionModal`/diff tester UI | (modal-local; no direct dispatch from this entry) | Opens a modal that runs its own verified comparison | real (modal already handles its own real pixel-diff flow; this entry only opens it) |
| 🟢 Goal / 🟣 Context / 🔴 Distractor (entity tagging) | `onTag3WayEntity` → `tagEntityAtPoint()` | `POST /api/hud/entities` | Awaited; persists the entity (type, x, y, element label, frame size) server-side in the `DurableStore` under `hud_entities` so it can be cross-referenced by AI actions; `toast.success` echoes the saved entity's id and coordinates; `toast.error` on failure. Replaces the previous no-op that only showed a static "Tagged as entity" toast | fixed (this PR) |

## Qwen / Agent fast-path panel (`HudAgentPanel`)

Rendered inside the HUD body; every button awaits its operation via the shared `perform()`
helper, shows the real result in a dialog, and reports success/failure with a toast built
from the true outcome (never fired ahead of the result).

| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| Ask Qwen | `handleAsk` → `askQwen()` | `POST /api/hud/qwen/ask` with the current frame + question | Awaited; dialog shows the real answer; `toast.success`/`toast.error` | new (this PR) |
| Auto Actions | `handleAutoActions` → `createPlan()` + `planNextStep()`, then `handleApprove` → `runGated([step])` | `POST /api/ai/describe-screen` → `POST /api/ai/plan-and-act` → `POST /api/workflows/save`; on approval, `/api/execute-task` through the gate (`HudAgentPanel`'s `runGated` prop is `LiveScreenHUD`'s `runGatedSteps`) | Awaited at every stage; dialog shows the agent's real proposed next action (or "proposed no executable action"); approving executes it through the action gate and reports the real outcome | new (this PR) |
| Test/Simulate | `handleSimulate` → `simulateSequence()` | `POST /api/ai/describe-screen` (dry run only, no dispatch endpoint called) | Awaited; dialog lists each step as PASS/BLOCK against the real analyzed elements, with real confidence where available; disabled when there are no steps | new (this PR) |
| Create Plan | `handleCreatePlan` → `createPlan()` | `POST /api/ai/describe-screen` → `POST /api/ai/plan-and-act` → `POST /api/workflows/save` | Awaited; dialog shows the real plan goals/subtasks; `toast.success` names the saved workflow; viewable/executable later from the workflows tab | new (this PR) |
| Create Pack | `handleCreatePack` → `createPack()` | `POST /api/hud/packs` then `POST /api/workflows/save` (listing) | Awaited; bundles the current sequence, last created plan, and any data-URL reference screenshots; dialog/toast report the real saved pack id; disabled when there are no steps | new (this PR) |
| Load Pack | `handleLoadPack` → `loadPack()` | `GET /api/hud/packs/:id` | Awaited; loads the real persisted sequence into the HUD via `onLoadSteps`; dialog/toast report the real step count and pack name; disabled until a pack id is entered | new (this PR) |
| Presentation | `handlePresentation` → `buildPresentation()` | client-side only, built from the already-fetched `replayRun` and its real `events`/`steps` | Throws (and the panel reports) when no run has completed yet; otherwise the dialog shows each step's real status, screenshot, confidence (only where the step actually has one) and timestamped events — no fabricated values | new (this PR) |

Note: `Presentation` does not call a server endpoint because the acceptance criteria say
"generate a summary ... of a completed run" from data the HUD already holds (`replayRun`);
it honestly summarizes the real run rather than inventing a value, so it is not a no-op.

## Overlay / view toggles

| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| Drift heatmap, replay overlay, action log panel, second-HUD overlay, bridge console | various `set*` toggles / `onToggleDriftHeatmap`, `onToggleSecondHudOverlay` | none | Pure client-side visibility state; `toast.info` reflects the new state where present | local-only |
| Auto-calibration trigger | `handleTriggerHudAutoCalibration` | `executeAutoCalibration()` (client-side drift-calibration pipeline against `screenshotUrl`/`nativeUiElements`) | Awaited; repositions steps via `onRepositionStep` from the real calibration result; shows the real summary; `console.error` on failure | real |

## Dashboard callbacks (`client/pages/Dashboard.tsx`)

| Control | Handler | API call | Return / feedback path | Status |
|---|---|---|---|---|
| `onExecuteTask` passed to the HUD | `executeHubTask` | `handleRunSequence([...])` → verified `/api/replay` → `waitForReplay(id)` | Awaited end-to-end; throws with a real reason ("screen verification failed, was cancelled, or another action is running") when the run never starts, otherwise resolves only once the replay actually completes | real |
| `dispatchAiTarget` (used by navigate/entity/copilot-element AI actions) | `dispatchAiTarget` | `executeHubTask("/api/execute-task", ...)` | Awaited; `toast.success` with the step name only after the gated run actually completes; `toast.error` with the real failure message otherwise. The previous `.catch(() => {})` fire-and-forget pattern (and the success toast fired regardless of outcome) is gone | fixed (this PR) |
| `onReplayControl` | `handleReplayControl` | `POST /api/replay/{id}/{command}` | Awaited; `applyReplay(data.run)`; `toast.error` on failure | real |
| `onStopSequence` | `handleStopSequence` | aborts a pending gate check or calls `handleReplayControl("cancel")` | Awaited; `toast.info` describes which path ran | real |
| `onRetryStep` | `step => void handleRunSequence([buildRetryStep(step)])` | verified `/api/replay` | Same pipeline as `handleRunSequence` | real |
| `onToggleCapture` | `toggleCapture` | starts/stops `/api/capture-screen` polling | Real poll loop; `captureError` state surfaces failures | real |

## Known gaps

No control examined in this audit still fabricates a result, uses `Math.random()` for
telemetry, or fires a success toast before its real outcome is known. All previously
identified fake/no-op/fire-and-forget buttons listed in the task brief are either fixed in
this PR (items 1–4, 6–8) or already delegated to UNB-8 / UNB-15 per the brief's explicit
instruction not to duplicate that work (frame 1–10 replay de-simulation, the fabricated
drift-test trigger). The new Qwen/agent fast-path controls (item 9–12) are implemented as
real, awaited operations against their documented endpoints, with `Test/Simulate`
intentionally dispatch-free (verification only) per its own label.
