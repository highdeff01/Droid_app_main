# Verified Screen Hub replay

## Version comparison

| Version                                                            | Retained or corrected                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub main `83e9e9a45e26340d7c828e80543239067dde667c`             | Workflow editor and AI review modal, app brief history, centralized description constraints and UI improvements.                                                                                                                                                                                                                                   |
| Prior CodeRabbit branch `27f474c1cc4838afaffe99fff489f2837d0bd17b` | Native Android QR pairing, scoped phone control credentials, accessibility screenshots/actions, foreground full-phone recording and safe calculator evaluation. The native Android bundle generator wins the mobile download merge conflict.                                                                                                       |
| This integration                                                   | Shared verified replay runner, actual agent monitor, selected-device execution, fresh screenshot evidence, bounded target reinspection, explicit outcome checks, pause/resume/cancel and truthful failures. Removes duplicate recording dispatches, coordinate displacement, fabricated loop counters and legacy simulated execution/verification. |

## Use

1. Select **Server desktop** or an authorized ADB phone. Desktop execution controls the machine running the server; browser screen sharing does not establish remote control of a different computer.
2. Record or add steps. Repeated actions preserve their original coordinates. Edit each action's name, visible target label and expected visible outcome; save a PNG/JPEG reference screenshot where useful. JSON import/export preserves these values. Recording and importing never dispatch hardware actions.
3. Press Run, run a selected step, or choose a bounded iteration count. The top workflow controller, HUD Run/Play Flow/first-ten actions, selected steps and Screen Hub execution callbacks use the same runner. The controller displays real run progress instead of timer-generated stage results. Review-modal execution uses the currently reviewed sequence.
4. For the QR-connected native phone, use **Replay Screen Hub steps on this phone** in the QR panel. It uses that session's paired phone regardless of the Dashboard's desktop/ADB selection. Record coordinates against the phone screenshot, not a desktop viewport.
5. Inspect **Replay agent monitor** for decisions, before/after screenshots, execution, recovery and confirmation. Pause/resume works at checkpoints; Stop prevents subsequent actions. A command already sent to a device cannot be undone. Reloading restores an active run while the server retains it.

Enter `ASSISTANT_API_KEY` in the Screen Hub replay key field when the server requires it. Paired-phone runs and evidence use the existing scoped session token. Credentials are never placed in evidence URLs.

## Execution contract

- Snapshot the chosen device and action list; never silently switch devices.
- Capture the actual device; reject stale screenshots and missing hardware/providers.
- Ask the configured vision model to locate only the approved action's target using the reference and current screenshot. Record a concise decision summary.
- Recapture before dispatch. If the screen changed or target is uncertain, inspect again, at most twice.
- Dispatch the allowlisted action once, await its real acknowledgment, then obtain a screenshot captured after execution completed.
- Have the vision model review before/after evidence against the expected outcome. Only explicit, certain verification completes the step.
- Stop on uncertainty or execution failure. Do not repeat text, submissions or taps whose effects may already have occurred. Inspect the evidence, edit/select the remaining step, and explicitly start a new run.
- Device locks prevent competing replay/manual commands through these adapters. Phone session revocation cancels its replay. Bounds: 100 total actions, 25 iterations, 15 minutes, four concurrent devices, 20 MB total reference images.

## Supported actions and limits

Desktop: click, double/right click, type, clear-and-type, key, hotkey, scroll up/down, wait. Uses strict PyAutoGUI with fail-safe enabled and printable ASCII typing. No Python/screen/GUI means failure, never simulated success. Run the server from the repository root so `python-service/replay.py` is available.

Phone replay: tap (`click`), printable ASCII text into the focused field, supported Android navigation keys, vertical scroll and wait. Unsupported desktop gestures/hotkeys/clear-and-type are rejected rather than translated into a different action. The existing phone manual controls still provide swipe interaction.

Legacy conditional branches, infinite loops, synthetic drift guidance, and immediate execution through the old planning endpoints cannot produce verified results. They now fail explicitly or return proposals only. Remove legacy branch rules in the step editor and express the required visible outcome. Auto-Actor comparison is advisory; its explicit execution uses the runner once and disarms. Continuous comparison does not execute repeatedly.

Screenshot evidence is in memory, limited to the latest 12 images per retained run. Finished runs are discarded when a new run starts; server restarts discard runs. General AI Monitor receives replay phase summaries. There is no durable replay audit archive.

The native recording implementation is preserved: Android's foreground screen-recording service continues when leaving the companion app, with a visible notification and stop/limit controls. It still requires Android screen-capture consent. This change does not bypass protected screens, device permissions or Android recording restrictions.

## Validation limits

Automated tests exercise fixture devices/model decisions and HTTP authorization boundaries. The cloud sandbox has no attached Android device or physical desktop GUI. Real device gestures, live-model screenshot interpretation, permission prompts and recording across apps require device acceptance testing. Older auxiliary studios contain their own preview/heuristic behavior; this change connects and verifies the Screen Hub replay path, not every experimental subsystem in the repository.
