# Droid App — Agent Guide

This is the only agent guide for this repository. It replaces the old "Fusion Starter" template
notes. Those notes were stale: they said to use pnpm and ran Express on port 8080, and neither is
true for this project.

## Architecture
- **Single-origin Vite + React + Express app.** In development the Express API (`createServer()` in `server/index.ts`) is mounted as Vite dev-server middleware (see the `api-server-middleware` plugin in `vite.config.ts`), so the frontend and `/api` share **port 3000** (`strictPort`, bound to `127.0.0.1` unless `DEV_HOST`/`HOST` is set). No separate backend process or database is needed.
- Dev entry: `npm run dev` (runs `vite`).
- Production Node server: `npm run build` builds the SPA (`vite build` → `dist/spa`) and the server (`vite build --config vite.config.server.ts` → `dist/server/node-build.mjs`, entry `server/node-build.ts`). `npm start` runs it on `PORT` (default 3000).
- Netlify: `netlify.toml` builds the client (`npm run build:client`, publish `dist/spa`). It serves `/api/*` through the function `netlify/functions/api.ts`, which wraps the same `createServer()` with `serverless-http`.
- Storage is in-memory or versioned JSON files (`ASSISTANT_STORAGE_PATH`). There is no DB to migrate or seed.
- The `python-service/` directory (pyautogui, screen capture) is for desktop automation and is **not** needed for the web preview.

## Setup quirks
- **Use npm, with `--legacy-peer-deps`.** `@vitejs/plugin-react@6` declares `peer vite@^8`, but the project pins `vite@^7`. The project actually uses `@vitejs/plugin-react-swc`, so the conflict is harmless, but npm refuses to install without `--legacy-peer-deps`. The committed `.npmrc` sets `legacy-peer-deps=true`, so a plain `npm install` / `npm ci` also works. `package-lock.json` is the lockfile. Do not use pnpm or yarn.
- `node_modules` is a named Docker volume (not bind-mounted), which keeps host and container platform binaries separate.
- The `node:22-slim` image has no `python3`/X11, so the pyautogui bridge returns its designed simulated fallbacks (`{ success: true, simulated: true }`).
- Handlers that `spawn` a child process must guard their response, so that the `error` (ENOENT) and `close` events can't both call `res.json`. A double response raises `ERR_HTTP_HEADERS_SENT`, and the startup script's `uncaughtException` handler turns that into a full process exit. See `handleInteractiveDeviceAction` in `server/routes/pyautogui-bridge.ts` for the `sendOnce` guard pattern.

## Commands
```bash
npm install      # or npm ci; legacy-peer-deps comes from .npmrc
npm run dev      # Vite dev server + Express API middleware on http://127.0.0.1:3000
npm run lint     # tsc --noEmit (what CI runs)
npm run test     # vitest --run (what CI runs)
npm run build    # client (dist/spa) + Node server (dist/server)
npm start        # node dist/server/node-build.mjs
```

## Security boundary
See `SECURITY.md`. In `createServer()`, every `/api` route goes through `createApiRateLimiter()` and `requireApiAccess` (`server/security.ts`). The only public routes are `GET /api/ping`, `/api/health` and `/api/demo`. CORS is an explicit allowlist (`CORS_ORIGINS`) that is empty by default. Register new routes inside `createServer()` after that middleware; never add a per-route bypass.

## Screen capture
`/api/capture-screen`, `/api/screen/capture` and `/api/screen-capture` all share one handler (`server/capture-frame.ts`).
- Fallback order: HUD screen-share frame → desktop capture → real mobile stream frame.
- Frames older than `FRAME_STALE_MS` (10 s) are skipped.
- With no live frame, the response is HTTP 503 `{ success: false, status: "standby", imageData: null, message, skipped }`.

