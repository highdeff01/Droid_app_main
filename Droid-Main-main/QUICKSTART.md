# Quick Start Guide

Get GameAI Automation running in 5 minutes.

## 1. Install Dependencies (2 min)

```bash
# Install Node packages (npm only; package-lock.json is committed)
npm install

# Install Python packages
cd python-service
pip install -r requirements.txt
cd ..
```

The committed `.npmrc` sets `legacy-peer-deps=true`, so a plain `npm install` works.
If you override `.npmrc`, run `npm install --legacy-peer-deps` instead.

## 2. Start Development Server (1 min)

```bash
npm run dev
```

This starts a single-origin Vite + Express server:

- React frontend: http://localhost:3000
- Express API: http://localhost:3000/api (mounted as Vite middleware)
- Hot reload enabled

Port 3000 is pinned (`strictPort: true` in `vite.config.ts`); if it is taken the
server exits instead of moving to another port. The server binds to `127.0.0.1`
by default because the API is a privileged control plane (see SECURITY.md). Set
`DEV_HOST` or `HOST` (for example `HOST=0.0.0.0`) only on a trusted network.

Check it is up: `curl http://localhost:3000/api/health`.

## 3. Open Dashboard (1 min)

1. Go to http://localhost:3000 in your browser
2. Click "Open Dashboard" button
3. You're in the automation dashboard!

## 4. Start Automating (1 min)

### Basic Workflow

```
1. Click "Start Capture" button
   ↓
2. See live screen in main panel
   ↓
3. AI analysis appears on right
   ↓
4. Create a task: "click at 500,300"
   ↓
5. Click "Execute" to run automation
```

## Common Tasks

### Click Something

```
Name: Click button
Description: click at 500,300
```

### Type Text

```
Name: Type username
Description: type "myusername"
```

### Scroll Page

```
Name: Scroll down
Description: scroll down 5 clicks
```

### Wait Before Action

```
Name: Wait for page
Description: wait 2 seconds
```

## Configuring Ollama Endpoint

The default AI backend is Ollama running `qwen3.5:2b` for text, vision and OCR.

```bash
ollama pull qwen3.5:2b
```

Server environment variables (set in `.env` or your shell):

```
OLLAMA_ENDPOINT=http://192.168.1.100:11434/api/chat   # default LAN endpoint
OLLAMA_MODEL=qwen3.5:2b                               # default model
GEMINI_API_KEY=...                                    # optional override
```

If the primary endpoint cannot be reached, the server falls back to the
QuantumClaw remote endpoint. The endpoint can also be changed in
Dashboard → Settings → LLM without a restart.

`GEMINI_API_KEY` is optional. When it is set, vision calls use Gemini instead of
Qwen. When no model is reachable, AI responses are heuristic placeholders marked
`simulated: true` so the UI can label them. They are never real analysis.

Only `VITE_*` variables reach the browser (`import.meta.env`). The API is
same-origin, so the client needs no API URL variable.

## Troubleshooting

### "No screenshots appearing"

- Check that browser has screen capture permissions
- On macOS: System Preferences → Security & Privacy
- Click "Continue" if permission prompt appears

### "Ollama connection error"

- Verify endpoint URL in Settings
- Check internet connection
- Try fallback endpoint if available

### "Python service not found"

- Ensure Python 3.8+ is installed
- Run: `python3 --version`
- Reinstall packages: `pip install -r python-service/requirements.txt`
- Without python3/pyautogui, device actions reply with
  `{ success: false, status: "unavailable", simulated: true, executed: false }`.
  The UI shows that the action did **not** execute.

## Next Steps

After basic testing:

1. **Create Complex Tasks** - Combine multiple actions
2. **Test with Your Game** - Run against actual game
3. **Monitor Performance** - Check AI accuracy and speed
4. **Adjust Settings** - Fine-tune capture rate and endpoints
5. **Deploy** - See DEPLOYMENT.md for production setup

## Building for Production

```bash
# Build client + server
npm run build

# Run the production build
npm start

# Create desktop app (see ELECTRON.md)
npm install -D electron electron-builder

# Deploy to Netlify/Vercel
# (Connect Git repository at app.netlify.com or vercel.com)
```

## File Structure Quick Reference

```
client/
  pages/
    Index.tsx       ← Homepage
    Dashboard.tsx   ← Main interface
  components/ui/    ← Reusable UI components

server/
  routes/
    *.ts           ← API endpoints
  index.ts         ← Main server

python-service/
  automation.py    ← Core automation logic
  capture.py       ← Screen capture service
  execute-task.py  ← Task execution
```

## Key Features Checklist

- ✅ Real-time screen capture
- ✅ AI vision analysis (Ollama integration)
- ✅ Task creation and execution
- ✅ Mouse/keyboard automation
- ✅ Web dashboard
- ✅ Settings & configuration
- ✅ Multi-platform support
- ✅ Production deployment ready

## API Quick Reference

Send automation commands via API:

```bash
# Capture screen
curl http://localhost:3000/api/capture-screen

# Analyze screenshot
curl -X POST http://localhost:3000/api/analyze-screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "imageData": "data:image/png;base64,...",
    "endpoint": "http://192.168.1.100:11434/api/chat"
  }'

# Execute task
curl -X POST http://localhost:3000/api/execute-task \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "id": "1",
      "name": "Click button",
      "description": "click at 500,300",
      "status": "pending",
      "priority": 1,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  }'
```

## Video Tutorial (Coming Soon)

Watch the tutorial at: https://example.com/tutorial

## Community & Support

- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in forum
- **Docs**: Full docs in SETUP.md and DEPLOYMENT.md
- **Examples**: See examples/ folder

## Quick Tips

1. **Batch Tasks** - Create multiple tasks to run in sequence
2. **Use Pauses** - Add wait tasks between actions for stability
3. **Test First** - Test tasks on simple apps before games
4. **Monitor Logs** - Browser console shows detailed info
5. **Save Settings** - Endpoint settings persist across sessions

---

**Ready to automate?** You're all set! Start with the dashboard and build from there.

For detailed documentation, see:

- SETUP.md - Full setup guide
- DEPLOYMENT.md - Production deployment
- ELECTRON.md - Desktop app guide
