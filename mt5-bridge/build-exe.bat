@echo off
rem Membuat HeadmapsMT5Bridge.exe (satu file) lalu menaruhnya di public\downloads. Jalankan di Windows, di komputer yang punya Python.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 goto nopython
echo [1/4] Menyiapkan lingkungan build...
python -m venv .venv-build
".venv-build\Scripts\python.exe" -m pip install --quiet -r requirements.txt pyinstaller
if errorlevel 1 goto gagal
echo [2/4] Membangun .exe (beberapa menit)...
".venv-build\Scripts\pyinstaller.exe" --onefile --noconfirm --name HeadmapsMT5Bridge --distpath dist --workpath build-tmp --hidden-import MetaTrader5 --hidden-import websockets mt5_bridge.py
if not exist "dist\HeadmapsMT5Bridge.exe" goto gagal
echo [3/4] Menyalin ke ..\public\downloads
if not exist "..\public\downloads" mkdir "..\public\downloads"
copy /y "dist\HeadmapsMT5Bridge.exe" "..\public\downloads\HeadmapsMT5Bridge.exe" >nul
echo [4/4] Mencatat versi dan SHA-256 ke public\mt5-version.json
pushd ..
node scripts\release-bridge.js
popd
echo.
echo SELESAI. Coba dulu: buka MT5, jalankan dist\HeadmapsMT5Bridge.exe, pastikan app menampilkan "MT5 terhubung". Lalu commit dan deploy.
pause
exit /b 0
:nopython
echo Python belum terpasang. Pasang dari https://www.python.org/downloads/ dan centang "Add python.exe to PATH".
pause
exit /b 1
:gagal
echo Build gagal. Lihat pesan di atas.
pause
exit /b 1
