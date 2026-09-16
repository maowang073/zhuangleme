#!/usr/bin/env bash
set -euo pipefail

PYTHON=".venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then PYTHON="python3"; fi

"$PYTHON" -m pip install -r requirements-build.txt
"$PYTHON" -m PyInstaller --noconfirm --clean --onefile --name zhuangleme-server \
  --collect-all uvicorn --collect-all fastapi --collect-all pydantic_settings main.py
cp .env dist/.env
echo "服务端已输出到 backend/dist。注意：发布前应改用部署环境注入密钥。"

