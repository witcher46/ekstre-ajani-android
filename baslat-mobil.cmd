@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "MOBILE_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%MOBILE_PY%" set "MOBILE_PY=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
if not exist "%MOBILE_PY%" set "MOBILE_PY=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
if exist "%MOBILE_PY%" (
  "%MOBILE_PY%" -B "%~dp0mobile_wallet.py" %*
) else (
  py -3.14 -B "%~dp0mobile_wallet.py" %*
)
exit /b %errorlevel%
