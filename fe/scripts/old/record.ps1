<#
.SYNOPSIS
    Record 3D text animations for YouTube or YouTube Shorts.

.DESCRIPTION
    Captures the running Expo web app using ffmpeg (gdigrab).
    - yt:     records fullscreen 1920x1080, outputs for YT landscape
    - shorts: records a 9:16 region, scales to 1080x1920 for YT Shorts
    - yt-4k:  records fullscreen, upscales to 3840x2160 (good for future-proofing)

    Requirements:
      - ffmpeg in PATH  (winget install Gyan.FFmpeg)
      - Expo web app running at $AppUrl (or use -StartServer)

.EXAMPLE
    # Record 30s YouTube video
    .\scripts\record.ps1 -Format yt -Duration 30

    # Record 60s Shorts with 3s countdown
    .\scripts\record.ps1 -Format shorts -Duration 60 -Countdown 3

    # Start dev server automatically, record 20s
    .\scripts\record.ps1 -Format yt -Duration 20 -StartServer

    # Custom output name
    .\scripts\record.ps1 -Format yt -Duration 45 -Output "neon-glow-effect"
#>
param(
    [ValidateSet('yt', 'shorts', 'yt-4k')]
    [string]$Format = 'yt',

    [int]$Duration = 30,

    [string]$Output = '',

    [ValidateSet(30, 60)]
    [int]$Fps = 60,

    [string]$AppUrl = 'http://localhost:8081',

    # Tab path to open (e.g. 'three-d', 'presets')
    [string]$Tab = 'preset/mcon/full-window',

    [switch]$StartServer,

    [int]$Countdown = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── helpers ──────────────────────────────────────────────────────────────────

function Check-FFmpeg {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Write-Error @"
ffmpeg not found in PATH.
Install it with:  winget install Gyan.FFmpeg
Then restart this terminal and try again.
"@
        exit 1
    }
}

