# Assist bridge protocol (v2)

The main Droid app runs a bridge listener that the droid-assist prototype connects to. The main app
supplies screen frames and runs bounded input scripts; the assist app does the reasoning. Types live in
`shared/assist-bridge.ts`. Keep this file and that module in sync.

## Transport

- The listener starts with the app (`server/node-build.ts`, Vite dev middleware) and binds to
  `host:port`. The default is `127.0.0.1:3010`. `ASSIST_BRIDGE_HOST`, `ASSIST_BRIDGE_PORT`,
  `ASSIST_BRIDGE_TOKEN` and `ASSIST_BRIDGE_FRAME_MS` set the starting values, and the Settings dialog
  changes them at runtime. A change restarts the listener. Settings are not persisted.
- The WebSocket endpoint is `ws://host:port/bridge`.
- The HTTP polling fallback is on the same port:
  - `GET /bridge/frame` returns `{ frame }`, or **503** `{ status: "standby", message }` when no live frame exists.
  - `GET /bridge/events?since=<seq>` returns `{ events: Envelope[], next: <seq> }`. It is a bounded queue of the last 200 server envelopes, frames excluded.
  - `POST /bridge/command` takes a command envelope as JSON and returns its `reply` envelope. The status is 200 when the command succeeds and 400 when it is refused.
  - `GET /bridge/health` returns `{ ok: true, protocol: 2 }`.
- **Auth:** the token is optional. When one is set, every request and WS upgrade must send
  `Authorization: Bearer <token>`. Browser WebSockets cannot set headers, so they may send the subprotocol
  `bearer.<token>` instead. Otherwise the server answers **401**. When no token is set, the server refuses
  requests that carry an `Origin` header, so a web page cannot drive input.
- **Plain HTTP:** the bridge does not use TLS. When it binds to a non-loopback host, status reports
  `insecure: true` and the UI shows a warning. Do not use the bridge on an untrusted LAN, and never use it
  there without a token.

## Envelopes

Messages in both directions use the same envelope:

```json
{ "type": "string", "id": "string", "ts": 1700000000000, "payload": {} }
```

Frame payloads have the shape `{ "jpeg": "data:image/jpeg;base64,...", "w": 1280, "h": 720, "ts": 1700000000000 }`.

### Server → assist

| type | payload |
| --- | --- |
| `hello` | `{ protocol: 2, intervalMs, commands: [...], requests: [...] }`, sent on connect |
| `frame` | frame. Streamed every `intervalMs` (250–2000, default 500) while a live frame exists |
| `frame_standby` | `{ message }`. Sent when the live frame goes away. Frames are never faked |
| `reply` | `{ replyTo, command, ok: true, result }` or `{ replyTo, command, ok: false, error }` |
| `error` | `{ message, source?, taskId? }`. Errors from the app's error bus |
| `state_change` | `{ status, currentAction }`. The AI pipeline changed state |
| `element_change` | `{ action, x?, y?, detail? }`. The app executed an action on the screen |
| `test_request` | `{ taskId, title, ... }`. The app asks for a test or fix |
| `request` | `{ requestId, kind, params }`. A main → assist request (v2, see below) |
| `step_observation` | `{ stepId, passed, evidence, state }`. The main watcher's verdict on a step (v2) |
| `step_incomplete` | `{ stepId, goal, step }`. A started step passed the 10-second rule (v2) |
| `handoff` | handoff record. A takeover finished, with its outcome (v2) |
| `monitor_problem` | `{ message, source }`. The monitor detected a problem (v2) |

### Assist → server (commands)

