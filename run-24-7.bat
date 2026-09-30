@echo off
title CodeX Bot Network - 24/7 Voice & Moderation Runner
cd /d "%~dp0"
echo ===================================================
echo   CodeX Multi-Bot 24/7 Voice & Server Keep-Alive
echo ===================================================
echo [INFO] Starting all 5 bots into General Lounge...

:LOOP
node index.js
echo [WARNING] Bot process stopped or restarted at %TIME%. Reconnecting in 3 seconds...
timeout /t 3 /nobreak >nul
goto LOOP
