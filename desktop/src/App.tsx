import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import {
  ArrowLeft, Check, CheckCircle2, Clipboard, Download, ExternalLink, LoaderCircle,
  PackageOpen, Play, RefreshCw, Search, Settings, ShieldAlert, Sparkles, Square,
  TerminalSquare, ThumbsDown, ThumbsUp, Trash2, Wrench, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("powershell", powershell);
SyntaxHighlighter.registerLanguage("ps1", powershell);

type Platform = "windows" | "macos" | "linux";
type Software = {
  id: number;
  slug: string;
  name: string;
  category: string;
  source_ref: string | null;
  official_url: string | null;
  install_kind: "script" | "download";
};
type Plan = {
  id: number;
  software: Software;
  version: string;
  platform: Platform;
  markdown: string;
  generation_source: string;
  created_at: string;
  updated_at: string;
};
type Feedback = {
  id: number;
  plan_id: number;
  effective: boolean;
  content: string;
  handled: boolean;
  created_at: string;
};
type Stat = { software: string; version: string; platform: Platform; count: number };
type InstallEvent = { id: string; type: "stdout" | "stderr" | "error" | "exit"; data: string };

declare global {
  interface Window {
    zhuangleme?: {
      getPlatform(): Promise<Platform>;
      startInstall(payload: { script: string; platform: Platform }): Promise<{ id: string }>;
      stopInstall(id: string): Promise<boolean>;
      onInstallEvent(callback: (event: InstallEvent) => void): () => void;
    };
  }
}

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit, password?: string): Promise<T> {
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      response = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "X-Admin-Password": password } : {}),
          ...init?.headers,
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  if (!response) throw new Error(`连接不到本地服务，请确认服务端已启动。${lastError instanceof Error ? `（${lastError.message}）` : ""}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败（${response.status}）`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const buttonStyles = cva("button", {
  variants: {
    variant: {
      primary: "button--primary",
      secondary: "button--secondary",
      danger: "button--danger",
      ghost: "button--ghost",
    },
    size: { normal: "", small: "button--small", icon: "button--icon" },
  },
  defaultVariants: { variant: "primary", size: "normal" },
});

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;
function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={buttonStyles({ variant, size, className })} {...props} />;
}

function detectBrowserPlatform(): Platform {
  const value = navigator.userAgent.toLowerCase();
  return value.includes("mac") ? "macos" : value.includes("win") ? "windows" : "linux";
}

function extractScript(markdown: string): string | null {
  return markdown.match(/```(?:powershell|ps1|bash|sh|shell)\s*\n([\s\S]*?)```/i)?.[1]?.trim() || null;
}

