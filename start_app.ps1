$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootPath
python run_all.py
