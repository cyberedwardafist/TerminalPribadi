@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 goto nopython
if not exist ".venv\Scripts\python.exe" (
  echo Menyiapkan bridge untuk pertama kali, tunggu sebentar...
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
".venv\Scripts\python.exe" mt5_bridge.py
pause
exit /b
:nopython
echo Python belum terpasang. Pasang dari https://www.python.org/downloads/ dan centang "Add python.exe to PATH", lalu jalankan file ini lagi.
pause