function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} /></a>;
          },
          code({ className, children, ...props }) {
            const language = /language-(\w+)/.exec(className || "")?.[1];
            const text = String(children).replace(/\n$/, "");
            if (!language) return <code className={className} {...props}>{children}</code>;
            return (
              <div className="code-shell">
                <div className="code-toolbar">
                  <span>{language}</span>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => navigator.clipboard.writeText(text)}
                    aria-label="复制代码"
                  >
                    <Clipboard size={14} /> 复制
                  </Button>
                </div>
                <SyntaxHighlighter language={language} style={vscDarkPlus} customStyle={{ margin: 0, background: "#172038" }}>
                  {text}
                </SyntaxHighlighter>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function InstallDialog({
  open, onOpenChange, software, onConfirm,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  software: string;
  onConfirm(): void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Close className="dialog-close" aria-label="关闭"><X size={18} /></Dialog.Close>
          <div className="dialog-icon"><ShieldAlert /></div>
          <Dialog.Title>准备把它装进电脑</Dialog.Title>
          <Dialog.Description>
            即将执行 {software} 的安装脚本。系统可能弹出权限确认；请先浏览脚本，只允许你信任的操作。
          </Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild><Button variant="secondary">再看一眼</Button></Dialog.Close>
            <Button onClick={onConfirm}><Play size={17} /> 确认执行</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Installer() {
  const [software, setSoftware] = useState<Software[]>([]);
  const [selected, setSelected] = useState<Software | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [versionSource, setVersionSource] = useState("");
  const [platform, setPlatform] = useState<Platform>(detectBrowserPlatform());
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [view, setView] = useState<"choose" | "plan">("choose");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    request<Software[]>("/software").then(setSoftware).catch((e) => setError(e.message));
    window.zhuangleme?.getPlatform().then(setPlatform);
  }, []);

  useEffect(() => {
    if (!window.zhuangleme) return;
    return window.zhuangleme.onInstallEvent((event) => {
      if (jobRef.current && event.id !== jobRef.current) return;
      if (event.type === "exit") {
        setExitCode(Number(event.data));
        setJobId(null);
        jobRef.current = null;
      } else {
        setLogs((current) => [...current, event.type === "stderr" ? `⚠ ${event.data}` : event.data]);
      }
    });
  }, []);

  const pickSoftware = useCallback(async (item: Software) => {
    setSelected(item);
    setPlan(null);
    setVersions([]);
    setVersion("");
    setVersionSource("");
    setError("");
    setLoading("正在向官网打听版本…");
    try {
      const data = await request<{ software: Software; versions: string[]; source: string }>(`/software/${item.slug}/versions`);
      setVersions(data.versions.length ? data.versions : ["latest"]);
      setVersion(data.versions[0] || "latest");
      setVersionSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "版本获取失败");
    } finally {
      setLoading("");
    }
  }, []);

  async function searchSoftware(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setError("");
    setLoading("正在给软件验明正身…");
    try {
      const item = await request<Software>("/software/resolve", {
        method: "POST", body: JSON.stringify({ query }),
      });
      if (!software.some((x) => x.id === item.id)) setSoftware((x) => [...x, item]);
      await pickSoftware(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "没有听懂，再试一次");
      setLoading("");
    }
  }

  async function makePlan(force = false) {
    if (!selected || !version) return;
    setError("");
    setPlan(null);
    setFeedbackDone(false);
    setView("plan");
    setLoading(force ? "正在重新配一份安装说明…" : "官网资料已到，正在组装安装方案…");
    try {
      const data = await request<Plan>("/plans/generate", {
        method: "POST",
        body: JSON.stringify({ software_slug: selected.slug, version, platform, force }),
      });
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "方案生成失败");
    } finally {
      setLoading("");
    }
  }

  async function sendFeedback(effective: boolean) {
    if (!plan) return;
    try {
      await request("/feedback", {
        method: "POST",
        body: JSON.stringify({ plan_id: plan.id, effective, content: feedbackText }),
      });
      setFeedbackDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "反馈提交失败");
    }
  }

  async function runInstall() {
    setConfirmOpen(false);
    if (!plan) return;
    const script = extractScript(plan.markdown);
    if (!script) {
      setError("方案里没有可执行脚本，请使用官方链接完成安装。");
      return;
    }
    if (!window.zhuangleme) {
      setError("浏览器预览不能执行本地脚本，请在 Electron 桌面 APP 中操作。");
      return;
    }
    setLogs([`▶ 开始安装 ${plan.software.name} ${plan.version}\n`]);
    setExitCode(null);
    try {
      const result = await window.zhuangleme.startInstall({ script, platform: plan.platform });
      jobRef.current = result.id;
      setJobId(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "脚本启动失败");
    }
  }

  const script = plan ? extractScript(plan.markdown) : null;
  return (
    <main className={clsx("app-shell", view === "plan" && "app-shell--plan")}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("choose")} aria-label="回到首页">
          <span className="brand-box"><PackageOpen /></span>
          <span>装了吗</span>
        </button>
        <p>靠谱安装，少和环境变量吵架。</p>
        <button className="admin-link" onClick={() => { location.hash = "admin"; }}>
          <Settings size={16} /> 数据库管理
        </button>
      </header>

      {view === "choose" ? (
        <>
          <section className="hero">
            <div>
              <span className="hero-kicker"><Wrench size={17} /> 软件安装小铺</span>
              <h1>软件请上车，<br />坑请下车。</h1>
              <p>你负责点名，我们负责去官网翻版本、找正经安装方式。</p>
            </div>
            <div className="tool-buddy" aria-hidden="true">
              <div className="buddy-bubble">今天装点啥？</div>
              <div className="buddy-face"><PackageOpen /><i /><i /></div>
            </div>
          </section>

          <section className="chooser-stage">
            <div className="chooser-heading">
              <div><span>第一步</span><h2>挑一位软件乘客</h2></div>
              <p>常客直接点，生面孔就搜。小装会先查官网，不瞎猜。</p>
            </div>
          <form onSubmit={searchSoftware} className="search-form">
            <label htmlFor="software-query">软件叫什么？</label>
            <div className="search-box">
              <Search size={20} />
              <input
                id="software-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MySQL、Python，或者一句人话"
              />
              <Button size="small" type="submit" disabled={!!loading}>找找看</Button>
            </div>
          </form>

          <div className="quick-picks">
            <div className="section-label"><span>常用软件货架</span><span>{software.length} 位常客</span></div>
            <div className="software-grid">
              {software.map((item) => (
                <button
                  key={item.id}
                  className={clsx("software-chip", selected?.id === item.id && "software-chip--active")}
                  onClick={() => pickSoftware(item)}
                >
                  <span>{item.name.slice(0, 1).toUpperCase()}</span>{item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="selection-board">
            <div className="selected-passenger">
              <span className="software-avatar">{selected?.name.slice(0, 1).toUpperCase() || "?"}</span>
              <div><small>当前乘客</small><strong>{selected?.name || "还没选，座位空着呢"}</strong></div>
            </div>
            <label className="field-block">
              <span className="field-label-row">
                <span>版本</span>
                {versionSource && (
                  <small className={clsx("source-pill", `source-pill--${versionSource.replace("+", "-")}`)}>
                    {versionSource === "official" ? "✓ 官网报到" : versionSource === "web-search" ? "联网查到" : versionSource === "cache" ? "上次官网记录" : "AI 兜底"}
                  </small>
                )}
              </span>
              <select value={version} onChange={(e) => setVersion(e.target.value)} disabled={!versions.length}>
                {!versions.length && <option>先选软件</option>}
                {versions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span className="field-label-row"><span>系统</span></span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </label>
            <Button onClick={() => makePlan()} disabled={!selected || !version || !!loading}>
              {loading ? <LoaderCircle className="spin" /> : <Sparkles />} 带我去看安装方案
            </Button>
          </div>
          {error && <div className="error-banner"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError("")}><X /></button></div>}
          {loading && (
            <div className="inline-working"><LoaderCircle className="spin" /><span>{loading}</span></div>
          )}
          </section>
        </>
      ) : (
        <section className="result-page">
          <button className="result-back" onClick={() => { setView("choose"); setError(""); }}>
            <ArrowLeft /> 换个软件
          </button>
          {error && <div className="error-banner"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError("")}><X /></button></div>}
          {loading && (
            <div className="working-state">
              <div className="working-tool"><Wrench /></div>
              <h2>{loading}</h2>
              <p>小装正在核对官网资料，马上端上来。</p>
            </div>
          )}
          {!loading && plan && (
            <article className="plan-panel">
              <div className="plan-heading">
                <div>
                  <span className="plan-ticket">安装说明书 #{String(plan.id).padStart(4, "0")}</span>
                  <h2>{plan.software.name} <small>{plan.version}</small></h2>
                  <p>资料核对完毕，可以先读一遍，再让它开工。</p>
                </div>
                <div className="plan-actions">
                  <Button variant="secondary" size="small" onClick={() => makePlan(true)}><RefreshCw /> 换个写法</Button>
                  {plan.software.install_kind === "script" && (
                    <Button size="small" onClick={() => setConfirmOpen(true)} disabled={!script || !!jobId}>
                      <Play /> 好，开装
                    </Button>
                  )}
                </div>
              </div>
              <MarkdownView content={plan.markdown} />
              <div className="feedback-box">
                {feedbackDone ? (
                  <div className="feedback-thanks"><CheckCircle2 /> 收到！这块香蕉皮我们记下了。</div>
                ) : (
                  <>
                    <strong>这份说明书好使吗？</strong>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="可选：哪一步和你闹别扭了？"
                    />
                    <div>
                      <Button variant="secondary" size="small" onClick={() => sendFeedback(true)}><ThumbsUp /> 有效</Button>
                      <Button variant="ghost" size="small" onClick={() => sendFeedback(false)}><ThumbsDown /> 无效</Button>
                    </div>
                  </>
                )}
              </div>
            </article>
          )}
        </section>
      )}

      {(logs.length > 0 || jobId) && (
        <section className="log-drawer">
          <div className="log-heading">
            <div><TerminalSquare /><strong>安装现场</strong><span className={jobId ? "live-dot" : ""}>{jobId ? "执行中" : exitCode === 0 ? "安装完成" : "执行结束"}</span></div>
            {jobId && (
              <Button variant="danger" size="small" onClick={async () => {
                const stopped = await window.zhuangleme?.stopInstall(jobId);
                if (!stopped) setLogs((current) => [...current, "\n⚠ Windows 已授权的管理员进程不能从普通窗口强制终止，请在弹出的 PowerShell 窗口中按 Ctrl+C。\n"]);
              }}>
                <Square /> 停止
              </Button>
            )}
          </div>
          <pre>{logs.join("")}{exitCode !== null && `\n\n进程退出码：${exitCode}${exitCode === 0 ? " ✓" : "（请查看上方错误）"}`}</pre>
        </section>
      )}
      <InstallDialog open={confirmOpen} onOpenChange={setConfirmOpen} software={plan?.software.name || ""} onConfirm={runInstall} />
    </main>
  );
}

function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  const loadAll = useCallback(async (value: string) => {
    try {
      const [planRows, feedbackRows, statRows] = await Promise.all([
        request<Plan[]>("/admin/plans", {}, value),
        request<Feedback[]>("/admin/feedback", {}, value),
        request<Stat[]>("/admin/stats", {}, value),
      ]);
      setPlans(planRows);
      setFeedback(feedbackRows);
      setStats(statRows);
      setAuthenticated(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    }
  }, []);

  async function mutate(path: string, init: RequestInit) {
    try {
      await request(path, init, password);
      await loadAll(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }

  if (!authenticated) {
    return (
      <main className="admin-login">
        <button className="back-link" onClick={() => { location.hash = ""; }}><ArrowLeft /> 返回用户端</button>
        <form onSubmit={(e) => { e.preventDefault(); loadAll(password); }} className="login-card">
          <div className="brand-box"><Settings /></div>
          <h1>数据库登录入口</h1>
          <p>管理员请输入密码。</p>
          <label>管理密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
          {error && <div className="inline-error">{error}</div>}
          <Button type="submit">登录数据库后台</Button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="brand-box"><Settings /></span><div><h1>装了吗 · 管理台</h1><p>方案、反馈和选择统计都在这里。</p></div></div>
        <Button variant="secondary" onClick={() => { location.hash = ""; }}><ArrowLeft /> 回用户端</Button>
      </header>
      {error && <div className="error-banner"><ShieldAlert />{error}<button onClick={() => setError("")}><X /></button></div>}
      <Tabs.Root defaultValue="plans" className="admin-tabs">
        <Tabs.List>
          <Tabs.Trigger value="plans">安装方案 <span>{plans.length}</span></Tabs.Trigger>
          <Tabs.Trigger value="feedback">用户反馈 <span>{feedback.filter((x) => !x.handled).length}</span></Tabs.Trigger>
          <Tabs.Trigger value="stats">选择统计</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="plans">
          <div className="admin-list">
            {plans.map((plan) => (
              <article key={plan.id} className="admin-row">
                <div className="row-main">
                  <span className="software-avatar">{plan.software.name.slice(0, 1)}</span>
                  <div><strong>{plan.software.name} {plan.version}</strong><p>{plan.platform} · {plan.generation_source} · {new Date(plan.updated_at).toLocaleString()}</p></div>
                </div>
                <div className="row-actions">
                  <Button variant="secondary" size="small" onClick={() => setEditing(plan)}>查看 / 编辑</Button>
                  <Button variant="ghost" size="icon" title="AI 重新生成" onClick={() => mutate(`/admin/plans/${plan.id}/regenerate`, { method: "POST" })}><RefreshCw /></Button>
                  <Button variant="danger" size="icon" title="删除" onClick={() => confirm("确定删除这张方案？") && mutate(`/admin/plans/${plan.id}`, { method: "DELETE" })}><Trash2 /></Button>
                </div>
              </article>
            ))}
            {!plans.length && <div className="admin-empty">还没有生成过方案。</div>}
          </div>
        </Tabs.Content>
        <Tabs.Content value="feedback">
          <div className="admin-list">
            {feedback.map((item) => (
              <article key={item.id} className={clsx("feedback-row", item.handled && "is-handled")}>
                <span className={item.effective ? "vote-good" : "vote-bad"}>{item.effective ? <ThumbsUp /> : <ThumbsDown />}</span>
                <div><strong>{item.effective ? "有效" : "无效"} · 方案 #{item.plan_id}</strong><p>{item.content || "用户没有留下文字"}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
                {!item.handled && <Button variant="secondary" size="small" onClick={() => mutate(`/admin/feedback/${item.id}`, { method: "PATCH" })}><Check /> 标记已处理</Button>}
              </article>
            ))}
            {!feedback.length && <div className="admin-empty">暂时没有用户反馈。</div>}
          </div>
        </Tabs.Content>
        <Tabs.Content value="stats">
          <div className="stats-summary">
            <div><strong>{stats.reduce((sum, x) => sum + x.count, 0)}</strong><span>累计选择</span></div>
            <div><strong>{new Set(stats.map((x) => x.software)).size}</strong><span>被选软件</span></div>
            <div><strong>{stats.length ? Math.max(...stats.map((x) => x.count)) : 0}</strong><span>单项最高</span></div>
          </div>
          <div className="stats-table">
            <div className="stats-head"><span>软件</span><span>版本</span><span>平台</span><span>次数</span></div>
            {stats.map((item, i) => (
              <div className="stats-line" key={`${item.software}-${item.version}-${item.platform}`}>
                <span><b>#{i + 1}</b>{item.software}</span><span>{item.version}</span><span>{item.platform}</span><strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <Dialog.Root open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="editor-dialog">
            <Dialog.Title>编辑 {editing?.software.name} 安装方案</Dialog.Title>
            <Dialog.Close className="dialog-close"><X /></Dialog.Close>
            <textarea value={editing?.markdown || ""} onChange={(e) => setEditing((x) => x ? { ...x, markdown: e.target.value } : x)} />
            <div className="dialog-actions">
              <Dialog.Close asChild><Button variant="secondary">取消</Button></Dialog.Close>
              <Button onClick={() => {
                if (!editing) return;
                mutate(`/admin/plans/${editing.id}`, { method: "PUT", body: JSON.stringify({ markdown: editing.markdown }) });
                setEditing(null);
              }}>保存修改</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

export default function App() {
  const [admin, setAdmin] = useState(location.hash === "#admin");
  useEffect(() => {
    const update = () => setAdmin(location.hash === "#admin");
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return admin ? <Admin /> : <Installer />;
}

