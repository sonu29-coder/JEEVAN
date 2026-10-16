@echo off
title HEMO-GRID AI - All-in-One Runner
cd /d "%~dp0"
if exist "backend\venv\Scripts\python.exe" (
    backend\venv\Scripts\python.exe run_all.py
) else (
    python run_all.py
)
pause
