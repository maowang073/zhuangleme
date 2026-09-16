# 「装了吗」开发进度

## 当前阶段

全部模块完成，已通过构建、真实 AI 流程、浏览器端到端和安装包烟雾测试。

## 已完成

- [x] 明确三端架构与开发验证顺序
- [x] 读取 AI 与管理员配置（敏感值仅写入本地 `.env`）
- [x] 确认本机 Node.js、npm、Python 可用
- [x] FastAPI + SQLite 服务端、版本多级获取、AI 方案缓存
- [x] 17 个常见软件预置、官方下载安装页策略
- [x] React + Radix/Shadcn 风格用户端与管理后台
- [x] Markdown 高亮、代码复制、有效性反馈、统计管理
- [x] Electron 安全 preload、本地 PowerShell/Bash 执行与实时日志
- [x] Windows UAC 提权与 macOS/Linux 权限生成规则
- [x] PyInstaller 服务端打包与 Electron Builder NSIS 安装包

## 验证结果

- [x] 后端自动测试：`1 passed`
- [x] 前端 TypeScript 与 Vite 生产构建通过
- [x] 生产依赖审计：`0 vulnerabilities`
- [x] 真实 DeepSeek 兼容接口生成 Node.js Windows 方案成功
- [x] 端到端：自然语言搜索 → 最新稳定版 → 生成并渲染方案 → 提交反馈
- [x] 管理方案、反馈、统计 API 鉴权流程通过
- [x] Electron 开发模式成功启动内置 API 并加载软件列表
- [x] Windows `win-unpacked` 启动后内置 API 健康检查通过
- [x] NSIS 安装程序成功生成

## 进行中

无。

## 问题及解决方案

- 当前目录不是 Git 仓库；不影响本地开发与验证。
- Python 为 3.14，优先选用已支持该版本的现代依赖。
- Electron 首次下载被网络重置打断；使用国内镜像强制刷新缓存后解决。
- 版本源返回顺序不保证新到旧；增加稳定版过滤和语义版本降序排序。
- 首次冻结版误启用 Uvicorn 热重载；冻结环境改为单进程并从可执行文件目录读取配置。
- Electron Builder 从 GitHub 下载 7-Zip 超时；切换构建二进制镜像后完成 NSIS 打包。
- 为避免修改开发机软件，端到端测试验证到方案展示与反馈；实际生成的安装脚本未在本机执行。

