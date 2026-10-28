@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 初音未来 · 衣橱工作室 - 本地服务（关掉本窗口即停止）
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:8899/"
node serve.mjs
pause