## AI provider configuration
- The AI vision/planner engines (`server/ai-perception-engine.ts`, `server/ai-planner-engine.ts`, `server/routes/analyze-screenshot.ts`) take their Ollama-compatible endpoint from the request body or the `OLLAMA_ENDPOINT` env var (see `server/ai-endpoint.ts`).
  - Precedence: request body → runtime setting (`/api/ai/settings`) → `OLLAMA_ENDPOINT` → LAN default `http://192.168.1.100:11434/api/chat`.
  - On connection failure/timeout, `sendQwenChatRequest` falls back to `https://quantumclaw.net/ollama/api/chat`.
  - The model defaults to `qwen3.5:2b` (`OLLAMA_MODEL` overrides it).
- With `OLLAMA_ENDPOINT` unset, perception uses the app's Gemini provider (`detectScreenElementsAndSteps`) and the planner uses its deterministic fallback, so the AI pipeline works without any remote host.

## AI Monitor & action history
- `server/ai-monitor-store.ts` keeps the live pipeline status plus a bounded (1000 entry) in-memory history of every action. The dual-AI pipeline (`server/routes/dual-ai-pipeline.ts`) records perception → planning → execution → verification, so the history comes from real runs, not fixtures.
- Routes: `GET /api/ai-monitor`, `GET /api/ai/action-history`, `GET /api/ai/action-history.csv`, `POST /api/ai/action-history`, `DELETE /api/ai/action-history`.
- The CSV export is the Google Sheets path: download `ai-action-history.csv` from the AI Monitor screen and import it into a sheet. There is no Sheets API integration and there are no Google credentials.
- History is in memory only. It resets when the web service restarts (same as `centralLogHub`).

## Browser tab & page-element analysis
- `server/browser-inspector.ts` reads real tabs and DOM elements from Chrome over the DevTools protocol (`CHROME_CDP_URL`, default `http://localhost:9222`). It also accepts reports from the bundled extension in `browser-extension/` (load it unpacked; it posts to `/api/browser/extension-report`).
- Routes: `GET /api/browser/tabs`, `POST /api/browser/inspect`, `POST /api/browser/extension-report`, `GET /api/browser/context`.
- The last captured context is stored in `aiMonitorStore` and fed into perception automatically. `analyzeScreen` takes it as a 4th argument, adds a BROWSER CONTEXT section to the prompt, and puts the exact DOM elements ahead of visually detected ones.
- With no browser running, these routes degrade gracefully (`success: false` with a hint). They never break the AI pipeline.

## Code conventions
- Layout:
  - `client/` is the React 18 SPA: `pages/`, `components/`, `components/ui/` (Radix), `lib/`, `App.tsx`.
  - `server/` is Express: `index.ts` registers routes, `routes/` holds the handlers.
  - `shared/` holds types used by both sides.
- Routing: React Router 6 in `client/App.tsx`. Add routes above the catch-all `<Route path="*" element={<NotFound />} />`.
- Styling: TailwindCSS 3. Tokens live in `client/global.css` and `tailwind.config.ts`. Use `cn()` (clsx + tailwind-merge) for conditional classes.
- Path aliases: `@/*` → `client/`, `@shared/*` → `shared/`. Put request/response types shared by client and server in `shared/`.
- Never fabricate success: a failed request, a non-JSON body or a failed detection must show as a failure in the UI. Do not substitute `simulated: true` or placeholder data.
- Tests are Vitest `*.spec.ts` files next to the code they cover.

## Secrets
- `GEMINI_API_KEY` is **optional at boot.** Without it the app falls back to heuristic mock responses, but all AI features (screen analysis, task planning, description refinement) need a real key. Get one at https://aistudio.google.com/apikey.
- `ASSISTANT_API_KEY` is required for any non-loopback deployment (see `SECURITY.md`).
- The Firebase config is hardcoded in `firebase-applet-config.json` (used only by the `/drive` route). No secret is needed.

## Verify it works
- `curl http://localhost:3000/api/health` → `{"status":"ok",...}`
- The preview loads at `/` and redirects to `/dashboard`.
