$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootPath
$venvPy = Join-Path $rootPath "backend\venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    & $venvPy run_all.py
} else {
    python run_all.py
}