function Find-Chrome {
    $paths = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    return $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

# Move and resize a window by partial title match (best-effort, non-fatal)
function Position-Window([string]$TitleFragment, [int]$X, [int]$Y, [int]$W, [int]$H) {
    $src = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinPos {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern int  GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
    const uint SWP_NOZORDER = 0x0004;
    public static bool Move(string fragment, int x, int y, int w, int h) {
        bool found = false;
        EnumWindows((hWnd, _) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            if (sb.ToString().IndexOf(fragment, StringComparison.OrdinalIgnoreCase) >= 0) {
                SetWindowPos(hWnd, IntPtr.Zero, x, y, w, h, SWP_NOZORDER);
                found = true;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@
    try {
        Add-Type -TypeDefinition $src -Language CSharp -ErrorAction Stop
        [WinPos]::Move($TitleFragment, $X, $Y, $W, $H) | Out-Null
    } catch {
        Write-Warning "Could not reposition window: $_"
    }
}

# ── format config ─────────────────────────────────────────────────────────────

$config = switch ($Format) {
    'yt' {
        @{
            Label         = 'YouTube 1920x1080'
            ChromeW       = 1920
            ChromeH       = 1088   # +titlebar so content ≈ 1080
            CaptureW      = 1920
            CaptureH      = 1080
            CaptureX      = 0
            CaptureY      = 0
            VFilter       = "scale=1920:1080"
            Bitrate       = if ($Fps -eq 60) { '12M' } else { '8M' }
        }
    }
    'shorts' {
        # Capture 9:16 portrait window (608×1080) positioned at top-left, scale to 1080×1920
        @{
            Label         = 'YouTube Shorts 1080x1920'
            ChromeW       = 608
            ChromeH       = 1088
            CaptureW      = 608
            CaptureH      = 1080
            CaptureX      = 0      # Chrome will be positioned at left
            CaptureY      = 0
            VFilter       = "scale=1080:1920:flags=lanczos"
            Bitrate       = if ($Fps -eq 60) { '12M' } else { '8M' }
        }
    }
    'yt-4k' {
        @{
            Label         = 'YouTube 4K 3840x2160 (upscaled)'
            ChromeW       = 1920
            ChromeH       = 1088
            CaptureW      = 1920
            CaptureH      = 1080
            CaptureX      = 0
            CaptureY      = 0
            VFilter       = "scale=3840:2160:flags=lanczos"
            Bitrate       = if ($Fps -eq 60) { '48M' } else { '35M' }
        }
    }
}

# ── output filename ────────────────────────────────────────────────────────────

if (-not $Output) {
    $ts = Get-Date -Format 'yyyy-MM-dd_HH.mm.ss'
    $Output = "recordings\${ts}_animation.${Format}.mp4"
}
if (-not [System.IO.Path]::HasExtension($Output)) {
    $Output = "$Output.mp4"
}

$outDir = Split-Path $Output -Parent
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Force $outDir | Out-Null
}

# ── pre-flight ────────────────────────────────────────────────────────────────

Check-FFmpeg

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Animation Recorder" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Format  : $($config.Label)" -ForegroundColor Yellow
Write-Host "  FPS     : $Fps" -ForegroundColor Yellow
Write-Host "  Duration: ${Duration}s" -ForegroundColor Yellow
Write-Host "  Output  : $Output" -ForegroundColor Yellow
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── optional: start expo web ──────────────────────────────────────────────────

$serverJob = $null
if ($StartServer) {
    Write-Host "Starting expo web server..." -ForegroundColor Green
    $serverJob = Start-Job -ScriptBlock {
        Set-Location $using:PSScriptRoot\..
        npx expo start --web --port 8081 2>&1
    }
    Write-Host "Waiting 8s for server to be ready..." -ForegroundColor DarkGray
    Start-Sleep 8
}

# ── open Chrome at right size ──────────────────────────────────────────────────

$browser = Find-Chrome
$fullUrl = "$AppUrl/$Tab"

if ($browser) {
    $browserName = [System.IO.Path]::GetFileNameWithoutExtension($browser)
    Write-Host "Opening $browserName at $($config.ChromeW)x$($config.ChromeH) → $fullUrl" -ForegroundColor Green

    $browserArgs = "--app=$fullUrl --window-size=$($config.ChromeW),$($config.ChromeH) --disable-infobars --no-first-run"
    Start-Process $browser -ArgumentList $browserArgs

    Write-Host "Waiting 3s for browser to open..." -ForegroundColor DarkGray
    Start-Sleep 3

    # Position window at top-left so capture region aligns
    Position-Window "localhost:8081" 0 0 $config.ChromeW $config.ChromeH
    Start-Sleep 1
} else {
    Write-Warning "Chrome/Edge not found. Please open $fullUrl manually at $($config.ChromeW)x$($config.ChromeH) and position it at top-left."
    Write-Host "Press Enter when ready..."
    Read-Host | Out-Null
}

# ── countdown ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Set up your animation now. Recording starts in:" -ForegroundColor Cyan
for ($i = $Countdown; $i -gt 0; $i--) {
    Write-Host "  $i..." -ForegroundColor Yellow
    Start-Sleep 1
}
Write-Host ""
Write-Host "● REC  (${Duration}s)" -ForegroundColor Red
Write-Host ""

# ── ffmpeg capture ─────────────────────────────────────────────────────────────

$bufSizeMb = [int](($config.Bitrate -replace 'M','') ) * 2

$ffmpegArgs = @(
    '-y',
    '-f', 'gdigrab',
    '-framerate', "$Fps",
    '-offset_x', "$($config.CaptureX)",
    '-offset_y', "$($config.CaptureY)",
    '-video_size', "$($config.CaptureW)x$($config.CaptureH)",
    '-draw_mouse', '0',
    '-i', 'desktop',
    '-t', "$Duration",
    '-vf', $config.VFilter,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-profile:v', 'high',
    '-level', '4.2',
    '-crf', '18',
    '-maxrate', $config.Bitrate,
    '-bufsize', "${bufSizeMb}M",
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',          # no audio track
    $Output
)

Write-Host "ffmpeg $($ffmpegArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ""

& ffmpeg @ffmpegArgs

# ── done ─────────────────────────────────────────────────────────────────────

if ($LASTEXITCODE -eq 0 -and (Test-Path $Output)) {
    $sizeMb = [math]::Round((Get-Item $Output).Length / 1MB, 1)
    Write-Host ""
    Write-Host "✓ Saved: $Output ($sizeMb MB)" -ForegroundColor Green

    # Show resolution of the output file
    $probe = ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$Output" 2>&1
    if ($probe) {
        Write-Host "  Resolution: $probe" -ForegroundColor Cyan
    }
} else {
    Write-Host ""
    Write-Warning "Recording may have failed (exit code $LASTEXITCODE). Check output above."
}

# ── cleanup ───────────────────────────────────────────────────────────────────

if ($serverJob) {
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
    Write-Host "Expo server stopped." -ForegroundColor DarkGray
}
