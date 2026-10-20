# Base44 Dev Environment

## Architecture
- **Single-origin Vite + React + Express app.** The Express API is mounted as Vite dev-server middleware (see `vite.config.ts` `api-server-middleware` plugin), so frontend and API share port 3000. No separate backend service or database is needed.
- Dev entry: `npx tsx scripts/start-dev.ts` (programmatic Vite launch with pre-flight checks). Equivalent to `npm run dev`.
- Storage is in-memory / versioned JSON files (`ASSISTANT_STORAGE_PATH`). No DB to migrate or seed.
- The `python-service/` directory (pyautogui, screen capture) is for desktop automation and is **not** needed for the web preview.

## Setup quirks
- **`npm install --legacy-peer-deps` is required.** `@vitejs/plugin-react@6` declares `peer vite@^8` but the project pins `vite@^7`. The project actually uses `@vitejs/plugin-react-swc` (not plugin-react), so the conflict is harmless but npm refuses to install without `--legacy-peer-deps`. A committed `.npmrc` now sets `legacy-peer-deps=true`, so a plain `npm install` also works.
- `node_modules` is a named Docker volume (not bind-mounted) to keep host/container platform binaries separate.
- The `node:22-slim` image has no `python3`/X11, so the pyautogui bridge returns its designed simulated fallbacks (`{ success: true, simulated: true }`). Handlers that `spawn` a child process must guard their response so the `error` (ENOENT) and `close` events can't both call `res.json` — a double response raises `ERR_HTTP_HEADERS_SENT`, which the startup script's `uncaughtException` handler turns into a full process exit. See `handleInteractiveDeviceAction` in `server/routes/pyautogui-bridge.ts` for the `sendOnce` guard pattern.

## AI provider configuration
- The AI vision/planner engines (`server/ai-perception-engine.ts`, `server/ai-planner-engine.ts`, `server/routes/analyze-screenshot.ts`) take their Ollama-compatible endpoint from the request body or the `OLLAMA_ENDPOINT` env var (see `server/ai-endpoint.ts`). Nothing is hardcoded.
- With `OLLAMA_ENDPOINT` unset, perception uses the app's Gemini provider (`detectScreenElementsAndSteps`) and the planner uses its deterministic fallback, so the AI pipeline works without any remote host.

## AI Monitor & action history
- `server/ai-monitor-store.ts` keeps the live pipeline status plus a bounded (1000 entry) in-memory history of every action. The dual-AI pipeline (`server/routes/dual-ai-pipeline.ts`) records perception → planning → execution → verification, so the history is populated by real runs, not fixtures.
- Routes: `GET /api/ai-monitor`, `GET /api/ai/action-history`, `GET /api/ai/action-history.csv`, `POST /api/ai/action-history`, `DELETE /api/ai/action-history`.
- The CSV export is the Google Sheets path: download `ai-action-history.csv` from the AI Monitor screen and import it into a sheet. There is no Sheets API integration and no Google credentials.
- History is in memory only — it resets when the web service restarts (same as `centralLogHub`).

## Browser tab & page-element analysis
- `server/browser-inspector.ts` reads real tabs and DOM elements from Chrome over the DevTools protocol (`CHROME_CDP_URL`, default `http://localhost:9222`), and accepts reports from the bundled extension in `browser-extension/` (load unpacked; posts to `/api/browser/extension-report`).
- Routes: `GET /api/browser/tabs`, `POST /api/browser/inspect`, `POST /api/browser/extension-report`, `GET /api/browser/context`.
- The last captured context is stored in `aiMonitorStore` and automatically fed into perception: `analyzeScreen` takes it as a 4th argument, adds a BROWSER CONTEXT section to the prompt, and puts the exact DOM elements in front of visually detected ones.
- With no browser running these routes degrade gracefully (`success: false` with a hint) — they never break the AI pipeline.

## Secrets
- `GEMINI_API_KEY` — **optional at boot.** The app falls back to heuristic mock responses without it, but all AI features (screen analysis, task planning, description refinement) require a real key. Get one at https://aistudio.google.com/apikey.
- Firebase config is hardcoded in `firebase-applet-config.json` (used only by the `/drive` route). No secret needed.

## Verify it works
- `curl http://localhost:3000/api/health` → `{"status":"ok",...}`
- Preview loads at `/` and redirects to `/dashboard`.

---

# Fusion Starter

A production-ready full-stack React application template with integrated Express server, featuring React Router 6 SPA mode, TypeScript, Vitest, Zod and modern tooling.

While the starter comes with a express server, only create endpoint when strictly neccesary, for example to encapsulate logic that must leave in the server, such as private keys handling, or certain DB operations, db...

## Tech Stack

- **PNPM**: Prefer pnpm
- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Index.tsx = home)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

server/                   # Express API backend
├── index.ts              # Main server setup (express config + routes)
└── routes/               # API handlers

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- `client/pages/Index.tsx` represents the home page.
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css`
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Express Server Integration

- **Development**: Single port (8080) for both frontend/backend
- **Hot reload**: Both client and server code
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes

- `GET /api/ping` - Simple ping api
- `GET /api/demo` - Demo endpoint

### Shared Types

Import consistent types in both client and server:

```typescript
import { DemoResponse } from "@shared/api";
```

Path aliases:

- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
pnpm dev        # Start dev server (client + server)
pnpm build      # Production build
pnpm start      # Start production server
pnpm typecheck  # TypeScript validation
pnpm test          # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route

1. **Optional**: Create a shared interface in `shared/api.ts`:

```typescript
export interface MyRouteResponse {
  message: string;
  // Add other response properties here
}
```

2. Create a new route handler in `server/routes/my-route.ts`:

```typescript
import { RequestHandler } from "express";
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

export const handleMyRoute: RequestHandler = (req, res) => {
  const response: MyRouteResponse = {
    message: "Hello from my endpoint!",
  };
  res.json(response);
};
```

3. Register the route in `server/index.ts`:

```typescript
import { handleMyRoute } from "./routes/my-route";

// Add to the createServer function:
app.get("/api/my-endpoint", handleMyRoute);
```

4. Use in React components with type safety:

```typescript
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

const response = await fetch("/api/my-endpoint");
const data: MyRouteResponse = await response.json();
```

### New Page Route

1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:

```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- **Standard**: `pnpm build`
- **Binary**: Self-contained executables (Linux, macOS, Windows)
- **Cloud Deployment**: Use either Netlify or Vercel via their MCP integrations for easy deployment. Both providers work well with this starter template.

## Architecture Notes

- Single-port development with Vite + Express integration
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Production-ready with multiple deployment options
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces
