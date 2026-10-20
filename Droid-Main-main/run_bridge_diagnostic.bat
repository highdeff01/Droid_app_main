@echo off
title Sightline Mobile Interactive Bridge Diagnostic
cd /d "%~dp0"
echo Starting Sightline Mobile Bridge Diagnostic & ADB Port Forwarder...
call npm run bridge
pause
