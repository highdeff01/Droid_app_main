# Assist bridge protocol (v1)

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
  - `GET /bridge/health` returns `{ ok: true, protocol: 1 }`.
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
| `hello` | `{ protocol, intervalMs, commands: [...] }`, sent on connect |
| `frame` | frame. Streamed every `intervalMs` (250–2000, default 500) while a live frame exists |
| `frame_standby` | `{ message }`. Sent when the live frame goes away. Frames are never faked |
| `reply` | `{ replyTo, command, ok: true, result }` or `{ replyTo, command, ok: false, error }` |
| `error` | `{ message, source?, taskId? }`. Errors from the app's error bus |
| `state_change` | `{ status, currentAction }`. The AI pipeline changed state |
| `element_change` | `{ action, x?, y?, detail? }`. The app executed an action on the screen |
| `test_request` | `{ taskId, title, ... }`. The app asks for a test or fix |

### Assist → server (commands)

Only these four commands exist. Any other `type` gets a `reply` with `ok: false` and the error
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
