@echo off
chcp 65001 >nul
title 装了吗 · 后端服务器
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_backend-service.ps1" -Action Watch
echo.
pause
