// adapters/amp/plugins/pipeline.js — Amp plugin pipeline 适配器实体（lite，档 A 全保真）。
//
// 部署方式与 codex/gemini/cursor 等**不同构**（如实标注，见 adapters/amp/README.md「研究方法与
// 诚实边界」）：Amp 没有"外部命令 + stdin JSON + exit code"式的 hook 协议，其原生扩展机制是
// **进程内 TypeScript/JavaScript 插件**——`.amp/plugins/<name>.js`（或 .ts）由 Amp 自带的 Bun
// 运行时加载，通过 `amp.on(eventName, handler)` 注册生命周期事件回调，handler 以*返回值*（而非
// exit code）决定行为。本文件即该插件；install.sh 把它连同烘焙好的绝对路径投递到
// `.amp/plugins/pipeline.js`。
//
// 研究依据（2026-07-07 spike，非纯文档摘要——见 README 完整证据链）：
//   ① ampcode.com 官方文档 + news/hooks 公告（WebFetch/WebSearch）；
//   ② **反编译已发布 npm 包 @ampcode/cli-darwin-arm64 的真实二进制**（strings 抽取），逐字确认：
//      - 事件分发表 `event:{sessionStart:_T,toolCall:xT,toolResult:gT,agentStart:qT,agentEnd:pT}`；
//      - tool.call 可返回的动作集合含 `"reject-and-continue"`（真硬拦，非 advisory）；
//      - `session.start` 每 threadID 只触发一次（`startedSessionStartThreadIDs` Set 去重）；
//      - 插件目录扫描只认 `.js`/`.ts` 扩展名（故本文件不可用 .mjs）。
//   这比"读文档就下结论"更接近真实实现，但**仍不是**对真实 Amp 会话的端到端实测（沙箱内无
//   Amp 有效登录态）——README 已如实标注此边界，事件 payload 具体字段名（cwd/tool 名怎么取）
//   是本文件里置信度最低的部分，做了防御性多路径兜底（见 extractCwd/extractToolName）。
//
// 三能力映射：
//   inject → session.start 标记"新线程"，agent.start（每回合触发、可注入 messages）消费该标记，
//            只在线程首回合注入完整 baseline 上下文（模拟 CC SessionStart 的"每会话一次"节奏；
//            session.start 本身不支持内容注入，故实际投递点在 agent.start）。
//   veto   → tool.call 返回 {action:"reject-and-continue", message} 真阻止工具执行（同 CC exit 2 语义）。
//   track  → tool.result 触发，真 append history（工具名强制映射进 skill 字段，见 recordToolResult
//            注释——原因与 adapters/cline 的同类调整一致：Amp 内建工具名不会字面等于 "Skill"）。
//
// fail-open 红线：任何内部异常都必须默认放行/不阻断（不能让 wrapper 自身故障演变成 Amp 侧
// {action:"error"} 从而整个 thread 报错中止——那比不加 veto 更糟）。
//
// 双重用途（同一文件，两种运行形态，contract §5「conformance 断言真实副作用」）：
//   ① 被 Amp 通过 `export default function(amp){...}` 加载为插件（生产路径）；
//   ② 被本仓库 conformance（tools/test-adapters.sh）以 `node pipeline.js __test <fn> <args...>`
//      直接调用导出的纯函数（decideToolCall/buildInjectContext/recordToolResult）——同一份决策
//      逻辑，两条路径共用，不是另建一套"测试专用镜像"。

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// __PIPELINE_ROOT__ 由 install.sh 用 sed 替换为绝对路径（本仓库根目录，hooks/*.sh 所在处）。
// 与其它适配器的 __ADAPTER_DIR__ 占位符同一约定，只是这里指向仓库根而非 adapters/<id>。
// CLAUDE_PLUGIN_ROOT 环境变量优先于烘焙占位符——与其余全部适配器 wrapper（bash 版）的
// 自定位约定保持一致，也让本文件*不装*就能被 conformance 直接指向本仓库测试（见文件尾 __test）。
const BAKED_ROOT = "__PIPELINE_ROOT__";
const PIPELINE_ROOT =
  process.env.CLAUDE_PLUGIN_ROOT && existsSync(`${process.env.CLAUDE_PLUGIN_ROOT}/hooks`)
    ? process.env.CLAUDE_PLUGIN_ROOT
    : BAKED_ROOT;
const GATE = `${PIPELINE_ROOT}/hooks/gate.sh`;
const SESSION_START = `${PIPELINE_ROOT}/hooks/session-start.sh`;
const SKILL_TRACKER = `${PIPELINE_ROOT}/hooks/skill-tracker.sh`;

/** 跑 baseline bash 脚本，喂 JSON 到 stdin，取 {status,stdout,stderr}；脚本缺失时视作放行。 */
function runBaseline(scriptPath, inputJson) {
  if (!existsSync(scriptPath)) {
    return { status: 0, stdout: "", stderr: "" };
  }
  try {
    const res = spawnSync("bash", [scriptPath], {
      input: inputJson,
      encoding: "utf8",
      timeout: 10_000,
    });
    return {
      status: res.status === null || res.status === undefined ? 0 : res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    };
  } catch {
    // spawn 本身失败（找不到 bash 等）——fail-open，不因 wrapper 故障拦截/报错。
    return { status: 0, stdout: "", stderr: "" };
  }
}

/**
 * veto 决策（纯函数，conformance 直接调用）。
 * @param {string} cwd
 * @param {string} toolName
 * @returns {{action:string, message?:string}}
 */
