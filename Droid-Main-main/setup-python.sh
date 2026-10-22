#!/usr/bin/env bash
# One-click Python setup for desktop capture and control (pyautogui, mss, Pillow).
set -euo pipefail
cd "$(dirname "$0")"

PYTHON=""
for candidate in "${PYTHON_CMD:-}" python3 python; do
  if [ -n "$candidate" ] && command -v "$candidate" >/dev/null 2>&1 && "$candidate" --version >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "[setup-python] Python 3 was not found on PATH."
  echo "[setup-python] Install it (macOS: brew install python; Debian/Ubuntu: sudo apt install python3 python3-pip python3-tk python3-dev), then re-run."
  exit 1
fi

echo "[setup-python] Using: $PYTHON ($("$PYTHON" --version 2>&1))"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r python-service/requirements.txt
"$PYTHON" -c "import pyautogui, mss, PIL; print('[setup-python] pyautogui, mss and Pillow are installed.')"
echo "[setup-python] Done. Restart the app (npm run dev) so it picks up the interpreter."
