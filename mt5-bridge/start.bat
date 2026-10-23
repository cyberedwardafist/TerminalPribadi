@echo off
cd /d "%~dp0"
if not exist .venv ( python -m venv .venv && .venv\Scripts\pip install -r requirements.txt )
.venv\Scripts\python mt5_bridge.py
pause