Only these nine commands exist (the four v1 commands below and the five v2 commands in
[Protocol v2](#protocol-v2)). Any other `type` gets a `reply` with `ok: false` and the error
`Unknown command "<type>"`. An invalid payload gets `ok: false` and the validation message. Nothing
outside this set ever executes.

| type | payload | result |
| --- | --- | --- |
| `request_fresh_frame` | `{}` | frame. On standby the reply has `ok: false` |
| `report_state` | `{}` | `{ ai: { status, currentAction }, recentActions, frame: { live, ageMs?, source? }, bridge: { killSwitch, scriptRunning } }` |
| `run_script` | `{ steps: Step[] }` | `{ completed, steps: [{ index, op, executed, error? }], stoppedReason? }` |
| `intercept_notice` | `{ message, source?, level? }` | `{ logged: true }` |

Step limits for `run_script`:

- `{op:"click", x, y}`
- `{op:"type", text, x?, y?}`
- `{op:"key", key, x?, y?}`
- `{op:"wait", ms}`
- A script has 1–20 steps.
- Coordinates are integers from 0 to 10000.
- `text` is at most 500 characters.
- `key` matches `[A-Za-z0-9+_-]{1,32}`.
- `ms` is from 0 to 5000, and the waits in one script total at most 15000.
- Only one script runs at a time. A second one is refused with "busy".
- The script stops at the first step that does not execute.
- When the main app's bridge **kill switch** is tripped, new scripts are refused. A running script stops before its next step.

## Protocol v2

Version 2 makes the bridge two-way. droid-new is the boss: it owns execution and verification, and
it resolves disagreements. Both apps hold admin status, so either side can ask the other for work,
and regulation flows both ways. Everything below is additive; v1 clients keep working.

### Assist → server commands (v2)

| type | payload | result |
| --- | --- | --- |
| `user_request` | `{ text, source? }` | inbox item `{ id, text, source, receivedAt }`. A request entered on droid-new's side; it appears in the main app's Assist page |
| `step_update` | `{ stepId, goal, step, status: "started" \| "done" \| "failed", verified?, script?, tried? }` | step record (see consensus) |
| `takeover_step` | `{ stepId, goal, step, tried?, reason?, screenshots?, script? }` | handoff record `{ id, stepId, origin: "assist", outcome, detail?, result? }` |
| `create_file` | `{ kind: "workflow", workflow }` \| `{ kind: "fix_script", name, script: { steps } }` \| `{ kind: "code", path, content, summary }` | `{ kind, status: "written", path }` or `{ kind: "code", status: "proposed", proposalId, path }` |
| `request_result` | `{ requestId, ok, result?, error? }` | the settled request record. Answers a main → assist `request` |

`script` and workflow `steps` use the same step grammar and limits as `run_script` (a workflow may
have up to 100 steps). `screenshots` are at most five `data:image/(png|jpeg);base64,` URLs.

### Server → assist requests

The main app sends `request` envelopes, payload `{ requestId, kind, params }`. droid-new answers each
one with a `request_result` command carrying the same `requestId`. A request with no answer within
30 s (`ASSIST_REQUEST_TIMEOUT_MS`) is recorded as failed with `Timed out waiting for droid-new`.
Requests are refused before sending when droid-new is not connected.

| kind | params |
| --- | --- |
| `analyze_page` | `{ question? }` |
| `plan_workflow` | `{ goal }` |
| `create_workflow` | `{ workflow: { name, goal?, steps } }` |
| `run_workflow` | `{ name }` |
| `verify_target` | `{ target, x?, y? }` |
| `watch_element` | `{ target, x?, y?, durationMs? }` (1000–600000) |
| `assist_error` | `{ message, source?, context? }` |
| `user_request` | `{ text, source? }`. A request the user entered in the main app |
| `get_settings` | `{}`. Result: droid-new's settings `{ bridge?, ai?, monitor?, agents? }` |
| `set_settings` | `{ settings: { bridge?: { enabled, mode, host, port, url, token }, ai?: { endpoint, model }, monitor?: { mode: "off" \| "standard" \| "advanced", intervalMs }, agents?: { [name]: boolean } } }`. Every field optional |
| `resolve_disagreement` | `{ stepId, assistVerified, mainVerified, evidence }` |

### Step consensus

droid-new reports every step with `step_update`. On `started` the main watcher records the screen
fingerprint. On `done` or `failed` it judges the step itself: the step passes only when a live frame
exists, the screen changed since the step began and no error-bus error was recorded during it. The
step state follows from both verdicts (droid-new's is `verified`, defaulting to `status === "done"`):

| droid-new | main | state |
| --- | --- | --- |
| passed | passed | `complete` |
| failed | failed | `failed` |
| differ | differ | `disputed`. The main app sends `resolve_disagreement` to droid-new's resolution center |

Each verdict is broadcast as a `step_observation` event.

### Ten-second rule and takeover

A step still `running` 10 s (`STEP_STALL_MS`) after it started becomes `incomplete` and a
`step_incomplete` event is sent. When automatic takeover is on and the step carried a `script`, the
main app takes it over at once; otherwise the Assist page offers a manual takeover
(`POST /api/assist-bridge/steps/:stepId/takeover`).

droid-new hands off a stalled step with `takeover_step`, carrying the full context: goal, step, what
was tried, the reason and screenshots. The main app runs the supplied `script`, or asks its own Qwen
endpoint for a bounded script from that context and the live frame. An unreachable model or an
unreadable plan fails the takeover; nothing is guessed. Both directions record a handoff (origin
`assist` or `main`), log it to the main app's log hub and broadcast it as a `handoff` event with its
outcome. Takeover scripts go through the same runner as `run_script`, so the kill switch and the
one-script-at-a-time rule apply.

### Monitoring and auto-assist

While the main app runs, the bridge captures the live frame every second and keeps capture counts and
standby state (standby is reported, never faked). Each error-bus error is a detected problem: it is
broadcast as `monitor_problem`, and with auto-assist on and droid-new connected it is sent as an
`assist_error` request. `ASSIST_BRIDGE_MONITOR` (default on), `ASSIST_BRIDGE_AUTO_ASSIST` (default on)
and `ASSIST_BRIDGE_AUTO_TAKEOVER` (default off) set the starting values; `0` or `false` turns one off.
The Assist page changes them at runtime.

### File creation

- Workflow definitions and fix scripts are written directly as JSON to `ASSIST_BRIDGE_FILES_DIR`
  (default `./assist-files`), under `workflows/` and `fix-scripts/`, named from the slugified name.
- Code files are never written directly. They become a companion proposal with origin `code_file` in
  the existing approval queue, and the file is written only when that proposal is approved. The path
  must be relative and stay inside the app root; `node_modules`, `.git` and `.env*` are refused.

### Main app REST routes (v2)

The main app's UI reaches the v2 surface through `/api/assist-bridge` (behind the usual API
middleware):

| route | purpose |
| --- | --- |
| `POST /requests` `{ kind, params }` | send a request and wait for its result (502 when it failed) |
| `GET /requests` | recent requests and their outcomes |
| `GET /inbox` | user requests received from droid-new |
| `GET /steps`, `GET /handoffs` | step records and handoff log |
| `POST /steps/:stepId/takeover` | take over a known step |
| `POST /takeover` | take over a step from the main app with full context |
| `POST /run-script` `{ steps }` | run a bounded script locally (coordinate input, workflow steps) |
| `POST /files` | create a workflow, fix script or code-file proposal |
| `GET /monitor`, `POST /monitor` `{ monitoring?, autoAssist?, autoTakeover? }` | monitor status and toggles |
| `POST /monitor/problem` `{ message, source? }` | report a problem for auto-assist |
