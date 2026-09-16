$ErrorActionPreference = "Stop"

$Python = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
& $Python -m pip install -r requirements-build.txt
& $Python -m PyInstaller --noconfirm --clean --onefile --name zhuangleme-server `
  --collect-all uvicorn --collect-all fastapi --collect-all pydantic_settings main.py

Copy-Item ".env" "dist\.env" -Force
Write-Host "Backend executable created in backend\dist. Inject secrets at deploy time for production."

