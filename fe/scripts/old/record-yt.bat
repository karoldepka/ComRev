@echo off
:: Quick launcher: Record YouTube Shorts (1080x1920 @ 60fps)
:: Usage: record-yt.bat [duration_seconds] [output_name]
::   record-yt.bat 30
::   record-yt.bat 45 my-animation

set DURATION=%1
if "%DURATION%"=="" set DURATION=30

set OUTPUT=%2

if "%OUTPUT%"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0record.ps1" -Format shorts -Duration %DURATION%
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0record.ps1" -Format shorts -Duration %DURATION% -Output "%OUTPUT%"
)
