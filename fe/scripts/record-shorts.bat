@echo off
:: Quick launcher: Record YouTube Shorts (1080x1920 portrait @ 60fps)
:: Usage: record-shorts.bat [duration_seconds] [output_name]
::   record-shorts.bat 15
::   record-shorts.bat 30 my-short

set DURATION=%1
if "%DURATION%"=="" set DURATION=15

set OUTPUT=%2

if "%OUTPUT%"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0record.ps1" -Format shorts -Duration %DURATION%
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0record.ps1" -Format shorts -Duration %DURATION% -Output "%OUTPUT%"
)
