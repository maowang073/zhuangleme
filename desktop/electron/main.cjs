const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let window;
let backendProcess;
const jobs = new Map();

function apiPlatform() {
  return process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
}

function isBackendUp() {
  return new Promise((resolve) => {
    const request = require("node:http").get("http://127.0.0.1:8000/api/health", (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function startBackend() {
  const devRoot = path.resolve(__dirname, "../../backend");
  const packagedRoot = path.join(process.resourcesPath, "backend");
  let command;
  let args;
  let cwd;

  if (app.isPackaged) {
    cwd = packagedRoot;
    command = path.join(packagedRoot, process.platform === "win32" ? "zhuangleme-server.exe" : "zhuangleme-server");
    args = [];
  } else {
    cwd = devRoot;
    const venvPython = path.join(
      devRoot,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
    );
    command = fs.existsSync(venvPython) ? venvPython : process.platform === "win32" ? "python" : "python3";
    args = ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"];
  }

  if (!fs.existsSync(command) && app.isPackaged) {
    console.error("找不到打包后的服务端：", command);
    return;
  }
  backendProcess = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  backendProcess.stdout.on("data", (chunk) => console.log(`[api] ${chunk}`));
  backendProcess.stderr.on("data", (chunk) => console.error(`[api] ${chunk}`));
  backendProcess.on("error", (error) => console.error("服务端启动失败：", error));
}

function createWindow() {
  window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#eef3ff",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const target = app.isPackaged
    ? path.join(__dirname, "../dist/index.html")
    : "http://localhost:5173";
  app.isPackaged ? window.loadFile(target) : window.loadURL(target);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  // Prefer an already-running local API so launchers can own the backend lifecycle.
  if (!(await isBackendUp())) startBackend();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  for (const job of jobs.values()) job.child.kill();
  if (backendProcess) backendProcess.kill();
});

ipcMain.handle("system:platform", () => apiPlatform());

ipcMain.handle("install:start", (event, payload) => {
  const { script, platform } = payload || {};
  if (typeof script !== "string" || script.length < 5 || script.length > 200_000) {
    throw new Error("安装脚本内容无效");
  }
  if (platform !== apiPlatform()) {
    throw new Error(`当前电脑是 ${apiPlatform()}，不能执行 ${platform} 脚本`);
  }

  const id = randomUUID();
  const extension = platform === "windows" ? ".ps1" : ".sh";
  const scriptPath = path.join(os.tmpdir(), `zhuangleme-${id}${extension}`);
  fs.writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o700 });

  let command = "/bin/bash";
  let args = [scriptPath];
  const cleanupPaths = [scriptPath];
  let logPath;
  if (platform === "windows") {
    // 通过系统 UAC 提权；提升后的进程把输出持续写入临时日志，主进程负责实时转发。
    logPath = path.join(os.tmpdir(), `zhuangleme-${id}.log`);
    const elevatedPath = path.join(os.tmpdir(), `zhuangleme-${id}-elevated.ps1`);
    const launcherPath = path.join(os.tmpdir(), `zhuangleme-${id}-launcher.ps1`);
    const quote = (value) => value.replaceAll("'", "''");
    fs.writeFileSync(elevatedPath, [
      "$ErrorActionPreference = 'Continue'",
      `$LogPath = '${quote(logPath)}'`,
      `& '${quote(scriptPath)}' *>&1 | ForEach-Object { $_ | Out-File -FilePath $LogPath -Append -Encoding utf8 }`,
      "exit $LASTEXITCODE",
    ].join("\r\n"), "utf8");
    fs.writeFileSync(launcherPath, [
      `$ArgsForAdmin = @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','\"${quote(elevatedPath)}\"')`,
      "$Process = Start-Process -FilePath 'powershell.exe' -ArgumentList $ArgsForAdmin -Verb RunAs -Wait -PassThru",
      "exit $Process.ExitCode",
    ].join("\r\n"), "utf8");
    command = "powershell.exe";
    args = ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcherPath];
    cleanupPaths.push(logPath, elevatedPath, launcherPath);
  }
  const child = spawn(command, args, {
    cwd: os.homedir(),
    env: { ...process.env, FORCE_COLOR: "0" },
    windowsHide: false,
  });

  const send = (type, data) => {
    if (!event.sender.isDestroyed()) event.sender.send("install:event", { id, type, data: String(data) });
  };
  let logOffset = 0;
  const flushLog = () => {
    if (!logPath || !fs.existsSync(logPath)) return;
    const content = fs.readFileSync(logPath, "utf8");
    if (content.length > logOffset) {
      send("stdout", content.slice(logOffset).replace(/^\uFEFF/, ""));
      logOffset = content.length;
    }
  };
  const timer = logPath ? setInterval(flushLog, 250) : null;
  jobs.set(id, { child, timer, cleanupPaths, platform });
  child.stdout.on("data", (data) => send("stdout", data));
  child.stderr.on("data", (data) => send("stderr", data));
  child.on("error", (error) => send("error", error.message));
  child.on("close", (code) => {
    flushLog();
    if (timer) clearInterval(timer);
    send("exit", code ?? -1);
    jobs.delete(id);
    for (const file of cleanupPaths) fs.rm(file, { force: true }, () => {});
  });
  return { id };
});

ipcMain.handle("install:stop", (_event, id) => {
  const job = jobs.get(id);
  if (!job) return false;
  // 普通进程无权可靠终止已通过 UAC 提升的子进程，避免制造“已停止”的假象。
  if (job.platform === "windows") return false;
  job.child.kill();
  return true;
});

