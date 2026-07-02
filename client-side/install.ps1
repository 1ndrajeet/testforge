# install.ps1 - PowerShell Installer for Windows
# Right-click and select "Run with PowerShell"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "          TESTFORGE INSTALLER" -ForegroundColor Cyan
Write-Host "          Lifetime Offline Edition" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host "[ERROR] Docker is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker Desktop from:"
    Write-Host "  https://www.docker.com/products/docker-desktop/"
    Write-Host ""
    Write-Host "After installation, run this script again."
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker Desktop and try again."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Docker is installed and running" -ForegroundColor Green
Write-Host ""

# Check which compose command to use
$composeCmd = "docker compose"
try {
    docker compose version | Out-Null
} catch {
    try {
        docker-compose --version | Out-Null
        $composeCmd = "docker-compose"
    } catch {
        Write-Host "[ERROR] Docker Compose is not installed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "[OK] Using: $composeCmd" -ForegroundColor Green
Write-Host ""

# Create data directories
Write-Host "Creating data directories..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "data\postgres" | Out-Null
New-Item -ItemType Directory -Force -Path "data\uploads" | Out-Null
Write-Host ""

# Pull images (if internet available)
Write-Host "Pulling images..." -ForegroundColor Cyan
if (Test-Connection -ComputerName hub.docker.com -Count 1 -Quiet) {
    & $composeCmd pull
    Write-Host ""
} else {
    Write-Host "[WARNING] No internet connection - using cached images if available" -ForegroundColor Yellow
    Write-Host ""
}

# Start containers
Write-Host "Starting TestForge..." -ForegroundColor Cyan
& $composeCmd up -d

Write-Host ""
Write-Host "Waiting for services to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Check if services are running
$psOutput = & $composeCmd ps --format json | Out-String
if ($psOutput -match "running") {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "               INSTALLATION COMPLETE" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  TestForge is now running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Frontend:  http://localhost:4937" -ForegroundColor Cyan
    Write-Host "  Backend:   http://localhost:4936" -ForegroundColor Cyan
    Write-Host "  Database:  localhost:4935" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Logs:      $composeCmd logs -f" -ForegroundColor Yellow
    Write-Host "  Stop:      $composeCmd down" -ForegroundColor Yellow
    Write-Host "  Restart:   $composeCmd restart" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[ERROR] Failed to start containers. Check logs:" -ForegroundColor Red
    Write-Host "  $composeCmd logs"
    Read-Host "Press Enter to exit"
    exit 1
}

Read-Host "Press Enter to exit"