export function decideToolCall(cwd, toolName) {
  try {
    const input = JSON.stringify({ cwd, tool_name: toolName || "?" });
    const r = runBaseline(GATE, input);
    if (r.status === 2) {
      const reason = (r.stderr || "").trim() || "pipeline gate: 新鲜交互标记待处理";
      return { action: "reject-and-continue", message: reason };
    }
    return { action: "allow" };
  } catch {
    return { action: "allow" }; // fail-open：wrapper 自身异常绝不演变成硬拦或 thread 报错
  }
}

/**
 * inject 内容生成（纯函数，conformance 直接调用）。
 * @param {string} cwd
 * @returns {string|null} 上下文文本；无内容时返回 null（不注入伪上下文）
 */
export function buildInjectContext(cwd) {
  try {
    const input = JSON.stringify({ cwd });
    const r = runBaseline(SESSION_START, input);
    const text = (r.stdout || "").trim();
    return text.length > 0 ? r.stdout : null;
  } catch {
    return null;
  }
}

/**
 * track 留痕（纯函数，conformance 直接调用；fire-and-forget，无返回值语义）。
 * 强制 tool_name="Skill"、真实工具名放进 skill 字段——baseline skill-tracker.sh 只认
 * tool_name ∈ {Skill,Agent,Task}；Amp 内建工具名（read_file/edit_file/bash 等）不会字面等于
 * "Skill"，直传会导致 track 对真实工具调用恒不触发（同 adapters/cline 的处理原则）。
 * @param {string} cwd
 * @param {string} toolName
 */
export function recordToolResult(cwd, toolName) {
  try {
    const input = JSON.stringify({ cwd, tool_name: "Skill", skill: toolName || "amp-tool" });
    runBaseline(SKILL_TRACKER, input);
  } catch {
    // fire-and-forget：track 失败不回滚、不上抛（contract §1）
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 事件字段提取（本文件置信度最低的部分——诚实标注，见文件头注 + README）。
// Amp 插件事件 payload 的确切字段名未经真实会话实测验证（沙箱无有效 Amp 登录态），
// 多路径防御性提取，任何一路径缺失都不报错、继续尝试下一路径，最终兜底 process.cwd()/"?"。
// ─────────────────────────────────────────────────────────────────────────
function extractCwd(event, ctx) {
  return (
    event?.cwd ||
    event?.workspaceRoot ||
    event?.thread?.cwd ||
    ctx?.workspaceRoot ||
    (typeof process !== "undefined" ? process.cwd() : null) ||
    "."
  );
}

function extractToolName(event) {
  return (
    event?.tool?.name ||
    event?.tool?.toolName ||
    event?.toolName ||
    event?.tool?.id ||
    (typeof event?.tool === "string" ? event.tool : null) ||
    "?"
  );
}

function extractThreadId(event) {
  return event?.thread?.id || event?.threadID || event?.threadId || null;
}

// ─────────────────────────────────────────────────────────────────────────
// 插件注册（Amp 生产路径：export default 函数，接收 PluginAPI 实例）。
// ─────────────────────────────────────────────────────────────────────────
const injectedThreads = new Set(); // 已完整注入过 baseline 上下文的 threadID（模拟"每会话一次"）

export default function pipelinePlugin(amp) {
  // session.start：每 thread 首次触发一次（Amp host 自身去重，见文件头注）。
  // session.start 本身不支持内容注入（host 端不收集其返回值），只用来标记"这是新线程"。
  amp.on("session.start", (event) => {
    // 不需要做任何事——线程是否"新"由 injectedThreads 在 agent.start 里首次命中时判定即可；
    // 保留此 handler 是为了让 inject 能力明确挂在与 CC SessionStart 语义对应的事件名上
    // （conformance / 文档可读性），不是纯装饰。
    void event;
  });

  // agent.start：每回合触发，唯一支持注入 messages 的事件——inject 的真正投递点。
  amp.on("agent.start", (event, ctx) => {
    try {
      const threadId = extractThreadId(event);
      const isFirstTurn = threadId ? !injectedThreads.has(threadId) : true;
      if (!isFirstTurn) return { messages: [] };
      if (threadId) injectedThreads.add(threadId);

      const cwd = extractCwd(event, ctx);
      const context = buildInjectContext(cwd);
      if (!context) return { messages: [] };
      return { messages: [{ content: context, display: false }] };
    } catch {
      return { messages: [] }; // fail-open：inject 永不拦截/报错会话
    }
  });

  // tool.call：真硬拦点。
  amp.on("tool.call", (event, ctx) => {
    try {
      const cwd = extractCwd(event, ctx);
      const toolName = extractToolName(event);
      return decideToolCall(cwd, toolName);
    } catch {
      return { action: "allow" };
    }
  });

  // tool.result：真留痕点。
  amp.on("tool.result", (event, ctx) => {
    try {
      const cwd = extractCwd(event, ctx);
      const toolName = extractToolName(event);
      recordToolResult(cwd, toolName);
    } catch {
      // no-op
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// CLI 自测模式（conformance 路径）：
//   node pipeline.js __test decideToolCall <cwd> <toolName>
//   node pipeline.js __test buildInjectContext <cwd>
//   node pipeline.js __test recordToolResult <cwd> <toolName>
// 与生产路径调用的是**同一份**导出函数，不是另一套镜像实现。
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const [, , mode, fnName, ...rest] = process.argv;
  if (mode !== "__test") return;
  const fns = { decideToolCall, buildInjectContext, recordToolResult };
  const fn = fns[fnName];
  if (!fn) {
    process.stderr.write(`unknown __test fn: ${fnName}\n`);
    process.exitCode = 2;
    return;
  }
  const result = await fn(...rest);
  process.stdout.write(`${JSON.stringify(result === undefined ? null : result)}\n`);
}

if (process.argv[2] === "__test") {
  main();
}
