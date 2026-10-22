@echo off
REM One-click Python setup for desktop capture and control (pyautogui, mss, Pillow).
setlocal
cd /d "%~dp0"

set "PYTHON="
where python >nul 2>nul && python --version >nul 2>nul && set "PYTHON=python"
if not defined PYTHON (
  where py >nul 2>nul && py -3 --version >nul 2>nul && set "PYTHON=py -3"
)
if not defined PYTHON (
  echo [setup-python] Python 3 was not found on PATH.
  echo [setup-python] Install it from https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^), then re-run this script.
  exit /b 1
)

echo [setup-python] Using: %PYTHON%
%PYTHON% --version
%PYTHON% -m pip install --upgrade pip
%PYTHON% -m pip install -r python-service\requirements.txt
if errorlevel 1 (
  echo [setup-python] pip install failed. See the errors above.
  exit /b 1
)

%PYTHON% -c "import pyautogui, mss, PIL; print('[setup-python] pyautogui, mss and Pillow are installed.')"
if errorlevel 1 exit /b 1
echo [setup-python] Done. Restart the app (npm run dev) so it picks up the interpreter.
endlocal
