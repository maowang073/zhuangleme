@echo off
chcp 65001 >nul
title 装了吗 · 一键启动
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_app-service.ps1" -Action Watch
echo.
pause
