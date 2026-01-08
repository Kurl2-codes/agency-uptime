$currentDir = Get-Location
$pythonPath = Join-Path $currentDir "venv\Scripts\python.exe"
$agentPath = Join-Path $currentDir "src\agent.py"

Write-Host "Starting SRE Agent..." -ForegroundColor Cyan
Write-Host "Using Python: $pythonPath" -ForegroundColor Gray

& $pythonPath $agentPath
