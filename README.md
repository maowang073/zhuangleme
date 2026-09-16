# 装了吗

「今天你装了吗？」——面向编程初学者的软件安装助手。

项目包含：

- `backend/`：FastAPI + SQLite API，统一调用 OpenAI 兼容的 AI 服务。
- `desktop/`：Electron + React 用户端，同时包含 Web 管理后台。
- `PROGRESS.md`：开发和验证记录。

## 本地开发

要求：Python 3.11+、Node.js 20+。

### 1. 启动服务端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

macOS / Linux 将虚拟环境中的 Python 路径改为 `.venv/bin/python`。

服务端读取 `backend/.env`。API 文档位于
`http://127.0.0.1:8000/docs`。

### 2. 启动桌面端

另开一个终端：

```powershell
cd desktop
npm install
npm run dev
```

Electron 会自动尝试启动服务端，因此服务端已运行时若出现端口占用，只需关闭手动启动的服务端后重开 APP。只预览 Web UI 时运行 `npm run dev:web`。

管理后台从右上角进入，密码为 `backend/.env` 中的 `ADMIN_PASSWORD`（可先复制 `backend/.env.example` 再填写）。

## 测试

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q

cd ..\desktop
npm run build
```

## 打包

Windows：

```powershell
cd backend
.\build.ps1
cd ..\desktop
npm run dist
```

macOS：

```bash
cd backend
chmod +x build.sh && ./build.sh
cd ../desktop
npm run dist
```

Electron Builder 只能可靠地在对应系统上制作对应安装包：Windows 构建
NSIS，macOS 构建 DMG。正式分发时，推荐将 FastAPI 单独部署并通过
`VITE_API_URL` 指向 HTTPS API，避免把 AI Key 放入桌面安装包。

## 安全说明

- 一键安装只在当前电脑平台与方案平台一致时启用执行。
- Electron 使用上下文隔离和 preload 白名单，不向页面暴露 Node.js。
- 脚本写入随机临时文件，通过参数数组调用 PowerShell / Bash，执行后删除。
- 系统需要权限时会显示原生授权提示；不要批准来源不明的命令。
- 生产环境必须更换管理员密码，并限制 CORS 来源。

