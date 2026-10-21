# AI action gate: verify the screen before acting

The Dashboard checks every device action it dispatches against a fresh screenshot and its analysis before the action runs.

## How the gate works

The gate code lives in `client/lib/action-gate.ts` (`runActionGate`). `verifyBeforeDispatch` in `client/pages/Dashboard.tsx` calls it.

1. **Capture**: `POST /api/replay/capture` takes a fresh frame. The gate never reuses an old `aiLiveUrl`.
2. **Analyze**: `POST /api/ai/describe-screen` runs on that frame, the same perception flow as the Perceive button.
3. **Verify**: for an action that targets a screen position (click, double/right click, type, scroll), the target counts as confirmed only when the analysis reports an element whose bounding box contains the action point, with 12 px of slack. Key, hotkey and wait steps need a successful capture and analysis, but no target element.
4. **Dispatch**: `/api/replay` is called only after the badge is `verified`.

While steps 1–3 run, `aiThinking.isThinking` is `true` and the badge reads `verifying`. If capture or analysis fails, or no element covers the target, the badge reads `failed`, a toast shows `Action blocked: …`, and nothing is dispatched.

The confidence shown comes from the matched element, or from the report for actions with no target. If the analysis reports no confidence, the field is left empty and the HUD shows no percentage. All hardcoded confidences (0.92 / 0.93 / 0.96 / 0.97) are removed.

All dispatches go through `handleRunSequence`, and `handleRunSequence` always runs the gate. `executeHubTask` and every other dispatch path below call it, so there is one guard and no per-handler checks.

### Concurrency, Stop, loops

- While a check or replay is pending, any second action is rejected with a toast. It is not queued.
- Stop (`handleStopSequence`) aborts the in-flight capture and analysis through an `AbortController`, clears the thinking state, and blocks dispatch. No override can skip verification.
- A 45 s timeout means the gate can never hang the UI.
- Multi-iteration runs (autonomous loop, `onRunAutonomousLoop`) now run each iteration from the client and re-run the gate before every one. They stop at the first failed check or at Stop.

## Audit of dispatch paths (before this change)

None of these paths checked `aiThinking` or `verificationBadge` before executing:

| Path | Before | After |
|---|---|---|
| `handleRunSequence` (replay, Run buttons, `onReplaySteps`, MasterWorkflowOrchestrator, pipeline batch) | Posted `/api/replay` straight away | Gate first, then dispatch |
| `executeHubTask` (trio workarounds, pipeline tasks, goals, collab docks) | Went through `handleRunSequence` with no gate | Gated through `handleRunSequence` |
| `onDispatchAiMove` (entities) | Dispatched first, then set fake `aiThinking` (0.97) | `dispatchAiTarget` → gate → dispatch |
| `EntitiesRadarPanel.handleTellAiToMove` | Posted `/api/execute-task` directly, skipping the Dashboard | Hands off to `onDispatchAiMove` (gated) |
| `onNavigate` / `onTypeText` (AIDecideActionHUD) | The HUD posted `/api/execute-task` directly; the Dashboard then set fake thinking (0.92) | The HUD calls the parent callback, which goes through `dispatchAiTarget` (gated) |
| `onSelectElementTarget` (copilot) | Only added a step and set fake thinking (0.93) | `dispatchAiTarget` (gated) |
| `onSelectEntity` | Added a duplicate step and set fake thinking (0.96) | Highlights the target only; the paired `onDispatchAiMove` does the dispatch |
| AIDecideActionHUD `onReplayStep` | `handleRunSequence` with no gate | Gated |
| `AutoActorEngineStudio` `onExecuteStep` / `onTriggerSequenceExecution` | `handleRunSequence` with no gate | Gated |
| `handleTriggerPlanAndAct`, `handleToggleAutonomousLoop`, `handleGlobalExecuteOnActualPC` | `handleRunSequence` with no gate; loop iterations ran on the server | Gated; the gate runs before each iteration |
| Quick collab docks | Set fake thinking (0.93), then dispatched | Gated through `executeHubTask`; fake thinking removed |

Also fixed: the standalone Perceive button used to leave the badge stuck on `verifying` after analysis finished. It now clears the badge, so `verifying` only means a check is in progress.

### Components outside the Dashboard

These components gate AI-, autonomous- and replay-driven actions through `useActionGate` (`client/hooks/use-action-gate.ts`). The hook calls `runGatedSequence` (`client/lib/gated-dispatch.ts`), which runs `runActionGate` before every step. Each path's plan in `client/lib/gated-plans.ts` keeps the endpoint and body the component already sent. A failed check shows the toast `Action blocked: …` and dispatches nothing. Stop, or unmounting the component, aborts the check that is running. A second run while one is pending is rejected with a toast. Phone actions use 0–1 coordinates, so the gate scales them by the captured frame's width and height before it checks for a matching element.

| Component | Gated path | Left ungated (manual) |
|---|---|---|
| `ai-learning-code-synthesizer-studio` | Execute synthesized script | — |
| `click-sequence-register` | AI Repeat while recording | — |
| `continuous-mouse-route-player` | Play route on actual PC | — |
| `dynamic-calculator-typing-hub` | Dispatch typing / Solve & type | — |
| `three-ai-agents-squad` | Automate habit routine | — |
| `workflow-debugger-panel` | Replay frames 1–10 (gated per frame), execute active step, retry segment | — |
| `interactive-device-control-deck` | Run saved test workflow (gated per step) | Send text, hardware keys, launch app |
| `virtual-desktop-mirror-studio` | Tell main AI to move | Canvas click, context-menu direct hardware action |
| `MobileRemote` | AI chat actions, synced workflow run (gated per step) | PC text/keys/hotkeys/swipes, live-view taps, incoming desktop action queue |
| `LiveExecutionConsole` | Dispatch to PC test action | Logs fetch/clear |
| `AIDecideActionHUD` fallback (no `onRunSequence`) | Sequence (gated per step) | — |

`/api/pyautogui/stop`, `pause`, `resume`, `logs`, `status` and `health` are control or read-only endpoints, so they stay ungated. `app-relative-backprop-engine`, `screenshot-layering-panel` and `screenshot-pack-builder-studio` are still ungated.
