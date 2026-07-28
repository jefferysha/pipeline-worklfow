#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// packages/server/src/main.ts
import { execFile as execFile5 } from "node:child_process";
import { mkdirSync as mkdirSync6, unlinkSync as unlinkSync3, writeFileSync as writeFileSync6 } from "node:fs";
import { dirname as dirname13, join as join53 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// packages/tap/dist/paths.js
import { homedir, tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
function safeHome() {
  const h = homedir();
  if (h && h.length > 0)
    return h;
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "nouid";
  const base = join(tmpdir(), `tenon-tap-${uid}`);
  try {
    mkdirSync(base, { recursive: true, mode: 448 });
  } catch {
  }
  return base;
}
function resolveTapDir(opts = {}) {
  if (opts.dir)
    return resolve(opts.dir);
  const env = opts.env ?? process.env;
  const explicit = (env.TENON_TAP_DIR ?? "").trim();
  if (explicit)
    return resolve(explicit);
  const db = (env.TENON_TAP_DB ?? "").trim();
  if (db)
    return resolve(dirname(resolve(db)));
  const xdg = (env.XDG_DATA_HOME ?? "").trim();
  if (xdg)
    return resolve(join(xdg, "tenon-tap"));
  return resolve(join(safeHome(), ".local", "share", "tenon-tap"));
}

// packages/tap/dist/record.js
var SENSITIVE_BODY_KEYS = /* @__PURE__ */ new Set([
  "refresh_token",
  "access_token",
  "id_token",
  "client_secret",
  "api_key",
  "apikey",
  "code_verifier",
  "password",
  "secret",
  "session_key",
  "private_key",
  "authorization",
  // 纵深补充（对抗复审 I2）：裸 token / 连字符变体 / session / bearer / cookie 回显。client_id 是公开值不入，免误伤。
  "token",
  "session_token",
  "access-token",
  "refresh-token",
  "session-token",
  "bearer",
  "cookie",
  "set-cookie"
]);
var CRED_KEYS_ALT = [...SENSITIVE_BODY_KEYS].join("|");
var CRED_FORM_RE = new RegExp(`\\b(${CRED_KEYS_ALT})=([^&\\s]+)`, "gi");
var CRED_JSON_STR_RE = new RegExp(`("(?:${CRED_KEYS_ALT})"\\s*:\\s*)"[^"]*"`, "gi");

// packages/tap/dist/trace-store.js
import { appendFileSync, existsSync, mkdirSync as mkdirSync2, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
import { randomUUID } from "node:crypto";

// packages/tap/dist/trace-codecs.js
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeSessionRow(value) {
  if (!isRecord(value))
    return null;
  const id = typeof value.id === "string" ? value.id : null;
  const startedAt = typeof value.started_at === "string" ? value.started_at : null;
  const updatedAt = typeof value.updated_at === "string" ? value.updated_at : null;
  const dateKey = typeof value.date_key === "string" ? value.date_key : null;
  const client = typeof value.client === "string" ? value.client : null;
  const proxyMode = typeof value.proxy_mode === "string" ? value.proxy_mode : null;
  const status = typeof value.status === "string" ? value.status : null;
  if (id === null || startedAt === null || updatedAt === null || dateKey === null || client === null || proxyMode === null || status === null || typeof value.record_count !== "number" || !Number.isSafeInteger(value.record_count) || value.record_count < 0 || value.summary !== null && !isRecord(value.summary)) {
    return null;
  }
  return {
    id,
    started_at: startedAt,
    updated_at: updatedAt,
    date_key: dateKey,
    client,
    proxy_mode: proxyMode,
    status,
    record_count: value.record_count,
    summary: value.summary
  };
}
function decodeTraceRecord(value) {
  return isRecord(value) ? value : null;
}

// packages/tap/dist/trace-store.js
function resolveTraceDir(opts = {}) {
  return resolveTapDir(opts);
}
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
var FileTraceStore = class {
  dir;
  sessionsDir;
  recordsDir;
  constructor(dir) {
    this.dir = dir;
    this.sessionsDir = join2(dir, "sessions");
    this.recordsDir = join2(dir, "records");
    mkdirSync2(this.sessionsDir, { recursive: true });
    mkdirSync2(this.recordsDir, { recursive: true });
  }
  sessionFile(id) {
    return join2(this.sessionsDir, `${encodeURIComponent(id)}.json`);
  }
  recordsFile(id) {
    return join2(this.recordsDir, `${encodeURIComponent(id)}.jsonl`);
  }
  writeSession(row) {
    const tmp = this.sessionFile(row.id) + ".tmp";
    writeFileSync(tmp, JSON.stringify(row), "utf8");
    renameSync(tmp, this.sessionFile(row.id));
  }
  loadSessionRow(id) {
    const f = this.sessionFile(id);
    if (!existsSync(f))
      return null;
    try {
      return decodeSessionRow(JSON.parse(readFileSync(f, "utf8")));
    } catch {
      return null;
    }
  }
  createSession(opts = {}) {
    const id = randomUUID();
    const now = opts.startedAt ?? /* @__PURE__ */ new Date();
    const iso = now.toISOString();
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? "",
      proxy_mode: opts.proxyMode ?? "",
      status: "active",
      record_count: 0,
      summary: null
    });
    return id;
  }
  getOrCreateSession(id, opts = {}) {
    const existing = this.loadSessionRow(id);
    if (existing)
      return { sessionId: id, recordCount: existing.record_count };
    const now = /* @__PURE__ */ new Date();
    const iso = now.toISOString();
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? "",
      proxy_mode: opts.proxyMode ?? "",
      status: "active",
      record_count: 0,
      summary: null
    });
    return { sessionId: id, recordCount: 0 };
  }
  appendRecord(id, record2) {
    let row = this.loadSessionRow(id);
    if (!row) {
      this.getOrCreateSession(id);
      row = this.loadSessionRow(id);
      if (!row)
        throw new Error(`failed to create trace session '${id}'`);
    }
    appendFileSync(this.recordsFile(id), JSON.stringify(record2) + "\n", "utf8");
    row.record_count += 1;
    row.updated_at = typeof record2.timestamp === "string" ? record2.timestamp : (/* @__PURE__ */ new Date()).toISOString();
    row.status = "active";
    this.writeSession(row);
  }
  finalizeSession(id, summary) {
    const row = this.loadSessionRow(id);
    if (!row)
      return;
    let status = "complete";
    if (summary) {
      const apiCalls = Number(summary.api_calls ?? 0);
      if (apiCalls === 0)
        status = "empty";
      else if (summary.has_error)
        status = "error";
    }
    const merged = { ...row.summary ?? {}, ...summary ?? {} };
    merged.status = status;
    merged.id = id;
    merged.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    row.status = status;
    row.summary = merged;
    row.updated_at = merged.updated_at;
    this.writeSession(row);
  }
  readRecords(id) {
    const f = this.recordsFile(id);
    if (!existsSync(f))
      return [];
    const records = [];
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (line.trim().length === 0)
        continue;
      try {
        const record2 = decodeTraceRecord(JSON.parse(line));
        if (record2)
          records.push(record2);
      } catch {
      }
    }
    return records;
  }
  listSessions() {
    if (!existsSync(this.sessionsDir))
      return [];
    const out = [];
    for (const name of readdirSync(this.sessionsDir)) {
      if (!name.endsWith(".json"))
        continue;
      try {
        const row = decodeSessionRow(JSON.parse(readFileSync(join2(this.sessionsDir, name), "utf8")));
        if (row)
          out.push(row);
      } catch {
      }
    }
    return out;
  }
};
function createTraceStore(opts = {}) {
  return new FileTraceStore(resolveTraceDir(opts));
}

// packages/tap/dist/bedrock.js
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// packages/tap/dist/certs.js
var CA_VALIDITY_DAYS = 5 * 365;
var nullDer = Buffer.from([5, 0]);

// packages/tap/dist/clients.js
function cfg(partial) {
  return {
    provider: "anthropic",
    baseUrlSuffix: "",
    extraBaseUrlEnvs: [],
    nestingEnvKeys: [],
    baseUrlConfigKey: null,
    stripPathPrefix: "",
    stripPathPrefixUnlessTargetContains: [],
    defaultProxyMode: "reverse",
    forwardBaseUrlEnvs: [],
    forwardAllowedPathPrefixes: [],
    ...partial
  };
}
var CLIENT_CONFIGS = {
  claude: cfg({
    cmd: "claude",
    label: "Claude Code",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    extraBaseUrlEnvs: ["ANTHROPIC_BEDROCK_BASE_URL"],
    nestingEnvKeys: ["CLAUDECODE", "CLAUDE_CODE_SSE_PORT"]
  }),
  codex: cfg({
    cmd: "codex",
    label: "Codex CLI",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    baseUrlSuffix: "/v1",
    baseUrlConfigKey: "openai_base_url",
    stripPathPrefix: "/v1",
    stripPathPrefixUnlessTargetContains: ["api.openai.com"]
  }),
  // ── forward / MITM 模式（不支持 base-url override）──
  gemini: cfg({
    cmd: "gemini",
    label: "Gemini CLI",
    baseUrlEnv: "GOOGLE_GEMINI_BASE_URL",
    defaultTarget: "https://generativelanguage.googleapis.com",
    provider: "gemini",
    extraBaseUrlEnvs: ["GOOGLE_VERTEX_BASE_URL"],
    defaultProxyMode: "forward"
  }),
  opencode: cfg({
    cmd: "opencode",
    label: "OpenCode",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    defaultProxyMode: "forward"
  }),
  mimo: cfg({
    cmd: "mimo",
    label: "MiMo Code",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    defaultProxyMode: "forward"
  }),
  pi: cfg({
    cmd: "pi",
    label: "Pi",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  hermes: cfg({
    cmd: "hermes",
    label: "Hermes Agent",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  qoder: cfg({
    cmd: "qodercli",
    label: "Qoder CLI",
    baseUrlEnv: "QODER_BASE_URL",
    defaultTarget: "https://api2.qoder.sh",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  agy: cfg({
    cmd: "agy",
    label: "Antigravity CLI",
    baseUrlEnv: "CLOUD_CODE_URL",
    defaultTarget: "https://daily-cloudcode-pa.googleapis.com",
    provider: "gemini",
    defaultProxyMode: "forward",
    forwardBaseUrlEnvs: ["CLOUD_CODE_URL"],
    forwardAllowedPathPrefixes: ["/v1internal"]
  }),
  // ── reverse 补充 ──
  kimi: cfg({
    cmd: "kimi",
    label: "Kimi Code CLI",
    baseUrlEnv: "KIMI_BASE_URL",
    defaultTarget: "https://api.kimi.com/coding/v1",
    provider: "openai"
  }),
  "kimi-code": cfg({
    cmd: "kimi",
    label: "Kimi Code CLI",
    baseUrlEnv: "KIMI_CODE_BASE_URL",
    defaultTarget: "https://api.kimi.com/coding/v1",
    provider: "openai"
  }),
  openclaw: cfg({
    cmd: "openclaw",
    label: "OpenClaw",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    extraBaseUrlEnvs: ["ANTHROPIC_BASE_URL", "GOOGLE_GEMINI_BASE_URL", "OPENROUTER_BASE_URL", "CUSTOM_BASE_URL"]
  }),
  codebuddy: cfg({
    cmd: "codebuddy",
    label: "CodeBuddy",
    baseUrlEnv: "CODEBUDDY_BASE_URL",
    defaultTarget: "https://copilot.tencent.com/v2",
    provider: "openai"
  })
};

// packages/kernel/dist/types.js
var REVIEW_GATE_FIELDS = [
  "review_gate_phase",
  "review_gate_status",
  // The approved decision must bind the exact outgoing edge. `verify` has both a pass and a
  // rollback edge; phase-only approval would let one human decision authorize the other.
  "review_gate_event",
  "review_requested_at",
  "review_acknowledged_at"
];
var REVIEW_GATE_FIELD_DEFAULTS = {
  review_gate_phase: "",
  review_gate_status: "",
  review_gate_event: "",
  review_requested_at: "",
  review_acknowledged_at: ""
};
var PRE_VERIFY_REVIEW_FIELD = "pre_verify_review_result";
var PRE_VERIFY_REVIEW_DEFAULT = "pending";
var FIELD_ORDER = [
  "track",
  "preset",
  "created_by",
  "assignee",
  "phase",
  "phase_status",
  "design_doc",
  "plan",
  "verification_report",
  "build_mode",
  "isolation",
  "build_sha",
  "agent_review_result",
  "codex_review_result",
  "verify_result",
  "branch_status",
  "direct_override",
  "prd_path",
  "pr_url",
  "automation",
  "automation_queued_at",
  "automation_sandbox",
  "automation_worktree",
  "automation_attempts",
  "automation_last_error",
  "automation_preserved_path",
  "branch",
  "base_branch",
  "scope",
  "related_files",
  "spec_scope",
  "depends_on",
  "created_at",
  "updated_at",
  "verified_at",
  "archived_at",
  "archived",
  "workflow",
  // v5 T4（决策 G）：沙箱内当前阶段（automation runner 检出 [TRANSITION] 行运行期回写；run 结算
  // 清空）。host 阶段（phase 字段）在 run 结束后才结算，两者并存不冲突。**新字段必须追加在末尾**
  // （同 workflow 先例）：老版本窄解析器遇到首个未知 key 起整段进 opaqueTail——新字段若插在中段，
  // 老读者会把其后所有真字段（branch/base_branch/workflow…）当不透明尾巴，回写时用缺省值再造一份
  // → 重复 key 静默腐蚀；放末尾则老读者只把这一行当尾巴逐字保留，混版本读写无损。
  "automation_current_phase",
  // F-b（2026-07-13）：失败成因结构化 tag——automation 写入端按 error _tag 干净判定落盘
  // （cancelled/conflict/timeout/verify-fail/agent-exit/no-op，开放集），空串=未知（基础设施类
  // 不写，读取端 fallback regex 分类 automation_last_error 文本）。与 automation_last_error
  // **同写同清**（写点见 automation scheduler/lifecycle/sdk），杜绝「消息换了、成因还是旧的」撕裂。
  // 末尾追加理由同 automation_current_phase（老窄解析器 opaqueTail 腐蚀警告见上）。
  "automation_cause",
  // Review-gate v2：review 是“完成当前相位产出后再由人确认离开”的出口协议，而不是进入
  // explore/spec/verify 时就阻断相位工作。字段一起记录确切 phase、event、状态和两次时间，令
  // transition 能拒绝无确认的离开，同时让 UserPromptSubmit 的确认留在 canonical state 中。event
  // 必须是待离开 phase 的确切出边，不能让 verify-fail 的确认误授权给 verify-pass（反之亦然）。
  // 必须继续只追加在末尾，原因同上面的 automation_*：旧窄解析器会把未知尾字段原样保留。
  ...REVIEW_GATE_FIELDS,
  // Build→Verify 全量收敛门：新实现 visit 必须重新完成完整 diff/契约/发行门禁审查，不能继承
  // 上一候选的 pass。继续严格末尾追加，使旧窄解析器把这一行及其后的提交元数据原样保留。
  PRE_VERIFY_REVIEW_FIELD
];
var LIST_FIELDS = ["scope", "related_files", "spec_scope", "depends_on"];
var PHASES = ["open", "explore", "spec", "build", "verify", "ship", "archive"];
var DOCUMENT_LOCALES = ["zh-CN", "en"];
var GATE_FRESH_MS = 15 * 60 * 1e3;
var SANDCASTLE_BUILD_HINT = "bash tools/sandcastle/build.sh";
function codexHomeCredentialLight(explicitCodexHome, defaultCodexHome, hasReadableAuth) {
  if (explicitCodexHome !== void 0 && explicitCodexHome !== "") {
    return hasReadableAuth(explicitCodexHome) ? { set: true, source: "host-env" } : { set: false };
  }
  if (defaultCodexHome && hasReadableAuth(defaultCodexHome)) {
    return { set: true, source: "default-home" };
  }
  return { set: false };
}
var CODEX_AUTH_GUIDANCE = {
  cli: "\u5B89\u88C5\u6216\u66F4\u65B0\u5B98\u65B9 Codex CLI\uFF1A`npm install -g @openai/codex`\uFF1B\u9A8C\u8BC1\uFF1A`codex --version`",
  chatgpt: "ChatGPT \u8BA2\u9605\uFF1A\u5982\u679C\u4F60\u7684\u65B9\u6848\u5305\u542B Codex\uFF0C\u8FD0\u884C `codex login`\uFF08\u65E0\u9700\u53E6\u8BBE API Key\uFF09",
  device: "\u8FDC\u7A0B\u6216\u65E0\u6D4F\u89C8\u5668\u73AF\u5883\uFF1A\u8FD0\u884C `codex login --device-auth`",
  apiKey: "Platform API Key\uFF1A\u5728 https://platform.openai.com/api-keys \u521B\u5EFA\u540E\uFF0C\u8FD0\u884C `printenv OPENAI_API_KEY | codex login --with-api-key`\uFF08Platform \u6309\u7528\u91CF\u8BA1\u8D39\uFF09",
  verify: "\u9A8C\u8BC1\u8BA4\u8BC1\u72B6\u6001\uFF1A`codex login status`"
};
var PREREQ_HINTS = {
  /** claude-code 凭证 CLAUDE_CODE_OAUTH_TOKEN 缺 —— 生成长期 OAuth token。 */
  claudeToken: "\u8FD0\u884C `claude setup-token` \u751F\u6210\u957F\u671F OAuth token",
  /** codex 凭证 OPENAI_API_KEY 缺 —— 两条路(ChatGPT 账户登录 / 建 API key)。 */
  openaiKey: `${CODEX_AUTH_GUIDANCE.chatgpt}\uFF1B${CODEX_AUTH_GUIDANCE.apiKey}\uFF1B${CODEX_AUTH_GUIDANCE.verify}`,
  /** docker daemon 不可用 —— 装 OrbStack 或 Docker Desktop（不自动装，需用户自行安装）。 */
  docker: "\u88C5 OrbStack\uFF08orbstack.dev\uFF0C\u8F7B\u91CF\uFF0C\u63A8\u8350 macOS\uFF09\u6216 Docker Desktop\uFF08docker.com\uFF09\u2014\u2014\u4E0D\u81EA\u52A8\u88C5\uFF0C\u9700\u4F60\u81EA\u884C\u5B89\u88C5"
};
var IllegalTransitionError = class extends Error {
  from;
  to;
  constructor(from, to) {
    super(`illegal transition: ${from} -> ${to}`);
    this.from = from;
    this.to = to;
  }
};
var QuoteGateError = class extends Error {
  field;
  reason;
  constructor(field, reason) {
    super(`quote gate rejected write to ${field}: ${reason}`);
    this.field = field;
    this.reason = reason;
  }
};

// packages/kernel/dist/state/store.js
import { readFile as readFile9 } from "node:fs/promises";
import path4 from "node:path";

// packages/kernel/dist/state/atomic-publish.js
import { randomUUID as randomUUID2 } from "node:crypto";
import { link, rename, unlink, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";
async function atomicLinkPublish(dir, tmpNamePrefix, target, content) {
  const tmp = join3(dir, `${tmpNamePrefix}-${randomUUID2()}`);
  try {
    await writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
    await link(tmp, target);
  } finally {
    await unlink(tmp).catch(() => {
    });
  }
}
async function atomicReplaceFile(target, content) {
  const tmp = `${target}.tmp-${randomUUID2()}`;
  try {
    await writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
    await rename(tmp, target);
  } finally {
    await unlink(tmp).catch(() => {
    });
  }
}

// packages/kernel/dist/state/lock.js
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename as rename2, rm, stat, utimes, writeFile as writeFile2 } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
var LOCK_DIR_NAME = ".pipeline.lock";
var LOCK_OWNER_FILE = "owner";
var STALE_LOCK_MS = 6e4;
var HEARTBEAT_MS = Math.floor(STALE_LOCK_MS / 3);
var ACQUIRE_TIMEOUT_MS = 1e4;
var POLL_MS = 10;
var queues = /* @__PURE__ */ new Map();
function lockDirFor(changeDir) {
  return path.join(path.resolve(changeDir), LOCK_DIR_NAME);
}
function ownerPathFor(lockDir) {
  return path.join(lockDir, LOCK_OWNER_FILE);
}
async function lockAgeMs(lockDir) {
  try {
    const st = await stat(ownerPathFor(lockDir));
    return Date.now() - st.mtimeMs;
  } catch {
    try {
      const st = await stat(lockDir);
      return Date.now() - st.mtimeMs;
    } catch {
      return null;
    }
  }
}
async function lockOwnerProcessIsDead(lockDir) {
  let owner;
  try {
    owner = (await readFile(ownerPathFor(lockDir), "utf8")).trim();
  } catch {
    return false;
  }
  const pidText = owner.split(".", 1)[0] ?? "";
  if (!/^[1-9][0-9]*$/.test(pidText))
    return false;
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid) || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}
async function reclaimAbandoned(lockDir) {
  const grave = `${lockDir}.stale.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    await rename2(lockDir, grave);
  } catch {
    return;
  }
  await rm(grave, { recursive: true, force: true }).catch(() => {
  });
}
function startHeartbeat(lockDir) {
  const owner = ownerPathFor(lockDir);
  const t = setInterval(() => {
    const now = /* @__PURE__ */ new Date();
    void utimes(owner, now, now).catch(() => {
    });
  }, HEARTBEAT_MS);
  if (typeof t.unref === "function")
    t.unref();
  return t;
}
async function acquire(lockDir) {
  const token = `${process.pid}.${randomBytes(8).toString("hex")}.${Date.now()}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  for (; ; ) {
    let created = false;
    try {
      await mkdir(lockDir);
      created = true;
      await writeFile2(ownerPathFor(lockDir), `${token}
`, "utf8");
      return { token, heartbeat: startHeartbeat(lockDir) };
    } catch (err) {
      if (created) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {
        });
        throw err;
      }
      if (err.code !== "EEXIST")
        throw err;
    }
    if (await lockOwnerProcessIsDead(lockDir)) {
      await reclaimAbandoned(lockDir);
      continue;
    }
    const age = await lockAgeMs(lockDir);
    if (age === null)
      continue;
    if (age > STALE_LOCK_MS) {
      await reclaimAbandoned(lockDir);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`withLock: acquire timeout after ${ACQUIRE_TIMEOUT_MS}ms: ${lockDir}`);
    }
    await sleep(POLL_MS);
  }
}
async function release(lockDir, held) {
  clearInterval(held.heartbeat);
  let owner = null;
  try {
    owner = (await readFile(ownerPathFor(lockDir), "utf8")).trim();
  } catch {
    owner = null;
  }
  if (owner !== held.token)
    return;
  await rm(lockDir, { recursive: true, force: true }).catch(() => {
  });
}
async function withLock(changeDir, fn) {
  const lockDir = lockDirFor(changeDir);
  const prev = queues.get(lockDir) ?? Promise.resolve();
  const run = prev.then(async () => {
    const held = await acquire(lockDir);
    try {
      return await fn();
    } finally {
      await release(lockDir, held);
    }
  });
  const settled = run.then(() => void 0, () => void 0);
  queues.set(lockDir, settled);
  void settled.then(() => {
    if (queues.get(lockDir) === settled)
      queues.delete(lockDir);
  });
  return run;
}

// packages/kernel/dist/sha256.js
import { createHash } from "node:crypto";
function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

// packages/kernel/dist/loops/automation-policy.js
var EXCEED_ACTIONS = /* @__PURE__ */ new Set(["skip-run", "pause-loop", "halt-round"]);
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function closed(value, keys, path7) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${path7}: unknown key '${key}'`);
  for (const key of keys)
    if (!Object.hasOwn(value, key))
      throw new Error(`${path7}.${key}: missing`);
}
function stringAt(value, path7) {
  if (typeof value !== "string" || value === "")
    throw new Error(`${path7}: expected non-empty string`);
  return value;
}
function numberAt(value, path7) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${path7}: expected non-negative safe integer`);
  return value;
}
function stringsAt(value, path7) {
  if (!Array.isArray(value) || !value.every((item2) => typeof item2 === "string"))
    throw new Error(`${path7}: expected string[]`);
  return [...value];
}
function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value))
    deepFreeze(child);
  return Object.freeze(value);
}
function validateAutomationPolicySnapshot(input) {
  if (!isRecord2(input))
    throw new Error("AutomationPolicy: expected object");
  closed(input, [
    "schema_version",
    "policy_id",
    "policy_version",
    "loop_id",
    "goal",
    "constraints",
    "budget",
    "kill_policy",
    "verifier_binding",
    "skill_bundle_id",
    "captured_at"
  ], "AutomationPolicy");
  if (input.schema_version !== 1)
    throw new Error("AutomationPolicy.schema_version: expected 1");
  if (!isRecord2(input.constraints))
    throw new Error("AutomationPolicy.constraints: expected object");
  closed(input.constraints, ["schema_version", "admission", "write", "transition", "merge"], "AutomationPolicy.constraints");
  if (input.constraints.schema_version !== 1)
    throw new Error("AutomationPolicy.constraints.schema_version: expected 1");
  const admission = input.constraints.admission;
  const write = input.constraints.write;
  const transition = input.constraints.transition;
  const merge = input.constraints.merge;
  if (!isRecord2(admission) || !isRecord2(write) || !isRecord2(transition) || !isRecord2(merge)) {
    throw new Error("AutomationPolicy.constraints: invalid operation policy");
  }
  closed(admission, ["require_active"], "AutomationPolicy.constraints.admission");
  closed(write, ["allowlist", "denylist"], "AutomationPolicy.constraints.write");
  closed(transition, ["require_active", "human_gates"], "AutomationPolicy.constraints.transition");
  closed(merge, ["require_active", "allowlist", "denylist"], "AutomationPolicy.constraints.merge");
  if (admission.require_active !== true || transition.require_active !== true || merge.require_active !== true) {
    throw new Error("AutomationPolicy.constraints: require_active must be true");
  }
  if (!isRecord2(input.budget))
    throw new Error("AutomationPolicy.budget: expected object");
  const budgetKeys = ["max_runs_per_day", "max_in_flight", "on_exceed"];
  const budgetOptional = ["max_tokens_per_day", "tokens_per_run"];
  for (const key of Object.keys(input.budget)) {
    if (![...budgetKeys, ...budgetOptional].includes(key))
      throw new Error(`AutomationPolicy.budget: unknown key '${key}'`);
  }
  for (const key of budgetKeys)
    if (!Object.hasOwn(input.budget, key))
      throw new Error(`AutomationPolicy.budget.${key}: missing`);
  const onExceed = input.budget.on_exceed;
  if (typeof onExceed !== "string" || !EXCEED_ACTIONS.has(onExceed)) {
    throw new Error("AutomationPolicy.budget.on_exceed: invalid typed action");
  }
  if (!isRecord2(input.kill_policy))
    throw new Error("AutomationPolicy.kill_policy: expected object");
  closed(input.kill_policy, ["required_status", "on_inactive", "recheck"], "AutomationPolicy.kill_policy");
  if (input.kill_policy.required_status !== "active" || input.kill_policy.on_inactive !== "skip-run" || JSON.stringify(input.kill_policy.recheck) !== JSON.stringify(["schedule", "pre-claim", "transition", "settlement"])) {
    throw new Error("AutomationPolicy.kill_policy: invalid");
  }
  if (!isRecord2(input.verifier_binding))
    throw new Error("AutomationPolicy.verifier_binding: expected object");
  closed(input.verifier_binding, ["kind", "verifier", "version"], "AutomationPolicy.verifier_binding");
  if (input.verifier_binding.kind !== "runtime-verifier" || input.verifier_binding.verifier !== "pipeline-git-integrity" || input.verifier_binding.version !== "1")
    throw new Error("AutomationPolicy.verifier_binding: invalid");
  const payload = {
    schema_version: 1,
    policy_id: stringAt(input.policy_id, "AutomationPolicy.policy_id"),
    loop_id: stringAt(input.loop_id, "AutomationPolicy.loop_id"),
    goal: stringAt(input.goal, "AutomationPolicy.goal"),
    constraints: {
      schema_version: 1,
      admission: { require_active: true },
      write: {
        allowlist: stringsAt(write.allowlist, "AutomationPolicy.constraints.write.allowlist"),
        denylist: stringsAt(write.denylist, "AutomationPolicy.constraints.write.denylist")
      },
      transition: {
        require_active: true,
        human_gates: stringsAt(transition.human_gates, "AutomationPolicy.constraints.transition.human_gates")
      },
      merge: {
        require_active: true,
        allowlist: stringsAt(merge.allowlist, "AutomationPolicy.constraints.merge.allowlist"),
        denylist: stringsAt(merge.denylist, "AutomationPolicy.constraints.merge.denylist")
      }
    },
    budget: {
      max_runs_per_day: numberAt(input.budget.max_runs_per_day, "AutomationPolicy.budget.max_runs_per_day"),
      max_in_flight: numberAt(input.budget.max_in_flight, "AutomationPolicy.budget.max_in_flight"),
      ...input.budget.max_tokens_per_day === void 0 ? {} : {
        max_tokens_per_day: numberAt(input.budget.max_tokens_per_day, "AutomationPolicy.budget.max_tokens_per_day")
      },
      ...input.budget.tokens_per_run === void 0 ? {} : {
        tokens_per_run: numberAt(input.budget.tokens_per_run, "AutomationPolicy.budget.tokens_per_run")
      },
      on_exceed: onExceed
    },
    kill_policy: {
      required_status: "active",
      on_inactive: "skip-run",
      recheck: ["schedule", "pre-claim", "transition", "settlement"]
    },
    verifier_binding: { kind: "runtime-verifier", verifier: "pipeline-git-integrity", version: "1" },
    skill_bundle_id: stringAt(input.skill_bundle_id, "AutomationPolicy.skill_bundle_id")
  };
  const expectedVersion = sha256Hex(JSON.stringify(payload));
  if (input.policy_version !== expectedVersion)
    throw new Error("AutomationPolicy.policy_version: content digest mismatch");
  const capturedAt = stringAt(input.captured_at, "AutomationPolicy.captured_at");
  if (!Number.isFinite(Date.parse(capturedAt)))
    throw new Error("AutomationPolicy.captured_at: invalid timestamp");
  return deepFreeze({ ...payload, policy_version: expectedVersion, captured_at: capturedAt });
}
function pathDecision(allowlist, denylist, input) {
  const paths = input.paths ?? [];
  const denied = paths.filter((path7) => denylist.some((pattern) => input.matches(path7, pattern)));
  if (denied.length > 0)
    return { allowed: false, reason: "path-denied", paths: denied };
  const outside = paths.filter((path7) => !allowlist.some((pattern) => input.matches(path7, pattern)));
  if (outside.length > 0)
    return { allowed: false, reason: "path-outside-allowlist", paths: outside };
  return { allowed: true };
}
function evaluateConstraintPolicy(policy, input) {
  if (!input.active)
    return { allowed: false, reason: "loop-inactive" };
  if (input.operation === "admission")
    return { allowed: true };
  if (input.operation === "transition") {
    const humanGateApplies = input.transitionTarget === void 0 ? policy.transition.human_gates.length > 0 : policy.transition.human_gates.includes(input.transitionTarget);
    return humanGateApplies && input.humanGateSatisfied !== true ? { allowed: false, reason: "human-gate-required" } : { allowed: true };
  }
  return input.operation === "write" ? pathDecision(policy.write.allowlist, policy.write.denylist, input) : pathDecision(policy.merge.allowlist, policy.merge.denylist, input);
}

// packages/kernel/dist/state/run-metadata.js
var RUN_ID_KEY = "pipeline_run_id";
var SEQUENCE_KEY = "pipeline_transition_sequence";
var HEAD_KEY = "pipeline_transition_head";
var POLICY_KEY = "pipeline_automation_policy_b64";
var LOOP_ID_KEY = "pipeline_loop_id";
var ITERATION_ID_KEY = "pipeline_iteration_id";
var DOCUMENT_PROFILE_KEY = "pipeline_document_profile";
var DOCUMENT_GOVERNANCE_FINGERPRINT_KEY = "pipeline_document_governance_fingerprint";
var WORKFLOW_PLAN_FINGERPRINT_KEY = "pipeline_workflow_plan_fingerprint";
var STATE_REVISION_KEY = "pipeline_state_revision";
var STATE_REVISION_ID_KEY = "pipeline_state_revision_id";
var STATE_DIGEST_KEY = "pipeline_state_digest";
var NULL_LITERAL = "null";
function serializeRunMetadataLines(metadata) {
  if (!metadata)
    return [];
  const lines = [
    `${RUN_ID_KEY}: ${metadata.runId}`,
    `${SEQUENCE_KEY}: ${metadata.transitionSequence}`,
    `${HEAD_KEY}: ${metadata.transitionHead ?? NULL_LITERAL}`
  ];
  if (metadata.automationPolicy !== void 0) {
    lines.push(`${POLICY_KEY}: ${Buffer.from(JSON.stringify(metadata.automationPolicy)).toString("base64url")}`);
    if (metadata.loopId !== void 0 && metadata.iterationId !== void 0) {
      lines.push(`${LOOP_ID_KEY}: ${metadata.loopId}`);
      lines.push(`${ITERATION_ID_KEY}: ${metadata.iterationId}`);
    }
  }
  if (metadata.documentProfile !== void 0) {
    lines.push(`${DOCUMENT_PROFILE_KEY}: ${metadata.documentProfile}`);
  }
  if (metadata.documentGovernanceFingerprint !== void 0) {
    if (!/^[0-9a-f]{64}$/.test(metadata.documentGovernanceFingerprint)) {
      throw new Error("document governance fingerprint \u5FC5\u987B\u662F 64 \u4F4D\u5C0F\u5199 SHA-256");
    }
    if (metadata.documentProfile === void 0) {
      throw new Error("document governance fingerprint \u7F3A\u5C11 document profile");
    }
    lines.push(`${DOCUMENT_GOVERNANCE_FINGERPRINT_KEY}: ${metadata.documentGovernanceFingerprint}`);
  }
  if (metadata.workflowPlanFingerprint !== void 0) {
    if (!/^[0-9a-f]{64}$/.test(metadata.workflowPlanFingerprint)) {
      throw new Error("workflow plan fingerprint \u5FC5\u987B\u662F 64 \u4F4D\u5C0F\u5199 SHA-256");
    }
    lines.push(`${WORKFLOW_PLAN_FINGERPRINT_KEY}: ${metadata.workflowPlanFingerprint}`);
  }
  return lines;
}
function parseRunMetadataLines(lines) {
  const NOT_FOUND = { metadata: void 0, consumedLines: 0 };
  const l0 = lines[0];
  const l1 = lines[1];
  const l2 = lines[2];
  if (l0 === void 0 || l1 === void 0 || l2 === void 0)
    return NOT_FOUND;
  const runId = matchLine(l0, RUN_ID_KEY);
  const sequenceRaw = matchLine(l1, SEQUENCE_KEY);
  const headRaw = matchLine(l2, HEAD_KEY);
  if (runId === void 0 || sequenceRaw === void 0 || headRaw === void 0)
    return NOT_FOUND;
  const transitionSequence = Number(sequenceRaw);
  if (!Number.isInteger(transitionSequence) || transitionSequence < 0)
    return NOT_FOUND;
  const metadata = {
    runId,
    transitionSequence,
    transitionHead: headRaw === NULL_LITERAL ? void 0 : headRaw
  };
  let consumedLines = 3;
  const policyLine = lines[consumedLines];
  const policyRaw = policyLine === void 0 ? void 0 : matchLine(policyLine, POLICY_KEY);
  if (policyRaw !== void 0) {
    try {
      metadata.automationPolicy = validateAutomationPolicySnapshot(JSON.parse(Buffer.from(policyRaw, "base64url").toString("utf8")));
      const loopId = lines[4] === void 0 ? void 0 : matchLine(lines[4], LOOP_ID_KEY);
      const iterationId = lines[5] === void 0 ? void 0 : matchLine(lines[5], ITERATION_ID_KEY);
      if (loopId !== void 0 && iterationId !== void 0 && loopId === metadata.automationPolicy.loop_id && iterationId.length > 0) {
        metadata.loopId = loopId;
        metadata.iterationId = iterationId;
        consumedLines = 6;
      } else {
        consumedLines = 4;
      }
    } catch {
    }
  }
  const profileLine = lines[consumedLines];
  const profileRaw = profileLine === void 0 ? void 0 : matchLine(profileLine, DOCUMENT_PROFILE_KEY);
  if (profileRaw === "legacy-full" || profileRaw === "document-v1") {
    metadata.documentProfile = profileRaw;
    consumedLines += 1;
  }
  const fingerprintLine = lines[consumedLines];
  const fingerprintRaw = fingerprintLine === void 0 ? void 0 : matchLine(fingerprintLine, DOCUMENT_GOVERNANCE_FINGERPRINT_KEY);
  if (fingerprintRaw !== void 0) {
    if (metadata.documentProfile === void 0 || !/^[0-9a-f]{64}$/.test(fingerprintRaw)) {
      throw new Error("tenon document governance fingerprint \u635F\u574F");
    }
    metadata.documentGovernanceFingerprint = fingerprintRaw;
    consumedLines += 1;
  }
  const workflowFingerprintLine = lines[consumedLines];
  const workflowFingerprintRaw = workflowFingerprintLine === void 0 ? void 0 : matchLine(workflowFingerprintLine, WORKFLOW_PLAN_FINGERPRINT_KEY);
  if (workflowFingerprintRaw !== void 0) {
    if (!/^[0-9a-f]{64}$/.test(workflowFingerprintRaw)) {
      throw new Error("tenon workflow plan fingerprint \u635F\u574F");
    }
    metadata.workflowPlanFingerprint = workflowFingerprintRaw;
    consumedLines += 1;
  }
  return { metadata, consumedLines };
}
function serializeProjectionMetadataLines(metadata) {
  if (!metadata)
    return [];
  return [
    `${STATE_REVISION_KEY}: ${metadata.stateRevision}`,
    `${STATE_REVISION_ID_KEY}: ${metadata.stateRevisionId}`,
    `${STATE_DIGEST_KEY}: ${metadata.stateDigest}`
  ];
}
function parseProjectionMetadataLines(lines) {
  const revisionRaw = lines[0] === void 0 ? void 0 : matchLine(lines[0], STATE_REVISION_KEY);
  const revisionId = lines[1] === void 0 ? void 0 : matchLine(lines[1], STATE_REVISION_ID_KEY);
  const stateDigest = lines[2] === void 0 ? void 0 : matchLine(lines[2], STATE_DIGEST_KEY);
  const stateRevision = Number(revisionRaw);
  if (!Number.isSafeInteger(stateRevision) || stateRevision < 0 || revisionId === void 0 || !/^[A-Za-z0-9_-]+$/.test(revisionId) || stateDigest === void 0 || !/^[0-9a-f]{64}$/.test(stateDigest)) {
    return { metadata: void 0, consumedLines: 0 };
  }
  return { metadata: { stateRevision, stateRevisionId: revisionId, stateDigest }, consumedLines: 3 };
}
function matchLine(line, key) {
  const prefix = `${key}: `;
  return line.startsWith(prefix) ? line.slice(prefix.length) : void 0;
}
function fieldValueEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b))
      return false;
    if (a.length !== b.length)
      return false;
    return a.every((v, i) => v === b[i]);
  }
  return a === b;
}
function diffFieldsToEffects(before, after) {
  const effects = [];
  const fields = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const field of fields) {
    const from = before[field] ?? "";
    const to = after[field] ?? "";
    if (!fieldValueEqual(from, to)) {
      effects.push({ kind: "state-field-change", field, from, to });
    }
  }
  return effects;
}
function diffWireFieldsToEffects(before, after) {
  return diffFieldsToEffects(before, after).filter(({ field }) => field !== PRE_VERIFY_REVIEW_FIELD);
}

// packages/kernel/dist/state/parse.js
var KNOWN_FIELDS = new Set(FIELD_ORDER);
var LIST_FIELD_SET = new Set(LIST_FIELDS);
var REVIEW_GATE_FIELD_SET = new Set(REVIEW_GATE_FIELDS);
var LIST_ITEM_PREFIX = "  - ";
var KEY_RE = /^([A-Za-z0-9_]+):(.*)$/;
function unquoteScalar(s) {
  if (s.length >= 2) {
    const first = s.charAt(0);
    const last = s.charAt(s.length - 1);
    if (first === last && (first === '"' || first === "'"))
      return s.slice(1, -1);
  }
  return s;
}
function emptyFields() {
  const fields = {};
  for (const f of FIELD_ORDER) {
    fields[f] = f === "workflow" ? "default" : f === PRE_VERIFY_REVIEW_FIELD ? PRE_VERIFY_REVIEW_DEFAULT : "";
  }
  return fields;
}
function quoteGate(field, value) {
  if (value.includes("\n") || value.includes("\r")) {
    throw new QuoteGateError(field, "value contains a newline/carriage return (would inject fake fields)");
  }
  if (value.includes(": ")) {
    throw new QuoteGateError(field, 'value contains ": " (would break YAML parsing)');
  }
  if (value.includes(" #")) {
    throw new QuoteGateError(field, 'value contains " #" (would be eaten as an inline comment)');
  }
  const first = value.charAt(0);
  if (first === '"' || first === "'") {
    throw new QuoteGateError(field, "value starts with a quote (would break YAML parsing)");
  }
}
function parsePipeline(content) {
  const lines = content.split("\n");
  const fields = emptyFields();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = KEY_RE.exec(line);
    if (!m)
      break;
    const key = m[1] ?? "";
    if (!KNOWN_FIELDS.has(key))
      break;
    const field = key;
    const rest = (m[2] ?? "").trim();
    i++;
    if (LIST_FIELD_SET.has(field)) {
      if (rest === "") {
        const items = [];
        while (i < lines.length && (lines[i] ?? "").startsWith(LIST_ITEM_PREFIX)) {
          items.push(unquoteScalar((lines[i] ?? "").slice(LIST_ITEM_PREFIX.length).trim()));
          i++;
        }
        fields[field] = items;
      } else if (rest === "[]") {
        fields[field] = [];
      } else {
        fields[field] = unquoteScalar(rest);
      }
    } else {
      fields[field] = unquoteScalar(rest);
    }
  }
  const { metadata, consumedLines } = parseRunMetadataLines(lines.slice(i));
  i += consumedLines;
  const projection = parseProjectionMetadataLines(lines.slice(i));
  i += projection.consumedLines;
  return {
    fields,
    ...metadata === void 0 ? {} : { runMetadata: metadata },
    ...projection.metadata === void 0 ? {} : { projectionMetadata: projection.metadata },
    opaqueTail: lines.slice(i).join("\n")
  };
}
function serializePipeline(state, options = {}) {
  const out = [];
  const hasReviewGateReceipt = REVIEW_GATE_FIELDS.some((field) => {
    const value = state.fields[field];
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
  for (const field of FIELD_ORDER) {
    if (field === PRE_VERIFY_REVIEW_FIELD && options.omitPreVerifyReview === true)
      continue;
    if (REVIEW_GATE_FIELD_SET.has(field) && !hasReviewGateReceipt)
      continue;
    const value = state.fields[field] ?? "";
    if (Array.isArray(value)) {
      for (const item2 of value)
        quoteGate(field, item2);
      if (value.length === 0) {
        out.push(`${field}: []`);
      } else {
        out.push(`${field}:`);
        for (const item2 of value)
          out.push(`${LIST_ITEM_PREFIX}${item2}`);
      }
    } else {
      quoteGate(field, value);
      out.push(`${field}: ${value === "" ? '""' : value}`);
    }
  }
  out.push(...serializeRunMetadataLines(state.runMetadata));
  out.push(...serializeProjectionMetadataLines(state.projectionMetadata));
  return out.join("\n") + "\n" + state.opaqueTail;
}

// packages/kernel/dist/state/run-revision-store.js
import { createHash as createHash3 } from "node:crypto";
import { lstatSync, readFileSync as readFileSync2 } from "node:fs";
import { lstat as lstat3, mkdir as mkdir4, readFile as readFile5 } from "node:fs/promises";
import { join as join7 } from "node:path";

// packages/kernel/dist/state/run-revision-codec.js
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";

// packages/kernel/dist/state/workflow-governance-binding.js
import { lstat, readFile as readFile2 } from "node:fs/promises";
import { join as join4 } from "node:path";
var WORKFLOW_GOVERNANCE_BINDING_FILE = ".pipeline-workflow-governance.json";
function errorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const value = Reflect.get(error, "code");
  return typeof value === "string" ? value : void 0;
}
function parseBinding(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("workflow governance binding \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("workflow governance binding \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const record2 = value;
  const allowed = /* @__PURE__ */ new Set([
    "version",
    "run_id",
    "document_profile",
    "document_governance_fingerprint",
    "workflow_plan_fingerprint"
  ]);
  const digest2 = (candidate) => typeof candidate === "string" && /^[0-9a-f]{64}$/.test(candidate);
  if (Object.keys(record2).some((key) => !allowed.has(key)) || record2.version !== 1 || typeof record2.run_id !== "string" || record2.run_id === "" || record2.document_profile !== void 0 && record2.document_profile !== "legacy-full" && record2.document_profile !== "document-v1" || record2.document_governance_fingerprint !== void 0 && !digest2(record2.document_governance_fingerprint) || record2.workflow_plan_fingerprint !== void 0 && !digest2(record2.workflow_plan_fingerprint) || record2.document_governance_fingerprint !== void 0 && record2.document_profile === void 0) {
    throw new Error("workflow governance binding \u5F62\u72B6\u975E\u6CD5");
  }
  return {
    version: 1,
    run_id: record2.run_id,
    ...record2.document_profile === void 0 ? {} : { document_profile: record2.document_profile },
    ...record2.document_governance_fingerprint === void 0 ? {} : { document_governance_fingerprint: record2.document_governance_fingerprint },
    ...record2.workflow_plan_fingerprint === void 0 ? {} : { workflow_plan_fingerprint: record2.workflow_plan_fingerprint }
  };
}
async function readWorkflowGovernanceBinding(changeDir) {
  const target = join4(changeDir, WORKFLOW_GOVERNANCE_BINDING_FILE);
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`workflow governance binding \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${target}`);
    }
    return parseBinding(await readFile2(target, "utf8"));
  } catch (error) {
    if (errorCode(error) === "ENOENT")
      return void 0;
    throw error;
  }
}
function bindingFor(metadata) {
  return {
    version: 1,
    run_id: metadata.runId,
    ...metadata.documentProfile === void 0 ? {} : { document_profile: metadata.documentProfile },
    ...metadata.documentGovernanceFingerprint === void 0 ? {} : { document_governance_fingerprint: metadata.documentGovernanceFingerprint },
    ...metadata.workflowPlanFingerprint === void 0 ? {} : { workflow_plan_fingerprint: metadata.workflowPlanFingerprint }
  };
}
async function ensureWorkflowGovernanceBinding(changeDir, metadata) {
  const requested = bindingFor(metadata);
  const existing = await readWorkflowGovernanceBinding(changeDir);
  if (existing !== void 0) {
    if (JSON.stringify(existing) !== JSON.stringify(requested)) {
      throw new Error("Change \u5DF2\u56FA\u5B9A\u4E0D\u540C\u7684 workflow governance binding\uFF0C\u62D2\u7EDD\u8986\u76D6");
    }
    return existing;
  }
  const target = join4(changeDir, WORKFLOW_GOVERNANCE_BINDING_FILE);
  try {
    await atomicLinkPublish(changeDir, ".pipeline-workflow-governance.tmp", target, `${JSON.stringify(requested)}
`);
    return requested;
  } catch (error) {
    if (errorCode(error) !== "EEXIST")
      throw error;
    const raced = await readWorkflowGovernanceBinding(changeDir);
    if (raced === void 0 || JSON.stringify(raced) !== JSON.stringify(requested)) {
      throw new Error("workflow governance binding \u5E76\u53D1\u521B\u5EFA\u540E\u5185\u5BB9\u4E0D\u4E00\u81F4");
    }
    return raced;
  }
}
function attachWorkflowGovernanceBinding(metadata, binding) {
  if (metadata === void 0)
    return void 0;
  if (binding === void 0)
    return metadata;
  if (binding.run_id !== metadata.runId) {
    throw new Error("workflow governance binding \u4E0E canonical runId \u4E0D\u4E00\u81F4");
  }
  const asserted = [
    ["documentProfile", metadata.documentProfile, binding.document_profile],
    ["documentGovernanceFingerprint", metadata.documentGovernanceFingerprint, binding.document_governance_fingerprint],
    ["workflowPlanFingerprint", metadata.workflowPlanFingerprint, binding.workflow_plan_fingerprint]
  ];
  for (const [field, canonical, sidecar] of asserted) {
    if (canonical !== void 0 && sidecar !== void 0 && canonical !== sidecar) {
      throw new Error(`workflow governance binding \u4E0E legacy canonical ${field} \u4E0D\u4E00\u81F4`);
    }
  }
  return {
    ...metadata,
    ...binding.document_profile === void 0 ? {} : { documentProfile: binding.document_profile },
    ...binding.document_governance_fingerprint === void 0 ? {} : { documentGovernanceFingerprint: binding.document_governance_fingerprint },
    ...binding.workflow_plan_fingerprint === void 0 ? {} : { workflowPlanFingerprint: binding.workflow_plan_fingerprint }
  };
}
function withoutWorkflowGovernanceBinding(metadata) {
  const { documentProfile: _documentProfile, documentGovernanceFingerprint: _documentGovernanceFingerprint, workflowPlanFingerprint: _workflowPlanFingerprint, workflowPlanSnapshot: _workflowPlanSnapshot, ...canonical } = metadata;
  return canonical;
}

// packages/kernel/dist/state/run-revision-codec.js
var SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;
var FIELD_SET = new Set(FIELD_ORDER);
var LIST_FIELD_SET2 = new Set(LIST_FIELDS);
var PRE_VERIFY_REVIEW_ANCHOR_PREFIX = "# tenon-internal-pre-verify-review-v1: ";
var SHA256_RE = /^[0-9a-f]{64}$/;
function preVerifyReviewResult(state) {
  const result = state.fields[PRE_VERIFY_REVIEW_FIELD];
  if (typeof result !== "string" || !["pending", "pass"].includes(result)) {
    throw new RunStateCorruptError(`canonical ${PRE_VERIFY_REVIEW_FIELD} \u975E\u6CD5\uFF1A\u4EC5\u5141\u8BB8 pending/pass`);
  }
  return result;
}
function preVerifyReviewPayloadDigest(revision, revisionId, result) {
  return createHash2("sha256").update(JSON.stringify({
    schemaVersion: 1,
    revision,
    revisionId,
    result
  })).digest("hex");
}
function parsePreVerifyReviewAnchor(encoded) {
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    throw new RunStateCorruptError(`pre-Verify opaqueTail anchor \u635F\u574F\uFF08${String(error)}\uFF09`);
  }
  const raw = ownRecord(value);
  if (!raw || Object.keys(raw).sort().join(",") !== "payloadDigest,revision,revisionId,schemaVersion" || raw.schemaVersion !== 1 || typeof raw.revision !== "number" || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || typeof raw.revisionId !== "string" || !SAFE_ID_RE.test(raw.revisionId) || typeof raw.payloadDigest !== "string" || !SHA256_RE.test(raw.payloadDigest)) {
    throw new RunStateCorruptError("pre-Verify opaqueTail anchor \u5F62\u72B6\u975E\u6CD5");
  }
  return {
    schemaVersion: 1,
    revision: raw.revision,
    revisionId: raw.revisionId,
    payloadDigest: raw.payloadDigest
  };
}
function splitPreVerifyReviewAnchor(state) {
  if (!state.opaqueTail.startsWith(PRE_VERIFY_REVIEW_ANCHOR_PREFIX))
    return { state };
  const lineEnd = state.opaqueTail.indexOf("\n");
  const encoded = lineEnd < 0 ? "" : state.opaqueTail.slice(PRE_VERIFY_REVIEW_ANCHOR_PREFIX.length, lineEnd);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new RunStateCorruptError("pre-Verify opaqueTail anchor \u7F16\u7801\u975E\u6CD5");
  }
  return {
    state: {
      ...state,
      opaqueTail: state.opaqueTail.slice(lineEnd + 1)
    },
    anchor: parsePreVerifyReviewAnchor(encoded)
  };
}
function withoutPreVerifyReviewField(state, revision, revisionId) {
  const logical = splitPreVerifyReviewAnchor(state).state;
  const fields = structuredClone(state.fields);
  delete fields[PRE_VERIFY_REVIEW_FIELD];
  const anchor = {
    schemaVersion: 1,
    revision,
    revisionId,
    payloadDigest: preVerifyReviewPayloadDigest(revision, revisionId, preVerifyReviewResult(logical))
  };
  const encodedAnchor = Buffer.from(JSON.stringify(anchor), "utf8").toString("base64url");
  return {
    fields,
    ...logical.runMetadata === void 0 ? {} : { runMetadata: logical.runMetadata },
    opaqueTail: `${PRE_VERIFY_REVIEW_ANCHOR_PREFIX}${encodedAnchor}
${logical.opaqueTail}`
  };
}
function rollbackCompatibleState(revision) {
  return withoutPreVerifyReviewField(revision.state, revision.revision, revision.revisionId);
}
var RunStateCorruptError = class extends Error {
  _tag = "RunStateCorruptError";
};
function ownRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return void 0;
  return Object.fromEntries(Object.entries(value));
}
function stringField(fields, field) {
  const value = fields[field];
  return Array.isArray(value) ? value.join(",") : value;
}
function hookStateFor(state) {
  return {
    phase: stringField(state.fields, "phase"),
    workflow: stringField(state.fields, "workflow") || "default",
    track: stringField(state.fields, "track"),
    archived: stringField(state.fields, "archived"),
    automation: stringField(state.fields, "automation")
  };
}
function canonicalRunMetadata(value) {
  if (value === void 0)
    return void 0;
  const raw = ownRecord(value);
  if (!raw)
    throw new RunStateCorruptError("canonical state.runMetadata \u4E0D\u662F\u5BF9\u8C61");
  const allowed = /* @__PURE__ */ new Set([
    "runId",
    "transitionSequence",
    "transitionHead",
    "automationPolicy",
    "loopId",
    "iterationId",
    "documentProfile",
    "documentGovernanceFingerprint",
    "workflowPlanFingerprint"
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new RunStateCorruptError("canonical state.runMetadata \u542B\u672A\u77E5\u5B57\u6BB5");
  }
  if (typeof raw.runId !== "string" || raw.runId.length === 0 || !Number.isSafeInteger(raw.transitionSequence) || raw.transitionSequence < 0 || raw.transitionHead !== void 0 && typeof raw.transitionHead !== "string" || raw.documentProfile !== void 0 && raw.documentProfile !== "legacy-full" && raw.documentProfile !== "document-v1" || raw.documentGovernanceFingerprint !== void 0 && (typeof raw.documentGovernanceFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(raw.documentGovernanceFingerprint)) || raw.workflowPlanFingerprint !== void 0 && (typeof raw.workflowPlanFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(raw.workflowPlanFingerprint)) || raw.loopId !== void 0 && typeof raw.loopId !== "string" || raw.iterationId !== void 0 && typeof raw.iterationId !== "string") {
    throw new RunStateCorruptError("canonical state.runMetadata \u5B57\u6BB5\u975E\u6CD5");
  }
  const automationPolicy = raw.automationPolicy === void 0 ? void 0 : validateAutomationPolicySnapshot(raw.automationPolicy);
  if (raw.loopId === void 0 !== (raw.iterationId === void 0)) {
    throw new RunStateCorruptError("canonical governed identity \u5FC5\u987B loopId/iterationId \u6210\u5BF9");
  }
  if (raw.loopId !== void 0 && automationPolicy === void 0) {
    throw new RunStateCorruptError("canonical governed identity \u7F3A automationPolicy");
  }
  if (raw.documentGovernanceFingerprint !== void 0 && raw.documentProfile === void 0) {
    throw new RunStateCorruptError("canonical document governance fingerprint \u7F3A profile");
  }
  return {
    runId: raw.runId,
    transitionSequence: raw.transitionSequence,
    ...raw.transitionHead === void 0 ? {} : { transitionHead: raw.transitionHead },
    ...raw.documentProfile === void 0 ? {} : { documentProfile: raw.documentProfile },
    ...raw.documentGovernanceFingerprint === void 0 ? {} : { documentGovernanceFingerprint: raw.documentGovernanceFingerprint },
    ...raw.workflowPlanFingerprint === void 0 ? {} : { workflowPlanFingerprint: raw.workflowPlanFingerprint },
    ...automationPolicy === void 0 ? {} : { automationPolicy },
    ...raw.loopId === void 0 ? {} : { loopId: raw.loopId, iterationId: raw.iterationId }
  };
}
function canonicalState(value, opts = {}) {
  const raw = ownRecord(value);
  if (!raw || Object.keys(raw).some((key) => !["fields", "runMetadata", "opaqueTail"].includes(key))) {
    throw new RunStateCorruptError("canonical state \u5F62\u72B6\u975E\u6CD5");
  }
  const rawFields = ownRecord(raw.fields);
  const rawKeys = rawFields ? Object.keys(rawFields) : [];
  const missing3 = rawFields ? FIELD_ORDER.filter((field) => !Object.prototype.hasOwnProperty.call(rawFields, field)) : [];
  const missingReviewGateFields = REVIEW_GATE_FIELDS.filter((field) => missing3.includes(field));
  const isCompleteReviewGateOmission = missingReviewGateFields.length === REVIEW_GATE_FIELDS.length;
  const isEmptyFourFieldReceiptWithoutEvent = missingReviewGateFields.length === 1 && missingReviewGateFields[0] === "review_gate_event" && REVIEW_GATE_FIELDS.filter((field) => field !== "review_gate_event").every((field) => rawFields?.[field] === "");
  const legacyReviewGateDefaults = opts.allowLegacyFieldOmissions === true && (isCompleteReviewGateOmission || isEmptyFourFieldReceiptWithoutEvent) ? new Set(missingReviewGateFields) : /* @__PURE__ */ new Set();
  const legacyPreVerifyDefault = opts.allowLegacyFieldOmissions === true && missing3.includes(PRE_VERIFY_REVIEW_FIELD) ? /* @__PURE__ */ new Set([PRE_VERIFY_REVIEW_FIELD]) : /* @__PURE__ */ new Set();
  const allowedLegacyDefaults = /* @__PURE__ */ new Set([
    ...legacyReviewGateDefaults,
    ...legacyPreVerifyDefault
  ]);
  if (!rawFields || rawKeys.some((key) => !FIELD_SET.has(key)) || missing3.some((field) => !allowedLegacyDefaults.has(field))) {
    throw new RunStateCorruptError("canonical state.fields \u4E0D\u662F FIELD_ORDER \u95ED\u96C6");
  }
  const fields = {};
  for (const field of FIELD_ORDER) {
    if (legacyReviewGateDefaults.has(field)) {
      fields[field] = REVIEW_GATE_FIELD_DEFAULTS[field];
      continue;
    }
    if (legacyPreVerifyDefault.has(field)) {
      fields[field] = PRE_VERIFY_REVIEW_DEFAULT;
      continue;
    }
    const fieldValue = rawFields[field];
    if (typeof fieldValue === "string") {
      fields[field] = fieldValue;
    } else if (LIST_FIELD_SET2.has(field) && Array.isArray(fieldValue) && fieldValue.every((item2) => typeof item2 === "string")) {
      fields[field] = [...fieldValue];
    } else {
      throw new RunStateCorruptError(`canonical state.fields.${field} \u7C7B\u578B\u975E\u6CD5`);
    }
  }
  if (typeof raw.opaqueTail !== "string")
    throw new RunStateCorruptError("canonical opaqueTail \u975E string");
  return {
    fields,
    ...raw.runMetadata === void 0 ? {} : { runMetadata: canonicalRunMetadata(raw.runMetadata) },
    opaqueTail: raw.opaqueTail
  };
}
function canonicalEffect(value, index) {
  const raw = ownRecord(value);
  if (!raw || Object.keys(raw).sort().join(",") !== "field,from,kind,to" || raw.kind !== "state-field-change" || typeof raw.field !== "string" || !FIELD_SET.has(raw.field)) {
    throw new RunStateCorruptError(`canonical mutation.effects[${index}] shape \u975E\u6CD5`);
  }
  const field = raw.field;
  const valueAt = (candidate, side) => {
    if (typeof candidate === "string")
      return candidate;
    if (LIST_FIELD_SET2.has(field) && Array.isArray(candidate) && candidate.every((item2) => typeof item2 === "string"))
      return [...candidate];
    throw new RunStateCorruptError(`canonical mutation.effects[${index}].${side} \u7C7B\u578B\u975E\u6CD5`);
  };
  return {
    kind: "state-field-change",
    field,
    from: valueAt(raw.from, "from"),
    to: valueAt(raw.to, "to")
  };
}
function revisionBody(input) {
  return {
    schemaVersion: 1,
    hookState: input.hookState,
    revision: input.revision,
    revisionId: input.revisionId,
    ...input.previousRevisionId === void 0 ? {} : { previousRevisionId: input.previousRevisionId },
    state: input.state,
    mutation: input.mutation
  };
}
function digestBody(body) {
  return createHash2("sha256").update(JSON.stringify(body)).digest("hex");
}
function createRunRevision(input) {
  const state = splitPreVerifyReviewAnchor(canonicalState({
    fields: structuredClone(input.state.fields),
    ...input.state.runMetadata === void 0 ? {} : { runMetadata: withoutWorkflowGovernanceBinding(structuredClone(input.state.runMetadata)) },
    opaqueTail: input.state.opaqueTail
  })).state;
  const revisionId = input.revisionId ?? randomUUID3();
  const body = revisionBody({
    schemaVersion: 1,
    hookState: hookStateFor(state),
    revision: input.revision,
    revisionId,
    ...input.previousRevisionId === void 0 ? {} : { previousRevisionId: input.previousRevisionId },
    state,
    mutation: input.mutation
  });
  const wireBody = revisionBody({
    ...body,
    state: withoutPreVerifyReviewField(state, input.revision, revisionId)
  });
  return { ...body, stateDigest: digestBody(wireBody) };
}
function serializeRunRevision(revision) {
  const { stateDigest, ...logicalBody } = revision;
  const wireBody = revisionBody({ ...logicalBody, state: rollbackCompatibleState(revision) });
  if (digestBody(wireBody) !== stateDigest) {
    throw new RunStateCorruptError("\u5F85\u53D1\u5E03 revision \u7684 wire digest \u4E0E\u903B\u8F91\u72B6\u6001\u4E0D\u4E00\u81F4");
  }
  return JSON.stringify({ ...wireBody, stateDigest });
}
function parseRunRevision(raw, source) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new RunStateCorruptError(`${source}: JSON \u635F\u574F\uFF08${String(error)}\uFF09`);
  }
  const record2 = ownRecord(value);
  if (!record2 || Object.keys(record2).some((key) => ![
    "schemaVersion",
    "hookState",
    "revision",
    "revisionId",
    "previousRevisionId",
    "state",
    "mutation",
    "stateDigest"
  ].includes(key)))
    throw new RunStateCorruptError(`${source}: \u9876\u5C42\u5B57\u6BB5\u95ED\u96C6\u975E\u6CD5`);
  const hook = ownRecord(record2.hookState);
  const mutation = ownRecord(record2.mutation);
  if (record2.schemaVersion !== 1 || typeof record2.revision !== "number" || !Number.isSafeInteger(record2.revision) || record2.revision < 0 || typeof record2.revisionId !== "string" || !SAFE_ID_RE.test(record2.revisionId) || record2.revision === 0 !== (record2.previousRevisionId === void 0) || record2.previousRevisionId !== void 0 && (typeof record2.previousRevisionId !== "string" || !SAFE_ID_RE.test(record2.previousRevisionId)) || typeof record2.stateDigest !== "string" || !/^[0-9a-f]{64}$/.test(record2.stateDigest) || !hook || Object.keys(hook).sort().join(",") !== "archived,automation,phase,track,workflow" || Object.values(hook).some((item2) => typeof item2 !== "string") || !mutation || Object.keys(mutation).some((key) => ![
    "kind",
    "observedAt",
    "effects",
    "transitionRecordId",
    "transitionRecordDigest"
  ].includes(key)) || !["init", "migration", "replace", "set", "set-many", "cas", "cas-many", "automation", "transition", "legacy-import"].includes(String(mutation.kind)) || typeof mutation.observedAt !== "string" || !Array.isArray(mutation.effects) || mutation.transitionRecordId !== void 0 && (typeof mutation.transitionRecordId !== "string" || !SAFE_ID_RE.test(mutation.transitionRecordId)) || mutation.transitionRecordDigest !== void 0 && (typeof mutation.transitionRecordDigest !== "string" || !/^[0-9a-f]{64}$/.test(mutation.transitionRecordDigest))) {
    throw new RunStateCorruptError(`${source}: canonical revision \u5B57\u6BB5\u975E\u6CD5`);
  }
  const phase = hook.phase;
  const workflow = hook.workflow;
  const track = hook.track;
  const archived = hook.archived;
  const automation = hook.automation;
  if (typeof phase !== "string" || typeof workflow !== "string" || typeof track !== "string" || typeof archived !== "string" || typeof automation !== "string") {
    throw new RunStateCorruptError(`${source}: hookState \u5B57\u6BB5\u975E\u6CD5`);
  }
  const { stateDigest: _rawDigest, ...rawBody } = record2;
  const observedDigest = createHash2("sha256").update(JSON.stringify(rawBody)).digest("hex");
  if (observedDigest !== record2.stateDigest) {
    throw new RunStateCorruptError(`${source}: digest \u4E0D\u5339\u914D`);
  }
  const state = canonicalState(record2.state, { allowLegacyFieldOmissions: true });
  const effects = mutation.effects.map(canonicalEffect);
  const transitionRecordId = typeof mutation.transitionRecordId === "string" ? mutation.transitionRecordId : void 0;
  const transitionRecordDigest = typeof mutation.transitionRecordDigest === "string" ? mutation.transitionRecordDigest : void 0;
  const isTransition = mutation.kind === "transition";
  const isInitial = mutation.kind === "init" || mutation.kind === "migration";
  if (record2.revision === 0 !== isInitial || record2.revision === 0 && effects.length !== 0) {
    throw new RunStateCorruptError(`${source}: revision 0 \u4E0E init/migration \u7A7A effects \u5FC5\u987B\u6210\u5BF9`);
  }
  if (isTransition !== (transitionRecordId !== void 0 && transitionRecordDigest !== void 0)) {
    throw new RunStateCorruptError(`${source}: transition mutation \u4E0E transitionRecordId/transitionRecordDigest \u5FC5\u987B\u6210\u5BF9`);
  }
  if (isTransition && state.runMetadata?.transitionHead !== transitionRecordId) {
    throw new RunStateCorruptError(`${source}: transitionRecordId \u4E0E state transitionHead \u4E0D\u4E00\u81F4`);
  }
  const parsed = {
    schemaVersion: 1,
    hookState: { phase, workflow, track, archived, automation },
    revision: record2.revision,
    revisionId: record2.revisionId,
    ...typeof record2.previousRevisionId === "string" ? { previousRevisionId: record2.previousRevisionId } : {},
    state,
    mutation: {
      kind: mutation.kind,
      observedAt: mutation.observedAt,
      effects,
      ...transitionRecordId === void 0 ? {} : { transitionRecordId },
      ...transitionRecordDigest === void 0 ? {} : { transitionRecordDigest }
    },
    stateDigest: record2.stateDigest
  };
  if (JSON.stringify(parsed.hookState) !== JSON.stringify(hookStateFor(state))) {
    throw new RunStateCorruptError(`${source}: hookState \u4E0E\u5B8C\u6574 state \u4E0D\u4E00\u81F4`);
  }
  return parsed;
}

// packages/kernel/dist/state/transition-record-store.js
import { mkdir as mkdir2, readFile as readFile3 } from "node:fs/promises";
import { join as join5 } from "node:path";
var TRANSITION_RECORDS_DIR = ".pipeline-transitions";
var RecordAlreadyExistsError = class extends Error {
  path;
  constructor(path7) {
    super(`TransitionRecord \u5DF2\u5B58\u5728\uFF0C\u62D2\u7EDD\u8986\u76D6\uFF08\u8BB0\u5F55\u4E0D\u53EF\u53D8\uFF09: ${path7}`);
    this.path = path7;
  }
};
var InvalidRecordIdentityError = class extends Error {
};
var SAFE_RECORD_ID_RE = /^[A-Za-z0-9_-]+$/;
var TRANSITION_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "id",
  "runId",
  "policyId",
  "policyVersion",
  "loopId",
  "iterationId",
  "sequence",
  "previousRecordId",
  "workflowId",
  "event",
  "from",
  "to",
  "effects",
  "actor",
  "observedAt"
]);
var EFFECT_KEYS = /* @__PURE__ */ new Set(["kind", "field", "from", "to"]);
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isStringValue(value) {
  return typeof value === "string" || Array.isArray(value) && value.every((item2) => typeof item2 === "string");
}
function isTransitionRecord(value) {
  if (!isRecord3(value) || Object.keys(value).some((key) => !TRANSITION_KEYS.has(key)))
    return false;
  if (value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.runId !== "string" || !Number.isSafeInteger(value.sequence) || typeof value.sequence !== "number" || value.sequence < 1 || typeof value.workflowId !== "string" || typeof value.event !== "string" || typeof value.from !== "string" || typeof value.to !== "string" || typeof value.observedAt !== "string" || !Array.isArray(value.effects))
    return false;
  for (const key of ["policyId", "policyVersion", "loopId", "iterationId", "previousRecordId", "actor"]) {
    if (value[key] !== void 0 && typeof value[key] !== "string")
      return false;
  }
  const fields = new Set(FIELD_ORDER);
  return value.effects.every((effect) => isRecord3(effect) && Object.keys(effect).every((key) => EFFECT_KEYS.has(key)) && effect.kind === "state-field-change" && typeof effect.field === "string" && fields.has(effect.field) && isStringValue(effect.from) && isStringValue(effect.to));
}
function assertValidIdentity(sequence, recordId) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new InvalidRecordIdentityError(`\u975E\u6CD5 sequence\uFF08\u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF09: ${sequence}`);
  }
  if (!SAFE_RECORD_ID_RE.test(recordId)) {
    throw new InvalidRecordIdentityError(`\u975E\u6CD5 recordId\uFF08\u53EA\u5141\u8BB8\u5B57\u6BCD\u6570\u5B57/\u8FDE\u5B57\u7B26/\u4E0B\u5212\u7EBF\uFF09: ${recordId}`);
  }
}
function recordPath(changeDir, sequence, recordId) {
  assertValidIdentity(sequence, recordId);
  const seqPart = String(sequence).padStart(6, "0");
  return join5(changeDir, TRANSITION_RECORDS_DIR, `${seqPart}-${recordId}.json`);
}
var FsTransitionRecordStore = class {
  async write(changeDir, record2) {
    const dir = join5(changeDir, TRANSITION_RECORDS_DIR);
    await mkdir2(dir, { recursive: true });
    const target = recordPath(changeDir, record2.sequence, record2.id);
    try {
      await atomicLinkPublish(dir, ".tmp", target, JSON.stringify(record2));
    } catch (e) {
      if (e.code === "EEXIST") {
        throw new RecordAlreadyExistsError(target);
      }
      throw e;
    }
  }
  async read(changeDir, sequence, recordId) {
    try {
      const raw = await readFile3(recordPath(changeDir, sequence, recordId), "utf8");
      const parsed = JSON.parse(raw);
      if (!isTransitionRecord(parsed))
        throw new SyntaxError("TransitionRecord schema invalid");
      return parsed;
    } catch (e) {
      if (e.code === "ENOENT")
        return void 0;
      throw e;
    }
  }
  async readChain(changeDir, headSequence, headId, expectedRunId) {
    const chain = [];
    const visited = /* @__PURE__ */ new Set();
    let sequence = headSequence;
    let id = headId;
    let steps = 0;
    while (sequence !== void 0 && id !== void 0) {
      if (steps >= headSequence)
        break;
      steps++;
      let record2;
      try {
        record2 = await this.read(changeDir, sequence, id);
      } catch (e) {
        if (e instanceof InvalidRecordIdentityError || e instanceof SyntaxError)
          break;
        throw e;
      }
      if (!record2)
        break;
      if (record2.id !== id || record2.sequence !== sequence)
        break;
      if (record2.runId !== expectedRunId)
        break;
      if (visited.has(record2.id))
        break;
      visited.add(record2.id);
      chain.unshift(record2);
      id = record2.previousRecordId;
      sequence = id === void 0 ? void 0 : record2.sequence - 1;
    }
    return chain;
  }
};
function createTransitionRecordStore() {
  return new FsTransitionRecordStore();
}

// packages/kernel/dist/state/pre-verify-review-store.js
import { lstat as lstat2, mkdir as mkdir3, readFile as readFile4 } from "node:fs/promises";
import { join as join6 } from "node:path";
var PRE_VERIFY_REVIEW_DIR = "pre-verify-review";
var SAFE_ID_RE2 = /^[A-Za-z0-9_-]+$/;
var ALLOWED_RESULTS = /* @__PURE__ */ new Set(["pending", "pass"]);
function errnoCode(error) {
  if (error === null || typeof error !== "object")
    return void 0;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : void 0;
}
function preVerifyReviewFileName(revision, revisionId) {
  return `${String(revision).padStart(6, "0")}-${revisionId}.json`;
}
function preVerifyReviewRelativePath(revision, revisionId) {
  return join6(".pipeline-run", PRE_VERIFY_REVIEW_DIR, preVerifyReviewFileName(revision, revisionId));
}
function resultFor(state) {
  const value = state.fields[PRE_VERIFY_REVIEW_FIELD];
  if (typeof value !== "string" || !ALLOWED_RESULTS.has(value)) {
    throw new RunStateCorruptError(`canonical ${PRE_VERIFY_REVIEW_FIELD} \u975E\u6CD5\uFF1A\u4EC5\u5141\u8BB8 pending/pass`);
  }
  return value;
}
function recordFor(revision, state) {
  return {
    schemaVersion: 1,
    revision: revision.revision,
    revisionId: revision.revisionId,
    stateDigest: revision.stateDigest,
    result: resultFor(state)
  };
}
function parseRecord(raw, source) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion JSON \u635F\u574F\uFF08${String(error)}\uFF09`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion \u4E0D\u662F\u5BF9\u8C61`);
  }
  const record2 = value;
  if (Object.keys(record2).sort().join(",") !== "result,revision,revisionId,schemaVersion,stateDigest" || record2.schemaVersion !== 1 || typeof record2.revision !== "number" || !Number.isSafeInteger(record2.revision) || record2.revision < 0 || typeof record2.revisionId !== "string" || !SAFE_ID_RE2.test(record2.revisionId) || typeof record2.stateDigest !== "string" || !/^[0-9a-f]{64}$/.test(record2.stateDigest) || typeof record2.result !== "string" || !ALLOWED_RESULTS.has(record2.result)) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion \u5F62\u72B6\u975E\u6CD5`);
  }
  return {
    schemaVersion: 1,
    revision: record2.revision,
    revisionId: record2.revisionId,
    stateDigest: record2.stateDigest,
    result: record2.result
  };
}
function attach(revision, record2) {
  const { state, anchor } = splitPreVerifyReviewAnchor(revision.state);
  const anchorIsCurrent = anchor !== void 0 && anchor.revision === revision.revision && anchor.revisionId === revision.revisionId;
  const result = anchorIsCurrent && record2 !== void 0 ? record2.result : PRE_VERIFY_REVIEW_DEFAULT;
  if (record2 !== void 0 && (record2.revision !== revision.revision || record2.revisionId !== revision.revisionId || record2.stateDigest !== revision.stateDigest)) {
    throw new RunStateCorruptError("pre-Verify companion \u4E0E canonical revision \u8EAB\u4EFD/\u6458\u8981\u4E0D\u4E00\u81F4");
  }
  if (anchorIsCurrent && record2 !== void 0 && anchor.payloadDigest !== preVerifyReviewPayloadDigest(record2.revision, record2.revisionId, record2.result)) {
    throw new RunStateCorruptError("pre-Verify companion \u5185\u5BB9\u4E0E canonical anchor \u6458\u8981\u4E0D\u4E00\u81F4");
  }
  return {
    ...revision,
    state: {
      ...state,
      fields: {
        ...state.fields,
        [PRE_VERIFY_REVIEW_FIELD]: result
      }
    }
  };
}
async function publishPreVerifyReviewRecord(changeDir, revision, logicalState) {
  const dir = join6(changeDir, ".pipeline-run", PRE_VERIFY_REVIEW_DIR);
  await mkdir3(dir, { recursive: true });
  const target = join6(dir, preVerifyReviewFileName(revision.revision, revision.revisionId));
  await atomicLinkPublish(dir, ".tmp", target, `${JSON.stringify(recordFor(revision, logicalState))}
`);
}
async function hydratePreVerifyReview(changeDir, revision) {
  const target = join6(changeDir, preVerifyReviewRelativePath(revision.revision, revision.revisionId));
  let info;
  try {
    info = await lstat2(target);
  } catch (error) {
    if (errnoCode(error) === "ENOENT")
      return attach(revision);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new RunStateCorruptError(`${target}: pre-Verify companion \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6`);
  }
  return attach(revision, parseRecord(await readFile4(target, "utf8"), target));
}
function hydratePreVerifyReviewFromSync(readText, revision, sourceRoot = "canonical state") {
  const relative6 = preVerifyReviewRelativePath(revision.revision, revision.revisionId);
  const raw = readText(relative6);
  return attach(revision, raw === void 0 ? void 0 : parseRecord(raw, join6(sourceRoot, relative6)));
}

// packages/kernel/dist/state/run-revision-continuity.js
function assertRunMetadataContinuity(current, previous) {
  const before = previous.state.runMetadata;
  const after = current.state.runMetadata;
  if (current.mutation.kind === "transition") {
    if (after === void 0 || before !== void 0 && after.runId !== before.runId || after.transitionSequence !== (before?.transitionSequence ?? 0) + 1 || after.transitionHead !== current.mutation.transitionRecordId) {
      throw new RunStateCorruptError("transition revision \u7684 runMetadata head/sequence \u94FE\u4E0D\u8FDE\u7EED");
    }
    return;
  }
  if (before === void 0) {
    if (after !== void 0 && (after.transitionSequence !== 0 || after.transitionHead !== void 0)) {
      throw new RunStateCorruptError("\u975E transition revision \u4E0D\u5F97\u4F2A\u9020\u5386\u53F2 transition head");
    }
    return;
  }
  if (after === void 0 || after.runId !== before.runId || after.transitionSequence !== before.transitionSequence || after.transitionHead !== before.transitionHead) {
    throw new RunStateCorruptError("\u975E transition revision \u4E0D\u5F97\u6539\u5199 runMetadata head/sequence");
  }
}

// packages/kernel/dist/state/run-revision-store.js
var RUN_STATE_DIR = ".pipeline-run";
var RUN_CURRENT_FILE = "current.json";
var RUN_REVISIONS_DIR = "revisions";
var SAFE_ID_RE3 = /^[A-Za-z0-9_-]+$/;
function errnoCode2(error) {
  if (error === null || typeof error !== "object")
    return void 0;
  const record2 = Object.fromEntries(Object.entries(error));
  return typeof record2.code === "string" ? record2.code : void 0;
}
function stateStorageSourcePathSync(changeDir) {
  const current = join7(changeDir, RUN_STATE_DIR, RUN_CURRENT_FILE);
  try {
    lstatSync(current);
    return current;
  } catch (error) {
    if (errnoCode2(error) !== "ENOENT")
      throw error;
  }
  const legacy = join7(changeDir, ".pipeline.yaml");
  try {
    lstatSync(legacy);
    return legacy;
  } catch (error) {
    if (errnoCode2(error) === "ENOENT")
      return void 0;
    throw error;
  }
}
function stateStorageExistsSync(changeDir) {
  return stateStorageSourcePathSync(changeDir) !== void 0;
}
function ownRecord2(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return void 0;
  return Object.fromEntries(Object.entries(value));
}
function previousRevisionIdFor(revision) {
  if (revision.previousRevisionId === void 0) {
    throw new RunStateCorruptError("\u975E\u521D\u59CB revision \u7F3A previousRevisionId");
  }
  return revision.previousRevisionId;
}
function revisionFileName(revision, revisionId) {
  return `${String(revision).padStart(6, "0")}-${revisionId}.json`;
}
function assertTransitionRevisionLink(current, transition, raw, previous) {
  const observedDigest = createHash3("sha256").update(raw).digest("hex");
  if (observedDigest !== current.mutation.transitionRecordDigest) {
    throw new RunStateCorruptError("TransitionRecord digest \u4E0E canonical revision \u5BA1\u8BA1\u7ED1\u5B9A\u4E0D\u4E00\u81F4");
  }
  const metadata = current.state.runMetadata;
  if (metadata === void 0 || metadata.transitionHead === void 0 || metadata.transitionSequence < 1) {
    throw new RunStateCorruptError("transition revision \u7F3A canonical run head/sequence");
  }
  const record2 = ownRecord2(transition);
  if (record2 === void 0)
    throw new RunStateCorruptError("transition revision \u5F15\u7528\u7684 TransitionRecord \u7F3A\u5931");
  if (record2.id !== current.mutation.transitionRecordId || record2.sequence !== metadata.transitionSequence || record2.runId !== metadata.runId || previous !== void 0 && record2.previousRecordId !== previous.state.runMetadata?.transitionHead || JSON.stringify(record2.effects) !== JSON.stringify(current.mutation.effects)) {
    throw new RunStateCorruptError("transition revision \u4E0E TransitionRecord \u4E0D\u4E00\u81F4");
  }
}
function assertMutationEffects(current, previous) {
  const expected = diffWireFieldsToEffects(previous.state.fields, current.state.fields);
  if (JSON.stringify(current.mutation.effects) !== JSON.stringify(expected)) {
    throw new RunStateCorruptError("canonical mutation.effects \u4E0E previous\u2192current \u771F\u5B9E diff \u4E0D\u4E00\u81F4");
  }
  assertRunMetadataContinuity(current, previous);
}
async function assertTransitionRecordFile(changeDir, revision, previous) {
  if (revision.mutation.kind !== "transition")
    return void 0;
  const metadata = revision.state.runMetadata;
  if (metadata === void 0 || metadata.transitionHead === void 0 || metadata.transitionSequence < 1) {
    throw new RunStateCorruptError("transition revision \u7F3A canonical run head/sequence");
  }
  const transitionPath = join7(changeDir, TRANSITION_RECORDS_DIR, `${String(metadata.transitionSequence).padStart(6, "0")}-${revision.mutation.transitionRecordId}.json`);
  const transitionRaw = await readRegularTextIfExists(transitionPath);
  if (transitionRaw === void 0) {
    throw new RunStateCorruptError("transition revision \u5F15\u7528\u7684 TransitionRecord \u7F3A\u5931");
  }
  let transition;
  try {
    transition = JSON.parse(transitionRaw);
  } catch (error) {
    throw new RunStateCorruptError(`TransitionRecord \u635F\u574F: ${String(error)}`);
  }
  assertTransitionRevisionLink(revision, transition, transitionRaw, previous);
  return transition;
}
function projectionMetadataFor(revision) {
  return {
    stateRevision: revision.revision,
    stateRevisionId: revision.revisionId,
    stateDigest: revision.stateDigest
  };
}
async function publishInitialRunRevision(changeDir, state, observedAt, kind = "init") {
  const runDir = join7(changeDir, RUN_STATE_DIR);
  const revisionsDir = join7(runDir, RUN_REVISIONS_DIR);
  await mkdir4(revisionsDir, { recursive: true });
  const revision = createRunRevision({
    state,
    revision: 0,
    mutation: { kind, observedAt, effects: [] }
  });
  await publishPreVerifyReviewRecord(changeDir, revision, state);
  const raw = serializeRunRevision(revision);
  await atomicLinkPublish(revisionsDir, ".tmp", join7(revisionsDir, revisionFileName(revision.revision, revision.revisionId)), raw);
  await atomicLinkPublish(runDir, ".current.tmp", join7(runDir, RUN_CURRENT_FILE), raw);
  return revision;
}
async function publishRunRevision(changeDir, current, state, mutation) {
  const runDir = join7(changeDir, RUN_STATE_DIR);
  const revisionsDir = join7(runDir, RUN_REVISIONS_DIR);
  await mkdir4(revisionsDir, { recursive: true });
  let transitionRaw;
  let transition;
  let mutationWithDigest = mutation;
  if (mutation.kind === "transition") {
    const metadata = state.runMetadata;
    if (metadata === void 0 || metadata.transitionHead !== mutation.transitionRecordId || metadata.transitionSequence < 1) {
      throw new RunStateCorruptError("transition publish \u7F3A\u5339\u914D\u7684 canonical run head/sequence");
    }
    const transitionPath = join7(changeDir, TRANSITION_RECORDS_DIR, `${String(metadata.transitionSequence).padStart(6, "0")}-${mutation.transitionRecordId}.json`);
    transitionRaw = await readRegularTextIfExists(transitionPath);
    if (transitionRaw === void 0) {
      throw new RunStateCorruptError("transition publish \u5F15\u7528\u7684 TransitionRecord \u7F3A\u5931");
    }
    try {
      transition = JSON.parse(transitionRaw);
    } catch (error) {
      throw new RunStateCorruptError(`transition publish \u7684 TransitionRecord \u635F\u574F: ${String(error)}`);
    }
    mutationWithDigest = {
      ...mutation,
      transitionRecordDigest: createHash3("sha256").update(transitionRaw).digest("hex")
    };
  }
  const revision = createRunRevision({
    state,
    revision: current.revision + 1,
    previousRevisionId: current.revisionId,
    mutation: {
      ...mutationWithDigest,
      effects: diffWireFieldsToEffects(current.state.fields, state.fields)
    }
  });
  assertMutationEffects(revision, current);
  if (transitionRaw !== void 0) {
    assertTransitionRevisionLink(revision, transition, transitionRaw, current);
  }
  await publishPreVerifyReviewRecord(changeDir, revision, state);
  const raw = serializeRunRevision(revision);
  await atomicLinkPublish(revisionsDir, ".tmp", join7(revisionsDir, revisionFileName(revision.revision, revision.revisionId)), raw);
  await atomicReplaceFile(join7(runDir, RUN_CURRENT_FILE), raw);
  return revision;
}
async function readCurrentRunRevision(changeDir) {
  const currentPath = join7(changeDir, RUN_STATE_DIR, RUN_CURRENT_FILE);
  const raw = await readRegularTextIfExists(currentPath);
  if (raw === void 0)
    return void 0;
  const current = await hydratePreVerifyReview(changeDir, parseRunRevision(raw, currentPath));
  const immutablePath = join7(changeDir, RUN_STATE_DIR, RUN_REVISIONS_DIR, revisionFileName(current.revision, current.revisionId));
  const immutableRaw = await readRegularTextIfExists(immutablePath);
  if (immutableRaw === void 0) {
    throw new RunStateCorruptError(`current \u5F15\u7528\u7684 immutable revision \u7F3A\u5931: ${immutablePath}`);
  }
  await hydratePreVerifyReview(changeDir, parseRunRevision(immutableRaw, immutablePath));
  if (immutableRaw !== raw)
    throw new RunStateCorruptError("current \u4E0E immutable revision \u5B57\u8282\u4E0D\u4E00\u81F4");
  let previous;
  if (current.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(current);
    previous = await readImmutableRunRevision(changeDir, current.revision - 1, previousRevisionId);
    if (previous === void 0) {
      throw new RunStateCorruptError("current \u5F15\u7528\u7684 previous revision \u7F3A\u5931");
    }
    if (previous.revisionId !== previousRevisionId || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError("current \u5F15\u7528\u7684 previous revision \u8EAB\u4EFD\u4E0D\u4E00\u81F4");
    }
    assertMutationEffects(current, previous);
  }
  await assertTransitionRecordFile(changeDir, current, previous);
  return current;
}
async function validateCanonicalRevisionHistory(changeDir) {
  let cursor = await readCurrentRunRevision(changeDir);
  if (cursor === void 0)
    return;
  while (cursor.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(cursor);
    const previous = await readImmutableRunRevision(changeDir, cursor.revision - 1, previousRevisionId);
    if (previous === void 0) {
      throw new RunStateCorruptError(`canonical history revision ${cursor.revision - 1} \u7F3A\u5931`);
    }
    if (previous.revision !== cursor.revision - 1 || previous.revisionId !== previousRevisionId) {
      throw new RunStateCorruptError("canonical history previous revision \u8EAB\u4EFD\u4E0D\u4E00\u81F4");
    }
    assertMutationEffects(cursor, previous);
    await assertTransitionRecordFile(changeDir, cursor, previous);
    cursor = previous;
  }
}
async function readRegularTextIfExists(pathname) {
  let entry;
  try {
    entry = await lstat3(pathname);
  } catch (error) {
    if (errnoCode2(error) === "ENOENT")
      return void 0;
    throw error;
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new RunStateCorruptError(`${pathname}: canonical \u6587\u4EF6\u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6`);
  }
  try {
    return await readFile5(pathname, "utf8");
  } catch (error) {
    if (errnoCode2(error) === "ENOENT") {
      throw new RunStateCorruptError(`${pathname}: canonical \u6587\u4EF6\u5728\u6821\u9A8C\u671F\u95F4\u6D88\u5931`);
    }
    throw error;
  }
}
function readCurrentRunRevisionFromSync(readText, sourceRoot = "canonical state") {
  const currentRel = join7(RUN_STATE_DIR, RUN_CURRENT_FILE);
  const raw = readText(currentRel);
  if (raw === void 0)
    return void 0;
  const currentSource = join7(sourceRoot, currentRel);
  const current = hydratePreVerifyReviewFromSync(readText, parseRunRevision(raw, currentSource), sourceRoot);
  const revisionsRel = join7(RUN_STATE_DIR, RUN_REVISIONS_DIR);
  const immutableRel = join7(revisionsRel, revisionFileName(current.revision, current.revisionId));
  const immutableRaw = readText(immutableRel);
  if (immutableRaw === void 0) {
    throw new RunStateCorruptError(`current \u5F15\u7528\u7684 immutable revision \u7F3A\u5931: ${join7(sourceRoot, immutableRel)}`);
  }
  hydratePreVerifyReviewFromSync(readText, parseRunRevision(immutableRaw, join7(sourceRoot, immutableRel)), sourceRoot);
  if (immutableRaw !== raw)
    throw new RunStateCorruptError("current \u4E0E immutable revision \u5B57\u8282\u4E0D\u4E00\u81F4");
  let previous;
  if (current.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(current);
    const previousRel = join7(revisionsRel, revisionFileName(current.revision - 1, previousRevisionId));
    const previousRaw = readText(previousRel);
    if (previousRaw === void 0)
      throw new RunStateCorruptError("current \u5F15\u7528\u7684 previous revision \u7F3A\u5931");
    previous = hydratePreVerifyReviewFromSync(readText, parseRunRevision(previousRaw, join7(sourceRoot, previousRel)), sourceRoot);
    if (previous.revisionId !== previousRevisionId || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError("current \u5F15\u7528\u7684 previous revision \u8EAB\u4EFD\u4E0D\u4E00\u81F4");
    }
    assertMutationEffects(current, previous);
  }
  if (current.mutation.kind === "transition") {
    const metadata = current.state.runMetadata;
    if (metadata === void 0) {
      throw new RunStateCorruptError("transition revision \u7F3A canonical run metadata");
    }
    const transitionRel = join7(TRANSITION_RECORDS_DIR, `${String(metadata.transitionSequence).padStart(6, "0")}-${current.mutation.transitionRecordId}.json`);
    const transitionRaw = readText(transitionRel);
    if (transitionRaw === void 0) {
      throw new RunStateCorruptError("transition revision \u5F15\u7528\u7684 TransitionRecord \u7F3A\u5931");
    }
    let transition;
    try {
      transition = JSON.parse(transitionRaw);
    } catch (error) {
      throw new RunStateCorruptError(`TransitionRecord \u635F\u574F: ${String(error)}`);
    }
    assertTransitionRevisionLink(current, transition, transitionRaw, previous);
  }
  return current;
}
async function readImmutableRunRevision(changeDir, revision, revisionId) {
  if (!Number.isSafeInteger(revision) || revision < 0 || !SAFE_ID_RE3.test(revisionId))
    return void 0;
  const pathname = join7(changeDir, RUN_STATE_DIR, RUN_REVISIONS_DIR, revisionFileName(revision, revisionId));
  const raw = await readRegularTextIfExists(pathname);
  return raw === void 0 ? void 0 : hydratePreVerifyReview(changeDir, parseRunRevision(raw, pathname));
}

// packages/kernel/dist/state/state-projection-codec.js
function metadataFor(revision) {
  return {
    stateRevision: revision.revision,
    stateRevisionId: revision.revisionId,
    stateDigest: revision.stateDigest
  };
}
function projectionContent(revision) {
  return serializePipeline({
    ...rollbackCompatibleState(revision),
    projectionMetadata: metadataFor(revision)
  }, { omitPreVerifyReview: true });
}
function priorLogicalProjectionContent(revision) {
  return serializePipeline({
    ...structuredClone(revision.state),
    projectionMetadata: metadataFor(revision)
  });
}

// packages/kernel/dist/state/state-init.js
import { readFile as readFile6, stat as stat2 } from "node:fs/promises";
import path2 from "node:path";

// packages/kernel/dist/workflow/default-workflow.generated.js
var DEFAULT_WORKFLOW_SOURCE = "name: default\nsteps:\n  - id: open\n    label: \u7ACB\u9879\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: open-complete\n        to: explore\n  - id: explore\n    label: \u8C03\u7814\n    gate: review\n    skills: []\n    inputs: []\n    outputs:\n      - field: design_doc\n        type: file_path\n    artifacts:\n      - field: design_doc\n        type: file_path\n        producer_policy: effective-phase-skills\n    guards: []\n    transitions:\n      - event: explore-complete\n        to: spec\n  - id: spec\n    label: \u89C4\u683C\n    gate: review\n    skills: []\n    inputs:\n      - field: design_doc\n        type: file_path\n    outputs:\n      - field: plan\n        type: file_path\n    artifacts:\n      - field: plan\n        type: file_path\n        producer_policy: effective-phase-skills\n        required_when:\n          track_not_in: [pm]\n    guards:\n      - type: tasks-at-least\n        n: 3\n    transitions:\n      - event: spec-complete\n        to: build\n        actions:\n          - type: reset-pre-verify-review\n  - id: build\n    label: \u5B9E\u73B0\n    gate: null\n    skills: []\n    inputs:\n      - field: design_doc\n        type: file_path\n      - field: plan\n        type: file_path\n    outputs:\n      - field: build_sha\n        type: string\n    guards:\n      - type: field-equals\n        field: pre_verify_review_result\n        value: pass\n    transitions:\n      - event: build-complete\n        to: verify\n      - event: requirements-changed\n        to: spec\n        actions:\n          - type: reset-pre-verify-review\n  - id: verify\n    label: \u9A8C\u8BC1\n    gate: review\n    skills: []\n    inputs:\n      - field: build_sha\n        type: string\n    outputs:\n      - field: verification_report\n        type: file_path\n    artifacts:\n      - field: verification_report\n        type: file_path\n        producer_policy: effective-phase-skills\n    guards: []\n    transitions:\n      - event: verify-pass\n        to: ship\n      - event: verify-fail\n        to: build\n        actions:\n          - type: mark-verification-failed\n          - type: reset-pre-verify-review\n  - id: ship\n    label: \u4EA4\u4ED8\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards:\n      - type: spec-migration-applied\n    transitions:\n      - event: ship-complete\n        to: archive\n  - id: archive\n    label: \u5F52\u6863\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions: []\n";
var DEFAULT_WORKFLOW_STEPS = [
  { id: "open", label: "\u7ACB\u9879" },
  { id: "explore", label: "\u8C03\u7814" },
  { id: "spec", label: "\u89C4\u683C" },
  { id: "build", label: "\u5B9E\u73B0" },
  { id: "verify", label: "\u9A8C\u8BC1" },
  { id: "ship", label: "\u4EA4\u4ED8" },
  { id: "archive", label: "\u5F52\u6863" }
];

// packages/kernel/dist/workflow/builtin-workflows.js
var SIMPLE_WORKFLOW = {
  name: "simple",
  steps: [
    {
      id: "change",
      label: "Change",
      gate: null,
      skills: [{ id: "simple-task" }],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [
        { event: "change-complete", to: "verify" },
        { event: "scope-expanded", to: "escalated", actions: [{ type: "archive-run" }] }
      ]
    },
    {
      id: "verify",
      label: "Verify",
      gate: null,
      skills: [{ id: "verification-before-completion" }],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [
        {
          event: "verify-pass",
          to: "done",
          actions: [{ type: "mark-verification-passed" }, { type: "archive-run" }]
        },
        { event: "verify-fail", to: "change", actions: [{ type: "mark-verification-failed" }] },
        { event: "scope-expanded", to: "escalated", actions: [{ type: "archive-run" }] }
      ]
    },
    {
      id: "done",
      label: "Done",
      gate: null,
      skills: [],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: []
    },
    {
      id: "escalated",
      label: "Escalated",
      gate: null,
      skills: [],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: []
    }
  ]
};
function builtinWorkflow(name) {
  if (name !== "simple")
    return null;
  return structuredClone(SIMPLE_WORKFLOW);
}

// packages/kernel/dist/workflow/types.js
var GUARD_DATA_KEYS = {
  "tasks-at-least": ["n"],
  "nonempty-output": [],
  "field-nonempty": ["field"],
  "file-exists": ["path"],
  "field-equals": ["field", "value"],
  "field-in": ["field", "values"],
  "full-direct-override": [],
  "build-head-unchanged": ["field"],
  "spec-migration-applied": []
};

// packages/kernel/dist/text/representable.js
var LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
var CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/;
function stringUnrepresentableReason(s) {
  if (s === "")
    return "\u4E0D\u5F97\u4E3A\u7A7A\u4E32\uFF08\u7A84\u884C\u5E8F\u5217\u5316\u7684\u503C\u6355\u83B7\u8BFB\u4E0D\u56DE\u96F6\u5B57\u7B26\uFF09";
  if (CONTROL_RE.test(s))
    return "\u542B\u63A7\u5236\u5B57\u7B26\uFF08\u6362\u884C/\u56DE\u8F66/tab \u7B49\uFF09\uFF0C\u7834\u574F\u884C\u7ED3\u6784\u6216\u8D85\u51FA\u7A84\u5E8F\u5217\u5316\u5B50\u96C6";
  if (s !== s.trim())
    return "\u542B\u9996\u5C3E\u7A7A\u767D\uFF0C\u8BFB\u56DE\u65F6\u88AB trim \u4E22\u5931";
  if (LONE_SURROGATE_RE.test(s))
    return "\u542B\u672A\u914D\u5BF9 UTF-16 surrogate\uFF0CUTF-8 \u843D\u76D8\u4F1A\u88AB\u66FF\u6362\u6210 U+FFFD\uFF0C\u65E0\u6CD5\u5F80\u8FD4";
  return null;
}

// packages/kernel/dist/workflow/representable.js
var LINE_PARAGRAPH_SEP_RE = /[\u2028\u2029]/;
function fieldEqualsValueUnrepresentableReason(value) {
  const generic = stringUnrepresentableReason(value);
  if (generic)
    return `field-equals \u7684 value ${generic}`;
  if (LINE_PARAGRAPH_SEP_RE.test(value)) {
    return "field-equals \u7684 value \u542B U+2028/U+2029 \u884C/\u6BB5\u5206\u9694\u7B26\uFF0Cparse \u7684 (.+?) \u8BFB\u4E0D\u56DE\uFF08. \u4E0D\u5339\u914D\u884C\u5206\u9694\u7B26\uFF09";
  }
  return null;
}

// packages/kernel/dist/workflow/compile-guards.js
var KNOWN_FIELDS2 = new Set(FIELD_ORDER);
var LIST_FIELD_SET3 = new Set(LIST_FIELDS);
var WHEN_ALLOWED_KEYS = /* @__PURE__ */ new Set(["kind", "values"]);
var PATH_ALLOWED_KEYS = /* @__PURE__ */ new Set(["kind", "field"]);
function compileError(path7, message) {
  throw new Error(`compileWorkflow: ${path7}: ${message}`);
}
function asRecord(value, path7) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    compileError(path7, `\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u5B9E\u9645 ${JSON.stringify(value)}\uFF09`);
  }
  return value;
}
function asArray(value, path7) {
  if (!Array.isArray(value))
    compileError(path7, `\u5FC5\u987B\u662F\u6570\u7EC4\uFF08\u5B9E\u9645 ${JSON.stringify(value)}\uFF09`);
  return value;
}
function rejectExtraKeys(record2, allowed, path7) {
  for (const key of Object.keys(record2)) {
    if (!allowed.has(key)) {
      compileError(path7, `\u51FA\u73B0\u8BE5\u53D8\u4F53\u4E0D\u63A5\u53D7\u7684\u9644\u52A0\u952E '${key}'\uFF08\u95ED\u96C6\uFF1A${[...allowed].join("/")}\uFF09`);
    }
  }
}
function stringArray(value, path7) {
  return asArray(value, path7).map((item2, index) => {
    if (typeof item2 !== "string") {
      compileError(`${path7}[${index}]`, `\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(item2)}\uFF09`);
    }
    return item2;
  });
}
function knownField(value, path7) {
  if (typeof value !== "string" || !KNOWN_FIELDS2.has(value)) {
    compileError(path7, `'${String(value)}' \u4E0D\u662F\u5DF2\u77E5\u72B6\u6001\u5B57\u6BB5\uFF08../types.ts FIELD_ORDER \u95ED\u96C6\uFF09`);
  }
  return value;
}
function scalarField(value, path7) {
  const field = knownField(value, path7);
  if (LIST_FIELD_SET3.has(field)) {
    compileError(path7, `'${field}' \u662F\u5217\u8868\u5B57\u6BB5\uFF08../types.ts LIST_FIELDS\uFF09\uFF0Cscalar guard \u4E0D\u5B9A\u4E49\u5217\u8868\u8BED\u4E49`);
  }
  return field;
}
function compileWhen(value, path7) {
  if (value === void 0)
    return void 0;
  const record2 = asRecord(value, path7);
  if (record2.kind !== "track-in" && record2.kind !== "track-not-in") {
    compileError(`${path7}.kind`, `\u5FC5\u987B\u662F 'track-in' | 'track-not-in'\uFF08\u5B9E\u9645 ${JSON.stringify(record2.kind)}\uFF09`);
  }
  const values = stringArray(record2.values, `${path7}.values`);
  rejectExtraKeys(record2, WHEN_ALLOWED_KEYS, path7);
  return { kind: record2.kind, values };
}
function withWhen(config, when) {
  return when === void 0 ? config : { ...config, when };
}
function compileGuard(raw, path7, outputs) {
  const record2 = asRecord(raw, path7);
  if (typeof record2.type === "string" && Object.prototype.hasOwnProperty.call(GUARD_DATA_KEYS, record2.type)) {
    const dataKeys = GUARD_DATA_KEYS[record2.type];
    rejectExtraKeys(record2, /* @__PURE__ */ new Set(["type", "when", ...dataKeys]), path7);
  }
  const when = compileWhen(record2.when, `${path7}.when`);
  switch (record2.type) {
    case "tasks-at-least": {
      const n = record2.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        compileError(`${path7}.n`, `\u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570\uFF08parse.ts \u7684 \\d+ \u53E3\u5F84\uFF1B\u5B9E\u9645 ${JSON.stringify(n)}\uFF09`);
      }
      return [withWhen({ type: "tasks-at-least", n }, when)];
    }
    case "nonempty-output":
      return outputs.map((output) => KNOWN_FIELDS2.has(output.field) && !LIST_FIELD_SET3.has(output.field) ? withWhen({ type: "field-nonempty", field: output.field }, when) : withWhen({ type: "output-present", field: output.field }, when));
    case "field-nonempty":
      return [withWhen({
        type: "field-nonempty",
        field: scalarField(record2.field, `${path7}.field`)
      }, when)];
    case "file-exists": {
      const target = asRecord(record2.path, `${path7}.path`);
      if (target.kind !== "field") {
        compileError(`${path7}.path.kind`, `\u5FC5\u987B\u662F 'field'\uFF08\u5B9E\u9645 ${JSON.stringify(target.kind)}\uFF09`);
      }
      const field = scalarField(target.field, `${path7}.path.field`);
      rejectExtraKeys(target, PATH_ALLOWED_KEYS, `${path7}.path`);
      return [withWhen({ type: "file-exists", path: { kind: "field", field } }, when)];
    }
    case "field-equals": {
      const value = record2.value;
      if (typeof value !== "string") {
        compileError(`${path7}.value`, `\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(value)}\uFF09`);
      }
      const unrepresentable = fieldEqualsValueUnrepresentableReason(value);
      if (unrepresentable)
        compileError(`${path7}.value`, unrepresentable);
      return [withWhen({
        type: "field-equals",
        field: scalarField(record2.field, `${path7}.field`),
        value
      }, when)];
    }
    case "field-in": {
      const values = stringArray(record2.values, `${path7}.values`);
      if (values.length === 0)
        compileError(`${path7}.values`, "\u4E0D\u5F97\u662F\u7A7A\u6570\u7EC4\uFF08\u81F3\u5C11\u4E00\u4E2A\u5408\u6CD5\u503C\uFF09");
      return [withWhen({
        type: "field-in",
        field: scalarField(record2.field, `${path7}.field`),
        values
      }, when)];
    }
    case "full-direct-override":
      return [withWhen({ type: "full-direct-override" }, when)];
    case "build-head-unchanged":
      if (record2.field !== "build_sha") {
        compileError(`${path7}.field`, `\u5FC5\u987B\u662F 'build_sha'\uFF08barrier \u53EA\u5B9A\u4E49\u5728 build \u51BB\u7ED3 SHA \u4E0A\uFF1B\u5B9E\u9645 ${JSON.stringify(record2.field)}\uFF09`);
      }
      return [withWhen({ type: "build-head-unchanged", field: "build_sha" }, when)];
    case "spec-migration-applied":
      return [withWhen({ type: "spec-migration-applied" }, when)];
    default:
      compileError(`${path7}.type`, `\u672A\u77E5 guard type ${JSON.stringify(record2.type)}\uFF08\u95ED\u96C6\u89C1 types.ts WorkflowGuardConfig\uFF09`);
  }
}
function compileGuards(raw, path7, outputs) {
  if (raw === void 0)
    return [];
  return asArray(raw, path7).flatMap((guard, index) => compileGuard(guard, `${path7}[${index}]`, outputs));
}

// packages/kernel/dist/workflow/compile.js
var KNOWN_FIELDS3 = new Set(FIELD_ORDER);
var FIELD_TYPES = ["string", "file_path", "boolean"];
var ACTION_TYPES = /* @__PURE__ */ new Set([
  "freeze-build-sha",
  "reset-pre-verify-review",
  "mark-verification-passed",
  "mark-verification-failed",
  "archive-run"
]);
var PRODUCER_POLICIES = /* @__PURE__ */ new Set(["effective-step-skills", "effective-phase-skills"]);
var CUSTOM_PRODUCER_POLICIES = /* @__PURE__ */ new Set(["effective-step-skills"]);
var DEFAULT_PRODUCER_POLICIES = /* @__PURE__ */ new Set(["effective-step-skills", "effective-phase-skills"]);
var WORKFLOW_KEYS = /* @__PURE__ */ new Set(["name", "openspecContract", "documentContract", "steps"]);
var STEP_KEYS = /* @__PURE__ */ new Set([
  "id",
  "label",
  "gate",
  "prompt",
  "skills",
  "inputs",
  "outputs",
  "artifacts",
  "guards",
  "transitions"
]);
var SKILL_KEYS = /* @__PURE__ */ new Set(["id", "depends_on"]);
var FIELD_REF_KEYS = /* @__PURE__ */ new Set(["field", "type"]);
var ARTIFACT_KEYS = /* @__PURE__ */ new Set(["field", "type", "kind", "producerPolicy", "requiredWhen"]);
var TRANSITION_KEYS2 = /* @__PURE__ */ new Set(["event", "to", "guards", "actions"]);
var ACTION_KEYS = /* @__PURE__ */ new Set(["type"]);
var DOCUMENT_CONTRACT_KEYS = /* @__PURE__ */ new Set(["version", "slots", "reads"]);
var DOCUMENT_SLOT_KEYS = /* @__PURE__ */ new Set(["kind", "ownerStep", "producers"]);
var DOCUMENT_READ_KEYS = /* @__PURE__ */ new Set(["step", "kinds"]);
function compileError2(path7, msg) {
  throw new Error(`compileWorkflow: ${path7}: ${msg}`);
}
function asRecord2(v, path7) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    compileError2(path7, `\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u5B9E\u9645 ${JSON.stringify(v)}\uFF09`);
  }
  return v;
}
function asArray2(v, path7) {
  if (!Array.isArray(v))
    compileError2(path7, `\u5FC5\u987B\u662F\u6570\u7EC4\uFF08\u5B9E\u9645 ${JSON.stringify(v)}\uFF09`);
  return v;
}
function rejectExtraKeys2(rec, allowed, path7) {
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      compileError2(path7, `\u51FA\u73B0\u8BE5\u53D8\u4F53\u4E0D\u63A5\u53D7\u7684\u9644\u52A0\u952E '${key}'\uFF08\u95ED\u96C6\uFF1A${[...allowed].join("/")}\uFF09`);
    }
  }
}
function nonemptyString(v, path7) {
  if (typeof v !== "string" || v === "")
    compileError2(path7, `\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(v)}\uFF09`);
  return v;
}
function stringArray2(v, path7) {
  const arr = asArray2(v, path7);
  return arr.map((x, i) => {
    if (typeof x !== "string")
      compileError2(`${path7}[${i}]`, `\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(x)}\uFF09`);
    return x;
  });
}
function knownField2(value, path7) {
  if (typeof value !== "string" || !KNOWN_FIELDS3.has(value)) {
    compileError2(path7, `'${String(value)}' \u4E0D\u662F\u5DF2\u77E5\u72B6\u6001\u5B57\u6BB5\uFF08../types.ts FIELD_ORDER \u95ED\u96C6\uFF09`);
  }
  return value;
}
function compileAction(raw, path7) {
  const rec = asRecord2(raw, path7);
  rejectExtraKeys2(rec, ACTION_KEYS, path7);
  if (typeof rec.type !== "string" || !ACTION_TYPES.has(rec.type)) {
    compileError2(`${path7}.type`, `\u672A\u77E5 action type ${JSON.stringify(rec.type)}\uFF08\u95ED\u96C6\u89C1 ir.ts ActionConfig\uFF09`);
  }
  return { type: rec.type };
}
function compileActions(raw, path7) {
  if (raw === void 0)
    return [];
  return asArray2(raw, path7).map((a, j) => compileAction(a, `${path7}[${j}]`));
}
function compileFieldRef(raw, path7) {
  const rec = asRecord2(raw, path7);
  rejectExtraKeys2(rec, FIELD_REF_KEYS, path7);
  const type = rec.type;
  if (type !== "string" && type !== "file_path" && type !== "boolean") {
    compileError2(`${path7}.type`, `\u5FC5\u987B\u662F ${FIELD_TYPES.join(" | ")}\uFF08\u5B9E\u9645 ${JSON.stringify(type)}\uFF09`);
  }
  const field = nonemptyString(rec.field, `${path7}.field`);
  return { field, type };
}
function compileSkillRef(raw, path7) {
  const rec = asRecord2(raw, path7);
  rejectExtraKeys2(rec, SKILL_KEYS, path7);
  const id = nonemptyString(rec.id, `${path7}.id`);
  if (rec.depends_on === void 0)
    return { id };
  return { id, depends_on: stringArray2(rec.depends_on, `${path7}.depends_on`) };
}
function compileArtifact(raw, path7, outputs, allowedPolicies) {
  const rec = asRecord2(raw, path7);
  rejectExtraKeys2(rec, ARTIFACT_KEYS, path7);
  if (rec.type !== void 0 && rec.type !== "file_path") {
    compileError2(`${path7}.type`, `\u5FC5\u987B\u662F 'file_path'\uFF08\u5B9E\u9645 ${JSON.stringify(rec.type)}\uFF09`);
  }
  if (rec.kind !== void 0 && rec.kind !== "file") {
    compileError2(`${path7}.kind`, `\u5FC5\u987B\u662F 'file'\uFF08\u5B9E\u9645 ${JSON.stringify(rec.kind)}\uFF09`);
  }
  if (rec.producerPolicy !== void 0) {
    if (typeof rec.producerPolicy !== "string" || !PRODUCER_POLICIES.has(rec.producerPolicy)) {
      compileError2(`${path7}.producerPolicy`, `\u5FC5\u987B\u662F ${[...PRODUCER_POLICIES].map((p) => `'${p}'`).join(" | ")}\uFF08\u5B9E\u9645 ${JSON.stringify(rec.producerPolicy)}\uFF09`);
    }
    if (!allowedPolicies.has(rec.producerPolicy)) {
      compileError2(`${path7}.producerPolicy`, `custom workflow \u4E0D\u5141\u8BB8 producerPolicy '${rec.producerPolicy}'\uFF08A \u5951\u7EA6\uFF1Acustom artifact \u53EA\u80FD ${[...allowedPolicies].map((p) => `'${p}'`).join(" | ")}\uFF1Beffective-phase-skills \u4EC5 default \u8F68\u9002\u7528\uFF09`);
    }
  }
  const producerPolicy = rec.producerPolicy ?? "effective-step-skills";
  const field = knownField2(rec.field, `${path7}.field`);
  const ref = outputs.find((o) => o.field === field);
  if (!ref) {
    compileError2(`${path7}.field`, `artifact \u53EA\u80FD\u6302\u5728\u672C step outputs \u58F0\u660E\u7684\u5B57\u6BB5\u4E0A\uFF08'${field}' \u4E0D\u5728 outputs \u91CC\uFF09`);
  }
  if (ref.type !== "file_path") {
    compileError2(`${path7}.field`, `artifact \u53EA\u8BB8\u6302 type:'file_path' \u7684 FieldRef\uFF08'${field}' \u58F0\u660E\u4E3A '${ref.type}'\uFF09`);
  }
  const requiredWhen = compileWhen(rec.requiredWhen, `${path7}.requiredWhen`);
  const base = { kind: "file", field, producerPolicy };
  return requiredWhen === void 0 ? base : { ...base, requiredWhen };
}
function compileArtifacts(rawExplicit, path7, outputs, outputsPath, allowedPolicies) {
  const byField = /* @__PURE__ */ new Map();
  outputs.forEach((o, j) => {
    if (o.type !== "file_path")
      return;
    if (!KNOWN_FIELDS3.has(o.field))
      return;
    const field = o.field;
    if (byField.has(field)) {
      compileError2(`${outputsPath}[${j}].field`, `'${field}' \u91CD\u590D\u58F0\u660E\uFF08\u540C field \u7684 file_path output \u5DF2\u5728\u524D\u9762\u51FA\u73B0\uFF09`);
    }
    byField.set(field, { kind: "file", field, producerPolicy: "effective-step-skills" });
  });
  if (rawExplicit !== void 0) {
    const seen = /* @__PURE__ */ new Set();
    asArray2(rawExplicit, path7).forEach((a, j) => {
      const artifact = compileArtifact(a, `${path7}[${j}]`, outputs, allowedPolicies);
      if (seen.has(artifact.field)) {
        compileError2(`${path7}[${j}].field`, `'${artifact.field}' \u91CD\u590D\u58F0\u660E`);
      }
      seen.add(artifact.field);
      byField.set(artifact.field, artifact);
    });
  }
  return [...byField.values()];
}
function compileTransition(raw, path7, outputs) {
  const rec = asRecord2(raw, path7);
  rejectExtraKeys2(rec, TRANSITION_KEYS2, path7);
  return {
    event: nonemptyString(rec.event, `${path7}.event`),
    to: nonemptyString(rec.to, `${path7}.to`),
    guards: compileGuards(rec.guards, `${path7}.guards`, outputs),
    actions: compileActions(rec.actions, `${path7}.actions`)
  };
}
function compileStep(step, index, allowedPolicies) {
  const path7 = `steps[${index}]`;
  const rec = asRecord2(step, path7);
  rejectExtraKeys2(rec, STEP_KEYS, path7);
  const id = nonemptyString(rec.id, `${path7}.id`);
  if (typeof rec.label !== "string")
    compileError2(`${path7}.label`, `\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(rec.label)}\uFF09`);
  const gate = rec.gate;
  if (gate !== null && gate !== "review" && gate !== "confirm") {
    compileError2(`${path7}.gate`, `\u5FC5\u987B\u662F null | 'review' | 'confirm'\uFF08\u5B9E\u9645 ${JSON.stringify(gate)}\uFF09`);
  }
  const prompt = rec.prompt;
  if (prompt !== void 0) {
    if (typeof prompt !== "string")
      compileError2(`${path7}.prompt`, `\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5B9E\u9645 ${JSON.stringify(prompt)}\uFF09`);
    if (prompt.includes("\0"))
      compileError2(`${path7}.prompt`, "\u4E0D\u5F97\u542B NUL\uFF08\u73AF\u5883\u4E0E\u5B50\u8FDB\u7A0B\u53C2\u6570\u65E0\u6CD5\u4FDD\u771F\u627F\u8F7D\uFF09");
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(prompt)) {
      compileError2(`${path7}.prompt`, "\u542B\u672A\u914D\u5BF9 UTF-16 surrogate\uFF0CUTF-8 \u843D\u76D8\u65E0\u6CD5\u5F80\u8FD4");
    }
  }
  const skills = asArray2(rec.skills, `${path7}.skills`).map((s, j) => compileSkillRef(s, `${path7}.skills[${j}]`));
  const inputs = asArray2(rec.inputs, `${path7}.inputs`).map((r, j) => compileFieldRef(r, `${path7}.inputs[${j}]`));
  const outputs = asArray2(rec.outputs, `${path7}.outputs`).map((r, j) => compileFieldRef(r, `${path7}.outputs[${j}]`));
  const guards = compileGuards(rec.guards, `${path7}.guards`, outputs);
  const artifacts = compileArtifacts(rec.artifacts, `${path7}.artifacts`, outputs, `${path7}.outputs`, allowedPolicies);
  const transitions = asArray2(rec.transitions, `${path7}.transitions`).map((t, j) => compileTransition(t, `${path7}.transitions[${j}]`, outputs));
  const transitionEvents = /* @__PURE__ */ new Set();
  transitions.forEach((transition, transitionIndex) => {
    if (transitionEvents.has(transition.event)) {
      compileError2(`${path7}.transitions[${transitionIndex}].event`, `\u540C\u4E00\u6B65\u4E0D\u5F97\u91CD\u590D\u58F0\u660E event '${transition.event}'`);
    }
    transitionEvents.add(transition.event);
  });
  return {
    id,
    label: rec.label,
    gate,
    ...prompt === void 0 ? {} : { prompt },
    skills,
    inputs,
    outputs,
    guards,
    artifacts,
    transitions
  };
}
function compileNonemptyStringArray(value, path7) {
  return asArray2(value, path7).map((item2, index) => nonemptyString(item2, `${path7}[${index}]`));
}
function compileDocumentContract(value) {
  if (value === void 0)
    return void 0;
  const rec = asRecord2(value, "documentContract");
  rejectExtraKeys2(rec, DOCUMENT_CONTRACT_KEYS, "documentContract");
  if (rec.version !== "v1") {
    compileError2("documentContract.version", `\u5FC5\u987B\u662F 'v1'\uFF08\u5B9E\u9645 ${JSON.stringify(rec.version)}\uFF09`);
  }
  const slots = asArray2(rec.slots, "documentContract.slots").map((slot, index) => {
    const item2 = asRecord2(slot, `documentContract.slots[${index}]`);
    rejectExtraKeys2(item2, DOCUMENT_SLOT_KEYS, `documentContract.slots[${index}]`);
    return {
      kind: nonemptyString(item2.kind, `documentContract.slots[${index}].kind`),
      ownerStep: nonemptyString(item2.ownerStep, `documentContract.slots[${index}].ownerStep`),
      producers: compileNonemptyStringArray(item2.producers, `documentContract.slots[${index}].producers`)
    };
  });
  if (slots.length === 0)
    compileError2("documentContract.slots", "\u4E0D\u5F97\u4E3A\u7A7A");
  const reads = asArray2(rec.reads, "documentContract.reads").map((read, index) => {
    const item2 = asRecord2(read, `documentContract.reads[${index}]`);
    rejectExtraKeys2(item2, DOCUMENT_READ_KEYS, `documentContract.reads[${index}]`);
    const kinds = compileNonemptyStringArray(item2.kinds, `documentContract.reads[${index}].kinds`);
    if (kinds.length === 0)
      compileError2(`documentContract.reads[${index}].kinds`, "\u4E0D\u5F97\u4E3A\u7A7A");
    return {
      step: nonemptyString(item2.step, `documentContract.reads[${index}].step`),
      kinds
    };
  });
  return { version: "v1", slots, reads };
}
function deepFreeze2(value) {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze2(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}
function compileWith(def, allowedPolicies) {
  const rec = asRecord2(def, "workflow");
  rejectExtraKeys2(rec, WORKFLOW_KEYS, "workflow");
  const name = nonemptyString(rec.name, "name");
  const openspecContract = rec.openspecContract;
  if (openspecContract !== void 0 && openspecContract !== "required") {
    compileError2("openspecContract", `\u5FC5\u987B\u662F 'required'\uFF08\u5B9E\u9645 ${JSON.stringify(openspecContract)}\uFF09`);
  }
  const documentContract = compileDocumentContract(rec.documentContract);
  if (openspecContract !== void 0 && documentContract !== void 0) {
    compileError2("documentContract", "\u4E0D\u5F97\u4E0E openspecContract \u540C\u65F6\u58F0\u660E");
  }
  const steps = asArray2(rec.steps, "steps").map((s, i) => compileStep(s, i, allowedPolicies));
  return deepFreeze2({
    name,
    ...openspecContract === void 0 ? {} : { openspecContract },
    ...documentContract === void 0 ? {} : { documentContract },
    steps
  });
}
function compileWorkflow(def) {
  return compileWith(def, CUSTOM_PRODUCER_POLICIES);
}
function decodeWorkflowDef(value) {
  compileWorkflow(value);
  return value;
}
function compileDefaultWorkflow(def) {
  return compileWith(def, DEFAULT_PRODUCER_POLICIES);
}

// packages/kernel/dist/workflow/document-contract-validation.js
var CANONICAL_TRANSITIONS = {
  open: ["explore"],
  explore: ["spec"],
  spec: ["build"],
  build: ["verify", "spec"],
  verify: ["ship", "build"],
  ship: ["archive"],
  archive: []
};
var REVIEW_PHASES = /* @__PURE__ */ new Set(["explore", "spec", "verify"]);
var REQUIRED_RUNTIME_REFS = {
  build: { outputs: [{ field: "build_sha", type: "string" }] },
  verify: {
    inputs: [{ field: "build_sha", type: "string" }],
    outputs: [{ field: "verification_report", type: "file_path" }]
  }
};
var REQUIRED_SKILL_GROUPS = {
  open: [
    { label: "OpenSpec proposal", alternatives: ["openspec-propose", "opsx:propose"] },
    { label: "pipeline open", alternatives: ["tenon-open", "tenon:tenon-open"] }
  ],
  explore: [
    { label: "pipeline explore", alternatives: ["tenon-explore", "tenon:tenon-explore"] },
    { label: "Superpower brainstorming", alternatives: ["brainstorming", "superpowers:brainstorming"] }
  ],
  spec: [
    { label: "tenon spec", alternatives: ["tenon-spec", "tenon:tenon-spec"] },
    { label: "OpenSpec delta proposal", alternatives: ["openspec-propose", "opsx:propose"] },
    { label: "Superpower plan", alternatives: ["writing-plans", "superpowers:writing-plans"] }
  ],
  build: [{ label: "pipeline build", alternatives: ["tenon-build", "tenon:tenon-build"] }],
  verify: [
    { label: "pipeline verify", alternatives: ["tenon-verify", "tenon:tenon-verify"] },
    {
      label: "Superpower verification",
      alternatives: ["verification-before-completion", "superpowers:verification-before-completion"]
    }
  ],
  ship: [
    { label: "pipeline ship", alternatives: ["tenon-ship", "tenon:tenon-ship"] },
    { label: "OpenSpec apply", alternatives: ["openspec-apply-change", "opsx:apply"] }
  ],
  archive: [{ label: "pipeline archive", alternatives: ["tenon-archive", "tenon:tenon-archive"] }]
};
function aliasesForSkill(id) {
  const aliases = /* @__PURE__ */ new Set([id]);
  if (id.startsWith("tenon:"))
    aliases.add(id.slice("tenon:".length));
  if (id.startsWith("superpowers:"))
    aliases.add(id.slice("superpowers:".length));
  if (id === "opsx:propose")
    aliases.add("openspec-propose");
  if (id === "openspec-propose")
    aliases.add("opsx:propose");
  if (id === "opsx:apply")
    aliases.add("openspec-apply-change");
  if (id === "openspec-apply-change")
    aliases.add("opsx:apply");
  return [...aliases];
}
function hasFieldRef(refs, required2) {
  return refs.some((ref) => ref.field === required2.field && ref.type === required2.type);
}
function readerReachableWithoutOwner(workflow, ownerStep, readerStep) {
  const entry = workflow.steps[0];
  if (!entry || entry.id === ownerStep)
    return false;
  const steps = new Map(workflow.steps.map((step) => [step.id, step]));
  const visited = /* @__PURE__ */ new Set();
  const queue = [entry.id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === void 0 || current === ownerStep || visited.has(current))
      continue;
    if (current === readerStep)
      return true;
    visited.add(current);
    for (const transition of steps.get(current)?.transitions ?? []) {
      if (transition.to !== ownerStep && !visited.has(transition.to))
        queue.push(transition.to);
    }
  }
  return false;
}
function validateLegacyContract(workflow) {
  const errors = [];
  const actualIds = workflow.steps.map((step) => step.id);
  if (actualIds.length !== DOCUMENT_CONTRACT_PHASES.length) {
    errors.push(`openspec_contract: required \u5FC5\u987B\u6070\u597D\u58F0\u660E ${DOCUMENT_CONTRACT_PHASES.length} \u4E2A\u6807\u51C6\u9636\u6BB5`);
  }
  for (const [index, expected] of DOCUMENT_CONTRACT_PHASES.entries()) {
    const actual = actualIds[index];
    if (actual !== expected) {
      errors.push(`openspec_contract: required \u7684\u7B2C ${index + 1} \u9636\u6BB5\u5FC5\u987B\u662F '${expected}'\uFF08\u5F53\u524D '${actual ?? "\u7F3A\u5931"}'\uFF09`);
    }
  }
  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    const step = workflow.steps.find((candidate) => candidate.id === phase);
    if (!step)
      continue;
    for (const target of CANONICAL_TRANSITIONS[phase]) {
      if (!step.transitions.some((transition) => transition.to === target)) {
        errors.push(`openspec_contract: required \u8981\u6C42 '${phase}' \u53EF\u8F6C\u6362\u5230 '${target}'`);
      }
    }
    if (REVIEW_PHASES.has(phase) && step.gate !== "review") {
      errors.push(`openspec_contract: required \u8981\u6C42 '${phase}' \u7684 gate=review`);
    }
    for (const group of REQUIRED_SKILL_GROUPS[phase]) {
      const satisfied = step.skills.some((skill) => {
        const aliases = new Set(aliasesForSkill(skill.id));
        return group.alternatives.some((candidate) => aliasesForSkill(candidate).some((alias) => aliases.has(alias)));
      });
      if (!satisfied) {
        errors.push(`openspec_contract: required \u8981\u6C42 '${phase}' \u58F0\u660E ${group.label} skill\uFF08\u5141\u8BB8: ${group.alternatives.join(" | ")}\uFF09`);
      }
    }
    const runtimeRefs = REQUIRED_RUNTIME_REFS[phase];
    for (const required2 of runtimeRefs?.inputs ?? []) {
      if (!hasFieldRef(step.inputs, required2)) {
        errors.push(`openspec_contract: required \u8981\u6C42 '${phase}' \u58F0\u660E input '${required2.field}'\uFF08type=${required2.type}\uFF09\u4EE5\u8BFB\u53D6\u6784\u5EFA\u57FA\u7EBF`);
      }
    }
    for (const required2 of runtimeRefs?.outputs ?? []) {
      if (!hasFieldRef(step.outputs, required2)) {
        errors.push(`openspec_contract: required \u8981\u6C42 '${phase}' \u58F0\u660E output '${required2.field}'\uFF08type=${required2.type}\uFF09\u4EE5\u7559\u4E0B\u53EF\u9A8C\u8BC1\u8BC1\u636E`);
      }
    }
  }
  return errors;
}
function validateDeclarativeContract(workflow) {
  const contract = workflow.documentContract;
  if (!contract)
    return [];
  const errors = [];
  if (workflow.openspecContract !== void 0) {
    errors.push("openspec_contract \u4E0E document_contract \u4E0D\u5F97\u540C\u65F6\u58F0\u660E");
  }
  const stepIds = new Set(workflow.steps.map((step) => step.id));
  const kinds = /* @__PURE__ */ new Set();
  for (const [index, slot] of contract.slots.entries()) {
    if (!isDocumentKind(slot.kind)) {
      errors.push(`document_contract.slots[${index}].kind '${slot.kind}' \u4E0D\u53D7\u652F\u6301`);
      continue;
    }
    if (kinds.has(slot.kind)) {
      errors.push(`document_contract document kind '${slot.kind}' \u53EA\u80FD\u58F0\u660E\u4E00\u4E2A owner_step`);
    }
    kinds.add(slot.kind);
    if (!stepIds.has(slot.ownerStep)) {
      errors.push(`document_contract document '${slot.kind}' \u7684 owner_step '${slot.ownerStep}' \u4E0D\u5B58\u5728`);
    }
    if (slot.producers.length === 0) {
      errors.push(`document_contract document '${slot.kind}' \u7684 producers \u4E0D\u5F97\u4E3A\u7A7A`);
    }
    const ownerSkills = workflow.steps.find((step) => step.id === slot.ownerStep)?.skills.map((skill) => skill.id) ?? [];
    for (const producer of slot.producers) {
      if (!ownerSkills.some((skill) => {
        const aliases = new Set(aliasesForSkill(skill));
        return aliasesForSkill(producer).some((alias) => aliases.has(alias));
      })) {
        errors.push(`document_contract document '${slot.kind}' \u7684 producer '${producer}' \u672A\u5728 owner_step '${slot.ownerStep}' \u58F0\u660E`);
      }
    }
  }
  const readSteps = /* @__PURE__ */ new Set();
  for (const [index, read] of contract.reads.entries()) {
    if (!stepIds.has(read.step)) {
      errors.push(`document_contract.reads[${index}].step '${read.step}' \u4E0D\u5B58\u5728`);
      continue;
    }
    if (readSteps.has(read.step)) {
      errors.push(`document_contract step '${read.step}' \u53EA\u80FD\u58F0\u660E\u4E00\u7EC4 reads`);
    }
    readSteps.add(read.step);
    for (const rawKind of read.kinds) {
      if (!isDocumentKind(rawKind) || !kinds.has(rawKind)) {
        errors.push(`document_contract step '${read.step}' \u8BFB\u53D6\u4E86\u672A\u58F0\u660E\u7684 document '${rawKind}'`);
        continue;
      }
      const owner = contract.slots.find((slot) => slot.kind === rawKind);
      if (owner?.ownerStep === read.step) {
        errors.push(`document_contract step '${read.step}' \u53EA\u80FD\u8BFB\u53D6\u66F4\u65E9 step \u4EA7\u51FA\u7684 '${rawKind}'`);
      } else if (owner && readerReachableWithoutOwner(workflow, owner.ownerStep, read.step)) {
        errors.push(`document_contract document '${rawKind}' \u7684 owner_step '${owner.ownerStep}' \u4E0D\u652F\u914D reader step '${read.step}'`);
      }
    }
  }
  return errors;
}
function validateOpenSpecContractWorkflow(workflow) {
  return workflow.openspecContract === "required" ? validateLegacyContract(workflow) : validateDeclarativeContract(workflow);
}

// packages/kernel/dist/workflow/document-contract.js
var DOCUMENT_CONTRACT_PHASES = [
  "open",
  "explore",
  "spec",
  "build",
  "verify",
  "ship",
  "archive"
];
var DOCUMENT_KINDS = [
  "proposal",
  "openspec-design",
  "tasks",
  "superpower-design",
  "adr",
  "delta-spec",
  "superpower-plan",
  "plan",
  "verification-report",
  "applied-spec"
];
var OUTPUTS_BY_PHASE = {
  open: [
    { kind: "proposal", producerCandidates: ["openspec-propose", "opsx:propose"] },
    { kind: "openspec-design", producerCandidates: ["openspec-propose", "opsx:propose"] },
    { kind: "tasks", producerCandidates: ["openspec-propose", "opsx:propose"] }
  ],
  explore: [
    { kind: "superpower-design", producerCandidates: ["brainstorming", "superpowers:brainstorming"] },
    { kind: "adr", producerCandidates: ["tenon-explore", "tenon:tenon-explore", "brainstorming", "superpowers:brainstorming"] }
  ],
  spec: [
    { kind: "delta-spec", producerCandidates: ["openspec-propose", "opsx:propose"] },
    { kind: "superpower-plan", producerCandidates: ["writing-plans", "superpowers:writing-plans"] },
    { kind: "plan", producerCandidates: ["writing-plans", "superpowers:writing-plans"] }
  ],
  build: [],
  verify: [
    {
      kind: "verification-report",
      producerCandidates: ["verification-before-completion", "superpowers:verification-before-completion", "tenon-verify", "tenon:tenon-verify"]
    }
  ],
  ship: [
    { kind: "applied-spec", producerCandidates: ["openspec-apply-change", "opsx:apply"] }
  ],
  archive: []
};
var SPEC_ADR_LIVING_DOCUMENT = {
  kind: "adr",
  producerCandidates: ["tenon-spec", "tenon:tenon-spec"]
};
var MUTABLE_RECORDS_BY_PHASE = {
  open: [],
  explore: [
    // Open creates intentionally small OpenSpec scaffolds. Explore owns consolidating the
    // validated problem framing and initial design hypothesis into those living documents; the
    // resulting digest must therefore be attributed to the phase driver, not left under the
    // now-stale open-phase openspec-propose receipt.
    { kind: "proposal", producerCandidates: ["tenon-explore", "tenon:tenon-explore"] },
    { kind: "openspec-design", producerCandidates: ["tenon-explore", "tenon:tenon-explore"] },
    { kind: "tasks", producerCandidates: ["tenon-explore", "tenon:tenon-explore"] }
  ],
  spec: [
    { kind: "proposal", producerCandidates: ["tenon-spec", "tenon:tenon-spec"] },
    { kind: "openspec-design", producerCandidates: ["tenon-spec", "tenon:tenon-spec"] },
    { kind: "tasks", producerCandidates: ["tenon-spec", "tenon:tenon-spec"] },
    { kind: "superpower-design", producerCandidates: ["tenon-spec", "tenon:tenon-spec"] },
    SPEC_ADR_LIVING_DOCUMENT
  ],
  build: [
    { kind: "tasks", producerCandidates: ["tenon-build", "tenon:tenon-build"] }
  ],
  verify: [
    { kind: "tasks", producerCandidates: ["tenon-verify", "tenon:tenon-verify"] }
  ],
  ship: [
    { kind: "tasks", producerCandidates: ["tenon-ship", "tenon:tenon-ship"] }
  ],
  archive: [
    { kind: "tasks", producerCandidates: ["tenon-archive", "tenon:tenon-archive"] }
  ]
};
var READS_BY_PHASE = {
  open: [],
  explore: ["proposal", "openspec-design", "tasks"],
  spec: ["proposal", "openspec-design", "tasks", "superpower-design", "adr"],
  build: [
    "proposal",
    "openspec-design",
    "tasks",
    "superpower-design",
    "adr",
    "delta-spec",
    "superpower-plan",
    "plan"
  ],
  verify: [
    "proposal",
    "openspec-design",
    "tasks",
    "superpower-design",
    "adr",
    "delta-spec",
    "superpower-plan",
    "plan"
  ],
  ship: [
    "proposal",
    "openspec-design",
    "tasks",
    "superpower-design",
    "adr",
    "delta-spec",
    "superpower-plan",
    "plan",
    "verification-report"
  ],
  archive: [
    "proposal",
    "openspec-design",
    "tasks",
    "superpower-design",
    "adr",
    "delta-spec",
    "superpower-plan",
    "plan",
    "verification-report",
    "applied-spec"
  ]
};
var LEGACY_DOCUMENT_GOVERNANCE_POLICY = {
  id: "openspec-v1",
  steps: DOCUMENT_CONTRACT_PHASES,
  outputsByStep: OUTPUTS_BY_PHASE,
  mutableByStep: MUTABLE_RECORDS_BY_PHASE,
  readsByStep: READS_BY_PHASE
};
function includes(values, value) {
  return values.includes(value);
}
function isDocumentContractPhase(value) {
  return includes(DOCUMENT_CONTRACT_PHASES, value);
}
function isDocumentKind(value) {
  return includes(DOCUMENT_KINDS, value);
}
function documentGovernancePolicy(workflowName, workflow) {
  if (workflowName === "default" || workflow?.openspecContract === "required") {
    return LEGACY_DOCUMENT_GOVERNANCE_POLICY;
  }
  const contract = workflow?.documentContract;
  if (!contract)
    return void 0;
  const outputsByStep = Object.fromEntries(workflow.steps.map((step) => [step.id, []]));
  for (const slot of contract.slots) {
    if (!isDocumentKind(slot.kind))
      continue;
    outputsByStep[slot.ownerStep]?.push({ kind: slot.kind, producerCandidates: slot.producers });
  }
  const readsByStep = Object.fromEntries(workflow.steps.map((step) => [step.id, []]));
  for (const read of contract.reads) {
    readsByStep[read.step] = read.kinds.filter(isDocumentKind);
  }
  return {
    id: "document-v1",
    steps: workflow.steps.map((step) => step.id),
    outputsByStep,
    mutableByStep: Object.fromEntries(workflow.steps.map((step) => [step.id, []])),
    readsByStep
  };
}
function isDocumentPolicyStep(policy, value) {
  return policy.steps.includes(value);
}
function outputsRequiredForPolicyStep(policy, step) {
  return policy.outputsByStep[step] ?? [];
}
function readsRequiredForPolicyStep(policy, step) {
  return policy.readsByStep[step] ?? [];
}
function recordsRequiredForPolicyStep(policy, step) {
  const required2 = [];
  for (const candidate of policy.steps) {
    required2.push(...outputsRequiredForPolicyStep(policy, candidate));
    if (candidate === step)
      break;
  }
  return required2;
}
function recordRequirementForPolicy(policy, kind, step) {
  const frozenRequirement = [
    ...outputsRequiredForPolicyStep(policy, step),
    ...policy.mutableByStep[step] ?? []
  ].find((requirement) => requirement.kind === kind);
  if (frozenRequirement)
    return frozenRequirement;
  return policy.id === "openspec-v1" && step === "spec" && kind === "adr" ? SPEC_ADR_LIVING_DOCUMENT : void 0;
}
function isDocumentProducerAllowedInPolicyStep(policy, kind, step, producer) {
  const requirement = recordRequirementForPolicy(policy, kind, step);
  if (!requirement)
    return false;
  const supplied = new Set(aliasesForSkill2(producer));
  return requirement.producerCandidates.some((candidate) => aliasesForSkill2(candidate).some((alias) => supplied.has(alias)));
}
function isRecordedDocumentProducerAllowedThroughPolicyStep(policy, kind, currentStep, producer) {
  for (const step of policy.steps) {
    if (isDocumentProducerAllowedInPolicyStep(policy, kind, step, producer))
      return true;
    if (step === currentStep)
      break;
  }
  return false;
}
function readsRequiredForPhase(phase) {
  return READS_BY_PHASE[phase];
}
function recordsRequiredForPhase(phase) {
  const required2 = [];
  for (const candidate of DOCUMENT_CONTRACT_PHASES) {
    required2.push(...OUTPUTS_BY_PHASE[candidate]);
    if (candidate === phase)
      break;
  }
  return required2;
}
function outputRequirementFor(kind) {
  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    const requirement = OUTPUTS_BY_PHASE[phase].find((candidate) => candidate.kind === kind);
    if (requirement)
      return requirement;
  }
  return void 0;
}
function aliasesForSkill2(id) {
  const aliases = /* @__PURE__ */ new Set([id]);
  if (id.startsWith("tenon:"))
    aliases.add(id.slice("tenon:".length));
  if (id.startsWith("superpowers:"))
    aliases.add(id.slice("superpowers:".length));
  if (id === "opsx:propose")
    aliases.add("openspec-propose");
  if (id === "openspec-propose")
    aliases.add("opsx:propose");
  if (id === "opsx:apply")
    aliases.add("openspec-apply-change");
  if (id === "openspec-apply-change")
    aliases.add("opsx:apply");
  return [...aliases];
}
function isAcceptedDocumentProducer(kind, producer) {
  const supplied = new Set(aliasesForSkill2(producer));
  return producerCandidatesFor(kind).some((candidate) => aliasesForSkill2(candidate).some((alias) => supplied.has(alias)));
}
function producerCandidatesFor(kind) {
  const candidates = /* @__PURE__ */ new Set();
  const origin = outputRequirementFor(kind);
  for (const candidate of origin?.producerCandidates ?? [])
    candidates.add(candidate);
  for (const phase of DOCUMENT_CONTRACT_PHASES) {
    for (const requirement of MUTABLE_RECORDS_BY_PHASE[phase]) {
      if (requirement.kind !== kind)
        continue;
      for (const candidate of requirement.producerCandidates)
        candidates.add(candidate);
    }
  }
  return [...candidates];
}
function shouldEnforceDocumentPolicyOnTransition(policy, from, to) {
  const fromIndex = policy.steps.indexOf(from);
  const toIndex = policy.steps.indexOf(to);
  return !(fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex);
}

// packages/kernel/dist/workflow/migrations/pre-tenon-v1-document-policy.js
var STEPS = ["open", "explore", "spec", "build", "verify", "ship", "archive"];
var RETIRED_SKILL_NAMESPACE = ["pipeline", "lite"].join("-");
var retiredQualifiedSkill = (id) => `${RETIRED_SKILL_NAMESPACE}:${id}`;
var PRE_TENON_DEFAULT_DOCUMENT_POLICY = {
  id: "openspec-v1",
  steps: STEPS,
  outputsByStep: {
    open: [
      { kind: "proposal", producerCandidates: ["openspec-propose", "opsx:propose"] },
      { kind: "openspec-design", producerCandidates: ["openspec-propose", "opsx:propose"] },
      { kind: "tasks", producerCandidates: ["openspec-propose", "opsx:propose"] }
    ],
    explore: [
      { kind: "superpower-design", producerCandidates: ["brainstorming", "superpowers:brainstorming"] },
      {
        kind: "adr",
        producerCandidates: [
          "pipeline-explore",
          retiredQualifiedSkill("pipeline-explore"),
          "brainstorming",
          "superpowers:brainstorming"
        ]
      }
    ],
    spec: [
      { kind: "delta-spec", producerCandidates: ["openspec-propose", "opsx:propose"] },
      { kind: "superpower-plan", producerCandidates: ["writing-plans", "superpowers:writing-plans"] },
      { kind: "plan", producerCandidates: ["writing-plans", "superpowers:writing-plans"] }
    ],
    build: [],
    verify: [{
      kind: "verification-report",
      producerCandidates: [
        "verification-before-completion",
        "superpowers:verification-before-completion",
        "pipeline-verify",
        retiredQualifiedSkill("pipeline-verify")
      ]
    }],
    ship: [{ kind: "applied-spec", producerCandidates: ["openspec-apply-change", "opsx:apply"] }],
    archive: []
  },
  mutableByStep: {
    open: [],
    explore: [
      { kind: "proposal", producerCandidates: ["pipeline-explore", retiredQualifiedSkill("pipeline-explore")] },
      { kind: "openspec-design", producerCandidates: ["pipeline-explore", retiredQualifiedSkill("pipeline-explore")] },
      { kind: "tasks", producerCandidates: ["pipeline-explore", retiredQualifiedSkill("pipeline-explore")] }
    ],
    spec: [
      { kind: "proposal", producerCandidates: ["pipeline-spec", retiredQualifiedSkill("pipeline-spec")] },
      { kind: "openspec-design", producerCandidates: ["pipeline-spec", retiredQualifiedSkill("pipeline-spec")] },
      { kind: "tasks", producerCandidates: ["pipeline-spec", retiredQualifiedSkill("pipeline-spec")] },
      { kind: "superpower-design", producerCandidates: ["pipeline-spec", retiredQualifiedSkill("pipeline-spec")] }
    ],
    build: [{ kind: "tasks", producerCandidates: ["pipeline-build", retiredQualifiedSkill("pipeline-build")] }],
    verify: [{ kind: "tasks", producerCandidates: ["pipeline-verify", retiredQualifiedSkill("pipeline-verify")] }],
    ship: [{ kind: "tasks", producerCandidates: ["pipeline-ship", retiredQualifiedSkill("pipeline-ship")] }],
    archive: [{ kind: "tasks", producerCandidates: ["pipeline-archive", retiredQualifiedSkill("pipeline-archive")] }]
  },
  readsByStep: {
    open: [],
    explore: ["proposal", "openspec-design", "tasks"],
    spec: ["proposal", "openspec-design", "tasks", "superpower-design", "adr"],
    build: [
      "proposal",
      "openspec-design",
      "tasks",
      "superpower-design",
      "adr",
      "delta-spec",
      "superpower-plan",
      "plan"
    ],
    verify: [
      "proposal",
      "openspec-design",
      "tasks",
      "superpower-design",
      "adr",
      "delta-spec",
      "superpower-plan",
      "plan"
    ],
    ship: [
      "proposal",
      "openspec-design",
      "tasks",
      "superpower-design",
      "adr",
      "delta-spec",
      "superpower-plan",
      "plan",
      "verification-report"
    ],
    archive: [
      "proposal",
      "openspec-design",
      "tasks",
      "superpower-design",
      "adr",
      "delta-spec",
      "superpower-plan",
      "plan",
      "verification-report",
      "applied-spec"
    ]
  }
};
var PRE_TENON_DEFAULT_WORKFLOW_FINGERPRINT = "c9a829b12b12138522532a9127efb8b93a551b1f28922a53dc174ad13e35b7dd";
function preTenonV1DocumentPolicy(workflowId, workflowFingerprint) {
  if (workflowId !== "default" || workflowFingerprint !== PRE_TENON_DEFAULT_WORKFLOW_FINGERPRINT)
    return void 0;
  return PRE_TENON_DEFAULT_DOCUMENT_POLICY;
}

// packages/kernel/dist/workflow/loadWorkflow.js
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { join as join8 } from "node:path";

// packages/kernel/dist/workflow/parse-document-contract.js
function indentOf(line) {
  return line.length - line.trimStart().length;
}
function parseInlineList(raw) {
  const trimmed = raw.trim();
  if (trimmed === "[]")
    return [];
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u671F\u671B [a, b] \u5F62\u6001\u7684\u5355\u884C\u5217\u8868\uFF0C\u5B9E\u9645 '${raw}'`);
  }
  return trimmed.slice(1, -1).split(",").map((item2) => item2.trim()).filter((item2) => item2.length > 0);
}
function parseSlots(cursor, baseIndent) {
  const slots = [];
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? "";
    if (line.trim() === "") {
      cursor.i++;
      continue;
    }
    if (indentOf(line) < baseIndent)
      break;
    const kindMatch = /^\s*-\s+kind:\s*(\S+)\s*$/.exec(line);
    if (!kindMatch)
      break;
    const itemIndent = indentOf(line);
    cursor.i++;
    let ownerStep;
    let producers;
    while (cursor.i < cursor.lines.length) {
      const child = cursor.lines[cursor.i] ?? "";
      if (child.trim() === "") {
        cursor.i++;
        continue;
      }
      if (indentOf(child) <= itemIndent)
        break;
      const ownerMatch = /^\s*owner_step:\s*(\S+)\s*$/.exec(child);
      if (ownerMatch) {
        ownerStep = ownerMatch[1];
        cursor.i++;
        continue;
      }
      const producerMatch = /^\s*producers:\s*(\[.*\])\s*$/.exec(child);
      if (producerMatch) {
        producers = parseInlineList(producerMatch[1] ?? "");
        cursor.i++;
        continue;
      }
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument slot '${kindMatch[1]}' \u51FA\u73B0\u672A\u77E5\u5B57\u6BB5\u884C '${child.trim()}'`);
    }
    if (!ownerStep)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument slot '${kindMatch[1]}' \u7F3A owner_step`);
    if (!producers || producers.length === 0) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument slot '${kindMatch[1]}' \u7F3A\u975E\u7A7A producers`);
    }
    slots.push({ kind: kindMatch[1] ?? "", ownerStep, producers });
  }
  return slots;
}
function parseReads(cursor, baseIndent) {
  const reads = [];
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? "";
    if (line.trim() === "") {
      cursor.i++;
      continue;
    }
    if (indentOf(line) < baseIndent)
      break;
    const stepMatch = /^\s*-\s+step:\s*(\S+)\s*$/.exec(line);
    if (!stepMatch)
      break;
    const itemIndent = indentOf(line);
    cursor.i++;
    const kindsLine = cursor.lines[cursor.i] ?? "";
    const kindsMatch = /^\s*kinds:\s*(\[.*\])\s*$/.exec(kindsLine);
    if (!kindsMatch || indentOf(kindsLine) <= itemIndent) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument read '${stepMatch[1]}' \u7F3A kinds`);
    }
    const kinds = parseInlineList(kindsMatch[1] ?? "");
    if (kinds.length === 0) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument read '${stepMatch[1]}' \u7684 kinds \u4E0D\u5F97\u4E3A\u7A7A`);
    }
    cursor.i++;
    reads.push({ step: stepMatch[1] ?? "", kinds });
  }
  return reads;
}
function parseDocumentContract(cursor, keyIndent) {
  let version;
  let slots;
  let reads;
  while (cursor.i < cursor.lines.length) {
    const line = cursor.lines[cursor.i] ?? "";
    if (line.trim() === "") {
      cursor.i++;
      continue;
    }
    if (indentOf(line) <= keyIndent)
      break;
    const versionMatch = /^\s*version:\s*(\S+)\s*$/.exec(line);
    if (versionMatch) {
      if (versionMatch[1] !== "v1") {
        throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument_contract version \u53EA\u652F\u6301 'v1'");
      }
      version = "v1";
      cursor.i++;
      continue;
    }
    if (/^\s*slots:\s*$/.test(line)) {
      const blockIndent = indentOf(line);
      cursor.i++;
      slots = parseSlots(cursor, blockIndent + 2);
      continue;
    }
    if (/^\s*reads:\s*\[\]\s*$/.test(line)) {
      reads = [];
      cursor.i++;
      continue;
    }
    if (/^\s*reads:\s*$/.test(line)) {
      const blockIndent = indentOf(line);
      cursor.i++;
      reads = parseReads(cursor, blockIndent + 2);
      continue;
    }
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument_contract \u51FA\u73B0\u672A\u77E5\u5B57\u6BB5\u884C '${line.trim()}'`);
  }
  if (!version)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument_contract \u7F3A version: v1");
  if (!slots || slots.length === 0)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument_contract \u7F3A\u975E\u7A7A slots");
  if (!reads)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Adocument_contract \u7F3A reads");
  return { version, slots, reads };
}

// packages/kernel/dist/workflow/parse.js
function parseInlineList2(raw) {
  const trimmed = raw.trim();
  if (trimmed === "[]")
    return [];
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u671F\u671B [a, b] \u5F62\u6001\u7684\u5355\u884C\u5217\u8868\uFF0C\u5B9E\u9645 '${raw}'`);
  }
  return trimmed.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function indentOf2(line) {
  return line.length - line.trimStart().length;
}
function parsePromptBlock(cur, keyIndent) {
  const contentIndent = keyIndent + 2;
  const out = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "" && line.length < contentIndent)
      break;
    if (indentOf2(line) < contentIndent)
      break;
    out.push(line.slice(contentIndent));
    cur.i++;
  }
  if (out.length === 0)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aprompt: |- \u540E\u5FC5\u987B\u6709\u7F29\u8FDB\u5185\u5BB9\u884C");
  return out.join("\n");
}
function parseSkillsBlock(cur, baseIndent) {
  const skills = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line);
    if (!idMatch)
      break;
    const id = idMatch[1] ?? "";
    cur.i++;
    let depends_on;
    const next = cur.lines[cur.i] ?? "";
    const depMatch = /^\s*depends_on:\s*(\[.*\])\s*$/.exec(next);
    if (depMatch && indentOf2(next) > baseIndent) {
      depends_on = parseInlineList2(depMatch[1] ?? "");
      cur.i++;
    }
    skills.push(depends_on ? { id, depends_on } : { id });
  }
  return skills;
}
function parseFieldRefBlock(cur, baseIndent) {
  const refs = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line);
    if (!fieldMatch)
      break;
    cur.i++;
    const typeLine = cur.lines[cur.i] ?? "";
    const typeMatch = /^\s*type:\s*(string|file_path|boolean)\s*$/.exec(typeLine);
    if (!typeMatch)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Afield '${fieldMatch[1]}' \u7F3A type`);
    cur.i++;
    refs.push({ field: fieldMatch[1] ?? "", type: typeMatch[1] });
  }
  return refs;
}
function parseWhenBlock(cur, whenIndent) {
  while (cur.i < cur.lines.length && (cur.lines[cur.i] ?? "").trim() === "")
    cur.i++;
  const line = cur.lines[cur.i] ?? "";
  if (indentOf2(line) <= whenIndent) {
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Awhen \u5757\u7F3A track_in/track_not_in \u8C13\u8BCD\u884C");
  }
  const m = /^\s*(track_in|track_not_in):\s*(\[.*\])\s*$/.exec(line);
  if (!m)
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Awhen \u8C13\u8BCD\u53EA\u652F\u6301 'track_in: [..]' \u6216 'track_not_in: [..]'\uFF0C\u5B9E\u9645 '${line.trim()}'`);
  cur.i++;
  return { kind: m[1] === "track_in" ? "track-in" : "track-not-in", values: parseInlineList2(m[2] ?? "") };
}
function parseArtifactsBlock(cur, baseIndent) {
  const arts = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line);
    if (!fieldMatch)
      break;
    const itemIndent = indentOf2(line);
    cur.i++;
    let type;
    let producerPolicy;
    let requiredWhen;
    while (cur.i < cur.lines.length) {
      const l = cur.lines[cur.i] ?? "";
      if (l.trim() === "") {
        cur.i++;
        continue;
      }
      if (indentOf2(l) <= itemIndent)
        break;
      let m;
      if (m = /^\s*type:\s*(\S+)\s*$/.exec(l)) {
        if (m[1] !== "file_path")
          throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aartifact '${fieldMatch[1]}' \u7684 type \u53EA\u652F\u6301 file_path\uFF08\u5B9E\u9645 '${m[1]}'\uFF09`);
        type = "file_path";
        cur.i++;
        continue;
      }
      if (m = /^\s*producer_policy:\s*(\S+)\s*$/.exec(l)) {
        producerPolicy = m[1];
        cur.i++;
        continue;
      }
      if (/^\s*required_when:\s*$/.test(l)) {
        const wi = indentOf2(l);
        cur.i++;
        requiredWhen = parseWhenBlock(cur, wi);
        continue;
      }
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aartifact '${fieldMatch[1]}' \u51FA\u73B0\u672A\u77E5\u5B57\u6BB5\u884C '${l.trim()}'`);
    }
    if (type === void 0)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aartifact '${fieldMatch[1]}' \u7F3A type`);
    if (producerPolicy === void 0)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aartifact '${fieldMatch[1]}' \u7F3A producer_policy`);
    const field = fieldMatch[1];
    arts.push(requiredWhen === void 0 ? { field, type, producerPolicy } : { field, type, producerPolicy, requiredWhen });
  }
  return arts;
}
function parseGuardEntry(cur, type, itemIndent) {
  const f = {};
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) <= itemIndent)
      break;
    let m;
    if (m = /^\s*n:\s*(\d+)\s*$/.exec(line)) {
      f.n = Number(m[1]);
      cur.i++;
      continue;
    }
    if (m = /^\s*field:\s*(\S+)\s*$/.exec(line)) {
      f.field = m[1];
      cur.i++;
      continue;
    }
    if (m = /^\s*value:\s*(.+?)\s*$/.exec(line)) {
      f.value = m[1];
      cur.i++;
      continue;
    }
    if (m = /^\s*values:\s*(\[.*\])\s*$/.exec(line)) {
      f.values = parseInlineList2(m[1] ?? "");
      cur.i++;
      continue;
    }
    if (/^\s*when:\s*$/.test(line)) {
      const wi = indentOf2(line);
      cur.i++;
      f.when = parseWhenBlock(cur, wi);
      continue;
    }
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard '${type}' \u51FA\u73B0\u672A\u77E5\u5B57\u6BB5\u884C '${line.trim()}'`);
  }
  return buildGuard(type, f);
}
function requireGuardField(f, type) {
  if (f.field === void 0)
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard '${type}' \u7F3A field`);
  return f.field;
}
var GUARD_FLAT_FIELDS = Object.fromEntries(Object.entries(GUARD_DATA_KEYS).map(([type, keys]) => [type, keys.map((k) => k === "path" ? "field" : k)]));
function rejectExtraGuardFields(type, f) {
  if (!Object.prototype.hasOwnProperty.call(GUARD_FLAT_FIELDS, type))
    return;
  const allowed = GUARD_FLAT_FIELDS[type];
  for (const key of ["n", "field", "value", "values"]) {
    if (f[key] !== void 0 && !allowed.includes(key)) {
      const permitted = allowed.length ? `${allowed.join("/")}\uFF08+ \u53EF\u9009 when\uFF09` : "\u4EC5\u53EF\u9009 when";
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard '${type}' \u4E0D\u63A5\u53D7\u9644\u52A0\u5B57\u6BB5 '${key}'\uFF08\u8BE5\u53D8\u4F53\u53EA\u5141\u8BB8 ${permitted}\uFF09`);
    }
  }
}
function buildGuard(type, f) {
  rejectExtraGuardFields(type, f);
  const cond = f.when ? { when: f.when } : {};
  switch (type) {
    case "tasks-at-least":
      if (f.n === void 0)
        throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard 'tasks-at-least' \u7F3A n");
      return { type: "tasks-at-least", n: f.n, ...cond };
    case "nonempty-output":
      return { type: "nonempty-output", ...cond };
    case "field-nonempty":
      return { type: "field-nonempty", field: requireGuardField(f, type), ...cond };
    case "file-exists":
      return { type: "file-exists", path: { kind: "field", field: requireGuardField(f, type) }, ...cond };
    case "field-equals":
      if (f.value === void 0)
        throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard 'field-equals' \u7F3A value");
      return { type: "field-equals", field: requireGuardField(f, type), value: f.value, ...cond };
    case "field-in":
      if (f.values === void 0 || f.values.length === 0) {
        throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard 'field-in' \u7F3A\u975E\u7A7A values");
      }
      return { type: "field-in", field: requireGuardField(f, type), values: f.values, ...cond };
    case "full-direct-override":
      return { type: "full-direct-override", ...cond };
    case "build-head-unchanged":
      return { type: "build-head-unchanged", field: requireGuardField(f, type), ...cond };
    case "spec-migration-applied":
      return { type: "spec-migration-applied", ...cond };
    default:
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u672A\u77E5 guard type '${type}'\uFF08\u95ED\u96C6\u89C1 types.ts WorkflowGuardConfig\uFF09`);
  }
}
function parseGuardsBlock(cur, baseIndent) {
  const guards = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const m = /^\s*-\s+type:\s*(\S+)\s*$/.exec(line);
    if (!m)
      break;
    const itemIndent = indentOf2(line);
    cur.i++;
    guards.push(parseGuardEntry(cur, m[1] ?? "", itemIndent));
  }
  return guards;
}
var ACTION_TYPES2 = [
  "freeze-build-sha",
  "reset-pre-verify-review",
  "mark-verification-passed",
  "mark-verification-failed",
  "archive-run"
];
function parseActionsBlock(cur, baseIndent) {
  const actions = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const m = /^\s*-\s+type:\s*(\S+)\s*$/.exec(line);
    if (!m)
      break;
    const type = m[1] ?? "";
    cur.i++;
    if (!ACTION_TYPES2.includes(type)) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u672A\u77E5 action type '${type}'\uFF08\u95ED\u96C6\u89C1 types.ts WorkflowActionConfig\uFF09`);
    }
    actions.push({ type });
  }
  return actions;
}
function parseTransitionsBlock(cur, baseIndent) {
  const transitions = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent)
      break;
    const eventMatch = /^\s*-\s+event:\s*(\S+)\s*$/.exec(line);
    if (!eventMatch)
      break;
    const itemIndent = indentOf2(line);
    cur.i++;
    const toLine = cur.lines[cur.i] ?? "";
    const toMatch = /^\s*to:\s*(\S+)\s*$/.exec(toLine);
    if (!toMatch)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Atransitions \u91CC event '${eventMatch[1]}' \u7F3A to`);
    cur.i++;
    let guards;
    let actions;
    while (cur.i < cur.lines.length) {
      const l = cur.lines[cur.i] ?? "";
      if (l.trim() === "") {
        cur.i++;
        continue;
      }
      if (indentOf2(l) <= itemIndent)
        break;
      if (/^\s*guards:\s*\[\]\s*$/.test(l)) {
        guards = [];
        cur.i++;
        continue;
      }
      if (/^\s*guards:\s*$/.test(l)) {
        const gi = indentOf2(l);
        cur.i++;
        guards = parseGuardsBlock(cur, gi);
        continue;
      }
      if (/^\s*actions:\s*\[\]\s*$/.test(l)) {
        actions = [];
        cur.i++;
        continue;
      }
      if (/^\s*actions:\s*$/.test(l)) {
        const ai = indentOf2(l);
        cur.i++;
        actions = parseActionsBlock(cur, ai);
        continue;
      }
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Atransition event '${eventMatch[1]}' \u51FA\u73B0\u672A\u77E5\u5B57\u6BB5\u884C '${l.trim()}'`);
    }
    transitions.push({
      event: eventMatch[1] ?? "",
      to: toMatch[1] ?? "",
      ...guards !== void 0 ? { guards } : {},
      ...actions !== void 0 ? { actions } : {}
    });
  }
  return transitions;
}
function parseStep(cur) {
  const idLine = cur.lines[cur.i] ?? "";
  const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(idLine);
  if (!idMatch)
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u671F\u671B '- id: <name>'\uFF0C\u5B9E\u9645 '${idLine}'`);
  const id = idMatch[1] ?? "";
  const baseIndent = indentOf2(idLine) + 2;
  cur.i++;
  let label = "";
  let gate = null;
  let prompt;
  let skills = [];
  let inputs = [];
  let outputs = [];
  let artifacts;
  let guards = [];
  let transitions = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf2(line) < baseIndent - 2)
      break;
    const labelMatch = /^\s*label:\s*(.+)$/.exec(line);
    if (labelMatch) {
      label = (labelMatch[1] ?? "").trim();
      cur.i++;
      continue;
    }
    const gateMatch = /^\s*gate:\s*(review|confirm|null)\s*$/.exec(line);
    if (gateMatch) {
      const v = gateMatch[1] ?? "";
      gate = v === "null" ? null : v;
      cur.i++;
      continue;
    }
    if (/^\s*prompt:\s*\|-\s*$/.test(line)) {
      const keyIndent = indentOf2(line);
      cur.i++;
      prompt = parsePromptBlock(cur, keyIndent);
      continue;
    }
    if (/^\s*skills:\s*\[\]\s*$/.test(line)) {
      skills = [];
      cur.i++;
      continue;
    }
    if (/^\s*skills:\s*$/.test(line)) {
      cur.i++;
      skills = parseSkillsBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*inputs:\s*\[\]\s*$/.test(line)) {
      inputs = [];
      cur.i++;
      continue;
    }
    if (/^\s*inputs:\s*$/.test(line)) {
      cur.i++;
      inputs = parseFieldRefBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*outputs:\s*\[\]\s*$/.test(line)) {
      outputs = [];
      cur.i++;
      continue;
    }
    if (/^\s*outputs:\s*$/.test(line)) {
      cur.i++;
      outputs = parseFieldRefBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*artifacts:\s*\[\]\s*$/.test(line)) {
      artifacts = [];
      cur.i++;
      continue;
    }
    if (/^\s*artifacts:\s*$/.test(line)) {
      cur.i++;
      artifacts = parseArtifactsBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*guards:\s*\[\]\s*$/.test(line)) {
      cur.i++;
      continue;
    }
    if (/^\s*guards:\s*$/.test(line)) {
      cur.i++;
      guards = parseGuardsBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*transitions:\s*\[\]\s*$/.test(line)) {
      transitions = [];
      cur.i++;
      continue;
    }
    if (/^\s*transitions:\s*$/.test(line)) {
      cur.i++;
      transitions = parseTransitionsBlock(cur, baseIndent);
      continue;
    }
    break;
  }
  return {
    id,
    label,
    gate,
    skills,
    inputs,
    outputs,
    guards,
    transitions,
    ...prompt !== void 0 ? { prompt } : {},
    ...artifacts !== void 0 ? { artifacts } : {}
  };
}
function parseWorkflow(content) {
  const lines = content.split("\n");
  const nameMatch = /^name:\s*(\S+)\s*$/.exec(lines[0] ?? "");
  if (!nameMatch)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u7B2C\u4E00\u884C\u5FC5\u987B\u662F 'name: <name>'");
  let stepLine = 1;
  let openspecContract;
  let documentContract;
  const contractLine = /^openspec_contract:\s*(\S+)\s*$/.exec(lines[stepLine] ?? "");
  if (contractLine) {
    if (contractLine[1] !== "required") {
      throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aopenspec_contract \u53EA\u652F\u6301 'required'");
    }
    openspecContract = "required";
    stepLine++;
  }
  if ((lines[stepLine] ?? "").trim() === "document_contract:") {
    const cur2 = { lines, i: stepLine + 1 };
    documentContract = parseDocumentContract(cur2, indentOf2(lines[stepLine] ?? ""));
    stepLine = cur2.i;
  }
  if (openspecContract && documentContract) {
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aopenspec_contract \u4E0E document_contract \u4E0D\u5F97\u540C\u65F6\u58F0\u660E");
  }
  if ((lines[stepLine] ?? "").trim() !== "steps:") {
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1Aname \u540E\u5FC5\u987B\u662F 'steps:'\u3001'openspec_contract: required' \u6216 document_contract");
  }
  const cur = { lines, i: stepLine + 1 };
  const steps = [];
  while (cur.i < lines.length) {
    if ((lines[cur.i] ?? "").trim() === "") {
      cur.i++;
      continue;
    }
    if (!/^\s*-\s+id:/.test(lines[cur.i] ?? "")) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Asteps \u4E0B\u6BCF\u9879\u5FC5\u987B\u4EE5 '- id:' \u5F00\u5934\uFF0C\u5B9E\u9645 '${lines[cur.i]}'`);
    }
    steps.push(parseStep(cur));
  }
  return {
    name: nameMatch[1] ?? "",
    ...openspecContract ? { openspecContract } : {},
    ...documentContract ? { documentContract } : {},
    steps
  };
}

// packages/kernel/dist/workflow/validate.js
function detectCycle(skillIds, dependsOn) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(skillIds.map((id) => [id, WHITE]));
  const errors = [];
  function visit(id, path7) {
    color.set(id, GRAY);
    for (const dep of dependsOn.get(id) ?? []) {
      if (color.get(dep) === GRAY) {
        errors.push(`\u5FAA\u73AF\u4F9D\u8D56\uFF1A${[...path7, id, dep].join(" -> ")}`);
        continue;
      }
      if (color.get(dep) === WHITE)
        visit(dep, [...path7, id]);
    }
    color.set(id, BLACK);
  }
  for (const id of skillIds) {
    if (color.get(id) === WHITE)
      visit(id, []);
  }
  return errors;
}
var IDENT_RE = /^[a-zA-Z0-9_-]+$/;
var WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u;
var SKILL_IDENT_RE = /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/;
function validateWorkflow(wf, options = {}) {
  const errors = [];
  const producedByEarlierStep = /* @__PURE__ */ new Set();
  const allStepIds = new Set(wf.steps.map((s) => s.id));
  if (!WORKFLOW_NAME_RE.test(wf.name)) {
    errors.push(`workflow name '${wf.name}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u5141\u8BB8\u4E2D\u6587\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001- \u4E0E _\uFF1B\u4E0D\u5141\u8BB8\u7A7A\u683C\u3001\u70B9\u6216\u8DEF\u5F84\u7B26\u53F7\uFF09`);
  }
  wf.steps.forEach((step) => {
    if (!IDENT_RE.test(step.id)) {
      errors.push(`step id '${step.id}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
    }
    for (const skill of step.skills) {
      if (!SKILL_IDENT_RE.test(skill.id)) {
        errors.push(`step '${step.id}' \u7684 skill id '${skill.id}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_- \u53CA\u547D\u540D\u7A7A\u95F4\u5192\u53F7\uFF0C\u5982 superpowers:brainstorming\uFF09`);
      }
    }
    for (const ref of [...step.inputs, ...step.outputs]) {
      if (!IDENT_RE.test(ref.field)) {
        errors.push(`step '${step.id}' \u7684\u5B57\u6BB5 '${ref.field}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
      }
    }
    const transitionEvents = /* @__PURE__ */ new Set();
    for (const t of step.transitions) {
      if (!IDENT_RE.test(t.event)) {
        errors.push(`step '${step.id}' \u7684 transitions \u91CC event '${t.event}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
      }
      if (transitionEvents.has(t.event)) {
        errors.push(`step '${step.id}' \u7684 transitions \u91CD\u590D\u58F0\u660E event '${t.event}'`);
      }
      transitionEvents.add(t.event);
    }
    const skillIds = step.skills.map((s) => s.id);
    const dependsOn = new Map(step.skills.map((s) => [s.id, [...s.depends_on ?? []]]));
    for (const skill of step.skills) {
      for (const dep of skill.depends_on ?? []) {
        if (!skillIds.includes(dep)) {
          errors.push(`step '${step.id}' \u7684 skill '${skill.id}' \u4F9D\u8D56\u4E86\u540C step \u5185\u4E0D\u5B58\u5728\u7684 '${dep}'`);
        }
      }
    }
    errors.push(...detectCycle(skillIds, dependsOn).map((e) => `step '${step.id}': ${e}`));
    for (const input of step.inputs) {
      if (!producedByEarlierStep.has(input.field)) {
        errors.push(`step '${step.id}' \u7684 inputs \u5B57\u6BB5 '${input.field}' \u4E0D\u5BF9\u5E94\u4EFB\u4F55\u66F4\u65E9 step \u7684 outputs`);
      }
    }
    for (const output of step.outputs)
      producedByEarlierStep.add(output.field);
    for (const t of step.transitions) {
      if (!allStepIds.has(t.to)) {
        errors.push(`step '${step.id}' \u7684 transitions \u91CC event '${t.event}' \u7684 to '${t.to}' \u4E0D\u5B58\u5728`);
      }
    }
  });
  if (wf.steps.length > 0) {
    const entryStep = wf.steps[0];
    if (!entryStep)
      return errors;
    const reachable = /* @__PURE__ */ new Set();
    const queue = [entryStep.id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === void 0)
        break;
      if (reachable.has(id))
        continue;
      reachable.add(id);
      const step = wf.steps.find((candidate) => candidate.id === id);
      for (const transition of step?.transitions ?? []) {
        if (allStepIds.has(transition.to) && !reachable.has(transition.to))
          queue.push(transition.to);
      }
    }
    for (const step of wf.steps) {
      if (!reachable.has(step.id))
        errors.push(`step '${step.id}' \u4ECE\u9996 step '${entryStep.id}' \u4E0D\u53EF\u8FBE`);
    }
  }
  errors.push(...validateOpenSpecContractWorkflow(wf));
  try {
    if (options.origin === "default")
      compileDefaultWorkflow(wf);
    else
      compileWorkflow(wf);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return errors;
}

// packages/kernel/dist/workflow/loadWorkflow.js
function loadWorkflow(repoRoot, name) {
  const builtin = builtinWorkflow(name);
  if (builtin) {
    const errors2 = validateWorkflow(builtin);
    if (errors2.length > 0) {
      throw new Error(`ERROR: \u5185\u5EFA workflow '${name}' \u6821\u9A8C\u5931\u8D25\uFF1A
${errors2.map((e) => `  - ${e}`).join("\n")}`);
    }
    return builtin;
  }
  const p = join8(repoRoot, ".pipeline", "workflows", `${name}.yaml`);
  if (!existsSync2(p))
    return null;
  const wf = parseWorkflow(readFileSync3(p, "utf8"));
  const errors = validateWorkflow(wf);
  if (errors.length > 0) {
    throw new Error(`ERROR: workflow '${name}' \u6821\u9A8C\u5931\u8D25\uFF08${p}\uFF09\uFF1A
${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return wf;
}

// packages/kernel/dist/workflow/effective-plan.js
var DocumentGovernanceBindingError = class extends Error {
  _tag = "DocumentGovernanceBindingError";
};
function profileFor(policy) {
  if (policy?.id === "openspec-v1")
    return "legacy-full";
  if (policy?.id === "document-v1")
    return "document-v1";
  return void 0;
}
function canonicalRequirement(requirement) {
  return {
    kind: requirement.kind,
    producerCandidates: [...new Set(requirement.producerCandidates)].sort()
  };
}
function documentGovernanceFingerprint(policy) {
  const canonical = {
    id: policy.id,
    steps: [...policy.steps],
    outputsByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...policy.outputsByStep[step] ?? []].map(canonicalRequirement).sort((left, right) => left.kind.localeCompare(right.kind))
    ])),
    mutableByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...policy.mutableByStep[step] ?? []].map(canonicalRequirement).sort((left, right) => left.kind.localeCompare(right.kind))
    ])),
    readsByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...new Set(policy.readsByStep[step] ?? [])].sort()
    ]))
  };
  return sha256Hex(JSON.stringify(canonical));
}
function freeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value))
      freeze(child);
    Object.freeze(value);
  }
  return value;
}
function assertValid(definition, origin) {
  const errors = validateWorkflow(definition, { origin });
  if (errors.length > 0)
    throw new Error(`effective workflow \u65E0\u6548\uFF1A
${errors.map((error) => `  - ${error}`).join("\n")}`);
}
function planFromIr(id, executionModel, workflow, track, frozenDocumentPolicy) {
  const documentPolicy = frozenDocumentPolicy === void 0 ? documentGovernancePolicy(id, workflow) : frozenDocumentPolicy ?? void 0;
  const skillPolicy = executionModel === "phase-manifest" ? "manifest-overlay" : "step-declared";
  const reviewSteps = workflow.steps.filter((step) => step.gate === "review").map((step) => step.id);
  const projectionSteps = workflow.steps.map((step) => ({ id: step.id, label: step.label }));
  const stepLabelSource = executionModel === "phase-manifest" ? "localized-builtin" : "workflow-defined";
  const workflowFingerprint = sha256Hex(JSON.stringify({
    schema: "effective-workflow-plan-v1",
    id,
    executionModel,
    workflow,
    documentPolicy: documentPolicy === void 0 ? null : {
      id: documentPolicy.id,
      fingerprint: documentGovernanceFingerprint(documentPolicy)
    },
    skillPolicy,
    reviewSteps,
    projectionSteps
  }));
  const trackPolicy = track?.policyProfile;
  const documentProfile = profileFor(documentPolicy);
  return freeze({
    id,
    executionModel,
    workflow,
    ...documentPolicy === void 0 ? {} : { documentPolicy },
    skillPolicy,
    reviewSteps,
    workflowFingerprint,
    capabilities: {
      execution: { model: executionModel },
      skills: {
        source: skillPolicy,
        steps: workflow.steps.map((step) => ({
          stepId: step.id,
          requiredSkillIds: step.skills.map((skill) => skill.id),
          declared: step.skills.map((skill) => ({
            id: skill.id,
            dependsOn: skill.depends_on ?? []
          }))
        })),
        trackOverlay: {
          matrix: trackPolicy?.skills.matrix ?? false,
          profile: trackPolicy?.skills.profile ?? "_all"
        }
      },
      documents: {
        governed: documentPolicy !== void 0,
        ...documentProfile === void 0 ? {} : { profile: documentProfile },
        ...documentPolicy === void 0 ? {} : { policy: documentPolicy }
      },
      review: { steps: reviewSteps },
      automation: {
        eligible: trackPolicy?.automationEligible ?? false,
        autoEnqueueOnSpecComplete: trackPolicy?.autoEnqueueOnSpecComplete ?? false
      },
      track: {
        id: track?.id ?? null,
        coverageProfile: trackPolicy?.coverageProfile ?? "none",
        routingEnabled: trackPolicy?.routing.enabled ?? false
      }
    },
    projection: {
      steps: projectionSteps,
      stepLabelSource
    }
  });
}
function workflowPlanSnapshot(plan) {
  return freeze({
    version: 2,
    workflowId: plan.id,
    executionModel: plan.executionModel,
    workflow: structuredClone(plan.workflow),
    documentPolicy: structuredClone(plan.documentPolicy ?? null),
    workflowFingerprint: plan.workflowFingerprint
  });
}
function effectiveWorkflowPlanFromSnapshot(snapshot, track) {
  if (snapshot.version !== 1 && snapshot.version !== 2 || snapshot.workflowId === "" || snapshot.executionModel !== "phase-manifest" && snapshot.executionModel !== "step-graph" || !/^[0-9a-f]{64}$/.test(snapshot.workflowFingerprint)) {
    throw new DocumentGovernanceBindingError("workflow plan snapshot \u5F62\u72B6\u975E\u6CD5");
  }
  const plan = planFromIr(snapshot.workflowId, snapshot.executionModel, structuredClone(snapshot.workflow), track, snapshot.version === 2 ? structuredClone(snapshot.documentPolicy) : void 0);
  if (plan.workflowFingerprint === snapshot.workflowFingerprint)
    return plan;
  let legacyFingerprint;
  if (snapshot.version === 1) {
    const legacyPolicy = preTenonV1DocumentPolicy(snapshot.workflowId, snapshot.workflowFingerprint);
    if (legacyPolicy !== void 0) {
      const legacyPlan = planFromIr(snapshot.workflowId, snapshot.executionModel, structuredClone(snapshot.workflow), track, legacyPolicy);
      legacyFingerprint = legacyPlan.workflowFingerprint;
      if (legacyPlan.workflowFingerprint === snapshot.workflowFingerprint)
        return legacyPlan;
    }
  }
  throw new DocumentGovernanceBindingError(`workflow plan snapshot \u5185\u5BB9\u4E0E fingerprint \u4E0D\u4E00\u81F4\uFF08expected=${snapshot.workflowFingerprint}, current=${plan.workflowFingerprint}${legacyFingerprint === void 0 ? "" : `, legacy=${legacyFingerprint}`}\uFF09`);
}
function compileEffectiveWorkflowPlan(id, provided, track) {
  if (id === "default") {
    const definition2 = provided ?? parseWorkflow(DEFAULT_WORKFLOW_SOURCE);
    assertValid(definition2, "default");
    return planFromIr(id, "phase-manifest", compileDefaultWorkflow(definition2), track);
  }
  const definition = provided ?? builtinWorkflow(id);
  if (!definition)
    throw new Error(`workflow '${id}' \u672A\u627E\u5230`);
  assertValid(definition, "custom");
  return planFromIr(id, "step-graph", compileWorkflow(definition), track);
}
function loadEffectiveWorkflowPlan(repoRoot, id, track) {
  const definition = id === "default" ? void 0 : loadWorkflow(repoRoot, id) ?? void 0;
  return compileEffectiveWorkflowPlan(id, definition, track);
}
function effectiveWorkflowPlanFromIr(id, workflow, track) {
  return planFromIr(id, "step-graph", workflow, track);
}
function resolveEffectiveWorkflowPlan(id, loadCompiled, track) {
  if (id === "default")
    return compileEffectiveWorkflowPlan(id, void 0, track);
  const workflow = loadCompiled(id);
  return workflow === null ? null : effectiveWorkflowPlanFromIr(id, workflow, track);
}
function effectiveWorkflowPlanBinding(plan) {
  const policy = plan.documentPolicy;
  const profile = profileFor(policy);
  return {
    ...profile === void 0 ? {} : { documentProfile: profile },
    ...policy === void 0 ? {} : { documentGovernanceFingerprint: documentGovernanceFingerprint(policy) },
    workflowPlanFingerprint: plan.workflowFingerprint
  };
}
function resolveBoundEffectiveWorkflowPlan(id, binding, loadCompiled, track, snapshot) {
  let plan;
  if (snapshot !== void 0) {
    if (snapshot.workflowId !== id) {
      throw new DocumentGovernanceBindingError(`workflow plan snapshot identity \u4E0D\u4E00\u81F4\uFF1A\u5DF2\u7ED1\u5B9A '${snapshot.workflowId}'\uFF0C\u5F53\u524D '${id}'`);
    }
    plan = effectiveWorkflowPlanFromSnapshot(snapshot, track);
  } else {
    plan = resolveEffectiveWorkflowPlan(id, loadCompiled, track);
  }
  const boundProfile = binding.documentProfile;
  const boundFingerprint = binding.documentGovernanceFingerprint;
  const boundWorkflowFingerprint = binding.workflowPlanFingerprint;
  if (boundProfile === void 0) {
    if (boundFingerprint !== void 0) {
      throw new DocumentGovernanceBindingError(`workflow '${id}' document governance binding \u635F\u574F\uFF1Afingerprint \u7F3A\u5C11 profile`);
    }
    if (boundWorkflowFingerprint !== void 0 && plan === null) {
      throw new DocumentGovernanceBindingError(`workflow '${id}' \u5DF2\u7ED1\u5B9A workflow plan fingerprint\uFF0C\u5B9A\u4E49\u7F3A\u5931\u65F6\u62D2\u7EDD\u8FD0\u884C`);
    }
    if (boundWorkflowFingerprint !== void 0 && plan !== null && plan.workflowFingerprint !== boundWorkflowFingerprint) {
      throw new DocumentGovernanceBindingError(`workflow '${id}' workflow plan fingerprint \u4E0E\u521D\u59CB\u5316\u7ED1\u5B9A\u4E0D\u4E00\u81F4`);
    }
    return plan;
  }
  if (plan === null) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' \u5DF2\u7ED1\u5B9A document governance profile '${boundProfile}'\uFF0C\u5B9A\u4E49\u7F3A\u5931\u65F6\u62D2\u7EDD\u8FD0\u884C`);
  }
  const effectiveProfile = profileFor(plan.documentPolicy);
  if (effectiveProfile === void 0) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' \u5DF2\u7ED1\u5B9A document governance profile '${boundProfile}'\uFF0C\u4E0D\u53EF\u964D\u7EA7\u4E3A\u81EA\u7531\u6A21\u5F0F`);
  }
  if (effectiveProfile !== boundProfile) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' document governance profile \u4E0D\u53EF\u53D8\uFF1A\u5DF2\u7ED1\u5B9A '${boundProfile}'\uFF0C\u5F53\u524D '${effectiveProfile}'`);
  }
  const effectivePolicy = plan.documentPolicy;
  if (effectivePolicy === void 0) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' \u5DF2\u7ED1\u5B9A document governance profile '${boundProfile}'\uFF0C\u5F53\u524D policy \u7F3A\u5931`);
  }
  if (boundFingerprint !== void 0 && documentGovernanceFingerprint(effectivePolicy) !== boundFingerprint) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' document governance fingerprint \u4E0E\u521D\u59CB\u5316\u7ED1\u5B9A\u4E0D\u4E00\u81F4`);
  }
  if (boundWorkflowFingerprint !== void 0 && plan.workflowFingerprint !== boundWorkflowFingerprint) {
    throw new DocumentGovernanceBindingError(`workflow '${id}' workflow plan fingerprint \u4E0E\u521D\u59CB\u5316\u7ED1\u5B9A\u4E0D\u4E00\u81F4`);
  }
  return plan;
}

// packages/kernel/dist/state/state-init.js
var DEFAULT_PLAN = compileEffectiveWorkflowPlan("default");
var DEFAULT_PLAN_BINDING = effectiveWorkflowPlanBinding(DEFAULT_PLAN);
function defaultStateClock() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z");
}
async function detectBaseBranch(repoRoot) {
  try {
    const gitPath = path2.join(repoRoot, ".git");
    let gitDir = gitPath;
    const entry = await stat2(gitPath);
    if (!entry.isDirectory()) {
      const pointer = await readFile6(gitPath, "utf8");
      const match = /^gitdir:\s*(.+)$/m.exec(pointer);
      const target = match?.[1]?.trim();
      if (!target)
        return "main";
      gitDir = path2.resolve(repoRoot, target);
    }
    const head = await readFile6(path2.join(gitDir, "HEAD"), "utf8");
    const branch = /^ref: refs\/heads\/(\S+)$/.exec(head.trim())?.[1];
    if (branch)
      return branch;
  } catch {
  }
  return "main";
}
function initialDocumentProfile(opts) {
  const workflow = opts.initialWorkflow;
  if (workflow?.documentProfile !== void 0)
    return workflow.documentProfile;
  if (workflow?.openspecContract === true)
    return "legacy-full";
  if (workflow?.documentContract === true)
    return "document-v1";
  const workflowId = workflow?.workflow ?? DEFAULT_PLAN.id;
  return resolveEffectiveWorkflowPlan(workflowId, () => null)?.capabilities.documents.profile;
}
function initialDocumentGovernanceFingerprint(opts) {
  const explicit = opts.initialWorkflow?.documentGovernanceFingerprint;
  if (explicit !== void 0)
    return explicit;
  return initialDocumentProfile(opts) === "legacy-full" ? DEFAULT_PLAN_BINDING.documentGovernanceFingerprint : void 0;
}
function initialWorkflowPlanFingerprint(opts) {
  const explicit = opts.initialWorkflow?.workflowPlanFingerprint;
  if (explicit !== void 0)
    return explicit;
  const workflowId = opts.initialWorkflow?.workflow ?? DEFAULT_PLAN.id;
  return resolveEffectiveWorkflowPlan(workflowId, () => null)?.workflowFingerprint;
}
function initialRunMetadata(opts) {
  if (!opts.runId)
    return void 0;
  const documentProfile = initialDocumentProfile(opts);
  const documentGovernanceFingerprint2 = initialDocumentGovernanceFingerprint(opts);
  const workflowPlanFingerprint = initialWorkflowPlanFingerprint(opts);
  const workflowPlanSnapshot2 = opts.initialWorkflow?.workflowPlanSnapshot;
  return {
    runId: opts.runId,
    transitionSequence: 0,
    ...documentProfile === void 0 ? {} : { documentProfile },
    ...documentGovernanceFingerprint2 === void 0 ? {} : { documentGovernanceFingerprint: documentGovernanceFingerprint2 },
    ...workflowPlanFingerprint === void 0 ? {} : { workflowPlanFingerprint },
    ...workflowPlanSnapshot2 === void 0 ? {} : { workflowPlanSnapshot: workflowPlanSnapshot2 }
  };
}
function initialFields(opts, timestamp, baseBranch, createdBy) {
  const fields = emptyFields();
  fields.track = opts.track;
  fields.preset = opts.preset;
  fields.created_by = createdBy;
  fields.assignee = "null";
  fields.phase = opts.initialWorkflow?.phase ?? "open";
  fields.phase_status = "pending";
  fields.design_doc = "null";
  fields.plan = "null";
  fields.verification_report = "null";
  fields.build_mode = "null";
  fields.isolation = "null";
  fields.build_sha = "null";
  fields.agent_review_result = opts.reviewSeed;
  fields.codex_review_result = opts.reviewSeed;
  fields.verify_result = "pending";
  fields.branch_status = "pending";
  fields.pre_verify_review_result = "pending";
  fields.direct_override = "false";
  fields.prd_path = "null";
  fields.pr_url = "null";
  fields.automation = "off";
  fields.automation_queued_at = "";
  fields.automation_sandbox = "";
  fields.automation_worktree = "";
  fields.automation_attempts = "0";
  fields.automation_last_error = "";
  fields.automation_preserved_path = "";
  fields.branch = "null";
  fields.base_branch = baseBranch;
  fields.scope = "null";
  fields.related_files = "null";
  fields.spec_scope = "null";
  fields.depends_on = "null";
  fields.created_at = timestamp;
  fields.updated_at = timestamp;
  fields.verified_at = "null";
  fields.archived_at = "null";
  fields.archived = "false";
  if (opts.initialWorkflow)
    fields.workflow = opts.initialWorkflow.workflow;
  fields.automation_current_phase = "";
  fields.automation_cause = "";
  fields.review_gate_phase = "";
  fields.review_gate_status = "";
  fields.review_gate_event = "";
  fields.review_requested_at = "";
  fields.review_acknowledged_at = "";
  return fields;
}

// packages/kernel/dist/state/document-locale.js
import { lstat as lstat4, readFile as readFile7 } from "node:fs/promises";
import { join as join9 } from "node:path";
var DOCUMENT_LOCALE_FILE = ".pipeline-document-locale.json";
function errorCode2(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const value = Reflect.get(error, "code");
  return typeof value === "string" ? value : void 0;
}
function parseDocumentLocalePin(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("document locale pin \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("document locale pin \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const record2 = value;
  if (Object.keys(record2).some((key) => key !== "version" && key !== "locale") || record2.version !== 1 || record2.locale !== "zh-CN" && record2.locale !== "en") {
    throw new Error("document locale pin \u5F62\u72B6\u975E\u6CD5");
  }
  return { version: 1, locale: record2.locale };
}
async function readDocumentLocalePin(changeDir) {
  const target = join9(changeDir, DOCUMENT_LOCALE_FILE);
  try {
    const info = await lstat4(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`document locale pin \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${target}`);
    }
    return parseDocumentLocalePin(await readFile7(target, "utf8"));
  } catch (error) {
    if (errorCode2(error) === "ENOENT")
      return void 0;
    throw error;
  }
}
async function ensureDocumentLocalePin(changeDir, locale) {
  const existing = await readDocumentLocalePin(changeDir);
  if (existing !== void 0) {
    if (existing.locale !== locale) {
      throw new Error(`Change \u5DF2\u56FA\u5B9A document locale '${existing.locale}'\uFF0C\u62D2\u7EDD\u6539\u4E3A '${locale}'`);
    }
    return existing;
  }
  const pin = { version: 1, locale };
  const target = join9(changeDir, DOCUMENT_LOCALE_FILE);
  try {
    await atomicLinkPublish(changeDir, ".pipeline-document-locale.tmp", target, `${JSON.stringify(pin)}
`);
    return pin;
  } catch (error) {
    if (errorCode2(error) !== "EEXIST")
      throw error;
    const raced = await readDocumentLocalePin(changeDir);
    if (raced === void 0)
      throw new Error(`document locale pin \u5E76\u53D1\u521B\u5EFA\u540E\u4E0D\u53EF\u8BFB\u53D6: ${target}`);
    if (raced.locale !== locale) {
      throw new Error(`Change \u5DF2\u56FA\u5B9A document locale '${raced.locale}'\uFF0C\u62D2\u7EDD\u6539\u4E3A '${locale}'`);
    }
    return raced;
  }
}

// packages/kernel/dist/state/workflow-plan-snapshot.js
import { lstat as lstat5, readFile as readFile8 } from "node:fs/promises";
import { join as join10 } from "node:path";
var WORKFLOW_PLAN_SNAPSHOT_FILE = ".pipeline-workflow-plan.json";
function errorCode3(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const value = Reflect.get(error, "code");
  return typeof value === "string" ? value : void 0;
}
function ownRecord3(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return void 0;
  return Object.fromEntries(Object.entries(value));
}
function isWorkflowIr(value) {
  const record2 = ownRecord3(value);
  return record2 !== void 0 && typeof record2.name === "string" && Array.isArray(record2.steps);
}
function parseEnvelope(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("workflow plan snapshot \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  const envelope = ownRecord3(value);
  const plan = ownRecord3(envelope?.plan);
  const planVersion = plan?.version;
  const allowedPlanKeys = planVersion === 2 ? ["version", "workflowId", "executionModel", "workflow", "documentPolicy", "workflowFingerprint"] : ["version", "workflowId", "executionModel", "workflow", "workflowFingerprint"];
  const documentPolicy = plan?.documentPolicy;
  if (!envelope || Object.keys(envelope).some((key) => !["version", "run_id", "plan"].includes(key)) || envelope.version !== 1 || typeof envelope.run_id !== "string" || envelope.run_id === "" || !plan || Object.keys(plan).some((key) => !allowedPlanKeys.includes(key)) || planVersion !== 1 && planVersion !== 2 || typeof plan.workflowId !== "string" || plan.executionModel !== "phase-manifest" && plan.executionModel !== "step-graph" || planVersion === 2 && documentPolicy !== null && ownRecord3(documentPolicy) === void 0 || typeof plan.workflowFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(plan.workflowFingerprint) || !isWorkflowIr(plan.workflow)) {
    throw new Error("workflow plan snapshot \u5F62\u72B6\u975E\u6CD5");
  }
  const snapshot = planVersion === 1 ? {
    version: 1,
    workflowId: plan.workflowId,
    executionModel: plan.executionModel,
    workflow: plan.workflow,
    workflowFingerprint: plan.workflowFingerprint
  } : {
    version: 2,
    workflowId: plan.workflowId,
    executionModel: plan.executionModel,
    workflow: plan.workflow,
    documentPolicy,
    workflowFingerprint: plan.workflowFingerprint
  };
  effectiveWorkflowPlanFromSnapshot(snapshot);
  return { version: 1, run_id: envelope.run_id, plan: snapshot };
}
function workflowPlanSnapshotContent(runId, snapshot) {
  return `${JSON.stringify({ version: 1, run_id: runId, plan: snapshot })}
`;
}
async function readWorkflowPlanSnapshot(changeDir) {
  const target = join10(changeDir, WORKFLOW_PLAN_SNAPSHOT_FILE);
  try {
    const info = await lstat5(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`workflow plan snapshot \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${target}`);
    }
    return parseEnvelope(await readFile8(target, "utf8"));
  } catch (error) {
    if (errorCode3(error) === "ENOENT")
      return void 0;
    throw error;
  }
}
async function ensureWorkflowPlanSnapshot(changeDir, runId, snapshot) {
  const requested = workflowPlanSnapshotContent(runId, snapshot);
  const existing = await readWorkflowPlanSnapshot(changeDir);
  if (existing !== void 0) {
    if (`${JSON.stringify(existing)}
` !== requested) {
      throw new Error("Change \u5DF2\u56FA\u5B9A\u4E0D\u540C\u7684 workflow plan snapshot\uFF0C\u62D2\u7EDD\u8986\u76D6");
    }
    return;
  }
  const target = join10(changeDir, WORKFLOW_PLAN_SNAPSHOT_FILE);
  try {
    await atomicLinkPublish(changeDir, ".pipeline-workflow-plan.tmp", target, requested);
  } catch (error) {
    if (errorCode3(error) !== "EEXIST")
      throw error;
    const raced = await readWorkflowPlanSnapshot(changeDir);
    if (raced === void 0 || `${JSON.stringify(raced)}
` !== requested) {
      throw new Error("workflow plan snapshot \u5E76\u53D1\u521B\u5EFA\u540E\u5185\u5BB9\u4E0D\u4E00\u81F4");
    }
  }
}
function attachWorkflowPlanSnapshot(metadata, envelope) {
  if (metadata === void 0 || envelope === void 0)
    return metadata;
  if (envelope.run_id !== metadata.runId) {
    throw new Error("workflow plan snapshot \u4E0E canonical runId \u4E0D\u4E00\u81F4");
  }
  if (metadata.workflowPlanFingerprint === void 0 || envelope.plan.workflowFingerprint !== metadata.workflowPlanFingerprint) {
    throw new Error("workflow plan snapshot \u4E0E workflow governance fingerprint \u4E0D\u4E00\u81F4");
  }
  return { ...metadata, workflowPlanSnapshot: envelope.plan };
}

// packages/kernel/dist/state/initial-change-publish.js
import { randomUUID as randomUUID4 } from "node:crypto";
import { link as link2, lstat as lstat7, mkdir as mkdir6, readdir, rm as rm2, rmdir, unlink as unlink2, writeFile as writeFile3 } from "node:fs/promises";
import path3 from "node:path";

// packages/kernel/dist/state/trusted-project-path.js
import { lstat as lstat6, mkdir as mkdir5, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve as resolve2, sep } from "node:path";
function escaped(root, target) {
  const rel = relative(root, target);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}
async function ordinaryDirectory(target) {
  const info = await lstat6(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`\u53EF\u4FE1\u8DEF\u5F84\u5FC5\u987B\u662F\u975E symlink \u76EE\u5F55: ${target}`);
  }
}
async function ensureTrustedProjectDirectory(repoRoot, targetDirectory) {
  const root = resolve2(repoRoot);
  const target = resolve2(targetDirectory);
  if (escaped(root, target)) {
    throw new Error(`\u53EF\u4FE1\u8DEF\u5F84\u8D8A\u8FC7\u9879\u76EE\u6839: ${targetDirectory}`);
  }
  await ordinaryDirectory(root);
  let cursor = root;
  const segments = relative(root, target).split(sep).filter(Boolean);
  for (const segment of segments) {
    cursor = resolve2(cursor, segment);
    try {
      await ordinaryDirectory(cursor);
    } catch (error) {
      if (error.code !== "ENOENT")
        throw error;
      try {
        await mkdir5(cursor);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST")
          throw mkdirError;
      }
      await ordinaryDirectory(cursor);
    }
  }
  const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)]);
  if (escaped(rootReal, targetReal)) {
    throw new Error(`\u53EF\u4FE1\u8DEF\u5F84\u771F\u5B9E\u4F4D\u7F6E\u8D8A\u8FC7\u9879\u76EE\u6839: ${targetDirectory}`);
  }
  return target;
}

// packages/kernel/dist/state/initial-change-publish.js
var CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
var INITIAL_LOCK_STALE_MS = 12e4;
var INITIAL_LOCK_WAIT_MS = 1e4;
function errorCode4(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : void 0;
}
function alreadyInitialized(pathname) {
  const error = new Error(`init: change \u5DF2\u5B58\u5728\uFF0C\u62D2\u7EDD\u8986\u76D6: ${pathname}`);
  error.code = "EEXIST";
  error.path = pathname;
  return error;
}
function contained(root, target) {
  const rel = path3.relative(root, target);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${path3.sep}`) && !path3.isAbsolute(rel);
}
async function assertMissing(target) {
  try {
    await lstat7(target);
    throw alreadyInitialized(target);
  } catch (error) {
    if (errorCode4(error) !== "ENOENT")
      throw error;
  }
}
function publicationOrder(name) {
  if (name === ".pipeline-run")
    return 1;
  if (name === ".pipeline.yaml" || name === "current.json")
    return 2;
  return 0;
}
async function rememberPublishedEntry(pathname, kind, published) {
  const identity = await lstat7(pathname);
  published.push({ pathname, dev: identity.dev, ino: identity.ino, kind });
}
async function publishTreeNoReplace(sourceDir, targetDir, published) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  entries.sort((left, right) => publicationOrder(left.name) - publicationOrder(right.name) || left.name.localeCompare(right.name));
  for (const entry of entries) {
    const source = path3.join(sourceDir, entry.name);
    const target = path3.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir6(target);
      await rememberPublishedEntry(target, "directory", published);
      await publishTreeNoReplace(source, target, published);
      await rmdir(source);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`init: \u5019\u9009\u76EE\u5F55\u542B\u4E0D\u53D7\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B: ${source}`);
    }
    await link2(source, target);
    await rememberPublishedEntry(target, "file", published);
    await unlink2(source);
  }
}
async function rollbackPublishedEntries(published) {
  for (const entry of [...published].reverse()) {
    try {
      const current = await lstat7(entry.pathname);
      if (current.dev !== entry.dev || current.ino !== entry.ino)
        continue;
      if (entry.kind === "directory")
        await rmdir(entry.pathname);
      else
        await unlink2(entry.pathname);
    } catch {
    }
  }
}
function assertValidChangeName(name) {
  if (!CHANGE_NAME_RE.test(name) || name.includes("..")) {
    throw new Error(`init: \u975E\u6CD5 change \u540D '${name}'\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF0C\u7981 ..\uFF09`);
  }
}
async function acquireInitialNameLock(changesDir, name) {
  const lockDir = path3.join(changesDir, `.pipeline-init-lock-${name}`);
  const deadline = Date.now() + INITIAL_LOCK_WAIT_MS;
  while (true) {
    try {
      await mkdir6(lockDir);
      return lockDir;
    } catch (error) {
      if (errorCode4(error) !== "EEXIST")
        throw error;
      try {
        const info = await lstat7(lockDir);
        if (!info.isDirectory() || info.isSymbolicLink()) {
          throw alreadyInitialized(lockDir);
        }
        if (Date.now() - info.mtimeMs > INITIAL_LOCK_STALE_MS) {
          await rmdir(lockDir);
          continue;
        }
      } catch (inspectionError) {
        if (errorCode4(inspectionError) === "ENOENT")
          continue;
        if (errorCode4(inspectionError) !== "ENOTEMPTY")
          throw inspectionError;
      }
      if (Date.now() >= deadline) {
        const timeout = new Error(`init: \u7B49\u5F85\u540C\u540D Change \u521D\u59CB\u5316\u9501\u8D85\u65F6: ${lockDir}`);
        timeout.code = "EBUSY";
        throw timeout;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
  }
}
async function releaseInitialChangePublication(publication) {
  await rmdir(publication.lockDir).catch(() => {
  });
}
async function prepareInitialChangePublication(inputRoot, name) {
  const repoRoot = path3.resolve(inputRoot);
  const changesDir = path3.join(repoRoot, "openspec", "changes");
  const finalChangeDir = path3.join(changesDir, name);
  await ensureTrustedProjectDirectory(repoRoot, changesDir);
  const lockDir = await acquireInitialNameLock(changesDir, name);
  try {
    await assertMissing(finalChangeDir);
    const candidateChangeDir = path3.join(changesDir, `.pipeline-init-${name}-${process.pid}-${randomUUID4()}`);
    await mkdir6(candidateChangeDir);
    return { repoRoot, changesDir, finalChangeDir, candidateChangeDir, lockDir };
  } catch (error) {
    await rmdir(lockDir).catch(() => {
    });
    throw error;
  }
}
async function writeInitialChangeFiles(changeDir, files) {
  const observed = /* @__PURE__ */ new Set();
  for (const file of files ?? []) {
    const target = path3.resolve(changeDir, file.relativePath);
    if (file.relativePath === "" || !contained(changeDir, target) || observed.has(target)) {
      throw new Error(`init: initial file \u8DEF\u5F84\u975E\u6CD5\u6216\u91CD\u590D: ${file.relativePath}`);
    }
    observed.add(target);
    await mkdir6(path3.dirname(target), { recursive: true });
    await writeFile3(target, file.content, { encoding: "utf8", flag: "wx" });
  }
}
async function publishInitialChange(publication) {
  const { candidateChangeDir, changesDir, finalChangeDir, repoRoot } = publication;
  await ensureTrustedProjectDirectory(repoRoot, changesDir);
  const published = [];
  try {
    await mkdir6(finalChangeDir);
    await rememberPublishedEntry(finalChangeDir, "directory", published);
    await publishTreeNoReplace(candidateChangeDir, finalChangeDir, published);
    await rmdir(candidateChangeDir);
  } catch (error) {
    await rollbackPublishedEntries(published);
    if (!["ENOTDIR", "EEXIST", "ENOTEMPTY"].includes(errorCode4(error) ?? ""))
      throw error;
    throw alreadyInitialized(finalChangeDir);
  }
}
async function discardInitialChangeCandidate(changeDir) {
  await rm2(changeDir, { recursive: true, force: true }).catch(() => {
  });
}

// packages/kernel/dist/state/store.js
var STATE_FILE_NAME = ".pipeline.yaml";
var StateProjectionDriftError = class extends Error {
  _tag = "StateProjectionDriftError";
};
function stateFilePath(changeDir) {
  return path4.join(changeDir, STATE_FILE_NAME);
}
var atomicWriteFile = atomicReplaceFile;
function gateValue(field, value) {
  if (Array.isArray(value)) {
    for (const item2 of value)
      quoteGate(field, item2);
  } else {
    quoteGate(field, value);
  }
}
function stateWithoutProjection(state) {
  return {
    fields: structuredClone(state.fields),
    ...state.runMetadata === void 0 ? {} : { runMetadata: withoutWorkflowGovernanceBinding(structuredClone(state.runMetadata)) },
    opaqueTail: state.opaqueTail
  };
}
var FIELD_SET2 = new Set(FIELD_ORDER);
var REVIEW_GATE_FIELD_SET2 = new Set(REVIEW_GATE_FIELDS);
function isPreciseLegacyFieldProjection(raw, parsed, current) {
  const expected = projectionMetadataFor(current);
  const metadata = parsed.projectionMetadata;
  if (!metadata || metadata.stateRevision !== expected.stateRevision || metadata.stateRevisionId !== expected.stateRevisionId || metadata.stateDigest !== expected.stateDigest)
    return false;
  try {
    const normalized2 = splitPreVerifyReviewAnchor(stateWithoutProjection(parsed)).state;
    if (serializePipeline(normalized2) !== serializePipeline(current.state))
      return false;
  } catch {
    return false;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_]+):/.exec(line);
    if (!match)
      continue;
    const key = match[1] ?? "";
    if (!FIELD_SET2.has(key))
      break;
    if (seen.has(key))
      return false;
    seen.add(key);
  }
  const omitsCompleteReviewGate = REVIEW_GATE_FIELDS.every((field) => !seen.has(field));
  const omitsPreVerifyReview = !seen.has(PRE_VERIFY_REVIEW_FIELD);
  if (!omitsCompleteReviewGate && !omitsPreVerifyReview)
    return false;
  return FIELD_ORDER.every((field) => seen.has(field) || omitsCompleteReviewGate && REVIEW_GATE_FIELD_SET2.has(field) || omitsPreVerifyReview && field === PRE_VERIFY_REVIEW_FIELD);
}
async function inspectProjectionAgainst(changeDir, current) {
  if (current === void 0)
    return { status: "legacy" };
  const identity = { revision: current.revision, revisionId: current.revisionId };
  let raw;
  try {
    raw = await readFile9(stateFilePath(changeDir), "utf8");
  } catch (error) {
    if (error.code === "ENOENT")
      return { status: "missing", ...identity };
    throw error;
  }
  if (raw === projectionContent(current) || raw === priorLogicalProjectionContent(current)) {
    return { status: "current", ...identity };
  }
  let parsed;
  try {
    parsed = parsePipeline(raw);
  } catch (error) {
    return { status: "drift", ...identity, reason: `YAML adapter \u65E0\u6CD5\u89E3\u6790: ${String(error)}` };
  }
  const metadata = parsed.projectionMetadata;
  if (metadata === void 0) {
    try {
      if (serializePipeline(stateWithoutProjection(parsed)) === serializePipeline(current.state)) {
        return { status: "legacy-compatible", ...identity };
      }
    } catch (error) {
      return { status: "drift", ...identity, reason: `legacy adapter \u4E0D\u53EF\u91CD\u5EFA: ${String(error)}` };
    }
    return {
      status: "drift",
      ...identity,
      reason: "canonical \u5B58\u5728\u4F46 adapter \u65E0 revision \u4E14\u5185\u5BB9\u4E0D\u540C"
    };
  }
  if (isPreciseLegacyFieldProjection(raw, parsed, current)) {
    return { status: "current", ...identity };
  }
  const referenced = await readImmutableRunRevision(changeDir, metadata.stateRevision, metadata.stateRevisionId);
  if (referenced !== void 0 && referenced.stateDigest === metadata.stateDigest && (raw === projectionContent(referenced) || raw === priorLogicalProjectionContent(referenced) || isPreciseLegacyFieldProjection(raw, parsed, referenced)))
    return { status: "stale", ...identity };
  return {
    status: "drift",
    ...identity,
    reason: "revision metadata \u4E0E adapter \u5185\u5BB9\u4E0D\u4E00\u81F4"
  };
}
var FsStateStore = class {
  writeProjection;
  beforeInitialPublish;
  constructor(options = {}) {
    this.writeProjection = options.writeProjection ?? atomicWriteFile;
    this.beforeInitialPublish = options.beforeInitialPublish;
  }
  async read(changeDir) {
    const current = await readCurrentRunRevision(changeDir);
    if (current !== void 0) {
      const state = structuredClone(current.state);
      const binding = await readWorkflowGovernanceBinding(changeDir);
      const governedMetadata = attachWorkflowGovernanceBinding(state.runMetadata, binding);
      const metadata = attachWorkflowPlanSnapshot(governedMetadata, await readWorkflowPlanSnapshot(changeDir));
      return {
        ...state,
        ...metadata === void 0 ? {} : { runMetadata: metadata }
      };
    }
    return parsePipeline(await readFile9(stateFilePath(changeDir), "utf8"));
  }
  async write(changeDir, state, mutation = { kind: "replace" }) {
    return withLock(changeDir, () => this.writeUnderLock(changeDir, state, mutation));
  }
  async writeUnderLock(changeDir, state, mutation = { kind: "replace" }) {
    if (state.runMetadata !== void 0 && (state.runMetadata.documentProfile !== void 0 || state.runMetadata.documentGovernanceFingerprint !== void 0 || state.runMetadata.workflowPlanFingerprint !== void 0)) {
      await ensureWorkflowGovernanceBinding(changeDir, state.runMetadata);
    }
    if (state.runMetadata?.workflowPlanSnapshot !== void 0) {
      await ensureWorkflowPlanSnapshot(changeDir, state.runMetadata.runId, state.runMetadata.workflowPlanSnapshot);
    }
    const nextState = stateWithoutProjection(state);
    serializePipeline(nextState);
    let current = await readCurrentRunRevision(changeDir);
    if (current === void 0) {
      const legacy = parsePipeline(await readFile9(stateFilePath(changeDir), "utf8"));
      current = await publishInitialRunRevision(changeDir, legacy, defaultStateClock(), "migration");
    } else {
      const status = await inspectProjectionAgainst(changeDir, current);
      if (status.status === "drift") {
        throw new StateProjectionDriftError(`YAML projection drift\uFF1A${status.reason}`);
      }
    }
    const next = await publishRunRevision(changeDir, current, nextState, {
      kind: mutation.kind,
      observedAt: defaultStateClock(),
      ...mutation.transitionRecordId === void 0 ? {} : { transitionRecordId: mutation.transitionRecordId }
    });
    try {
      await this.writeProjection(stateFilePath(changeDir), projectionContent(next));
      return { projection: { status: "updated" } };
    } catch (error) {
      return { projection: { status: "pending", error } };
    }
  }
  async get(changeDir, field) {
    const state = await this.read(changeDir);
    return state.fields[field];
  }
  async set(changeDir, field, value) {
    await this.setMany(changeDir, { [field]: value }, "set");
  }
  async setMany(changeDir, kv, mutationKind = "set-many") {
    const entries = Object.entries(kv).filter((e) => e[1] !== void 0);
    for (const [field, value] of entries)
      gateValue(field, value);
    if (entries.length === 0)
      return;
    await withLock(changeDir, async () => {
      const state = await this.read(changeDir);
      for (const [field, value] of entries)
        state.fields[field] = value;
      await this.writeUnderLock(changeDir, state, { kind: mutationKind });
    });
  }
  async cas(changeDir, field, expect, next) {
    quoteGate(field, next);
    return withLock(changeDir, async () => {
      const state = await this.read(changeDir);
      if (state.fields[field] !== expect)
        return false;
      state.fields[field] = next;
      await this.writeUnderLock(changeDir, state, { kind: "cas" });
      return true;
    });
  }
  async casMany(changeDir, field, expects, kv) {
    const entries = Object.entries(kv).filter((e) => e[1] !== void 0);
    for (const [entryField, value] of entries)
      gateValue(entryField, value);
    return withLock(changeDir, async () => {
      const state = await this.read(changeDir);
      const observed = state.fields[field];
      if (typeof observed !== "string" || !expects.includes(observed))
        return false;
      for (const [entryField, value] of entries)
        state.fields[entryField] = value;
      await this.writeUnderLock(changeDir, state, { kind: "cas-many" });
      return true;
    });
  }
  async inspectProjection(changeDir) {
    return inspectProjectionAgainst(changeDir, await readCurrentRunRevision(changeDir));
  }
  async repairProjection(changeDir, opts = {}) {
    return withLock(changeDir, async () => {
      const current = await readCurrentRunRevision(changeDir);
      if (current === void 0) {
        throw new StateProjectionDriftError("repair-projection: canonical current \u4E0D\u5B58\u5728\uFF1B\u4ECD\u662F legacy change");
      }
      const status = await inspectProjectionAgainst(changeDir, current);
      if (status.status === "current")
        return status;
      if (status.status === "drift" && opts.forceCanonical !== true) {
        throw new StateProjectionDriftError(`repair-projection \u62D2\u7EDD\u8986\u76D6\u672A\u77E5 YAML drift\uFF1A${status.reason}\uFF1B\u663E\u5F0F\u9009\u62E9 canonical \u8986\u76D6\u6216 legacy import`);
      }
      await this.writeProjection(stateFilePath(changeDir), projectionContent(current));
      return { status: "current", revision: current.revision, revisionId: current.revisionId };
    });
  }
  async importLegacyProjection(changeDir) {
    return withLock(changeDir, async () => {
      const current = await readCurrentRunRevision(changeDir);
      if (current === void 0) {
        throw new StateProjectionDriftError("import-legacy: canonical current \u4E0D\u5B58\u5728\uFF1B\u65E0\u9700\u89E3\u51B3\u53CC\u4E3B drift");
      }
      const legacy = parsePipeline(await readFile9(stateFilePath(changeDir), "utf8"));
      const imported = {
        fields: legacy.fields,
        ...current.state.runMetadata === void 0 ? {} : { runMetadata: structuredClone(current.state.runMetadata) },
        opaqueTail: legacy.opaqueTail
      };
      serializePipeline(imported);
      const next = await publishRunRevision(changeDir, current, imported, {
        kind: "legacy-import",
        observedAt: defaultStateClock()
      });
      try {
        await this.writeProjection(stateFilePath(changeDir), projectionContent(next));
        return { projection: { status: "updated" } };
      } catch (error) {
        return { projection: { status: "pending", error } };
      }
    });
  }
  async init(opts) {
    const { name } = opts;
    assertValidChangeName(name);
    const clock = opts.clock ?? defaultStateClock;
    const publication = await prepareInitialChangePublication(opts.repoRoot, name);
    const { candidateChangeDir: changeDir, finalChangeDir } = publication;
    let published = false;
    try {
      const requestedDocumentLocale = opts.documentLocale ?? "zh-CN";
      const ts = clock();
      const baseBranch = await detectBaseBranch(opts.repoRoot);
      let createdBy = "unknown";
      if (opts.user !== void 0 && opts.user !== "" && opts.user !== "unknown") {
        try {
          quoteGate("created_by", opts.user);
          createdBy = opts.user;
        } catch (err) {
          if (!(err instanceof QuoteGateError))
            throw err;
        }
      }
      const fullRunMetadata = initialRunMetadata(opts);
      const state = {
        fields: initialFields(opts, ts, baseBranch, createdBy),
        ...fullRunMetadata === void 0 ? {} : { runMetadata: withoutWorkflowGovernanceBinding(fullRunMetadata) },
        opaqueTail: ""
      };
      await ensureDocumentLocalePin(changeDir, requestedDocumentLocale);
      if (fullRunMetadata !== void 0 && (fullRunMetadata.documentProfile !== void 0 || fullRunMetadata.documentGovernanceFingerprint !== void 0 || fullRunMetadata.workflowPlanFingerprint !== void 0)) {
        await ensureWorkflowGovernanceBinding(changeDir, fullRunMetadata);
      }
      if (fullRunMetadata?.workflowPlanSnapshot !== void 0) {
        if (fullRunMetadata.workflowPlanFingerprint === void 0) {
          throw new Error("init workflow plan snapshot \u7F3A\u5C11 workflow plan fingerprint");
        }
        await ensureWorkflowPlanSnapshot(changeDir, fullRunMetadata.runId, fullRunMetadata.workflowPlanSnapshot);
      }
      const revision = await publishInitialRunRevision(changeDir, state, ts);
      try {
        await atomicLinkPublish(changeDir, ".pipeline.yaml.tmp", stateFilePath(changeDir), projectionContent(revision));
      } catch {
      }
      await writeInitialChangeFiles(changeDir, opts.initialFiles);
      await this.beforeInitialPublish?.(changeDir, finalChangeDir);
      await publishInitialChange(publication);
      published = true;
      return finalChangeDir;
    } finally {
      if (!published)
        await discardInitialChangeCandidate(changeDir);
      await releaseInitialChangePublication(publication);
    }
  }
  async withLock(changeDir, fn) {
    return withLock(changeDir, fn);
  }
};
function createStateStore(options = {}) {
  return new FsStateStore(options);
}

// packages/kernel/dist/documents/document-presentation.generated.js
var DOCUMENT_TEMPLATE_IDS = [
  "openspec-proposal",
  "openspec-design",
  "workflow-tasks",
  "superpower-design",
  "architecture-decision-record",
  "openspec-delta-spec",
  "superpower-plan",
  "implementation-plan",
  "verification-report",
  "applied-spec"
];
var DOCUMENT_WORKFLOW_STEP_IDS = [
  "open",
  "explore",
  "spec",
  "build",
  "verify",
  "ship",
  "archive"
];
var DOCUMENT_PRESENTATION_REGISTRY = {
  "version": "v1",
  "templates": {
    "openspec-proposal": {
      "kind": "proposal",
      "path": "openspec/changes/{change}/proposal.md",
      "sections": [
        "title",
        "why",
        "whyPrompt",
        "whatChanges",
        "whatChangesPrompt",
        "capabilities",
        "newCapabilities",
        "newCapabilitiesPrompt",
        "modifiedCapabilities",
        "modifiedCapabilitiesPrompt",
        "impact",
        "impactPrompt"
      ],
      "layout": [
        "h1:title",
        "h2:why",
        "quote:whyPrompt",
        "h2:whatChanges",
        "quote:whatChangesPrompt",
        "h2:capabilities",
        "h3:newCapabilities",
        "quote:newCapabilitiesPrompt",
        "h3:modifiedCapabilities",
        "quote:modifiedCapabilitiesPrompt",
        "h2:impact",
        "quote:impactPrompt"
      ],
      "creation": "missing-only"
    },
    "openspec-design": {
      "kind": "openspec-design",
      "path": "openspec/changes/{change}/design.md",
      "sections": [
        "title",
        "hypothesis",
        "hypothesisPrompt",
        "risks",
        "questions"
      ],
      "layout": [
        "h1:title",
        "h2:hypothesis",
        "quote:hypothesisPrompt",
        "h2:risks",
        "h2:questions"
      ],
      "creation": "missing-only"
    },
    "workflow-tasks": {
      "kind": "tasks",
      "path": "openspec/changes/{change}/tasks.md",
      "sections": [
        "title",
        "taskPrompt"
      ],
      "layout": [
        "h1:title",
        "workflow-steps:taskPrompt"
      ],
      "creation": "missing-only"
    },
    "superpower-design": {
      "kind": "superpower-design",
      "path": "docs/superpowers/specs/{change}-design.md",
      "sections": [
        "title",
        "context",
        "decision",
        "alternatives",
        "risks"
      ],
      "layout": [
        "h1:title",
        "h2:context",
        "prompt-placeholder:context",
        "h2:decision",
        "prompt-placeholder:decision",
        "h2:alternatives",
        "prompt-placeholder:alternatives",
        "h2:risks",
        "prompt-placeholder:risks"
      ],
      "creation": "missing-only"
    },
    "architecture-decision-record": {
      "kind": "adr",
      "path": "docs/adr/{change}.md",
      "sections": [
        "title",
        "context",
        "decision",
        "alternatives",
        "consequences"
      ],
      "layout": [
        "h1:title",
        "h2:context",
        "prompt-placeholder:context",
        "h2:decision",
        "prompt-placeholder:decision",
        "h2:alternatives",
        "prompt-placeholder:alternatives",
        "h2:consequences",
        "prompt-placeholder:consequences"
      ],
      "creation": "missing-only"
    },
    "openspec-delta-spec": {
      "kind": "delta-spec",
      "path": "openspec/changes/{change}/specs/{capability}/spec.md",
      "sections": [
        "title",
        "operations",
        "requirement",
        "prompt",
        "scenario"
      ],
      "layout": [
        "h1:title",
        "h2:operations",
        "h3-pending:requirement",
        "text:prompt",
        "h4-pending:scenario",
        "scenario-pending"
      ],
      "creation": "missing-only"
    },
    "superpower-plan": {
      "kind": "superpower-plan",
      "path": "docs/superpowers/plans/{change}.md",
      "sections": [
        "title",
        "tasks",
        "verification",
        "rollback"
      ],
      "layout": [
        "frontmatter",
        "h1:title",
        "h2:tasks",
        "task-pending",
        "h2:verification",
        "h2:rollback"
      ],
      "creation": "missing-only"
    },
    "implementation-plan": {
      "kind": "plan",
      "path": "docs/superpowers/plans/{change}.md",
      "sections": [
        "title",
        "tasks",
        "verification",
        "rollback"
      ],
      "layout": [
        "frontmatter",
        "h1:title",
        "h2:tasks",
        "task-pending",
        "h2:verification",
        "h2:rollback"
      ],
      "creation": "missing-only"
    },
    "verification-report": {
      "kind": "verification-report",
      "path": "docs/superpowers/reports/{change}-verify.md",
      "sections": [
        "title",
        "scope",
        "commands",
        "results",
        "failures",
        "risks"
      ],
      "layout": [
        "h1:title",
        "h2:scope",
        "prompt-placeholder:scope",
        "h2:commands",
        "prompt-placeholder:commands",
        "h2:results",
        "prompt-placeholder:results",
        "h2:failures",
        "prompt-placeholder:failures",
        "h2:risks",
        "prompt-placeholder:risks"
      ],
      "creation": "missing-only"
    },
    "applied-spec": {
      "kind": "applied-spec",
      "path": "openspec/changes/{change}/applied-spec.md",
      "sections": [
        "title",
        "summary",
        "requirements",
        "evidence"
      ],
      "layout": [
        "h1:title",
        "h2:summary",
        "prompt-placeholder:summary",
        "h2:requirements",
        "prompt-placeholder:requirements",
        "h2:evidence",
        "prompt-placeholder:evidence"
      ],
      "creation": "missing-only"
    }
  }
};
var DOCUMENT_LOCALE_CATALOGS = {
  "zh-CN": {
    "openspec-proposal": {
      "title": "\u63D0\u6848",
      "why": "Why",
      "whyPrompt": "[\u5F85\u586B\u5199:open] \u7528\u4E2D\u6587\u8BF4\u660E\u95EE\u9898\u3001\u673A\u4F1A\u548C\u73B0\u5728\u5FC5\u987B\u6539\u53D8\u7684\u539F\u56E0\u3002",
      "whatChanges": "What Changes",
      "whatChangesPrompt": "[\u5F85\u586B\u5199:open] \u7528\u4E2D\u6587\u5217\u51FA\u5177\u4F53\u53D8\u5316\u3001\u8303\u56F4\u3001\u975E\u76EE\u6807\u548C\u53EF\u9A8C\u8BC1\u7ED3\u679C\u3002",
      "capabilities": "Capabilities",
      "newCapabilities": "New Capabilities",
      "newCapabilitiesPrompt": "[\u5F85\u586B\u5199:open] \u5217\u51FA\u65B0\u589E capability\uFF1B\u6CA1\u6709\u5219\u5199\u201C\u65E0\u201D\u3002",
      "modifiedCapabilities": "Modified Capabilities",
      "modifiedCapabilitiesPrompt": "[\u5F85\u586B\u5199:open] \u5217\u51FA requirement \u4F1A\u53D8\u5316\u7684\u73B0\u6709 capability\uFF1B\u6CA1\u6709\u5219\u5199\u201C\u65E0\u201D\u3002",
      "impact": "Impact",
      "impactPrompt": "[\u5F85\u586B\u5199:open] \u7528\u4E2D\u6587\u8BF4\u660E\u53D7\u5F71\u54CD\u7684\u4EE3\u7801\u3001\u5951\u7EA6\u3001\u4F9D\u8D56\u3001\u517C\u5BB9\u548C\u7CFB\u7EDF\u8FB9\u754C\u3002"
    },
    "openspec-design": {
      "title": "\u8BBE\u8BA1",
      "hypothesis": "\u521D\u59CB\u5047\u8BBE",
      "hypothesisPrompt": "[\u5F85\u586B\u5199:open] \u8BB0\u5F55\u521D\u59CB\u67B6\u6784\u6216\u4EA4\u4E92\u5047\u8BBE\uFF1BExplore \u7528\u8BC1\u636E\u548C\u51B3\u7B56\u66FF\u6362\u672C\u63D0\u793A\u3002",
      "risks": "\u98CE\u9669",
      "questions": "\u5F85\u9A8C\u8BC1\u95EE\u9898"
    },
    "workflow-tasks": {
      "title": "\u4EFB\u52A1",
      "taskPrompt": "\u5C06\u672C\u9636\u6BB5\u76EE\u6807\u62C6\u6210\u53EF\u9A8C\u8BC1\u4EFB\u52A1\u3002"
    },
    "superpower-design": {
      "title": "\u6280\u672F\u8BBE\u8BA1",
      "context": "\u80CC\u666F",
      "decision": "\u51B3\u7B56",
      "alternatives": "\u5907\u9009\u65B9\u6848",
      "risks": "\u98CE\u9669"
    },
    "architecture-decision-record": {
      "title": "\u67B6\u6784\u51B3\u7B56\u8BB0\u5F55",
      "context": "\u80CC\u666F",
      "decision": "\u51B3\u7B56",
      "alternatives": "\u5907\u9009\u65B9\u6848",
      "consequences": "\u540E\u679C"
    },
    "openspec-delta-spec": {
      "title": "OpenSpec \u589E\u91CF\u89C4\u683C",
      "operations": "ADDED Requirements",
      "requirement": "Requirement",
      "scenario": "Scenario",
      "prompt": "[\u5F85\u586B\u5199:spec] \u4F7F\u7528\u4E2D\u6587\u7F16\u5199\u9700\u6C42\u4E0E\u573A\u666F\uFF1B\u4FDD\u7559 OpenSpec \u673A\u5668\u64CD\u4F5C\u8BCD\u3002"
    },
    "superpower-plan": {
      "title": "\u5B9E\u65BD\u8BA1\u5212",
      "tasks": "\u4EFB\u52A1",
      "verification": "\u9A8C\u8BC1",
      "rollback": "\u56DE\u6EDA"
    },
    "implementation-plan": {
      "title": "\u5B9E\u65BD\u8BA1\u5212",
      "tasks": "\u4EFB\u52A1",
      "verification": "\u9A8C\u8BC1",
      "rollback": "\u56DE\u6EDA"
    },
    "verification-report": {
      "title": "\u9A8C\u8BC1\u62A5\u544A",
      "scope": "\u9A8C\u8BC1\u8303\u56F4",
      "commands": "\u6267\u884C\u547D\u4EE4",
      "results": "\u7ED3\u679C",
      "failures": "\u5931\u8D25\u4E0E\u963B\u585E",
      "risks": "\u5269\u4F59\u98CE\u9669"
    },
    "applied-spec": {
      "title": "\u5DF2\u5E94\u7528\u89C4\u683C",
      "summary": "\u53D8\u66F4\u6458\u8981",
      "requirements": "\u5DF2\u5E94\u7528\u9700\u6C42",
      "evidence": "\u4EA4\u4ED8\u8BC1\u636E"
    }
  },
  "en": {
    "openspec-proposal": {
      "title": "Proposal",
      "why": "Why",
      "whyPrompt": "[pending:open] Explain the problem or opportunity and why it matters now.",
      "whatChanges": "What Changes",
      "whatChangesPrompt": "[pending:open] List concrete changes, scope, non-goals, and verifiable outcomes.",
      "capabilities": "Capabilities",
      "newCapabilities": "New Capabilities",
      "newCapabilitiesPrompt": "[pending:open] List new capabilities, or state None.",
      "modifiedCapabilities": "Modified Capabilities",
      "modifiedCapabilitiesPrompt": "[pending:open] List existing capabilities with requirement changes, or state None.",
      "impact": "Impact",
      "impactPrompt": "[pending:open] Describe affected code, contracts, dependencies, compatibility, and systems."
    },
    "openspec-design": {
      "title": "Design",
      "hypothesis": "Initial hypothesis",
      "hypothesisPrompt": "[pending:open] Capture the initial architecture or interaction hypothesis. Explore replaces this prompt with evidence and decisions.",
      "risks": "Risks",
      "questions": "Questions to validate"
    },
    "workflow-tasks": {
      "title": "Tasks",
      "taskPrompt": "Break this phase goal into verifiable tasks."
    },
    "superpower-design": {
      "title": "Technical design",
      "context": "Context",
      "decision": "Decision",
      "alternatives": "Alternatives",
      "risks": "Risks"
    },
    "architecture-decision-record": {
      "title": "Architecture decision record",
      "context": "Context",
      "decision": "Decision",
      "alternatives": "Alternatives",
      "consequences": "Consequences"
    },
    "openspec-delta-spec": {
      "title": "OpenSpec delta specification",
      "operations": "ADDED Requirements",
      "requirement": "Requirement",
      "scenario": "Scenario",
      "prompt": "[pending:spec] Write the requirement and scenarios while preserving OpenSpec machine tokens."
    },
    "superpower-plan": {
      "title": "Implementation plan",
      "tasks": "Tasks",
      "verification": "Verification",
      "rollback": "Rollback"
    },
    "implementation-plan": {
      "title": "Implementation plan",
      "tasks": "Tasks",
      "verification": "Verification",
      "rollback": "Rollback"
    },
    "verification-report": {
      "title": "Verification report",
      "scope": "Scope",
      "commands": "Commands run",
      "results": "Results",
      "failures": "Failures and blockers",
      "risks": "Residual risks"
    },
    "applied-spec": {
      "title": "Applied specification",
      "summary": "Change summary",
      "requirements": "Applied requirements",
      "evidence": "Delivery evidence"
    }
  }
};
var DOCUMENT_WORKFLOW_STEP_LABELS = {
  "zh-CN": {
    "open": "\u7ACB\u9879",
    "explore": "\u8C03\u7814",
    "spec": "\u89C4\u683C",
    "build": "\u5B9E\u73B0",
    "verify": "\u9A8C\u8BC1",
    "ship": "\u4EA4\u4ED8",
    "archive": "\u5F52\u6863"
  },
  "en": {
    "open": "Open",
    "explore": "Explore",
    "spec": "Spec",
    "build": "Build",
    "verify": "Verify",
    "ship": "Ship",
    "archive": "Archive"
  }
};

// packages/kernel/dist/documents/document-template-renderer.js
function isLocale(value) {
  return DOCUMENT_LOCALES.includes(value);
}
function section(catalog, key) {
  const value = catalog[key];
  if (value === void 0 || value.trim() === "") {
    throw new Error(`Document Presentation Registry \u7F3A\u5C11 section '${key}'`);
  }
  return value;
}
function workflowStepLabel(step, locale, stepLabelSource) {
  const explicit = step.label?.trim();
  if (stepLabelSource === "workflow-defined")
    return explicit || step.id;
  const labels = DOCUMENT_WORKFLOW_STEP_LABELS[locale];
  return labels[step.id] ?? explicit ?? step.id;
}
function renderLayoutInstruction(instruction, catalog, locale, variables) {
  const pending = locale === "zh-CN" ? "\u5F85\u586B\u5199" : "Pending";
  if (instruction === "frontmatter") {
    return [
      "---",
      `change: ${variables.change}`,
      ...variables.designDoc ? [`design-doc: ${variables.designDoc}`] : [],
      `locale: ${locale}`,
      "---"
    ];
  }
  if (instruction === "task-pending")
    return [`- [ ] ${pending}`];
  if (instruction === "scenario-pending") {
    return [`- **WHEN** ${pending}`, `- **THEN** ${pending}`];
  }
  const separator = instruction.indexOf(":");
  if (separator === -1) {
    throw new Error(`Document Presentation Registry layout \u6307\u4EE4\u65E0\u6548: '${instruction}'`);
  }
  const operation = instruction.slice(0, separator);
  const key = instruction.slice(separator + 1);
  const value = section(catalog, key);
  if (operation === "workflow-steps") {
    const steps = variables.workflowSteps ?? DOCUMENT_WORKFLOW_STEP_IDS.map((id) => ({ id }));
    return steps.flatMap((step, index) => [
      `## ${workflowStepLabel(step, locale, variables.workflowStepLabelSource)}`,
      "",
      `- [ ] ${index === 0 ? value : `${value} (${step.id})`}`,
      ...index === steps.length - 1 ? [] : [""]
    ]);
  }
  const heading = /^h([1-4])(-pending)?$/u.exec(operation);
  if (heading) {
    const level = Number(heading[1]);
    return [`${"#".repeat(level)} ${value}${heading[2] ? `: ${pending}` : ""}`];
  }
  if (operation === "quote")
    return [`> ${value}`];
  if (operation === "text")
    return [value];
  if (operation === "prompt-placeholder") {
    return [`> ${locale === "zh-CN" ? "[\u5F85\u586B\u5199]" : "[pending]"} ${value}`];
  }
  throw new Error(`Document Presentation Registry layout operation \u672A\u77E5: '${operation}'`);
}
function renderDocumentTemplate(templateId, locale, variables) {
  if (!DOCUMENT_TEMPLATE_IDS.includes(templateId)) {
    throw new Error(`\u672A\u77E5 document template '${templateId}'`);
  }
  if (!isLocale(locale))
    throw new Error(`\u4E0D\u652F\u6301 document locale '${locale}'`);
  const catalog = DOCUMENT_LOCALE_CATALOGS[locale][templateId];
  const layout = DOCUMENT_PRESENTATION_REGISTRY.templates[templateId].layout;
  const output = layout.flatMap((instruction) => [
    ...renderLayoutInstruction(instruction, catalog, locale, variables),
    ""
  ]).join("\n");
  return output.endsWith("\n") ? output : `${output}
`;
}

// packages/kernel/dist/state/default-openspec-scaffold.js
function defaultOpenSpecScaffoldFiles(change, locale = "zh-CN", workflowSteps, workflowStepLabelSource = "localized-builtin") {
  return [
    {
      relativePath: "proposal.md",
      content: renderDocumentTemplate("openspec-proposal", locale, { change })
    },
    {
      relativePath: "design.md",
      content: renderDocumentTemplate("openspec-design", locale, { change })
    },
    {
      relativePath: "tasks.md",
      content: renderDocumentTemplate("workflow-tasks", locale, {
        change,
        workflowStepLabelSource,
        workflowSteps
      })
    }
  ];
}

// packages/kernel/dist/state/document-ledger.js
import { lstat as lstat9, readFile as readFile11 } from "node:fs/promises";
import { join as join12 } from "node:path";

// packages/kernel/dist/state/document-path.js
import { createHash as createHash4 } from "node:crypto";
import { lstat as lstat8, readFile as readFile10, realpath as realpath2 } from "node:fs/promises";
import { basename, isAbsolute as isAbsolute2, relative as relative2, resolve as resolve3, sep as sep2 } from "node:path";
var DocumentLedgerError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DocumentLedgerError";
  }
};
function normalizeRelativePath(path7) {
  return path7.split(sep2).join("/");
}
function inside(base, candidate) {
  const pathFromBase = relative2(base, candidate);
  return pathFromBase !== "" && pathFromBase !== ".." && !pathFromBase.startsWith(`..${sep2}`) && !isAbsolute2(pathFromBase);
}
function deltaSpecSlot(path7, changeDir) {
  const parts = path7.split("/");
  const changeName = basename(resolve3(changeDir));
  if (parts.length !== 6 || parts[0] !== "openspec" || parts[1] !== "changes" || parts[2] !== changeName || parts[3] !== "specs" || !parts[4] || parts[5] !== "spec.md") {
    return void 0;
  }
  return `delta-spec:${parts[4]}`;
}
async function resolveDocument(repoRoot, path7) {
  if (!path7 || isAbsolute2(path7))
    throw new DocumentLedgerError(`document path \u5FC5\u987B\u662F\u9879\u76EE\u76F8\u5BF9\u8DEF\u5F84: ${path7 || "(empty)"}`);
  const lexicalRoot = resolve3(repoRoot);
  const lexicalTarget = resolve3(repoRoot, path7);
  if (!inside(lexicalRoot, lexicalTarget))
    throw new DocumentLedgerError(`document path \u8D8A\u51FA\u9879\u76EE\u6839: ${path7}`);
  const relativePath = normalizeRelativePath(relative2(lexicalRoot, lexicalTarget));
  if (!relativePath.startsWith("openspec/") && !relativePath.startsWith("docs/")) {
    throw new DocumentLedgerError(`document path \u53EA\u80FD\u4F4D\u4E8E openspec/ \u6216 docs/: ${relativePath}`);
  }
  const info = await lstat8(lexicalTarget);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new DocumentLedgerError(`document \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${relativePath}`);
  }
  const [realRoot, realTarget, content] = await Promise.all([
    realpath2(repoRoot),
    realpath2(lexicalTarget),
    readFile10(lexicalTarget)
  ]);
  if (!inside(realRoot, realTarget))
    throw new DocumentLedgerError(`document realpath \u8D8A\u51FA\u9879\u76EE\u6839: ${relativePath}`);
  const realRelativePath = normalizeRelativePath(relative2(realRoot, realTarget));
  if (realRelativePath !== relativePath) {
    throw new DocumentLedgerError(`document \u4E0D\u5F97\u901A\u8FC7 symlink \u6216\u8DEF\u5F84\u522B\u540D\u767B\u8BB0: ${relativePath} -> ${realRelativePath}`);
  }
  if (content.byteLength === 0)
    throw new DocumentLedgerError(`document \u4E0D\u5F97\u4E3A\u7A7A: ${relativePath}`);
  return { relativePath, digest: createHash4("sha256").update(content).digest("hex") };
}

// packages/kernel/dist/state/history.js
import { appendFile } from "node:fs/promises";
import { join as join11 } from "node:path";
var HISTORY_FILE = ".pipeline-history.jsonl";
function createHistoryWriter() {
  return {
    async append(changeDir, entry) {
      await appendFile(join11(changeDir, HISTORY_FILE), `${JSON.stringify(entry)}
`, "utf8");
    }
  };
}
function transitionRecordToHistoryEntry(record2) {
  return {
    ts: record2.observedAt,
    kind: "transition",
    from: record2.from,
    to: record2.to,
    raw: record2.event,
    transitionRecordId: record2.id
  };
}

// packages/kernel/dist/state/document-ledger.js
var DOCUMENT_LEDGER_FILE = ".pipeline-documents.json";
function errorCode5(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : void 0;
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value) {
  return isObject(value) ? value : void 0;
}
function string(value) {
  return typeof value === "string" ? value : void 0;
}
function validDigest(value) {
  return /^[a-f0-9]{64}$/.test(value);
}
function parseReceipt(value, recordIndex, receiptIndex) {
  const item2 = object(value);
  if (!item2)
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
  const phase = string(item2.phase);
  const digest2 = string(item2.sha256);
  const readAt = string(item2.readAt);
  const visitId = item2.visitId === void 0 ? void 0 : string(item2.visitId);
  if (!phase || !/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].phase \u975E\u6CD5`);
  }
  if (!digest2 || !validDigest(digest2)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].sha256 \u975E\u6CD5`);
  }
  if (!readAt)
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].readAt \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  if (item2.visitId !== void 0 && !visitId)
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].visitId \u975E\u6CD5`);
  return { phase, sha256: digest2, readAt, ...visitId === void 0 ? {} : { visitId } };
}
function receiptKey(receipt) {
  return JSON.stringify([receipt.phase, receipt.visitId ?? "legacy"]);
}
function parseRecord2(value, index) {
  const item2 = object(value);
  if (!item2)
    throw new DocumentLedgerError(`document ledger records[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
  const kind = string(item2.kind);
  const path7 = string(item2.path);
  const digest2 = string(item2.sha256);
  const producer = string(item2.producer);
  const recordedAt = string(item2.recordedAt);
  if (!kind || !isDocumentKind(kind))
    throw new DocumentLedgerError(`document ledger records[${index}].kind \u975E\u6CD5`);
  if (!path7)
    throw new DocumentLedgerError(`document ledger records[${index}].path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  if (!digest2 || !validDigest(digest2))
    throw new DocumentLedgerError(`document ledger records[${index}].sha256 \u975E\u6CD5`);
  if (!producer || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/.test(producer)) {
    throw new DocumentLedgerError(`document ledger records[${index}].producer \u975E\u6CD5`);
  }
  if (!recordedAt)
    throw new DocumentLedgerError(`document ledger records[${index}].recordedAt \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  if (!Array.isArray(item2.reads))
    throw new DocumentLedgerError(`document ledger records[${index}].reads \u5FC5\u987B\u662F\u6570\u7EC4`);
  const reads = item2.reads.map((receipt, receiptIndex) => parseReceipt(receipt, index, receiptIndex));
  const readVisits = /* @__PURE__ */ new Set();
  for (const receipt of reads) {
    const key = receiptKey(receipt);
    if (readVisits.has(key))
      throw new DocumentLedgerError(`document ledger records[${index}] \u5BF9 phase '${receipt.phase}' \u7684\u540C\u4E00 visit \u6709\u91CD\u590D read receipt`);
    readVisits.add(key);
  }
  return { kind, path: path7, sha256: digest2, producer, recordedAt, reads };
}
async function currentDocumentStepVisitId(changeDir) {
  const metadata = (await readCurrentRunRevision(changeDir))?.state.runMetadata;
  if (metadata === void 0)
    throw new DocumentLedgerError("\u7F3A\u5C11 canonical WorkflowRun visit identity\uFF1B\u65E7 Change \u5FC5\u987B\u5148\u901A\u8FC7\u53D7\u63A7 state mutation \u5EFA\u7ACB run identity\uFF0C\u518D\u91CD\u65B0\u8BFB\u53D6 document");
  return JSON.stringify([metadata.runId, metadata.transitionSequence]);
}
function parseLedger(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new DocumentLedgerError("document ledger \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  const item2 = object(value);
  if (!item2)
    throw new DocumentLedgerError("document ledger \u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  if (item2.version !== 1)
    throw new DocumentLedgerError("document ledger version \u5FC5\u987B\u4E3A 1");
  if (item2.contract !== "openspec-v1")
    throw new DocumentLedgerError("document ledger contract \u5FC5\u987B\u4E3A 'openspec-v1'");
  const createdAt = string(item2.createdAt);
  if (!createdAt)
    throw new DocumentLedgerError("document ledger createdAt \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
  if (!Array.isArray(item2.records))
    throw new DocumentLedgerError("document ledger records \u5FC5\u987B\u662F\u6570\u7EC4");
  const records = item2.records.map((record2, index) => parseRecord2(record2, index));
  const unique = /* @__PURE__ */ new Set();
  for (const record2 of records) {
    const key = `${record2.kind}\0${record2.path}`;
    if (unique.has(key))
      throw new DocumentLedgerError(`document ledger \u6709\u91CD\u590D record: ${record2.kind} ${record2.path}`);
    unique.add(key);
  }
  return { version: 1, contract: "openspec-v1", createdAt, records };
}
async function ledgerText(changeDir) {
  const path7 = join12(changeDir, DOCUMENT_LEDGER_FILE);
  try {
    const info = await lstat9(path7);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new DocumentLedgerError(`document ledger \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${path7}`);
    }
    return await readFile11(path7, "utf8");
  } catch (error) {
    if (errorCode5(error) === "ENOENT")
      return void 0;
    throw error;
  }
}
async function readDocumentLedger(changeDir) {
  const raw = await ledgerText(changeDir);
  return raw === void 0 ? void 0 : parseLedger(raw);
}
function initialDocumentLedgerContent(createdAt) {
  const ledger = { version: 1, contract: "openspec-v1", createdAt, records: [] };
  return `${JSON.stringify(ledger, null, 2)}
`;
}

// packages/kernel/dist/state/document-evidence.js
async function currentRecordDigest(repoRoot, record2) {
  try {
    return (await resolveDocument(repoRoot, record2.path)).digest;
  } catch {
    return void 0;
  }
}
function item(kind, status, requiredRead, records) {
  return {
    kind,
    status,
    requiredRead,
    paths: records.map((record2) => record2.path),
    producers: records.map((record2) => record2.producer)
  };
}
function receiptMatchesVisit(receipt, phase, digest2, visitId) {
  return receipt.phase === phase && receipt.sha256 === digest2 && receipt.visitId === visitId;
}
async function evaluateDocumentEvidence(repoRoot, changeDir, phase, scope = {}, policy) {
  let ledger;
  try {
    ledger = await readDocumentLedger(changeDir);
  } catch (error) {
    return {
      phase,
      hasLedger: true,
      pass: false,
      blockers: [`document ledger \u4E0D\u53EF\u8BFB\u53D6: ${error instanceof Error ? error.message : String(error)}`],
      items: []
    };
  }
  if (!ledger) {
    return {
      phase,
      hasLedger: false,
      pass: false,
      blockers: ["\u7F3A\u5C11 .pipeline-documents.json\uFF1B\u6267\u884C tenon document init \u540E\u6309 phase \u91CD\u65B0\u767B\u8BB0\u4EA7\u7269"],
      items: []
    };
  }
  const recordRequirements = policy ? recordsRequiredForPolicyStep(policy, phase) : isDocumentContractPhase(phase) ? recordsRequiredForPhase(phase) : [];
  const recordKinds = scope.recordKinds ?? recordRequirements.map((requirement) => requirement.kind);
  const readRequirements = new Set(scope.readKinds ?? (policy ? readsRequiredForPolicyStep(policy, phase) : isDocumentContractPhase(phase) ? readsRequiredForPhase(phase) : []));
  const kinds = /* @__PURE__ */ new Set([...recordKinds, ...readRequirements]);
  const blockers = [];
  const items = [];
  let currentVisitId;
  if (readRequirements.size > 0) {
    try {
      currentVisitId = await currentDocumentStepVisitId(changeDir);
    } catch (error) {
      blockers.push(`current step visit \u4E0D\u53EF\u9A8C\u8BC1: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const kind of kinds) {
    const records = ledger.records.filter((record2) => record2.kind === kind);
    const requiredRead = readRequirements.has(kind);
    if (records.length === 0) {
      blockers.push(`\u7F3A\u5C11 document '${kind}'\uFF1B\u6267\u884C tenon document record <change> ${kind} <path> --producer <skill>`);
      items.push(item(kind, "missing", requiredRead, records));
      continue;
    }
    if (records.some((record2) => {
      return policy ? !isRecordedDocumentProducerAllowedThroughPolicyStep(policy, kind, phase, record2.producer) : !isAcceptedDocumentProducer(kind, record2.producer);
    })) {
      blockers.push(`document '${kind}' \u7684 producer \u4E0D\u7B26\u5408\u5F53\u524D document contract`);
      items.push(item(kind, "stale", requiredRead, records));
      continue;
    }
    const legacyDelta = kind === "delta-spec" ? records.filter((record2) => deltaSpecSlot(record2.path, changeDir) === void 0) : [];
    if (legacyDelta.length > 0) {
      blockers.push(`\u5B58\u5728\u65E7 delta-spec \u8BB0\u5F55\uFF0C\u5FC5\u987B\u7528 tenon document migrate-delta \u663E\u5F0F\u8FC1\u79FB: ${legacyDelta.map((record2) => record2.path).join(", ")}`);
      items.push(item(kind, "stale", requiredRead, records));
      continue;
    }
    const digests = await Promise.all(records.map((record2) => currentRecordDigest(repoRoot, record2)));
    if (records.some((record2, index) => digests[index] !== record2.sha256)) {
      blockers.push(`document '${kind}' \u5DF2\u7F3A\u5931\u6216\u5185\u5BB9\u53D8\u5316\uFF1B\u91CD\u65B0\u6267\u884C tenon document record \u540E\u518D\u7EE7\u7EED`);
      items.push(item(kind, "stale", requiredRead, records));
      continue;
    }
    if (requiredRead && (currentVisitId === void 0 || records.some((record2) => !record2.reads.some((receipt) => receiptMatchesVisit(receipt, phase, record2.sha256, currentVisitId))))) {
      if (currentVisitId !== void 0) {
        blockers.push(`document '${kind}' \u5C1A\u672A\u7531 ${phase} \u7684\u5F53\u524D step visit \u8BFB\u53D6\uFF1B\u6267\u884C tenon document read <change> ${kind}`);
      }
      items.push(item(kind, "unread", requiredRead, records));
      continue;
    }
    items.push(item(kind, "recorded", requiredRead, records));
  }
  return { phase, hasLedger: true, pass: blockers.length === 0, blockers, items };
}

// packages/kernel/dist/state/spec-migration-evidence.js
import { createHash as createHash5 } from "node:crypto";
import { lstat as lstat10, readFile as readFile12, realpath as realpath3 } from "node:fs/promises";
import { isAbsolute as isAbsolute3, relative as relative3, resolve as resolve4, sep as sep3 } from "node:path";
function digest(content) {
  return createHash5("sha256").update(content).digest("hex");
}
function escaped2(root, target) {
  const rel = relative3(root, target);
  return rel === ".." || rel.startsWith(`..${sep3}`) || isAbsolute3(rel);
}
function errorCode6(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return void 0;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : void 0;
}
async function trustedOrdinaryFile(repoRoot, candidate, optional = false) {
  const root = resolve4(repoRoot);
  const target = resolve4(candidate);
  if (escaped2(root, target))
    throw new Error("\u8DEF\u5F84\u8D8A\u8FC7\u9879\u76EE\u6839");
  let cursor = root;
  const segments = relative3(root, target).split(sep3).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    cursor = resolve4(cursor, segment);
    let info;
    try {
      info = await lstat10(cursor);
    } catch (error) {
      if (optional && errorCode6(error) === "ENOENT")
        return void 0;
      throw error;
    }
    if (info.isSymbolicLink())
      throw new Error(`\u53EF\u4FE1\u8DEF\u5F84\u62D2\u7EDD symlink: ${relative3(root, cursor)}`);
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new Error(`\u53EF\u4FE1\u8DEF\u5F84\u7236\u7EA7\u4E0D\u662F\u76EE\u5F55: ${relative3(root, cursor)}`);
    }
    if (index === segments.length - 1 && !info.isFile()) {
      throw new Error(`\u8FC1\u79FB\u8BC1\u636E\u4E0D\u662F\u666E\u901A\u6587\u4EF6: ${relative3(root, cursor)}`);
    }
  }
  const [rootReal, targetReal] = await Promise.all([realpath3(root), realpath3(target)]);
  if (escaped2(rootReal, targetReal))
    throw new Error("\u8FC1\u79FB\u8BC1\u636E\u771F\u5B9E\u8DEF\u5F84\u8D8A\u8FC7\u9879\u76EE\u6839");
  return readFile12(target);
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} \u5F62\u72B6\u975E\u6CD5`);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || value === "")
    throw new Error(`${label} \u975E\u6CD5`);
  return value;
}
function parseJson(raw, label) {
  try {
    return record(JSON.parse(raw.toString("utf8")), label);
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(`${label} \u4E0D\u662F\u5408\u6CD5 JSON`);
    throw error;
  }
}
async function evaluateSpecMigrationEvidence(repoRoot, changeDir, changeName) {
  try {
    const root = resolve4(repoRoot);
    const expectedChangeDir = resolve4(root, "openspec", "changes", changeName);
    if (resolve4(changeDir) !== expectedChangeDir || escaped2(root, expectedChangeDir)) {
      return { kind: "invalid", reason: "change-directory-mismatch" };
    }
    const migrationDir = resolve4(expectedChangeDir, "migration");
    const receiptPath = resolve4(migrationDir, "spec-application.json");
    const receiptRaw = await trustedOrdinaryFile(root, receiptPath, true);
    if (!receiptRaw)
      return { kind: "not-required" };
    const receipt = parseJson(receiptRaw, "migration receipt");
    if (receipt.schemaVersion !== 1 || receipt.kind !== "historical-spec-application-migration" || text(receipt.change, "receipt.change") !== changeName) {
      return { kind: "invalid", reason: "receipt-identity-mismatch" };
    }
    const capability = text(receipt.capability, "receipt.capability");
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(capability)) {
      return { kind: "invalid", reason: "receipt-capability-invalid" };
    }
    const expectedMainPath = `openspec/specs/${capability}/spec.md`;
    const expectedDeltaPath = `openspec/changes/${changeName}/specs/${capability}/spec.md`;
    if (text(receipt.mainSpecPath, "receipt.mainSpecPath") !== expectedMainPath || text(receipt.deltaSpecPath, "receipt.deltaSpecPath") !== expectedDeltaPath) {
      return { kind: "invalid", reason: "receipt-path-mismatch" };
    }
    const expectedDigest = text(receipt.expectedAfterDigest, "receipt.expectedAfterDigest");
    const deltaDigest = text(receipt.deltaDigest, "receipt.deltaDigest");
    const deltaRaw = await trustedOrdinaryFile(root, resolve4(root, expectedDeltaPath));
    if (!deltaRaw || digest(deltaRaw) !== deltaDigest) {
      return { kind: "invalid", reason: "delta-digest-mismatch" };
    }
    const resultRaw = await trustedOrdinaryFile(root, resolve4(migrationDir, "spec-application-result.json"), true);
    if (!resultRaw)
      return { kind: "invalid", reason: "application-result-missing" };
    const result = parseJson(resultRaw, "migration result");
    if (result.schemaVersion !== 1 || result.kind !== "spec-migration-application" || result.change !== changeName || result.capability !== capability || result.receiptDigest !== digest(receiptRaw) || result.targetPath !== expectedMainPath || result.effect !== "changed" && result.effect !== "no-op" || result.expectedAfterDigest !== expectedDigest || result.afterDigest !== expectedDigest) {
      return { kind: "invalid", reason: "application-result-mismatch" };
    }
    const mainRaw = await trustedOrdinaryFile(root, resolve4(root, expectedMainPath));
    if (!mainRaw || digest(mainRaw) !== expectedDigest) {
      return { kind: "invalid", reason: "main-spec-digest-mismatch" };
    }
    return { kind: "applied" };
  } catch (error) {
    return {
      kind: "invalid",
      reason: error instanceof Error ? error.message : "migration-evidence-read-failed"
    };
  }
}

// packages/kernel/dist/state/markers.js
import { writeFile as writeFile4 } from "node:fs/promises";
import { join as join13 } from "node:path";
var BREADCRUMB_FILE = ".breadcrumb";
function createBreadcrumbWriter() {
  return {
    async write(changeDir, content) {
      await writeFile4(join13(changeDir, BREADCRUMB_FILE), content, "utf8");
    }
  };
}

// packages/kernel/dist/state/review-gate.js
var REVIEW_GATE_PENDING = "pending";
var REVIEW_GATE_APPROVED = "approved";
function scalar(state, field) {
  const value = state.fields[field];
  return Array.isArray(value) ? value.join(",") : value ?? "";
}
function reviewGateStatus(state) {
  const value = scalar(state, "review_gate_status");
  return value === REVIEW_GATE_PENDING || value === REVIEW_GATE_APPROVED ? value : null;
}
function reviewGateEvent(state) {
  return scalar(state, "review_gate_event");
}
function reviewGateMatches(state, phase, event) {
  return scalar(state, "review_gate_phase") === phase && (event === void 0 || reviewGateEvent(state) === event);
}
function reviewGateApprovedFor(state, phase, event) {
  return reviewGateMatches(state, phase, event) && reviewGateStatus(state) === REVIEW_GATE_APPROVED;
}
function clearReviewGatePatch() {
  return {
    review_gate_phase: "",
    review_gate_status: "",
    review_gate_event: "",
    review_requested_at: "",
    review_acknowledged_at: ""
  };
}

// packages/kernel/dist/state/transitionTail.js
async function applyBreadcrumbTail(port, args) {
  if (!port)
    return { ok: true };
  try {
    await port.write(args.changeDir, `pipeline:${args.name} phase=${args.to}
`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

// packages/kernel/dist/state/workflow-run-repository.js
import { randomUUID as randomUUID5 } from "node:crypto";

// packages/kernel/dist/workflow/stepGuard.js
import { readFileSync as readFileSync4 } from "node:fs";
import path5 from "node:path";

// packages/kernel/dist/workflow/predicates.js
function matchesTrackPredicate(predicate, track) {
  const listed = predicate.values.includes(track);
  return predicate.kind === "track-in" ? listed : !listed;
}
var NON_PM = { kind: "track-not-in", values: ["pm"] };
var NON_PM_OR_FREE = { kind: "track-not-in", values: ["pm", "free"] };

// packages/kernel/dist/workflow/todo-projection.js
var DEFAULT_WORKFLOW_TODO_STAGES = DEFAULT_WORKFLOW_STEPS.map((step) => ({ id: step.id, label: step.label }));
function definitelyCompletedStageIds(stages, currentStage) {
  if (!stages.some((stage) => stage.transitions !== void 0))
    return void 0;
  const ids = stages.map((stage) => stage.id);
  const all = new Set(ids);
  const entry = ids[0];
  if (entry === void 0 || !all.has(currentStage))
    return /* @__PURE__ */ new Set();
  const predecessors = new Map(ids.map((id) => [id, []]));
  for (const stage of stages) {
    for (const target of stage.transitions ?? []) {
      const incoming = predecessors.get(target);
      if (incoming)
        incoming.push(stage.id);
    }
  }
  const dominators = /* @__PURE__ */ new Map();
  for (const id of ids)
    dominators.set(id, id === entry ? /* @__PURE__ */ new Set([id]) : new Set(all));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      if (id === entry)
        continue;
      const incoming = predecessors.get(id) ?? [];
      const next = incoming.length === 0 ? /* @__PURE__ */ new Set([id]) : new Set([...all].filter((candidate) => incoming.every((from) => dominators.get(from)?.has(candidate))));
      next.add(id);
      const prior = dominators.get(id);
      if (next.size !== prior.size || [...next].some((candidate) => !prior.has(candidate))) {
        dominators.set(id, next);
        changed = true;
      }
    }
  }
  const completed = new Set(dominators.get(currentStage) ?? []);
  completed.delete(currentStage);
  return completed;
}
function normalized(value) {
  return value.trim().replace(/^\d+\s*[.)、:：-]\s*/, "").replace(/^phase\s+/i, "").toLocaleLowerCase();
}
function stageForHeading(heading, stages) {
  const candidate = normalized(heading);
  for (const stage of stages) {
    const id = normalized(stage.id);
    const label = normalized(stage.label);
    if (candidate === id || candidate === label)
      return stage.id;
    if (candidate.startsWith(`${id} `) || candidate.endsWith(` ${id}`))
      return stage.id;
    if (candidate.startsWith(`${label} `) || candidate.endsWith(` ${label}`))
      return stage.id;
  }
  return void 0;
}
function parseTasks(markdown, currentStage, stages) {
  const byStage = /* @__PURE__ */ new Map();
  if (markdown === void 0)
    return { byStage, structured: false };
  let target = stages.some((stage) => stage.id === currentStage) ? currentStage : stages[0]?.id;
  let structured = false;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const headingStage = stageForHeading(heading[1] ?? "", stages);
      if (headingStage !== void 0) {
        target = headingStage;
        structured = true;
      }
      continue;
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (!task || target === void 0)
      continue;
    const text2 = (task[2] ?? "").trim();
    if (text2 === "")
      continue;
    const items = byStage.get(target) ?? [];
    items.push({ text: text2, completed: (task[1] ?? "").toLowerCase() === "x" });
    byStage.set(target, items);
  }
  return { byStage, structured };
}
function projectPipelineTodo(input) {
  const declared = input.stages ?? DEFAULT_WORKFLOW_TODO_STAGES;
  const stages = declared.filter((stage, index) => stage.id !== "" && stage.label !== "" && declared.findIndex((other) => other.id === stage.id) === index);
  const currentIndex = stages.findIndex((stage) => stage.id === input.phase);
  const definitelyCompleted = definitelyCompletedStageIds(stages, input.phase);
  const tasks = parseTasks(input.tasksMarkdown, input.phase, stages).byStage;
  return {
    hasTaskSource: input.tasksMarkdown !== void 0,
    stages: stages.map((stage, index) => ({
      id: stage.id,
      label: stage.label,
      status: currentIndex === -1 ? "pending" : stage.id === input.phase ? "current" : definitelyCompleted?.has(stage.id) ?? index < currentIndex ? "done" : "pending",
      tasks: [
        ...input.additionalItemsByStage?.[stage.id] ?? [],
        ...tasks.get(stage.id) ?? []
      ]
    }))
  };
}
function incompletePipelineTasksForExit(input) {
  const declared = input.stages ?? DEFAULT_WORKFLOW_TODO_STAGES;
  const stages = declared.filter((stage, index) => stage.id !== "" && stage.label !== "" && declared.findIndex((other) => other.id === stage.id) === index);
  const parsed = parseTasks(input.tasksMarkdown, input.phase, stages);
  if (!parsed.structured) {
    const incomplete2 = input.phase === "build" ? [...parsed.byStage.values()].flat().filter((task) => !task.completed).length : 0;
    return { structured: false, incomplete: incomplete2 };
  }
  const phaseIndex = stages.findIndex((stage) => stage.id === input.phase);
  if (phaseIndex < 0)
    return { structured: true, incomplete: 0 };
  const incomplete = stages.slice(0, phaseIndex + 1).flatMap((stage) => parsed.byStage.get(stage.id) ?? []).filter((task) => !task.completed).length;
  return { structured: true, incomplete };
}

// packages/kernel/dist/flow/guard.js
var PM_ONLY = { kind: "track-in", values: ["pm"] };
var EXIT_RULES = {
  // open 出口（manifest.yaml:146-151）
  open: [
    { kind: "statefile" },
    { kind: "file-nonempty", path: "proposal.md" },
    { kind: "file-exists", path: "tasks.md" },
    { kind: "tasks-at-least", n: 1 },
    { kind: "tasks-through-phase" },
    { kind: "file-nonempty", path: "design.md" }
  ],
  // explore 出口（manifest.yaml:171-174）
  explore: [
    { kind: "statefile" },
    { kind: "nonempty", field: "design_doc" },
    { kind: "field-file-exists", field: "design_doc" },
    { kind: "tasks-through-phase" }
  ],
  // spec 出口（manifest.yaml:188-192 + guard.sh:510-528 coverage 显式步）
  spec: [
    { kind: "statefile" },
    { kind: "nonempty", field: "plan", when: NON_PM },
    { kind: "field-file-exists", field: "plan", when: NON_PM },
    { kind: "tasks-at-least", n: 3 },
    { kind: "tasks-through-phase" },
    { kind: "coverage" }
  ],
  // build 出口（guard.sh:154-162 前置闸 + manifest.yaml:218-222 + guard.sh:532-559 显式步）
  build: [
    { kind: "automation-queued" },
    { kind: "statefile" },
    { kind: "tasks-through-phase" },
    { kind: "nonempty", field: "build_mode" },
    { kind: "nonempty", field: "isolation" },
    { kind: "full-direct-override" },
    { kind: "eq", field: "pre_verify_review_result", value: "pass" },
    { kind: "depends-archived" }
  ],
  // verify 出口（manifest.yaml:239-247；verify_result 仅 pm——fe/be 由 verify-pass 事件体落值）
  verify: [
    { kind: "statefile" },
    { kind: "nonempty", field: "verification_report" },
    { kind: "field-file-exists", field: "verification_report", desc: "verification_report \u6587\u4EF6\u5B58\u5728" },
    { kind: "eq", field: "branch_status", value: "handled" },
    { kind: "eq", field: "agent_review_result", value: "pass", when: NON_PM_OR_FREE },
    { kind: "eq", field: "codex_review_result", value: "pass", when: NON_PM_OR_FREE },
    { kind: "eq", field: "verify_result", value: "pass", when: PM_ONLY },
    { kind: "tasks-through-phase" }
  ],
  // ship 出口（manifest.yaml:259-263）
  ship: [
    { kind: "statefile" },
    { kind: "nonempty", field: "prd_path", when: PM_ONLY },
    { kind: "field-file-exists", field: "prd_path", desc: "prd_path \u6587\u4EF6\u5B58\u5728", when: PM_ONLY },
    { kind: "nonempty", field: "pr_url", when: NON_PM_OR_FREE },
    { kind: "tasks-through-phase" }
  ],
  // archive 出口（manifest.yaml:272-274）
  archive: [
    { kind: "statefile" },
    { kind: "eq", field: "verify_result", value: "pass" },
    { kind: "tasks-through-phase" }
  ]
};
var COVERAGE_LAYERS = [
  "L1_api",
  "L2_data",
  "L3_rules",
  "L4_state",
  "L5_errors",
  "L6_security",
  "L7_perf",
  "L8_deps",
  "L10_terms"
];
var COVERAGE_PROFILE_APPLICABILITY = {
  backend: {
    L1_api: "required",
    L2_data: "required",
    L3_rules: "required",
    L4_state: "required",
    L5_errors: "required",
    L6_security: "required",
    L8_deps: "required",
    L7_perf: "optional",
    L10_terms: "optional"
  },
  frontend: {
    L4_state: "required",
    L5_errors: "required",
    L1_api: "optional",
    L3_rules: "optional",
    L6_security: "optional",
    L7_perf: "optional",
    L8_deps: "optional",
    L10_terms: "optional"
  },
  pm: {
    L3_rules: "required",
    L2_data: "optional",
    L4_state: "optional",
    L10_terms: "optional"
  }
};
var COVERAGE_LOCK_CONCERN = { L6_security: "auth" };
function coverageBlockLines(content) {
  if (content === void 0)
    return [];
  const out = [];
  let inBlock = false;
  for (const line of content.split("\n")) {
    if (/^```coverage/.test(line)) {
      inBlock = true;
      continue;
    }
    if (/^```/.test(line)) {
      inBlock = false;
      continue;
    }
    if (inBlock)
      out.push(line);
  }
  return out;
}
function coverageBlockStatus(lines, layer) {
  const row = lines.find((l) => l.startsWith(`${layer}:`));
  if (row === void 0)
    return "blank";
  const m = /^[ \t]*([a-zA-Z]+)/.exec(row.slice(layer.length + 1));
  const st = m?.[1];
  return st === "filled" || st === "waived" ? st : "blank";
}
function coverageTouches(lines) {
  const row = lines.find((l) => l.startsWith("touches:"));
  if (row === void 0)
    return [];
  return row.slice("touches:".length).split(/[,\s]+/).filter((w) => w !== "");
}
function isEmpty(v) {
  if (v === void 0)
    return true;
  if (Array.isArray(v))
    return v.length === 0;
  return v === "" || v === "null";
}
function scalar2(v) {
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
}
function depsOf(v) {
  const items = Array.isArray(v) ? v : (v ?? "").split(",");
  return items.map((s) => s.trim()).filter((s) => s !== "" && s !== "null");
}
function taskCount(content) {
  if (content === void 0)
    return 0;
  return content.split("\n").filter((l) => /^- \[[ x]\]/.test(l)).length;
}
function trackApplies(when, track) {
  return when === void 0 || matchesTrackPredicate(when, track);
}
function trackSuffix(when, track) {
  return when === void 0 ? "" : ` (${track} track)`;
}
function evaluateCoverage(state, ctx, failures, warnings) {
  if (ctx.readFile === void 0 || ctx.coverageProfile === "none")
    return;
  const preset = scalar2(state.fields.preset);
  const dd = scalar2(state.fields.design_doc);
  const content = dd !== "" && dd !== "null" ? ctx.readFile(dd) : void 0;
  const lines = coverageBlockLines(content);
  const touches = coverageTouches(lines);
  const applicability = COVERAGE_PROFILE_APPLICABILITY[ctx.coverageProfile];
  const blockedLines = [];
  let lockViolations = 0;
  for (const layer of COVERAGE_LAYERS) {
    const app = applicability?.[layer] ?? "na";
    if (app === "na")
      continue;
    const status = coverageBlockStatus(lines, layer);
    const concern = COVERAGE_LOCK_CONCERN[layer];
    const locked = concern !== void 0 && touches.includes(concern);
    if (locked) {
      if (status !== "filled") {
        blockedLines.push(`${layer} ${app} ${status} BLOCKED LOCKVIOLATION`);
        lockViolations += 1;
      }
    } else if (app === "required" && status === "blank") {
      blockedLines.push(`${layer} ${app} ${status} BLOCKED`);
    }
  }
  const waive = preset === "hotfix" || preset === "tweak";
  const covBlock = waive ? lockViolations : blockedLines.length;
  if (waive) {
    const warnBlank = blockedLines.length - lockViolations;
    if (warnBlank > 0) {
      warnings.push(`${preset}\uFF1A${warnBlank} \u5C42\u8986\u76D6\u7559\u7A7A\uFF08\u5DF2\u8C41\u514D\uFF0C\u5EFA\u8BAE\u8865\uFF1B\u{1F512} \u9501\u4E0D\u8C41\u514D\uFF09`);
    }
  }
  if (covBlock > 0) {
    failures.push(`spec \u51FA\u53E3\uFF1A\u5168\u6808 Spec \u8986\u76D6\uFF08${covBlock} \u5C42\u963B\u585E\uFF09`);
    for (const l of blockedLines)
      warnings.push(`\u8986\u76D6\u963B\u585E: ${l}`);
  }
}
function evaluateGuard(state, ctx) {
  const phase = scalar2(state.fields.phase);
  const rules = EXIT_RULES[phase];
  if (!rules) {
    return { pass: false, failures: [`\u672A\u77E5 phase '${phase}'\uFF0C\u65E0\u6CD5\u8BC4\u4F30\u51FA\u53E3\u6761\u4EF6`] };
  }
  const track = scalar2(state.fields.track);
  const changeDir = ctx?.changeDirRel;
  const failures = [];
  const warnings = [];
  for (const rule of rules) {
    switch (rule.kind) {
      case "nonempty": {
        if (!trackApplies(rule.when, track))
          break;
        const value = state.fields[rule.field];
        if (isEmpty(value)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.field} \u975E\u7A7A\uFF08\u5F53\u524D='${scalar2(value)}'\uFF09`);
        }
        break;
      }
      case "eq": {
        if (!trackApplies(rule.when, track))
          break;
        const value = state.fields[rule.field];
        if (scalar2(value) !== rule.value) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.field}=${rule.value}\uFF08\u5F53\u524D='${scalar2(value)}'\uFF09`);
        }
        break;
      }
      case "automation-queued": {
        if (ctx?.automationRunner === true)
          break;
        if (scalar2(state.fields.automation) === "queued") {
          failures.push(`${phase} \u51FA\u53E3\uFF1Aautomation=queued \u5DF2\u5165\u961F\u8C03\u5EA6\u5668\uFF0C\u4E3B\u7EBF build \u8DEF\u5F84\u88AB\u62E6\uFF08\u60F3\u624B\u52A8\u8DD1\u5148 set automation off\uFF09`);
        }
        break;
      }
      case "full-direct-override": {
        if (scalar2(state.fields.preset) === "full" && scalar2(state.fields.build_mode) === "direct") {
          const ovr = scalar2(state.fields.direct_override);
          if (ovr !== "true") {
            failures.push(`${phase} \u51FA\u53E3\uFF1Afull+direct \u8981\u6C42 direct_override=true\uFF08\u5F53\u524D='${ovr}'\uFF09`);
          }
        }
        break;
      }
      case "statefile": {
        if (changeDir === void 0)
          break;
        const exists = ctx?.stateExists !== void 0 ? ctx.stateExists(changeDir) : ctx?.fileNonempty?.(`${changeDir}/.pipeline.yaml`);
        if (exists === void 0)
          break;
        if (!exists) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 canonical \u72B6\u6001\u6587\u4EF6\u5B58\u5728\uFF08\u517C\u5BB9 legacy .pipeline.yaml\uFF09`);
        }
        break;
      }
      case "file-nonempty": {
        if (!trackApplies(rule.when, track))
          break;
        if (ctx?.fileNonempty === void 0 || changeDir === void 0)
          break;
        if (!ctx.fileNonempty(`${changeDir}/${rule.path}`)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.path} \u5B58\u5728\u4E14\u975E\u7A7A${trackSuffix(rule.when, track)}`);
        }
        break;
      }
      case "file-exists": {
        if (ctx?.fileExists === void 0 || changeDir === void 0)
          break;
        if (!ctx.fileExists(`${changeDir}/${rule.path}`)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.path} \u5B58\u5728`);
        }
        break;
      }
      case "tasks-at-least": {
        if (ctx?.readFile === void 0 || changeDir === void 0)
          break;
        const count = taskCount(ctx.readFile(`${changeDir}/tasks.md`));
        if (count < rule.n) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 tasks.md \u81F3\u5C11 ${rule.n} \u4E2A\u4EFB\u52A1\uFF08\u5F53\u524D=${count}\uFF09`);
        }
        break;
      }
      case "tasks-through-phase": {
        if (ctx?.readFile === void 0 || changeDir === void 0)
          break;
        const content = ctx.readFile(`${changeDir}/tasks.md`);
        if (content === void 0) {
          if (phase === "build") {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42\u622A\u81F3\u5F53\u524D\u9636\u6BB5\u7684 tasks.md \u5168\u90E8\u52FE\u9009\uFF08tasks.md \u7F3A\u5931\uFF09`);
          }
        } else {
          const status = incompletePipelineTasksForExit({ phase, tasksMarkdown: content });
          if (status.incomplete > 0) {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42\u622A\u81F3\u5F53\u524D\u9636\u6BB5\u7684 tasks.md \u5168\u90E8\u52FE\u9009\uFF08\u4ECD\u6709 ${status.incomplete} \u9879\u672A\u52FE\uFF09`);
          }
        }
        break;
      }
      case "field-file-exists": {
        if (!trackApplies(rule.when, track))
          break;
        if (ctx?.fileExists === void 0)
          break;
        const v = scalar2(state.fields[rule.field]);
        if (v === "" || v === "null" || !ctx.fileExists(v)) {
          const label = rule.desc ?? `${rule.field} \u6307\u5411\u7684\u6587\u4EF6\u5B58\u5728`;
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${label}${trackSuffix(rule.when, track)}\uFF08\u5F53\u524D='${v}'\uFF09`);
        }
        break;
      }
      case "coverage": {
        if (ctx !== void 0)
          evaluateCoverage(state, ctx, failures, warnings);
        break;
      }
      case "depends-archived": {
        if (ctx?.dirExists === void 0 || ctx.changeArchived === void 0)
          break;
        for (const dep of depsOf(state.fields.depends_on)) {
          if (ctx.dirExists(`openspec/changes/${dep}`)) {
            if (ctx.activeChangeArchived?.(dep) !== true) {
              failures.push(`${phase} \u51FA\u53E3\uFF1A\u4F9D\u8D56 change '${dep}' \u5FC5\u987B\u5148\u5F52\u6863\uFF08\u5F53\u524D\u6D3B\u8DC3\uFF09`);
            }
          } else if (!ctx.changeArchived(dep)) {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u4F9D\u8D56 change '${dep}' \u4E0D\u5B58\u5728\uFF08\u65E2\u4E0D\u5728\u6D3B\u8DC3\u4E5F\u4E0D\u5728\u5F52\u6863\uFF09`);
          }
        }
        break;
      }
    }
  }
  const result = { pass: failures.length === 0, failures };
  if (warnings.length > 0)
    result.warnings = warnings;
  return result;
}

// packages/kernel/dist/workspace/fingerprint.js
import { createHash as createHash6 } from "node:crypto";
import { lstat as lstat11, readdir as readdir2, readFile as readFile13, readlink } from "node:fs/promises";
import { join as join14 } from "node:path";
var WORKSPACE_BASELINE_PREFIX = "workspace:sha256:";
var EXCLUDED_TOP_LEVEL = /* @__PURE__ */ new Set([
  ".git",
  ".pipeline",
  ".agents",
  ".codex",
  ".impeccable",
  ".superpowers",
  ".worktrees",
  "openspec",
  "docs",
  ".turbo",
  ".playwright-mcp",
  ".playwright-tmp",
  ".sandcastle-build",
  "e2e-runs"
]);
var EXCLUDED_ANY_SEGMENT = /* @__PURE__ */ new Set([
  "node_modules",
  "coverage",
  "test-results",
  "playwright-report",
  ".cache",
  ".pytest_cache",
  "__pycache__"
]);
var EXCLUDED_BASENAMES = /* @__PURE__ */ new Set([
  ".DS_Store",
  ".pipeline-active",
  ".pipeline-interaction-authority",
  ".pipeline-pending-confirm",
  ".pipeline-pending-interaction",
  ".pipeline-pending-review"
]);
var EXCLUDED_RELATIVE_ROOTS = [".github/hooks"];
var EXCLUDED_ROOT_ARTIFACTS = [
  /^dashboard-progress-custom-spec\.png$/,
  /^dashboard-acceptance-.*\.png$/,
  /^workbench-.*\.png$/
];
function sortNames(names) {
  return names.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
function modeOf(stat6) {
  return (stat6.mode & 511).toString(8);
}
function sameFileIdentity(before, after) {
  return before.size === after.size && before.mode === after.mode && before.mtimeMs === after.mtimeMs && before.ino === after.ino;
}
function isExcluded(relativePath) {
  const parts = relativePath.split("/");
  return EXCLUDED_TOP_LEVEL.has(parts[0] ?? "") || parts.some((part) => EXCLUDED_ANY_SEGMENT.has(part)) || EXCLUDED_BASENAMES.has(parts.at(-1) ?? "") || EXCLUDED_RELATIVE_ROOTS.some((root) => relativePath === root || relativePath.startsWith(`${root}/`)) || !relativePath.includes("/") && EXCLUDED_ROOT_ARTIFACTS.some((pattern) => pattern.test(relativePath));
}
function writeRecord(hash, kind, relativePath, details = "") {
  hash.update(kind);
  hash.update("\0");
  hash.update(relativePath);
  hash.update("\0");
  hash.update(details);
  hash.update("\0");
}
async function fingerprintEntry(root, relativePath, hash) {
  if (isExcluded(relativePath))
    return;
  const absolutePath = join14(root, ...relativePath.split("/"));
  const before = await lstat11(absolutePath);
  if (before.isDirectory()) {
    writeRecord(hash, "D", relativePath, modeOf(before));
    const names = sortNames(await readdir2(absolutePath));
    for (const name of names)
      await fingerprintEntry(root, `${relativePath}/${name}`, hash);
    return;
  }
  if (before.isFile()) {
    writeRecord(hash, "F", relativePath, `${modeOf(before)}:${before.size}`);
    hash.update(await readFile13(absolutePath));
    const after = await lstat11(absolutePath);
    if (!after.isFile() || !sameFileIdentity(before, after)) {
      throw new Error(`workspace baseline capture raced with a file change: ${relativePath}`);
    }
    return;
  }
  if (before.isSymbolicLink()) {
    writeRecord(hash, "L", relativePath, `${modeOf(before)}:${await readlink(absolutePath)}`);
    return;
  }
  throw new Error(`workspace baseline does not support non-file entry: ${relativePath}`);
}
async function fingerprintWorkspace(root) {
  const rootStat = await lstat11(root);
  if (!rootStat.isDirectory())
    throw new Error(`workspace root is not a directory: ${root}`);
  const hash = createHash6("sha256");
  writeRecord(hash, "D", ".", modeOf(rootStat));
  const names = sortNames(await readdir2(root));
  for (const name of names)
    await fingerprintEntry(root, name, hash);
  return `${WORKSPACE_BASELINE_PREFIX}${hash.digest("hex")}`;
}
function isWorkspaceBaseline(value) {
  return new RegExp(`^${WORKSPACE_BASELINE_PREFIX}[a-f0-9]{64}$`).test(value);
}

// packages/kernel/dist/workflow/guard-handlers.js
function scalarValue(fields, k) {
  const v = fields[k];
  if (Array.isArray(v)) {
    throw new Error(`guard \u8BFB\u5230\u5217\u8868\u5B57\u6BB5 '${k}' \u7684\u6570\u7EC4\u503C\uFF1Ascalar guard \u4E0D\u5B9A\u4E49\u5217\u8868\u8BED\u4E49\uFF0CcompileWorkflow \u7F16\u8BD1\u671F\u62D2\u7EDD\u5217\u8868\u5B57\u6BB5\u2014\u2014\u8FD0\u884C\u671F\u51FA\u73B0 = \u7ED5\u8FC7\u7F16\u8BD1\u5668`);
  }
  return v ?? "";
}
function isUnset(v) {
  return v === "" || v === "null";
}
var PASSED = { kind: "passed" };
var GUARD_HANDLERS = Object.freeze({
  /** stepGuard.ts L38-44 同语义：tasks.md 任务数 ≥ n。文件读取走 readText 能力注入
   *  （stepGuard 直接 readFileSync，本层纯函数化）；readText 注入但文件缺失 → undefined →
   *  taskCount=0（stepGuard L17-24 缺失=0 同口径），能力本身未注入才是 skipped。 */
  "tasks-at-least": (config, input) => {
    if (!input.readText)
      return { kind: "skipped", capability: "readText" };
    const count = taskCount(input.readText("tasks.md"));
    if (count < config.n) {
      return { kind: "failed", guardType: "tasks-at-least", actual: String(count), expected: [String(config.n)] };
    }
    return PASSED;
  },
  /** 纯定义层变体：compileWorkflow 按 step.outputs 展开成 field-nonempty 集合，经编译的 IR
   *  里不存在它。handler 拿不到 step.outputs（GuardInput 刻意不带 step 形状），运行期收到它
   *  = 调用方绕过了编译器，fail-loud。 */
  "nonempty-output": () => {
    throw new Error("guard 'nonempty-output' \u662F v1 \u5B9A\u4E49\u5C42\u53D8\u4F53\uFF0CcompileWorkflow \u6309 step.outputs \u5C55\u5F00\u4E3A field-nonempty\uFF1B\u8FD0\u884C\u671F\u6CE8\u518C\u8868\u4E0D\u5B9E\u73B0\u5B83");
  },
  /** 老仓 state-transition.sh 各事件的字段非空面：isUnset（''/'null'）→ failed。
   *  纯字段谓词，无能力依赖，永不 skipped。 */
  "field-nonempty": (config, input) => {
    const v = scalarValue(input.fields, config.field);
    if (isUnset(v)) {
      return { kind: "failed", guardType: "field-nonempty", field: config.field, actual: v };
    }
    return PASSED;
  },
  /** 老仓 state-transition.sh 各事件的文件存在面：字段值即项目根相对路径。
   *  字段未设 → failed（未设的路径必不存在；与 field-nonempty 前置搭配时被首错截断，
   *  单独使用时行为自洽）；fileExists 未注入 → skipped（L92-93 降级视为存在）。 */
  "file-exists": (config, input) => {
    const v = scalarValue(input.fields, config.path.field);
    if (isUnset(v)) {
      return { kind: "failed", guardType: "file-exists", field: config.path.field, actual: v };
    }
    if (!input.fileExists)
      return { kind: "skipped", capability: "fileExists" };
    if (!input.fileExists(v)) {
      return { kind: "failed", guardType: "file-exists", field: config.path.field, actual: v };
    }
    return PASSED;
  },
  /** 老仓 state-transition.sh verify-pass 的等值面（branch_status=handled、双 review=pass）。 */
  "field-equals": (config, input) => {
    const v = scalarValue(input.fields, config.field);
    if (v !== config.value) {
      return { kind: "failed", guardType: "field-equals", field: config.field, actual: v, expected: [config.value] };
    }
    return PASSED;
  },
  /** build-complete 的隔离枚举面（branch/worktree，或受限 agent 的显式 in-place），expected 带全量合法值。 */
  "field-in": (config, input) => {
    const v = scalarValue(input.fields, config.field);
    if (!config.values.includes(v)) {
      return { kind: "failed", guardType: "field-in", field: config.field, actual: v, expected: config.values };
    }
    return PASSED;
  },
  /** 老仓 state-transition.sh build-complete：preset=full ∧ build_mode=direct → direct_override 必须
   *  字面 'true'（set 闸之外的纵深防线）。条件不齐（非 full / 非 direct）→ passed。 */
  "full-direct-override": (_config, input) => {
    const override = scalarValue(input.fields, "direct_override");
    if (scalarValue(input.fields, "preset") === "full" && scalarValue(input.fields, "build_mode") === "direct" && override !== "true") {
      return { kind: "failed", guardType: "full-direct-override", field: "direct_override", actual: override, expected: ["true"] };
    }
    return PASSED;
  },
  /** 老仓 state-transition.sh verify-pass barrier（ADR 0005）：verify 审的必须是 build 冻结的基线。
   *  IO 序镜像老代码：L149 先读 bsha，L150 gitHeadSha 注入即调用（HEAD 取值与异常都发生在
   *  build_sha 判空之前；抛错原样上抛，老代码不 catch——build_sha 未设时同样先经历这次调用）。
   *  `workspace:sha256:<digest>` 是 in-place 的强语义扩展：这种构建没有不可变 checkout，故改用
   *  工作区内容基线而非同一个 Git HEAD。它走独立能力，绝不再调用 gitHeadSha。
   *  L151 合取的三态映射：
   *    · build_sha 未设 → passed（首个合取不成立 → 老代码放行，barrier 不适用）；
   *    · gitHeadSha 未注入 / 注入但 trim 后空串（HEAD 不可取，非 git 仓）→ skipped
   *      （L150 `?? ''` 与 L151 head!=='' 同归「HEAD 面不可用」，退化跳过）；
   *    · head≠bsha → failed；相等 → passed。 */
  "build-head-unchanged": async (config, input) => {
    const bsha = scalarValue(input.fields, config.field);
    if (isWorkspaceBaseline(bsha)) {
      const current = input.workspaceFingerprint ? (await input.workspaceFingerprint()).trim() : void 0;
      if (current === void 0 || current === "")
        return { kind: "skipped", capability: "workspaceFingerprint" };
      if (!isWorkspaceBaseline(current)) {
        throw new Error(`workspaceFingerprint \u8FD4\u56DE\u4E86\u975E\u6CD5\u57FA\u7EBF: ${current}`);
      }
      if (current !== bsha) {
        return {
          kind: "failed",
          guardType: "build-head-unchanged",
          field: config.field,
          actual: current,
          expected: [bsha]
        };
      }
      return PASSED;
    }
    const head = input.gitHeadSha ? (await input.gitHeadSha()).trim() : void 0;
    if (isUnset(bsha))
      return PASSED;
    if (head === void 0 || head === "")
      return { kind: "skipped", capability: "gitHeadSha" };
    if (head !== bsha) {
      return { kind: "failed", guardType: "build-head-unchanged", field: config.field, actual: head, expected: [bsha] };
    }
    return PASSED;
  },
  /** Ship 迁移门禁是 fail-closed 能力：adapter 未绑定、证据损坏或目标摘要漂移都拒绝。 */
  "spec-migration-applied": async (_config, input) => {
    if (!input.specMigrationStatus) {
      return {
        kind: "failed",
        guardType: "spec-migration-applied",
        actual: "capability-unavailable",
        expected: ["not-required", "applied"]
      };
    }
    const status = await input.specMigrationStatus();
    if (status.kind === "not-required" || status.kind === "applied")
      return PASSED;
    return {
      kind: "failed",
      guardType: "spec-migration-applied",
      actual: status.reason,
      expected: ["not-required", "applied"]
    };
  }
});
function evalOutputPresent(config, input) {
  const raw = input.fields[config.field];
  const v = Array.isArray(raw) ? "" : raw ?? "";
  if (isUnset(v)) {
    return { kind: "failed", guardType: "output-present", field: config.field, actual: v };
  }
  return PASSED;
}
function dispatchGuard(config, input) {
  if (config.type === "output-present")
    return evalOutputPresent(config, input);
  const handler = GUARD_HANDLERS[config.type];
  return handler(config, input);
}
async function evaluateGuards(guards, input, options = {}) {
  const stopOnFirstFailure = options.stopOnFirstFailure ?? true;
  const evaluated = [];
  for (const guard of guards) {
    if (guard.when !== void 0 && !matchesTrackPredicate(guard.when, input.track))
      continue;
    const decision = await dispatchGuard(guard, input);
    evaluated.push({ guard, decision });
    if (decision.kind === "failed" && stopOnFirstFailure)
      break;
  }
  return evaluated;
}

// packages/kernel/dist/flow/default-event-policy.js
var DEFAULT_EVENT_POLICY = {
  "open-complete": { guards: [], actions: [] },
  "explore-complete": {
    // 老仓 L120-126：design_doc 非空且文件存在。
    guards: [{ type: "file-exists", path: { kind: "field", field: "design_doc" } }],
    actions: []
  },
  "spec-complete": {
    // 老仓 L127-138：仅非 PM 轨要求 legacy `plan` artifact；PM 的文档链由 OpenSpec ledger
    // 单独强制，不能用一个新增 state 字段要求破坏原有 default transition 兼容性。
    guards: [{ type: "file-exists", path: { kind: "field", field: "plan" }, when: NON_PM }],
    actions: [{ type: "reset-pre-verify-review" }]
  },
  "requirements-changed": { guards: [], actions: [{ type: "reset-pre-verify-review" }] },
  "build-complete": {
    // 首错优先：build_mode 必设 → isolation 必设 → isolation ∈ {branch,worktree,in-place}
    // → full+direct 锁 direct_override → pre-Verify 全量收敛通过。in-place 明确表示受限 agent
    // 仅能在当前工作目录写文件，不得把它伪装成已创建的 Git branch/worktree。
    guards: [
      { type: "field-nonempty", field: "build_mode" },
      { type: "field-nonempty", field: "isolation" },
      { type: "field-in", field: "isolation", values: ["branch", "worktree", "in-place"] },
      { type: "full-direct-override" },
      { type: "field-equals", field: "pre_verify_review_result", value: "pass" }
    ],
    // 老仓 L156-161：git HEAD 冻结进 build_sha（取不到 → 留原值 + WARN 信号）。
    actions: [{ type: "freeze-build-sha" }]
  },
  "verify-pass": {
    // 老仓 L163-199 首错优先：verification_report 非空且文件存在 → branch_status=handled →
    // 非 pm 轨双 review=pass → barrier（HEAD==build_sha）。
    guards: [
      { type: "file-exists", path: { kind: "field", field: "verification_report" } },
      { type: "field-equals", field: "branch_status", value: "handled" },
      { type: "field-equals", field: "agent_review_result", value: "pass", when: NON_PM_OR_FREE },
      { type: "field-equals", field: "codex_review_result", value: "pass", when: NON_PM_OR_FREE },
      { type: "build-head-unchanged", field: "build_sha" }
    ],
    // 老仓 L201-204：verify_result=pass + verified_at=now。
    actions: [{ type: "mark-verification-passed" }]
  },
  "verify-fail": {
    guards: [],
    // 老仓 L207-210：verify_result=fail + build_sha=null（barrier 复位；phase_status 在 flow）。
    actions: [{ type: "mark-verification-failed" }, { type: "reset-pre-verify-review" }]
  },
  "ship-complete": { guards: [{ type: "spec-migration-applied" }], actions: [] },
  archived: {
    guards: [],
    // 老仓 L213-217：archived=true + archived_at=now（phase_status=done 在 flow）。
    actions: [{ type: "archive-run" }]
  }
};
function fstr(v) {
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
function fieldStr(state, k) {
  return fstr(state.fields[k]);
}
function normalizeDefaultGuardFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) {
    out[k] = fstr(fields[k]);
  }
  return out;
}
function renderPreconditionViolation(event, failure, track) {
  const { guard, decision } = failure;
  const actual = (decision.kind === "failed" ? decision.actual : void 0) ?? "";
  switch (event) {
    case "explore-complete":
      return [`ERROR: explore-complete \u8981\u6C42 design_doc \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${actual})`];
    case "spec-complete":
      return [`ERROR: ${track} track spec-complete \u8981\u6C42 plan \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${actual})`];
    case "build-complete":
      if (guard.type === "field-nonempty") {
        return guard.field === "build_mode" ? ["ERROR: build_mode \u5FC5\u987B\u8BBE\u7F6E"] : ["ERROR: isolation \u5FC5\u987B\u8BBE\u7F6E"];
      }
      if (guard.type === "field-in")
        return [`ERROR: \u975E\u6CD5\u503C '${actual}'\uFF0C\u5141\u8BB8: branch worktree in-place`];
      if (guard.type === "full-direct-override") {
        return ["ERROR: full workflow \u4F7F\u7528 build_mode=direct \u5FC5\u987B\u663E\u5F0F\u8BBE direct_override=true"];
      }
      if (guard.type === "field-equals" && guard.field === "pre_verify_review_result") {
        return [`ERROR: build-complete \u8981\u6C42 pre_verify_review_result=pass (\u5F53\u524D=${actual})`];
      }
      break;
    case "verify-pass":
      if (guard.type === "file-exists") {
        return [`ERROR: verify-pass \u8981\u6C42 verification_report \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${actual})`];
      }
      if (guard.type === "field-equals") {
        if (guard.field === "branch_status")
          return [`ERROR: verify-pass \u8981\u6C42 branch_status=handled (\u5F53\u524D=${actual})`];
        if (guard.field === "agent_review_result")
          return [`ERROR: ${track} track \u8981\u6C42 agent_review_result=pass (\u5F53\u524D=${actual})`];
        return [`ERROR: ${track} track \u8981\u6C42 codex_review_result=pass (\u5F53\u524D=${actual})`];
      }
      if (guard.type === "build-head-unchanged") {
        const bsha = (decision.kind === "failed" ? decision.expected?.[0] : void 0) ?? "";
        if (bsha.startsWith("workspace:sha256:")) {
          return [
            `ERROR: verify-pass \u8981\u6C42\u5F53\u524D\u5DE5\u4F5C\u533A\u5185\u5BB9\u7B49\u4E8E build \u51BB\u7ED3\u57FA\u7EBF\uFF08build_sha=${bsha} \u5F53\u524D=${actual}\uFF09`,
            "  \u4FEE\u590D\uFF1A\u5DE5\u4F5C\u533A\u5728 build \u540E\u53D1\u751F\u53D8\u5316\uFF1B\u91CD\u8DD1 build-complete \u51BB\u7ED3\u65B0\u57FA\u7EBF\u540E\u518D\u9A8C\u8BC1"
          ];
        }
        return [
          `ERROR: verify-pass \u8981\u6C42 HEAD==build_sha\uFF08build \u540E\u4EA7\u7269\u88AB\u6539\u672A\u590D\u9A8C\uFF09build_sha=${bsha} HEAD=${actual}`,
          "  \u4FEE\u590D\uFF1A\u8981\u4E48\u628A\u6539\u52A8\u5E76\u5165\u590D\u9A8C\uFF08\u91CD\u8DD1 build\u2192verify\uFF09\uFF0C\u8981\u4E48 verify-fail \u56DE\u9000\u540E\u91CD\u65B0 build-complete \u51BB\u7ED3\u65B0 SHA"
        ];
      }
      break;
    case "ship-complete":
      if (guard.type === "spec-migration-applied") {
        return [`ERROR: ship-complete \u8981\u6C42\u4E3B\u89C4\u683C\u8FC1\u79FB\u673A\u5668\u8BC1\u636E\u6709\u6548\uFF08\u5F53\u524D=${actual}\uFF09`];
      }
      break;
    default:
      break;
  }
  throw new Error(`renderPreconditionViolation: \u672A\u8986\u76D6\u7684 (event=${event}, guardType=${guard.type})`);
}
async function checkDefaultEventPreconditions(event, state, ctx) {
  const policy = DEFAULT_EVENT_POLICY[event];
  if (policy.guards.length === 0)
    return null;
  const track = fieldStr(state, "track");
  const input = {
    fields: normalizeDefaultGuardFields(state.fields),
    track,
    fileExists: ctx?.fileExists,
    gitHeadSha: ctx?.gitHeadSha,
    workspaceFingerprint: ctx?.workspaceFingerprint,
    specMigrationStatus: ctx?.specMigrationStatus
  };
  const evaluations = await evaluateGuards(policy.guards, input);
  const failed = evaluations.find((e) => e.decision.kind === "failed");
  if (!failed)
    return null;
  return renderPreconditionViolation(event, failed, track);
}

// packages/kernel/dist/workflow/stepGuard.js
function fieldStr2(v) {
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
function readChangeText(changeDirAbs, rel) {
  try {
    return readFileSync4(path5.join(changeDirAbs, rel), "utf8");
  } catch {
    return void 0;
  }
}
function buildStepGuardInput(state, ctx) {
  return {
    fields: state.fields,
    track: fieldStr2(state.fields.track),
    readText: (rel) => readChangeText(ctx.changeDirAbs, rel),
    fileExists: ctx.fileExists,
    gitHeadSha: ctx.gitHeadSha,
    workspaceFingerprint: ctx.workspaceFingerprint,
    specMigrationStatus: ctx.specMigrationStatus
  };
}
function buildDefaultGuardInput(state, ctx) {
  return {
    ...buildStepGuardInput(state, ctx),
    fields: normalizeDefaultGuardFields(state.fields),
    track: fieldStr2(state.fields.track)
  };
}
function renderGuardFailure(ev, stepId) {
  const g = ev.guard;
  const d = ev.decision;
  if (d.kind !== "failed")
    return "";
  switch (g.type) {
    case "tasks-at-least":
      return `step '${stepId}' \u8981\u6C42 tasks.md \u81F3\u5C11 ${g.n} \u4E2A\u4EFB\u52A1\uFF08\u5F53\u524D=${d.actual ?? "0"}\uFF09`;
    case "field-nonempty":
      return `\u5B57\u6BB5 '${g.field}' \u672A\u8BBE\u7F6E\uFF08step '${stepId}' \u58F0\u660E\u4E3A\u5FC5\u987B\u4EA7\u51FA\uFF09`;
    case "output-present":
      return `\u5B57\u6BB5 '${g.field}' \u672A\u8BBE\u7F6E\uFF08step '${stepId}' \u58F0\u660E\u4E3A\u5FC5\u987B\u4EA7\u51FA\uFF09`;
    case "file-exists":
      return `step '${stepId}' \u8981\u6C42\u5B57\u6BB5 '${g.path.field}' \u6307\u5411\u7684\u6587\u4EF6\u5B58\u5728\uFF08\u5F53\u524D=${d.actual ?? ""}\uFF09`;
    case "field-equals":
      return `step '${stepId}' \u8981\u6C42\u5B57\u6BB5 '${g.field}'=${g.value}\uFF08\u5F53\u524D=${d.actual ?? ""}\uFF09`;
    case "field-in":
      return `step '${stepId}' \u8981\u6C42\u5B57\u6BB5 '${g.field}' \u2208 {${g.values.join(", ")}}\uFF08\u5F53\u524D=${d.actual ?? ""}\uFF09`;
    case "full-direct-override":
      return `step '${stepId}' \u8981\u6C42 preset=full \u4E14 build_mode=direct \u65F6 direct_override=true\uFF08\u5F53\u524D=${d.actual ?? ""}\uFF09`;
    case "build-head-unchanged":
      if ((d.expected?.[0] ?? "").startsWith("workspace:sha256:")) {
        return `step '${stepId}' \u8981\u6C42\u5F53\u524D\u5DE5\u4F5C\u533A\u5185\u5BB9\u7B49\u4E8E build \u51BB\u7ED3\u57FA\u7EBF\uFF08build_sha=${d.expected?.[0] ?? ""}\uFF0C\u5F53\u524D=${d.actual ?? ""}\uFF09`;
      }
      return `step '${stepId}' \u8981\u6C42\u5F53\u524D HEAD \u7B49\u4E8E build \u51BB\u7ED3\u7684 SHA\uFF08build_sha=${d.expected?.[0] ?? ""}\uFF0CHEAD=${d.actual ?? ""}\uFF09`;
    case "spec-migration-applied":
      return `step '${stepId}' \u8981\u6C42\u4E3B\u89C4\u683C\u8FC1\u79FB\u5DF2\u7531\u673A\u5668\u8BC1\u636E\u786E\u8BA4\uFF08\u5F53\u524D=${d.actual ?? "\u672A\u77E5"}\uFF09`;
    default: {
      const exhaustive = g;
      return `step '${stepId}' guard \u672A\u901A\u8FC7\uFF1A${JSON.stringify(exhaustive)}`;
    }
  }
}
async function evaluateCompiledGuards(guards, stepId, input) {
  const evals = await evaluateGuards(guards, input, { stopOnFirstFailure: false });
  const failures = evals.filter((e) => e.decision.kind === "failed").map((e) => renderGuardFailure(e, stepId));
  return { pass: failures.length === 0, failures };
}

// packages/kernel/dist/workflow/governed-lifecycle-policy.js
function governedLifecyclePolicy(governed, from, to) {
  if (!governed)
    return void 0;
  if (from === "spec" && to === "build")
    return DEFAULT_EVENT_POLICY["spec-complete"];
  if (from === "build" && to === "spec")
    return DEFAULT_EVENT_POLICY["requirements-changed"];
  if (from === "build" && to === "verify")
    return DEFAULT_EVENT_POLICY["build-complete"];
  if (from === "verify" && to === "ship")
    return DEFAULT_EVENT_POLICY["verify-pass"];
  if (from === "verify" && to === "build")
    return DEFAULT_EVENT_POLICY["verify-fail"];
  if (from === "ship" && to === "archive")
    return DEFAULT_EVENT_POLICY["ship-complete"];
  return void 0;
}
function mergeLifecycleGuards(declared, required2) {
  if (!required2 || required2.length === 0)
    return declared;
  const merged = [...declared];
  for (const candidate of required2) {
    if (!merged.some((guard) => JSON.stringify(guard) === JSON.stringify(candidate))) {
      merged.push(candidate);
    }
  }
  return merged;
}
function mergeLifecycleActions(declared, required2) {
  if (!required2 || required2.length === 0)
    return declared;
  return [...declared, ...required2.filter((candidate) => !declared.some((action) => action.type === candidate.type))];
}

// packages/kernel/dist/workflow/engine.js
function fieldStr3(state, k) {
  const v = state.fields[k];
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
function resolveWorkflowName(state) {
  return fieldStr3(state, "workflow") || "default";
}
function resolveStep(wf, stepId) {
  return wf.steps.find((s) => s.id === stepId) ?? null;
}
async function planStepTransition(ir, state, event, ctx, additionalGuards = []) {
  const stepId = fieldStr3(state, "phase");
  const step = resolveStep(ir, stepId);
  if (!step)
    return { ok: false, kind: "step-not-in-graph", stepId };
  const edge = step.transitions.find((t) => t.event === event);
  if (!edge) {
    return { ok: false, kind: "event-unsupported", stepId, available: step.transitions.map((t) => t.event) };
  }
  const guards = mergeLifecycleGuards([...step.guards, ...edge.guards], additionalGuards);
  const guardResult = await evaluateCompiledGuards(guards, stepId, buildStepGuardInput(state, ctx));
  if (!guardResult.pass) {
    return { ok: false, kind: "guard-failed", stepId, failures: guardResult.failures };
  }
  return { ok: true, from: stepId, to: edge.to, actions: edge.actions };
}
function applyStepTransition(state, to, clock) {
  return { ...state, fields: { ...state.fields, phase: to, updated_at: clock() } };
}

// packages/kernel/dist/required.js
function required(value, message = "required value is missing") {
  if (value === void 0)
    throw new Error(message);
  return value;
}

// packages/kernel/dist/state/workflow-run-repository.js
var DEFAULT_PLAN2 = compileEffectiveWorkflowPlan("default");
var DEFAULT_PLAN_BINDING2 = effectiveWorkflowPlanBinding(DEFAULT_PLAN2);
function deriveRun(fields, metadata) {
  const str3 = (v) => Array.isArray(v) ? v.join(",") : v ?? "";
  return {
    id: metadata.runId,
    workflowId: resolveWorkflowName({ fields, opaqueTail: "" }),
    currentStep: str3(fields.phase),
    lifecycle: str3(fields.archived) === "true" ? "archived" : "active",
    transitionSequence: metadata.transitionSequence,
    transitionHead: metadata.transitionHead,
    documentProfile: metadata.documentProfile,
    documentGovernanceFingerprint: metadata.documentGovernanceFingerprint,
    workflowPlanFingerprint: metadata.workflowPlanFingerprint,
    workflowPlanSnapshot: metadata.workflowPlanSnapshot,
    createdAt: str3(fields.created_at),
    updatedAt: str3(fields.updated_at),
    automationPolicy: metadata.automationPolicy,
    policyId: metadata.automationPolicy?.policy_id,
    policyVersion: metadata.automationPolicy?.policy_version,
    loopId: metadata.loopId,
    iterationId: metadata.iterationId
  };
}
var FsWorkflowRunRepository = class {
  deps;
  constructor(deps) {
    this.deps = deps;
  }
  async initChange(opts) {
    const newId = this.deps.newId ?? randomUUID5;
    const runId = opts.runId ?? newId();
    const workflowId = opts.initialWorkflow?.workflow ?? DEFAULT_PLAN2.id;
    const packagedPlan = resolveEffectiveWorkflowPlan(workflowId, () => null);
    const snapshot = opts.initialWorkflow?.workflowPlanSnapshot ?? (packagedPlan === null ? void 0 : workflowPlanSnapshot(packagedPlan));
    if (snapshot !== void 0) {
      const validated = effectiveWorkflowPlanFromSnapshot(snapshot);
      const boundFingerprint = opts.initialWorkflow?.workflowPlanFingerprint;
      if (validated.id !== workflowId || boundFingerprint !== void 0 && validated.workflowFingerprint !== boundFingerprint) {
        throw new Error("init workflow plan snapshot \u4E0E workflow identity/fingerprint \u4E0D\u4E00\u81F4");
      }
    }
    const usesPackagedOpenSpec = packagedPlan?.capabilities.documents.profile === "legacy-full";
    const governed = usesPackagedOpenSpec || opts.initialWorkflow?.documentProfile !== void 0 || opts.initialWorkflow?.openspecContract === true || opts.initialWorkflow?.documentContract === true;
    const initialFiles = [
      ...usesPackagedOpenSpec ? defaultOpenSpecScaffoldFiles(opts.name, opts.documentLocale ?? "zh-CN", packagedPlan.workflow.steps.map((step) => ({ id: step.id, label: step.label })), packagedPlan.projection.stepLabelSource) : [],
      ...governed ? [{
        relativePath: DOCUMENT_LEDGER_FILE,
        content: initialDocumentLedgerContent(this.deps.clock())
      }] : []
    ];
    const changeDir = await this.deps.store.init({
      ...opts,
      runId,
      initialFiles,
      ...snapshot === void 0 ? {} : {
        initialWorkflow: {
          ...opts.initialWorkflow ?? {
            workflow: workflowId,
            phase: packagedPlan?.workflow.steps[0]?.id ?? "open"
          },
          workflowPlanFingerprint: opts.initialWorkflow?.workflowPlanFingerprint ?? snapshot.workflowFingerprint,
          workflowPlanSnapshot: snapshot
        }
      }
    });
    const state = await this.deps.store.read(changeDir);
    return { changeDir, run: deriveRun(state.fields, required(state.runMetadata)) };
  }
  async establishRun(changeDir, governance = {}) {
    const { store } = this.deps;
    const newId = this.deps.newId ?? randomUUID5;
    return store.withLock(changeDir, async () => {
      const state = await store.read(changeDir);
      const workflowId = resolveWorkflowName(state);
      const documentProfile = governance.documentProfile ?? (governance.openspecContract === true ? "legacy-full" : governance.documentContract === true ? "document-v1" : void 0);
      const documentGovernanceFingerprint2 = governance.documentGovernanceFingerprint ?? (documentProfile === "legacy-full" ? DEFAULT_PLAN_BINDING2.documentGovernanceFingerprint : void 0);
      const workflowPlanFingerprint = governance.workflowPlanFingerprint ?? resolveEffectiveWorkflowPlan(workflowId, () => null)?.workflowFingerprint;
      if (state.runMetadata) {
        const existing = state.runMetadata;
        const asserted = [
          ["documentProfile", documentProfile],
          ["documentGovernanceFingerprint", documentGovernanceFingerprint2],
          ["workflowPlanFingerprint", workflowPlanFingerprint]
        ];
        for (const [field, expected] of asserted) {
          const observed = existing[field];
          if (observed !== void 0 && expected !== void 0 && observed !== expected) {
            throw new Error(`establishRun \u62D2\u7EDD\u8986\u76D6\u5DF2\u6709 ${field}\uFF1Aobserved='${observed}' expected='${expected}'`);
          }
        }
        const metadata2 = {
          ...existing,
          ...existing.documentProfile === void 0 && documentProfile !== void 0 ? { documentProfile } : {},
          ...existing.documentGovernanceFingerprint === void 0 && documentGovernanceFingerprint2 !== void 0 ? { documentGovernanceFingerprint: documentGovernanceFingerprint2 } : {},
          ...existing.workflowPlanFingerprint === void 0 && workflowPlanFingerprint !== void 0 ? { workflowPlanFingerprint } : {}
        };
        if (metadata2.documentProfile !== existing.documentProfile || metadata2.documentGovernanceFingerprint !== existing.documentGovernanceFingerprint || metadata2.workflowPlanFingerprint !== existing.workflowPlanFingerprint) {
          await ensureWorkflowGovernanceBinding(changeDir, metadata2);
        } else if (metadata2.documentProfile !== void 0 || metadata2.documentGovernanceFingerprint !== void 0 || metadata2.workflowPlanFingerprint !== void 0) {
          await ensureWorkflowGovernanceBinding(changeDir, metadata2);
        }
        return deriveRun(state.fields, metadata2);
      }
      const metadata = {
        runId: newId(),
        transitionSequence: 0,
        transitionHead: void 0,
        ...documentProfile === void 0 ? {} : { documentProfile },
        ...documentGovernanceFingerprint2 === void 0 ? {} : { documentGovernanceFingerprint: documentGovernanceFingerprint2 },
        ...workflowPlanFingerprint === void 0 ? {} : { workflowPlanFingerprint }
      };
      if (metadata.documentProfile !== void 0 || metadata.documentGovernanceFingerprint !== void 0 || metadata.workflowPlanFingerprint !== void 0) {
        await ensureWorkflowGovernanceBinding(changeDir, metadata);
      }
      await store.writeUnderLock(changeDir, { ...state, runMetadata: metadata });
      return deriveRun(state.fields, metadata);
    });
  }
  async bindAutomationPolicy(changeDir, policy, binding) {
    const { store } = this.deps;
    const newId = this.deps.newId ?? randomUUID5;
    return store.withLock(changeDir, async () => {
      const state = await store.read(changeDir);
      const metadata = state.runMetadata ? structuredClone(state.runMetadata) : { runId: newId(), transitionSequence: 0, transitionHead: void 0 };
      const existing = metadata.automationPolicy;
      if (existing !== void 0 && existing.policy_version !== policy.policy_version) {
        throw new Error(`WorkflowRun policy is immutable: ${existing.policy_version} != ${policy.policy_version}`);
      }
      const canonicalPolicy = validateAutomationPolicySnapshot(policy);
      if (binding !== void 0) {
        if (binding.loopId !== canonicalPolicy.loop_id || binding.iterationId.length === 0) {
          throw new Error("WorkflowRun governed binding does not match policy loop or has empty iteration");
        }
        if (metadata.loopId !== void 0 && metadata.loopId !== binding.loopId) {
          throw new Error("WorkflowRun loop binding is immutable");
        }
        metadata.loopId = binding.loopId;
        metadata.iterationId = binding.iterationId;
      }
      if (existing === void 0)
        metadata.automationPolicy = canonicalPolicy;
      if (existing !== void 0 && binding === void 0)
        return deriveRun(state.fields, metadata);
      if (existing !== void 0 && binding !== void 0 && state.runMetadata?.loopId === binding.loopId && state.runMetadata.iterationId === binding.iterationId) {
        return deriveRun(state.fields, metadata);
      }
      await store.writeUnderLock(changeDir, { ...state, runMetadata: metadata });
      return deriveRun(state.fields, metadata);
    });
  }
  async transact(changeDir, fn) {
    const { store, recordStore, clock } = this.deps;
    const newId = this.deps.newId ?? randomUUID5;
    return store.withLock(changeDir, async () => {
      const state = await store.read(changeDir);
      const beforeFields = structuredClone(state.fields);
      const metadata = state.runMetadata ? structuredClone(state.runMetadata) : { runId: newId(), transitionSequence: 0, transitionHead: void 0 };
      const run = deriveRun(state.fields, metadata);
      let committed = false;
      const tx = {
        run,
        state: {
          ...state,
          fields: structuredClone(state.fields),
          runMetadata: state.runMetadata ? structuredClone(state.runMetadata) : void 0
        },
        commit: async (nextFields, draft) => {
          if (committed) {
            throw new Error("WorkflowRunTransaction.commit: \u4E00\u6B21 transaction \u53EA\u80FD\u63D0\u4EA4\u4E00\u6B21\uFF08\u91CD\u590D\u8C03\u7528\u662F\u8C03\u7528\u65B9 bug\uFF09");
          }
          committed = true;
          const sequence = metadata.transitionSequence + 1;
          const recordId = newId();
          const observedAt = clock();
          const record2 = {
            schemaVersion: 1,
            id: recordId,
            runId: metadata.runId,
            policyId: metadata.automationPolicy?.policy_id,
            policyVersion: metadata.automationPolicy?.policy_version,
            loopId: metadata.loopId,
            iterationId: metadata.iterationId,
            sequence,
            previousRecordId: metadata.transitionHead,
            workflowId: run.workflowId,
            event: draft.event,
            from: draft.from,
            to: draft.to,
            effects: diffWireFieldsToEffects(beforeFields, nextFields),
            actor: draft.actor,
            observedAt
          };
          await recordStore.write(changeDir, record2);
          const newMetadata = {
            runId: metadata.runId,
            transitionSequence: sequence,
            transitionHead: recordId,
            documentProfile: metadata.documentProfile,
            documentGovernanceFingerprint: metadata.documentGovernanceFingerprint,
            workflowPlanFingerprint: metadata.workflowPlanFingerprint,
            workflowPlanSnapshot: metadata.workflowPlanSnapshot,
            automationPolicy: metadata.automationPolicy,
            loopId: metadata.loopId,
            iterationId: metadata.iterationId
          };
          const committedState = { fields: nextFields, runMetadata: newMetadata, opaqueTail: state.opaqueTail };
          const writeResult = await store.writeUnderLock(changeDir, committedState, {
            kind: "transition",
            transitionRecordId: recordId
          });
          const newRun = deriveRun(nextFields, newMetadata);
          return { run: newRun, record: record2, projection: writeResult.projection };
        }
      };
      return fn(tx);
    });
  }
};
function createWorkflowRunRepository(deps) {
  return new FsWorkflowRunRepository(deps);
}

// packages/kernel/dist/state/projectRegistry.js
import { readFileSync as readFileSync5 } from "node:fs";
import { mkdir as mkdir7, rename as rename3, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname2, resolve as resolvePath } from "node:path";
function readProjectRegistry(registryPath) {
  try {
    const data = JSON.parse(readFileSync5(registryPath, "utf8"));
    return Array.isArray(data) ? data.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}
var tmpSeq = 0;
async function writeProjectRegistryUnlocked(registryPath, roots) {
  await mkdir7(dirname2(registryPath), { recursive: true });
  const tmp = `${registryPath}.tmp.${process.pid}.${tmpSeq++}`;
  await writeFile5(tmp, `${JSON.stringify(roots, null, 2)}
`, "utf8");
  await rename3(tmp, registryPath);
}
async function withProjectRegistryLock(registryPath, operation) {
  const dir = dirname2(registryPath);
  await mkdir7(dir, { recursive: true });
  return withLock(dir, operation);
}
async function registerProjectRoot(registryPath, rawRoot) {
  const normalized2 = resolvePath(rawRoot);
  return withProjectRegistryLock(registryPath, async () => {
    const existing = readProjectRegistry(registryPath);
    if (existing.some((e) => e && resolvePath(e) === normalized2))
      return false;
    await writeProjectRegistryUnlocked(registryPath, [...existing, normalized2]);
    return true;
  });
}
async function unregisterProjectRoot(registryPath, rawRoot) {
  const normalized2 = resolvePath(rawRoot);
  return withProjectRegistryLock(registryPath, async () => {
    const existing = readProjectRegistry(registryPath);
    const next = existing.filter((entry) => !entry || resolvePath(entry) !== normalized2);
    if (next.length === existing.length)
      return false;
    await writeProjectRegistryUnlocked(registryPath, next);
    return true;
  });
}

// packages/kernel/dist/state/secrets.js
import { existsSync as existsSync3, readFileSync as readFileSync6 } from "node:fs";
import { mkdir as mkdir8, rename as rename4, writeFile as writeFile6 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
var SECRET_KEYS = ["CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"];
function isSecretKey(key) {
  return SECRET_KEYS.includes(key);
}
function assertSecretKey(key) {
  if (!isSecretKey(key)) {
    throw new Error(`\u975E\u6CD5 key '${key}'\uFF08\u4EC5\u5141\u8BB8 ${SECRET_KEYS.join(" / ")}\uFF09`);
  }
}
function readSecrets(path7) {
  try {
    const parsed = JSON.parse(readFileSync6(path7, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { version: 1, keys: {} };
    const rawKeys = parsed.keys;
    if (typeof rawKeys !== "object" || rawKeys === null || Array.isArray(rawKeys))
      return { version: 1, keys: {} };
    const keys = {};
    for (const k of SECRET_KEYS) {
      const v = rawKeys[k];
      if (typeof v === "string" && v !== "")
        keys[k] = v;
    }
    return { version: 1, keys };
  } catch {
    return { version: 1, keys: {} };
  }
}
var tmpSeq2 = 0;
async function atomicWriteSecrets(path7, store) {
  await mkdir8(dirname3(path7), { recursive: true });
  const tmp = `${path7}.tmp.${process.pid}.${tmpSeq2++}`;
  await writeFile6(tmp, `${JSON.stringify(store, null, 2)}
`, { encoding: "utf8", mode: 384 });
  await rename4(tmp, path7);
}
async function withSecretsLock(path7, fn) {
  const dir = dirname3(path7);
  await mkdir8(dir, { recursive: true });
  return withLock(dir, fn);
}
async function writeSecretKey(path7, key, value) {
  assertSecretKey(key);
  await withSecretsLock(path7, async () => {
    const current = readSecrets(path7);
    await atomicWriteSecrets(path7, { version: 1, keys: { ...current.keys, [key]: value } });
  });
}
async function deleteSecretKey(path7, key) {
  assertSecretKey(key);
  if (!existsSync3(path7))
    return;
  await withSecretsLock(path7, async () => {
    const current = readSecrets(path7);
    if (!(key in current.keys))
      return;
    const keys = { ...current.keys };
    delete keys[key];
    await atomicWriteSecrets(path7, { version: 1, keys });
  });
}

// packages/kernel/dist/flow/manifest.js
import { readFileSync as readFileSync7 } from "node:fs";
var ManifestError = class extends Error {
  constructor(message) {
    super(`manifest: ${message}`);
    this.name = "ManifestError";
  }
};
var PHASE_SET = new Set(PHASES);
var SKILL_TRACK_SET = /* @__PURE__ */ new Set(["pm", "frontend", "backend", "free", "_all"]);
function skillsFor(table, phase, track) {
  const row = table[phase];
  if (!row)
    return [];
  if (track in row)
    return row[track] ?? [];
  if ("_all" in row)
    return row._all ?? [];
  return [];
}
function skillTokenAlternatives(token) {
  const branches = token.split("|");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const branch of branches) {
    if (branch.trim() === "") {
      throw new ManifestError(`skill token '${token}' \u542B\u7A7A/\u7EAF\u7A7A\u767D alternative branch\uFF08\u5982 'a|b'\u3001'|b'\u3001'a| |b'\uFF0C\u5907\u9009\u8BED\u6CD5\u4E0D\u8BB8\u7A7A\u6BB5\uFF09`);
    }
    for (const segment of branch.split(":")) {
      if (segment === "" || segment === ".") {
        throw new ManifestError(`skill token '${token}' \u7684 alternative branch '${branch}' \u542B\u975E\u6CD5\u8DEF\u5F84\u6BB5 ${JSON.stringify(segment)}\uFF08\u7981\u7A7A\u6BB5\u3001\u7981\u5355\u72EC '.'\u2014\u2014\u4F1A\u88AB\u7269\u7406\u5B9A\u4F4D\u5F53\u6210\u6574\u4E2A skill \u6839\u76EE\u5F55\uFF09`);
      }
    }
    if (seen.has(branch)) {
      throw new ManifestError(`skill token '${token}' \u542B\u91CD\u590D alternative branch '${branch}'`);
    }
    seen.add(branch);
    out.push(branch);
  }
  return out;
}
function assertPhase(name, ctx) {
  if (!PHASE_SET.has(name)) {
    throw new ManifestError(`${ctx} \u542B\u672A\u77E5\u76F8\u4F4D '${name}'\uFF08\u5408\u6CD5\uFF1A${PHASES.join("/")}\uFF09`);
  }
  return name;
}
function stripComment(line) {
  const t = line.trimStart();
  if (t.startsWith("#"))
    return "";
  const m = line.match(/^(.*?)\s#/);
  return (m ? m[1] : line).trimEnd();
}
function indentOf3(line) {
  let n = 0;
  while (n < line.length && line[n] === " ")
    n++;
  return n;
}
function parseFlowList(raw, ctx) {
  const s = raw.trim();
  const m = s.match(/^\[(.*)\]$/);
  if (!m)
    throw new ManifestError(`${ctx} \u671F\u671B\u5355\u884C\u6D41\u5F0F\u5217\u8868 [a, b]\uFF0C\u5F97\u5230 '${raw}'`);
  const inner = m[1].trim();
  if (inner === "")
    return [];
  return inner.split(",").map((x) => x.trim()).filter((x) => x !== "");
}
function parseScalarValue(rest, ctx) {
  const s = rest.trim();
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    if (end < 0)
      throw new ManifestError(`${ctx} \u5355\u5F15\u53F7\u672A\u95ED\u5408: '${rest}'`);
    return s.slice(1, end);
  }
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    if (end < 0)
      throw new ManifestError(`${ctx} \u53CC\u5F15\u53F7\u672A\u95ED\u5408: '${rest}'`);
    return s.slice(1, end);
  }
  const m = s.match(/^(.*?)\s#/);
  return (m ? m[1] : s).trimEnd();
}
function decodeDoubleQuotedYamlKey(token) {
  if (!token.startsWith('"') || !token.endsWith('"'))
    return void 0;
  const body = token.slice(1, -1);
  let decoded = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char !== "\\") {
      decoded += char;
      continue;
    }
    const escape = body[++i];
    if (escape === void 0)
      return void 0;
    const width = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (width > 0) {
      const hex = body.slice(i + 1, i + 1 + width);
      if (hex.length !== width || !/^[0-9A-Fa-f]+$/.test(hex))
        return void 0;
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint > 1114111)
        return void 0;
      decoded += String.fromCodePoint(codePoint);
      i += width;
      continue;
    }
    const simple = {
      "0": "\0",
      a: "\x07",
      b: "\b",
      t: "	",
      n: "\n",
      v: "\v",
      f: "\f",
      r: "\r",
      e: "\x1B",
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      N: "\x85",
      _: "\xA0",
      L: "\u2028",
      P: "\u2029"
    };
    const value = simple[escape];
    if (value === void 0)
      return void 0;
    decoded += value;
  }
  return decoded;
}
function decodeYamlKey(token) {
  const trimmed = token.trim();
  if (trimmed.startsWith('"'))
    return decodeDoubleQuotedYamlKey(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(trimmed) ? trimmed : void 0;
}
function topLevelKeyToken(raw) {
  const line = raw.trimStart();
  if (line === "" || line.startsWith("#"))
    return void 0;
  const explicit = line.match(/^\?\s+(.+?)\s*(?:\s+#.*)?$/);
  if (explicit)
    return explicit[1];
  const quoted = line.match(/^("(?:\\.|[^"\\])*"|'(?:''|[^'])*')\s*:/);
  if (quoted)
    return quoted[1];
  const plain = line.match(/^([^:#]+?)\s*:/);
  return plain?.[1];
}
function hasDeprecatedRouterKeyAt(lines, index) {
  const direct = topLevelKeyToken(lines[index]);
  if (direct !== void 0 && decodeYamlKey(direct) === "router_patterns")
    return true;
  const current = lines[index];
  if (current.trim() !== "?")
    return false;
  const parentIndent = indentOf3(current);
  for (let i = index + 1; i < lines.length; i++) {
    const candidate = lines[i];
    if (candidate.trim() === "" || candidate.trimStart().startsWith("#"))
      continue;
    if (indentOf3(candidate) <= parentIndent)
      return false;
    return decodeYamlKey(candidate.trim()) === "router_patterns";
  }
  return false;
}
function throwDeprecatedRouterKey(path7, line) {
  throw new ManifestError(`${path7}:${line} router_patterns \u5DF2\u8FC1\u79FB\u5230 .pipeline/tracks.yaml \u7684 policy_profile.routing\uFF1B\u8BF7\u5220\u9664\u65E7\u5B57\u6BB5\u5E76\u5728 Track Registry \u4E2D\u58F0\u660E routing policy`);
}
function parseSkillBlock(lines, start, path7, section2) {
  const map = /* @__PURE__ */ new Map();
  let i = start;
  while (i < lines.length) {
    const l = stripComment(lines[i]);
    if (l.trim() === "") {
      i++;
      continue;
    }
    if (!/^\s/.test(l))
      break;
    const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_.-]*):\s*(\[.*\])\s*$/);
    if (!entry) {
      throw new ManifestError(`${path7}:${i + 1} ${section2} \u6761\u76EE\u987B\u4E3A 'phase.track: [skill, ...]'\uFF0C\u5F97\u5230 '${lines[i]}'`);
    }
    map.set(entry[1], parseFlowList(entry[2], `${section2}.${entry[1]}`));
    i++;
  }
  return { map, next: i };
}
function parseBreadcrumbBlock(lines, start, path7) {
  const map = /* @__PURE__ */ new Map();
  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === "") {
      i++;
      continue;
    }
    const ind = indentOf3(raw);
    if (ind === 0)
      break;
    if (raw.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    const entry = raw.match(/^(\s+)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) {
      throw new ManifestError(`${path7}:${i + 1} breadcrumb \u6761\u76EE\u987B\u4E3A 'phase: |' \u6216 'phase: value'\uFF0C\u5F97\u5230 '${lines[i]}'`);
    }
    const keyIndent = entry[1].length;
    const key = entry[2];
    const rest = entry[3].trim();
    i++;
    if (rest === "|" || rest === "|-" || rest === "|+") {
      const blk = [];
      while (i < lines.length) {
        const bl = lines[i];
        if (bl.trim() === "") {
          blk.push("");
          i++;
          continue;
        }
        if (indentOf3(bl) <= keyIndent)
          break;
        blk.push(bl);
        i++;
      }
      const firstContent = blk.find((x) => x !== "");
      let value = "";
      if (firstContent !== void 0) {
        const blockIndent = indentOf3(firstContent);
        value = blk.map((x) => x === "" ? "" : x.slice(blockIndent)).join("\n").replace(/\n+$/, "");
      }
      map.set(key, value);
    } else {
      map.set(key, parseScalarValue(rest, `breadcrumb.${key}`));
    }
  }
  return { map, next: i };
}
function scanSections(text2, path7) {
  const lines = text2.split("\n");
  const out = {};
  let i = 0;
  while (i < lines.length) {
    if (hasDeprecatedRouterKeyAt(lines, i))
      throwDeprecatedRouterKey(path7, i + 1);
    const line = stripComment(lines[i]);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const top = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!top) {
      throw new ManifestError(`${path7}:${i + 1} \u65E0\u6CD5\u89E3\u6790\u7684\u9876\u5C42\u884C '${lines[i]}'\uFF08\u7A84\u89E3\u6790\u5B50\u96C6\u5916\uFF09\uFF1B\u82E5\u8BE5\u952E\u662F\u65E7 router_patterns \u7684 YAML \u7B49\u4EF7\u5199\u6CD5\uFF1A\u5B83\u5DF2\u8FC1\u79FB\u5230 .pipeline/tracks.yaml \u7684 policy_profile.routing`);
    }
    const key = top[1];
    const rest = top[2].trim();
    if (key === "phases" || key === "review_phases") {
      const items = [];
      if (rest !== "") {
        items.push(...parseFlowList(rest, key));
        i++;
      } else {
        i++;
        while (i < lines.length) {
          const l = stripComment(lines[i]);
          if (l.trim() === "") {
            i++;
            continue;
          }
          const item2 = l.match(/^\s+-\s+(\S+)\s*$/);
          if (!item2)
            break;
          items.push(item2[1]);
          i++;
        }
      }
      if (key === "phases")
        out.phases = items;
      else
        out.review_phases = items;
    } else if (key === "transitions") {
      if (rest !== "")
        throw new ManifestError(`${path7}:${i + 1} transitions \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const map = /* @__PURE__ */ new Map();
      i++;
      while (i < lines.length) {
        const l = stripComment(lines[i]);
        if (l.trim() === "") {
          i++;
          continue;
        }
        if (!/^\s/.test(l))
          break;
        const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(\[.*\])\s*$/);
        if (!entry) {
          throw new ManifestError(`${path7}:${i + 1} transitions \u6761\u76EE\u987B\u4E3A 'from: [to, ...]'\uFF0C\u5F97\u5230 '${lines[i]}'`);
        }
        map.set(entry[1], parseFlowList(entry[2], `transitions.${entry[1]}`));
        i++;
      }
      out.transitions = map;
    } else if (key === "mandatory_skills" || key === "recommended_skills") {
      if (rest !== "")
        throw new ManifestError(`${path7}:${i + 1} ${key} \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const r = parseSkillBlock(lines, i + 1, path7, key);
      if (key === "mandatory_skills")
        out.mandatory_skills = r.map;
      else
        out.recommended_skills = r.map;
      i = r.next;
    } else if (key === "breadcrumb") {
      if (rest !== "")
        throw new ManifestError(`${path7}:${i + 1} breadcrumb \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const r = parseBreadcrumbBlock(lines, i + 1, path7);
      out.breadcrumb = r.map;
      i = r.next;
    } else {
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const stripped = stripComment(l);
        if (stripped.trim() !== "" && !/^\s/.test(stripped))
          break;
        i++;
      }
    }
  }
  return out;
}
function emptySkillTable() {
  const t = {};
  for (const p of PHASES)
    t[p] = {};
  return t;
}
function deriveSkillTable(raw, declared, section2) {
  const table = emptySkillTable();
  if (!raw)
    return table;
  for (const [pt, list] of raw) {
    const dot = pt.indexOf(".");
    if (dot <= 0 || dot === pt.length - 1) {
      throw new ManifestError(`${section2} \u952E '${pt}' \u987B\u4E3A 'phase.track' \u5F62\u5F0F`);
    }
    const phaseName = pt.slice(0, dot);
    const track = pt.slice(dot + 1);
    const phase = assertPhase(phaseName, section2);
    if (!declared.has(phase))
      throw new ManifestError(`${section2}.${pt} \u76F8\u4F4D '${phaseName}' \u672A\u5728 phases \u58F0\u660E`);
    if (!SKILL_TRACK_SET.has(track)) {
      throw new ManifestError(`${section2}.${pt} \u542B\u672A\u77E5 profile '${track}'\uFF08\u5408\u6CD5\uFF1Apm/frontend/backend/free/_all\uFF09`);
    }
    table[phase][track] = list;
  }
  return table;
}
function loadManifest(path7) {
  const text2 = readFileSync7(path7, "utf8");
  const raw = scanSections(text2, path7);
  if (!raw.phases || raw.phases.length === 0)
    throw new ManifestError(`${path7} \u7F3A phases \u5C0F\u8282`);
  if (!raw.transitions)
    throw new ManifestError(`${path7} \u7F3A transitions \u5C0F\u8282`);
  if (!raw.review_phases) {
    throw new ManifestError(`${path7} \u7F3A review_phases \u952E\uFF08review-gate \u540D\u5355\u4E0D\u8BB8\u9759\u9ED8\u7F3A\u5931\uFF09`);
  }
  const phases = raw.phases.map((p) => assertPhase(p, "phases"));
  const declared = new Set(phases);
  if (declared.size !== phases.length)
    throw new ManifestError("phases \u542B\u91CD\u590D\u76F8\u4F4D");
  const transitions = {};
  for (const p of PHASES)
    transitions[p] = [];
  for (const [from, targets] of raw.transitions) {
    const fromPh = assertPhase(from, "transitions");
    if (!declared.has(fromPh))
      throw new ManifestError(`transitions.${from} \u4E0D\u5728\u5DF2\u58F0\u660E phases \u4E2D`);
    transitions[fromPh] = targets.map((t) => {
      const toPh = assertPhase(t, `transitions.${from}`);
      if (!declared.has(toPh))
        throw new ManifestError(`transitions.${from} \u6307\u5411\u672A\u58F0\u660E\u76F8\u4F4D '${t}'`);
      return toPh;
    });
  }
  for (const p of phases) {
    if (!raw.transitions.has(p)) {
      throw new ManifestError(`transitions \u7F3A\u76F8\u4F4D '${p}' \u7684\u6761\u76EE\uFF08\u7EC8\u6001\u4E5F\u987B\u663E\u5F0F\u58F0\u660E\uFF0C\u53EF\u4E3A []\uFF09`);
    }
  }
  const reviewPhases = raw.review_phases.map((p) => {
    const ph = assertPhase(p, "review_phases");
    if (!declared.has(ph))
      throw new ManifestError(`review_phases \u542B\u672A\u58F0\u660E\u76F8\u4F4D '${p}'`);
    return ph;
  });
  const mandatorySkills = deriveSkillTable(raw.mandatory_skills, declared, "mandatory_skills");
  const recommendedSkills = deriveSkillTable(raw.recommended_skills, declared, "recommended_skills");
  const breadcrumbs = {};
  if (raw.breadcrumb) {
    for (const [phaseName, prose] of raw.breadcrumb) {
      const ph = assertPhase(phaseName, "breadcrumb");
      if (!declared.has(ph))
        throw new ManifestError(`breadcrumb \u542B\u672A\u58F0\u660E\u76F8\u4F4D '${phaseName}'`);
      breadcrumbs[ph] = prose;
    }
  }
  return { phases, transitions, reviewPhases, mandatorySkills, recommendedSkills, breadcrumbs };
}

// packages/kernel/dist/flow/engine.js
function defaultClock() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function createFlowEngine(manifest) {
  const phaseIndex = new Map(manifest.phases.map((p, i) => [p, i]));
  const reviewSet = new Set(manifest.reviewPhases);
  function legalTransitions(phase) {
    return manifest.transitions[phase] ?? [];
  }
  function transition(state, to, clock) {
    const rawFrom = state.fields.phase;
    const from = typeof rawFrom === "string" ? rawFrom : "";
    if (!phaseIndex.has(from) || !legalTransitions(from).includes(to)) {
      throw new IllegalTransitionError(from, to);
    }
    let phaseStatus = "pending";
    if (from === to)
      phaseStatus = "done";
    else if ((phaseIndex.get(to) ?? -1) < (phaseIndex.get(from) ?? -1))
      phaseStatus = "in_progress";
    const fields = { ...state.fields };
    fields.phase = to;
    fields.phase_status = phaseStatus;
    fields.updated_at = (clock ?? defaultClock)();
    return { from, to, state: { fields, opaqueTail: state.opaqueTail } };
  }
  function guardCheck(state, ctx) {
    return evaluateGuard(state, ctx);
  }
  function isReviewPhase(phase) {
    return reviewSet.has(phase);
  }
  return { manifest, legalTransitions, transition, guardCheck, isReviewPhase };
}

// packages/kernel/dist/flow/transition-table.js
var TRANSITION_EVENTS = {
  "open-complete": { from: "open", to: "explore" },
  "explore-complete": { from: "explore", to: "spec" },
  "spec-complete": { from: "spec", to: "build" },
  "requirements-changed": { from: "build", to: "spec" },
  "build-complete": { from: "build", to: "verify" },
  "verify-pass": { from: "verify", to: "ship" },
  "verify-fail": { from: "verify", to: "build" },
  "ship-complete": { from: "ship", to: "archive" },
  archived: { from: "archive", to: "archive" }
};
function eventEdge(event) {
  return Object.prototype.hasOwnProperty.call(TRANSITION_EVENTS, event) ? TRANSITION_EVENTS[event] : void 0;
}

// packages/kernel/dist/machine-state-scope.js
import { createHash as createHash7 } from "node:crypto";
import { resolve as resolve5 } from "node:path";
var STATE_SCOPE_NAMESPACE = "tenon:machine-state-scope:v1\0";
function canonicalMachineStateRoot(stateRoot) {
  return resolve5(stateRoot);
}
function machineStateScopeId(stateRoot) {
  const digest2 = createHash7("sha256").update(STATE_SCOPE_NAMESPACE).update(canonicalMachineStateRoot(stateRoot)).digest("hex");
  return `sha256-v1-${digest2}`;
}

// packages/kernel/dist/product-paths.js
import { homedir as homedir2 } from "node:os";
import { posix, win32 } from "node:path";
function pathApi(platform) {
  return platform === "win32" ? win32 : posix;
}
function usableAbsolute(value, paths) {
  if (value === void 0)
    return null;
  const trimmed = value.trim();
  return trimmed !== "" && paths.isAbsolute(trimmed) ? paths.resolve(trimmed) : null;
}
function namespacedRoot(homeDir, env, key, fallback, paths) {
  return paths.join(usableAbsolute(env[key], paths) ?? paths.join(homeDir, fallback), "tenon");
}
function parseProductRootContract(raw, paths) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("TENON_RUNTIME_ROOTS \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("TENON_RUNTIME_ROOTS \u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61");
  }
  const record2 = value;
  const dataRoot = usableAbsolute(typeof record2.dataRoot === "string" ? record2.dataRoot : void 0, paths);
  const stateRoot = usableAbsolute(typeof record2.stateRoot === "string" ? record2.stateRoot : void 0, paths);
  const configRoot = usableAbsolute(typeof record2.configRoot === "string" ? record2.configRoot : void 0, paths);
  if (record2.version !== 1 || dataRoot === null || stateRoot === null || configRoot === null) {
    throw new Error("TENON_RUNTIME_ROOTS \u5FC5\u987B\u662F version=1 \u7684\u7EDD\u5BF9 data/state/config root");
  }
  return { version: 1, dataRoot, stateRoot, configRoot };
}
function resolveProductPaths(input = {}) {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const paths = pathApi(platform);
  const homeDir = paths.resolve(input.homeDir ?? homedir2());
  const inherited = env.TENON_RUNTIME_ROOTS === void 0 ? null : parseProductRootContract(env.TENON_RUNTIME_ROOTS, paths);
  const overridden = usableAbsolute(env.TENON_RUNTIME_HOME, paths);
  let dataRoot;
  let stateRoot;
  let configRoot;
  if (inherited !== null) {
    dataRoot = inherited.dataRoot;
    stateRoot = inherited.stateRoot;
    configRoot = inherited.configRoot;
  } else if (overridden !== null) {
    dataRoot = paths.join(overridden, "data");
    stateRoot = paths.join(overridden, "state");
    configRoot = paths.join(overridden, "config");
  } else if (platform === "darwin") {
    const base = paths.join(homeDir, "Library", "Application Support", "tenon");
    dataRoot = base;
    stateRoot = paths.join(base, "state");
    configRoot = paths.join(base, "config");
  } else if (platform === "win32") {
    const local = usableAbsolute(env.LOCALAPPDATA, paths) ?? paths.join(homeDir, "AppData", "Local");
    const roaming = usableAbsolute(env.APPDATA, paths) ?? paths.join(homeDir, "AppData", "Roaming");
    dataRoot = paths.join(local, "tenon");
    stateRoot = paths.join(local, "tenon", "state");
    configRoot = paths.join(roaming, "tenon");
  } else {
    dataRoot = namespacedRoot(homeDir, env, "XDG_DATA_HOME", ".local/share", paths);
    stateRoot = namespacedRoot(homeDir, env, "XDG_STATE_HOME", ".local/state", paths);
    configRoot = namespacedRoot(homeDir, env, "XDG_CONFIG_HOME", ".config", paths);
  }
  return {
    homeDir,
    dataRoot,
    stateRoot,
    configRoot,
    releasesRoot: paths.join(dataRoot, "releases"),
    stagingRoot: paths.join(dataRoot, ".staging"),
    bootstrapRoot: paths.join(dataRoot, "bootstrap"),
    migrationsRoot: paths.join(stateRoot, "migrations"),
    channelsRoot: paths.join(stateRoot, "channels"),
    selectionPath: paths.join(stateRoot, "selection.json"),
    auditPath: paths.join(stateRoot, "audit.jsonl"),
    registryPath: paths.join(configRoot, "projects.json"),
    secretsPath: paths.join(configRoot, "secrets.json"),
    dashboardTokenPath: paths.join(stateRoot, "dashboard-token.json"),
    dashboardPidfilePath: paths.join(stateRoot, "dashboard-server.json"),
    managedTransactionRoot: paths.join(stateRoot, "managed-release-transaction")
  };
}

// packages/kernel/dist/workspace/terminal-activity.js
var TERMINAL_ACTIVITY_FILE = ".pipeline-terminal-activity.json";
var TERMINAL_ACTIVITY_PROTOCOL = "pipeline-terminal-activity-v1";
var TERMINAL_ACTIVITY_TTL_MS = 12e4;
var CHANGE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function isRecord4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asNonEmptyString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function isTerminalSessionId(value) {
  return SESSION_ID.test(value);
}
function isTerminalActivityChangeName(value) {
  return CHANGE_NAME.test(value);
}
function parseTerminalActivityRecord(value) {
  if (!isRecord4(value) || value.protocol !== TERMINAL_ACTIVITY_PROTOCOL)
    return null;
  const change = asNonEmptyString(value.change);
  const sessionId = asNonEmptyString(value.session_id);
  const heartbeatAt = asNonEmptyString(value.heartbeat_at);
  if (change === null || sessionId === null || heartbeatAt === null)
    return null;
  if (!isTerminalActivityChangeName(change) || !isTerminalSessionId(sessionId))
    return null;
  if (!Number.isFinite(Date.parse(heartbeatAt)))
    return null;
  const turn = value.turn_id;
  if (turn !== void 0 && (typeof turn !== "string" || turn === ""))
    return null;
  return {
    protocol: TERMINAL_ACTIVITY_PROTOCOL,
    change,
    sessionId,
    heartbeatAt,
    ...typeof turn === "string" ? { turnId: turn } : {}
  };
}
function liveTerminalActivity(record2, nowMs) {
  const heartbeatMs = Date.parse(record2.heartbeatAt);
  if (!Number.isFinite(heartbeatMs) || heartbeatMs > nowMs + 3e4)
    return null;
  if (nowMs - heartbeatMs >= TERMINAL_ACTIVITY_TTL_MS)
    return null;
  return {
    sessionId: record2.sessionId,
    heartbeatAt: record2.heartbeatAt,
    expiresAt: new Date(heartbeatMs + TERMINAL_ACTIVITY_TTL_MS).toISOString(),
    ...record2.turnId === void 0 ? {} : { turnId: record2.turnId }
  };
}

// packages/kernel/dist/tracks/types.js
var TRACK_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

// packages/kernel/dist/tracks/builtins.js
var BUILTIN_TRACK_IDS = ["chat", "simple", "pm", "frontend", "backend", "free"];
function isBuiltinTrackId(id) {
  return BUILTIN_TRACK_IDS.includes(id);
}
var BUILTIN_ROUTER_PATTERNS = {
  simple: "((\u9519\u522B\u5B57|\u62FC\u5199|typo|\u6587\u6848|\u6CE8\u91CA|comment|\u5FEB\u901F\u4FEE\u590D|quick patch|\u79FB\u9664\u672A\u4F7F\u7528|unused import|\u683C\u5F0F\u5316|formatting|\u914D\u7F6E\u503C|\u5C0F\u6539|\u5FAE\u8C03).*(README|CHANGELOG|\u6587\u6863|docs/|\u6587\u4EF6|[A-Za-z0-9_./-]+\\.(md|txt|json|ya?ml|toml|tsx?|jsx?|vue|css|scss|html|py|go|rs|java)|\u7EC4\u4EF6|\u9875\u9762|\u6309\u94AE|\u6807\u9898|\u6807\u7B7E|\u5B57\u6BB5|\u952E|key|\u4E00\u884C|\u5355\u884C)|(README|CHANGELOG|\u6587\u6863|docs/|\u6587\u4EF6|[A-Za-z0-9_./-]+\\.(md|txt|json|ya?ml|toml|tsx?|jsx?|vue|css|scss|html|py|go|rs|java)|\u7EC4\u4EF6|\u9875\u9762|\u6309\u94AE|\u6807\u9898|\u6807\u7B7E|\u5B57\u6BB5|\u952E|key|\u4E00\u884C|\u5355\u884C).*(\u9519\u522B\u5B57|\u62FC\u5199|typo|\u6587\u6848|\u6CE8\u91CA|comment|\u5FEB\u901F\u4FEE\u590D|quick patch|\u79FB\u9664\u672A\u4F7F\u7528|unused import|\u683C\u5F0F\u5316|formatting|\u914D\u7F6E\u503C|\u5C0F\u6539|\u5FAE\u8C03))",
  frontend: "(\u524D\u7AEF|UI|\u9875\u9762|\u7EC4\u4EF6|React|Vue|Next|Tailwind|\u6837\u5F0F|shadcn|\\.tsx|\\.jsx|\\.vue|web \u8BBE\u8BA1|\u54CD\u5E94\u5F0F|button|form|layout)",
  backend: "(\u540E\u7AEF|backend|API|\u63A5\u53E3|\u6570\u636E\u5E93|Go |Python |Java |Rust |NestJS|Postgres|endpoint|service|\u5FAE\u670D\u52A1|REST|GraphQL|gRPC|migration|server|controller|schema|\u4FEE\u590D|\u4FEE\u6539|\u5B9E\u73B0|\u6DFB\u52A0|\u91CD\u6784|bug|feature|\u5FAE\u8C03|\u7248\u672C\u53F7|\u683C\u5F0F\u5316|formatting|\u9519\u522B\u5B57|\u62FC\u5199|typo|\u6587\u6848|\u6CE8\u91CA)",
  pm: "(\u8C03\u7814|\u7ADE\u54C1|\u5E02\u573A|\u7ADE\u4E89\u5BF9\u624B|\u5BF9\u6807|\u5546\u4E1A\u6A21\u5F0F|PRD|\u9700\u6C42|\u7528\u6237\u65C5\u7A0B|\u539F\u578B|market|\u7ACB\u9879|\u4EA7\u54C1|user persona|\u6D41\u7A0B\u56FE)"
};
var BUILTIN_ROUTER_EXCLUDE_PATTERNS = {
  simple: "(\u8DE8\u6A21\u5757|\u591A\u6A21\u5757|\u591A\u6587\u4EF6|\u6574\u4E2A\u9879\u76EE|\u5168\u9879\u76EE|\u5168\u4ED3|\u6240\u6709\u6587\u4EF6|\u6279\u91CF|\u65B0\u529F\u80FD|feature|\u91CD\u6784|\u67B6\u6784|\u7B97\u6CD5|\u4E1A\u52A1\u903B\u8F91|\u6838\u5FC3\u903B\u8F91|\u884C\u4E3A\u53D8\u66F4|API|\u63A5\u53E3|\u516C\u5171\u5951\u7EA6|contract|\u534F\u8BAE|schema|migration|\u6570\u636E\u5E93|\u767B\u5F55|\u8BA4\u8BC1|\u9274\u6743|\u6743\u9650|auth|security|\u5B89\u5168|\u5E76\u53D1|\u4E8B\u52A1|transaction|\u4F9D\u8D56|dependency|package|npm|pnpm|yarn|bun|\u5347\u7EA7|\u5347\u5230|\u66F4\u65B0\u7248\u672C|\u751F\u4EA7\u6570\u636E|\u90E8\u7F72|\u53D1\u5E03|release|\u5916\u90E8\u526F\u4F5C\u7528|\u591A\u7AEF|\u524D\u540E\u7AEF|\u5168\u6808)"
};
var WORKFLOW_ANY = { default: "default", allowed: "*" };
var BUILTIN_TRACK_DEFINITIONS = [
  {
    id: "chat",
    label: "Chat",
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: "pending",
      automationEligible: true,
      coverageProfile: "none",
      routing: { enabled: false },
      skills: { matrix: false, profile: "_all" }
    }
  },
  {
    id: "simple",
    label: "Simple",
    builtin: true,
    workflow: { default: "simple", allowed: ["simple"] },
    policyProfile: {
      reviewSeed: "pending",
      automationEligible: false,
      coverageProfile: "none",
      routing: {
        enabled: true,
        pattern: BUILTIN_ROUTER_PATTERNS.simple,
        excludePattern: BUILTIN_ROUTER_EXCLUDE_PATTERNS.simple,
        priority: 1e3
      },
      skills: { matrix: false, profile: "_all" }
    }
  },
  {
    id: "pm",
    label: "PM",
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: "skipped",
      // PM 的默认产物是调研/规格；当 Spec 已完成时交给 AFK 队列继续执行。该位与
      // automationEligible 分开，避免前端/后端的“可手动 AFK”被误解成“自动接管 Build”。
      autoEnqueueOnSpecComplete: true,
      // 手动 AFK capability 与自动入队保持两条独立授权：两者都仍会经过 normal loop
      // admission、skill bundle、verification 与 L1/L2/L3 执行闸。
      automationEligible: true,
      coverageProfile: "pm",
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.pm, priority: 100 },
      skills: { matrix: true, profile: "pm" }
    }
  },
  {
    id: "frontend",
    label: "Frontend",
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: "pending",
      automationEligible: true,
      coverageProfile: "frontend",
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.frontend, priority: 300 },
      skills: { matrix: true, profile: "frontend" }
    }
  },
  {
    id: "backend",
    label: "Backend",
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: "pending",
      automationEligible: true,
      coverageProfile: "backend",
      routing: { enabled: true, pattern: BUILTIN_ROUTER_PATTERNS.backend, priority: 200 },
      skills: { matrix: true, profile: "backend" }
    }
  },
  {
    id: "free",
    label: "Free",
    builtin: true,
    workflow: WORKFLOW_ANY,
    policyProfile: {
      reviewSeed: "pending",
      automationEligible: false,
      coverageProfile: "none",
      routing: { enabled: false },
      skills: { matrix: false, profile: "free" }
    }
  }
];
var BUILTIN_BY_ID = new Map(BUILTIN_TRACK_DEFINITIONS.map((t) => [t.id, t]));
function builtinTrack(id) {
  const def = BUILTIN_BY_ID.get(id);
  if (!def)
    throw new Error(`tracks \u5185\u90E8\u9519\u8BEF\uFF1A\u5185\u5EFA\u5B9A\u4E49\u7F3A '${id}'`);
  return def;
}

// packages/kernel/dist/tracks/parse-error.js
var TrackConfigParseError = class extends Error {
  line;
  constructor(line, detail) {
    super(line === null ? `tracks.yaml: ${detail}` : `tracks.yaml:${line}: ${detail}`);
    this.name = "TrackConfigParseError";
    this.line = line;
  }
};

// packages/kernel/dist/tracks/parse.js
var KEY_RE2 = /^([A-Za-z_][\w.-]*):(?:\s+([\s\S]*)|\s*)$/;
function tokenize(text2) {
  const tokens = [];
  const lines = text2.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1;
    const line = lines[n].replace(/\r$/, "");
    if (line.trim() === "")
      continue;
    if (/^ *\t/.test(line))
      throw new TrackConfigParseError(lineNo, "\u7F29\u8FDB\u4E0D\u5141\u8BB8 tab\uFF08YAML \u89C4\u8303\u540C\u6837\u7981\u6B62\uFF09");
    const content = line.replace(/^ */, "");
    if (content.startsWith("#"))
      continue;
    const indent = line.length - content.length;
    if (content === "-" || content.startsWith("- ")) {
      const dashRest = content.slice(1);
      const after = dashRest.replace(/^\s*/, "");
      const itemCol = indent + 1 + (dashRest.length - after.length);
      tokens.push({ line: lineNo, indent, kind: "dash" });
      if (after !== "") {
        const km2 = after.match(KEY_RE2);
        if (km2)
          tokens.push({ line: lineNo, indent: itemCol, kind: "kv", key: km2[1], rest: km2[2] ?? "" });
        else
          tokens.push({ line: lineNo, indent: itemCol, kind: "scalar", raw: after });
      }
      continue;
    }
    const km = content.match(KEY_RE2);
    if (km)
      tokens.push({ line: lineNo, indent, kind: "kv", key: km[1], rest: km[2] ?? "" });
    else
      tokens.push({ line: lineNo, indent, kind: "scalar", raw: content });
  }
  return tokens;
}
function parseQuotedScalar(s, line) {
  const quote = s[0];
  const close = s.indexOf(quote, 1);
  if (close === -1) {
    throw new TrackConfigParseError(line, `\u5F15\u53F7\u672A\u95ED\u5408\uFF1A${s}\uFF08\u8D77\u59CB ${quote} \u65E0\u914D\u5BF9\u95ED\u5408\uFF1B\u672C\u5B50\u96C6\u4E0D\u652F\u6301\u591A\u884C\u6807\u91CF\uFF09`);
  }
  const after = s.slice(close + 1);
  if (after !== "" && !/^\s+#/.test(after)) {
    throw new TrackConfigParseError(line, `\u5F15\u53F7\u95ED\u5408\u540E\u5B58\u5728\u975E\u6CE8\u91CA\u6B8B\u7559\uFF1A${JSON.stringify(after)}\uFF08\u884C\u5185\u6CE8\u91CA\u987B\u4EE5\u7A7A\u767D + '#' \u5F00\u59CB\uFF09`);
  }
  return { kind: "scalar", line, value: s.slice(1, close) };
}
function parseScalarText(raw, line) {
  const s = raw.trim();
  if (s === "")
    return { kind: "scalar", line, value: null };
  if (s.startsWith("#"))
    return { kind: "scalar", line, value: null };
  if (s.startsWith("{")) {
    throw new TrackConfigParseError(line, `\u4E0D\u652F\u6301\u6D41\u5F0F mapping\uFF08\u503C\u4EE5 '{' \u5F00\u5934\uFF09\uFF1A${s}\u2014\u2014mapping \u8BF7\u7528\u5757\u5F0F\u7F29\u8FDB`);
  }
  if (s.startsWith('"') || s.startsWith("'"))
    return parseQuotedScalar(s, line);
  if (s.startsWith("[")) {
    if (!s.endsWith("]"))
      throw new TrackConfigParseError(line, `\u6D41\u5F0F\u5217\u8868\u672A\u95ED\u5408\uFF1A${s}`);
    const inner = s.slice(1, -1).trim();
    const items = inner === "" ? [] : inner.split(",").map((x) => parseScalarText(x, line));
    for (const it of items) {
      if (it.kind !== "scalar")
        throw new TrackConfigParseError(line, "\u6D41\u5F0F\u5217\u8868\u53EA\u652F\u6301\u6807\u91CF\u9879\uFF08\u4E0D\u652F\u6301\u5D4C\u5957\u5217\u8868\uFF09");
    }
    return { kind: "seq", line, items };
  }
  let bare = s;
  const cm = bare.match(/^(.*?)\s+#.*$/);
  if (cm)
    bare = cm[1].trimEnd();
  if (bare === "null" || bare === "~")
    return { kind: "scalar", line, value: null };
  if (bare === "true")
    return { kind: "scalar", line, value: true };
  if (bare === "false")
    return { kind: "scalar", line, value: false };
  if (/^-?\d+$/.test(bare))
    return { kind: "scalar", line, value: Number(bare) };
  return { kind: "scalar", line, value: bare };
}
function parseMapping(tokens, start, indent) {
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  const line = tokens[start].line;
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && tokens[i].kind === "kv") {
    const t = tokens[i];
    if (seen.has(t.key))
      throw new TrackConfigParseError(t.line, `\u91CD\u590D\u952E '${t.key}'`);
    seen.add(t.key);
    i++;
    let node;
    if ((t.rest ?? "") === "") {
      if (i < tokens.length && tokens[i].indent > indent) {
        const r = parseNode(tokens, i, tokens[i].indent);
        node = r.node;
        i = r.next;
      } else {
        node = { kind: "scalar", line: t.line, value: null };
      }
    } else {
      node = parseScalarText(t.rest, t.line);
    }
    entries.push({ key: t.key, line: t.line, node });
  }
  return { node: { kind: "map", line, entries }, next: i };
}
function parseSequence(tokens, start, indent) {
  const items = [];
  const line = tokens[start].line;
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && tokens[i].kind === "dash") {
    const dashLine = tokens[i].line;
    i++;
    if (i < tokens.length && tokens[i].indent > indent) {
      const r = parseNode(tokens, i, tokens[i].indent);
      items.push(r.node);
      i = r.next;
    } else {
      items.push({ kind: "scalar", line: dashLine, value: null });
    }
  }
  return { node: { kind: "seq", line, items }, next: i };
}
function parseNode(tokens, i, indent) {
  const t = tokens[i];
  if (t.kind === "dash")
    return parseSequence(tokens, i, indent);
  if (t.kind === "kv")
    return parseMapping(tokens, i, indent);
  return { node: parseScalarText(t.raw, t.line), next: i + 1 };
}
function parseDocumentRoot(text2) {
  const tokens = tokenize(text2);
  if (tokens.length === 0)
    throw new TrackConfigParseError(null, "\u7A7A\u6587\u6863\uFF08\u7F3A\u5C11\u5FC5\u586B\u9876\u5C42\u952E version\uFF09");
  const first = tokens[0];
  if (first.indent !== 0)
    throw new TrackConfigParseError(first.line, `\u9876\u5C42\u610F\u5916\u7F29\u8FDB\uFF08indent=${first.indent}\uFF09`);
  if (first.kind !== "kv") {
    throw new TrackConfigParseError(first.line, "\u9876\u5C42\u5FC5\u987B\u662F mapping\uFF08version/builtins/tracks \u952E\uFF09");
  }
  const r = parseMapping(tokens, 0, 0);
  if (r.next !== tokens.length) {
    throw new TrackConfigParseError(tokens[r.next].line, "\u6B8B\u7559\u672A\u89E3\u6790\u5185\u5BB9\uFF08\u7F29\u8FDB\u9519\u4E71\u6216\u8D85\u51FA\u652F\u6301\u7684 YAML \u5B50\u96C6\uFF09");
  }
  return r.node;
}
function describeNode(n) {
  if (n.kind === "map")
    return "mapping";
  if (n.kind === "seq")
    return "\u5217\u8868";
  const v = n.value;
  if (v === null)
    return "\u7A7A\u503C";
  if (typeof v === "string")
    return `\u5B57\u7B26\u4E32 ${JSON.stringify(v)}`;
  if (typeof v === "number")
    return `\u6574\u6570 ${v}`;
  return `\u5E03\u5C14 ${String(v)}`;
}
function isNullScalar(n) {
  return n.kind === "scalar" && n.value === null;
}
function expectMap(n, at) {
  if (n.kind !== "map")
    throw new TrackConfigParseError(n.line, `${at} \u5E94\u4E3A mapping\uFF0C\u5F97\u5230 ${describeNode(n)}`);
  return n;
}
function expectSeq(n, at) {
  if (n.kind !== "seq")
    throw new TrackConfigParseError(n.line, `${at} \u5E94\u4E3A\u5217\u8868\uFF0C\u5F97\u5230 ${describeNode(n)}`);
  return n;
}
function expectString(n, at) {
  if (n.kind !== "scalar" || typeof n.value !== "string") {
    throw new TrackConfigParseError(n.line, `${at} \u5E94\u4E3A\u5B57\u7B26\u4E32\uFF0C\u5F97\u5230 ${describeNode(n)}\uFF08\u6B67\u4E49\u6807\u91CF\u8BF7\u52A0\u5F15\u53F7\uFF09`);
  }
  return n.value;
}
function expectBoolean(n, at) {
  if (n.kind !== "scalar" || typeof n.value !== "boolean") {
    throw new TrackConfigParseError(n.line, `${at} \u5E94\u4E3A\u5E03\u5C14\uFF08true/false\uFF09\uFF0C\u5F97\u5230 ${describeNode(n)}`);
  }
  return n.value;
}
function expectInteger(n, at) {
  if (n.kind !== "scalar" || typeof n.value !== "number") {
    throw new TrackConfigParseError(n.line, `${at} \u5E94\u4E3A\u6574\u6570\uFF0C\u5F97\u5230 ${describeNode(n)}`);
  }
  return n.value;
}
function checkKeys(map, allowed, at) {
  for (const e of map.entries) {
    if (!allowed.includes(e.key)) {
      throw new TrackConfigParseError(e.line, `${at} \u5B58\u5728\u672A\u77E5\u952E '${e.key}'\uFF08\u53EA\u652F\u6301 ${allowed.join("/")}\uFF09`);
    }
  }
}
function getEntry(map, key) {
  return map.entries.find((e) => e.key === key);
}
function defineKey(rec, key, value) {
  Object.defineProperty(rec, key, { value, enumerable: true, writable: true, configurable: true });
}
function walkAllowed(n, at) {
  if (n.kind === "scalar") {
    if (n.value === "*")
      return "*";
    throw new TrackConfigParseError(n.line, `${at}.allowed \u53EA\u652F\u6301 '*' \u6216\u5DE5\u4F5C\u6D41 id \u5217\u8868\uFF0C\u5F97\u5230 ${describeNode(n)}`);
  }
  const seq = expectSeq(n, `${at}.allowed`);
  return seq.items.map((item2, j) => expectString(item2, `${at}.allowed[${j}]`));
}
function walkWorkflow(n, at) {
  if (isNullScalar(n))
    return {};
  const map = expectMap(n, `${at}.workflow`);
  checkKeys(map, ["default", "allowed"], `${at}.workflow`);
  const out = {};
  const d = getEntry(map, "default");
  if (d)
    out.default = expectString(d.node, `${at}.workflow.default`);
  const a = getEntry(map, "allowed");
  if (a)
    out.allowed = walkAllowed(a.node, `${at}.workflow`);
  return out;
}
function walkRouting(n, at) {
  if (isNullScalar(n))
    return {};
  const map = expectMap(n, `${at}.routing`);
  checkKeys(map, ["enabled", "pattern", "exclude_pattern", "priority"], `${at}.routing`);
  const out = {};
  const e = getEntry(map, "enabled");
  if (e)
    out.enabled = expectBoolean(e.node, `${at}.routing.enabled`);
  const p = getEntry(map, "pattern");
  if (p)
    out.pattern = expectString(p.node, `${at}.routing.pattern`);
  const ep = getEntry(map, "exclude_pattern");
  if (ep)
    out.excludePattern = expectString(ep.node, `${at}.routing.exclude_pattern`);
  const pr = getEntry(map, "priority");
  if (pr)
    out.priority = expectInteger(pr.node, `${at}.routing.priority`);
  return out;
}
function walkSkills(n, at) {
  if (isNullScalar(n))
    return {};
  const map = expectMap(n, `${at}.skills`);
  checkKeys(map, ["matrix", "profile"], `${at}.skills`);
  const out = {};
  const m = getEntry(map, "matrix");
  if (m)
    out.matrix = expectBoolean(m.node, `${at}.skills.matrix`);
  const p = getEntry(map, "profile");
  if (p)
    out.profile = expectString(p.node, `${at}.skills.profile`);
  return out;
}
function walkPolicy(n, at) {
  if (isNullScalar(n))
    return {};
  const map = expectMap(n, `${at}.policy_profile`);
  checkKeys(map, ["review_seed", "auto_enqueue_on_spec_complete", "automation_eligible", "coverage_profile", "routing", "skills"], `${at}.policy_profile`);
  const out = {};
  const rs = getEntry(map, "review_seed");
  if (rs)
    out.reviewSeed = expectString(rs.node, `${at}.policy_profile.review_seed`);
  const aes = getEntry(map, "auto_enqueue_on_spec_complete");
  if (aes)
    out.autoEnqueueOnSpecComplete = expectBoolean(aes.node, `${at}.policy_profile.auto_enqueue_on_spec_complete`);
  const ae = getEntry(map, "automation_eligible");
  if (ae)
    out.automationEligible = expectBoolean(ae.node, `${at}.policy_profile.automation_eligible`);
  const cp = getEntry(map, "coverage_profile");
  if (cp)
    out.coverageProfile = expectString(cp.node, `${at}.policy_profile.coverage_profile`);
  const r = getEntry(map, "routing");
  if (r)
    out.routing = walkRouting(r.node, `${at}.policy_profile`);
  const s = getEntry(map, "skills");
  if (s)
    out.skills = walkSkills(s.node, `${at}.policy_profile`);
  return out;
}
function walkOverride(n, at) {
  if (isNullScalar(n))
    return {};
  const map = expectMap(n, at);
  checkKeys(map, ["label", "workflow", "policy_profile"], at);
  const out = {};
  const l = getEntry(map, "label");
  if (l)
    out.label = expectString(l.node, `${at}.label`);
  const w = getEntry(map, "workflow");
  if (w)
    out.workflow = walkWorkflow(w.node, at);
  const p = getEntry(map, "policy_profile");
  if (p)
    out.policyProfile = walkPolicy(p.node, at);
  return out;
}
function walkTrackEntry(n, at) {
  const map = expectMap(n, `${at}\uFF08\u987B\u4E3A '- id: \u2026' \u5F62\u5F0F\u7684 mapping\uFF09`);
  checkKeys(map, ["id", "label", "workflow", "policy_profile"], at);
  const out = {};
  const id = getEntry(map, "id");
  if (id)
    out.id = expectString(id.node, `${at}.id`);
  const l = getEntry(map, "label");
  if (l)
    out.label = expectString(l.node, `${at}.label`);
  const w = getEntry(map, "workflow");
  if (w)
    out.workflow = walkWorkflow(w.node, at);
  const p = getEntry(map, "policy_profile");
  if (p)
    out.policyProfile = walkPolicy(p.node, at);
  return out;
}
function parseTrackRegistry(text2) {
  const root = parseDocumentRoot(text2);
  checkKeys(root, ["version", "builtins", "tracks"], "\u9876\u5C42");
  const versionEntry = getEntry(root, "version");
  if (!versionEntry)
    throw new TrackConfigParseError(null, "\u7F3A\u5C11\u5FC5\u586B\u9876\u5C42\u952E version\uFF08\u987B\u4E3A 'version: 1'\uFF09");
  const vn = versionEntry.node;
  if (vn.kind !== "scalar" || vn.value !== 1) {
    throw new TrackConfigParseError(versionEntry.line, `version \u53EA\u652F\u6301 1\uFF0C\u5F97\u5230 ${describeNode(vn)}`);
  }
  const config = { version: 1 };
  const b = getEntry(root, "builtins");
  if (b && !isNullScalar(b.node)) {
    const map = expectMap(b.node, "builtins");
    if (map.entries.length > 0) {
      const rec = {};
      for (const e of map.entries)
        defineKey(rec, e.key, walkOverride(e.node, `builtins.${e.key}`));
      config.builtins = rec;
    }
  }
  const t = getEntry(root, "tracks");
  if (t && !isNullScalar(t.node)) {
    const seq = expectSeq(t.node, "tracks");
    if (seq.items.length > 0) {
      config.tracks = seq.items.map((item2, i) => walkTrackEntry(item2, `tracks[${i}]`));
    }
  }
  return config;
}

// packages/kernel/dist/tracks/representable.js
var LONE_SURROGATE_RE2 = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function stringUnrepresentableReason2(s) {
  if (/[\n\r\t]/.test(s))
    return "\u542B\u6362\u884C/\u56DE\u8F66/tab\uFF0C\u7A84 YAML \u5E8F\u5217\u5316\u5B50\u96C6\u5199\u4E0D\u51FA";
  if (s.includes("'") && s.includes('"'))
    return "\u540C\u65F6\u542B\u5355\u53CC\u5F15\u53F7\uFF0C\u8D85\u51FA\u7A84\u5E8F\u5217\u5316\u5B50\u96C6\uFF08\u65E0\u8F6C\u4E49\u8BED\u4E49\uFF0C\u4E24\u79CD\u5F15\u53F7\u90FD\u5305\u4E0D\u4F4F\uFF09";
  if (LONE_SURROGATE_RE2.test(s))
    return "\u542B\u672A\u914D\u5BF9 UTF-16 surrogate\uFF0CUTF-8 \u843D\u76D8\u4F1A\u88AB\u66FF\u6362\u6210 U+FFFD\uFF0C\u65E0\u6CD5\u5F80\u8FD4";
  return null;
}

// packages/kernel/dist/tracks/validate.js
var MAX_CUSTOM_TRACKS = 27;
var MAX_TRACKS = BUILTIN_TRACK_IDS.length + MAX_CUSTOM_TRACKS;
var REVIEW_SEEDS = /* @__PURE__ */ new Set(["pending", "skipped"]);
var COVERAGE_PROFILES = /* @__PURE__ */ new Set(["none", "pm", "frontend", "backend"]);
function checkRepresentable(value, at, errors) {
  const reason = stringUnrepresentableReason2(value);
  if (reason !== null)
    errors.push(`${at}: ${reason}`);
}
function validateTrackRegistry(config, context) {
  return collect(config, context);
}
function validateTrackConfigStructure(config) {
  return collect(config, null);
}
function collect(config, context) {
  const errors = [];
  const workflowOk = (id) => id === "default" || context === null || context.workflowExists(id);
  const profileOk = (p) => p === "_all" || context === null || context.skillProfiles.has(p);
  if (config.version !== 1) {
    errors.push(`version: \u53EA\u652F\u6301 1\uFF0C\u5F97\u5230 ${JSON.stringify(config.version)}`);
  }
  for (const [key, ov] of Object.entries(config.builtins ?? {})) {
    const at = `builtins.${key}`;
    if (!isBuiltinTrackId(key)) {
      errors.push(`${at}: \u4E0D\u662F\u5185\u5EFA track id\uFF08\u5185\u5EFA\u53EA\u6709 ${BUILTIN_TRACK_IDS.join("/")}\uFF1B\u989D\u5916 track \u653E tracks: \u6570\u7EC4\uFF09`);
      continue;
    }
    checkOverride(ov, at, key, workflowOk, errors);
  }
  const tracks = config.tracks ?? [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < tracks.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(tracks, i)) {
      errors.push(`tracks[${i}]: \u6570\u7EC4\u7A7A\u69FD\uFF08\u7A00\u758F\u6570\u7EC4\u4E0D\u53EF\u8868\u793A\uFF09`);
      continue;
    }
    checkEntry(required(tracks[i]), `tracks[${i}]`, seen, workflowOk, profileOk, errors);
  }
  const total = BUILTIN_TRACK_IDS.length + tracks.length;
  if (tracks.length > MAX_CUSTOM_TRACKS) {
    errors.push(`\u989D\u5916 track \u6570 ${tracks.length} \u8D85\u8FC7\u4E0A\u9650 ${MAX_CUSTOM_TRACKS}\uFF08\u5F53\u524D\u603B\u6570 ${total} = \u5185\u5EFA ${BUILTIN_TRACK_IDS.length} + \u989D\u5916 ${tracks.length}\uFF1B\u603B\u4E0A\u9650 ${MAX_TRACKS}\uFF09`);
  }
  return errors;
}
function checkOverride(ov, at, id, workflowOk, errors) {
  if (ov === null || typeof ov !== "object") {
    errors.push(`${at}: \u8986\u5199\u987B\u4E3A mapping\uFF08\u53EA\u8BB8 label/workflow \u4E24\u4E2A\u5B50\u952E\uFF09`);
    return;
  }
  if (ov.policyProfile !== void 0) {
    errors.push(`${at}.policy_profile: v1 \u9501\u6B7B\u5185\u5EFA policy\uFF0C\u4E0D\u5141\u8BB8\u8986\u5199\uFF08\u53EA\u8BB8 label/workflow \u4E24\u4E2A\u5B50\u952E\uFF1B\u7406\u7531\uFF1Aplan/review \u8C41\u514D\u6309 track-not-in:['pm'] \u5224\u5B9A\uFF0C\u653E\u5F00\u4F1A\u6495\u88C2\u8BE5\u8BED\u4E49\uFF09`);
  }
  if (ov.label !== void 0) {
    if (typeof ov.label !== "string" || ov.label.trim() === "")
      errors.push(`${at}.label: \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
    else
      checkRepresentable(ov.label, `${at}.label`, errors);
  }
  if (ov.workflow !== void 0) {
    checkWorkflow(ov.workflow, at, builtinTrack(id).workflow.default, false, workflowOk, errors);
  }
}
function checkEntry(entry, at, seen, workflowOk, profileOk, errors) {
  if (entry === null || typeof entry !== "object") {
    errors.push(`${at}: \u987B\u4E3A mapping\uFF08'- id: \u2026' \u5F62\u5F0F\uFF09`);
    return;
  }
  const id = entry.id;
  if (typeof id !== "string" || id === "") {
    errors.push(`${at}.id: \u7F3A\u5931\u6216\u975E\u5B57\u7B26\u4E32`);
  } else {
    if (id === "_all") {
      errors.push(`${at}.id: '_all' \u662F\u4FDD\u7559\u5B57\uFF08manifest \u6280\u80FD\u8868\u515C\u5E95\u952E\uFF09\uFF0C\u4E0D\u80FD\u4F5C track id`);
    } else if (!TRACK_ID_RE.test(id)) {
      errors.push(`${at}.id: '${id}' \u4E0D\u5408\u6CD5\uFF08\u987B\u5339\u914D ${String(TRACK_ID_RE)}\uFF1A\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934\u3001\u4EC5 a-z0-9_-\u3001\u6700\u957F 32\u3001\u7981 '.'\uFF09`);
    }
    if (isBuiltinTrackId(id)) {
      errors.push(`${at}.id: '${id}' \u4E0E\u5185\u5EFA track \u91CD\u540D\uFF08\u5185\u5EFA\u8986\u5199\u8D70 builtins: \u8282\uFF09`);
    }
    if (seen.has(id))
      errors.push(`${at}.id: '${id}' \u91CD\u590D\u58F0\u660E`);
    seen.add(id);
  }
  if (typeof entry.label !== "string" || entry.label.trim() === "") {
    errors.push(`${at}.label: \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
  } else {
    checkRepresentable(entry.label, `${at}.label`, errors);
  }
  if (entry.workflow === void 0) {
    errors.push(`${at}.workflow.default: \u7F3A\u5931\uFF08\u989D\u5916 track \u5FC5\u987B\u58F0\u660E\u975E\u7A7A workflow id\uFF09`);
    errors.push(`${at}.workflow.allowed: \u7F3A\u5931\uFF08\u989D\u5916 track \u5FC5\u987B\u663E\u5F0F\u58F0\u660E\uFF1B\u5168\u653E\u884C\u8BF7\u5199 '*'\uFF09`);
  } else {
    checkWorkflow(entry.workflow, at, void 0, true, workflowOk, errors);
  }
  if (entry.policyProfile === void 0) {
    errors.push(`${at}.policy_profile: \u7F3A\u5931\uFF08\u989D\u5916 track \u5FC5\u987B\u5B8C\u6574\u58F0\u660E policy_profile\uFF09`);
  } else {
    checkPolicy(entry.policyProfile, `${at}.policy_profile`, profileOk, errors);
  }
}
function checkWorkflow(wf, at, fallbackDefault, isProjectTrack, workflowOk, errors) {
  if (wf === null || typeof wf !== "object") {
    errors.push(`${at}.workflow: \u987B\u4E3A mapping\uFF08default/allowed\uFF09`);
    return;
  }
  const d = wf.default;
  if (isProjectTrack && (d === void 0 || d === "")) {
    errors.push(`${at}.workflow.default: \u7F3A\u5931\uFF08\u989D\u5916 track \u5FC5\u987B\u58F0\u660E\u975E\u7A7A workflow id\uFF09`);
  }
  if (d !== void 0) {
    if (typeof d !== "string" || d === "")
      errors.push(`${at}.workflow.default: \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
    else {
      checkRepresentable(d, `${at}.workflow.default`, errors);
      if (!workflowOk(d))
        errors.push(`${at}.workflow.default: workflow '${d}' \u4E0D\u5B58\u5728`);
    }
  }
  const allowed = wf.allowed;
  if (allowed === void 0) {
    if (isProjectTrack) {
      errors.push(`${at}.workflow.allowed: \u7F3A\u5931\uFF08\u989D\u5916 track \u5FC5\u987B\u663E\u5F0F\u58F0\u660E\uFF1B\u5168\u653E\u884C\u8BF7\u5199 '*'\uFF09`);
    }
    return;
  }
  if (allowed === "*")
    return;
  if (!Array.isArray(allowed)) {
    errors.push(`${at}.workflow.allowed: \u53EA\u652F\u6301 '*' \u6216\u5B57\u7B26\u4E32\u6570\u7EC4`);
    return;
  }
  if (allowed.length === 0) {
    errors.push(`${at}.workflow.allowed: \u6570\u7EC4\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5168\u653E\u884C\u5199 '*'\uFF0C\u5426\u5219\u81F3\u5C11\u5217\u4E00\u4E2A workflow id\uFF09`);
    return;
  }
  const seenAllowed = /* @__PURE__ */ new Set();
  for (let j = 0; j < allowed.length; j++) {
    if (!Object.prototype.hasOwnProperty.call(allowed, j)) {
      errors.push(`${at}.workflow.allowed[${j}]: \u6570\u7EC4\u7A7A\u69FD\uFF08\u7A00\u758F\u6570\u7EC4\u4E0D\u53EF\u8868\u793A\uFF09`);
      continue;
    }
    const w = allowed[j];
    if (typeof w !== "string" || w === "")
      errors.push(`${at}.workflow.allowed[${j}]: \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
    else {
      checkRepresentable(w, `${at}.workflow.allowed[${j}]`, errors);
      if (!workflowOk(w))
        errors.push(`${at}.workflow.allowed[${j}]: workflow '${w}' \u4E0D\u5B58\u5728`);
      if (seenAllowed.has(w))
        errors.push(`${at}.workflow.allowed[${j}]: \u91CD\u590D\u9879 '${w}'\uFF08\u540C\u4E00 workflow \u4E0D\u80FD\u5217\u591A\u6B21\uFF09`);
      seenAllowed.add(w);
    }
  }
  const eff = typeof d === "string" && d !== "" ? d : fallbackDefault;
  if (eff !== void 0 && !allowed.includes(eff)) {
    errors.push(`${at}.workflow.allowed: \u6570\u7EC4\u5FC5\u987B\u5305\u542B default '${eff}'`);
  }
}
function checkPolicy(p, at, profileOk, errors) {
  if (p === null || typeof p !== "object") {
    errors.push(`${at}: \u987B\u4E3A mapping\uFF08review_seed/automation_eligible/coverage_profile/routing/skills\uFF09`);
    return;
  }
  if (p.reviewSeed === void 0)
    errors.push(`${at}.review_seed: \u7F3A\u5931\uFF08\u987B\u4E3A pending|skipped\uFF09`);
  else if (!REVIEW_SEEDS.has(p.reviewSeed)) {
    errors.push(`${at}.review_seed: \u987B\u4E3A pending|skipped\uFF0C\u5F97\u5230 '${String(p.reviewSeed)}'`);
  }
  if (p.autoEnqueueOnSpecComplete !== void 0 && typeof p.autoEnqueueOnSpecComplete !== "boolean") {
    errors.push(`${at}.auto_enqueue_on_spec_complete: \u987B\u4E3A\u5E03\u5C14`);
  }
  if (typeof p.automationEligible !== "boolean")
    errors.push(`${at}.automation_eligible: \u7F3A\u5931\u6216\u975E\u5E03\u5C14`);
  if (p.coverageProfile === void 0)
    errors.push(`${at}.coverage_profile: \u7F3A\u5931\uFF08\u987B\u4E3A none|pm|frontend|backend\uFF09`);
  else if (!COVERAGE_PROFILES.has(p.coverageProfile)) {
    errors.push(`${at}.coverage_profile: \u987B\u4E3A none|pm|frontend|backend\uFF0C\u5F97\u5230 '${String(p.coverageProfile)}'`);
  }
  const r = p.routing;
  if (r === void 0 || r === null || typeof r !== "object" || typeof r.enabled !== "boolean") {
    errors.push(`${at}.routing.enabled: \u7F3A\u5931\u6216\u975E\u5E03\u5C14`);
  } else if (!r.enabled) {
    if (r.pattern !== void 0 || r.excludePattern !== void 0 || r.priority !== void 0) {
      errors.push(`${at}.routing: enabled=false \u65F6\u4E0D\u63A5\u53D7 pattern/exclude_pattern/priority`);
    }
  } else {
    if (typeof r.pattern !== "string" || r.pattern === "") {
      errors.push(`${at}.routing.pattern: \u7F3A\u5931\u6216\u4E3A\u7A7A\uFF08enabled=true \u5FC5\u586B\uFF09`);
    } else {
      try {
        void new RegExp(r.pattern);
      } catch (e) {
        errors.push(`${at}.routing.pattern: \u975E\u6CD5\u6B63\u5219\u2014\u2014JS RegExp \u8BED\u6CD5\u70DF\u6D4B\u672A\u8FC7\uFF08${e instanceof Error ? e.message : String(e)}\uFF09`);
      }
      checkRepresentable(r.pattern, `${at}.routing.pattern`, errors);
    }
    if (r.excludePattern !== void 0) {
      if (typeof r.excludePattern !== "string" || r.excludePattern === "") {
        errors.push(`${at}.routing.exclude_pattern: \u63D0\u4F9B\u65F6\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
      } else {
        try {
          void new RegExp(r.excludePattern);
        } catch (e) {
          errors.push(`${at}.routing.exclude_pattern: \u975E\u6CD5\u6B63\u5219\u2014\u2014JS RegExp \u8BED\u6CD5\u70DF\u6D4B\u672A\u8FC7\uFF08${e instanceof Error ? e.message : String(e)}\uFF09`);
        }
        checkRepresentable(r.excludePattern, `${at}.routing.exclude_pattern`, errors);
      }
    }
    if (typeof r.priority !== "number" || !Number.isSafeInteger(r.priority) || r.priority < 0 || Object.is(r.priority, -0)) {
      errors.push(`${at}.routing.priority: \u987B\u4E3A\u975E\u8D1F\u5B89\u5168\u6574\u6570\uFF08\u4E0D\u542B -0\uFF09\uFF0C\u5F97\u5230 ${JSON.stringify(r.priority)}`);
    }
  }
  const s = p.skills;
  if (s === void 0 || s === null || typeof s !== "object") {
    errors.push(`${at}.skills: \u7F3A\u5931\uFF08\u987B\u58F0\u660E matrix \u4E0E profile\uFF09`);
    return;
  }
  if (typeof s.matrix !== "boolean")
    errors.push(`${at}.skills.matrix: \u7F3A\u5931\u6216\u975E\u5E03\u5C14`);
  if (typeof s.profile !== "string" || s.profile === "") {
    errors.push(`${at}.skills.profile: \u7F3A\u5931\uFF08manifest skill profile \u540D\u6216 '_all'\uFF09`);
  } else {
    checkRepresentable(s.profile, `${at}.skills.profile`, errors);
    if (!profileOk(s.profile)) {
      errors.push(`${at}.skills.profile: '${s.profile}' \u4E0D\u5728 manifest skill profile \u96C6\u5408\uFF08\u6216 '_all'\uFF09`);
    }
  }
}

// packages/kernel/dist/tracks/serialize.js
var BARE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
var AMBIGUOUS = /* @__PURE__ */ new Set(["true", "false", "null", "~"]);
function emitString(s) {
  const reason = stringUnrepresentableReason2(s);
  if (reason !== null) {
    throw new Error(`serializeTrackRegistry: ${reason}\uFF1A${JSON.stringify(s)}`);
  }
  if (BARE_RE.test(s) && !AMBIGUOUS.has(s) && !/^-?\d+$/.test(s))
    return s;
  if (!s.includes("'"))
    return `'${s}'`;
  return `"${s}"`;
}
function emitInteger(n) {
  if (!Number.isInteger(n))
    throw new Error(`serializeTrackRegistry: \u671F\u671B\u6574\u6570\uFF0C\u5F97\u5230 ${n}`);
  const text2 = String(n);
  if (!/^-?\d+$/.test(text2) || Number(text2) !== n) {
    throw new Error(`serializeTrackRegistry: \u6574\u6570 ${n} \u7684\u5199\u51FA\u6587\u672C ${JSON.stringify(text2)} \u4E0D\u662F parse \u53EF\u8BFB\u56DE\u7684\u7EAF\u5341\u8FDB\u5236\uFF0C\u62D2\u5199`);
  }
  return text2;
}
function emitMapKey(key) {
  if (!/^[A-Za-z_][\w.-]*$/.test(key)) {
    throw new Error(`serializeTrackRegistry: mapping \u952E\u8D85\u51FA\u89E3\u6790\u5668\u53EF\u8BA4\u5B50\u96C6\uFF1A${JSON.stringify(key)}`);
  }
  return key;
}
function pushAllowed(lines, pad, allowed) {
  if (allowed === "*") {
    lines.push(`${pad}allowed: '*'`);
    return;
  }
  if (allowed.length === 0) {
    lines.push(`${pad}allowed: []`);
    return;
  }
  const items = allowed.map(emitString);
  if (items.every((it) => !/[,[\]]/.test(it))) {
    lines.push(`${pad}allowed: [${items.join(", ")}]`);
    return;
  }
  lines.push(`${pad}allowed:`);
  for (const it of items)
    lines.push(`${pad}  - ${it}`);
}
function pushWorkflow(lines, pad, wf) {
  if (wf.default === void 0 && wf.allowed === void 0)
    return;
  lines.push(`${pad}workflow:`);
  if (wf.default !== void 0)
    lines.push(`${pad}  default: ${emitString(wf.default)}`);
  if (wf.allowed !== void 0)
    pushAllowed(lines, `${pad}  `, wf.allowed);
}
function pushPolicy(lines, pad, p) {
  const sub = [];
  const inner = `${pad}  `;
  if (p.reviewSeed !== void 0)
    sub.push(`${inner}review_seed: ${emitString(p.reviewSeed)}`);
  if (p.autoEnqueueOnSpecComplete !== void 0)
    sub.push(`${inner}auto_enqueue_on_spec_complete: ${String(p.autoEnqueueOnSpecComplete)}`);
  if (p.automationEligible !== void 0)
    sub.push(`${inner}automation_eligible: ${String(p.automationEligible)}`);
  if (p.coverageProfile !== void 0)
    sub.push(`${inner}coverage_profile: ${emitString(p.coverageProfile)}`);
  if (p.routing !== void 0) {
    const r = [];
    if (p.routing.enabled !== void 0)
      r.push(`${inner}  enabled: ${String(p.routing.enabled)}`);
    if (p.routing.pattern !== void 0)
      r.push(`${inner}  pattern: ${emitString(p.routing.pattern)}`);
    if (p.routing.excludePattern !== void 0)
      r.push(`${inner}  exclude_pattern: ${emitString(p.routing.excludePattern)}`);
    if (p.routing.priority !== void 0)
      r.push(`${inner}  priority: ${emitInteger(p.routing.priority)}`);
    if (r.length > 0)
      sub.push(`${inner}routing:`, ...r);
  }
  if (p.skills !== void 0) {
    const s = [];
    if (p.skills.matrix !== void 0)
      s.push(`${inner}  matrix: ${String(p.skills.matrix)}`);
    if (p.skills.profile !== void 0)
      s.push(`${inner}  profile: ${emitString(p.skills.profile)}`);
    if (s.length > 0)
      sub.push(`${inner}skills:`, ...s);
  }
  if (sub.length === 0)
    return;
  lines.push(`${pad}policy_profile:`, ...sub);
}
function orderedOverrideKeys(builtins) {
  const keys = Object.keys(builtins);
  const known = BUILTIN_TRACK_IDS.filter((id) => keys.includes(id));
  const rest = keys.filter((k) => !BUILTIN_TRACK_IDS.includes(k)).sort();
  return [...known, ...rest];
}
function serializeTrackRegistry(config) {
  const lines = [`version: ${emitInteger(config.version)}`];
  const builtins = config.builtins;
  if (builtins !== void 0) {
    const emitted = [];
    for (const key of orderedOverrideKeys(builtins)) {
      const ov = required(builtins[key]);
      const sub = [];
      if (ov.label !== void 0)
        sub.push(`    label: ${emitString(ov.label)}`);
      if (ov.workflow !== void 0)
        pushWorkflow(sub, "    ", ov.workflow);
      if (ov.policyProfile !== void 0)
        pushPolicy(sub, "    ", ov.policyProfile);
      if (sub.length === 0)
        continue;
      emitted.push(`  ${emitMapKey(key)}:`, ...sub);
    }
    if (emitted.length > 0)
      lines.push("builtins:", ...emitted);
  }
  const tracks = config.tracks ?? [];
  if (tracks.length > 0) {
    lines.push("tracks:");
    for (const entry of tracks) {
      const sub = [];
      if (entry.id !== void 0)
        sub.push(`    id: ${emitString(entry.id)}`);
      if (entry.label !== void 0)
        sub.push(`    label: ${emitString(entry.label)}`);
      if (entry.workflow !== void 0)
        pushWorkflow(sub, "    ", entry.workflow);
      if (entry.policyProfile !== void 0)
        pushPolicy(sub, "    ", entry.policyProfile);
      if (sub.length === 0) {
        lines.push("  -");
        continue;
      }
      lines.push(`  - ${required(sub[0]).slice(4)}`, ...sub.slice(1));
    }
  }
  return `${lines.join("\n")}
`;
}

// packages/kernel/dist/tracks/registry.js
import { createHash as createHash8 } from "node:crypto";
import { readFileSync as readFileSync8 } from "node:fs";
import { mkdir as mkdir9, readFile as readFile14 } from "node:fs/promises";
import path6 from "node:path";
var TENON_DIR = ".pipeline";
var TRACKS_FILE = "tracks.yaml";
var EMPTY_PROJECT_CONFIG = { version: 1 };
function trackRegistryPath(repoRoot) {
  return path6.join(repoRoot, TENON_DIR, TRACKS_FILE);
}
function registryRevision(config) {
  return createHash8("sha256").update(serializeTrackRegistry(config), "utf8").digest("hex").slice(0, 16);
}
var RegistryRevisionConflictError = class extends Error {
  expected;
  actual;
  constructor(expected, actual) {
    super(`tracks.yaml revision \u51B2\u7A81\uFF1A\u671F\u671B ${expected}\uFF0C\u5B9E\u9645 ${actual}\uFF08\u6587\u4EF6\u5DF2\u88AB\u4ED6\u5904\u4FEE\u6539\uFF1B\u91CD\u65B0\u52A0\u8F7D\u540E\u91CD\u8BD5\uFF09`);
    this.name = "RegistryRevisionConflictError";
    this.expected = expected;
    this.actual = actual;
  }
};
function invariant(v, what) {
  if (v === void 0)
    throw new Error(`tracks registry \u5185\u90E8\u9519\u8BEF\uFF1A\u5408\u6210\u524D\u672A\u8FC7\u6821\u9A8C\uFF08\u7F3A ${what}\uFF09`);
  return v;
}
function entryToDefinition(entry) {
  const wf = invariant(entry.workflow, "workflow");
  const p = invariant(entry.policyProfile, "policy_profile");
  const routingCfg = invariant(p.routing, "policy_profile.routing");
  const skillsCfg = invariant(p.skills, "policy_profile.skills");
  const routing = routingCfg.enabled === true ? {
    enabled: true,
    pattern: invariant(routingCfg.pattern, "routing.pattern"),
    ...routingCfg.excludePattern === void 0 ? {} : { excludePattern: routingCfg.excludePattern },
    priority: invariant(routingCfg.priority, "routing.priority")
  } : { enabled: false };
  return {
    id: invariant(entry.id, "id"),
    label: invariant(entry.label, "label"),
    builtin: false,
    // allowed 无隐式默认：额外 track 必须显式声明（含全放行 '*'），省略在校验层就被拒
    workflow: { default: invariant(wf.default, "workflow.default"), allowed: invariant(wf.allowed, "workflow.allowed") },
    policyProfile: {
      // 闭集已由校验保证（REVIEW_SEEDS/COVERAGE_PROFILES），此处仅做类型收窄
      reviewSeed: invariant(p.reviewSeed, "review_seed"),
      ...p.autoEnqueueOnSpecComplete === void 0 ? {} : { autoEnqueueOnSpecComplete: p.autoEnqueueOnSpecComplete },
      automationEligible: invariant(p.automationEligible, "automation_eligible"),
      coverageProfile: invariant(p.coverageProfile, "coverage_profile"),
      routing,
      skills: { matrix: invariant(skillsCfg.matrix, "skills.matrix"), profile: invariant(skillsCfg.profile, "skills.profile") }
    }
  };
}
function composeRegistry(config, source) {
  const overrides = config.builtins ?? {};
  const ordered = BUILTIN_TRACK_DEFINITIONS.map((base) => {
    const ov = Object.prototype.hasOwnProperty.call(overrides, base.id) ? overrides[base.id] : void 0;
    if (ov === void 0)
      return base;
    return {
      ...base,
      label: ov.label ?? base.label,
      workflow: {
        default: ov.workflow?.default ?? base.workflow.default,
        allowed: ov.workflow?.allowed ?? base.workflow.allowed
      }
    };
  });
  for (const entry of config.tracks ?? [])
    ordered.push(entryToDefinition(entry));
  const byId = new Map(ordered.map((t) => [t.id, t]));
  if (byId.size !== ordered.length) {
    throw new Error("tracks registry \u5185\u90E8\u9519\u8BEF\uFF1A\u5408\u6210\u51FA\u91CD\u590D id\uFF08\u5199\u5165\u524D\u5FC5\u987B\u8FC7 validateTrackConfigStructure\uFF09");
  }
  return { ordered, byId, revision: registryRevision(config), source };
}
function synthesize(text2, context) {
  if (text2 === null) {
    return { config: EMPTY_PROJECT_CONFIG, registry: composeRegistry(EMPTY_PROJECT_CONFIG, "builtin-only") };
  }
  const config = parseTrackRegistry(text2);
  const errors = validateTrackRegistry(config, context);
  if (errors.length > 0) {
    throw new Error(`.pipeline/tracks.yaml \u6821\u9A8C\u5931\u8D25\uFF08${errors.length} \u6761\uFF09\uFF1A
  - ${errors.join("\n  - ")}`);
  }
  return { config, registry: composeRegistry(config, "project-file") };
}
function loadTrackRegistry(repoRoot, context) {
  let text2 = null;
  try {
    text2 = readFileSync8(trackRegistryPath(repoRoot), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
  return synthesize(text2, context).registry;
}
function requireTrack(registry, id) {
  const def = registry.byId.get(id);
  if (def)
    return def;
  const known = registry.ordered.map((t) => t.id).join(", ");
  throw new Error(`\u672A\u6CE8\u518C\u7684 track '${id}'\uFF08registry \u6765\u6E90 ${registry.source}\uFF1B\u5DF2\u6CE8\u518C\uFF1A${known}\uFF09`);
}
function assertWorkflowAllowed(track, workflowId) {
  if (track.workflow.allowed === "*")
    return;
  if (track.workflow.allowed.includes(workflowId))
    return;
  throw new Error(`track '${track.id}' \u4E0D\u5141\u8BB8\u7ED1\u5B9A workflow '${workflowId}'\uFF08\u5141\u8BB8\uFF1A${track.workflow.allowed.join(", ")}\uFF09`);
}
async function freshReadUnderLock(file, context) {
  let text2 = null;
  try {
    text2 = await readFile14(file, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
  return synthesize(text2, context);
}
async function withTrackRegistryLock(repoRoot, context, callback) {
  const file = trackRegistryPath(repoRoot);
  const dir = path6.dirname(file);
  await mkdir9(dir, { recursive: true });
  return withLock(dir, async () => callback(await freshReadUnderLock(file, context)));
}
async function mutateTrackRegistry(repoRoot, context, callback) {
  const file = trackRegistryPath(repoRoot);
  return withTrackRegistryLock(repoRoot, context, async (snapshot) => {
    const { next, result } = await callback(snapshot);
    const errors = validateTrackRegistry(next, context);
    if (errors.length > 0) {
      throw new Error(`mutateTrackRegistry: next \u672A\u8FC7\u5B8C\u6574\u6821\u9A8C\uFF08${errors.length} \u6761\uFF09\uFF0C\u62D2\u5199\uFF1A
  - ${errors.join("\n  - ")}`);
    }
    await atomicWriteFile(file, serializeTrackRegistry(next));
    return { registry: composeRegistry(next, "project-file"), result };
  });
}

// packages/kernel/dist/tracks/crud.js
var TrackNotFoundError = class extends Error {
  id;
  constructor(id) {
    super(`track '${id}' \u4E0D\u5B58\u5728\uFF08\u65E0\u6CD5 update/delete \u672A\u6CE8\u518C\u7684\u989D\u5916 track\uFF09`);
    this.name = "TrackNotFoundError";
    this.id = id;
  }
};
var TrackAlreadyExistsError = class extends Error {
  id;
  collidesWith;
  constructor(id, collidesWith) {
    super(collidesWith === "builtin" ? `track '${id}' \u4E0E\u5185\u5EFA Track \u91CD\u540D\uFF08\u5185\u5EFA\u8F68\u6539\u914D\u7F6E\u7528 tracks update\uFF0C\u4E0D\u80FD create\uFF09` : `track '${id}' \u5DF2\u5B58\u5728\uFF08\u989D\u5916 track id \u4E0D\u80FD\u91CD\u590D create\uFF1B\u6539\u914D\u7F6E\u7528 tracks update\uFF09`);
    this.name = "TrackAlreadyExistsError";
    this.id = id;
    this.collidesWith = collidesWith;
  }
};
var BuiltinTrackDeleteError = class extends Error {
  id;
  constructor(id) {
    super(`\u5185\u5EFA track '${id}' \u4E0D\u53EF\u5220\u9664\uFF08\u5185\u5EFA Track \u6052\u5B58\u5728\u3001\u6052\u6392\u6700\u524D\uFF09`);
    this.name = "BuiltinTrackDeleteError";
    this.id = id;
  }
};
var BuiltinTrackPolicyError = class extends Error {
  id;
  constructor(id) {
    super(`\u5185\u5EFA track '${id}' \u7684 policyProfile \u5728 v1 \u9501\u6B7B\u4E0D\u53EF\u6539\uFF08\u53EA\u80FD\u6539 label/workflow.default/workflow.allowed\uFF09`);
    this.name = "BuiltinTrackPolicyError";
    this.id = id;
  }
};
var TrackReferencedError = class extends Error {
  id;
  references;
  constructor(id, references) {
    super(`track '${id}' \u4ECD\u88AB ${references.length} \u4E2A\u6D3B\u8DC3 change \u5F15\u7528\uFF0C\u62D2\u5220\uFF1A${references.join(", ")}`);
    this.name = "TrackReferencedError";
    this.id = id;
    this.references = references;
  }
};
var TrackReferencesInvalidatedError = class extends Error {
  id;
  offending;
  constructor(id, offending) {
    super(`\u66F4\u65B0 track '${id}' \u4F1A\u4F7F ${offending.length} \u4E2A\u6D3B\u8DC3 change \u7684 {track,workflow} \u7EC4\u5408\u5931\u6548\uFF0C\u62D2\u6539\uFF1A${offending.join(", ")}`);
    this.name = "TrackReferencesInvalidatedError";
    this.id = id;
    this.offending = offending;
  }
};
var ChangeScanFailedError = class extends Error {
  unreadable;
  constructor(unreadable) {
    super(`\u65E0\u6CD5\u8BFB\u53D6/\u89E3\u6790 ${unreadable.length} \u4E2A\u6D3B\u8DC3 change\uFF0C\u65E0\u6CD5\u8BC1\u660E\u5F15\u7528\u5B89\u5168\uFF0Cfail-closed \u62D2\u7EDD\u64CD\u4F5C\uFF1A${unreadable.join(", ")}`);
    this.name = "ChangeScanFailedError";
    this.unreadable = unreadable;
  }
};
function bindingToConfig(w) {
  return { default: w.default, allowed: w.allowed };
}
function policyToConfig(p) {
  const routing = p.routing.enabled ? {
    enabled: true,
    pattern: p.routing.pattern,
    ...p.routing.excludePattern === void 0 ? {} : { excludePattern: p.routing.excludePattern },
    priority: p.routing.priority
  } : { enabled: false };
  return {
    reviewSeed: p.reviewSeed,
    ...p.autoEnqueueOnSpecComplete === void 0 ? {} : { autoEnqueueOnSpecComplete: p.autoEnqueueOnSpecComplete },
    automationEligible: p.automationEligible,
    coverageProfile: p.coverageProfile,
    routing,
    skills: { matrix: p.skills.matrix, profile: p.skills.profile }
  };
}
function createTrack(config, spec) {
  if (isBuiltinTrackId(spec.id))
    throw new TrackAlreadyExistsError(spec.id, "builtin");
  const tracks = config.tracks ?? [];
  if (tracks.some((t) => t.id === spec.id))
    throw new TrackAlreadyExistsError(spec.id, "custom");
  const entry = {
    id: spec.id,
    label: spec.label,
    workflow: bindingToConfig(spec.workflow),
    policyProfile: policyToConfig(spec.policyProfile)
  };
  return { ...config, tracks: [...tracks, entry] };
}
function deleteTrack(config, id) {
  if (isBuiltinTrackId(id))
    throw new BuiltinTrackDeleteError(id);
  const tracks = config.tracks ?? [];
  const idx = tracks.findIndex((t) => t.id === id);
  if (idx < 0)
    throw new TrackNotFoundError(id);
  const next = tracks.filter((_, i) => i !== idx);
  return { ...config, tracks: next.length > 0 ? next : void 0 };
}
function updateTrack(config, id, patch) {
  if (isBuiltinTrackId(id)) {
    if (patch.policyProfile !== void 0)
      throw new BuiltinTrackPolicyError(id);
    return applyBuiltinOverride(config, id, patch);
  }
  const tracks = config.tracks ?? [];
  const idx = tracks.findIndex((t) => t.id === id);
  if (idx < 0)
    throw new TrackNotFoundError(id);
  const cur = tracks[idx];
  const curWf = cur.workflow ?? {};
  const nextEntry = {
    id: cur.id,
    label: patch.label ?? cur.label,
    workflow: {
      default: patch.workflowDefault ?? curWf.default,
      allowed: patch.workflowAllowed ?? curWf.allowed
    },
    policyProfile: patch.policyProfile !== void 0 ? policyToConfig(patch.policyProfile) : cur.policyProfile
  };
  const nextTracks = tracks.slice();
  nextTracks[idx] = nextEntry;
  return { ...config, tracks: nextTracks };
}
function allowedEquals(a, b) {
  if (a === void 0)
    return false;
  if (a === "*" || b === "*")
    return a === b;
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function applyBuiltinOverride(config, id, patch) {
  const base = builtinTrack(id);
  const overrides = { ...config.builtins ?? {} };
  const cur = overrides[id] ?? {};
  const curWf = cur.workflow ?? {};
  const effLabel = patch.label ?? cur.label ?? base.label;
  const effDefault = patch.workflowDefault ?? curWf.default ?? base.workflow.default;
  const effAllowed = patch.workflowAllowed ?? curWf.allowed ?? base.workflow.allowed;
  const nextOv = {};
  if (effLabel !== base.label)
    nextOv.label = effLabel;
  const wf = {};
  if (effDefault !== base.workflow.default)
    wf.default = effDefault;
  if (!allowedEquals(effAllowed, base.workflow.allowed))
    wf.allowed = effAllowed;
  if (wf.default !== void 0 || wf.allowed !== void 0)
    nextOv.workflow = wf;
  if (nextOv.label !== void 0 || nextOv.workflow !== void 0)
    overrides[id] = nextOv;
  else
    delete overrides[id];
  const builtins = Object.keys(overrides).length > 0 ? overrides : void 0;
  return { ...config, builtins };
}
async function assertTrackDeletable(id, scan) {
  const { refs, unreadable } = await scan();
  if (unreadable.length > 0)
    throw new ChangeScanFailedError([...unreadable].sort());
  const referencing = refs.filter((r) => r.track === id).map((r) => r.name).sort();
  if (referencing.length > 0)
    throw new TrackReferencedError(id, referencing);
}
function effectiveAllowedFor(config, id) {
  if (isBuiltinTrackId(id)) {
    return config.builtins?.[id]?.workflow?.allowed ?? builtinTrack(id).workflow.allowed;
  }
  const entry = (config.tracks ?? []).find((t) => t.id === id);
  return entry?.workflow?.allowed ?? "*";
}
async function assertUpdatePreservesReferences(next, id, scan) {
  const allowed = effectiveAllowedFor(next, id);
  const { refs, unreadable } = await scan();
  if (unreadable.length > 0)
    throw new ChangeScanFailedError([...unreadable].sort());
  if (allowed === "*")
    return;
  const offending = refs.filter((r) => r.track === id && !allowed.includes(r.workflow)).map((r) => `${r.name}(workflow ${r.workflow})`).sort();
  if (offending.length > 0)
    throw new TrackReferencesInvalidatedError(id, offending);
}

// packages/kernel/dist/mem/fs.js
import { closeSync, existsSync as existsSync4, fstatSync, openSync, readFileSync as readFileSync9, readSync, readdirSync as readdirSync2, statSync } from "node:fs";
import { homedir as homedir3 } from "node:os";
function nodeMemFs(homeOverride) {
  const home = homeOverride ?? homedir3();
  return {
    home,
    exists: (p) => existsSync4(p),
    readDir: (p) => {
      try {
        return readdirSync2(p, { withFileTypes: true }).map((e) => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory()
        }));
      } catch {
        return [];
      }
    },
    readText: (p) => {
      try {
        return readFileSync9(p, "utf8");
      } catch {
        return void 0;
      }
    },
    readTextBounded: (p, maxBytes) => {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
        return void 0;
      let fd;
      try {
        fd = openSync(p, "r");
        const size = fstatSync(fd).size;
        const buffer = Buffer.allocUnsafe(Math.min(size, maxBytes));
        let bytesRead = 0;
        while (bytesRead < buffer.byteLength) {
          const count = readSync(fd, buffer, bytesRead, buffer.byteLength - bytesRead, bytesRead);
          if (count === 0)
            break;
          bytesRead += count;
        }
        const finalSize = fstatSync(fd).size;
        return {
          text: buffer.subarray(0, bytesRead).toString("utf8"),
          bytesRead,
          truncated: finalSize > bytesRead
        };
      } catch {
        return void 0;
      } finally {
        if (fd !== void 0) {
          try {
            closeSync(fd);
          } catch {
          }
        }
      }
    },
    mtimeMs: (p) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return void 0;
      }
    },
    env: (name) => process.env[name]
  };
}
function mtimeIso(fs, path7) {
  const ms = fs.mtimeMs(path7);
  return ms === void 0 ? void 0 : new Date(ms).toISOString();
}

// packages/kernel/dist/mem/adapters/opencode.js
import { createRequire } from "node:module";
import { join as join15, resolve as resolve7, sep as sep5 } from "node:path";

// packages/kernel/dist/mem/dialogue.js
var INJECTION_TAGS = [
  "system-reminder",
  "task-status",
  "ready",
  "current-state",
  "workflow",
  "workflow-state",
  "guidelines",
  "instructions",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "permissions instructions",
  "collaboration_mode",
  "environment_context",
  "auto_compact_summary",
  "user_instructions"
];
var ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRe(s) {
  return s.replace(ESCAPE_RE, (m) => "\\" + m);
}
var TAG_RES = INJECTION_TAGS.map((t) => new RegExp("<" + escapeRe(t) + "[^>]*>[\\s\\S]*?</" + escapeRe(t) + ">", "gi"));
var AGENTS_RE = /^# AGENTS\.md instructions for[\s\S]*?(?=\n\n[A-Z一-龥]|$)/gm;
var COLLAPSE_RE = /\n{3,}/g;
var INSTRUCTIONS_RE = /^<INSTRUCTIONS>/i;
function isBootstrapTurn(cleaned, originalLength) {
  if (cleaned.startsWith("# AGENTS.md instructions for"))
    return true;
  if (originalLength > 4e3 && INSTRUCTIONS_RE.test(cleaned))
    return true;
  return false;
}
function stripInjectionTags(text2) {
  let out = text2;
  for (const re of TAG_RES)
    out = out.replace(re, "");
  out = out.replace(AGENTS_RE, "");
  out = out.replace(COLLAPSE_RE, "\n\n");
  return out.trim();
}

// packages/kernel/dist/mem/filter.js
import { resolve as resolve6, sep as sep4 } from "node:path";
function parseIso(iso) {
  if (!iso)
    return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
function inRangeOverlap(start, end, f) {
  const s = start || end;
  const e = end || start;
  if (!s && !e)
    return true;
  if (f.since != null && e) {
    const et = parseIso(e);
    if (et !== null && et < f.since)
      return false;
  }
  if (f.until != null && s) {
    const st = parseIso(s);
    if (st !== null && st > f.until)
      return false;
  }
  return true;
}
function sameProject(sessionCwd, target) {
  if (!target)
    return true;
  if (!sessionCwd)
    return false;
  const a = resolve6(sessionCwd);
  const b = resolve6(target);
  return a === b || a.startsWith(b + sep4);
}

// packages/kernel/dist/mem/search.js
function relevanceScore(h) {
  const total = h.totalTurns ?? 0;
  if (total === 0)
    return 0;
  return (3 * (h.userCount ?? 0) + (h.asstCount ?? 0)) / total;
}
function chunkAround(text2, hitIdx, maxChars) {
  const startPara = text2.slice(0, hitIdx).lastIndexOf("\n\n");
  let start = startPara === -1 ? 0 : startPara + 2;
  const endPara = text2.indexOf("\n\n", hitIdx);
  let end = endPara === -1 ? text2.length : endPara;
  let truncated = false;
  if (end - start > maxChars) {
    start = Math.max(0, hitIdx - Math.floor(maxChars / 2));
    end = Math.min(text2.length, hitIdx + Math.ceil(maxChars / 2));
    truncated = true;
  }
  return { start, end, truncated };
}
function searchInDialogue(turns, kw, maxExcerpts = 3, chunkChars = 400) {
  const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { count: 0, userCount: 0, asstCount: 0, totalTurns: turns.length, excerpts: [] };
  }
  let userCount = 0;
  let asstCount = 0;
  const userExcerpts = [];
  const asstExcerpts = [];
  for (const t of turns) {
    const hay = t.text.toLowerCase();
    if (!tokens.every((tok) => hay.includes(tok)))
      continue;
    const hitPositions = [];
    const tokenFreq = /* @__PURE__ */ new Map();
    let turnHits = 0;
    for (const tok of tokens) {
      let frm = 0;
      let n = 0;
      for (; ; ) {
        const idx = hay.indexOf(tok, frm);
        if (idx === -1)
          break;
        n += 1;
        turnHits += 1;
        hitPositions.push({ idx, tok });
        frm = idx + tok.length;
      }
      tokenFreq.set(tok, n);
    }
    if (t.role === "user")
      userCount += turnHits;
    else
      asstCount += turnHits;
    hitPositions.sort((a, b) => a.idx - b.idx);
    const candidates = [];
    const seenStarts = /* @__PURE__ */ new Set();
    for (const { idx, tok } of hitPositions) {
      const ca = chunkAround(t.text, idx, chunkChars);
      if (seenStarts.has(ca.start))
        continue;
      seenStarts.add(ca.start);
      const sl = hay.slice(ca.start, ca.end);
      const coverage = tokens.reduce((acc, tk) => acc + (sl.includes(tk) ? 1 : 0), 0);
      const rarity = 1 / (tokenFreq.get(tok) || 1);
      candidates.push({ start: ca.start, end: ca.end, truncated: ca.truncated, coverage, rarity });
    }
    candidates.sort((a, b) => b.coverage - a.coverage || b.rarity - a.rarity || a.start - b.start);
    for (const c of candidates) {
      let snippet = t.text.slice(c.start, c.end).trim();
      if (c.truncated) {
        if (c.start > 0)
          snippet = "\u2026" + snippet;
        if (c.end < t.text.length)
          snippet = snippet + "\u2026";
      }
      const target = t.role === "user" ? userExcerpts : asstExcerpts;
      target.push({ role: t.role, snippet });
    }
  }
  const excerpts = [...userExcerpts, ...asstExcerpts].slice(0, maxExcerpts);
  return {
    count: userCount + asstCount,
    userCount,
    asstCount,
    totalTurns: turns.length,
    excerpts
  };
}

// packages/kernel/dist/mem/adapters/opencode.js
function loadSqlite() {
  try {
    const req = createRequire(import.meta.url);
    return req("node:sqlite");
  } catch {
    return null;
  }
}
function opencodeDbPath(fs) {
  const xdgData = fs.env?.("XDG_DATA_HOME");
  const dataHome = xdgData && xdgData.trim() ? xdgData : join15(fs.home, ".local", "share");
  return join15(dataHome, "opencode", "opencode.db");
}
function withOpenCodeDb(fs, fallback, fn) {
  const dbPath = opencodeDbPath(fs);
  if (!fs.exists(dbPath))
    return fallback;
  const sqlite = loadSqlite();
  if (!sqlite) {
    fs.contentReadBudget?.noteSourceUnavailable("opencode");
    return fallback;
  }
  let db;
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
    return fn(db);
  } catch {
    fs.contentReadBudget?.noteSourceUnavailable("opencode");
    return fallback;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
      }
    }
  }
}
function parseJson2(raw) {
  if (typeof raw !== "string")
    return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function msToIso(ms) {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function opencodeListSessions(fs, f) {
  const dbPath = opencodeDbPath(fs);
  return withOpenCodeDb(fs, [], (db) => {
    let rows;
    if (fs.contentReadBudget && f.cwd) {
      const projectRoot = resolve7(f.cwd);
      const projectPrefix = projectRoot + sep5;
      rows = db.prepare(`
          SELECT id,
                 CAST(substr(CAST(directory AS blob), 1, 4096) AS text) AS directory,
                 CAST(substr(CAST(title AS blob), 1, 161) AS text) AS title,
                 parent_id, time_created, time_updated
          FROM session
          WHERE directory = ? OR substr(directory, 1, length(?)) = ?
          ORDER BY time_updated DESC, id
          LIMIT ?
        `).all(projectRoot, projectPrefix, projectPrefix, f.limit);
    } else if (fs.contentReadBudget) {
      rows = db.prepare(`
          SELECT id,
                 CAST(substr(CAST(directory AS blob), 1, 4096) AS text) AS directory,
                 CAST(substr(CAST(title AS blob), 1, 161) AS text) AS title,
                 parent_id, time_created, time_updated
          FROM session
          ORDER BY time_updated DESC, id
          LIMIT ?
        `).all(f.limit);
    } else {
      rows = db.prepare("SELECT id, directory, title, parent_id, time_created, time_updated FROM session").all();
    }
    const out = [];
    for (const row of rows) {
      if (fs.contentReadBudget && !fs.contentReadBudget.claimCandidate()) {
        fs.contentReadBudget.noteCandidateLimitReached();
        break;
      }
      const cwd = typeof row.directory === "string" && row.directory ? row.directory : null;
      if (f.cwd && !sameProject(cwd, f.cwd))
        continue;
      const created = msToIso(row.time_created);
      const updated = msToIso(row.time_updated);
      if (!inRangeOverlap(created, updated, f))
        continue;
      out.push({
        platform: "opencode",
        id: String(row.id),
        title: typeof row.title === "string" && row.title ? row.title : null,
        cwd,
        created,
        updated,
        filePath: dbPath,
        parent_id: typeof row.parent_id === "string" && row.parent_id ? row.parent_id : null
      });
    }
    return out;
  });
}
function roleOf(data) {
  return data?.role === "user" ? "user" : data?.role === "assistant" ? "assistant" : null;
}
var SQLITE_ROW_CHUNK_BYTES = 4 * 1024;
var SQLITE_MAX_ROWS_PER_QUERY = 512;
function readBoundedSqliteRows(fs, db, sql, sessionId, source) {
  const budget = fs.contentReadBudget;
  if (!budget)
    return [];
  const sourceRemaining = budget.perSourceBytes - source.bytesRead;
  const aggregateRemaining = budget.remainingBytes();
  const chunkBytes = Math.min(SQLITE_ROW_CHUNK_BYTES, sourceRemaining, aggregateRemaining);
  if (chunkBytes <= 0) {
    if (sourceRemaining <= 0)
      budget.noteSourceTruncated();
    if (aggregateRemaining <= 0)
      budget.noteTotalExhausted();
    source.truncated = true;
    return [];
  }
  const iterator = db.prepare(sql).iterate(chunkBytes, sessionId);
  const rows = [];
  while (rows.length < SQLITE_MAX_ROWS_PER_QUERY) {
    if (budget.perSourceBytes - source.bytesRead < chunkBytes || budget.remainingBytes() < chunkBytes) {
      if (budget.perSourceBytes - source.bytesRead < chunkBytes)
        budget.noteSourceTruncated();
      if (budget.remainingBytes() < chunkBytes)
        budget.noteTotalExhausted();
      source.truncated = true;
      break;
    }
    const next = iterator.next();
    if (next.done)
      break;
    const row = next.value;
    const returnedBytes = typeof row.data === "string" ? Buffer.byteLength(row.data) : 0;
    budget.consume(returnedBytes);
    source.bytesRead += returnedBytes;
    if (typeof row.full_bytes === "number" && row.full_bytes > returnedBytes) {
      budget.noteSourceTruncated();
      source.truncated = true;
    }
    rows.push(row);
  }
  if (rows.length === SQLITE_MAX_ROWS_PER_QUERY) {
    budget.noteSourceTruncated();
    source.truncated = true;
  }
  return rows;
}
function opencodeExtractDialogue(fs, s) {
  return withOpenCodeDb(fs, [], (db) => {
    const sourceBudget = { bytesRead: 0, truncated: false };
    const messageRows = fs.contentReadBudget ? readBoundedSqliteRows(fs, db, `SELECT id,
                CAST(substr(CAST(data AS blob), 1, ?) AS text) AS data,
                length(CAST(data AS blob)) AS full_bytes
         FROM message
         WHERE session_id = ?
         ORDER BY time_created, id`, s.id, sourceBudget) : db.prepare("SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(s.id);
    if (!messageRows.length)
      return [];
    const partRows = fs.contentReadBudget ? readBoundedSqliteRows(fs, db, `SELECT id, message_id,
                CAST(substr(CAST(data AS blob), 1, ?) AS text) AS data,
                length(CAST(data AS blob)) AS full_bytes
         FROM part
         WHERE session_id = ?
         ORDER BY time_created, id`, s.id, sourceBudget) : db.prepare("SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id").all(s.id);
    const partsByMessage = /* @__PURE__ */ new Map();
    for (const p of partRows) {
      const mid = String(p.message_id);
      const list = partsByMessage.get(mid);
      if (list)
        list.push(p);
      else
        partsByMessage.set(mid, [p]);
    }
    const turns = [];
    for (const row of messageRows) {
      const role = roleOf(parseJson2(row.data));
      if (!role)
        continue;
      const parts = partsByMessage.get(String(row.id)) ?? [];
      const collected = [];
      let totalRaw = 0;
      for (const p of parts) {
        const pdata = parseJson2(p.data);
        if (!pdata || pdata.type !== "text" || typeof pdata.text !== "string")
          continue;
        totalRaw += pdata.text.length;
        const cleaned = stripInjectionTags(pdata.text);
        if (cleaned)
          collected.push(cleaned);
      }
      if (!collected.length)
        continue;
      const merged = collected.join("\n\n");
      if (isBootstrapTurn(merged, totalRaw))
        continue;
      turns.push({ role, text: merged });
    }
    return turns;
  });
}
function opencodeSearch(fsOrKw, s, kw) {
  if (typeof fsOrKw === "string")
    return searchInDialogue([], fsOrKw);
  return searchInDialogue(opencodeExtractDialogue(fsOrKw, s), kw);
}

// packages/kernel/dist/mem/phase.js
var FIND_RE = /(^|[\s/\\])task\.py\s+(create|start)(?:\s+|$)/g;
var PROSE_RE = /^[A-Za-z][A-Za-z0-9_-]*\s+[A-Za-z]{2,}\b/;
var TRAIL_META_RE = /[)};&|>]+$/;
function parseTaskPyCommandsAll(cmd) {
  if (typeof cmd !== "string" || cmd.length === 0)
    return [];
  const matches = [];
  FIND_RE.lastIndex = 0;
  let m;
  while ((m = FIND_RE.exec(cmd)) !== null) {
    matches.push({ action: m[2], bodyStart: m.index + m[0].length });
    if (m.index === FIND_RE.lastIndex)
      FIND_RE.lastIndex += 1;
  }
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nxt = matches[i + 1];
    const bodyEnd = nxt ? nxt.bodyStart : cmd.length;
    const sl = cmd.slice(cur.bodyStart, bodyEnd);
    const restRaw = (sl.includes("\n") ? sl.split("\n")[0] : sl).trim();
    if (PROSE_RE.test(restRaw))
      continue;
    const parsed = parseRest(cur.action, restRaw);
    if (cur.action === "create" && !parsed.slug && !parsed.titleArg)
      continue;
    if (cur.action === "start" && !parsed.taskDir)
      continue;
    out.push(parsed);
  }
  return out;
}
function parseRest(action, restRaw) {
  if (action === "create") {
    const args2 = splitShellArgs(restRaw);
    let slug = null;
    let titleArg = null;
    let i = 0;
    while (i < args2.length) {
      const a = args2[i];
      if (a === "--slug" || a === "-s") {
        slug = args2[i + 1] ?? null;
        i += 2;
        continue;
      }
      if (a.startsWith("--slug=")) {
        slug = a.slice("--slug=".length);
        i += 1;
        continue;
      }
      if (a.startsWith("-")) {
        i += 1;
        continue;
      }
      if (titleArg === null)
        titleArg = a;
      i += 1;
    }
    return { action: "create", slug, titleArg };
  }
  const args = splitShellArgs(restRaw);
  let taskDir = null;
  for (const a of args) {
    if (a.startsWith("-"))
      continue;
    taskDir = a;
    break;
  }
  return { action: "start", taskDir };
}
function splitShellArgs(s) {
  const out = [];
  let cur = "";
  let quote = null;
  const flush = () => {
    if (!cur)
      return;
    const cleaned = cur.replace(TRAIL_META_RE, "");
    if (cleaned)
      out.push(cleaned);
    cur = "";
  };
  for (const ch of s) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "(" || ch === ")") {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

// packages/kernel/dist/mem/adapters/claude.js
import { join as join17 } from "node:path";

// packages/kernel/dist/mem/jsonl.js
var OPEN_BRACE = 123;
function isJsonlLine(line) {
  return line.length > 0 && line.charCodeAt(0) === OPEN_BRACE;
}
function parseJsonlLines(text2) {
  const out = [];
  if (!text2)
    return out;
  for (const line of text2.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function readJsonlFirst(text2) {
  if (!text2)
    return void 0;
  for (const line of text2.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    try {
      return JSON.parse(line);
    } catch {
    }
  }
  return void 0;
}
function findInJsonl(text2, predicate, maxLines = 200) {
  if (!text2)
    return void 0;
  let count = 0;
  for (const line of text2.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    count += 1;
    if (predicate(obj))
      return obj;
    if (count >= maxLines)
      return void 0;
  }
  return void 0;
}

// packages/kernel/dist/mem/paths.js
import { join as join16, resolve as resolve8 } from "node:path";
var SEP_RE = /[/\\:_.]/g;
var PI_SEP_RE = /[/\\:]/g;
var PI_LEAD_RE = /^[/\\]/;
function expandHome(fs, p) {
  if (p === "~")
    return fs.home;
  if (p.startsWith("~/") || p.startsWith("~\\"))
    return join16(fs.home, p.slice(2));
  return p;
}
function claudeProjectsRoot(fs) {
  return join16(fs.home, ".claude", "projects");
}
function codexSessionsRoot(fs) {
  return join16(fs.home, ".codex", "sessions");
}
function claudeProjectDirFromCwd(fs, cwd) {
  return join16(claudeProjectsRoot(fs), cwd.replace(SEP_RE, "-"));
}
function piAgentDir(fs) {
  const env = fs.env?.("PI_CODING_AGENT_DIR");
  return expandHome(fs, env || join16(fs.home, ".pi", "agent"));
}
function piProjectDirFromCwd(fs, cwd) {
  const resolved = resolve8(cwd);
  const safe = "--" + resolved.replace(PI_LEAD_RE, "").replace(PI_SEP_RE, "-") + "--";
  return join16(piAgentDir(fs), "sessions", safe);
}
function readPiSettingsSessionDir(fs) {
  const raw = fs.readText(join16(piAgentDir(fs), "settings.json"));
  if (!raw)
    return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object")
    return null;
  const dir = parsed.sessionDir;
  if (typeof dir === "string" && dir.trim())
    return expandHome(fs, dir);
  return null;
}
function piSessionRoots(fs) {
  const roots = [join16(piAgentDir(fs), "sessions")];
  const envSess = fs.env?.("PI_CODING_AGENT_SESSION_DIR");
  if (envSess)
    roots.push(expandHome(fs, envSess));
  const settingsDir = readPiSettingsSessionDir(fs);
  if (settingsDir)
    roots.push(settingsDir);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const root of roots) {
    const normalized2 = resolve8(root);
    if (seen.has(normalized2))
      continue;
    seen.add(normalized2);
    out.push(root);
  }
  return out;
}
function walkDir(fs, root) {
  const out = [];
  if (!fs.exists(root))
    return out;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readDir(cur)) {
      const full = join16(cur, e.name);
      if (e.isDirectory)
        stack.push(full);
      else if (e.isFile)
        out.push(full);
    }
  }
  return out;
}

// packages/kernel/dist/mem/adapters/claude.js
function claudeListSessions(fs, f) {
  const root = claudeProjectsRoot(fs);
  if (!fs.exists(root))
    return [];
  const out = [];
  const allDirs = () => fs.readDir(root).filter((e) => e.isDirectory).map((e) => join17(root, e.name));
  let projectDirs;
  if (f.cwd) {
    const derived = claudeProjectDirFromCwd(fs, f.cwd);
    projectDirs = fs.exists(derived) ? [derived] : allDirs();
  } else {
    projectDirs = allDirs();
  }
  for (const d of projectDirs) {
    const entries = fs.readDir(d);
    const indexRaw = fs.readText(join17(d, "sessions-index.json"));
    const indexById = /* @__PURE__ */ new Map();
    if (indexRaw) {
      try {
        const index = JSON.parse(indexRaw);
        const idxEntries = index && Array.isArray(index.entries) ? index.entries : [];
        for (const e of idxEntries)
          if (e && typeof e.id === "string")
            indexById.set(e.id, e);
      } catch {
      }
    }
    const sessionEntries = entries.filter((entry) => entry.isFile && entry.name.endsWith(".jsonl")).sort((left, right) => {
      const leftPath = join17(d, left.name);
      const rightPath = join17(d, right.name);
      return (fs.mtimeMs(rightPath) ?? 0) - (fs.mtimeMs(leftPath) ?? 0);
    });
    for (const e of sessionEntries) {
      if (fs.contentReadBudget && !fs.contentReadBudget.claimCandidate()) {
        fs.contentReadBudget.noteCandidateLimitReached();
        break;
      }
      const filePath = join17(d, e.name);
      const sid = e.name.slice(0, -".jsonl".length);
      const idx = indexById.get(sid);
      let cwd = idx?.cwd ?? null;
      let created = idx?.created ?? null;
      const title = idx?.title ?? null;
      if (!cwd || !created) {
        const text2 = fs.readText(filePath);
        const evt = findInJsonl(text2, (o) => typeof o?.cwd === "string", 100);
        cwd = cwd || (evt?.cwd ?? null);
        if (!created) {
          const first = readJsonlFirst(text2);
          created = (evt?.timestamp ?? null) || (first?.timestamp ?? null);
        }
      }
      const updated = mtimeIso(fs, filePath);
      if (updated === void 0)
        continue;
      if (!inRangeOverlap(created, updated, f))
        continue;
      if (f.cwd && !sameProject(cwd, f.cwd))
        continue;
      out.push({ platform: "claude", id: sid, title, cwd, created, updated, filePath });
    }
  }
  return out;
}
function summaryText(content) {
  if (typeof content === "string")
    return stripInjectionTags(content);
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") {
        const cleaned = stripInjectionTags(block.text);
        if (cleaned)
          parts.push(cleaned);
      }
    }
    return parts.join("\n\n");
  }
  return "";
}
function claudeExtractFromLines(lines) {
  let turns = [];
  for (const obj of lines) {
    const t = obj?.type;
    const msg = obj?.message;
    if (t === "user" && obj?.isCompactSummary === true) {
      const summary = summaryText(msg?.content);
      turns = summary ? [{ role: "user", text: `[compact summary]
${summary}` }] : [];
      continue;
    }
    if (!msg)
      continue;
    const content = msg.content;
    if (t === "user" && msg.role === "user") {
      if (typeof content === "string") {
        const text2 = stripInjectionTags(content);
        if (text2 && !isBootstrapTurn(text2, content.length))
          turns.push({ role: "user", text: text2 });
      }
    } else if (t === "assistant" && msg.role === "assistant" && Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          const cleaned = stripInjectionTags(block.text);
          if (cleaned)
            parts.push(cleaned);
        }
      }
      if (parts.length)
        turns.push({ role: "assistant", text: parts.join("\n\n") });
    }
  }
  return turns;
}
function claudeExtractDialogue(fs, s) {
  return claudeExtractFromLines(parseJsonlLines(fs.readText(s.filePath)));
}
function claudeSearch(fs, s, kw) {
  return searchInDialogue(claudeExtractDialogue(fs, s), kw);
}

// packages/kernel/dist/mem/adapters/codex.js
import { basename as basename2 } from "node:path";
var ROLLOUT_RE = /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/;
var TS_FIX_RE = /T(\d{2})-(\d{2})-(\d{2})/;
function parseDialogueRole(v) {
  return v === "user" || v === "assistant" ? v : null;
}
function normalizeIso(s) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}
function codexListSessions(fs, f) {
  const root = codexSessionsRoot(fs);
  if (!fs.exists(root))
    return [];
  const out = [];
  const files = walkDir(fs, root).filter((file) => file.endsWith(".jsonl")).sort((left, right) => (fs.mtimeMs(right) ?? 0) - (fs.mtimeMs(left) ?? 0));
  for (const file of files) {
    if (fs.contentReadBudget && !fs.contentReadBudget.claimCandidate()) {
      fs.contentReadBudget.noteCandidateLimitReached();
      break;
    }
    const base = basename2(file).slice(0, -".jsonl".length);
    const m = ROLLOUT_RE.exec(base);
    let tsFromName = null;
    if (m) {
      const fixed = required(m[1]).replace(TS_FIX_RE, "T$1:$2:$3") + "Z";
      tsFromName = normalizeIso(fixed);
    }
    const first = readJsonlFirst(fs.readText(file));
    const meta = first?.payload ?? null;
    const sid = (meta?.id ?? null) || (m ? m[2] : null) || base;
    const cwd = meta?.cwd ?? null;
    const created = (first?.timestamp ?? null) || tsFromName || "";
    if (f.cwd && !sameProject(cwd, f.cwd))
      continue;
    const updated = mtimeIso(fs, file);
    if (updated === void 0)
      continue;
    if (!inRangeOverlap(created, updated, f))
      continue;
    out.push({ platform: "codex", id: sid, cwd, created, updated, filePath: file });
  }
  return out;
}
function buildTurnFromMessage(role, parts) {
  const collected = [];
  let totalRaw = 0;
  for (const c of parts ?? []) {
    const txt = c?.text;
    if (typeof txt !== "string")
      continue;
    if (c?.type !== "input_text" && c?.type !== "output_text")
      continue;
    totalRaw += txt.length;
    const cleaned = stripInjectionTags(txt);
    if (cleaned)
      collected.push(cleaned);
  }
  if (!collected.length)
    return null;
  const merged = collected.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw))
    return null;
  return { role, text: merged };
}
function codexExtractDialogue(fs, s) {
  let turns = [];
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj;
    if (o?.type === "compacted") {
      const rh = o?.payload?.replacement_history;
      turns = [];
      if (!Array.isArray(rh))
        continue;
      for (const item2 of rh) {
        if (item2?.type !== "message")
          continue;
        const role2 = parseDialogueRole(item2?.role);
        if (!role2)
          continue;
        const turn2 = buildTurnFromMessage(role2, item2?.content);
        if (turn2)
          turns.push({ role: turn2.role, text: `[compact]
${turn2.text}` });
      }
      continue;
    }
    const p = o?.payload;
    if (!p || p.type !== "message")
      continue;
    const role = parseDialogueRole(p.role);
    if (!role)
      continue;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn)
      turns.push(turn);
  }
  return turns;
}
function codexSearch(fs, s, kw) {
  return searchInDialogue(codexExtractDialogue(fs, s), kw);
}

// packages/kernel/dist/mem/adapters/pi.js
import { basename as basename3, join as join18, resolve as resolve9 } from "node:path";
function piListSessions(fs, f) {
  const out = [];
  const files = candidateFiles(fs, f).sort((left, right) => (fs.mtimeMs(right) ?? 0) - (fs.mtimeMs(left) ?? 0));
  for (const filePath of files) {
    if (fs.contentReadBudget && !fs.contentReadBudget.claimCandidate()) {
      fs.contentReadBudget.noteCandidateLimitReached();
      break;
    }
    const header = readJsonlFirst(fs.readText(filePath));
    if (!header || header.type !== "session")
      continue;
    const sid = typeof header.id === "string" ? header.id : idFromFile(filePath);
    const cwd = typeof header.cwd === "string" ? header.cwd : null;
    if (f.cwd && !sameProject(cwd, f.cwd))
      continue;
    let title = null;
    let lastMs = null;
    for (const entry of parseJsonlLines(fs.readText(filePath))) {
      const e = entry;
      if (e?.type === "session_info") {
        const name = e.name;
        title = typeof name === "string" && name.trim() ? name.trim() : null;
        continue;
      }
      if (e?.type !== "message")
        continue;
      const msg = e.message ?? {};
      const role = msg.role;
      if (role !== "user" && role !== "assistant")
        continue;
      let activity = timestampMs(msg.timestamp);
      if (activity === null)
        activity = timestampMs(e.timestamp);
      if (activity !== null)
        lastMs = Math.max(lastMs ?? 0, activity);
    }
    let updated;
    if (lastMs !== null)
      updated = new Date(lastMs).toISOString();
    else
      updated = mtimeIso(fs, filePath);
    const created = typeof header.timestamp === "string" ? header.timestamp : null;
    if (!inRangeOverlap(created, updated, f))
      continue;
    out.push({ platform: "pi", id: sid, title, cwd, created, updated: updated ?? null, filePath });
  }
  return out;
}
function candidateFiles(fs, f) {
  const defaultRoot = join18(piAgentDir(fs), "sessions");
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const pushJsonl = (root) => {
    if (!fs.exists(root))
      return;
    for (const file of walkDir(fs, root)) {
      if (!file.endsWith(".jsonl"))
        continue;
      const normalized2 = resolve9(file);
      if (seen.has(normalized2))
        continue;
      seen.add(normalized2);
      out.push(file);
    }
  };
  for (const root of piSessionRoots(fs)) {
    if (f.cwd && resolve9(root) === resolve9(defaultRoot))
      pushJsonl(piProjectDirFromCwd(fs, f.cwd));
    else
      pushJsonl(root);
  }
  return out;
}
function idFromFile(filePath) {
  const base = basename3(filePath).slice(0, -".jsonl".length);
  const underscore = base.indexOf("_");
  return underscore === -1 ? base : base.slice(underscore + 1);
}
function timestampMs(value) {
  if (typeof value === "number" && !Number.isNaN(value))
    return Math.trunc(value);
  if (typeof value !== "string")
    return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}
function piExtractDialogue(fs, s) {
  return buildPiTurnsAndEvents(fs, s).turns;
}
function piSearch(fs, s, kw) {
  return searchInDialogue(piExtractDialogue(fs, s), kw);
}
function buildPiTurnsAndEvents(fs, s) {
  const effective = effectiveActivePath(fs, s.filePath);
  const turns = [];
  const events = [];
  for (const entry of effective) {
    collectTaskEvents(entry, turns.length, events);
    const turn = turnFromEntry(entry);
    if (turn)
      turns.push(turn);
  }
  return { turns, events };
}
function effectiveActivePath(fs, filePath) {
  const entries = [];
  for (const entry of parseJsonlLines(fs.readText(filePath))) {
    const e = entry;
    if (e?.type === "session")
      continue;
    if (typeof e?.id !== "string")
      continue;
    entries.push(e);
  }
  if (!entries.length)
    return [];
  const byId = /* @__PURE__ */ new Map();
  for (const entry of entries)
    if (typeof entry.id === "string")
      byId.set(entry.id, entry);
  const leaf = entries[entries.length - 1];
  const activePath = [];
  let current = leaf;
  const seen = /* @__PURE__ */ new Set();
  while (current) {
    const cid = current.id;
    if (typeof cid !== "string" || seen.has(cid))
      break;
    seen.add(cid);
    activePath.unshift(current);
    const parentId = current.parentId;
    current = typeof parentId === "string" ? byId.get(parentId) : void 0;
  }
  const compactionIdx = findLastIndex(activePath, (e) => e?.type === "compaction");
  if (compactionIdx === -1)
    return activePath;
  const compaction = activePath[compactionIdx];
  let firstKeptIdx = -1;
  for (let idx = 0; idx < activePath.length; idx++) {
    if (idx < compactionIdx && activePath[idx]?.id === compaction?.firstKeptEntryId) {
      firstKeptIdx = idx;
      break;
    }
  }
  const kept = firstKeptIdx === -1 ? [] : activePath.slice(firstKeptIdx, compactionIdx);
  return [compaction, ...kept, ...activePath.slice(compactionIdx + 1)];
}
function findLastIndex(items, pred) {
  for (let i = items.length - 1; i >= 0; i--)
    if (pred(items[i]))
      return i;
  return -1;
}
function turnFromEntry(entry) {
  const etype = entry?.type;
  if (etype === "compaction")
    return syntheticTurn("[compact summary]", entry?.summary);
  if (etype === "branch_summary")
    return syntheticTurn("[branch summary]", entry?.summary);
  if (etype === "custom_message")
    return buildTurn("user", entry?.content);
  if (etype !== "message")
    return null;
  const msg = entry?.message;
  if (!msg)
    return null;
  const role = msg.role;
  if (role === "user")
    return buildTurn("user", msg.content);
  if (role === "assistant")
    return buildTurn("assistant", msg.content);
  if (role === "custom")
    return buildTurn("user", msg.content);
  if (role === "branchSummary")
    return syntheticTurn("[branch summary]", msg.summary);
  if (role === "compactionSummary")
    return syntheticTurn("[compact summary]", msg.summary);
  return null;
}
function syntheticTurn(prefix, raw) {
  if (typeof raw !== "string")
    return null;
  const text2 = stripInjectionTags(raw);
  if (!text2)
    return null;
  return { role: "user", text: `${prefix}
${text2}` };
}
function buildTurn(role, content) {
  const parts = [];
  let totalRaw = 0;
  if (typeof content === "string") {
    totalRaw = content.length;
    const cleaned = stripInjectionTags(content);
    if (cleaned)
      parts.push(cleaned);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type !== "text" || typeof block.text !== "string")
        continue;
      totalRaw += block.text.length;
      const cleaned = stripInjectionTags(block.text);
      if (cleaned)
        parts.push(cleaned);
    }
  }
  if (!parts.length)
    return null;
  const merged = parts.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw))
    return null;
  return { role, text: merged };
}
function collectTaskEvents(entry, turnIndex, events) {
  if (entry?.type !== "message")
    return;
  const msg = entry?.message;
  if (!msg)
    return;
  if (msg.role === "bashExecution" && typeof msg.command === "string") {
    pushTaskEvents(msg.command, entry?.timestamp, turnIndex, events);
    return;
  }
  if (msg.role !== "assistant" || !Array.isArray(msg.content))
    return;
  for (const block of msg.content) {
    if (block?.type !== "toolCall")
      continue;
    if (typeof block.name !== "string")
      continue;
    const toolName = block.name.toLowerCase();
    if (toolName !== "bash" && toolName !== "shell")
      continue;
    const args = block.arguments;
    if (!args || typeof args !== "object")
      continue;
    const command = args.command;
    if (typeof command !== "string")
      continue;
    pushTaskEvents(command, entry?.timestamp, turnIndex, events);
  }
}
function pushTaskEvents(command, timestamp, turnIndex, events) {
  for (const parsed of parseTaskPyCommandsAll(command)) {
    const ev = {
      action: parsed.action,
      timestamp: (typeof timestamp === "string" ? timestamp : "") || "",
      turnIndex
    };
    if (parsed.action === "create")
      ev.slug = parsed.slug;
    else
      ev.taskDir = parsed.taskDir;
    events.push(ev);
  }
}

// packages/kernel/dist/mem/sessions.js
var WIDE_LIMIT = 1e6;
function resolveFilter(filt) {
  const f = filt ?? {};
  return {
    platform: f.platform ?? "all",
    since: f.since ?? null,
    until: f.until ?? null,
    cwd: f.cwd === void 0 ? null : f.cwd,
    limit: f.limit ?? 50
  };
}
function recencyKey(s) {
  return s.updated || s.created || "";
}
function recencyDesc(a, b) {
  const ka = recencyKey(a);
  const kb = recencyKey(b);
  return ka < kb ? 1 : ka > kb ? -1 : 0;
}
function listAll(fs, f) {
  const platform = f.platform;
  const all = [];
  if (platform === "all" || platform === "claude")
    all.push(...claudeListSessions(fs, f));
  if (platform === "all" || platform === "codex")
    all.push(...codexListSessions(fs, f));
  if (platform === "all" || platform === "opencode")
    all.push(...opencodeListSessions(fs, f));
  if (platform === "all" || platform === "pi")
    all.push(...piListSessions(fs, f));
  all.sort(recencyDesc);
  return all.slice(0, f.limit);
}
function extractDialogue(fs, s) {
  switch (s.platform) {
    case "claude":
      return claudeExtractDialogue(fs, s);
    case "codex":
      return codexExtractDialogue(fs, s);
    case "opencode":
      return opencodeExtractDialogue(fs, s);
    case "pi":
      return piExtractDialogue(fs, s);
    default:
      return [];
  }
}
function searchSession(fs, s, kw) {
  switch (s.platform) {
    case "claude":
      return claudeSearch(fs, s, kw);
    case "codex":
      return codexSearch(fs, s, kw);
    case "opencode":
      return opencodeSearch(fs, s, kw);
    case "pi":
      return piSearch(fs, s, kw);
    default:
      return searchInDialogue([], kw);
  }
}
function buildChildIndex(sessions) {
  const directChildren2 = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    const pid = s.parent_id;
    if (!pid)
      continue;
    const arr = directChildren2.get(pid) ?? [];
    arr.push(s);
    directChildren2.set(pid, arr);
  }
  const out = /* @__PURE__ */ new Map();
  for (const pid of directChildren2.keys()) {
    const stack = [...directChildren2.get(pid) ?? []];
    const flat = [];
    while (stack.length) {
      const cur = stack.pop();
      flat.push(cur);
      for (const c of directChildren2.get(cur.id) ?? [])
        stack.push(c);
    }
    out.set(pid, flat);
  }
  return out;
}
function searchSessionWithChildren(fs, s, kw, childIndex) {
  const children = childIndex.get(s.id) ?? [];
  if (!children.length)
    return searchSession(fs, s, kw);
  const merged = [...extractDialogue(fs, s)];
  for (const c of children)
    merged.push(...extractDialogue(fs, c));
  return searchInDialogue(merged, kw);
}
function listMemSessions(fs, options) {
  return listAll(fs, resolveFilter(options?.filter));
}
function searchMemSessions(fs, options) {
  const f = resolveFilter(options.filter);
  const kw = options.keyword;
  const includeChildren = options.includeChildren === true;
  const requestedCandidateLimit = options.candidateLimit;
  const candidateLimit = typeof requestedCandidateLimit === "number" && Number.isSafeInteger(requestedCandidateLimit) && requestedCandidateLimit > 0 ? requestedCandidateLimit : null;
  const wide = { ...f, limit: candidateLimit === null ? WIDE_LIMIT : candidateLimit + 1 };
  const listedCandidates = listAll(fs, wide);
  const candidatesTruncated = candidateLimit !== null && listedCandidates.length > candidateLimit;
  const candidates = candidateLimit === null ? listedCandidates : listedCandidates.slice(0, candidateLimit);
  const childIndex = includeChildren ? buildChildIndex(candidates) : /* @__PURE__ */ new Map();
  const candidateIds = new Set(candidates.map((s) => s.id));
  const isAbsorbedChild = (s) => includeChildren && s.parent_id != null && candidateIds.has(s.parent_id);
  const matches = [];
  for (const s of candidates) {
    if (isAbsorbedChild(s))
      continue;
    const hit = includeChildren ? searchSessionWithChildren(fs, s, kw, childIndex) : searchSession(fs, s, kw);
    if (hit.count === 0)
      continue;
    matches.push({ session: s, hit, score: relevanceScore(hit), descendantsMerged: (childIndex.get(s.id) ?? []).length });
  }
  matches.sort((a, b) => b.score - a.score || b.hit.count - a.hit.count || recencyDesc(a.session, b.session));
  const warnings = [];
  if (candidatesTruncated) {
    warnings.push({
      code: "candidate-limit-reached",
      message: `Only the ${candidateLimit} most recent sessions were searched.`
    });
  }
  return { matches: matches.slice(0, f.limit), totalMatches: matches.length, warnings };
}

// packages/kernel/dist/mem/relatedSearch.js
var RELATED_SESSION_SEARCH_BUDGETS = Object.freeze({
  queryMinChars: 2,
  queryMaxChars: 128,
  queryMaxTokens: 8,
  candidates: 100,
  results: 8,
  perFileBytes: 2 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  excerptChars: 320,
  titleChars: 160
});
var PLATFORMS = /* @__PURE__ */ new Set(["all", "claude", "codex", "opencode", "pi"]);
var RelatedSessionSearchInputError = class extends Error {
  reason;
  constructor(reason) {
    super(`invalid related-session search input: ${reason}`);
    this.reason = reason;
    this.name = "RelatedSessionSearchInputError";
  }
};
function addWarning(state, warning) {
  if (state.warningCodes.has(warning.code))
    return;
  state.warningCodes.add(warning.code);
  state.warnings.push(warning);
}
function budgetedFs(source, state) {
  const cache = /* @__PURE__ */ new Map();
  const sourceEnv = source.env;
  const boundedRead = (path7, maxBytes) => {
    if (source.readTextBounded)
      return source.readTextBounded(path7, maxBytes);
    const raw = source.readText(path7);
    if (raw === void 0)
      return void 0;
    addWarning(state, {
      code: "bounded-read-unavailable",
      message: "A session source could not prove a read-layer byte ceiling."
    });
    const bytes = Buffer.from(raw);
    const selected = bytes.subarray(0, maxBytes);
    return {
      text: selected.toString("utf8"),
      bytesRead: selected.byteLength,
      truncated: selected.byteLength < bytes.byteLength
    };
  };
  return {
    home: source.home,
    exists: (path7) => source.exists(path7),
    readDir: (path7) => source.readDir(path7),
    readText: (path7) => {
      if (cache.has(path7))
        return cache.get(path7);
      const remaining = RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead;
      if (remaining <= 0) {
        addWarning(state, {
          code: "total-read-budget-exhausted",
          message: "The total session-read budget was exhausted."
        });
        cache.set(path7, void 0);
        return void 0;
      }
      const maxBytes = Math.min(RELATED_SESSION_SEARCH_BUDGETS.perFileBytes, remaining);
      const read = boundedRead(path7, maxBytes);
      if (!read) {
        if (source.exists(path7)) {
          addWarning(state, {
            code: "file-read-unavailable",
            message: "A session source could not be read."
          });
        }
        cache.set(path7, void 0);
        return void 0;
      }
      const bytesRead = Math.min(maxBytes, Math.max(0, Math.trunc(read.bytesRead)));
      state.bytesRead += bytesRead;
      const textBytes = Buffer.from(read.text);
      const text2 = textBytes.subarray(0, maxBytes).toString("utf8");
      if (read.truncated) {
        if (maxBytes < RELATED_SESSION_SEARCH_BUDGETS.perFileBytes) {
          addWarning(state, {
            code: "total-read-budget-exhausted",
            message: "The total session-read budget was exhausted."
          });
        } else {
          addWarning(state, {
            code: "file-read-truncated",
            message: "At least one session exceeded the per-file read budget."
          });
        }
      }
      cache.set(path7, text2);
      return text2;
    },
    mtimeMs: (path7) => source.mtimeMs(path7),
    env: sourceEnv ? (name) => sourceEnv(name) : void 0,
    contentReadBudget: {
      perSourceBytes: RELATED_SESSION_SEARCH_BUDGETS.perFileBytes,
      remainingBytes: () => RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead,
      consume: (bytes) => {
        const remaining = RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead;
        state.bytesRead += Math.min(remaining, Math.max(0, Math.trunc(bytes)));
      },
      claimCandidate: () => {
        if (state.candidatesClaimed >= RELATED_SESSION_SEARCH_BUDGETS.candidates)
          return false;
        state.candidatesClaimed += 1;
        return true;
      },
      noteCandidateLimitReached: () => addWarning(state, {
        code: "candidate-limit-reached",
        message: `Only the ${RELATED_SESSION_SEARCH_BUDGETS.candidates} most recent session sources were inspected.`
      }),
      noteSourceUnavailable: (source2) => addWarning(state, {
        code: `${source2}-reader-unavailable`,
        message: `The ${source2} session source could not be read.`
      }),
      noteSourceTruncated: () => addWarning(state, {
        code: "file-read-truncated",
        message: "At least one session exceeded the per-file read budget."
      }),
      noteTotalExhausted: () => addWarning(state, {
        code: "total-read-budget-exhausted",
        message: "The total session-read budget was exhausted."
      })
    }
  };
}
function validateOptions(options) {
  const query = typeof options.query === "string" ? options.query.trim() : "";
  const queryLength = Array.from(query).length;
  if (queryLength < RELATED_SESSION_SEARCH_BUDGETS.queryMinChars || queryLength > RELATED_SESSION_SEARCH_BUDGETS.queryMaxChars) {
    throw new RelatedSessionSearchInputError("query-length");
  }
  if (query.split(/\s+/).filter(Boolean).length > RELATED_SESSION_SEARCH_BUDGETS.queryMaxTokens) {
    throw new RelatedSessionSearchInputError("query-token-count");
  }
  if (!PLATFORMS.has(options.platform)) {
    throw new RelatedSessionSearchInputError("invalid-platform");
  }
  return { query, platform: options.platform };
}
function boundedDisplayText(raw, maxChars) {
  if (typeof raw !== "string")
    return null;
  const normalized2 = raw.replace(/\s+/g, " ").trim();
  if (!normalized2)
    return null;
  const chars = Array.from(normalized2);
  if (chars.length <= maxChars)
    return normalized2;
  return chars.slice(0, maxChars - 1).join("").trimEnd() + "\u2026";
}
function searchRelatedSessions(fs, options) {
  const { query, platform } = validateOptions(options);
  const state = {
    bytesRead: 0,
    candidatesClaimed: 0,
    warnings: [],
    warningCodes: /* @__PURE__ */ new Set()
  };
  const scopedFs = budgetedFs(fs, state);
  const search = searchMemSessions(scopedFs, {
    keyword: query,
    filter: {
      cwd: options.root,
      platform,
      limit: RELATED_SESSION_SEARCH_BUDGETS.candidates
    },
    includeChildren: true,
    candidateLimit: RELATED_SESSION_SEARCH_BUDGETS.candidates
  });
  for (const warning of search.warnings)
    addWarning(state, warning);
  const matches = [];
  for (const match of search.matches) {
    if (match.hit.userCount <= 0)
      continue;
    const userExcerpt = match.hit.excerpts.find((excerpt2) => excerpt2.role === "user");
    const excerpt = boundedDisplayText(userExcerpt?.snippet, RELATED_SESSION_SEARCH_BUDGETS.excerptChars);
    if (!excerpt)
      continue;
    const totalTurns = match.hit.totalTurns;
    matches.push({
      platform: match.session.platform,
      sessionId: match.session.id,
      title: boundedDisplayText(match.session.title, RELATED_SESSION_SEARCH_BUDGETS.titleChars),
      updatedAt: match.session.updated ?? null,
      score: totalTurns > 0 ? 3 * match.hit.userCount / totalTurns : 0,
      hitCount: match.hit.userCount,
      excerpt,
      descendantsMerged: match.descendantsMerged
    });
  }
  matches.sort((a, b) => {
    const relevance = b.score - a.score || b.hitCount - a.hitCount;
    if (relevance !== 0)
      return relevance;
    const aUpdated = a.updatedAt ?? "";
    const bUpdated = b.updatedAt ?? "";
    return aUpdated < bUpdated ? 1 : aUpdated > bUpdated ? -1 : 0;
  });
  return {
    query,
    platform,
    partial: state.warnings.length > 0,
    warnings: state.warnings,
    matches: matches.slice(0, RELATED_SESSION_SEARCH_BUDGETS.results)
  };
}

// packages/kernel/dist/loops/registry.js
import { readFileSync as readFileSync10 } from "node:fs";
import { join as join19 } from "node:path";
var KEY_RE3 = /^([A-Za-z_][\w.-]*):(?:\s+(.*)|\s*)$/;
function tokenize2(text2) {
  const tokens = [];
  for (const rawLine of text2.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "")
      continue;
    const trimmedStart = line.replace(/^\s*/, "");
    if (trimmedStart.startsWith("#"))
      continue;
    const indent = line.length - trimmedStart.length;
    const content = trimmedStart;
    if (content === "-" || content.startsWith("- ")) {
      const dashRest = content.slice(1);
      const after = dashRest.replace(/^\s*/, "");
      const itemCol = indent + 1 + (dashRest.length - after.length);
      tokens.push({ indent, kind: "dash" });
      if (after !== "") {
        const km2 = after.match(KEY_RE3);
        if (km2)
          tokens.push({ indent: itemCol, kind: "kv", key: required(km2[1]), rest: km2[2] ?? "" });
        else
          tokens.push({ indent: itemCol, kind: "scalar", raw: after });
      }
      continue;
    }
    const km = content.match(KEY_RE3);
    if (km) {
      tokens.push({ indent, kind: "kv", key: required(km[1]), rest: km[2] ?? "" });
    } else {
      tokens.push({ indent, kind: "scalar", raw: content });
    }
  }
  return tokens;
}
var YamlParseError = class extends Error {
};
function parseScalar(raw) {
  let s = raw.trim();
  if (!(s.startsWith('"') || s.startsWith("'") || s.startsWith("["))) {
    const cm = s.match(/^(.*?)\s+#.*$/);
    if (cm)
      s = required(cm[1]).trimEnd();
  }
  if (s === "")
    return null;
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "")
      return [];
    return inner.split(",").map((x) => parseScalar(x));
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2)
    return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    return s.slice(1, -1);
  if (s === "null" || s === "~")
    return null;
  if (s === "true")
    return true;
  if (s === "false")
    return false;
  if (/^-?\d+$/.test(s))
    return Number(s);
  return s;
}
function parseMapping2(tokens, start, indent) {
  const map = {};
  let i = start;
  while (i < tokens.length && required(tokens[i]).indent === indent && required(tokens[i]).kind === "kv") {
    const t = required(tokens[i]);
    i++;
    if ((t.rest ?? "") === "") {
      if (i < tokens.length && required(tokens[i]).indent > indent) {
        const r = parseValue(tokens, i, required(tokens[i]).indent);
        map[required(t.key)] = r.value;
        i = r.next;
      } else {
        map[required(t.key)] = null;
      }
    } else {
      map[required(t.key)] = parseScalar(required(t.rest));
    }
  }
  return { value: map, next: i };
}
function parseSequence2(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length && required(tokens[i]).indent === indent && required(tokens[i]).kind === "dash") {
    i++;
    if (i < tokens.length && required(tokens[i]).indent > indent) {
      const r = parseValue(tokens, i, required(tokens[i]).indent);
      arr.push(r.value);
      i = r.next;
    } else {
      arr.push(null);
    }
  }
  return { value: arr, next: i };
}
function parseValue(tokens, i, indent) {
  const t = required(tokens[i]);
  if (t.kind === "dash")
    return parseSequence2(tokens, i, indent);
  if (t.kind === "kv")
    return parseMapping2(tokens, i, indent);
  return { value: parseScalar(required(t.raw)), next: i + 1 };
}
function parseLoopsYaml(text2) {
  try {
    const tokens = tokenize2(text2);
    if (tokens.length === 0)
      return { data: null, error: "\u7A7A\u6587\u6863\uFF08\u65E0\u5185\u5BB9\uFF09" };
    const first = required(tokens[0]);
    if (first.indent !== 0)
      throw new YamlParseError(`\u9876\u5C42\u610F\u5916\u7F29\u8FDB\uFF08\u7B2C\u4E00\u4E2A token indent=${first.indent}\uFF09`);
    let result;
    if (first.kind === "kv")
      result = parseMapping2(tokens, 0, 0);
    else if (first.kind === "dash")
      result = parseSequence2(tokens, 0, 0);
    else
      throw new YamlParseError("\u9876\u5C42\u5FC5\u987B\u662F mapping \u6216 sequence\uFF08\u5F97\u5230\u88F8\u6807\u91CF\uFF09");
    if (result.next !== tokens.length) {
      throw new YamlParseError(`\u6B8B\u7559\u672A\u89E3\u6790\u5185\u5BB9\uFF08\u81EA token #${result.next}\uFF0C\u7F29\u8FDB\u4E0D\u4E00\u81F4\u6216\u5B50\u96C6\u5916\u7ED3\u6784\uFF09`);
    }
    return { data: result.value, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set(["$schema", "$comment", "$id", "title", "description"]);
var VALIDATION_KEYWORDS = /* @__PURE__ */ new Set([
  "type",
  "required",
  "additionalProperties",
  "enum",
  "pattern",
  "minLength",
  "minItems",
  "minimum",
  "const",
  "properties",
  "items"
]);
function joinPath(path7, key) {
  return path7 === "" ? key : `${path7}.${key}`;
}
function typeMatches(instance, typeSpec) {
  const types = Array.isArray(typeSpec) ? typeSpec : [typeSpec];
  for (const t of types) {
    if (t === "object" && instance !== null && typeof instance === "object" && !Array.isArray(instance))
      return true;
    if (t === "array" && Array.isArray(instance))
      return true;
    if (t === "string" && typeof instance === "string")
      return true;
    if (t === "integer" && typeof instance === "number" && Number.isInteger(instance))
      return true;
    if (t === "number" && typeof instance === "number")
      return true;
    if (t === "boolean" && typeof instance === "boolean")
      return true;
    if (t === "null" && instance === null)
      return true;
  }
  return false;
}
function validateSchema(instance, schema, path7 = "") {
  if (typeof schema !== "object" || schema === null)
    return [];
  for (const kw of Object.keys(schema)) {
    if (!ANNOTATION_KEYWORDS.has(kw) && !VALIDATION_KEYWORDS.has(kw)) {
      throw new Error(`loops validator: unsupported schema keyword '${kw}' at ${path7 || "<root>"}`);
    }
  }
  const label = path7 || "<root>";
  const errors = [];
  if ("const" in schema) {
    if (instance !== schema.const) {
      errors.push(`${label}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`);
      return errors;
    }
  }
  if ("type" in schema) {
    if (!typeMatches(instance, schema.type)) {
      errors.push(`${label}: expected type ${JSON.stringify(schema.type)}, got ${instance === null ? "null" : typeof instance}`);
      return errors;
    }
  }
  if ("enum" in schema && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(instance)) {
      errors.push(`${label}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(instance)}`);
    }
  }
  if ("pattern" in schema && typeof instance === "string") {
    if (!new RegExp(schema.pattern).test(instance)) {
      errors.push(`${label}: does not match pattern ${JSON.stringify(schema.pattern)}`);
    }
  }
  if ("minLength" in schema && typeof instance === "string") {
    if (instance.length < schema.minLength) {
      errors.push(`${label}: expected minLength ${schema.minLength}, got length ${instance.length}`);
    }
  }
  if ("minItems" in schema && Array.isArray(instance)) {
    if (instance.length < schema.minItems) {
      errors.push(`${label}: expected minItems ${schema.minItems}, got ${instance.length}`);
    }
  }
  if ("minimum" in schema && typeof instance === "number") {
    if (instance < schema.minimum) {
      errors.push(`${label}: expected >= ${schema.minimum}, got ${instance}`);
    }
  }
  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    const obj = instance;
    const props = schema.properties ?? {};
    for (const req of schema.required ?? []) {
      if (!(req in obj))
        errors.push(`${joinPath(path7, req)}: missing required field`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props))
          errors.push(`${joinPath(path7, key)}: unexpected additional field (not in schema)`);
      }
    }
    for (const [key, subschema] of Object.entries(props)) {
      if (key in obj)
        errors.push(...validateSchema(obj[key], subschema, joinPath(path7, key)));
    }
  }
  if (Array.isArray(instance) && "items" in schema) {
    const itemSchema = schema.items;
    instance.forEach((item2, idx) => errors.push(...validateSchema(item2, itemSchema, `${path7}[${idx}]`)));
  }
  return errors;
}
var SKILL_BUNDLE_ID_RE = new RegExp(`^_all$|${TRACK_ID_RE.source}`);
var SAFE_KEBAB_TOKEN_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
var LOOPS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["version", "loops"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    loops: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "id",
          "name",
          "kind",
          "goal",
          "cadence",
          "risk",
          "runner",
          "change_prefix",
          "phases",
          "human_gates",
          "design_doc",
          "status",
          "budget",
          "kill_criteria"
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          name: { type: "string", minLength: 3 },
          kind: { type: "string", enum: ["orchestrator", "executor"] },
          goal: { type: "string", minLength: 10 },
          cadence: { type: "string", pattern: "^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          runner: { type: "string", minLength: 2 },
          change_prefix: { type: ["string", "null"] },
          phases: { type: "array", minItems: 2, items: { type: "string" } },
          human_gates: { type: "array", minItems: 1, items: { type: "string" } },
          // H9 legacy import only. New writers omit this field; iteration state is projected from ledger facts.
          state: { type: "string", minLength: 2 },
          design_doc: { type: "string", minLength: 2 },
          status: { type: "string", enum: ["active", "paused", "retired"] },
          budget: {
            type: "object",
            required: ["max_runs_per_day", "max_in_flight", "on_exceed"],
            additionalProperties: false,
            properties: {
              max_runs_per_day: { type: "integer", minimum: 1 },
              max_in_flight: { type: "integer", minimum: 0 },
              on_exceed: { type: "string", minLength: 2 },
              // #36 token 级预算（可选，向后兼容——旧登记表不含即无 token 预算/熔断）：
              max_tokens_per_day: { type: "integer", minimum: 1 },
              tokens_per_run: { type: "integer", minimum: 1 }
            }
          },
          kill_criteria: { type: "array", minItems: 1, items: { type: "string" } },
          // 本轮新增：分级放权级别（可选；缺省 L1 由 loadRegistry 派生填充）。
          autonomy_level: { type: "string", enum: ["L1", "L2", "L3"] },
          // v5 决议 #12：路径 glob 白/黑名单（可选，缺省 [] 由 loadRegistry 派生填充；
          // denylist 运行时消费见 automation/lifecycle/denylist.ts）。
          allowlist: { type: "array", items: { type: "string" } },
          denylist: { type: "array", items: { type: "string" } },
          // H11 starter provenance/binding（均可选，旧登记表保持兼容；template catalog 存在性不在本层）。
          template_id: { type: "string", minLength: 1, pattern: SAFE_KEBAB_TOKEN_RE.source },
          template_version: { const: 1 },
          workflow_id: { type: "string", minLength: 1, pattern: SAFE_KEBAB_TOKEN_RE.source },
          // H10 §1：skill bundle 引用（可选；缺席/null 由 loadRegistry 派生归一化为 null=unwired）。
          // 非空须过 SKILL_BUNDLE_ID_RE 词法；profile 是否被 manifest 真声明是存在性语义校验，不在此 schema。
          skill_bundle_id: { type: ["string", "null"], pattern: SKILL_BUNDLE_ID_RE.source }
        }
      }
    }
  }
};
var RegistryReadError = class extends Error {
  _tag = "RegistryReadError";
  constructor(message) {
    super(message);
    this.name = "RegistryReadError";
  }
};
var nodeLoopIo = {
  readText: (p) => {
    try {
      return readFileSync10(p, "utf8");
    } catch {
      return null;
    }
  }
};
var nodeLoopIoStrict = {
  readText: (p) => {
    try {
      return readFileSync10(p, "utf8");
    } catch (e) {
      if (e.code === "ENOENT")
        return null;
      throw new RegistryReadError(`loops.yaml \u8BFB\u5931\u8D25\uFF08${e.code ?? "IO"}\uFF09\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  }
};
var LOOPS_REL_PATH = [".pipeline", "loops.yaml"];
function deriveRegistry(data) {
  const errors = validateSchema(data, LOOPS_SCHEMA);
  if (!isValidatedLoopRegistry(data, errors)) {
    throw new Error(`validated loop registry expected: ${errors.join("; ")}`);
  }
  const loops = data.loops.map((loop) => ({
    ...loop,
    autonomy_level: loop.autonomy_level ?? "L1",
    allowlist: loop.allowlist ?? [],
    denylist: loop.denylist ?? [],
    skill_bundle_id: loop.skill_bundle_id ?? null
  }));
  return { version: 1, loops };
}
function isValidatedLoopRegistry(value, errors) {
  return errors.length === 0;
}
function loadRegistry(repoRoot, io = nodeLoopIo) {
  const text2 = io.readText(join19(repoRoot, ...LOOPS_REL_PATH));
  if (text2 === null)
    return { data: null, errors: [] };
  const { data, error } = parseLoopsYaml(text2);
  if (error !== null)
    return { data: null, errors: [`loops.yaml: ${error}`] };
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { data: null, errors: ["<root>: loops.yaml \u9876\u5C42\u5FC5\u987B\u662F mapping\uFF08\u5BF9\u8C61\uFF09"] };
  }
  const errors = validateSchema(data, LOOPS_SCHEMA);
  if (errors.length > 0)
    return { data: null, errors };
  return { data: deriveRegistry(data), errors: [] };
}

// packages/kernel/dist/loops/enforce.js
var FAIL_STREAK_WARN = 2;
var CADENCE_RE = /^(\d+)([mhd])$/;
var CADENCE_UNIT_MINUTES = { m: 1, h: 60, d: 1440 };
function cadenceMinutes(cadence) {
  if (cadence === "continuous")
    return null;
  const upper = cadence.split("-").pop() ?? cadence;
  const m = upper.match(CADENCE_RE);
  if (!m)
    return null;
  return Number(required(m[1])) * required(CADENCE_UNIT_MINUTES[required(m[2])]);
}
function budgetWarnThreshold(maxRuns) {
  return Math.ceil(maxRuns * 4 / 5);
}
function enforcementFor(level) {
  return level === "L1" ? "report-only" : level === "L2" ? "assisted" : "unattended";
}

// packages/kernel/dist/loops/budget.js
var TS_FULL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TS_SHORT_RE = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TOKENS_RE = /tokens=(\d+)/;
function mkUTC(y, mo, d, hh, mm) {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm)
    return null;
  return dt;
}
function parseTimestamp(raw, now) {
  const s = raw.trim();
  const full = s.match(TS_FULL_RE);
  if (full)
    return mkUTC(+required(full[1]), +required(full[2]), +required(full[3]), +required(full[4]), +required(full[5]));
  const short = s.match(TS_SHORT_RE);
  if (short)
    return mkUTC(now.getUTCFullYear(), +required(short[1]), +required(short[2]), +required(short[3]), +required(short[4]));
  return null;
}
function sameUTCDate(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function sumRunLogTokens(text2, loopId, now) {
  if (text2 === null)
    return { spentToday: 0, runsToday: 0 };
  let spentToday = 0;
  let runsToday = 0;
  for (const rawLine of text2.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2)
      continue;
    if (cols[1] !== loopId)
      continue;
    const ts = parseTimestamp(required(cols[0]), now);
    if (ts === null || !sameUTCDate(ts, now))
      continue;
    runsToday++;
    const tm = line.match(TOKENS_RE);
    if (tm)
      spentToday += Number(tm[1]);
  }
  return { spentToday, runsToday };
}
function computeBudgetStatus(loop, runLogText, now) {
  const { spentToday, runsToday } = sumRunLogTokens(runLogText, loop.id, now);
  const budget = loop.budget;
  const max = budget.max_tokens_per_day ?? null;
  const reportOnly = loop.autonomy_level === "L1";
  if (max === null) {
    return {
      id: loop.id,
      hasBudget: false,
      maxTokensPerDay: null,
      warnThreshold: null,
      spentToday,
      remaining: null,
      usedRatio: null,
      runsToday,
      breaker: "ok",
      onExceed: budget.on_exceed,
      autonomyLevel: loop.autonomy_level,
      reportOnly,
      reason: `\u672A\u58F0\u660E max_tokens_per_day \u2014\u2014 \u65E0 token \u9884\u7B97/\u7194\u65AD\uFF08\u4EC5\u8FFD\u8E2A\u4ECA\u65E5\u82B1\u8D39 ${spentToday}\uFF09`
    };
  }
  const warnThreshold = budgetWarnThreshold(max);
  let breaker;
  let reason;
  if (spentToday >= max) {
    breaker = "tripped";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} \u2265 \u9884\u7B97 ${max}\uFF08circuit breaker \u7194\u65AD\u89E6\u53D1\uFF09`;
  } else if (spentToday >= warnThreshold) {
    breaker = "warn";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} \u2265 \u51CF\u901F\u7EBF ${warnThreshold}\uFF0880% of ${max}\uFF09`;
  } else {
    breaker = "ok";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} < \u51CF\u901F\u7EBF ${warnThreshold}\uFF08\u9884\u7B97 ${max}\uFF09`;
  }
  return {
    id: loop.id,
    hasBudget: true,
    maxTokensPerDay: max,
    warnThreshold,
    spentToday,
    remaining: Math.max(0, max - spentToday),
    usedRatio: spentToday / max,
    runsToday,
    breaker,
    onExceed: budget.on_exceed,
    autonomyLevel: loop.autonomy_level,
    reportOnly,
    reason
  };
}

// packages/kernel/dist/loops/drift.js
var DRIFT_CADENCE_MULTIPLIER = 2;
var READY_STRONG = 90;
var READY_THRESHOLD = 70;
var TS_FULL_RE2 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TS_SHORT_RE2 = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var ID_RE = /^[a-z][a-z0-9-]*$/;
var CHANGE_RE = /change=([A-Za-z0-9._-]+)/g;
var DOC_HEADING_RE = /^###\s+.*?`([a-z][a-z0-9-]*)`/;
function mkUTC2(y, mo, d, hh, mm) {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm)
    return null;
  return dt;
}
function parseTimestamp2(raw, now) {
  const s = raw.trim();
  const full = s.match(TS_FULL_RE2);
  if (full)
    return mkUTC2(+required(full[1]), +required(full[2]), +required(full[3]), +required(full[4]), +required(full[5]));
  const short = s.match(TS_SHORT_RE2);
  if (short)
    return mkUTC2(now.getUTCFullYear(), +required(short[1]), +required(short[2]), +required(short[3]), +required(short[4]));
  return null;
}
function sameUTCDate2(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function extractDocLoopIds(docText) {
  if (docText === null)
    return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const rawLine of docText.split("\n")) {
    const m = rawLine.match(DOC_HEADING_RE);
    if (m) {
      const id = required(m[1]);
      if (seen.has(id))
        continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
function parseRunLog(text2, now) {
  const map = /* @__PURE__ */ new Map();
  if (text2 === null)
    return map;
  for (const rawLine of text2.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2)
      continue;
    const ts = parseTimestamp2(required(cols[0]), now);
    if (ts === null)
      continue;
    const id = required(cols[1]);
    if (!ID_RE.test(id))
      continue;
    let f = map.get(id);
    if (!f) {
      f = { runs: 0, runsToday: 0, lastRunAt: null, changeRefs: [] };
      map.set(id, f);
    }
    f.runs++;
    if (sameUTCDate2(ts, now))
      f.runsToday++;
    if (f.lastRunAt === null || ts.getTime() > f.lastRunAt.getTime())
      f.lastRunAt = ts;
    for (const cm of line.matchAll(CHANGE_RE))
      f.changeRefs.push(required(cm[1]));
  }
  return map;
}
function detectDrift(registry, docText, runLogText, now) {
  const items = [];
  const regIds = new Set(registry.loops.map((l) => l.id));
  const runFacts = parseRunLog(runLogText, now);
  if (docText === null) {
    items.push({
      loop: "*",
      dimension: "mirror-missing",
      severity: "warn",
      detail: "LOOP.md \u7F3A\u5931\u2014\u2014\u65E0\u4EBA\u7C7B\u53EF\u8BFB\u955C\u50CF",
      suggestion: "\u521B\u5EFA\u4ED3\u6839 LOOP.md\uFF0C\u5E76\u4E3A\u6BCF\u4E2A registry loop \u5199\u4E00\u8282\uFF08### `id`\uFF09"
    });
  } else {
    const docIds = new Set(extractDocLoopIds(docText));
    for (const l of registry.loops) {
      if (!docIds.has(l.id)) {
        items.push({
          loop: l.id,
          dimension: "mirror-missing",
          severity: "warn",
          detail: `registry loop ${l.id} \u672A\u5728 LOOP.md \u63D0\u53CA`,
          suggestion: `\u5728 LOOP.md \u8865\u4E00\u8282 ### \`${l.id}\`\uFF0C\u540C\u6B65\u58F0\u660E\u534F\u8BAE\uFF08TestLoopMdMirror \u53E3\u5F84\uFF09`
        });
      }
    }
    for (const docId of docIds) {
      if (!regIds.has(docId)) {
        items.push({
          loop: docId,
          dimension: "mirror-orphan",
          severity: "warn",
          detail: `LOOP.md \u58F0\u660E\u7684 loop ${docId} \u4E0D\u5728 registry`,
          suggestion: `\u5220\u9664 LOOP.md \u4E2D ${docId} \u4E00\u8282\uFF0C\u6216\u8865\u56DE .pipeline/loops.yaml \u767B\u8BB0`
        });
      }
    }
  }
  for (const [runId] of runFacts) {
    if (!regIds.has(runId)) {
      items.push({
        loop: runId,
        dimension: "runlog-orphan-id",
        severity: "warn",
        detail: `run-log \u8BB0\u5F55\u4E86\u672A\u767B\u8BB0\u7684 loop ${runId}`,
        suggestion: `\u767B\u8BB0 ${runId} \u8FDB .pipeline/loops.yaml\uFF0C\u6216\u6838\u5BF9\u6D41\u6C34\u5F52\u5C5E\u5217\u662F\u5426\u5199\u9519`
      });
    }
  }
  for (const l of registry.loops) {
    const facts = runFacts.get(l.id) ?? null;
    const cadenceMin = cadenceMinutes(l.cadence);
    if (l.status === "active" && cadenceMin !== null) {
      if (facts === null || facts.runs === 0) {
        items.push({
          loop: l.id,
          dimension: "never-run",
          severity: "warn",
          detail: `\u58F0\u660E active \u6BCF ${l.cadence} \u4F46 run-log \u65E0\u4EFB\u4F55\u6267\u884C\u8BB0\u5F55`,
          suggestion: `\u786E\u8BA4 loop \u662F\u5426\u5DF2\u542F\u52A8\uFF1B\u82E5\u5DF2\u505C\u7528\u5E94\u6539 status=paused/retired`
        });
      } else if (facts.lastRunAt !== null) {
        const gap = (now.getTime() - facts.lastRunAt.getTime()) / 6e4;
        const threshold = DRIFT_CADENCE_MULTIPLIER * cadenceMin;
        if (gap > threshold) {
          const missed = Math.floor(gap / cadenceMin);
          items.push({
            loop: l.id,
            dimension: "cadence-idle",
            severity: "warn",
            detail: `\u58F0\u660E cadence ${l.cadence}\uFF08${cadenceMin}m\uFF09\u4F46\u8DDD\u4E0A\u6B21\u6267\u884C ${Math.trunc(gap)}m\uFF08>${Math.trunc(threshold)}m\uFF0C\u7EA6\u6F0F ${missed} \u8F6E\uFF09`,
            suggestion: `loop \u843D\u540E\u4E8E\u58F0\u660E\u8282\u594F\uFF0C\u68C0\u67E5\u8C03\u5EA6\u5668/\u7F16\u6392\u4F1A\u8BDD\u662F\u5426\u505C\u6446`
          });
        }
      }
    }
    if (l.change_prefix !== null && l.change_prefix !== "" && facts !== null) {
      const changePrefix = required(l.change_prefix);
      const mismatched = [...new Set(facts.changeRefs.filter((c) => !c.startsWith(changePrefix)))];
      if (mismatched.length > 0) {
        items.push({
          loop: l.id,
          dimension: "change-prefix",
          severity: "warn",
          detail: `run-log change \u540D [${mismatched.join(", ")}] \u4E0D\u5339\u914D\u58F0\u660E change_prefix=${l.change_prefix}`,
          suggestion: `\u6838\u5BF9\u8FD9\u4E9B change \u7684\u5F52\u5C5E\uFF0C\u6216\u66F4\u6B63 loop \u7684 change_prefix`
        });
      }
    }
    if ((l.status === "paused" || l.status === "retired") && facts !== null && facts.runsToday > 0) {
      items.push({
        loop: l.id,
        dimension: "status-drift",
        severity: "warn",
        detail: `status=${l.status} \u4F46\u4ECA\u65E5\u4ECD\u6709 ${facts.runsToday} \u6B21\u6267\u884C\u8BB0\u5F55`,
        suggestion: `\u505C\u7528\u7684 loop \u4E0D\u5E94\u7EE7\u7EED\u6267\u884C\uFF1B\u68C0\u67E5\u8C03\u5EA6\u5668\u662F\u5426\u5FFD\u7565\u4E86 kill switch`
      });
    }
  }
  return {
    version: 1,
    generated_at: now.toISOString().slice(0, 16),
    clean: items.every((i) => i.severity !== "warn"),
    checked: registry.loops.map((l) => l.id),
    items
  };
}
function dim(name, score, max, suggestion) {
  return { name, score, max, suggestion: score >= max ? null : suggestion };
}
function computeReadiness(loop) {
  const dims = [];
  const goalLen = (loop.goal ?? "").trim().length;
  const goalScore = goalLen >= 30 ? 20 : goalLen >= 10 ? 12 : goalLen > 0 ? 6 : 0;
  dims.push(dim("goal", goalScore, 20, `goal \u5E94\u5199\u660E\u53EF\u6536\u655B\u7684\u660E\u786E\u76EE\u6807\uFF08\u5F53\u524D ${goalLen} \u5B57\u7B26\uFF0C\u5EFA\u8BAE \u226530\uFF09`));
  const killN = (loop.kill_criteria ?? []).length;
  dims.push(dim("kill_criteria", killN >= 2 ? 20 : killN === 1 ? 12 : 0, 20, `\u8865\u5145 kill/\u7EC8\u6B62\u5224\u636E\uFF08\u5F53\u524D ${killN} \u6761\uFF0C\u5EFA\u8BAE \u22652\uFF1A\u5982\u7A7A\u8F6E\u6536\u655B + \u8FDE\u8D25\u7194\u65AD\uFF09`));
  const gateN = (loop.human_gates ?? []).length;
  dims.push(dim("human_gates", gateN >= 2 ? 20 : gateN === 1 ? 12 : 0, 20, `\u8865\u5145 human gate \u4EBA\u5DE5\u95E8\uFF08\u5F53\u524D ${gateN} \u6761\uFF0C\u5EFA\u8BAE \u22652\uFF1A\u5982\u7834\u574F\u6027\u53D8\u66F4 + push/\u5408\u5E76\uFF09`));
  const b = loop.budget;
  const hasBase = !!b && typeof b.max_runs_per_day === "number" && b.max_runs_per_day >= 1 && typeof b.max_in_flight === "number";
  const hasToken = !!b && typeof b.max_tokens_per_day === "number";
  const budgetScore = (hasBase ? 10 : 0) + (hasToken ? 5 : 0);
  dims.push(dim("budget", budgetScore, 15, hasBase ? "\u58F0\u660E budget.max_tokens_per_day \u4EE5\u542F\u7528 token circuit breaker \u7194\u65AD\uFF08#36\uFF09" : "\u8865 budget.max_runs_per_day / max_in_flight \u8D44\u6E90\u4E0A\u9650"));
  const cadenceMin = cadenceMinutes(loop.cadence ?? "");
  const isContinuous = loop.cadence === "continuous";
  const cadenceScore = cadenceMin !== null ? 10 : isContinuous ? 6 : 0;
  dims.push(dim("cadence", cadenceScore, 10, isContinuous ? "continuous cadence \u65E0\u6CD5\u4F30\u7B97\u6BCF\u65E5\u6210\u672C\u2014\u2014\u82E5\u975E\u5E38\u9A7B\u6267\u884C\u5668\uFF0C\u8003\u8651\u8BBE\u6709\u9650 cadence" : "\u58F0\u660E\u53EF\u8C03\u5EA6\u7684\u6709\u9650 cadence\uFF08\u5982 1h / 30m\uFF09"));
  const hasPrefix = typeof loop.change_prefix === "string" && loop.change_prefix.trim() !== "";
  dims.push(dim("change_prefix", hasPrefix ? 5 : 0, 5, "\u58F0\u660E change_prefix \u4EE5\u9694\u79BB\u672C loop \u4EA7\u51FA\u7684 change\uFF08\u4FBF\u4E8E\u5728\u9014\u8BA1\u6570/\u5F52\u5C5E\u5BF9\u8D26\uFF09"));
  const hasDoc = (loop.design_doc ?? "").trim().length >= 2;
  dims.push(dim("observability", hasDoc ? 10 : 0, 10, "\u8865 design_doc\uFF08\u8BBE\u8BA1\u6587\u6863\uFF09\uFF1Biteration runtime state \u7531 ledger audit facts \u6295\u5F71"));
  const score = dims.reduce((a, d) => a + d.score, 0);
  const band = score >= READY_STRONG ? "ready" : score >= READY_THRESHOLD ? "mostly-ready" : "not-ready";
  const suggestions = dims.filter((d) => d.suggestion !== null).map((d) => `[${d.name}] ${d.suggestion}`);
  return { id: loop.id, score, band, dimensions: dims, suggestions };
}

// packages/kernel/dist/loops/types.js
var LOOP_RUNNERS = ["claude-code", "codex"];
function isLoopRunner(value) {
  return typeof value === "string" && LOOP_RUNNERS.includes(value);
}
function assertLoopRunner(value) {
  if (!isLoopRunner(value)) {
    throw new Error(`runner \u975E\u6CD5\u300C${String(value)}\u300D\uFF1A\u4EC5\u5141\u8BB8 ${LOOP_RUNNERS.join(" / ")}\uFF0C\u62D2\u7EDD\u9690\u5F0F\u964D\u7EA7\u6267\u884C`);
  }
  return value;
}

// packages/kernel/dist/loops/yamlBlock.js
function indentOf4(line) {
  return line.length - line.replace(/^\s*/, "").length;
}
function locateLoop(lines, loopId) {
  const idRe = /^(\s*)-(\s+)id:\s+(.+?)\s*(?:#.*)?$/;
  for (let i = 0; i < lines.length; i++) {
    const m = required(lines[i]).match(idRe);
    if (!m || required(m[3]).trim() !== loopId)
      continue;
    const dashIndent = required(m[1]).length;
    const fieldIndent = dashIndent + 1 + required(m[2]).length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = required(lines[j]);
      if (line.trim() === "")
        continue;
      if (indentOf4(line) <= dashIndent) {
        end = j;
        break;
      }
    }
    return { start: i, end, dashIndent, fieldIndent };
  }
  return null;
}
function insertPointAtBlockEnd(lines, start, end) {
  for (let i = end - 1; i > start; i--) {
    if (required(lines[i]).trim() !== "")
      return i + 1;
  }
  return end;
}

// packages/kernel/dist/loops/graduation.js
var MIN_L2_RUNS_FOR_L3 = 5;
var ORDER = ["L1", "L2", "L3"];
function nextUp(level) {
  return required(ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)]);
}
function nextDown(level) {
  return required(ORDER[Math.max(ORDER.indexOf(level) - 1, 0)]);
}
var HIST_TS_RE = /^(?:\d{4}-)?\d{2}-\d{2}T\d{2}:\d{2}$/;
var HIST_RESULT_RE = /result=(ok|fail|dry|skip)/;
function parseRunHistory(text2, loopId) {
  if (text2 === null)
    return { runs: 0, failStreak: 0, lastResult: null };
  const results = [];
  for (const rawLine of text2.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2 || cols[1] !== loopId)
      continue;
    if (!HIST_TS_RE.test(required(cols[0])))
      continue;
    const rm4 = line.match(HIST_RESULT_RE);
    results.push(rm4 ? rm4[1] : null);
  }
  let failStreak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === "fail")
      failStreak++;
    else
      break;
  }
  return {
    runs: results.length,
    failStreak,
    lastResult: results.length > 0 ? results[results.length - 1] : null
  };
}
function decideGraduation(inp) {
  const current = inp.loop.autonomy_level;
  const activeDrift = inp.drift.filter((d) => d.severity === "warn");
  const driftCount = activeDrift.length;
  const breaker = inp.budget.breaker;
  const failStreak = inp.history.failStreak;
  const runs = inp.history.runs;
  const score = inp.readiness.score;
  const demotionSignals = [];
  if (breaker === "tripped")
    demotionSignals.push("circuit breaker tripped\uFF08\u4ECA\u65E5 token \u82B1\u8D39\u8D85\u9884\u7B97\uFF0C#36 \u7194\u65AD\uFF09");
  if (failStreak >= FAIL_STREAK_WARN)
    demotionSignals.push(`\u8FDE\u8D25 fail_streak=${failStreak}\uFF08\u2265${FAIL_STREAK_WARN} \u9884\u8B66\u7EBF\uFF09`);
  if (driftCount > 0)
    demotionSignals.push(`${driftCount} \u9879\u6D3B\u8DC3\u6F02\u79FB\uFF08\u58F0\u660E vs \u5B9E\u9645\u4E0D\u4E00\u81F4\uFF0C#37\uFF09`);
  const canDemote = current !== "L1" && demotionSignals.length > 0;
  const blockers = [];
  if (current === "L3") {
    blockers.push("\u5DF2\u5728\u6700\u9AD8\u81EA\u6CBB\u6863 L3\uFF08unattended\uFF09\u2014\u2014\u65E0\u66F4\u9AD8\u6863\u53EF\u5347");
  } else {
    const target = nextUp(current);
    const minScore = current === "L1" ? READY_THRESHOLD : READY_STRONG;
    if (score < minScore)
      blockers.push(`loop-ready ${score} < ${minScore}\uFF08\u5347 ${target} \u9700\u5C31\u7EEA\u5EA6 \u2265${minScore}\uFF0C#37\uFF09`);
    if (driftCount > 0)
      blockers.push(`${driftCount} \u9879\u6D3B\u8DC3\u6F02\u79FB\u672A\u6E05\uFF08\u5347\u6863\u524D\u987B\u65E0\u6F02\u79FB\uFF0C#37\uFF09`);
    if (breaker === "tripped")
      blockers.push("circuit breaker tripped\uFF08\u7194\u65AD\u4E2D\u4E0D\u5F97\u5347\u6863\uFF0C#36\uFF09");
    else if (breaker === "warn")
      blockers.push("token \u82B1\u8D39 \u226580% \u51CF\u901F\u7EBF\uFF08\u63A5\u8FD1\u9884\u7B97\u4E0D\u5F97\u5347\u6863\uFF0C#36\uFF09");
    if (failStreak > 0)
      blockers.push(`\u8FDE\u8D25\u4E2D fail_streak=${failStreak}\uFF08\u5347\u6863\u524D\u987B\u65E0\u5931\u8D25\uFF09`);
    if (target === "L3" && runs < MIN_L2_RUNS_FOR_L3) {
      blockers.push(`L2 \u8FD0\u884C\u5386\u53F2\u4E0D\u8DB3\uFF08${runs}/${MIN_L2_RUNS_FOR_L3} \u8F6E\uFF09\u2014\u2014\u5347 L3 \u9700 \u2265${MIN_L2_RUNS_FOR_L3} \u8F6E\u65E0\u5931\u8D25`);
    }
  }
  const canGraduate = !canDemote && current !== "L3" && blockers.length === 0;
  let recommended = current;
  let demotionReason = null;
  if (canDemote) {
    recommended = nextDown(current);
    demotionReason = demotionSignals.join("\uFF1B");
  } else if (canGraduate) {
    recommended = nextUp(current);
  }
  return {
    id: inp.loop.id,
    current,
    recommended,
    enforcement: enforcementFor(current),
    canGraduate,
    blockers,
    demotionReason,
    demotionSignals,
    readinessScore: score,
    readinessBand: inp.readiness.band,
    driftCount,
    breaker,
    failStreak,
    runs
  };
}
function planLevelChange(current, target, verdict) {
  const base = { id: verdict.id, from: current };
  if (!ORDER.includes(target)) {
    return { ...base, to: null, kind: "reject-unknown-level", allowed: false, reason: `\u672A\u77E5\u76EE\u6807\u6863 '${target}'\uFF08\u652F\u6301 L1/L2/L3\uFF09`, blockers: [] };
  }
  const to = target;
  const ci = ORDER.indexOf(current);
  const ti = ORDER.indexOf(to);
  if (ti === ci) {
    return { ...base, to, kind: "noop", allowed: false, reason: `\u5DF2\u5728 ${current}\uFF0C\u65E0\u9700\u6539\u6863`, blockers: [] };
  }
  if (ti < ci) {
    return { ...base, to, kind: "demote", allowed: true, reason: `\u5B89\u5168\u964D\u6863 ${current} \u2192 ${to}\uFF08\u964D\u4F4E\u81EA\u6CBB\u603B\u5141\u8BB8\uFF09`, blockers: [] };
  }
  if (ti - ci > 1) {
    return {
      ...base,
      to: null,
      kind: "reject-cross-level",
      allowed: false,
      reason: `\u8DE8\u7EA7\u5347\u6863\u88AB\u62D2\uFF1A${current} \u2192 ${to}\uFF08\u4E00\u6B65\u8DE8 ${ti - ci} \u7EA7\uFF09\u3002\u5206\u7EA7\u653E\u6743\u987B\u9010\u7EA7\u6BD5\u4E1A\uFF1A\u5148\u5347 ${nextUp(current)}`,
      blockers: []
    };
  }
  if (!verdict.canGraduate) {
    return { ...base, to: null, kind: "reject-blocked", allowed: false, reason: `\u5347 ${to} \u51C6\u5165\u672A\u901A\u8FC7`, blockers: verdict.blockers };
  }
  return { ...base, to, kind: "promote", allowed: true, reason: `\u9010\u7EA7\u6BD5\u4E1A ${current} \u2192 ${to}`, blockers: [] };
}
function setAutonomyLevelInYaml(text2, loopId, level) {
  const lines = text2.split("\n");
  const block = locateLoop(lines, loopId);
  if (block === null)
    return { text: null, error: `loop '${loopId}' \u672A\u5728 loops.yaml \u627E\u5230\uFF08\u65E0\u6CD5\u6539\u6863\uFF09` };
  const levelRe = /^(\s*)autonomy_level:\s*.*$/;
  for (let i = block.start; i < block.end; i++) {
    const m = required(lines[i]).match(levelRe);
    if (m) {
      lines[i] = `${m[1]}autonomy_level: ${level}`;
      return { text: lines.join("\n"), error: null };
    }
  }
  lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, `${" ".repeat(block.dashIndent + 2)}autonomy_level: ${level}`);
  return { text: lines.join("\n"), error: null };
}
function gatherInputs(loop, registry, runLog, doc, now) {
  const driftAll = detectDrift(registry, doc, runLog, now);
  return {
    loop,
    readiness: computeReadiness(loop),
    drift: driftAll.items.filter((i) => i.loop === loop.id),
    budget: computeBudgetStatus(loop, runLog, now),
    history: parseRunHistory(runLog, loop.id)
  };
}
function buildGraduationReport(repoRoot, onlyLoop, now, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { report: null, errors, exitCode: 3 };
  if (data === null)
    return { report: null, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  if (onlyLoop !== null && !data.loops.some((l) => l.id === onlyLoop)) {
    return { report: null, errors: [`\u672A\u77E5 --loop id: ${onlyLoop}`], exitCode: 3 };
  }
  const runLog = fs.readRunLog(repoRoot);
  const doc = fs.readLoopDoc(repoRoot);
  const loops = onlyLoop === null ? data.loops : data.loops.filter((l) => l.id === onlyLoop);
  const verdicts = loops.map((l) => decideGraduation(gatherInputs(l, data, runLog, doc, now)));
  const code = verdicts.some((v) => v.demotionReason !== null) ? 2 : verdicts.some((v) => v.canGraduate) ? 1 : 0;
  return { report: { version: 1, generated_at: now.toISOString().slice(0, 16), verdicts }, errors: [], exitCode: code };
}
async function applyLevelChange(repoRoot, loopId, target, opts, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { plan: null, verdict: null, applied: false, errors, exitCode: 3 };
  if (data === null)
    return { plan: null, verdict: null, applied: false, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  const loop = data.loops.find((l) => l.id === loopId);
  if (!loop)
    return { plan: null, verdict: null, applied: false, errors: [`\u672A\u77E5 loop id: ${loopId}`], exitCode: 3 };
  const verdict = decideGraduation(gatherInputs(loop, data, fs.readRunLog(repoRoot), fs.readLoopDoc(repoRoot), opts.now));
  const plan = planLevelChange(loop.autonomy_level, target, verdict);
  if (plan.kind === "noop")
    return { plan, verdict, applied: false, errors: [], exitCode: 0 };
  if (!plan.allowed)
    return { plan, verdict, applied: false, errors: [plan.reason, ...plan.blockers], exitCode: 2 };
  if (!opts.confirm)
    return { plan, verdict, applied: false, errors: [], exitCode: 0 };
  const yamlPath = `${repoRoot}/.pipeline/loops.yaml`;
  const snap = await fs.readRegistrySnapshot(repoRoot);
  if (snap === null) {
    return { plan, verdict, applied: false, errors: [`CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u6539\u6863\u5199\u56DE\u671F\u95F4\u88AB\u5220\u9664\uFF0C\u5DF2\u5982\u5B9E\u62D2\u7EDD\uFF08\u672A\u843D\u76D8\uFF0C${yamlPath}\uFF09`], exitCode: 3 };
  }
  const res = await fs.writeRegistryGoverned(repoRoot, snap.epoch, (cur) => setAutonomyLevelInYaml(cur, loopId, required(plan.to ?? void 0)));
  if (!res.ok) {
    return {
      plan,
      verdict,
      applied: false,
      errors: [`CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u6539\u6863\u5199\u56DE\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539\uFF0C\u5DF2\u5982\u5B9E\u62D2\u7EDD\uFF08\u672A\u843D\u76D8\uFF0C${yamlPath}\uFF09${res.error ? `\uFF1A${res.error}` : ""}`],
      exitCode: 3
    };
  }
  return { plan, verdict, applied: true, errors: [], exitCode: 0 };
}

// packages/kernel/dist/loops/drafts.js
import { readFileSync as readFileSync11 } from "node:fs";
import { mkdir as mkdir10, rename as rename5, writeFile as writeFile7 } from "node:fs/promises";
import { dirname as dirname4, join as join20 } from "node:path";
var DRAFT_MARKS_FILE = "loops.drafts.json";
function draftMarksPath(repoRoot) {
  return join20(repoRoot, ".pipeline", DRAFT_MARKS_FILE);
}
function readDraftMarks(path7) {
  try {
    const data = JSON.parse(readFileSync11(path7, "utf8"));
    if (typeof data === "object" && data !== null && !Array.isArray(data) && data.version === 1 && Array.isArray(data.ids) && data.ids.every((x) => typeof x === "string")) {
      return [...data.ids];
    }
    return [];
  } catch {
    return [];
  }
}
var tmpSeq3 = 0;
async function writeDraftMarks(path7, ids) {
  await mkdir10(dirname4(path7), { recursive: true });
  const tmp = `${path7}.tmp.${process.pid}.${tmpSeq3++}`;
  await writeFile7(tmp, `${JSON.stringify({ version: 1, ids }, null, 2)}
`, "utf8");
  await rename5(tmp, path7);
}
async function clearDraftMark(path7, id) {
  const existing = readDraftMarks(path7);
  if (!existing.includes(id))
    return;
  await writeDraftMarks(path7, existing.filter((x) => x !== id));
}

// packages/kernel/dist/loops/update.js
var PATCHABLE_SCALAR_FIELDS = [
  "cadence",
  "goal",
  "design_doc",
  "change_prefix",
  "risk",
  "status",
  "runner",
  "skill_bundle_id"
];
var PATCHABLE_BUDGET_FIELDS = ["max_runs_per_day", "max_in_flight", "max_tokens_per_day", "on_exceed"];
var PATCHABLE_ARRAY_FIELDS = ["human_gates", "kill_criteria", "allowlist", "denylist"];
var ALL_PATCHABLE = [...PATCHABLE_SCALAR_FIELDS, ...PATCHABLE_BUDGET_FIELDS, ...PATCHABLE_ARRAY_FIELDS];
var CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
var PatchError = class extends Error {
};
function bareRoundtrips(s) {
  const { data, error } = parseLoopsYaml(`k: ${s}`);
  if (error !== null || data === null || typeof data !== "object" || Array.isArray(data))
    return false;
  return data.k === s;
}
var ITEM_KEY_LIKE_RE = /^[A-Za-z_][\w.-]*:(\s|$)/;
function formatString(s, field, asSeqItem) {
  if (CONTROL_CHAR_RE.test(s))
    throw new PatchError(`\u5B57\u6BB5 '${field}' \u542B\u6362\u884C/\u63A7\u5236\u5B57\u7B26\uFF0C\u65E0\u6CD5\u5199\u56DE loops.yaml`);
  if (bareRoundtrips(s) && !(asSeqItem && ITEM_KEY_LIKE_RE.test(s)))
    return s;
  if (s.includes('"'))
    throw new PatchError(`\u5B57\u6BB5 '${field}' \u542B\u53CC\u5F15\u53F7\uFF0C\u7A84 YAML \u65E0\u8F6C\u4E49\u8BED\u4E49\uFF0C\u65E0\u6CD5\u5B89\u5168\u5199\u56DE`);
  return `"${s}"`;
}
function formatScalar(v, field) {
  if (v === null)
    return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      throw new PatchError(`\u5B57\u6BB5 '${field}' \u987B\u4E3A\u6709\u9650\u6570\u5B57`);
    return String(v);
  }
  return formatString(v, field, false);
}
function findFieldLine(lines, from, to, indent, field) {
  const re = new RegExp(`^\\s{${indent}}${field}:(\\s|$)`);
  for (let i = from; i < to; i++) {
    if (re.test(required(lines[i])))
      return i;
  }
  return -1;
}
function patchTopScalar(lines, block, field, value) {
  const rendered = `${" ".repeat(block.fieldIndent)}${field}: ${formatScalar(value, field)}`;
  const at = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, field);
  if (at !== -1) {
    lines[at] = rendered;
  } else {
    lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, rendered);
  }
}
function patchBudgetScalar(lines, block, field, value) {
  const budgetAt = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, "budget");
  if (budgetAt === -1)
    throw new PatchError(`loop \u5757\u5185\u672A\u627E\u5230 budget: \u884C\uFF0C\u65E0\u6CD5 patch '${field}'`);
  let subEnd = block.end;
  for (let i = budgetAt + 1; i < block.end; i++) {
    const line = required(lines[i]);
    if (line.trim() === "")
      continue;
    if (indentOf4(line) <= block.fieldIndent) {
      subEnd = i;
      break;
    }
  }
  let childIndent = block.fieldIndent + 2;
  for (let i = budgetAt + 1; i < subEnd; i++) {
    if (required(lines[i]).trim() !== "") {
      childIndent = indentOf4(required(lines[i]));
      break;
    }
  }
  const rendered = `${" ".repeat(childIndent)}${field}: ${formatScalar(value, field)}`;
  const at = findFieldLine(lines, budgetAt + 1, subEnd, childIndent, field);
  if (at !== -1) {
    lines[at] = rendered;
  } else {
    lines.splice(insertPointAtBlockEnd(lines, budgetAt, subEnd), 0, rendered);
  }
}
function patchArray(lines, block, field, values) {
  const pad = " ".repeat(block.fieldIndent);
  const rendered = values.length === 0 ? [`${pad}${field}: []`] : [`${pad}${field}:`, ...values.map((v) => `${pad}  - ${formatString(v, field, true)}`)];
  const at = findFieldLine(lines, block.start + 1, block.end, block.fieldIndent, field);
  if (at === -1) {
    lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, ...rendered);
    return;
  }
  let extentEnd = block.end;
  for (let i = at + 1; i < block.end; i++) {
    const line = required(lines[i]);
    if (line.trim() === "")
      continue;
    if (indentOf4(line) <= block.fieldIndent) {
      extentEnd = i;
      break;
    }
  }
  while (extentEnd > at + 1 && required(lines[extentEnd - 1]).trim() === "")
    extentEnd--;
  lines.splice(at, extentEnd - at, ...rendered);
}
function checkedValue(field, value) {
  if (PATCHABLE_ARRAY_FIELDS.includes(field)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new PatchError(`\u5B57\u6BB5 '${field}' \u987B\u4E3A\u5B57\u7B26\u4E32\u6570\u7EC4`);
    }
    return value;
  }
  if (PATCHABLE_BUDGET_FIELDS.includes(field) && field !== "on_exceed") {
    if (typeof value !== "number")
      throw new PatchError(`\u5B57\u6BB5 '${field}' \u987B\u4E3A\u6570\u5B57`);
    return value;
  }
  if ((field === "change_prefix" || field === "skill_bundle_id") && value === null)
    return null;
  if (typeof value !== "string")
    throw new PatchError(`\u5B57\u6BB5 '${field}' \u987B\u4E3A\u5B57\u7B26\u4E32`);
  return value;
}
function updateLoopInYaml(text2, loopId, patch) {
  try {
    const fields = Object.keys(patch);
    if (fields.length === 0)
      throw new PatchError("patch \u4E3A\u7A7A\uFF08\u65E0\u5B57\u6BB5\u53EF\u6539\uFF09");
    for (const field of fields) {
      if (field === "autonomy_level") {
        throw new PatchError("autonomy_level \u4E0D\u7ECF\u672C\u624B\u672F\uFF08\u5347\u964D\u6863\u8D70\u6BD5\u4E1A\u5236\u88C1\u51B3\uFF1AapplyLevelChange / POST /api/loops/level\uFF09");
      }
      if (!ALL_PATCHABLE.includes(field)) {
        throw new PatchError(`\u5B57\u6BB5 '${field}' \u4E0D\u53EF patch\uFF08\u53EF\u6539\uFF1A${ALL_PATCHABLE.join(" / ")}\uFF09`);
      }
    }
    const lines = text2.split("\n");
    for (const field of fields) {
      const block = locateLoop(lines, loopId);
      if (block === null)
        throw new PatchError(`loop '${loopId}' \u672A\u5728 loops.yaml \u627E\u5230\uFF08\u672C\u624B\u672F\u4E0D\u65B0\u5EFA loop\uFF09`);
      const value = checkedValue(field, patch[field]);
      if (PATCHABLE_ARRAY_FIELDS.includes(field)) {
        patchArray(lines, block, field, value);
      } else if (PATCHABLE_BUDGET_FIELDS.includes(field)) {
        patchBudgetScalar(lines, block, field, value);
      } else {
        patchTopScalar(lines, block, field, value);
      }
    }
    return { text: lines.join("\n"), error: null };
  } catch (e) {
    if (e instanceof PatchError)
      return { text: null, error: e.message };
    throw e;
  }
}

// packages/kernel/dist/loops/binding.js
function budgetDayOf(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

// packages/kernel/dist/loops/ledger-projection.js
function indexReservationTerminals(records) {
  const reservationById = /* @__PURE__ */ new Map();
  const terminalByReservationId = /* @__PURE__ */ new Map();
  const duplicateReservations = [];
  const duplicateTerminals = [];
  const activatedReservationIds = /* @__PURE__ */ new Set();
  const invalidActivations = [];
  const invalidTerminals = [];
  for (const r of records) {
    if (r.kind === "budget-reservation") {
      const first = reservationById.get(r.reservation_id);
      if (first === void 0)
        reservationById.set(r.reservation_id, r);
      else
        duplicateReservations.push({
          reservationId: r.reservation_id,
          firstRecordId: first.record_id,
          duplicateRecordId: r.record_id
        });
    } else if (r.kind === "reservation-activated") {
      const reservation = reservationById.get(r.reservation_id);
      const reason = reservation === void 0 ? "orphan" : reservation.attempt_id !== r.attempt_id ? "attempt-mismatch" : reservation.iteration_id !== void 0 && r.iteration_id !== reservation.iteration_id ? "iteration-mismatch" : reservation.loop_id !== r.loop_id ? "loop-mismatch" : reservation.change !== r.change ? "change-mismatch" : activatedReservationIds.has(r.reservation_id) ? "duplicate" : null;
      if (reason === null)
        activatedReservationIds.add(r.reservation_id);
      else
        invalidActivations.push({ reservationId: r.reservation_id, recordId: r.record_id, reason });
    } else if (r.kind === "run" && r.reservation_id !== void 0) {
      const reservation = reservationById.get(r.reservation_id);
      const reason = reservation === void 0 ? "orphan" : reservation.attempt_id !== r.attempt_id ? "attempt-mismatch" : reservation.iteration_id !== void 0 && r.iteration_id !== reservation.iteration_id ? "iteration-mismatch" : reservation.loop_id !== r.loop_id ? "loop-mismatch" : reservation.change !== r.change ? "change-mismatch" : null;
      if (reason !== null) {
        invalidTerminals.push({ reservationId: r.reservation_id, recordId: r.run_record_id, reason });
        continue;
      }
      const first = terminalByReservationId.get(r.reservation_id);
      if (first === void 0)
        terminalByReservationId.set(r.reservation_id, r);
      else
        duplicateTerminals.push({ reservationId: r.reservation_id, firstRecordId: first.run_record_id, duplicateRecordId: r.run_record_id });
    }
  }
  return {
    reservationById,
    terminalByReservationId,
    duplicateReservations,
    duplicateTerminals,
    activatedReservationIds,
    invalidActivations,
    invalidTerminals
  };
}
function indexSkillBundleSnapshots(records) {
  const out = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (r.kind === "skill-bundle-snapshot" && !out.has(r.reservation_id))
      out.set(r.reservation_id, r);
  }
  return out;
}
function countsAsRun(reservation, terminal, activated) {
  void reservation;
  if (terminal === void 0)
    return true;
  if (activated)
    return true;
  if (terminal.reason === "claim-lost")
    return false;
  if (terminal.reason === "reservation-expired")
    return false;
  return terminal.accounting.charge_source !== "none";
}
function projectLoopLedger(records, rejectedCount, loopId, budgetDay) {
  const index = indexReservationTerminals(records);
  const { reservationById, terminalByReservationId, activatedReservationIds } = index;
  const openReservations = [];
  let inFlight = 0;
  let activatedInFlight = 0;
  let reservedTokensOutstanding = 0;
  for (const r of records) {
    if (r.kind !== "budget-reservation" || r.loop_id !== loopId)
      continue;
    if (reservationById.get(r.reservation_id) !== r)
      continue;
    const isOpen = !terminalByReservationId.has(r.reservation_id);
    if (isOpen) {
      inFlight++;
      openReservations.push(r);
      if (activatedReservationIds.has(r.reservation_id))
        activatedInFlight++;
      if (r.budget_day === budgetDay)
        reservedTokensOutstanding += r.reserved_tokens;
    }
  }
  let runsToday = 0;
  for (const [rid, reservation] of reservationById) {
    if (reservation.loop_id !== loopId || reservation.budget_day !== budgetDay)
      continue;
    if (countsAsRun(reservation, terminalByReservationId.get(rid), activatedReservationIds.has(rid)))
      runsToday++;
  }
  let settledTokensActual = 0;
  let settledTokensEstimated = 0;
  let lastResult;
  let lastFinishedAt;
  for (const r of records) {
    if (r.kind !== "run" || r.loop_id !== loopId)
      continue;
    if (r.reservation_id !== void 0 && terminalByReservationId.get(r.reservation_id) !== r)
      continue;
    lastResult = r.result;
    lastFinishedAt = r.finished_at;
    const day = r.reservation_id !== void 0 ? reservationById.get(r.reservation_id)?.budget_day ?? budgetDayOf(r.finished_at) : budgetDayOf(r.finished_at);
    if (day !== budgetDay)
      continue;
    if (r.accounting.charge_source === "provider-structured")
      settledTokensActual += r.accounting.charged_tokens;
    else if (r.accounting.charge_source === "reserved-estimate")
      settledTokensEstimated += r.accounting.charged_tokens;
  }
  const duplicateReservations = index.duplicateReservations.length;
  const duplicateTerminals = index.duplicateTerminals.length;
  const invalidActivations = index.invalidActivations.length;
  const invalidTerminals = index.invalidTerminals.length;
  return {
    loopId,
    budgetDay,
    runsToday,
    inFlight,
    activatedInFlight,
    reservedTokensOutstanding,
    settledTokensActual,
    settledTokensEstimated,
    lastResult,
    lastFinishedAt,
    openReservations,
    rejectedRecords: rejectedCount,
    duplicateReservations,
    duplicateTerminals,
    invalidActivations,
    invalidTerminals,
    health: rejectedCount > 0 || duplicateReservations > 0 || duplicateTerminals > 0 || invalidActivations > 0 || invalidTerminals > 0 ? "degraded" : "ok"
  };
}
function remainingTokens(projection, maxTokensPerDay) {
  if (maxTokensPerDay === void 0)
    return null;
  const used = projection.settledTokensActual + projection.settledTokensEstimated + projection.reservedTokensOutstanding;
  return Math.max(0, maxTokensPerDay - used);
}

// packages/kernel/dist/verification/validate.js
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function typeName(v) {
  if (v === null)
    return "null";
  if (Array.isArray(v))
    return "array";
  return typeof v;
}
function safeErrorText(value) {
  try {
    if (value instanceof Error) {
      const message = value.message;
      if (message.length > 0)
        return message;
    }
  } catch {
  }
  try {
    return String(value);
  } catch {
    return "<\u65E0\u6CD5\u5B89\u5168\u8BFB\u53D6\u5F02\u5E38\u4FE1\u606F>";
  }
}
function missing(o, key) {
  return !(key in o) || o[key] === void 0;
}
function checkNonEmptyStr(o, key, path7, errors, optional = false) {
  if (missing(o, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u975E\u7A7A string\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  if (v.length === 0)
    errors.push(`${path7}.${key}: \u4E0D\u5F97\u4E3A\u7A7A\u5B57\u7B26\u4E32`);
}
function checkLit(o, key, literal, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u5B57\u9762\u91CF ${JSON.stringify(literal)}\uFF09`);
    return;
  }
  if (o[key] !== literal)
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u5B57\u9762\u91CF ${JSON.stringify(literal)}\uFF0C\u5B9E\u5F97 ${JSON.stringify(o[key])}`);
}
function checkEnum(o, key, allowed, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u95ED\u96C6 ${allowed.join("|")}\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string" || !allowed.includes(v)) {
    errors.push(`${path7}.${key}: \u5E94\u5728\u95ED\u96C6 [${allowed.join("|")}] \u5185\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
}
function checkNonNegInt(o, key, path7, errors, optional = false) {
  if (missing(o, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u975E\u8D1F\u6574\u6570\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u975E\u8D1F\u6574\u6570\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
}
function checkInt(o, key, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u6574\u6570\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v))
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u6574\u6570\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
}
var SHA256_RE2 = /^[0-9a-f]{64}$/;
var GIT_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function checkSha256(o, key, path7, errors, optional = false) {
  if (missing(o, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B sha256\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  if (!SHA256_RE2.test(v))
    errors.push(`${path7}.${key}: \u5E94\u4E3A 64 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236 sha256\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
}
function checkGitSha(o, key, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B git SHA\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  if (!GIT_SHA_RE.test(v))
    errors.push(`${path7}.${key}: \u5E94\u4E3A 40 \u6216 64 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236 git SHA\uFF08\u5B8C\u6574\u5BF9\u8C61\u540D\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
}
function checkRepoRelPath(o, key, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u9879\u76EE\u76F8\u5BF9\u8DEF\u5F84\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  if (v.length === 0) {
    errors.push(`${path7}.${key}: \u4E0D\u5F97\u4E3A\u7A7A\u5B57\u7B26\u4E32`);
    return;
  }
  if (v.includes("\0")) {
    errors.push(`${path7}.${key}: \u7981 NUL \u5B57\u8282\uFF08git tree \u8DEF\u5F84\u4E0D\u53EF\u542B NUL\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
    return;
  }
  if (v.startsWith("/") || v.startsWith("\\") || /^[a-zA-Z]:/.test(v)) {
    errors.push(`${path7}.${key}: \u7981\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u987B\u9879\u76EE\u76F8\u5BF9\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
    return;
  }
  const segs = v.split(/[/\\]/);
  if (segs.some((seg) => seg === "..")) {
    errors.push(`${path7}.${key}: \u7981\u8DEF\u5F84\u9003\u9038 '..'\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
  if (segs.some((seg) => seg === ".")) {
    errors.push(`${path7}.${key}: \u7981 '.' \u8DEF\u5F84\u6BB5\uFF08git tree \u4E0D\u4EA7\u751F\u6B64\u5F62\u5F0F\uFF0C\u975E\u89C4\u8303\u8DEF\u5F84\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
  if (segs.some((seg) => seg.length === 0)) {
    errors.push(`${path7}.${key}: \u7981\u7A7A\u8DEF\u5F84\u6BB5\uFF08\u5F00\u5934/\u7ED3\u5C3E/\u8FDE\u7EED\u5206\u9694\u7B26\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
}
var ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
function checkIsoTimestamp(o, key, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B ISO-8601 \u65F6\u95F4\u6233\uFF09`);
    return;
  }
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  if (!ISO_TIMESTAMP_RE.test(v) || Number.isNaN(Date.parse(v))) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A ISO-8601 \u65F6\u95F4\u6233\uFF08\u5982 2026-07-18T00:00:00.000Z\uFF09\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}`);
  }
}
function subjectRevisionSha(subject) {
  const revision = subject.revision;
  if (!isObj(revision))
    return void 0;
  const sha = revision.sha;
  return typeof sha === "string" ? sha : void 0;
}
function subObj(o, key, path7, errors) {
  if (missing(o, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u5BF9\u8C61\uFF09`);
    return null;
  }
  const v = o[key];
  if (!isObj(v)) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u5BF9\u8C61\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return null;
  }
  return v;
}
var VERDICTS = ["passed", "failed", "inconclusive"];
var BINDING_KINDS = ["workflow-transition", "default-transition", "runtime-verifier"];
var ISSUER_KINDS = ["host-verifier", "human-review", "sandbox-report"];
var EVIDENCE_KINDS = ["repo-file", "command-result"];
function validateSubject(o, path7, errors) {
  checkNonEmptyStr(o, "workflow_run_id", path7, errors);
  checkNonEmptyStr(o, "attempt_id", path7, errors);
  checkNonEmptyStr(o, "change", path7, errors);
  const rev = subObj(o, "revision", path7, errors);
  if (rev !== null) {
    const rp = `${path7}.revision`;
    checkLit(rev, "kind", "named-branch-head", rp, errors);
    checkGitSha(rev, "sha", rp, errors);
  }
}
function validateBinding(o, path7, errors) {
  switch (o.kind) {
    case "workflow-transition":
      checkNonEmptyStr(o, "workflow_digest", path7, errors);
      checkNonEmptyStr(o, "workflow", path7, errors);
      checkNonEmptyStr(o, "step", path7, errors);
      checkNonEmptyStr(o, "event", path7, errors);
      checkNonNegInt(o, "guard_index", path7, errors, true);
      checkNonNegInt(o, "action_index", path7, errors, true);
      break;
    case "default-transition":
      checkNonEmptyStr(o, "event", path7, errors);
      break;
    case "runtime-verifier":
      checkNonEmptyStr(o, "verifier", path7, errors);
      checkNonEmptyStr(o, "version", path7, errors);
      break;
    default:
      errors.push(`${path7}.kind: \u5E94\u5728\u95ED\u96C6 [${BINDING_KINDS.join("|")}] \u5185\uFF0C\u5B9E\u5F97 ${JSON.stringify(o.kind)}`);
  }
}
function validateIssuer(o, path7, errors) {
  switch (o.kind) {
    case "host-verifier":
      checkNonEmptyStr(o, "verifier", path7, errors);
      checkNonEmptyStr(o, "version", path7, errors);
      checkLit(o, "trusted", true, path7, errors);
      break;
    case "human-review":
      checkNonEmptyStr(o, "actor_id", path7, errors);
      checkLit(o, "trusted", true, path7, errors);
      break;
    case "sandbox-report":
      checkNonEmptyStr(o, "runner", path7, errors);
      checkLit(o, "trusted", false, path7, errors);
      break;
    default:
      errors.push(`${path7}.kind: \u5E94\u5728\u95ED\u96C6 [${ISSUER_KINDS.join("|")}] \u5185\uFF0C\u5B9E\u5F97 ${JSON.stringify(o.kind)}`);
  }
}
function validateEvidenceRef(v, path7, errors) {
  if (!isObj(v)) {
    errors.push(`${path7}: \u5E94\u4E3A\u5BF9\u8C61\uFF0C\u5B9E\u5F97 ${typeName(v)}`);
    return;
  }
  switch (v.kind) {
    case "repo-file":
      checkRepoRelPath(v, "path", path7, errors);
      checkSha256(v, "sha256", path7, errors);
      checkGitSha(v, "revision_sha", path7, errors);
      break;
    case "command-result":
      checkNonEmptyStr(v, "command_id", path7, errors);
      checkInt(v, "exit_code", path7, errors);
      checkSha256(v, "stdout_sha256", path7, errors, true);
      checkSha256(v, "stderr_sha256", path7, errors, true);
      break;
    default:
      errors.push(`${path7}.kind: \u5E94\u5728\u95ED\u96C6 [${EVIDENCE_KINDS.join("|")}] \u5185\uFF0C\u5B9E\u5F97 ${JSON.stringify(v.kind)}`);
  }
}
function extractEvidenceItem(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const kind = raw.kind;
  if (kind !== void 0)
    out.kind = kind;
  switch (kind) {
    case "repo-file": {
      const path7 = raw.path;
      if (path7 !== void 0)
        out.path = path7;
      const sha256 = raw.sha256;
      if (sha256 !== void 0)
        out.sha256 = sha256;
      const revision_sha = raw.revision_sha;
      if (revision_sha !== void 0)
        out.revision_sha = revision_sha;
      break;
    }
    case "command-result": {
      const command_id = raw.command_id;
      if (command_id !== void 0)
        out.command_id = command_id;
      const exit_code = raw.exit_code;
      if (exit_code !== void 0)
        out.exit_code = exit_code;
      const stdout_sha256 = raw.stdout_sha256;
      if (stdout_sha256 !== void 0)
        out.stdout_sha256 = stdout_sha256;
      const stderr_sha256 = raw.stderr_sha256;
      if (stderr_sha256 !== void 0)
        out.stderr_sha256 = stderr_sha256;
      break;
    }
    default:
      break;
  }
  return out;
}
function extractEvidenceArray(raw) {
  if (!Array.isArray(raw))
    return raw;
  const rawLength = raw.length;
  const length = Number.isInteger(rawLength) && rawLength >= 0 ? rawLength : 0;
  const out = [];
  for (let i = 0; i < length; i++)
    out.push(extractEvidenceItem(raw[i]));
  return out;
}
function extractRevision(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const kind = raw.kind;
  if (kind !== void 0)
    out.kind = kind;
  const sha = raw.sha;
  if (sha !== void 0)
    out.sha = sha;
  return out;
}
function extractSubject(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const workflow_run_id = raw.workflow_run_id;
  if (workflow_run_id !== void 0)
    out.workflow_run_id = workflow_run_id;
  const attempt_id = raw.attempt_id;
  if (attempt_id !== void 0)
    out.attempt_id = attempt_id;
  const change = raw.change;
  if (change !== void 0)
    out.change = change;
  const revision = raw.revision;
  if (revision !== void 0)
    out.revision = extractRevision(revision);
  return out;
}
function extractBinding(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const kind = raw.kind;
  if (kind !== void 0)
    out.kind = kind;
  switch (kind) {
    case "workflow-transition": {
      const workflow_digest = raw.workflow_digest;
      if (workflow_digest !== void 0)
        out.workflow_digest = workflow_digest;
      const workflow = raw.workflow;
      if (workflow !== void 0)
        out.workflow = workflow;
      const step = raw.step;
      if (step !== void 0)
        out.step = step;
      const event = raw.event;
      if (event !== void 0)
        out.event = event;
      const guard_index = raw.guard_index;
      if (guard_index !== void 0)
        out.guard_index = guard_index;
      const action_index = raw.action_index;
      if (action_index !== void 0)
        out.action_index = action_index;
      break;
    }
    case "default-transition": {
      const event = raw.event;
      if (event !== void 0)
        out.event = event;
      break;
    }
    case "runtime-verifier": {
      const verifier = raw.verifier;
      if (verifier !== void 0)
        out.verifier = verifier;
      const version = raw.version;
      if (version !== void 0)
        out.version = version;
      break;
    }
    default:
      break;
  }
  return out;
}
function extractIssuer(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const kind = raw.kind;
  if (kind !== void 0)
    out.kind = kind;
  switch (kind) {
    case "host-verifier": {
      const verifier = raw.verifier;
      if (verifier !== void 0)
        out.verifier = verifier;
      const version = raw.version;
      if (version !== void 0)
        out.version = version;
      const trusted = raw.trusted;
      if (trusted !== void 0)
        out.trusted = trusted;
      break;
    }
    case "human-review": {
      const actor_id = raw.actor_id;
      if (actor_id !== void 0)
        out.actor_id = actor_id;
      const trusted = raw.trusted;
      if (trusted !== void 0)
        out.trusted = trusted;
      break;
    }
    case "sandbox-report": {
      const runner = raw.runner;
      if (runner !== void 0)
        out.runner = runner;
      const trusted = raw.trusted;
      if (trusted !== void 0)
        out.trusted = trusted;
      break;
    }
    default:
      break;
  }
  return out;
}
function extractAutomationPolicy(raw) {
  if (!isObj(raw))
    return raw;
  const out = {};
  const policy_id = raw.policy_id;
  if (policy_id !== void 0)
    out.policy_id = policy_id;
  const policy_version = raw.policy_version;
  if (policy_version !== void 0)
    out.policy_version = policy_version;
  const goal_sha256 = raw.goal_sha256;
  if (goal_sha256 !== void 0)
    out.goal_sha256 = goal_sha256;
  return out;
}
function extractTopLevel(raw) {
  const out = {};
  const schema_version = raw.schema_version;
  if (schema_version !== void 0)
    out.schema_version = schema_version;
  const verification_id = raw.verification_id;
  if (verification_id !== void 0)
    out.verification_id = verification_id;
  const evaluated_at = raw.evaluated_at;
  if (evaluated_at !== void 0)
    out.evaluated_at = evaluated_at;
  const verdict = raw.verdict;
  if (verdict !== void 0)
    out.verdict = verdict;
  const subject = raw.subject;
  if (subject !== void 0)
    out.subject = extractSubject(subject);
  const binding = raw.binding;
  if (binding !== void 0)
    out.binding = extractBinding(binding);
  const automation_policy = raw.automation_policy;
  if (automation_policy !== void 0)
    out.automation_policy = extractAutomationPolicy(automation_policy);
  const issuer = raw.issuer;
  if (issuer !== void 0)
    out.issuer = extractIssuer(issuer);
  const evidence = raw.evidence;
  if (evidence !== void 0)
    out.evidence = extractEvidenceArray(evidence);
  return out;
}
function snapshotVerificationResultFields(input) {
  if (!isObj(input))
    return input;
  return extractTopLevel(input);
}
function deepFreeze3(value) {
  if (value === null || typeof value !== "object")
    return value;
  if (!Object.isFrozen(value)) {
    const asObj = value;
    Object.freeze(asObj);
    for (const key of Object.keys(asObj))
      deepFreeze3(asObj[key]);
  }
  return value;
}
function sanitizeVerificationResultForEncode(input) {
  try {
    return snapshotVerificationResultFields(input);
  } catch (e) {
    return {
      __verification_unreadable__: true,
      __read_error__: safeErrorText(e)
    };
  }
}
function collectVerificationResultErrors(value, path7, errors) {
  if (!isObj(value)) {
    errors.push(`${path7}: \u5E94\u4E3A\u5BF9\u8C61\uFF0C\u5B9E\u5F97 ${typeName(value)}`);
    return;
  }
  checkLit(value, "schema_version", 1, path7, errors);
  checkNonEmptyStr(value, "verification_id", path7, errors);
  checkIsoTimestamp(value, "evaluated_at", path7, errors);
  checkEnum(value, "verdict", VERDICTS, path7, errors);
  const subject = subObj(value, "subject", path7, errors);
  if (subject !== null)
    validateSubject(subject, `${path7}.subject`, errors);
  const binding = subObj(value, "binding", path7, errors);
  if (binding !== null)
    validateBinding(binding, `${path7}.binding`, errors);
  if (!missing(value, "automation_policy")) {
    const policy = subObj(value, "automation_policy", path7, errors);
    if (policy !== null) {
      checkNonEmptyStr(policy, "policy_id", `${path7}.automation_policy`, errors);
      checkSha256(policy, "policy_version", `${path7}.automation_policy`, errors);
      checkSha256(policy, "goal_sha256", `${path7}.automation_policy`, errors);
    }
  }
  const issuer = subObj(value, "issuer", path7, errors);
  if (issuer !== null)
    validateIssuer(issuer, `${path7}.issuer`, errors);
  if (missing(value, "evidence")) {
    errors.push(`${path7}.evidence: \u7F3A\u5931\uFF08\u5FC5\u586B EvidenceRef[]\uFF09`);
  } else if (!Array.isArray(value.evidence)) {
    errors.push(`${path7}.evidence: \u5E94\u4E3A\u6570\u7EC4\uFF0C\u5B9E\u5F97 ${typeName(value.evidence)}`);
  } else {
    value.evidence.forEach((item2, i) => validateEvidenceRef(item2, `${path7}.evidence[${i}]`, errors));
    if (value.verdict === "passed" && value.evidence.length === 0) {
      errors.push(`${path7}.evidence: verdict=passed \u81F3\u5C11\u9700\u4E00\u6761 evidence`);
    }
    if (value.verdict === "passed" && subject !== null) {
      const subjectSha = subjectRevisionSha(subject);
      if (subjectSha !== void 0) {
        value.evidence.forEach((item2, i) => {
          if (isObj(item2) && item2.kind === "repo-file" && typeof item2.revision_sha === "string" && item2.revision_sha !== subjectSha) {
            errors.push(`${path7}.evidence[${i}].revision_sha: repo-file evidence \u5FC5\u987B\u7ED1\u5B9A subject.revision.sha\uFF08\u671F\u671B ${JSON.stringify(subjectSha)}\uFF0C\u5B9E\u5F97 ${JSON.stringify(item2.revision_sha)}\u2014\u2014\u65E7 revision \u7684\u8BC1\u636E\u4E0D\u5F97\u652F\u6491\u65B0 revision \u7684 passed\uFF09`);
          }
        });
      }
    }
  }
}
function validateVerificationResult(input, path7 = "verification") {
  let snapshot;
  try {
    snapshot = snapshotVerificationResultFields(input);
  } catch (e) {
    return {
      ok: false,
      errors: [`${path7}: \u8BFB\u53D6\u5B57\u6BB5\u65F6\u629B\u51FA\u5F02\u5E38\uFF08\u7591\u4F3C\u654C\u610F getter/Proxy trap\uFF09\uFF0C\u4E00\u5F8B\u5224\u5931\u8D25\uFF1A${safeErrorText(e)}`]
    };
  }
  const errors = [];
  try {
    collectVerificationResultErrors(snapshot, path7, errors);
  } catch (e) {
    return {
      ok: false,
      errors: [`${path7}: \u6821\u9A8C\u5B57\u6BB5\u65F6\u629B\u51FA\u5F02\u5E38\uFF0C\u4E00\u5F8B\u5224\u5931\u8D25\uFF1A${safeErrorText(e)}`]
    };
  }
  if (errors.length > 0)
    return { ok: false, errors };
  return { ok: true, value: deepFreeze3(snapshot) };
}

// packages/kernel/dist/loops/ledger-codec-primitives.js
function isObj2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function typeName2(value) {
  if (value === null)
    return "null";
  if (Array.isArray(value))
    return "array";
  return typeof value;
}
function missing2(value, key) {
  return !(key in value) || value[key] === void 0;
}
function checkStr(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B string\uFF09`);
    return;
  }
  if (typeof value[key] !== "string")
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName2(value[key])}`);
}
function checkNum(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B number\uFF09`);
    return;
  }
  if (typeof value[key] !== "number")
    errors.push(`${path7}.${key}: \u5E94\u4E3A number\uFF0C\u5B9E\u5F97 ${typeName2(value[key])}`);
}
function checkBool(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B boolean\uFF09`);
    return;
  }
  if (typeof value[key] !== "boolean")
    errors.push(`${path7}.${key}: \u5E94\u4E3A boolean\uFF0C\u5B9E\u5F97 ${typeName2(value[key])}`);
}
function checkKnownKeys(value, allowed, path7, errors) {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!known.has(key))
      errors.push(`${path7}.${key}: \u672A\u77E5\u5B57\u6BB5`);
  }
}
function checkEnum2(value, key, allowed, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\uFF0C\u95ED\u96C6 ${allowed.join("|")}\uFF09`);
    return;
  }
  const item2 = value[key];
  if (typeof item2 !== "string" || !allowed.includes(item2)) {
    errors.push(`${path7}.${key}: \u5E94\u5728\u95ED\u96C6 [${allowed.join("|")}] \u5185\uFF0C\u5B9E\u5F97 ${JSON.stringify(item2)}`);
  }
}
function checkLit2(value, key, literal, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u5B57\u9762\u91CF ${JSON.stringify(literal)}\uFF09`);
    return;
  }
  if (value[key] !== literal) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u5B57\u9762\u91CF ${JSON.stringify(literal)}\uFF0C\u5B9E\u5F97 ${JSON.stringify(value[key])}`);
  }
}
function checkStrArray(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B string[]\uFF09`);
    return;
  }
  const items = value[key];
  if (!Array.isArray(items)) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string[]\uFF0C\u5B9E\u5F97 ${typeName2(items)}`);
    return;
  }
  items.forEach((item2, index) => {
    if (typeof item2 !== "string")
      errors.push(`${path7}.${key}[${index}]: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName2(item2)}`);
  });
}
function subObj2(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u5BF9\u8C61\uFF09`);
    return null;
  }
  const child = value[key];
  if (!isObj2(child)) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u5BF9\u8C61\uFF0C\u5B9E\u5F97 ${typeName2(child)}`);
    return null;
  }
  return child;
}
var SHA256_HEX_RE = /^[0-9a-f]{64}$/;
function checkSha2562(value, key, path7, errors, optional = false) {
  if (missing2(value, key)) {
    if (!optional)
      errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B sha256\uFF09`);
    return;
  }
  const digest2 = value[key];
  if (typeof digest2 !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName2(digest2)}`);
    return;
  }
  if (!SHA256_HEX_RE.test(digest2)) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A 64 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236 sha256\uFF0C\u5B9E\u5F97 ${JSON.stringify(digest2)}`);
  }
}
function checkPattern(value, key, pattern, path7, errors) {
  if (missing2(value, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\uFF0C\u987B\u5339\u914D ${pattern.source}\uFF09`);
    return;
  }
  const item2 = value[key];
  if (typeof item2 !== "string") {
    errors.push(`${path7}.${key}: \u5E94\u4E3A string\uFF0C\u5B9E\u5F97 ${typeName2(item2)}`);
    return;
  }
  if (!pattern.test(item2))
    errors.push(`${path7}.${key}: \u4E0D\u5339\u914D\u8BCD\u6CD5 ${pattern.source}\uFF0C\u5B9E\u5F97 ${JSON.stringify(item2)}`);
}
function checkSlotArray(value, key, path7, errors) {
  if (missing2(value, key)) {
    errors.push(`${path7}.${key}: \u7F3A\u5931\uFF08\u5FC5\u586B\u6570\u7EC4\uFF0C\u5141\u8BB8\u4E3A\u7A7A\uFF09`);
    return;
  }
  const slots = value[key];
  if (!Array.isArray(slots)) {
    errors.push(`${path7}.${key}: \u5E94\u4E3A\u6570\u7EC4\uFF0C\u5B9E\u5F97 ${typeName2(slots)}`);
    return;
  }
  slots.forEach((item2, index) => {
    const itemPath = `${path7}.${key}[${index}]`;
    if (!isObj2(item2)) {
      errors.push(`${itemPath}: \u5E94\u4E3A\u5BF9\u8C61\uFF0C\u5B9E\u5F97 ${typeName2(item2)}`);
      return;
    }
    checkStr(item2, "token", itemPath, errors);
    checkStrArray(item2, "alternatives", itemPath, errors);
    checkStr(item2, "concrete_skill_id", itemPath, errors);
    checkSha2562(item2, "tree_sha256", itemPath, errors);
  });
}

// packages/kernel/dist/loops/ledger-codec.js
function encodeLedgerRecord(record2) {
  if (record2.kind !== "run" && record2.kind !== "merge-intent" || record2.verification === void 0) {
    return JSON.stringify(record2);
  }
  const sanitizedVerification = sanitizeVerificationResultForEncode(record2.verification);
  return JSON.stringify({ ...record2, verification: sanitizedVerification });
}
var BINDING_SOURCES = ["explicit", "longest-prefix"];
var TOKEN_BASES = ["budget.tokens_per_run", "risk-default"];
var EXCEED_ACTIONS2 = ["skip-run", "pause-loop", "halt-round"];
var LEVELS = ["L1", "L2", "L3"];
var RUN_RESULTS = ["merged", "paused", "conflict", "failed", "retry-queued", "skipped"];
var RUN_REASONS = [
  "completed",
  "host-sync-pending",
  "merge-journal-pending",
  "no-op",
  "verify-fail",
  "claim-lost",
  "admission-denied",
  "kill-switch",
  "cancelled",
  "infrastructure-error",
  "recovered",
  "reservation-expired",
  // H7 verifier Phase 2：settlement verification gate 的 fail-closed 诊断成因。
  "verification-missing",
  "verification-untrusted",
  "verification-inconclusive",
  "verification-subject-mismatch",
  // H7-S2（返工 r2 阻断4 custom fail-closed）：custom workflow 核验结果未真正落在 workflow-transition
  // binding 时的诊断成因。
  "verification-binding-unresolved",
  "verification-policy-mismatch",
  "automation-policy-bind-failed",
  // H10 §5/§8任务5：admission/prepareSkillBundle 的精确 fail-closed 诊断闭集（同构镜像
  // automation/admission/execution-context.ts::PreparationFailureReason；前两值 unwired/
  // profile-not-found 实践中只出现在 AdmissionDenial 自由 string，从不落 RunRecord，仍纳入本
  // 闭集只为与设计定稿 §5 十项闭集保持同一份字面量列表，见 ledger-types.ts::RunRecord.reason 头注）。
  "skill-bundle-unwired",
  "skill-bundle-profile-not-found",
  "skill-bundle-resolve-failed",
  "skill-bundle-skill-not-found",
  "skill-bundle-content-invalid",
  "skill-bundle-source-ambiguous",
  "skill-bundle-policy-changed",
  "skill-bundle-source-unstable",
  "skill-bundle-snapshot-io",
  "skill-bundle-snapshot-corrupt"
];
var CHARGE_SOURCES = ["provider-structured", "reserved-estimate", "none"];
var RESOLUTION_SOURCES = ["default", "custom"];
function validateBinding2(o, errors) {
  const p = "change-loop-binding";
  checkStr(o, "change", p, errors);
  checkStr(o, "loop_id", p, errors);
  checkEnum2(o, "source", BINDING_SOURCES, p, errors);
  checkStr(o, "supersedes_record_id", p, errors, true);
}
function validateReservation(o, errors) {
  const p = "budget-reservation";
  checkStr(o, "reservation_id", p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "iteration_id", p, errors, true);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "change", p, errors);
  checkStr(o, "budget_day", p, errors);
  checkLit2(o, "reserved_runs", 1, p, errors);
  checkNum(o, "reserved_tokens", p, errors);
  checkEnum2(o, "token_basis", TOKEN_BASES, p, errors);
  const limits = subObj2(o, "limits_snapshot", p, errors);
  if (limits !== null) {
    const lp = `${p}.limits_snapshot`;
    checkNum(limits, "max_runs_per_day", lp, errors);
    checkNum(limits, "max_in_flight", lp, errors);
    checkNum(limits, "max_tokens_per_day", lp, errors, true);
    checkEnum2(limits, "on_exceed", EXCEED_ACTIONS2, lp, errors);
  }
  const context = subObj2(o, "attempt_context", p, errors, true);
  if (context !== null) {
    const cp = `${p}.attempt_context`;
    checkKnownKeys(context, ["source_run_record_ids", "omitted_attempt_ids", "rendered", "stagnation"], cp, errors);
    checkStrArray(context, "source_run_record_ids", cp, errors);
    checkStrArray(context, "omitted_attempt_ids", cp, errors);
    checkStr(context, "rendered", cp, errors);
    const stagnation = subObj2(context, "stagnation", cp, errors);
    if (stagnation !== null) {
      const sp = `${cp}.stagnation`;
      checkKnownKeys(stagnation, ["stagnant", "fingerprint", "repeated_attempt_ids"], sp, errors);
      checkBool(stagnation, "stagnant", sp, errors);
      checkSha2562(stagnation, "fingerprint", sp, errors, true);
      checkStrArray(stagnation, "repeated_attempt_ids", sp, errors);
    }
  }
  checkStr(o, "expires_at", p, errors);
}
function validateSkillBundleSnapshot(o, errors) {
  const p = "skill-bundle-snapshot";
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "reservation_id", p, errors);
  checkStr(o, "loop_id", p, errors);
  checkPattern(o, "skill_bundle_id", SKILL_BUNDLE_ID_RE, p, errors);
  checkStr(o, "policy_epoch", p, errors);
  checkEnum2(o, "resolution_source", RESOLUTION_SOURCES, p, errors);
  checkStr(o, "workflow_run_id", p, errors);
  checkStr(o, "workflow", p, errors);
  checkStr(o, "step", p, errors);
  checkStr(o, "track", p, errors);
  checkSha2562(o, "coordinate_digest", p, errors);
  checkSha2562(o, "snapshot_sha256", p, errors);
  checkStr(o, "cas_relative_path", p, errors);
  checkSlotArray(o, "slots", p, errors);
}
function validateActivated(o, errors) {
  const p = "reservation-activated";
  checkStr(o, "reservation_id", p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "iteration_id", p, errors, true);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "change", p, errors);
  checkStr(o, "started_at", p, errors);
}
function validateUsage(o, errors) {
  const p = "usage";
  checkStr(o, "usage_id", p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "iteration_id", p, errors, true);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "provider", p, errors);
  checkStr(o, "model", p, errors, true);
  checkStr(o, "request_id", p, errors, true);
  const tokens = subObj2(o, "tokens", p, errors);
  if (tokens !== null) {
    const tp = `${p}.tokens`;
    checkNum(tokens, "input", tp, errors);
    checkNum(tokens, "output", tp, errors);
    checkNum(tokens, "cached_input", tp, errors, true);
    checkNum(tokens, "reasoning", tp, errors, true);
    checkNum(tokens, "total", tp, errors);
    const count = (key) => {
      const value = tokens[key];
      if (typeof value !== "number")
        return void 0;
      if (!Number.isSafeInteger(value) || value < 0) {
        errors.push(`${tp}.${key}: token count \u5FC5\u987B\u662F\u975E\u8D1F safe integer`);
        return void 0;
      }
      return value;
    };
    const input = count("input");
    const output = count("output");
    const cached = missing2(tokens, "cached_input") ? void 0 : count("cached_input");
    const reasoning = missing2(tokens, "reasoning") ? void 0 : count("reasoning");
    const total = count("total");
    if (input !== void 0 && cached !== void 0 && cached > input) {
      errors.push(`${tp}.cached_input: \u4E0D\u5F97\u5927\u4E8E input`);
    }
    if (output !== void 0 && reasoning !== void 0 && reasoning > output) {
      errors.push(`${tp}.reasoning: \u4E0D\u5F97\u5927\u4E8E output`);
    }
    if (input !== void 0 && output !== void 0 && total !== void 0 && (!Number.isSafeInteger(input + output) || total !== input + output)) {
      errors.push(`${tp}.total: \u5FC5\u987B\u7B49\u4E8E input + output`);
    }
  }
  checkLit2(o, "source", "provider-structured", p, errors);
  checkStr(o, "observed_at", p, errors);
}
var RECORD_HEAD_KEYS = ["schema_version", "record_id", "recorded_at", "kind"];
var VERIFY_KEYS = ["result", "source", "trusted"];
var ARTIFACT_KEYS2 = ["build_sha", "build_sha_source", "branch", "commit_shas"];
var ACCOUNTING_KEYS = ["reserved_tokens", "charged_tokens", "charge_source"];
var ERROR_KEYS = ["cause", "message"];
function validateMergeIntent(o, errors) {
  const p = "merge-intent";
  checkKnownKeys(o, [
    ...RECORD_HEAD_KEYS,
    "attempt_id",
    "iteration_id",
    "reservation_id",
    "loop_id",
    "change",
    "workflow_run_id",
    "base_ref",
    "expected_base_sha",
    "branch_ref",
    "expected_branch_sha",
    "merged_commit_sha",
    "level",
    "runner",
    "image",
    "admitted_at",
    "started_at",
    "created_at",
    "verify",
    "verification",
    "artifacts",
    "skill_bundle_snapshot_sha256",
    "usage_record_ids",
    "accounting"
  ], p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "iteration_id", p, errors, true);
  checkStr(o, "reservation_id", p, errors);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "change", p, errors);
  checkStr(o, "workflow_run_id", p, errors);
  checkStr(o, "base_ref", p, errors);
  checkStr(o, "expected_base_sha", p, errors);
  checkStr(o, "branch_ref", p, errors);
  checkStr(o, "expected_branch_sha", p, errors);
  checkStr(o, "merged_commit_sha", p, errors);
  checkEnum2(o, "level", LEVELS, p, errors);
  checkStr(o, "runner", p, errors);
  checkStr(o, "image", p, errors, true);
  checkStr(o, "admitted_at", p, errors);
  checkStr(o, "started_at", p, errors, true);
  checkStr(o, "created_at", p, errors);
  const verify = subObj2(o, "verify", p, errors, true);
  if (verify !== null) {
    const vp = `${p}.verify`;
    checkKnownKeys(verify, VERIFY_KEYS, vp, errors);
    checkEnum2(verify, "result", ["pass", "fail"], vp, errors);
    checkLit2(verify, "source", "sandbox-output", vp, errors);
    checkLit2(verify, "trusted", false, vp, errors);
  }
  if (!missing2(o, "verification")) {
    const verified = validateVerificationResult(o.verification, `${p}.verification`);
    if (!verified.ok)
      errors.push(...verified.errors);
    else
      o.verification = verified.value;
  }
  const artifacts = subObj2(o, "artifacts", p, errors, true);
  if (artifacts !== null) {
    const ap = `${p}.artifacts`;
    checkKnownKeys(artifacts, ARTIFACT_KEYS2, ap, errors);
    checkStr(artifacts, "build_sha", ap, errors, true);
    checkLit2(artifacts, "build_sha_source", "named-branch-head", ap, errors, true);
    checkStr(artifacts, "branch", ap, errors, true);
    checkStrArray(artifacts, "commit_shas", ap, errors);
  }
  checkSha2562(o, "skill_bundle_snapshot_sha256", p, errors, true);
  checkStrArray(o, "usage_record_ids", p, errors);
  const accounting = subObj2(o, "accounting", p, errors);
  if (accounting !== null) {
    const ap = `${p}.accounting`;
    checkKnownKeys(accounting, ACCOUNTING_KEYS, ap, errors);
    checkNum(accounting, "reserved_tokens", ap, errors);
    checkNum(accounting, "charged_tokens", ap, errors);
    checkEnum2(accounting, "charge_source", CHARGE_SOURCES, ap, errors);
  }
}
function validateMergeLanded(o, errors) {
  const p = "merge-landed";
  checkKnownKeys(o, [
    ...RECORD_HEAD_KEYS,
    "intent_record_id",
    "attempt_id",
    "reservation_id",
    "loop_id",
    "change",
    "base_ref",
    "base_before_sha",
    "branch_sha",
    "merged_commit_sha",
    "host_synced",
    "host_sync_error",
    "landed_at"
  ], p, errors);
  checkStr(o, "intent_record_id", p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "reservation_id", p, errors);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "change", p, errors);
  checkStr(o, "base_ref", p, errors);
  checkStr(o, "base_before_sha", p, errors);
  checkStr(o, "branch_sha", p, errors);
  checkStr(o, "merged_commit_sha", p, errors);
  checkBool(o, "host_synced", p, errors);
  const syncError = subObj2(o, "host_sync_error", p, errors, true);
  if (syncError !== null) {
    const ep = `${p}.host_sync_error`;
    checkKnownKeys(syncError, ERROR_KEYS, ep, errors);
    checkStr(syncError, "cause", ep, errors);
    checkStr(syncError, "message", ep, errors);
    if (o.host_synced === true)
      errors.push(`${p}.host_sync_error: host_synced=true \u65F6\u4E0D\u5F97\u5B58\u5728`);
  }
  checkStr(o, "landed_at", p, errors);
}
function validateRun(o, errors) {
  const p = "run";
  checkStr(o, "run_record_id", p, errors);
  checkStr(o, "attempt_id", p, errors);
  checkStr(o, "iteration_id", p, errors, true);
  checkStr(o, "reservation_id", p, errors, true);
  checkStr(o, "loop_id", p, errors);
  checkStr(o, "change", p, errors);
  checkStr(o, "workflow_run_id", p, errors, true);
  checkEnum2(o, "level", LEVELS, p, errors);
  checkStr(o, "runner", p, errors);
  checkStr(o, "image", p, errors, true);
  checkStr(o, "admitted_at", p, errors);
  checkStr(o, "started_at", p, errors, true);
  checkStr(o, "finished_at", p, errors);
  checkEnum2(o, "result", RUN_RESULTS, p, errors);
  checkEnum2(o, "reason", RUN_REASONS, p, errors, true);
  const verify = subObj2(o, "verify", p, errors, true);
  if (verify !== null) {
    const vp = `${p}.verify`;
    checkEnum2(verify, "result", ["pass", "fail"], vp, errors);
    checkLit2(verify, "source", "sandbox-output", vp, errors);
    checkLit2(verify, "trusted", false, vp, errors);
  }
  if (!missing2(o, "verification")) {
    const verified = validateVerificationResult(o.verification, `${p}.verification`);
    if (!verified.ok)
      errors.push(...verified.errors);
    else
      o.verification = verified.value;
  }
  const artifacts = subObj2(o, "artifacts", p, errors, true);
  if (artifacts !== null) {
    const ap = `${p}.artifacts`;
    checkStr(artifacts, "build_sha", ap, errors, true);
    checkLit2(artifacts, "build_sha_source", "named-branch-head", ap, errors, true);
    checkStr(artifacts, "branch", ap, errors, true);
    checkStrArray(artifacts, "commit_shas", ap, errors);
  }
  checkSha2562(o, "skill_bundle_snapshot_sha256", p, errors, true);
  checkStrArray(o, "usage_record_ids", p, errors);
  const accounting = subObj2(o, "accounting", p, errors);
  if (accounting !== null) {
    const cp = `${p}.accounting`;
    checkNum(accounting, "reserved_tokens", cp, errors);
    checkNum(accounting, "charged_tokens", cp, errors);
    checkEnum2(accounting, "charge_source", CHARGE_SOURCES, cp, errors);
  }
  const error = subObj2(o, "error", p, errors, true);
  if (error !== null) {
    const ep = `${p}.error`;
    checkStr(error, "cause", ep, errors);
    checkStr(error, "message", ep, errors);
  }
}
var KIND_VALIDATORS = {
  "change-loop-binding": validateBinding2,
  "budget-reservation": validateReservation,
  "skill-bundle-snapshot": validateSkillBundleSnapshot,
  "reservation-activated": validateActivated,
  usage: validateUsage,
  "merge-intent": validateMergeIntent,
  "merge-landed": validateMergeLanded,
  run: validateRun
};
function decodeLedgerLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    return { ok: false, error: `\u975E\u6CD5 JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isObj2(parsed)) {
    return { ok: false, error: `\u9876\u5C42\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u4E00\u884C\u4E00\u6761\u8BB0\u5F55\uFF09\uFF0C\u5B9E\u5F97 ${typeName2(parsed)}` };
  }
  const errors = [];
  checkLit2(parsed, "schema_version", 1, "record", errors);
  checkStr(parsed, "record_id", "record", errors);
  checkStr(parsed, "recorded_at", "record", errors);
  const kind = parsed.kind;
  const validate = typeof kind === "string" ? KIND_VALIDATORS[kind] : void 0;
  if (validate === void 0) {
    errors.push(`record.kind: \u672A\u77E5\u8BB0\u5F55\u7C7B\u578B ${JSON.stringify(kind)}\uFF08\u95ED\u96C6 ${Object.keys(KIND_VALIDATORS).join("|")}\uFF09`);
    return { ok: false, error: errors.join("; ") };
  }
  validate(parsed, errors);
  if (!isValidatedLedgerRecord(parsed, errors))
    return { ok: false, error: errors.join("; ") };
  return { ok: true, record: parsed };
}
function isValidatedLedgerRecord(value, errors) {
  return isObj2(value) && errors.length === 0;
}

// packages/kernel/dist/loops/ledger-store.js
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash as createHash9 } from "node:crypto";
import { mkdir as mkdir11, open, readFile as readFile15 } from "node:fs/promises";
import { join as join21, resolve as resolve10 } from "node:path";
var LEDGER_DIR = [".pipeline", "loops"];
var LEDGER_FILE = "ledger.jsonl";
function ledgerDirPath(repoRoot) {
  return join21(repoRoot, ...LEDGER_DIR);
}
function ledgerFilePath(repoRoot) {
  return join21(ledgerDirPath(repoRoot), LEDGER_FILE);
}
var LedgerDegradedError = class extends Error {
  _tag = "LedgerDegradedError";
  constructor(message) {
    super(message);
    this.name = "LedgerDegradedError";
  }
};
var UnknownReservationError = class extends Error {
  _tag = "UnknownReservationError";
  constructor(message) {
    super(message);
    this.name = "UnknownReservationError";
  }
};
var ReservationCorruptionError = class extends Error {
  _tag = "ReservationCorruptionError";
  constructor(message) {
    super(message);
    this.name = "ReservationCorruptionError";
  }
};
var ReservationMismatchError = class extends Error {
  _tag = "ReservationMismatchError";
  constructor(message) {
    super(message);
    this.name = "ReservationMismatchError";
  }
};
var ReservationAppendError = class extends Error {
  _tag = "ReservationAppendError";
  constructor(message) {
    super(message);
    this.name = "ReservationAppendError";
  }
};
var heldLedgerDirs = new AsyncLocalStorage();
function shortHash(raw) {
  return createHash9("sha256").update(raw, "utf8").digest("hex").slice(0, 12);
}
function createLoopLedgerStore() {
  function withLedgerLock(repoRoot, fn) {
    const key = resolve10(ledgerDirPath(repoRoot));
    const currentToken = heldLedgerDirs.getStore()?.get(key);
    if (currentToken?.active === true) {
      const p = fn();
      currentToken.pending.add(p);
      void p.catch(() => {
      });
      return p;
    }
    return acquireAndRun(key, fn);
  }
  async function acquireAndRun(key, fn) {
    const held = heldLedgerDirs.getStore();
    await mkdir11(key, { recursive: true });
    return withLock(key, async () => {
      const token = { active: true, pending: /* @__PURE__ */ new Set() };
      const next = /* @__PURE__ */ new Map();
      for (const [k, t] of held ?? [])
        if (t.active)
          next.set(k, t);
      next.set(key, token);
      try {
        return await heldLedgerDirs.run(next, fn);
      } finally {
        while (token.pending.size > 0) {
          const batch = [...token.pending];
          token.pending.clear();
          await Promise.allSettled(batch);
        }
        token.active = false;
      }
    });
  }
  async function writeRecordLine(repoRoot, record2) {
    const line = encodeLedgerRecord(record2);
    const back = decodeLedgerLine(line);
    if (!back.ok) {
      throw new Error(`loops ledger append: record \u672A\u901A\u8FC7\u7F16\u89E3\u7801\u5F80\u8FD4\u6821\u9A8C\uFF0C\u62D2\u5199\u4E0D\u53EF\u89E3\u7801\u8BB0\u5F55 \u2014\u2014 ${back.error}`);
    }
    const fh = await open(ledgerFilePath(repoRoot), "a");
    try {
      const buf = Buffer.from(`${line}
`, "utf8");
      const { bytesWritten } = await fh.write(buf, 0, buf.length);
      if (bytesWritten !== buf.length) {
        throw new Error(`loops ledger append: \u77ED\u5199 ${bytesWritten}/${buf.length} \u5B57\u8282\uFF08\u78C1\u76D8\u6EE1/IO \u6545\u969C\uFF09`);
      }
      await fh.sync();
    } finally {
      await fh.close();
    }
  }
  async function append2(repoRoot, record2) {
    if (record2.kind === "run" && record2.reservation_id !== void 0) {
      throw new ReservationAppendError("RunRecord with reservation_id must use closeReservationIfOpen()\uFF08\u5E26 reservation_id \u7684 terminal \u8BB0\u5F55\u7981\u8D70\u666E\u901A append\uFF09");
    }
    const back = decodeLedgerLine(encodeLedgerRecord(record2));
    if (!back.ok) {
      throw new Error(`loops ledger append: record \u672A\u901A\u8FC7\u7F16\u89E3\u7801\u5F80\u8FD4\u6821\u9A8C\uFF0C\u62D2\u5199\u4E0D\u53EF\u89E3\u7801\u8BB0\u5F55 \u2014\u2014 ${back.error}`);
    }
    await withLedgerLock(repoRoot, () => writeRecordLine(repoRoot, record2));
  }
  async function closeReservationIfOpen(repoRoot, reservationId, create) {
    return withLedgerLock(repoRoot, async () => {
      const { records, rejected } = await read(repoRoot);
      if (rejected.length > 0) {
        throw new LedgerDegradedError(`loops ledger closeReservationIfOpen: \u8D26\u672C\u6709 ${rejected.length} \u6761\u574F\u884C\uFF0C\u62D2\u7EDD\u5728\u635F\u574F\u8D26\u672C\u4E0A\u5173\u95ED reservation\u300C${reservationId}\u300D\uFF08\u4E0D\u731C\u662F\u5426\u5DF2\u5173\u95ED\uFF09`);
      }
      const reservations = records.filter((r) => r.kind === "budget-reservation" && r.reservation_id === reservationId);
      if (reservations.length === 0) {
        throw new UnknownReservationError(`loops ledger closeReservationIfOpen: reservation\u300C${reservationId}\u300D\u5728\u8D26\u672C\u4E2D\u4E0D\u5B58\u5728`);
      }
      if (reservations.length > 1) {
        throw new ReservationCorruptionError(`loops ledger closeReservationIfOpen: reservation\u300C${reservationId}\u300D\u6709 ${reservations.length} \u6761\u540C ID \u9884\u5360\u8BB0\u5F55\uFF08\u8D26\u672C\u635F\u574F\uFF09`);
      }
      const reservation = required(reservations[0]);
      const terminals = records.filter((r) => r.kind === "run" && r.reservation_id === reservationId);
      if (terminals.length === 1) {
        return { status: "already-closed", existing: terminals[0] };
      }
      if (terminals.length > 1) {
        throw new ReservationCorruptionError(`loops ledger closeReservationIfOpen: reservation\u300C${reservationId}\u300D\u6709 ${terminals.length} \u6761 terminal\uFF08\u8D26\u672C\u635F\u574F\uFF0C\u91CD\u590D\u7ED3\u7B97\u75D5\u8FF9\uFF09`);
      }
      const record2 = create(reservation);
      if (record2.kind !== "run" || record2.reservation_id !== reservationId || record2.attempt_id !== reservation.attempt_id || record2.loop_id !== reservation.loop_id || record2.change !== reservation.change || reservation.iteration_id !== void 0 && record2.iteration_id !== reservation.iteration_id) {
        throw new ReservationMismatchError(`loops ledger closeReservationIfOpen: create \u4EA7\u51FA\u7684 RunRecord \u4E0E reservation\u300C${reservationId}\u300D\u5173\u952E\u5B57\u6BB5\u4E0D\u4E00\u81F4\uFF08reservation_id/attempt_id/iteration_id/loop_id/change\uFF09`);
      }
      await writeRecordLine(repoRoot, record2);
      return { status: "committed", record: record2 };
    });
  }
  async function read(repoRoot) {
    let text2;
    try {
      text2 = await readFile15(ledgerFilePath(repoRoot), "utf8");
    } catch (e) {
      if (e.code === "ENOENT")
        return { records: [], rejected: [] };
      throw e;
    }
    const records = [];
    const rejected = [];
    const lines = text2.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = required(lines[i]);
      if (raw.trim() === "") {
        if (raw === "" && i === lines.length - 1)
          continue;
        rejected.push({
          line: i + 1,
          raw_hash: shortHash(raw),
          error: "\u7A7A\u767D\u884C\uFF08blank/whitespace line\uFF09\uFF1AJSONL \u8BB0\u5F55\u4E4B\u95F4\u4E0D\u5141\u8BB8\u7A7A\u884C\uFF0C\u89C6\u4E3A\u6587\u4EF6\u635F\u574F\u75D5\u8FF9"
        });
        continue;
      }
      const r = decodeLedgerLine(raw);
      if (r.ok)
        records.push(r.record);
      else
        rejected.push({ line: i + 1, raw_hash: shortHash(raw), error: r.error });
    }
    return { records, rejected };
  }
  async function readRunWindow(repoRoot, opts) {
    const { records, rejected } = await read(repoRoot);
    const inScope = (loopId) => opts.loopId === void 0 || loopId === opts.loopId;
    const closedReservationIds = /* @__PURE__ */ new Set();
    for (const rec of records) {
      if (rec.kind === "run" && rec.reservation_id !== void 0)
        closedReservationIds.add(rec.reservation_id);
    }
    const fileIndex = /* @__PURE__ */ new Map();
    const runsByLoop = /* @__PURE__ */ new Map();
    records.forEach((rec, idx) => {
      if (rec.kind !== "run" || !inScope(rec.loop_id))
        return;
      fileIndex.set(rec, idx);
      const bucket = runsByLoop.get(rec.loop_id);
      if (bucket === void 0)
        runsByLoop.set(rec.loop_id, [rec]);
      else
        bucket.push(rec);
    });
    const runs = [...runsByLoop.values()].flatMap((bucket) => opts.limit > 0 ? bucket.slice(-opts.limit) : []).sort((a, b) => required(fileIndex.get(a)) - required(fileIndex.get(b)));
    const openReservations = records.filter((rec) => rec.kind === "budget-reservation" && inScope(rec.loop_id) && !closedReservationIds.has(rec.reservation_id));
    const openIds = new Set(openReservations.map((r) => r.reservation_id));
    const activated = records.filter((rec) => rec.kind === "reservation-activated" && openIds.has(rec.reservation_id));
    const snapshotByReservation = indexSkillBundleSnapshots(records);
    const skillBundleSnapshots = openReservations.map((r) => snapshotByReservation.get(r.reservation_id)).filter((s) => s !== void 0);
    return { runs, openReservations, activated, skillBundleSnapshots, rejected };
  }
  return { append: append2, closeReservationIfOpen, withLedgerLock, read, readRunWindow };
}

// packages/kernel/dist/loops/governance.js
import { createHash as createHash10, randomBytes as randomBytes2 } from "node:crypto";
import { mkdir as mkdir12, open as open2, readFile as readFile16, rename as rename6 } from "node:fs/promises";
import { join as join22, resolve as resolve11 } from "node:path";
var LOOPS_REL = [".pipeline", "loops.yaml"];
var GOVERNANCE_LOCK_BASE = [".pipeline", "loops", "governance"];
var ABSENT_REGISTRY_EPOCH = "absent";
function loopsYamlPath(repoRoot) {
  return join22(repoRoot, ...LOOPS_REL);
}
function governanceLockBase(repoRoot) {
  return join22(repoRoot, ...GOVERNANCE_LOCK_BASE);
}
async function withRegistryGovernanceLock(repoRoot, fn) {
  const base = resolve11(governanceLockBase(repoRoot));
  await mkdir12(base, { recursive: true });
  return withLock(base, fn);
}
async function readRegistrySnapshot(repoRoot) {
  let text2;
  try {
    text2 = await readFile16(loopsYamlPath(repoRoot), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      return { text: "", epoch: ABSENT_REGISTRY_EPOCH, registry: null, errors: [] };
    }
    throw new RegistryReadError(`loops.yaml \u8BFB\u5931\u8D25\uFF08${e.code ?? "IO"}\uFF09\uFF1A${e instanceof Error ? e.message : String(e)}`);
  }
  const epoch = createHash10("sha256").update(text2, "utf8").digest("hex");
  const { data, errors } = loadRegistry(repoRoot, { readText: () => text2 });
  return { text: text2, epoch, registry: data, errors };
}
async function writeRegistryTextAtomic(repoRoot, text2) {
  const dir = join22(repoRoot, ".pipeline");
  await mkdir12(dir, { recursive: true });
  const finalPath = loopsYamlPath(repoRoot);
  const tmp = join22(dir, `.loops.yaml.tmp.${process.pid}.${randomBytes2(6).toString("hex")}`);
  const fh = await open2(tmp, "w");
  try {
    await fh.writeFile(text2, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename6(tmp, finalPath);
  try {
    const dfh = await open2(dir, "r");
    try {
      await dfh.sync();
    } finally {
      await dfh.close();
    }
  } catch {
  }
}
async function writeRegistryWithGovernance(repoRoot, expectedEpoch, produce) {
  return withRegistryGovernanceLock(repoRoot, async () => {
    const current = await readRegistrySnapshot(repoRoot);
    if (current.epoch !== expectedEpoch) {
      return { ok: false, error: `CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u6B64\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539\uFF08epoch ${expectedEpoch.slice(0, 12)} \u2192 ${current.epoch.slice(0, 12)}\uFF09` };
    }
    const { text: text2, error } = await produce(current.text, current);
    if (error !== null || text2 === null)
      return { ok: false, error: error ?? "\u751F\u6210\u5199\u56DE\u6587\u672C\u5931\u8D25" };
    await writeRegistryTextAtomic(repoRoot, text2);
    return { ok: true };
  });
}

// packages/kernel/dist/loops/policy-template.js
var AUTOMATION_POLICY_TEMPLATE_VERSION = 1;
var AUTOMATION_POLICY_TEMPLATE_IDS = [
  "pr-babysitter",
  "daily-triage",
  "ci-sweeper",
  "post-merge-cleanup",
  "dependency-sweeper",
  "changelog-drafter",
  "issue-triage"
];
var SOURCE_TEMPLATES = [
  {
    version: 1,
    id: "pr-babysitter",
    goal: "Shepherd PRs through review, CI, rebase, and merge",
    trigger: [{ kind: "schedule" }],
    risk: "medium",
    recommendedWorkflow: "default",
    recommendedSkills: ["pr-review-triage", "minimal-fix", "rebase-and-clean"]
  },
  {
    version: 1,
    id: "daily-triage",
    goal: "Prioritized morning scan of CI, issues, commits, and chat",
    trigger: [{ kind: "schedule" }],
    risk: "low",
    recommendedWorkflow: "default",
    recommendedSkills: ["loop-triage", "minimal-fix"]
  },
  {
    version: 1,
    id: "ci-sweeper",
    goal: "React to failing CI with minimal fixes and escalation",
    trigger: [{ kind: "schedule" }, { kind: "event" }],
    risk: "medium",
    recommendedWorkflow: "default",
    recommendedSkills: ["ci-triage", "minimal-fix"]
  },
  {
    version: 1,
    id: "post-merge-cleanup",
    goal: "Follow-up tech debt and cleanup after merges to main",
    trigger: [{ kind: "schedule" }, { kind: "event" }],
    risk: "low",
    recommendedWorkflow: "default",
    recommendedSkills: ["post-merge-scan", "minimal-fix"]
  },
  {
    version: 1,
    id: "dependency-sweeper",
    goal: "Discover, safely apply, and verify dependency + vulnerability updates with human gates on risky changes",
    trigger: [{ kind: "schedule" }, { kind: "event" }, { kind: "manual" }],
    risk: "medium",
    recommendedWorkflow: "default",
    recommendedSkills: ["dependency-triage", "minimal-fix", "loop-verifier"]
  },
  {
    version: 1,
    id: "changelog-drafter",
    goal: "Scan merged PRs and commits, draft categorized high-quality release notes or CHANGELOG entries for human review",
    trigger: [{ kind: "schedule" }, { kind: "event" }, { kind: "manual" }],
    risk: "low",
    recommendedWorkflow: "default",
    recommendedSkills: ["changelog-scan", "draft-release-notes", "loop-verifier"]
  },
  {
    version: 1,
    id: "issue-triage",
    goal: "Discover, deduplicate, prioritize and label incoming issues/discussions so the team always has a clean actionable queue. Excellent low-risk companion to Daily Triage.",
    trigger: [{ kind: "schedule" }, { kind: "event" }],
    risk: "low",
    recommendedWorkflow: "default",
    recommendedSkills: ["issue-triage", "loop-verifier"]
  }
];
var TEMPLATE_KEYS = /* @__PURE__ */ new Set([
  "version",
  "id",
  "goal",
  "trigger",
  "risk",
  "recommendedWorkflow",
  "recommendedSkills"
]);
var OVERRIDE_KEYS = /* @__PURE__ */ new Set([
  "goal",
  "trigger",
  "risk",
  "recommendedWorkflow",
  "recommendedSkills"
]);
var TEMPLATE_ID_SET = new Set(AUTOMATION_POLICY_TEMPLATE_IDS);
var TRIGGER_KEYS = /* @__PURE__ */ new Set(["kind"]);
var TRIGGER_KINDS = /* @__PURE__ */ new Set(["schedule", "event", "manual"]);
var NO_KEYS = /* @__PURE__ */ new Set();
function asRecord3(input, path7) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`AutomationPolicyTemplate: ${path7} must be an object`);
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`AutomationPolicyTemplate: ${path7} must use Object.prototype or a null prototype`);
  }
  return input;
}
function ownDataValue(object3, key, path7) {
  const descriptor = Object.getOwnPropertyDescriptor(object3, key);
  if (descriptor === void 0 || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error(`AutomationPolicyTemplate: ${path7} must be an own data property`);
  }
  return descriptor.value;
}
function snapshotRecord(input, allowed, required2, path7) {
  const record2 = asRecord3(input, path7);
  const snapshot = /* @__PURE__ */ new Map();
  for (const key of Reflect.ownKeys(record2)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`AutomationPolicyTemplate: ${path7} has unknown key '${String(key)}'`);
    }
    snapshot.set(key, ownDataValue(record2, key, `${path7}.${key}`));
  }
  for (const key of required2) {
    if (!snapshot.has(key)) {
      throw new Error(`AutomationPolicyTemplate: ${path7}.${key} must be an own data property`);
    }
  }
  return snapshot;
}
function snapshotArray(input, path7) {
  if (!Array.isArray(input)) {
    throw new Error(`AutomationPolicyTemplate: ${path7} must be an array`);
  }
  if (Object.getPrototypeOf(input) !== Array.prototype) {
    throw new Error(`AutomationPolicyTemplate: ${path7} must use Array.prototype`);
  }
  const keys = Reflect.ownKeys(input);
  const length = ownDataValue(input, "length", `${path7}.length`);
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
    throw new Error(`AutomationPolicyTemplate: ${path7}.length must be a non-negative integer`);
  }
  for (const key of keys) {
    if (key === "length")
      continue;
    if (typeof key !== "string") {
      throw new Error(`AutomationPolicyTemplate: ${path7} has unknown key '${String(key)}'`);
    }
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new Error(`AutomationPolicyTemplate: ${path7} has unknown key '${key}'`);
    }
  }
  const snapshot = new Array(length);
  for (let index = 0; index < length; index += 1) {
    snapshot[index] = ownDataValue(input, String(index), `${path7}[${index}]`);
  }
  return snapshot;
}
function assertTemplateId(id) {
  if (typeof id !== "string" || !TEMPLATE_ID_SET.has(id)) {
    throw new Error(`AutomationPolicyTemplate: unknown id '${String(id)}' (known: ${AUTOMATION_POLICY_TEMPLATE_IDS.join(", ")})`);
  }
}
function validateTrigger(input) {
  const items = snapshotArray(input, "trigger");
  if (items.length === 0) {
    throw new Error("AutomationPolicyTemplate: trigger must not be empty");
  }
  return items.map((item2, index) => {
    const path7 = `trigger[${index}]`;
    const record2 = snapshotRecord(item2, TRIGGER_KEYS, TRIGGER_KEYS, path7);
    const kind = record2.get("kind");
    if (typeof kind !== "string" || !TRIGGER_KINDS.has(kind)) {
      throw new Error(`AutomationPolicyTemplate: ${path7}.kind '${String(kind)}' is not schedule, event, or manual`);
    }
    return { kind };
  });
}
function nonemptyString2(input, path7) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`AutomationPolicyTemplate: ${path7} must be a non-empty string`);
  }
  return input;
}
function validateRisk(input) {
  if (input !== "low" && input !== "medium" && input !== "high") {
    throw new Error(`AutomationPolicyTemplate: risk '${String(input)}' is not low, medium, or high`);
  }
  return input;
}
function validateRecommendedSkills(input) {
  return snapshotArray(input, "recommendedSkills").map((skill, index) => nonemptyString2(skill, `recommendedSkills[${index}]`));
}
function deepFreeze4(value) {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze4(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}
function cloneTemplate(template) {
  return deepFreeze4({
    ...template,
    trigger: template.trigger.map((item2) => ({ ...item2 })),
    recommendedSkills: [...template.recommendedSkills]
  });
}
function assertVersion(version) {
  if (version !== AUTOMATION_POLICY_TEMPLATE_VERSION) {
    throw new Error(`AutomationPolicyTemplate: unknown version ${String(version)} (supported: ${AUTOMATION_POLICY_TEMPLATE_VERSION})`);
  }
}
function listAutomationPolicyTemplates(version = AUTOMATION_POLICY_TEMPLATE_VERSION) {
  assertVersion(version);
  return deepFreeze4(SOURCE_TEMPLATES.map(cloneTemplate));
}
function getAutomationPolicyTemplate(id, version = AUTOMATION_POLICY_TEMPLATE_VERSION) {
  assertVersion(version);
  const template = SOURCE_TEMPLATES.find((candidate) => candidate.id === id);
  if (template === void 0) {
    throw new Error(`AutomationPolicyTemplate: unknown id '${id}' (known: ${AUTOMATION_POLICY_TEMPLATE_IDS.join(", ")})`);
  }
  return cloneTemplate(template);
}
function validateAutomationPolicyTemplate(input) {
  const record2 = snapshotRecord(input, TEMPLATE_KEYS, TEMPLATE_KEYS, "template");
  const version = record2.get("version");
  assertVersion(version);
  const id = record2.get("id");
  assertTemplateId(id);
  const goal = nonemptyString2(record2.get("goal"), "goal");
  const trigger = validateTrigger(record2.get("trigger"));
  const risk = validateRisk(record2.get("risk"));
  const recommendedWorkflow = record2.get("recommendedWorkflow");
  if (recommendedWorkflow !== "default") {
    throw new Error(`AutomationPolicyTemplate: recommendedWorkflow '${String(recommendedWorkflow)}' is not default`);
  }
  const recommendedSkills = validateRecommendedSkills(record2.get("recommendedSkills"));
  return cloneTemplate({
    version: AUTOMATION_POLICY_TEMPLATE_VERSION,
    id,
    goal,
    trigger,
    risk,
    recommendedWorkflow: "default",
    recommendedSkills
  });
}
function compileAutomationPolicyTemplate(id, override = {}, version = AUTOMATION_POLICY_TEMPLATE_VERSION) {
  const base = getAutomationPolicyTemplate(id, version);
  const record2 = snapshotRecord(override, OVERRIDE_KEYS, NO_KEYS, "override");
  const owns = (key) => record2.has(key);
  return validateAutomationPolicyTemplate({
    version: base.version,
    id: base.id,
    goal: owns("goal") ? record2.get("goal") : base.goal,
    trigger: owns("trigger") ? record2.get("trigger") : base.trigger,
    risk: owns("risk") ? record2.get("risk") : base.risk,
    recommendedWorkflow: owns("recommendedWorkflow") ? record2.get("recommendedWorkflow") : base.recommendedWorkflow,
    recommendedSkills: owns("recommendedSkills") ? record2.get("recommendedSkills") : base.recommendedSkills
  });
}

// packages/kernel/dist/loops/reconciliation-operations.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();

// packages/kernel/dist/triage/types.js
var OBSERVE_ACTION_KINDS = ["git-commits", "loop-run-terminals"];

// packages/kernel/dist/triage/validate.js
var ACTION_KIND_SET = new Set(OBSERVE_ACTION_KINDS);

// packages/kernel/dist/skills/source-registry.js
var TOOL_SET = /* @__PURE__ */ new Set([
  "claude-plugin",
  "skills-cli",
  "npm",
  "builtin",
  "bundled"
]);
var TIER_SET = /* @__PURE__ */ new Set([
  "mandatory",
  "recommended",
  "conditional",
  "optional"
]);
var SkillSourcesError = class extends Error {
  constructor(message) {
    super(`skill-sources: ${message}`);
    this.name = "SkillSourcesError";
  }
};
function stripComment2(line) {
  const t = line.trimStart();
  if (t.startsWith("#"))
    return "";
  const m = line.match(/^(.*?)\s#/);
  return (m ? m[1] : line).trimEnd();
}
function splitTopLevel(s, sep8) {
  const out = [];
  let cur = "";
  let quote = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote)
        quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === sep8) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}
function parseFlowBody(body, token) {
  const fields = /* @__PURE__ */ new Map();
  for (const rawPair of splitTopLevel(body, ",")) {
    const pair = rawPair.trim();
    if (pair === "")
      continue;
    const colon = pair.indexOf(":");
    if (colon <= 0)
      throw new SkillSourcesError(`token '${token}' \u5B57\u6BB5 '${pair}' \u7F3A 'key: value' \u5192\u53F7`);
    const key = pair.slice(0, colon).trim();
    const value = unquote(pair.slice(colon + 1));
    if (fields.has(key))
      throw new SkillSourcesError(`token '${token}' \u5B57\u6BB5 '${key}' \u91CD\u590D`);
    fields.set(key, value);
  }
  return fields;
}
function parseEntry(line, lineNo) {
  const brace = line.indexOf("{");
  const close = line.lastIndexOf("}");
  if (brace < 0 || close < brace) {
    throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C\u4E0D\u662F 'token: { ... }' \u5F62\u6001: '${line.trim()}'`);
  }
  const keyPart = line.slice(0, brace).trim();
  if (!keyPart.endsWith(":")) {
    throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C\u952E\u987B\u4EE5 ':' \u7ED3\u5C3E: '${line.trim()}'`);
  }
  const token = keyPart.slice(0, -1).trim();
  if (token === "")
    throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C token \u4E3A\u7A7A`);
  const f = parseFlowBody(line.slice(brace + 1, close), token);
  const tool = f.get("tool");
  if (!tool || !TOOL_SET.has(tool)) {
    throw new SkillSourcesError(`token '${token}' tool \u975E\u6CD5\u6216\u7F3A\u5931: '${tool ?? ""}'\uFF08\u5408\u6CD5\uFF1A${[...TOOL_SET].join("/")}\uFF09`);
  }
  const source = f.get("source");
  if (source === void 0 || source === "")
    throw new SkillSourcesError(`token '${token}' \u7F3A source`);
  const tier = f.get("tier");
  if (!tier || !TIER_SET.has(tier)) {
    throw new SkillSourcesError(`token '${token}' tier \u975E\u6CD5\u6216\u7F3A\u5931: '${tier ?? ""}'\uFF08\u5408\u6CD5\uFF1A${[...TIER_SET].join("/")}\uFF09`);
  }
  const officialRaw = f.get("official");
  if (officialRaw !== "true" && officialRaw !== "false") {
    throw new SkillSourcesError(`token '${token}' official \u987B\u4E3A true/false: '${officialRaw ?? ""}'`);
  }
  const entry = {
    token,
    tool,
    source,
    tier,
    official: officialRaw === "true"
  };
  const skill = f.get("skill");
  if (skill !== void 0 && skill !== "")
    entry.skill = skill;
  const contentSkill = f.get("content_skill");
  if (contentSkill !== void 0 && contentSkill !== "")
    entry.contentSkill = contentSkill;
  const engine = f.get("engine");
  if (engine !== void 0 && engine !== "")
    entry.engine = engine;
  const bin = f.get("bin");
  if (bin !== void 0 && bin !== "")
    entry.bin = bin;
  const unavailableRaw = f.get("unavailable");
  if (unavailableRaw !== void 0) {
    if (unavailableRaw !== "true" && unavailableRaw !== "false") {
      throw new SkillSourcesError(`token '${token}' unavailable \u987B\u4E3A true/false: '${unavailableRaw}'`);
    }
    entry.unavailable = unavailableRaw === "true";
  }
  const alt = f.get("alt");
  if (alt !== void 0 && alt !== "")
    entry.alt = alt;
  const note = f.get("note");
  if (note !== void 0 && note !== "")
    entry.note = note;
  return entry;
}
function parseSkillSources(text2) {
  const lines = text2.split("\n");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  let inSkills = false;
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment2(required(lines[i]));
    if (line.trim() === "")
      continue;
    const indented = /^\s/.test(line);
    if (!inSkills) {
      if (/^skills:\s*$/.test(line))
        inSkills = true;
      continue;
    }
    if (!indented) {
      inSkills = /^skills:\s*$/.test(line);
      continue;
    }
    const entry = parseEntry(line, i + 1);
    if (seen.has(entry.token)) {
      throw new SkillSourcesError(`token '${entry.token}' \u91CD\u590D\u58F0\u660E\uFF08\u7B2C ${i + 1} \u884C\uFF09`);
    }
    seen.add(entry.token);
    out.push(entry);
  }
  return out;
}

// packages/kernel/dist/workflow/skill-evidence.js
function decodeHistoryLine(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return void 0;
  const record2 = value;
  if (record2.kind !== void 0 && typeof record2.kind !== "string")
    return void 0;
  if (record2.to !== void 0 && typeof record2.to !== "string")
    return void 0;
  if (record2.raw !== void 0 && typeof record2.raw !== "string")
    return void 0;
  return {
    ...typeof record2.kind === "string" ? { kind: record2.kind } : {},
    ...typeof record2.to === "string" ? { to: record2.to } : {},
    ...typeof record2.raw === "string" ? { raw: record2.raw } : {}
  };
}
function canonicalWorkflowSkillId(skillId) {
  return skillId.startsWith("tenon:") ? skillId.slice("tenon:".length) : skillId;
}
function skillIdFromHistory(raw) {
  const match = /^(?:Skill|CodexSkillRead): (.+)$/.exec(raw);
  return match?.[1] === void 0 ? null : canonicalWorkflowSkillId(match[1]);
}
function completedWorkflowSkillsSinceStepEntry(historyRaw, currentStepId) {
  const lines = [];
  for (const line of historyRaw.split("\n")) {
    if (line.trim() === "")
      continue;
    try {
      const decoded = decodeHistoryLine(JSON.parse(line));
      if (decoded)
        lines.push(decoded);
    } catch {
    }
  }
  let enteredAt = -1;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line?.kind === "transition" && line.to === currentStepId) {
      enteredAt = index;
      break;
    }
  }
  const completed = /* @__PURE__ */ new Set();
  for (const line of lines.slice(enteredAt + 1)) {
    if (line.kind !== "tool")
      continue;
    const skillId = skillIdFromHistory(line.raw ?? "");
    if (skillId !== null)
      completed.add(skillId);
  }
  return completed;
}

// packages/kernel/dist/workflow/serialize.js
function serializeSkill(s) {
  const lines = [`      - id: ${s.id}`];
  if (s.depends_on !== void 0) {
    lines.push(`        depends_on: [${s.depends_on.join(", ")}]`);
  }
  return lines;
}
function serializeFieldRef(r) {
  return [`      - field: ${r.field}`, `        type: ${r.type}`];
}
function serializeRequiredWhen(when, pad) {
  const key = when.kind === "track-in" ? "track_in" : "track_not_in";
  return [`${pad}required_when:`, `${pad}  ${key}: [${when.values.join(", ")}]`];
}
function serializeArtifact(a) {
  const lines = [
    `      - field: ${a.field}`,
    `        type: ${a.type}`,
    `        producer_policy: ${a.producerPolicy}`
  ];
  if (a.requiredWhen)
    lines.push(...serializeRequiredWhen(a.requiredWhen, "        "));
  return lines;
}
function serializeArtifactsBlock(artifacts) {
  if (artifacts === void 0)
    return [];
  if (artifacts.length === 0)
    return ["    artifacts: []"];
  return ["    artifacts:", ...artifacts.flatMap(serializeArtifact)];
}
function serializeWhen(when, pad) {
  const key = when.kind === "track-in" ? "track_in" : "track_not_in";
  return [`${pad}when:`, `${pad}  ${key}: [${when.values.join(", ")}]`];
}
function serializeGuard(g, pad) {
  const sub = `${pad}  `;
  const lines = [`${pad}- type: ${g.type}`];
  switch (g.type) {
    case "tasks-at-least":
      lines.push(`${sub}n: ${g.n}`);
      break;
    case "nonempty-output":
      break;
    case "field-nonempty":
      lines.push(`${sub}field: ${g.field}`);
      break;
    case "file-exists":
      lines.push(`${sub}field: ${g.path.field}`);
      break;
    case "field-equals":
      lines.push(`${sub}field: ${g.field}`, `${sub}value: ${g.value}`);
      break;
    case "field-in":
      lines.push(`${sub}field: ${g.field}`, `${sub}values: [${g.values.join(", ")}]`);
      break;
    case "full-direct-override":
      break;
    case "build-head-unchanged":
      lines.push(`${sub}field: ${g.field}`);
      break;
    case "spec-migration-applied":
      break;
    default: {
      const exhaustive = g;
      throw new Error(`serializeWorkflow: \u672A\u77E5 guard \u53D8\u4F53 ${JSON.stringify(exhaustive)}\uFF08\u95ED\u96C6\u89C1 types.ts WorkflowGuardConfig\uFF09`);
    }
  }
  if (g.when)
    lines.push(...serializeWhen(g.when, sub));
  return lines;
}
function serializeAction(a, pad) {
  return [`${pad}- type: ${a.type}`];
}
function serializeEdgeBlock(name, items, each) {
  if (items === void 0)
    return [];
  if (items.length === 0)
    return [`        ${name}: []`];
  return [`        ${name}:`, ...items.flatMap(each)];
}
function serializeTransition(t) {
  return [
    `      - event: ${t.event}`,
    `        to: ${t.to}`,
    ...serializeEdgeBlock("guards", t.guards, (g) => serializeGuard(g, "          ")),
    ...serializeEdgeBlock("actions", t.actions, (a) => serializeAction(a, "          "))
  ];
}
function serializeBlockField(name, items, each) {
  if (items.length === 0)
    return [`    ${name}: []`];
  return [`    ${name}:`, ...items.flatMap(each)];
}
function serializeStep(step) {
  const lines = [`  - id: ${step.id}`];
  if (step.label !== "")
    lines.push(`    label: ${step.label}`);
  lines.push(`    gate: ${step.gate ?? "null"}`);
  if (step.prompt !== void 0) {
    lines.push("    prompt: |-");
    lines.push(...step.prompt.split("\n").map((line) => `      ${line}`));
  }
  lines.push(...serializeBlockField("skills", step.skills, serializeSkill));
  lines.push(...serializeBlockField("inputs", step.inputs, serializeFieldRef));
  lines.push(...serializeBlockField("outputs", step.outputs, serializeFieldRef));
  lines.push(...serializeArtifactsBlock(step.artifacts));
  lines.push(...serializeBlockField("guards", step.guards, (g) => serializeGuard(g, "      ")));
  lines.push(...serializeBlockField("transitions", step.transitions, serializeTransition));
  return lines;
}
function serializeDocumentContract(contract) {
  return [
    "document_contract:",
    `  version: ${contract.version}`,
    "  slots:",
    ...contract.slots.flatMap((slot) => [
      `    - kind: ${slot.kind}`,
      `      owner_step: ${slot.ownerStep}`,
      `      producers: [${slot.producers.join(", ")}]`
    ]),
    ...contract.reads.length === 0 ? ["  reads: []"] : [
      "  reads:",
      ...contract.reads.flatMap((read) => [
        `    - step: ${read.step}`,
        `      kinds: [${read.kinds.join(", ")}]`
      ])
    ]
  ];
}
function serializeWorkflow(wf) {
  if (wf.openspecContract !== void 0 && wf.documentContract !== void 0) {
    throw new Error("serializeWorkflow: openspecContract \u4E0E documentContract \u4E0D\u5F97\u540C\u65F6\u58F0\u660E");
  }
  const lines = [
    `name: ${wf.name}`,
    ...wf.openspecContract === void 0 ? [] : [`openspec_contract: ${wf.openspecContract}`],
    ...wf.documentContract === void 0 ? [] : serializeDocumentContract(wf.documentContract),
    "steps:",
    ...wf.steps.flatMap(serializeStep)
  ];
  return lines.join("\n") + "\n";
}

// packages/kernel/dist/workflow/track-reference-validation.js
function validateWorkflowTrackReferences(wf, registry) {
  const errors = [];
  const check = (predicate, path7) => {
    if (predicate === void 0)
      return;
    predicate.values.forEach((track, index) => {
      if (!registry.byId.has(track))
        errors.push(`${path7}.values[${index}]: \u672A\u77E5 track '${track}'`);
    });
  };
  wf.steps.forEach((step, stepIndex) => {
    step.guards.forEach((guard, guardIndex) => {
      check(guard.when, `workflow.steps[${stepIndex}].guards[${guardIndex}].when`);
    });
    step.transitions.forEach((transition, transitionIndex) => {
      ;
      (transition.guards ?? []).forEach((guard, guardIndex) => {
        check(guard.when, `workflow.steps[${stepIndex}].transitions[${transitionIndex}].guards[${guardIndex}].when`);
      });
    });
    (step.artifacts ?? []).forEach((artifact, artifactIndex) => {
      check(artifact.requiredWhen, `workflow.steps[${stepIndex}].artifacts[${artifactIndex}].requiredWhen`);
    });
  });
  return errors;
}

// packages/kernel/dist/workflow/transition-readiness.js
function defaultEventGuards(event) {
  if (!(event in DEFAULT_EVENT_POLICY)) {
    throw new Error(`phase-manifest workflow \u58F0\u660E\u4E86\u672A\u77E5 default event '${event}'`);
  }
  return DEFAULT_EVENT_POLICY[event].guards;
}
function blocker(guard, decision) {
  if (decision.kind === "skipped") {
    return {
      kind: "capability-unavailable",
      guardType: guard.type,
      capability: decision.capability
    };
  }
  return {
    kind: "guard-failed",
    guardType: decision.guardType,
    ...decision.field === void 0 ? {} : { field: decision.field },
    ...decision.actual === void 0 ? {} : { actual: decision.actual },
    ...decision.expected === void 0 ? {} : { expected: decision.expected }
  };
}
async function readinessByTransition(plan, state, context) {
  const input = plan.executionModel === "phase-manifest" ? buildDefaultGuardInput(state, context) : buildStepGuardInput(state, context);
  const phase = state.fields.phase;
  const currentStepId = Array.isArray(phase) ? phase.join(",") : phase ?? "";
  const step = plan.workflow.steps.find((candidate) => candidate.id === currentStepId);
  if (step === void 0)
    return {};
  const transitions = await Promise.all(step.transitions.map(async (transition) => {
    const guards = plan.executionModel === "phase-manifest" ? defaultEventGuards(transition.event) : mergeLifecycleGuards([...step.guards, ...transition.guards], governedLifecyclePolicy(plan.capabilities.documents.policy !== void 0, step.id, transition.to)?.guards);
    const evaluations = [];
    const errors = [];
    for (const guard of guards) {
      try {
        evaluations.push(...await evaluateGuards([guard], input, { stopOnFirstFailure: false }));
      } catch {
        const fieldValue = guard.type === "build-head-unchanged" ? state.fields[guard.field] : void 0;
        const scalar5 = Array.isArray(fieldValue) ? fieldValue.join(",") : fieldValue ?? "";
        const capability = guard.type === "tasks-at-least" ? "readText" : guard.type === "file-exists" ? "fileExists" : guard.type === "build-head-unchanged" ? scalar5.startsWith("workspace:sha256:") ? "workspaceFingerprint" : "gitHeadSha" : guard.type === "spec-migration-applied" ? "specMigrationStatus" : void 0;
        errors.push({
          kind: "evaluation-error",
          guardType: guard.type,
          ...capability === void 0 ? {} : { capability }
        });
      }
    }
    const blockers = evaluations.flatMap(({ guard, decision }) => decision.kind === "passed" ? [] : [blocker(guard, decision)]);
    blockers.push(...errors);
    return [transition.event, { ready: blockers.length === 0, blockers }];
  }));
  return { [step.id]: Object.fromEntries(transitions) };
}

// packages/kernel/dist/workflow/effective-skill-resolver.js
function resolveRequiredSkillSlots(resolver, capability, stepId) {
  if (resolver?.resolveRequired !== void 0)
    return resolver.resolveRequired(capability, stepId);
  if (capability.source === "manifest-overlay") {
    if (!capability.trackOverlay.matrix || resolver === void 0)
      return [];
    return resolver.resolveDefaultMandatory(stepId, capability.trackOverlay.profile);
  }
  const step = capability.steps.find((candidate) => candidate.stepId === stepId);
  return (step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }));
}
function dedupeStable(tokens) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const t of tokens) {
    if (seen.has(t))
      continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
function createEffectiveSkillResolver(input) {
  const registry = "registry" in input ? input.registry : void 0;
  const manifest = "manifest" in input ? input.manifest : input;
  const resolveProfile = (stepId, profile) => {
    const mandatory = skillsFor(manifest.mandatorySkills, stepId, profile);
    const recommended = skillsFor(manifest.recommendedSkills, stepId, profile);
    return dedupeStable([...mandatory, ...recommended]).map((token) => ({
      token,
      alternatives: skillTokenAlternatives(token)
    }));
  };
  return {
    resolveRequired(capability, stepId) {
      if (capability.source === "manifest-overlay") {
        if (!capability.trackOverlay.matrix)
          return [];
        const profile = capability.trackOverlay.profile;
        return dedupeStable(skillsFor(manifest.mandatorySkills, stepId, profile)).map((token) => ({
          token,
          alternatives: skillTokenAlternatives(token)
        }));
      }
      const step = capability.steps.find((candidate) => candidate.stepId === stepId);
      return dedupeStable(step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }));
    },
    resolveAvailable(capability, stepId) {
      if (capability.source === "manifest-overlay") {
        if (!capability.trackOverlay.matrix)
          return [];
        return resolveProfile(stepId, capability.trackOverlay.profile);
      }
      const step = capability.steps.find((candidate) => candidate.stepId === stepId);
      return dedupeStable(step?.requiredSkillIds ?? []).map((id) => ({ token: id, alternatives: [id] }));
    },
    resolveDefaultMandatory(stepId, track) {
      const currentRegistry = typeof registry === "function" ? registry() : registry;
      const profile = currentRegistry === void 0 ? track : currentRegistry.byId.get(track)?.policyProfile.skills.profile;
      if (profile === void 0)
        throw new Error(`unknown track '${track}' in effective skill resolver`);
      return dedupeStable(skillsFor(manifest.mandatorySkills, stepId, profile)).map((token) => ({
        token,
        alternatives: skillTokenAlternatives(token)
      }));
    },
    resolveDefault(stepId, track) {
      const currentRegistry = typeof registry === "function" ? registry() : registry;
      const profile = currentRegistry === void 0 ? track : currentRegistry.byId.get(track)?.policyProfile.skills.profile;
      if (profile === void 0)
        throw new Error(`unknown track '${track}' in effective skill resolver`);
      return resolveProfile(stepId, profile);
    },
    resolveDefaultProfile: resolveProfile,
    // track 目前不参与 custom 解析（step.skills 固定）——保留在签名里供 T-R6 track-条件 custom skill 接线。
    resolveCustom(step, _track) {
      return dedupeStable(step.skills.map((s) => s.id)).map((id) => ({ token: id, alternatives: [id] }));
    }
  };
}

// packages/kernel/dist/workflow/skill-bundle-resolver.js
function resolveSkillBundle(resolver, input) {
  if (input.kind === "default") {
    const resolveProfile = resolver.resolveDefaultProfile?.bind(resolver) ?? resolver.resolveDefault.bind(resolver);
    return { source: "default", slots: resolveProfile(input.stepId, input.profileId) };
  }
  return { source: "custom", slots: resolver.resolveCustom(input.step, input.profileId) };
}

// packages/kernel/dist/workflow/action-handlers.js
function fieldString(value) {
  return Array.isArray(value) ? value.join(",") : value ?? "";
}
var ACTION_HANDLERS = Object.freeze({
  /** build-complete 的不可变验证靶：
   *  · branch/worktree 保持老仓语义：HEAD trim 后非空 → 冻结进 build_sha；取不到 → warning。
   *  · in-place 不能用未变化的 HEAD 伪装实现未漂移：强制冻结内容寻址的 workspace baseline；能力
   *    缺失或返回非法基线一律 fail-closed，绝不写一个无法复验的假 SHA。
   */
  "freeze-build-sha": async (_config, input) => {
    if (fieldString(input.fields.isolation) === "in-place") {
      if (!input.workspaceFingerprint) {
        throw new Error("in-place build requires workspaceFingerprint capability");
      }
      const baseline = (await input.workspaceFingerprint()).trim();
      if (!isWorkspaceBaseline(baseline)) {
        throw new Error(`workspaceFingerprint \u8FD4\u56DE\u4E86\u975E\u6CD5\u57FA\u7EBF: ${baseline}`);
      }
      return { patch: { build_sha: baseline }, signals: [] };
    }
    const sha = (await input.gitHeadSha?.())?.trim() ?? "";
    if (sha !== "")
      return { patch: { build_sha: sha }, signals: [] };
    return { patch: {}, signals: [{ kind: "build-sha-missing" }] };
  },
  /** 进入任一新的实现 visit 时，旧候选的 Build 收敛审查不得继承。 */
  "reset-pre-verify-review": () => ({
    patch: { pre_verify_review_result: "pending" },
    signals: []
  }),
  /** 老仓 state-transition.sh verify-pass 事件体：verify_result=pass + verified_at=clock()。 */
  "mark-verification-passed": (_config, input) => ({
    patch: { verify_result: "pass", verified_at: input.clock() },
    signals: []
  }),
  /** 老仓 state-transition.sh verify-fail 事件体：连带把 build_sha 打回字面 'null'
   *  ——barrier 复位，回退重 build 后必须重新冻结。 */
  "mark-verification-failed": () => ({
    patch: { verify_result: "fail", build_sha: "null" },
    signals: []
  }),
  /** 老仓 state-transition.sh archived 事件体：archived=true + archived_at=clock()。 */
  "archive-run": (_config, input) => ({
    patch: { archived: "true", archived_at: input.clock() },
    signals: []
  })
});
function dispatchAction(config, input) {
  const handler = ACTION_HANDLERS[config.type];
  return handler(config, input);
}
async function applyActions(actions, input) {
  let patch = {};
  const signals = [];
  for (const action of actions) {
    const view = { ...input, fields: { ...input.fields, ...patch } };
    const outcome = await dispatchAction(action, view);
    patch = { ...patch, ...outcome.patch };
    signals.push(...outcome.signals);
  }
  return { patch, signals };
}

// packages/kernel/dist/workflow/transition-application.js
function isRejection(x) {
  return "kind" in x;
}
function fieldStr4(v) {
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
async function planDefaultTransition(state, command, flow, clock, effectivePlan) {
  const edge = eventEdge(command.event);
  if (!edge)
    return { kind: "unknown-event", event: command.event };
  const current = fieldStr4(state.fields.phase);
  if (current !== edge.from) {
    return { kind: "event-source-mismatch", event: command.event, current, expected: edge.from, to: edge.to };
  }
  const event = command.event;
  const policy = DEFAULT_EVENT_POLICY[event];
  const violations = await checkDefaultEventPreconditions(event, state, command.context);
  if (violations)
    return { kind: "precondition-violated", lines: violations };
  let result;
  try {
    result = flow.transition(state, edge.to, clock);
  } catch (e) {
    if (e instanceof IllegalTransitionError)
      return { kind: "illegal-transition", from: e.from, to: e.to };
    throw e;
  }
  const warnings = [];
  let nextFields = result.state.fields;
  if (policy.actions.length > 0) {
    const outcome = await applyActions(policy.actions, {
      fields: result.state.fields,
      clock,
      gitHeadSha: command.context.gitHeadSha,
      workspaceFingerprint: command.context.workspaceFingerprint
    });
    nextFields = { ...result.state.fields, ...outcome.patch };
    for (const signal of outcome.signals)
      warnings.push({ kind: signal.kind });
  }
  return {
    governedDocumentContract: effectivePlan.capabilities.documents.governed,
    ...effectivePlan.capabilities.documents.policy === void 0 ? {} : { documentPolicy: effectivePlan.capabilities.documents.policy },
    requiresReviewApproval: effectivePlan.capabilities.review.steps.includes(result.from),
    from: result.from,
    to: result.to,
    nextFields,
    warnings
  };
}
async function planCustomTransition(state, effectivePlan, command, clock) {
  const ir = effectivePlan.workflow;
  const workflowName = effectivePlan.id;
  const currentBeforePlan = resolveStep(ir, fieldStr4(state.fields.phase));
  const terminalArchive = currentBeforePlan?.id === "archive" && currentBeforePlan.transitions.length === 0 && command.event === "archived";
  const planningIr = terminalArchive ? {
    ...ir,
    steps: ir.steps.map((step) => step.id === "archive" ? {
      ...step,
      transitions: [{
        event: "archived",
        to: "archive",
        guards: [],
        actions: [{ type: "archive-run" }]
      }]
    } : step)
  } : ir;
  const edgeBeforePlan = terminalArchive ? planningIr.steps.find((step) => step.id === "archive")?.transitions[0] : currentBeforePlan?.transitions.find((candidate) => candidate.event === command.event);
  const documentPolicy = effectivePlan.capabilities.documents.policy;
  const governed = documentPolicy !== void 0;
  const lifecycle = currentBeforePlan && edgeBeforePlan ? governedLifecyclePolicy(governed, currentBeforePlan.id, edgeBeforePlan.to) : void 0;
  const plan = await planStepTransition(planningIr, state, command.event, {
    changeDirAbs: command.changeDir,
    fileExists: command.context.fileExists,
    gitHeadSha: command.context.gitHeadSha,
    workspaceFingerprint: command.context.workspaceFingerprint,
    specMigrationStatus: command.context.specMigrationStatus
  }, lifecycle?.guards);
  if (!plan.ok) {
    if (plan.kind === "step-not-in-graph")
      return { kind: "step-not-in-graph", workflowName, stepId: plan.stepId };
    if (plan.kind === "event-unsupported") {
      return {
        kind: "event-unsupported",
        workflowName,
        stepId: plan.stepId,
        event: command.event,
        available: plan.available
      };
    }
    return { kind: "step-guard-failed", workflowName, stepId: plan.stepId, failures: plan.failures };
  }
  const currentStep = resolveStep(planningIr, plan.from);
  if (!currentStep)
    throw new Error(`workflow '${workflowName}' \u5728\u5DF2\u89C4\u5212 step '${plan.from}' \u540E\u65E0\u6CD5\u91CD\u53D6\u5F53\u524D step`);
  const nextState = applyStepTransition(state, plan.to, clock);
  const actions = mergeLifecycleActions(plan.actions, lifecycle?.actions);
  const closesRun = terminalArchive || actions.some((action) => action.type === "archive-run");
  const warnings = [];
  let nextFields = closesRun ? { ...nextState.fields, phase_status: "done" } : nextState.fields;
  if (actions.length > 0) {
    const outcome = await applyActions(actions, {
      fields: nextState.fields,
      clock,
      gitHeadSha: command.context.gitHeadSha,
      workspaceFingerprint: command.context.workspaceFingerprint
    });
    nextFields = { ...nextFields, ...outcome.patch };
    for (const signal of outcome.signals)
      warnings.push({ kind: signal.kind });
  }
  return {
    governedDocumentContract: governed,
    ...documentPolicy ? { documentPolicy } : {},
    requiresReviewApproval: effectivePlan.capabilities.review.steps.includes(currentStep.id),
    from: plan.from,
    to: plan.to,
    nextFields,
    warnings
  };
}
function createTransitionApplication(deps) {
  return {
    async execute(command) {
      return deps.runRepository.transact(command.changeDir, async (tx) => {
        const workflowName = tx.run.workflowId;
        let effectivePlan;
        try {
          const trackId = fieldStr4(tx.state.fields.track);
          const track = trackId === "" ? void 0 : deps.resolveTrack?.(trackId);
          effectivePlan = resolveBoundEffectiveWorkflowPlan(workflowName, {
            documentProfile: tx.run.documentProfile,
            documentGovernanceFingerprint: tx.run.documentGovernanceFingerprint,
            workflowPlanFingerprint: tx.run.workflowPlanFingerprint
          }, command.loadWorkflow, track, tx.run.workflowPlanSnapshot);
        } catch (error) {
          if (error instanceof DocumentGovernanceBindingError) {
            return { kind: "document-governance-invalid", workflowName, reason: error.message };
          }
          throw error;
        }
        if (!effectivePlan)
          return { kind: "workflow-not-found", workflowName };
        let prepared;
        if (effectivePlan.capabilities.execution.model === "phase-manifest") {
          prepared = await planDefaultTransition(tx.state, command, deps.flow, deps.clock, effectivePlan);
        } else {
          prepared = await planCustomTransition(tx.state, effectivePlan, command, deps.clock);
        }
        if (isRejection(prepared))
          return prepared;
        if (deps.missingStepSkills !== void 0) {
          const missing3 = await deps.missingStepSkills({
            changeDir: command.changeDir,
            stepId: prepared.from,
            capability: effectivePlan.capabilities.skills
          });
          if (missing3.length > 0) {
            return {
              kind: "step-skills-incomplete",
              workflowName,
              stepId: prepared.from,
              missing: missing3
            };
          }
        }
        const policy = tx.run.automationPolicy;
        if (policy !== void 0) {
          const facts = deps.resolveConstraintContext === void 0 ? { active: false, humanGateSatisfied: false } : await deps.resolveConstraintContext({ policy, command, target: prepared.to });
          const decision = evaluateConstraintPolicy(policy.constraints, {
            operation: "transition",
            active: facts.active,
            humanGateSatisfied: facts.humanGateSatisfied,
            transitionTarget: prepared.to,
            matches: () => false
          });
          if (!decision.allowed)
            return { kind: "constraint-denied", reason: decision.reason };
        }
        if (prepared.documentPolicy && shouldEnforceDocumentPolicyOnTransition(prepared.documentPolicy, prepared.from, prepared.to)) {
          if (!isDocumentPolicyStep(prepared.documentPolicy, prepared.from)) {
            return {
              kind: "document-evidence-failed",
              phase: prepared.from,
              blockers: [`\u53D7 document contract \u6CBB\u7406\u7684 workflow \u4F7F\u7528\u4E86\u975E\u6CD5 step '${prepared.from}'`]
            };
          }
          let evidence;
          if (prepared.documentPolicy.id === "openspec-v1" && deps.documentEvidence) {
            if (!isDocumentContractPhase(prepared.from)) {
              return {
                kind: "document-evidence-failed",
                phase: prepared.from,
                blockers: [`legacy document contract \u4F7F\u7528\u4E86\u975E\u6CD5 phase '${prepared.from}'`]
              };
            }
            evidence = await deps.documentEvidence(command.root, command.changeDir, prepared.from);
          } else {
            evidence = await evaluateDocumentEvidence(command.root, command.changeDir, prepared.from, {}, prepared.documentPolicy);
          }
          if (!evidence.pass) {
            return { kind: "document-evidence-failed", phase: prepared.from, blockers: evidence.blockers };
          }
        }
        if (prepared.requiresReviewApproval && command.humanReviewApproved !== true && !reviewGateApprovedFor(tx.state, prepared.from, command.event)) {
          return { kind: "review-approval-required", phase: prepared.from, event: command.event };
        }
        const { record: record2, projection } = await tx.commit({ ...prepared.nextFields, ...clearReviewGatePatch() }, {
          event: command.event,
          from: prepared.from,
          to: prepared.to
        });
        const warnings = [...prepared.warnings];
        if (projection.status === "pending") {
          warnings.push({
            kind: "projection-write-failed",
            projection: "state-yaml",
            cause: projection.error
          });
        }
        if (prepared.governedDocumentContract) {
          const breadcrumbTail = await applyBreadcrumbTail(deps.breadcrumb, { changeDir: command.changeDir, name: command.changeName, to: prepared.to });
          if (!breadcrumbTail.ok) {
            warnings.push({ kind: "projection-write-failed", projection: "breadcrumb", cause: breadcrumbTail.error });
          }
        }
        if (deps.history) {
          try {
            await deps.history.append(command.changeDir, transitionRecordToHistoryEntry(record2));
          } catch (e) {
            warnings.push({ kind: "projection-write-failed", projection: "history", cause: e });
          }
        }
        return { kind: "applied", from: prepared.from, to: prepared.to, record: record2, warnings };
      });
    }
  };
}

// packages/server/src/server.ts
import { createServer } from "node:http";
import { join as join52 } from "node:path";

// packages/automation/dist/types.js
var AUTOMATION_STATES = [
  "off",
  "queued",
  "scheduled",
  "running",
  "merged",
  "failed",
  "conflict",
  "paused"
];
var DEFAULT_CONFIG = {
  enabled: false,
  defaultOptIn: false,
  maxParallel: 4,
  maxRetries: 1,
  level: "L1"
};

// packages/automation/dist/runner/boundedTail.js
var MAX_TAIL_CHARS = 64 * 1024;

// packages/automation/dist/triage/codex-provider.js
var DEFAULT_CODEX_TRIAGE_MODEL = "gpt-5.6";
var DEFAULT_CODEX_TRIAGE_MAX_OUTPUT_BYTES = 256 * 1024;
var DEFAULT_CODEX_TRIAGE_TIMEOUT_MS = 5 * 60 * 1e3;
var CODEX_TRIAGE_MODEL_ALLOWLIST = [
  DEFAULT_CODEX_TRIAGE_MODEL,
  "gpt-5.6-terra"
];
var CODEX_TRIAGE_MODEL_SET = new Set(CODEX_TRIAGE_MODEL_ALLOWLIST);
var decisionVariant = (classification, includeRoute) => ({
  type: "object",
  properties: {
    observationId: { type: "string" },
    classification: { type: "string", const: classification },
    rationale: { type: "string" },
    ...includeRoute ? { routeId: { type: "string" } } : {}
  },
  required: [
    "observationId",
    "classification",
    "rationale",
    ...includeRoute ? ["routeId"] : []
  ],
  additionalProperties: false
});
var outputSchema = JSON.stringify({
  type: "object",
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    decisions: {
      type: "array",
      items: {
        anyOf: [
          decisionVariant("high", true),
          decisionVariant("watch", false),
          decisionVariant("noise", false)
        ]
      }
    }
  },
  required: ["schemaVersion", "decisions"],
  additionalProperties: false
});

// packages/automation/dist/triage/orchestrator-support.js
var frozenEmptyMaterializations = Object.freeze([]);

// packages/automation/dist/queue/gate.js
function optedIn(input) {
  if (!input.automationEligible)
    return false;
  if (input.automation === "queued")
    return true;
  return input.defaultOptIn;
}
function shouldEnqueueOnSpecComplete(input) {
  if (!input.enabled)
    return false;
  return optedIn(input);
}
function shouldAutoEnqueueOnSpecComplete(input) {
  if (!input.autoEnqueueOnSpecComplete)
    return false;
  return shouldEnqueueOnSpecComplete({
    enabled: input.enabled,
    automationEligible: true,
    automation: input.automation,
    defaultOptIn: input.defaultOptIn
  });
}

// packages/automation/dist/verifier/verifier.js
var DEFAULT_VERIFIER_ISSUER_IDENTITY = Object.freeze({
  kind: "host-verifier",
  verifier: "automation-default-verifier",
  version: "0"
});
var DEFAULT_VERIFIER_ISSUER_KIND = DEFAULT_VERIFIER_ISSUER_IDENTITY.kind;

// packages/automation/dist/admission/loop-admission-types.js
var DEFAULT_TTL_MS = 10 * 60 * 1e3;

// packages/automation/dist/skills/snapshot-manifest.js
import { createHash as createHash11 } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat as lstat12, mkdir as mkdir13, open as open3, readdir as readdir3, realpath as realpath4, stat as stat3, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname5, join as join23, relative as relative4, sep as sep6 } from "node:path";

// packages/automation/dist/skills/types.js
function isPathSafeSkillId(skillId) {
  return skillId.length > 0 && skillId !== "." && !/[/\\]|\.\.|\0/.test(skillId);
}

// packages/automation/dist/skills/snapshot-manifest.js
var SkillContentInvalidError = class extends Error {
  name = "SkillContentInvalidError";
  _tag = "SkillContentInvalidError";
};
var EXEC_BITS = 73;
function sha256Hex2(data) {
  return createHash11("sha256").update(data).digest("hex");
}
var EMPTY_FILE_SHA256 = sha256Hex2(Buffer.alloc(0));
function byRelativePath(a, b) {
  return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;
}
function aggregateHash(entries) {
  const canonical = entries.map((e) => [e.relativePath, e.sha256, e.executable]);
  return sha256Hex2(JSON.stringify(canonical));
}
function assertSafeSkillId(skillId) {
  if (!isPathSafeSkillId(skillId)) {
    throw new SkillContentInvalidError(`skill id \u542B\u8DEF\u5F84\u4E0D\u5B89\u5168\u5B57\u7B26\uFF0C\u62D2\u7EDD\u7269\u5316\uFF1A${JSON.stringify(skillId)}`);
  }
}
async function assertDirectoryIdentities(identities, onFailure) {
  for (const expected of identities) {
    let current;
    try {
      current = await lstat12(expected.absPath);
    } catch (e) {
      throw onFailure(`\u7956\u5148\u76EE\u5F55\u4E0D\u53EF\u8BBF\u95EE\uFF1A${expected.absPath}\uFF08${e.message}\uFF09`);
    }
    if (!current.isDirectory() || current.isSymbolicLink()) {
      throw onFailure(`\u7956\u5148\u8DEF\u5F84\u5DF2\u4E0D\u518D\u662F\u53EF\u4FE1\u666E\u901A\u76EE\u5F55\uFF1A${expected.absPath}`);
    }
    if (current.dev !== expected.dev || current.ino !== expected.ino) {
      throw onFailure(`\u7956\u5148\u76EE\u5F55 inode \u5DF2\u53D8\u5316\uFF08TOCTOU\uFF0C\u62D2\u7EDD\u7EE7\u7EED\u8BFB\u53D6\uFF09\uFF1A${expected.absPath}`);
    }
  }
}
async function captureDirectoryIdentities(realRoot, absFile, rootIdentity, onFailure) {
  const parent = dirname5(absFile);
  const fromRoot = relative4(realRoot, parent);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep6}`)) {
    throw onFailure(`\u6587\u4EF6\u7236\u76EE\u5F55\u5DF2\u9003\u9038\u5185\u5BB9\u6839\uFF1A${parent}`);
  }
  const paths = [realRoot];
  let cursor = realRoot;
  if (fromRoot !== "") {
    for (const segment of fromRoot.split(sep6)) {
      cursor = join23(cursor, segment);
      paths.push(cursor);
    }
  }
  const identities = [];
  for (const absPath of paths) {
    let current;
    try {
      current = await lstat12(absPath);
    } catch (e) {
      throw onFailure(`\u7956\u5148\u76EE\u5F55\u4E0D\u53EF\u8BBF\u95EE\uFF1A${absPath}\uFF08${e.message}\uFF09`);
    }
    if (!current.isDirectory() || current.isSymbolicLink()) {
      throw onFailure(`\u7956\u5148\u8DEF\u5F84\u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u76EE\u5F55\uFF1A${absPath}`);
    }
    identities.push({ absPath, dev: current.dev, ino: current.ino });
  }
  if (identities[0]?.dev !== rootIdentity.dev || identities[0]?.ino !== rootIdentity.ino) {
    throw onFailure(`\u5185\u5BB9\u6839 inode \u5DF2\u53D8\u5316\uFF08TOCTOU\uFF0C\u62D2\u7EDD\u7EE7\u7EED\u8BFB\u53D6\uFF09\uFF1A${realRoot}`);
  }
  return identities;
}
async function readRegularFileStrict(absPath, onFailure, opts) {
  if (opts.ancestors)
    await assertDirectoryIdentities(opts.ancestors, onFailure);
  let handle;
  try {
    handle = await open3(absPath, opts.noFollow ? constants.O_RDONLY | constants.O_NOFOLLOW : constants.O_RDONLY);
  } catch (e) {
    throw onFailure(`\u6253\u5F00\u5931\u8D25\uFF08${e.message}\uFF09`);
  }
  try {
    const st = await handle.stat();
    if (!st.isFile()) {
      throw onFailure("open \u540E fstat \u590D\u6838\uFF1A\u76EE\u6807\u6B64\u523B\u5DF2\u4E0D\u662F\u666E\u901A\u6587\u4EF6\uFF08symlink TOCTOU\uFF0C\u62D2\u7EDD\u8DDF\u968F\uFF09");
    }
    if (opts.expected && (st.dev !== opts.expected.dev || st.ino !== opts.expected.ino)) {
      throw onFailure("open \u540E fstat \u590D\u6838\uFF1Ainode \u4E0E\u5224\u5B9A\u5B89\u5168\u90A3\u4E00\u523B\u89C2\u5BDF\u5230\u7684\u4E0D\u4E00\u81F4\uFF08TOCTOU\uFF0C\u76EE\u6807\u5DF2\u88AB\u66FF\u6362\uFF09");
    }
    if (opts.ancestors)
      await assertDirectoryIdentities(opts.ancestors, onFailure);
    const content = await handle.readFile();
    if (opts.ancestors)
      await assertDirectoryIdentities(opts.ancestors, onFailure);
    return { content, mode: st.mode };
  } finally {
    await handle.close();
  }
}
async function buildCanonicalManifest(skillId, sourceDir, hooks = {}) {
  assertSafeSkillId(skillId);
  let realRoot;
  try {
    realRoot = await realpath4(sourceDir);
  } catch (e) {
    throw new SkillContentInvalidError(`skill '${skillId}' \u5185\u5BB9\u6839\u4E0D\u53EF\u89E3\u6790\uFF1A${sourceDir}\uFF08${e.message}\uFF09`);
  }
  const rootStat = await stat3(realRoot).catch((e) => {
    throw new SkillContentInvalidError(`skill '${skillId}' \u5185\u5BB9\u6839\u4E0D\u53EF\u8BBF\u95EE\uFF1A${realRoot}\uFF08${e.message}\uFF09`);
  });
  if (!rootStat.isDirectory()) {
    throw new SkillContentInvalidError(`skill '${skillId}' \u5185\u5BB9\u6839\u4E0D\u662F\u76EE\u5F55\uFF1A${realRoot}`);
  }
  const rootIdentity = { absPath: realRoot, dev: rootStat.dev, ino: rootStat.ino };
  const entries = [];
  let skillDocContent;
  const visitedDirs = /* @__PURE__ */ new Set([realRoot]);
  const readAndRecord = async (absPath, relPath, toctou) => {
    const onFailure = (msg) => new SkillContentInvalidError(`skill '${skillId}' \u7684\u6587\u4EF6\u8BFB\u53D6\u88AB\u62D2\u7EDD\uFF1A${relPath}\uFF08${msg}\uFF09`);
    const ancestors = await captureDirectoryIdentities(realRoot, absPath, rootIdentity, onFailure);
    if (hooks.onBeforeReadFile)
      await hooks.onBeforeReadFile(relPath, absPath);
    const { content, mode } = await readRegularFileStrict(absPath, onFailure, { ...toctou, ancestors });
    const executable = (mode & EXEC_BITS) !== 0;
    if (relPath === "SKILL.md")
      skillDocContent = Buffer.from(content);
    entries.push({ relativePath: relPath, sha256: sha256Hex2(content), executable });
    if (hooks.onFile)
      await hooks.onFile(relPath, content, executable);
  };
  const visit = async (realDir, relDir) => {
    let dirents;
    try {
      dirents = await readdir3(realDir, { withFileTypes: true });
    } catch (e) {
      throw new SkillContentInvalidError(`skill '${skillId}' \u76EE\u5F55\u4E0D\u53EF\u8BFB\uFF1A${relDir || "."}\uFF08${e.message}\uFF09`);
    }
    for (const d of dirents) {
      const relPath = relDir ? `${relDir}/${d.name}` : d.name;
      const absPath = join23(realDir, d.name);
      if (d.isSymbolicLink()) {
        let real;
        try {
          real = await realpath4(absPath);
        } catch (e) {
          throw new SkillContentInvalidError(`skill '${skillId}' \u542B\u60AC\u7A7A symlink\uFF1A${relPath}\uFF08${e.message}\uFF09`);
        }
        const fromRoot = relative4(realRoot, real);
        if (fromRoot === ".." || fromRoot.startsWith(`..${"/"}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' \u542B\u76EE\u5F55\u9003\u9038 symlink\uFF1A${relPath} \u2192 ${real}`);
        }
        const targetStat = await stat3(real);
        if (targetStat.isDirectory()) {
          if (visitedDirs.has(real)) {
            throw new SkillContentInvalidError(`skill '${skillId}' \u542B symlink \u73AF\uFF1A${relPath} \u2192 ${real}`);
          }
          visitedDirs.add(real);
          await visit(real, relPath);
        } else if (targetStat.isFile()) {
          await readAndRecord(real, relPath, { noFollow: true, expected: { dev: targetStat.dev, ino: targetStat.ino } });
        } else {
          throw new SkillContentInvalidError(`skill '${skillId}' \u7684 symlink \u76EE\u6807\u65E2\u975E\u6587\u4EF6\u4E5F\u975E\u76EE\u5F55\uFF1A${relPath}`);
        }
        continue;
      }
      if (d.isDirectory()) {
        const real = await realpath4(absPath);
        const fromRoot = relative4(realRoot, real);
        if (fromRoot === ".." || fromRoot.startsWith(`..${"/"}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' \u76EE\u5F55\u5728\u904D\u5386\u671F\u95F4\u9003\u9038\uFF1A${relPath} \u2192 ${real}`);
        }
        if (visitedDirs.has(real))
          continue;
        visitedDirs.add(real);
        await visit(real, relPath);
        continue;
      }
      if (d.isFile()) {
        const real = await realpath4(absPath);
        const fromRoot = relative4(realRoot, real);
        if (fromRoot === ".." || fromRoot.startsWith(`..${"/"}`)) {
          throw new SkillContentInvalidError(`skill '${skillId}' \u6587\u4EF6\u5728\u8BFB\u53D6\u524D\u9003\u9038\uFF1A${relPath} \u2192 ${real}`);
        }
        const expected = await stat3(real);
        await readAndRecord(real, relPath, { noFollow: true, expected: { dev: expected.dev, ino: expected.ino } });
        continue;
      }
      throw new SkillContentInvalidError(`skill '${skillId}' \u542B\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B\uFF1A${relPath}`);
    }
  };
  await visit(realRoot, "");
  entries.sort(byRelativePath);
  const skillDoc = entries.find((e) => e.relativePath === "SKILL.md");
  if (!skillDoc) {
    throw new SkillContentInvalidError(`skill '${skillId}' \u5185\u5BB9\u6839\u7F3A\u5C11 SKILL.md\uFF1A${realRoot}`);
  }
  if (skillDoc.sha256 === EMPTY_FILE_SHA256 || skillDocContent === void 0) {
    throw new SkillContentInvalidError(`skill '${skillId}' \u7684 SKILL.md \u4E3A\u7A7A\u6587\u4EF6\uFF1A${realRoot}`);
  }
  let skillDocText;
  try {
    skillDocText = new TextDecoder("utf-8", { fatal: true }).decode(skillDocContent);
  } catch {
    throw new SkillContentInvalidError(`skill '${skillId}' \u7684 SKILL.md \u4E0D\u662F\u5408\u6CD5 UTF-8\uFF1A${realRoot}`);
  }
  if (skillDocText.trim().length === 0 || skillDocText.includes("\0")) {
    throw new SkillContentInvalidError(`skill '${skillId}' \u7684 SKILL.md \u4E3A\u7A7A\u767D\u6216\u542B NUL\uFF1A${realRoot}`);
  }
  return { skillId, files: entries, treeSha256: aggregateHash(entries) };
}

// packages/automation/dist/runner/runner.js
var AFK_RUN_SCRIPT_SHA256 = "993067db8ccb4c3b48c54ff2410907fd4dc72a5df3d0dc8946f6913594a0a619";
var AFK_RUN_DRIFT_EXIT_CODE = 95;
var IMAGE_AFK_RUN_PATH = "/usr/local/bin/tenon-afk-run";
var IMAGE_ATTESTATION_PATH = "/opt/pipeline/image-attestation.env";
var checksumGuard = (path7, digest2, attestationKey, label) => `actual_sha="$(sha256sum ${path7} 2>/dev/null | awk '{print $1}')"; [ "$actual_sha" = "${digest2}" ] && grep -qx "${attestationKey}=${digest2}" ${IMAGE_ATTESTATION_PATH} 2>/dev/null || { echo "sandcastle \u955C\u50CF\u5185 ${label} \u4E0E host \u671F\u671B\u6216\u955C\u50CF attestation \u4E0D\u4E00\u81F4\u2014\u2014\u8BF7\u91CD\u5EFA\u955C\u50CF\uFF1Atools/sandcastle/build.sh" >&2; exit ${AFK_RUN_DRIFT_EXIT_CODE}; }`;
var AFK_RUN_DRIFT_GUARD = checksumGuard(IMAGE_AFK_RUN_PATH, AFK_RUN_SCRIPT_SHA256, "pipeline_afk_run_sha256", "tenon-afk-run");

// packages/automation/dist/lifecycle/worktree.js
var CANCEL_MARKER_FILE = ".cancel-requested";

// packages/automation/dist/verifier/git-revision-verifier.js
var GIT_REVISION_VERIFIER_ISSUER_IDENTITY = Object.freeze({
  kind: "host-verifier",
  verifier: "pipeline-git-integrity",
  version: "1"
});

// packages/automation/dist/lifecycle/spec-complete.js
import { join as join25 } from "node:path";

// packages/automation/dist/config/automationJson.js
import { readFileSync as readFileSync12 } from "node:fs";
import { join as join24 } from "node:path";
var AUTOMATION_JSON_LIMITS = {
  maxParallel: { min: 1, max: 8 },
  maxRetries: { min: 0, max: 3 },
  imageMaxLen: 200
};
var AUTOMATION_IMAGE_RE = /^[a-zA-Z0-9._/:@-]+$/;
function automationJsonPath(root) {
  return join24(root, ".pipeline", "automation.json");
}
var intIn = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
function isValidImageRef(v) {
  return v.length > 0 && v.length <= AUTOMATION_JSON_LIMITS.imageMaxLen && AUTOMATION_IMAGE_RE.test(v);
}
function readAutomationJson(root, fs = { readFileSync: readFileSync12 }) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(automationJsonPath(root), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return {};
  const raw = parsed;
  const cfg2 = {};
  const { maxParallel: mp, maxRetries: mr } = AUTOMATION_JSON_LIMITS;
  if (typeof raw.enabled === "boolean")
    cfg2.enabled = raw.enabled;
  if (intIn(raw.max_parallel, mp.min, mp.max))
    cfg2.maxParallel = raw.max_parallel;
  if (intIn(raw.max_retries, mr.min, mr.max))
    cfg2.maxRetries = raw.max_retries;
  if (typeof raw.default_opt_in === "boolean")
    cfg2.defaultOptIn = raw.default_opt_in;
  if (typeof raw.image === "string") {
    const image = raw.image.trim();
    if (isValidImageRef(image))
      cfg2.image = image;
  }
  return cfg2;
}

// packages/automation/dist/sdk/sdk.js
function resolveAutomationConfig(deps, entrypointDefaults = {}) {
  const { image: _image, ...fileCfg } = readAutomationJson(deps.repoRoot, deps.configFs);
  return { ...DEFAULT_CONFIG, ...entrypointDefaults, ...fileCfg, ...deps.config };
}

// packages/automation/dist/lifecycle/spec-complete.js
var scalar3 = (value) => typeof value === "string" ? value : "";
async function enqueueAfterSpecComplete(deps, transition) {
  if (transition.event !== "spec-complete" || transition.from !== "spec" || transition.to !== "build") {
    return { kind: "not-applicable" };
  }
  const config = resolveAutomationConfig(deps);
  const changeDir = join25(deps.repoRoot, "openspec", "changes", transition.changeName);
  return deps.store.withLock(changeDir, async () => {
    const state = await deps.store.read(changeDir);
    if (scalar3(state.fields.phase) !== "build")
      return { kind: "phase-changed" };
    const policy = deps.resolveTrackPolicy(scalar3(state.fields.track));
    if (policy.autoEnqueueOnSpecComplete !== true)
      return { kind: "track-disabled" };
    const automation = scalar3(state.fields.automation);
    if (automation === "queued")
      return { kind: "already-queued" };
    if (automation !== "off")
      return { kind: "automation-not-off", automation };
    if (!shouldAutoEnqueueOnSpecComplete({
      enabled: config.enabled,
      autoEnqueueOnSpecComplete: policy.autoEnqueueOnSpecComplete === true,
      automation,
      defaultOptIn: config.defaultOptIn
    }))
      return { kind: "not-opted-in" };
    state.fields.automation = "queued";
    state.fields.automation_queued_at = deps.clock();
    await deps.store.writeUnderLock(changeDir, state, { kind: "automation" });
    return { kind: "queued" };
  });
}

// packages/automation/dist/runner/race.js
var DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1e3;
var DEFAULT_COMPLETION_TIMEOUT_MS = 60 * 1e3;

// packages/automation/dist/skills/content-locator.js
import { lstat as lstat13, realpath as realpath5, stat as stat4 } from "node:fs/promises";
import { join as join26 } from "node:path";
var SkillContentNotFoundError = class extends Error {
  name = "SkillContentNotFoundError";
  _tag = "SkillContentNotFoundError";
};
var SkillContentSourceAmbiguousError = class extends Error {
  name = "SkillContentSourceAmbiguousError";
  _tag = "SkillContentSourceAmbiguousError";
};
var SkillContentAccessError = class extends Error {
  name = "SkillContentAccessError";
  _tag = "SkillContentAccessError";
};
function errnoCode3(err) {
  return typeof err === "object" && err !== null && "code" in err ? String(err.code) : "unknown";
}
function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function createFsSkillContentLocator(roots) {
  return {
    async locate(skillId) {
      if (!isPathSafeSkillId(skillId)) {
        throw new SkillContentInvalidError(`skill id \u542B\u8DEF\u5F84\u4E0D\u5B89\u5168\u5B57\u7B26\uFF0C\u62D2\u7EDD\u5B9A\u4F4D\uFF1A${JSON.stringify(skillId)}`);
      }
      const candidates = [];
      for (const root of roots) {
        const candidate = join26(root, skillId);
        try {
          await lstat13(candidate);
        } catch (err) {
          if (errnoCode3(err) === "ENOENT")
            continue;
          throw new SkillContentAccessError(`skill '${skillId}' \u5019\u9009\u8DEF\u5F84 '${candidate}' \u65E0\u6CD5\u8BBF\u95EE\uFF08${errnoCode3(err)}\uFF09\uFF0C\u62D2\u7EDD\u5F53\u4F5C\u672A\u5B89\u88C5\u9759\u9ED8\u8DF3\u8FC7\uFF1A${errMessage(err)}`);
        }
        let st;
        try {
          st = await stat4(candidate);
        } catch (err) {
          throw new SkillContentAccessError(`skill '${skillId}' \u5019\u9009\u8DEF\u5F84 '${candidate}' \u5DF2\u5B58\u5728\u4F46\u65E0\u6CD5\u89E3\u5F15\u7528\uFF08${errnoCode3(err)}\uFF0C\u7591\u4F3C\u60AC\u7A7A/\u6210\u73AF symlink \u6216\u6743\u9650\u95EE\u9898\uFF09\uFF1A${errMessage(err)}`);
        }
        if (!st.isDirectory()) {
          throw new SkillContentAccessError(`skill '${skillId}' \u5019\u9009\u8DEF\u5F84 '${candidate}' \u5B58\u5728\u4F46\u4E0D\u662F\u76EE\u5F55\uFF0C\u62D2\u7EDD\u5F53\u4F5C\u672A\u5B89\u88C5\u9759\u9ED8\u8DF3\u8FC7`);
        }
        try {
          candidates.push({ root, dir: await realpath5(candidate) });
        } catch (err) {
          throw new SkillContentAccessError(`skill '${skillId}' \u5019\u9009\u8DEF\u5F84 '${candidate}' \u76EE\u5F55\u5DF2\u786E\u8BA4\u5B58\u5728\u4F46 realpath \u89E3\u6790\u5931\u8D25\uFF08${errnoCode3(err)}\uFF09\uFF1A${errMessage(err)}`);
        }
      }
      if (candidates.length === 0) {
        throw new SkillContentNotFoundError(`skill '${skillId}' \u5728\u7ED9\u5B9A\u7684 ${roots.length} \u4E2A\u6839\u76EE\u5F55\u91CC\u90FD\u4E0D\u5B58\u5728`);
      }
      if (candidates.length === 1) {
        const onlyCandidate = candidates[0];
        if (!onlyCandidate)
          throw new SkillContentNotFoundError(`skill '${skillId}' \u5019\u9009\u6D88\u5931`);
        return { skillId, contentDir: onlyCandidate.dir };
      }
      const manifests = await Promise.all(candidates.map((c) => buildCanonicalManifest(skillId, c.dir)));
      const first = manifests[0];
      if (!first)
        throw new SkillContentNotFoundError(`skill '${skillId}' \u672A\u751F\u6210\u5185\u5BB9\u6E05\u5355`);
      const allSame = manifests.every((m) => m.treeSha256 === first.treeSha256);
      if (!allSame) {
        throw new SkillContentSourceAmbiguousError(`skill '${skillId}' \u5728\u591A\u4E2A\u6839\u76EE\u5F55\u5185\u5BB9\u4E0D\u4E00\u81F4\uFF08\u6765\u6E90\u6B67\u4E49\uFF09\uFF1A${candidates.map((c) => `${c.root} \u2192 ${c.dir}`).join("; ")}`);
      }
      const selected = candidates[0];
      if (!selected)
        throw new SkillContentNotFoundError(`skill '${skillId}' \u5019\u9009\u6D88\u5931`);
      return { skillId, contentDir: selected.dir };
    }
  };
}

// packages/automation/dist/skills/production-content-locator.js
import { readdirSync as readdirSync3, readFileSync as readFileSync13 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join27 } from "node:path";
var SkillRootRegistryError = class extends Error {
  name = "SkillRootRegistryError";
  _tag = "SkillRootRegistryError";
};
function nodeCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
}
function realDirNames(path7) {
  try {
    return readdirSync3(path7, { withFileTypes: true }).filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name);
  } catch (error) {
    if (nodeCode(error) === "ENOENT")
      return [];
    throw new SkillRootRegistryError(`\u8BFB\u53D6 skill root registry \u5931\u8D25\uFF08${path7}\uFF0C${nodeCode(error)}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
}
function checkedNames(read, path7) {
  const names = read(path7);
  if (!Array.isArray(names))
    throw new SkillRootRegistryError(`${path7} \u7684\u76EE\u5F55\u679A\u4E3E\u7ED3\u679C\u5FC5\u987B\u662F\u6570\u7EC4`);
  const seen = /* @__PURE__ */ new Set();
  for (const name of names) {
    if (typeof name !== "string" || name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
      throw new SkillRootRegistryError(`${path7} \u542B\u975E\u6CD5\u76EE\u5F55\u6BB5 ${JSON.stringify(name)}`);
    }
    if (seen.has(name))
      throw new SkillRootRegistryError(`${path7} \u91CD\u590D\u76EE\u5F55\u6BB5 ${JSON.stringify(name)}`);
    seen.add(name);
  }
  return [...seen];
}
function append(map, key, value) {
  const existing = map.get(key);
  if (existing === void 0)
    map.set(key, [value]);
  else
    existing.push(value);
}
function codexPluginRoots(home, read) {
  const result = /* @__PURE__ */ new Map();
  const cache = join27(home, ".codex", "plugins", "cache");
  for (const authority of checkedNames(read, cache)) {
    const authorityDir = join27(cache, authority);
    for (const plugin of checkedNames(read, authorityDir)) {
      const pluginDir = join27(authorityDir, plugin);
      for (const version of checkedNames(read, pluginDir)) {
        append(result, plugin, join27(pluginDir, version, "skills"));
      }
    }
  }
  return result;
}
function realInstalledJson(path7) {
  try {
    return readFileSync13(path7, "utf8");
  } catch (error) {
    if (nodeCode(error) === "ENOENT")
      return null;
    throw new SkillRootRegistryError(`\u8BFB\u53D6 Claude installed_plugins.json \u5931\u8D25\uFF08${path7}\uFF0C${nodeCode(error)}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
}
function claudeInstalledRoots(raw) {
  const result = /* @__PURE__ */ new Map();
  if (raw === null)
    return result;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillRootRegistryError(`Claude installed_plugins.json \u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SkillRootRegistryError("Claude installed_plugins.json \u9876\u5C42\u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const plugins = parsed.plugins;
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) {
    throw new SkillRootRegistryError("Claude installed_plugins.json.plugins \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  for (const [key, entries] of Object.entries(plugins)) {
    const at = key.lastIndexOf("@");
    if (at <= 0 || at === key.length - 1 || !Array.isArray(entries)) {
      throw new SkillRootRegistryError(`Claude plugin entry \u975E\u6CD5\uFF1A${JSON.stringify(key)}`);
    }
    const plugin = key.slice(0, at);
    for (const [index, entry] of entries.entries()) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new SkillRootRegistryError(`Claude plugins.${key}[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
      }
      const installPath = entry.installPath;
      if (typeof installPath !== "string" || installPath.trim() === "" || !isAbsolute4(installPath)) {
        throw new SkillRootRegistryError(`Claude plugins.${key}[${index}].installPath \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84`);
      }
      append(result, plugin, join27(installPath, "skills"));
    }
  }
  return result;
}
function flatten(map) {
  return [...map.values()].flatMap((roots) => [...roots]);
}
function isNotFound(error) {
  return error?._tag === "SkillContentNotFoundError";
}
function createRunnerSkillContentLocator(options) {
  const runner = assertLoopRunner(options.runner);
  const readDirs = options.readdirDirNames ?? realDirNames;
  const bundled = options.bundledRoot === void 0 ? void 0 : createFsSkillContentLocator([options.bundledRoot]);
  let codexPlugins;
  let codexFlat;
  let claudePlugins;
  let claudeFlat;
  const getCodexPlugins = () => {
    codexPlugins ??= codexPluginRoots(options.home, readDirs);
    return codexPlugins;
  };
  const getCodexFlat = () => {
    codexFlat ??= createFsSkillContentLocator([
      join27(options.home, ".codex", "skills"),
      join27(options.home, ".codex", "skills", ".system"),
      // skills CLI 的 Codex/global 安装真落点是 agent-neutral ~/.agents/skills；它不属于
      // Claude 私有面，Codex runner 必须可读，否则 setup/doctor 绿而 H10 readiness 必红。
      join27(options.home, ".agents", "skills"),
      ...flatten(getCodexPlugins())
    ]);
    return codexFlat;
  };
  const getClaudePlugins = () => {
    claudePlugins ??= claudeInstalledRoots((options.readInstalledPluginsJson ?? realInstalledJson)(join27(options.home, ".claude", "plugins", "installed_plugins.json")));
    return claudePlugins;
  };
  const getClaudeFlat = () => {
    if (claudeFlat !== void 0)
      return claudeFlat;
    const roots = [join27(options.home, ".claude", "skills"), join27(options.home, ".agents", "skills")];
    const cache = join27(options.home, ".claude", "plugins", "cache");
    for (const marketplace of checkedNames(readDirs, cache)) {
      const marketplaceDir = join27(cache, marketplace);
      for (const plugin of checkedNames(readDirs, marketplaceDir)) {
        roots.push(join27(marketplaceDir, plugin, "skills"));
      }
    }
    roots.push(...flatten(getClaudePlugins()));
    claudeFlat = createFsSkillContentLocator([...new Set(roots)]);
    return claudeFlat;
  };
  return {
    async locate(skillId) {
      const colon = skillId.indexOf(":");
      if (colon < 0) {
        if (bundled !== void 0) {
          try {
            return await bundled.locate(skillId);
          } catch (error) {
            if (!isNotFound(error))
              throw error;
          }
        }
        try {
          return await getCodexFlat().locate(skillId);
        } catch (error) {
          if (!isNotFound(error) || runner === "codex")
            throw error;
          return getClaudeFlat().locate(skillId);
        }
      }
      const plugin = skillId.slice(0, colon);
      const leaf = skillId.slice(colon + 1);
      const codexRoots = getCodexPlugins().get(plugin) ?? [];
      if (codexRoots.length > 0) {
        try {
          const located2 = await createFsSkillContentLocator(codexRoots).locate(leaf);
          return { skillId, contentDir: located2.contentDir };
        } catch (error) {
          if (!isNotFound(error))
            throw error;
        }
      }
      if (runner === "codex") {
        throw new SkillContentNotFoundError(`skill '${skillId}' \u5728 bundled/Codex roots \u4E2D\u4E0D\u5B58\u5728\uFF1BCodex runner \u7981\u6B62\u8BFB\u53D6 Claude fallback`);
      }
      const fallback = getClaudePlugins().get(plugin) ?? [];
      if (fallback.length === 0) {
        throw new SkillContentNotFoundError(`skill '${skillId}' \u7684 Claude plugin namespace \u672A\u5B89\u88C5`);
      }
      const located = await createFsSkillContentLocator(fallback).locate(leaf);
      return { skillId, contentDir: located.contentDir };
    }
  };
}

// packages/automation/dist/skills/wiring.js
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function locateSlot(locator, alternatives) {
  const notFoundDetails = [];
  for (const alternative of alternatives) {
    try {
      await locator.locate(alternative);
      return { ok: true };
    } catch (error) {
      const tag = error?._tag;
      if (tag === "SkillContentNotFoundError") {
        notFoundDetails.push(errorMessage(error));
        continue;
      }
      return {
        ok: false,
        detail: `\u5019\u9009\u300C${alternative}\u300D\u5B9A\u4F4D\u5931\u8D25\uFF08\u975E not-found\uFF0C\u7ACB\u5373\u5224\u5B9A\u5931\u8D25\uFF0C\u4E0D\u518D\u5C1D\u8BD5\u5176\u4F59\u5019\u9009\uFF09\uFF1A${errorMessage(error)}`
      };
    }
  }
  return {
    ok: false,
    detail: `\u5728\u5F53\u524D\u5B89\u88C5\u9762\u5747\u65E0\u6CD5\u5B9A\u4F4D\uFF08\u5019\u9009\uFF1A${alternatives.join("|")}\uFF09\uFF1A${notFoundDetails.join("; ")}`
  };
}
async function evaluateSkillBundleWiring(loop, deps, resolutionInputs) {
  const bundleId = loop.skill_bundle_id ?? null;
  if (bundleId === null) {
    return {
      status: "unwired",
      bundleId: null,
      reason: "skill_bundle_id \u672A\u63A5\u7EBF\uFF08\u5B57\u6BB5\u7F3A\u5931/null\uFF09\uFF0C\u4EFB\u4F55 real-run \u90FD\u4F1A\u88AB fail-closed \u62D2\u7EDD"
    };
  }
  if (bundleId !== "_all") {
    if (deps.isSkillProfileKnown === void 0 || !deps.isSkillProfileKnown(bundleId)) {
      return {
        status: "invalid",
        bundleId,
        reason: `profile "${bundleId}" \u4E0D\u5728\u5F53\u524D\u5408\u6CD5 skill profile \u952E\u7A7A\u95F4\uFF08\u6216\u5B58\u5728\u6027\u6821\u9A8C\u5668\u5C1A\u672A\u88C5\u914D\uFF09`
      };
    }
  }
  const workflowId = loop.workflow_id ?? "default";
  if (resolutionInputs === void 0 && workflowId !== "default") {
    return {
      status: "invalid",
      bundleId,
      reason: `custom workflow "${workflowId}" \u7F3A\u5C11 host \u5DF2\u7F16\u8BD1 StepIR \u89E3\u6790\u8BA1\u5212\uFF0C\u62D2\u7EDD\u5077\u7528\u540C\u540D default phase`
    };
  }
  const effectiveInputs = resolutionInputs ?? loop.phases.map((stepId) => ({
    kind: "default",
    stepId
  }));
  const expectedKind = workflowId === "default" ? "default" : "custom";
  const mismatchedKind = effectiveInputs.find((input) => input.kind !== expectedKind);
  if (mismatchedKind !== void 0) {
    return {
      status: "invalid",
      bundleId,
      reason: `workflow "${workflowId}" \u53EA\u5141\u8BB8 ${expectedKind} skill \u89E3\u6790\u8BA1\u5212\uFF0C\u6536\u5230 ${mismatchedKind.kind}`
    };
  }
  if (effectiveInputs.length !== loop.phases.length) {
    return {
      status: "invalid",
      bundleId,
      reason: `workflow skill \u89E3\u6790\u8BA1\u5212\u957F\u5EA6 ${effectiveInputs.length} \u4E0E loop phases ${loop.phases.length} \u4E0D\u4E00\u81F4`
    };
  }
  for (let index = 0; index < loop.phases.length; index++) {
    const phase = loop.phases[index];
    const resolutionInput = effectiveInputs[index];
    const resolvedStepId = resolutionInput.kind === "default" ? resolutionInput.stepId : resolutionInput.step.id;
    if (resolvedStepId !== phase) {
      return {
        status: "invalid",
        bundleId,
        reason: `workflow skill \u89E3\u6790\u8BA1\u5212\u7B2C ${index + 1} \u9879 step "${resolvedStepId}" \u4E0E loop phase "${phase}" \u4E0D\u4E00\u81F4`
      };
    }
    let slots;
    try {
      slots = resolveSkillBundle(deps.resolver, resolutionInput.kind === "default" ? { kind: "default", stepId: resolutionInput.stepId, profileId: bundleId } : { kind: "custom", step: resolutionInput.step, profileId: bundleId }).slots;
    } catch (error) {
      return {
        status: "invalid",
        bundleId,
        reason: `phase "${phase}" \u9759\u6001\u89E3\u6790\u5931\u8D25\uFF1A${errorMessage(error)}`
      };
    }
    for (const slot of slots) {
      const outcome = await locateSlot(deps.locator, slot.alternatives);
      if (!outcome.ok) {
        return {
          status: "invalid",
          bundleId,
          reason: `phase "${phase}" \u7684 skill \u69FD\u300C${slot.token}\u300D${outcome.detail}`
        };
      }
    }
  }
  return { status: "ready", bundleId, reason: null };
}

// packages/automation/dist/starters/wiring.js
function invalidReport(starterId, reason, loopId = null) {
  return {
    starterId,
    binding: { status: "invalid", loopId, reason },
    wiring: {
      status: "invalid",
      reason,
      workflow: { status: "invalid", workflowId: null, reason },
      customWorkflowRuntime: { status: "unwired", reason: "binding \u65E0\u6548\uFF0C\u672A\u5EFA\u7ACB custom workflow runtime \u5750\u6807" },
      skillBundle: null
    },
    runnable: false
  };
}
function wiringFailureReport(starterId, binding, workflow, customWorkflowRuntime) {
  return {
    starterId,
    binding,
    wiring: {
      status: workflow.status === "invalid" ? "invalid" : "unwired",
      reason: workflow.reason ?? customWorkflowRuntime.reason,
      workflow,
      customWorkflowRuntime,
      skillBundle: null
    },
    runnable: false
  };
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
async function buildLoopStarterWiringReport(starterId, loops, deps) {
  let catalogTemplate;
  try {
    catalogTemplate = validateAutomationPolicyTemplate(getAutomationPolicyTemplate(starterId));
  } catch (error) {
    return invalidReport(starterId, errorMessage2(error));
  }
  const candidates = loops.filter((entry) => entry.template_id === starterId);
  if (candidates.length !== 1) {
    return invalidReport(starterId, candidates.length === 0 ? `starter "${starterId}" \u672A\u7ED1\u5B9A\u4EFB\u4F55 registry loop` : `starter "${starterId}" \u540C\u65F6\u7ED1\u5B9A ${candidates.length} \u4E2A registry loop\uFF0C\u65E0\u6CD5\u786E\u5B9A\u552F\u4E00\u76EE\u6807`);
  }
  const target = candidates[0];
  if (!LOOP_RUNNERS.includes(target.runner)) {
    return invalidReport(starterId, `runner "${target.runner}" \u975E\u6CD5\uFF1B\u4EC5\u5141\u8BB8 ${LOOP_RUNNERS.join(" / ")}\uFF0C\u62D2\u7EDD\u9690\u5F0F\u964D\u7EA7\u6267\u884C`, target.id);
  }
  if (target.template_version === void 0) {
    return invalidReport(starterId, "template_version \u7F3A\u5931\uFF0C\u7248\u672C\u5316 starter binding \u4E0D\u5B8C\u6574", target.id);
  }
  if (target.template_version !== catalogTemplate.version) {
    return invalidReport(starterId, `template_version ${String(target.template_version)} \u4E0E catalog version ${catalogTemplate.version} \u4E0D\u4E00\u81F4`, target.id);
  }
  if (target.change_prefix !== null && target.change_prefix !== "") {
    const duplicateIds = loops.filter((entry) => entry.id !== target.id && entry.change_prefix === target.change_prefix).map((entry) => entry.id);
    if (duplicateIds.length > 0) {
      return invalidReport(starterId, `change_prefix "${target.change_prefix}" \u4E0E ${duplicateIds.join(", ")} \u5B8C\u5168\u91CD\u590D\uFF0C\u5F52\u5C5E\u5B58\u5728\u6B67\u4E49`, target.id);
    }
  }
  try {
    const policy = compileAutomationPolicyTemplate(starterId, { goal: target.goal, risk: target.risk }, target.template_version);
    const workflowId = target.workflow_id ?? null;
    const binding = { status: "valid", loopId: target.id, workflowId, policy };
    if (workflowId === null) {
      const reason2 = "workflow_id \u672A\u63A5\u7EBF\uFF1Btemplate recommendedWorkflow \u53EA\u662F\u5EFA\u8BAE\uFF0C\u4E0D\u80FD\u5192\u5145\u6301\u4E45 binding";
      return wiringFailureReport(starterId, binding, { status: "unwired", workflowId: null, reason: reason2 }, { status: "unwired", reason: "workflow binding \u7F3A\u5931\uFF0C\u672A\u5EFA\u7ACB runtime \u5750\u6807" });
    }
    let skillResolutionInputs;
    if (workflowId === "default") {
      const invalidPhase = target.phases.find((phase) => !PHASES.includes(phase));
      if (invalidPhase !== void 0) {
        const reason2 = `loop phase "${invalidPhase}" \u4E0D\u5728 default runtime PHASES \u95ED\u96C6\uFF08${PHASES.join(", ")}\uFF09`;
        return wiringFailureReport(starterId, binding, { status: "invalid", workflowId, reason: reason2 }, { status: "unwired", reason: "default workflow phase \u65E0\u6CD5\u6620\u5C04\u5230 runtime \u5750\u6807" });
      }
      skillResolutionInputs = target.phases.map((stepId) => ({ kind: "default", stepId }));
    } else {
      let definition;
      try {
        definition = (deps.loadWorkflow ?? loadWorkflow)(deps.repoRoot, workflowId);
      } catch (error) {
        const reason2 = `custom workflow "${workflowId}" \u52A0\u8F7D/\u6821\u9A8C/\u7F16\u8BD1\u5931\u8D25\uFF1A${errorMessage2(error)}`;
        return wiringFailureReport(starterId, binding, { status: "invalid", workflowId, reason: reason2 }, { status: "unwired", reason: "workflow \u52A0\u8F7D\u5931\u8D25\uFF0C\u672A\u5EFA\u7ACB custom runtime \u5750\u6807" });
      }
      if (definition === null) {
        const reason2 = `custom workflow "${workflowId}" \u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u7F3A\u5931\uFF0C\u65E0\u6CD5\u5EFA\u7ACB\u6267\u884C wiring`;
        return wiringFailureReport(starterId, binding, { status: "invalid", workflowId, reason: reason2 }, { status: "unwired", reason: "workflow \u5B9A\u4E49\u7F3A\u5931\uFF0C\u672A\u5EFA\u7ACB custom runtime \u5750\u6807" });
      }
      let compiled;
      try {
        compiled = (deps.compileWorkflow ?? compileWorkflow)(definition);
      } catch (error) {
        const reason2 = `custom workflow "${workflowId}" \u7F16\u8BD1\u5931\u8D25\uFF1A${errorMessage2(error)}`;
        return wiringFailureReport(starterId, binding, { status: "invalid", workflowId, reason: reason2 }, { status: "unwired", reason: "workflow \u7F16\u8BD1\u5931\u8D25\uFF0C\u672A\u5EFA\u7ACB custom runtime \u5750\u6807" });
      }
      const findStep = deps.resolveStep ?? resolveStep;
      const customInputs = [];
      for (const phase of target.phases) {
        const step = findStep(compiled, phase);
        if (step === null) {
          const reason2 = `loop phase/step "${phase}" \u672A\u5728 custom workflow "${workflowId}" \u4E2D\u58F0\u660E`;
          return wiringFailureReport(starterId, binding, { status: "invalid", workflowId, reason: reason2 }, { status: "unwired", reason: "loop phase \u65E0\u6CD5\u89E3\u6790\uFF0C\u672A\u5EFA\u7ACB custom runtime \u5750\u6807" });
        }
        customInputs.push({ kind: "custom", step });
      }
      skillResolutionInputs = customInputs;
    }
    const workflow = { status: "ready", workflowId, reason: null };
    const customWorkflowRuntime = workflowId === "default" || deps.customWorkflowRuntimeWired !== false ? { status: "ready", reason: null } : { status: "unwired", reason: `custom workflow "${workflowId}" \u7684\u751F\u4EA7 runtime coordinate \u672A\u63A5\u7EBF` };
    const evaluateSkills = deps.evaluateSkillBundleWiring ?? evaluateSkillBundleWiring;
    let skillBundle;
    try {
      skillBundle = await evaluateSkills(target, deps.skillBundleWiringForLoop?.(target) ?? deps.skillBundleWiring, skillResolutionInputs);
    } catch (error) {
      const reason2 = `skill bundle wiring evaluator \u5931\u8D25\uFF1A${errorMessage2(error)}`;
      return {
        starterId,
        binding,
        wiring: { status: "invalid", reason: reason2, workflow, customWorkflowRuntime, skillBundle: null },
        runnable: false
      };
    }
    const status = skillBundle.status === "invalid" ? "invalid" : skillBundle.status === "unwired" || customWorkflowRuntime.status === "unwired" ? "unwired" : "ready";
    const reason = skillBundle.status !== "ready" ? skillBundle.reason : customWorkflowRuntime.reason;
    return {
      starterId,
      binding,
      wiring: { status, reason, workflow, customWorkflowRuntime, skillBundle },
      runnable: target.status === "active" && status === "ready"
    };
  } catch (error) {
    return invalidReport(starterId, errorMessage2(error), target.id);
  }
}
async function evaluateLoopExecutionWiring(loop, loops, deps) {
  if (!LOOP_RUNNERS.includes(loop.runner)) {
    return {
      status: "invalid",
      loopId: loop.id,
      dimension: "runner",
      reason: `runner "${loop.runner}" \u975E\u6CD5\uFF1B\u4EC5\u5141\u8BB8 ${LOOP_RUNNERS.join(" / ")}`,
      starter: null
    };
  }
  if (loop.template_id !== void 0) {
    const starter = await buildLoopStarterWiringReport(loop.template_id, loops, deps);
    if (starter.binding.status !== "valid") {
      return {
        status: "invalid",
        loopId: loop.id,
        dimension: "template",
        reason: starter.wiring.reason ?? "starter binding invalid",
        starter
      };
    }
    if (starter.wiring.workflow.status !== "ready" || starter.wiring.customWorkflowRuntime.status !== "ready") {
      return {
        status: starter.wiring.status === "unwired" ? "unwired" : "invalid",
        loopId: loop.id,
        dimension: "workflow",
        reason: starter.wiring.reason ?? "workflow wiring unavailable",
        starter
      };
    }
    if (starter.wiring.skillBundle?.status !== "ready") {
      return {
        status: starter.wiring.skillBundle?.status === "unwired" ? "unwired" : "invalid",
        loopId: loop.id,
        dimension: "skill-bundle",
        reason: starter.wiring.reason ?? "skill bundle wiring unavailable",
        starter
      };
    }
    return { status: "ready", loopId: loop.id, starter };
  }
  const skill = await (deps.evaluateSkillBundleWiring ?? evaluateSkillBundleWiring)(loop, deps.skillBundleWiringForLoop?.(loop) ?? deps.skillBundleWiring, loop.phases.map((stepId) => ({ kind: "default", stepId })));
  if (skill.status !== "ready") {
    return {
      status: skill.status,
      loopId: loop.id,
      dimension: "skill-bundle",
      reason: skill.reason ?? "skill bundle wiring unavailable",
      starter: null
    };
  }
  return { status: "ready", loopId: loop.id, starter: null };
}

// packages/server/src/workflows.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import {
  constants as constants5,
  fstatSync as fstatSync5,
  fsyncSync as fsyncSync2,
  lstatSync as lstatSync4,
  openSync as openSync5,
  readFileSync as readFileSync16,
  readdirSync as readdirSync6,
  renameSync as renameSync3,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync3
} from "node:fs";

// packages/server/src/workflowTrustedFs.ts
import {
  constants as constants3,
  fstatSync as fstatSync3,
  lstatSync as lstatSync3,
  mkdirSync as mkdirSync3,
  openSync as openSync3,
  realpathSync as realpathSync2,
  unlinkSync
} from "node:fs";
import { isAbsolute as isAbsolute5, join as join29, relative as relative5, sep as sep7 } from "node:path";

// packages/server/src/workflowRootAnchor.ts
import {
  closeSync as closeSync2,
  constants as constants2,
  fstatSync as fstatSync2,
  lstatSync as lstatSync2,
  openSync as openSync2,
  realpathSync
} from "node:fs";
import { join as join28, resolve as resolvePath2 } from "node:path";
function sameIdentity(current, expected) {
  return current.dev === expected.dev && current.ino === expected.ino;
}
function safeClose(fd) {
  try {
    closeSync2(fd);
  } catch {
  }
}
function lstatIfExists(path7) {
  try {
    return lstatSync2(path7);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function traversableDirectoryFdPath(fd, expected) {
  const candidates = process.platform === "linux" ? [`/proc/self/fd/${fd}`, `/dev/fd/${fd}`] : [`/dev/fd/${fd}`, `/proc/self/fd/${fd}`];
  for (const candidate of candidates) {
    try {
      const current = lstatSync2(join28(candidate, "."));
      if (current.isDirectory() && sameIdentity(current, expected)) return candidate;
    } catch {
    }
  }
  return void 0;
}
function captureWorkflowRootAnchor(root) {
  const path7 = resolvePath2(root);
  const lexical = lstatSync2(path7);
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) {
    throw new Error(`registered root \u5FC5\u987B\u662F\u975E symlink \u7684\u771F\u5B9E\u76EE\u5F55: ${path7}`);
  }
  const fd = openSync2(path7, constants2.O_RDONLY | constants2.O_DIRECTORY | constants2.O_NOFOLLOW);
  try {
    const opened = fstatSync2(fd);
    if (!opened.isDirectory() || !sameIdentity(opened, lexical)) {
      throw new Error(`registered root \u5728\u6355\u83B7\u671F\u95F4\u88AB\u66FF\u6362: ${path7}`);
    }
    const realPath = realpathSync(path7);
    const fresh = lstatSync2(path7);
    if (fresh.isSymbolicLink() || !fresh.isDirectory() || !sameIdentity(fresh, opened)) {
      throw new Error(`registered root \u5728\u6355\u83B7\u671F\u95F4\u88AB\u66FF\u6362: ${path7}`);
    }
    const fdPath = traversableDirectoryFdPath(fd, opened);
    return fdPath ? { path: path7, realPath, dev: opened.dev, ino: opened.ino, fd, fdPath } : { path: path7, realPath, dev: opened.dev, ino: opened.ino, fd };
  } catch (error) {
    safeClose(fd);
    throw error;
  }
}
function assertWorkflowRootAnchor(anchor) {
  const lexical = lstatSync2(anchor.path);
  if (lexical.isSymbolicLink() || !lexical.isDirectory() || !sameIdentity(lexical, anchor)) {
    throw new Error(`registered root \u8BCD\u6CD5\u8DEF\u5F84\u5DF2\u4E0D\u518D\u6307\u5411\u6CE8\u518C\u65F6\u76EE\u5F55: ${anchor.path}`);
  }
  const opened = fstatSync2(anchor.fd);
  if (!opened.isDirectory() || !sameIdentity(opened, anchor)) {
    throw new Error(`registered root \u76EE\u5F55 fd \u8EAB\u4EFD\u5DF2\u5931\u6548: ${anchor.path}`);
  }
  if (realpathSync(anchor.path) !== anchor.realPath) {
    throw new Error(`registered root canonical realpath \u5DF2\u53D8\u5316: ${anchor.path}`);
  }
}
function closeWorkflowRootAnchor(anchor) {
  safeClose(anchor.fd);
}

// packages/server/src/workflowTypes.ts
var WorkflowNotFoundError = class extends Error {
};
var WorkflowDeleteConflictError = class extends Error {
  _tag = "WorkflowDeleteConflictError";
  constructor(message) {
    super(message);
    this.name = "WorkflowDeleteConflictError";
  }
};

// packages/server/src/workflowTrustedFs.ts
function assertInsideRoot(realRoot, realPath, label) {
  const fromRoot = relative5(realRoot, realPath);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep7}`) || isAbsolute5(fromRoot)) {
    throw new Error(`${label} \u5DF2\u9003\u9038 registered root: ${realPath}`);
  }
}
function rootDirectory(anchor) {
  return {
    lexicalPath: anchor.path,
    operationPath: anchor.fdPath ?? anchor.path,
    realPath: anchor.realPath,
    dev: anchor.dev,
    ino: anchor.ino,
    fd: anchor.fd,
    ...anchor.fdPath ? { fdPath: anchor.fdPath } : {}
  };
}
function assertDirectoryStillTrusted(directory, root) {
  assertWorkflowRootAnchor(root);
  const opened = fstatSync3(directory.fd);
  if (!opened.isDirectory() || !sameIdentity(opened, directory)) {
    throw new Error(`workflow \u76EE\u5F55 fd \u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF08TOCTOU\uFF09: ${directory.lexicalPath}`);
  }
  const operationEntry = lstatSync3(directory.operationPath);
  if (operationEntry.isSymbolicLink() || !operationEntry.isDirectory() || !sameIdentity(operationEntry, directory)) {
    throw new Error(`workflow \u76EE\u5F55\u64CD\u4F5C\u8DEF\u5F84\u5DF2\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${directory.lexicalPath}`);
  }
  const lexicalEntry = lstatSync3(directory.lexicalPath);
  if (lexicalEntry.isSymbolicLink() || !lexicalEntry.isDirectory() || !sameIdentity(lexicalEntry, directory)) {
    throw new Error(`workflow \u76EE\u5F55\u8BCD\u6CD5\u8DEF\u5F84\u5DF2\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${directory.lexicalPath}`);
  }
  const freshRealPath = realpathSync2(directory.operationPath);
  if (freshRealPath !== directory.realPath) {
    throw new Error(`workflow \u76EE\u5F55 canonical realpath \u5DF2\u53D8\u5316\uFF08TOCTOU\uFF09: ${directory.lexicalPath}`);
  }
  assertInsideRoot(root.realPath, freshRealPath, "workflow \u76EE\u5F55");
}
function openTrustedChildDirectory(root, parent, name, create) {
  if (parent.lexicalPath === root.path) assertWorkflowRootAnchor(root);
  else assertDirectoryStillTrusted(parent, root);
  const lexicalPath = join29(parent.lexicalPath, name);
  const operationPath = join29(parent.fdPath ?? parent.lexicalPath, name);
  let before = lstatIfExists(operationPath);
  if (!before) {
    if (!create) return void 0;
    try {
      mkdirSync3(operationPath);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    before = lstatIfExists(operationPath);
    if (!before) throw new Error(`workflow \u76EE\u5F55\u521B\u5EFA\u540E\u4E0D\u5B58\u5728: ${lexicalPath}`);
  }
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`workflow \u8DEF\u5F84\u4E0D\u5B89\u5168\uFF08\u987B\u4E3A\u771F\u5B9E\u76EE\u5F55\uFF09: ${lexicalPath}`);
  }
  const fd = openSync3(operationPath, constants3.O_RDONLY | constants3.O_DIRECTORY | constants3.O_NOFOLLOW);
  try {
    const opened = fstatSync3(fd);
    if (!opened.isDirectory() || !sameIdentity(opened, before)) {
      throw new Error(`workflow \u76EE\u5F55\u5728\u6253\u5F00\u671F\u95F4\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${lexicalPath}`);
    }
    const realPath = realpathSync2(operationPath);
    assertInsideRoot(root.realPath, realPath, "workflow \u76EE\u5F55");
    const fdPath = traversableDirectoryFdPath(fd, opened);
    const directory = fdPath ? { lexicalPath, operationPath, realPath, dev: opened.dev, ino: opened.ino, fd, fdPath } : { lexicalPath, operationPath, realPath, dev: opened.dev, ino: opened.ino, fd };
    if (parent.lexicalPath === root.path) assertWorkflowRootAnchor(root);
    else assertDirectoryStillTrusted(parent, root);
    assertDirectoryStillTrusted(directory, root);
    return directory;
  } catch (e) {
    safeClose(fd);
    throw e;
  }
}
function withTrustedDirectoryChain(root, names, create, onMissing, use) {
  const opened = [];
  try {
    let parent = rootDirectory(root);
    for (const name of names) {
      const child = openTrustedChildDirectory(root, parent, name, create);
      if (!child) return onMissing();
      opened.push(child);
      parent = child;
    }
    return use(parent);
  } finally {
    for (const directory of opened.reverse()) safeClose(directory.fd);
  }
}
function assertOptionalRegularChild(directory, root, name, label) {
  assertDirectoryStillTrusted(directory, root);
  const paths = childEntry(directory, name);
  const entry = lstatIfExists(paths.operation);
  if (!entry) return;
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`${label} \u5FC5\u987B\u662F\u975E symlink \u666E\u901A\u6587\u4EF6: ${paths.lexical}`);
  }
  if (paths.operation !== paths.lexical) {
    const lexical = lstatSync3(paths.lexical);
    if (lexical.isSymbolicLink() || !lexical.isFile() || !sameIdentity(lexical, entry)) {
      throw new Error(`${label} \u8BCD\u6CD5\u8DEF\u5F84\u8EAB\u4EFD\u4E0D\u4E00\u81F4: ${paths.lexical}`);
    }
  }
  assertDirectoryStillTrusted(directory, root);
}
function assertOptionalTrustedChildDirectory(directory, root, name) {
  const child = openTrustedChildDirectory(root, directory, name, false);
  if (child) safeClose(child.fd);
}
function ensureWorkflowProjectCoordinationPath(root) {
  withTrustedDirectoryChain(root, [".pipeline"], true, () => {
    throw new Error("workflow \u5F15\u7528\u534F\u8C03\u76EE\u5F55\u521B\u5EFA\u5931\u8D25");
  }, (pipeline) => {
    assertOptionalRegularChild(pipeline, root, "tracks.yaml", "tracks registry");
    assertOptionalTrustedChildDirectory(pipeline, root, ".pipeline.lock");
  });
}
function ensureWorkflowGovernanceCoordinationPath(root) {
  ensureWorkflowProjectCoordinationPath(root);
  withTrustedDirectoryChain(root, [".pipeline"], false, () => {
    throw new Error("workflow \u5F15\u7528\u534F\u8C03\u76EE\u5F55\u610F\u5916\u6D88\u5931");
  }, (pipeline) => {
    assertOptionalRegularChild(pipeline, root, "loops.yaml", "loops registry");
  });
  withTrustedDirectoryChain(root, [".pipeline", "loops", "governance"], true, () => {
    throw new Error("workflow governance \u534F\u8C03\u76EE\u5F55\u521B\u5EFA\u5931\u8D25");
  }, (governance) => {
    assertDirectoryStillTrusted(governance, root);
    assertOptionalTrustedChildDirectory(governance, root, ".pipeline.lock");
  });
}
function acquireRoot(root) {
  if (typeof root === "string") return { anchor: captureWorkflowRootAnchor(root), owned: true };
  assertWorkflowRootAnchor(root);
  return { anchor: root, owned: false };
}
function withWorkflowDirectories(rootInput, create, onMissing, use) {
  const { anchor: root, owned } = acquireRoot(rootInput);
  let pipeline;
  let workflows;
  try {
    const rootDir = rootDirectory(root);
    pipeline = openTrustedChildDirectory(root, rootDir, ".pipeline", create);
    if (!pipeline) return onMissing();
    workflows = openTrustedChildDirectory(root, pipeline, "workflows", create);
    if (!workflows) return onMissing();
    const directories = { root, pipeline, workflows };
    assertWorkflowDirectoriesStillTrusted(directories);
    return use(directories);
  } finally {
    if (workflows) safeClose(workflows.fd);
    if (pipeline) safeClose(pipeline.fd);
    if (owned) closeWorkflowRootAnchor(root);
  }
}
function assertWorkflowDirectoriesStillTrusted(directories) {
  assertWorkflowRootAnchor(directories.root);
  assertDirectoryStillTrusted(directories.pipeline, directories.root);
  assertDirectoryStillTrusted(directories.workflows, directories.root);
}
function childEntry(directory, name) {
  return {
    lexical: join29(directory.lexicalPath, name),
    operation: join29(directory.fdPath ?? directory.lexicalPath, name)
  };
}
var WORKFLOW_NAME_RE2 = /^[\p{L}\p{N}\p{M}_-]+$/u;
function isWorkflowName(name) {
  return name !== "" && WORKFLOW_NAME_RE2.test(name);
}
function assertWorkflowName(name) {
  if (!isWorkflowName(name)) {
    throw new Error("\u975E\u6CD5 workflow \u540D\uFF08\u5141\u8BB8\u4E2D\u6587\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001- \u4E0E _\uFF1B\u4E0D\u5141\u8BB8\u7A7A\u683C\u3001\u70B9\u6216\u8DEF\u5F84\u7B26\u53F7\uFF09");
  }
}
function assertEntryMatches(paths, expected, label) {
  const operationEntry = lstatSync3(paths.operation);
  if (operationEntry.isSymbolicLink() || !operationEntry.isFile() || !sameIdentity(operationEntry, expected)) {
    throw new Error(`${label} \u5DF2\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${paths.lexical}`);
  }
  if (paths.operation !== paths.lexical) {
    const lexicalEntry = lstatSync3(paths.lexical);
    if (lexicalEntry.isSymbolicLink() || !lexicalEntry.isFile() || !sameIdentity(lexicalEntry, expected)) {
      throw new Error(`${label} \u8BCD\u6CD5\u8DEF\u5F84\u5DF2\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${paths.lexical}`);
    }
  }
}
function assertTargetUnchanged(paths, expected) {
  const current = lstatIfExists(paths.operation);
  if (!expected) {
    if (current) throw new Error(`workflow \u5199\u5165\u76EE\u6807\u5728\u53D1\u5E03\u524D\u51FA\u73B0\uFF08TOCTOU\uFF09: ${paths.lexical}`);
    return;
  }
  if (!current || current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, expected)) {
    throw new Error(`workflow \u5199\u5165\u76EE\u6807\u5728\u53D1\u5E03\u524D\u88AB\u66FF\u6362\uFF08TOCTOU\uFF09: ${paths.lexical}`);
  }
}
function cleanupOwnedTempFile(paths, expected, directories) {
  if (!expected) return;
  try {
    assertWorkflowDirectoriesStillTrusted(directories);
    const current = lstatIfExists(paths.operation);
    if (!current || current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, expected)) return;
    unlinkSync(paths.operation);
  } catch {
  }
}
function errText3(error) {
  return error instanceof Error ? error.message : String(error);
}

// packages/server/src/workflowReferenceScan.ts
import { constants as constants4, fstatSync as fstatSync4, openSync as openSync4, readFileSync as readFileSync15, readdirSync as readdirSync5 } from "node:fs";
function decodeUtf8Strict(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} \u4E0D\u662F\u5408\u6CD5 UTF-8\uFF1A${errText3(error)}`);
  }
}
function readTrustedRegularFile(directory, root, name, label, missing3) {
  const paths = childEntry(directory, name);
  assertDirectoryStillTrusted(directory, root);
  let fd;
  try {
    fd = openSync4(paths.operation, constants4.O_RDONLY | constants4.O_NOFOLLOW);
  } catch (error) {
    if (error.code === "ENOENT" && missing3 === "null") return null;
    if (error.code === "ENOENT") throw new Error(`${label} \u7F3A\u5931: ${paths.lexical}`);
    throw error;
  }
  try {
    const opened = fstatSync4(fd);
    if (!opened.isFile()) throw new Error(`${label} \u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u6587\u4EF6: ${paths.lexical}`);
    const identity = { dev: opened.dev, ino: opened.ino };
    assertEntryMatches(paths, identity, label);
    assertDirectoryStillTrusted(directory, root);
    const bytes = readFileSync15(fd);
    assertEntryMatches(paths, identity, label);
    assertDirectoryStillTrusted(directory, root);
    return bytes;
  } finally {
    safeClose(fd);
  }
}
function workflowWriteTrackRegistry(directories) {
  const bytes = readTrustedRegularFile(
    directories.pipeline,
    directories.root,
    "tracks.yaml",
    "tracks registry",
    "null"
  );
  if (bytes === null) {
    const ordered = [...BUILTIN_TRACK_DEFINITIONS];
    return {
      registry: {
        ordered,
        byId: new Map(ordered.map((track) => [track.id, track])),
        revision: "workflow-write:builtin-only",
        source: "builtin-only"
      }
    };
  }
  try {
    const config = parseTrackRegistry(decodeUtf8Strict(bytes, "tracks registry"));
    const structuralErrors = [...validateTrackConfigStructure(config)];
    if (structuralErrors.length > 0) {
      return { errors: structuralErrors.map((error) => `.pipeline/tracks.yaml: ${error}`) };
    }
    const seed = BUILTIN_TRACK_DEFINITIONS[0];
    if (seed === void 0) return { errors: ["builtin track catalog \u4E3A\u7A7A"] };
    const dynamic = (config.tracks ?? []).flatMap(
      (entry) => typeof entry.id === "string" && typeof entry.label === "string" ? [{ ...seed, id: entry.id, label: entry.label, builtin: false }] : []
    );
    const ordered = [...BUILTIN_TRACK_DEFINITIONS, ...dynamic];
    return {
      registry: {
        ordered,
        byId: new Map(ordered.map((track) => [track.id, track])),
        revision: "workflow-write:project-file",
        source: "project-file"
      }
    };
  } catch (error) {
    return { errors: [`tracks registry \u65E0\u6CD5\u5F62\u6210\u5F15\u7528\u6821\u9A8C\u5FEB\u7167\uFF1A${errText3(error)}`] };
  }
}
function collectTrackReferences(registry, workflow) {
  const references = [];
  for (const track of registry.ordered) {
    if (track.workflow.default === workflow) {
      references.push({ kind: "track-default", source: `track:${track.id}` });
    }
    if (track.workflow.allowed !== "*" && track.workflow.allowed.includes(workflow)) {
      references.push({ kind: "track-allowed", source: `track:${track.id}` });
    }
  }
  return references;
}
function collectPolicyTemplateReferences(workflow) {
  return listAutomationPolicyTemplates().filter((template) => template.recommendedWorkflow === workflow).map((template) => ({
    kind: "policy-template-recommended",
    source: `template:${template.id}`
  }));
}
function validateStateWorkflowText(text2, change) {
  if (text2.includes("\0")) throw new Error("state \u542B NUL \u5B57\u8282");
  const counts = /* @__PURE__ */ new Map();
  const workflowValues = [];
  for (const line of text2.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_]+):(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1];
    const scalar5 = match[2];
    if (field === void 0 || scalar5 === void 0) continue;
    counts.set(field, (counts.get(field) ?? 0) + 1);
    if (field === "workflow") workflowValues.push(unquoteScalar(scalar5.trim()));
  }
  for (const required2 of ["track", "phase"]) {
    if (counts.get(required2) !== 1) {
      throw new Error(`state.${required2} \u987B\u4E14\u53EA\u80FD\u51FA\u73B0\u4E00\u6B21\uFF08\u5B9E\u9645 ${counts.get(required2) ?? 0}\uFF09`);
    }
  }
  const workflowCount = counts.get("workflow") ?? 0;
  if (workflowCount > 1) throw new Error(`state.workflow \u91CD\u590D\uFF08${workflowCount} \u6B21\uFF09`);
  const state = parsePipeline(text2);
  const knownFields = new Set(FIELD_ORDER);
  const hiddenKnownFields = state.opaqueTail.split(/\r?\n/).map((line) => /^([A-Za-z0-9_]+):/.exec(line)?.[1]).filter((field) => field !== void 0 && knownFields.has(field));
  if (hiddenKnownFields.length > 0) {
    throw new Error(`state parser \u5728\u5DF2\u77E5\u5B57\u6BB5\u524D\u63D0\u524D\u505C\u6B62\uFF1BopaqueTail \u9690\u85CF\u5B57\u6BB5: ${hiddenKnownFields.join(", ")}`);
  }
  const raw = state.fields.workflow;
  if (Array.isArray(raw)) throw new Error("state.workflow \u975E\u6807\u91CF");
  if (workflowValues.length === 1 && workflowValues[0] !== raw) {
    throw new Error(`state.workflow \u539F\u6587\u5B57\u6BB5 '${workflowValues[0]}' \u672A\u88AB parser \u6D88\u8D39\uFF08\u89E3\u6790\u503C '${raw}'\uFF09`);
  }
  const workflow = resolveWorkflowName(state);
  if (workflow !== "default" && !isWorkflowName(workflow)) {
    throw new Error(`state.workflow \u975E\u6CD5: change '${change}' = '${workflow}'`);
  }
  return workflow;
}
function readTrustedChangeRelativeText(changeDir, root, relativePath) {
  const parts = relativePath.split(/[\\/]/).filter((part) => part !== "");
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`canonical state reader \u6536\u5230\u975E\u6CD5\u76F8\u5BF9\u8DEF\u5F84: ${relativePath}`);
  }
  const opened = [];
  let parent = changeDir;
  try {
    for (const part of parts.slice(0, -1)) {
      const next = openTrustedChildDirectory(root, parent, part, false);
      if (next === void 0) return void 0;
      opened.push(next);
      parent = next;
    }
    const fileName = parts.at(-1);
    if (fileName === void 0) throw new Error(`canonical state reader \u6536\u5230\u7A7A\u8DEF\u5F84: ${relativePath}`);
    const bytes = readTrustedRegularFile(
      parent,
      root,
      fileName,
      `canonical state ${relativePath}`,
      "null"
    );
    return bytes === null ? void 0 : decodeUtf8Strict(bytes, `canonical state ${relativePath}`);
  } finally {
    for (const directory of opened.reverse()) safeClose(directory.fd);
  }
}
function scanActiveChangeReferences(root, workflow) {
  const references = [];
  const blockers = [];
  try {
    return withTrustedDirectoryChain(root, ["openspec", "changes"], false, () => ({ references, blockers }), (changes) => {
      assertDirectoryStillTrusted(changes, root);
      const entries = readdirSync5(changes.fdPath ?? changes.lexicalPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name === "archive") {
          try {
            const archive = openTrustedChildDirectory(root, changes, entry.name, false);
            if (!archive) throw new Error("archive \u5728\u679A\u4E3E\u540E\u6D88\u5931");
            safeClose(archive.fd);
          } catch (error) {
            blockers.push({ source: "changes:archive", detail: errText3(error) });
          }
          continue;
        }
        const source = `change:${entry.name}`;
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-zA-Z0-9_-]+$/.test(entry.name) || entry.name.includes("..")) {
          blockers.push({ source, detail: "\u6D3B\u8DC3 changes \u679A\u4E3E\u9879\u5FC5\u987B\u662F\u5B89\u5168\u547D\u540D\u7684\u975E symlink \u76EE\u5F55" });
          continue;
        }
        let changeDir;
        try {
          changeDir = openTrustedChildDirectory(root, changes, entry.name, false);
          if (!changeDir) throw new Error("change \u5728\u679A\u4E3E\u540E\u6D88\u5931");
          const capturedChangeDir = changeDir;
          const canonical = readCurrentRunRevisionFromSync(
            (relativePath) => readTrustedChangeRelativeText(capturedChangeDir, root, relativePath),
            capturedChangeDir.lexicalPath
          );
          let observed;
          if (canonical !== void 0) {
            observed = resolveWorkflowName(canonical.state);
            if (observed !== "default" && !isWorkflowName(observed)) {
              throw new Error(`canonical state.workflow \u975E\u6CD5: change '${entry.name}' = '${observed}'`);
            }
          } else {
            const bytes = readTrustedRegularFile(changeDir, root, ".pipeline.yaml", "legacy change state", "error");
            if (!bytes) throw new Error("change state \u7F3A\u5931");
            observed = validateStateWorkflowText(decodeUtf8Strict(bytes, "legacy change state"), entry.name);
          }
          if (observed === workflow) references.push({ kind: "active-change", source });
        } catch (error) {
          blockers.push({ source, detail: errText3(error) });
        } finally {
          if (changeDir) safeClose(changeDir.fd);
        }
      }
      assertDirectoryStillTrusted(changes, root);
      return { references, blockers };
    });
  } catch (error) {
    blockers.push({ source: "changes", detail: errText3(error) });
    return { references, blockers };
  }
}
function scanLoopReferences(root, workflow) {
  const references = [];
  const blockers = [];
  try {
    return withTrustedDirectoryChain(root, [".pipeline"], false, () => ({ references, blockers }), (pipeline) => {
      const bytes = readTrustedRegularFile(pipeline, root, "loops.yaml", "loops registry", "null");
      if (!bytes) return { references, blockers };
      const text2 = decodeUtf8Strict(bytes, "loops registry");
      const loaded = loadRegistry(root.path, { readText: () => text2 });
      if (loaded.errors.length > 0 || !loaded.data) {
        blockers.push({
          source: "loops-registry",
          detail: loaded.errors.length > 0 ? loaded.errors.join("\uFF1B") : "loops registry \u65E0\u6CD5\u5F62\u6210\u6709\u6548\u5FEB\u7167"
        });
        return { references, blockers };
      }
      for (const loop of loaded.data.loops) {
        if (loop.workflow_id === workflow) references.push({ kind: "loop-binding", source: `loop:${loop.id}` });
      }
      return { references, blockers };
    });
  } catch (error) {
    blockers.push({ source: "loops-registry", detail: errText3(error) });
    return { references, blockers };
  }
}
function scanWorkflowReferencesForApi(root, workflow, registry) {
  assertWorkflowName(workflow);
  assertWorkflowRootAnchor(root);
  const changes = scanActiveChangeReferences(root, workflow);
  const loops = scanLoopReferences(root, workflow);
  return {
    references: [
      ...collectTrackReferences(registry, workflow),
      ...collectPolicyTemplateReferences(workflow),
      ...changes.references,
      ...loops.references
    ].sort((a, b) => a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind)),
    blockers: [...changes.blockers, ...loops.blockers].sort((a, b) => a.source.localeCompare(b.source) || a.detail.localeCompare(b.detail))
  };
}

// packages/server/src/workflows.ts
function captureWorkflowDeletePermit(root, name) {
  assertWorkflowName(name);
  return withWorkflowDirectories(root, false, () => null, (directories) => {
    const target = childEntry(directories.workflows, `${name}.yaml`);
    assertWorkflowDirectoriesStillTrusted(directories);
    let fd;
    try {
      fd = openSync5(target.operation, constants5.O_RDONLY | constants5.O_NOFOLLOW);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    try {
      const opened = fstatSync5(fd);
      if (!opened.isFile()) throw new Error(`workflow \u5220\u9664\u76EE\u6807\u4E0D\u5B89\u5168\uFF08\u987B\u4E3A\u666E\u901A\u6587\u4EF6\uFF09: ${target.lexical}`);
      const identity = { dev: opened.dev, ino: opened.ino };
      assertEntryMatches(target, identity, "workflow \u5220\u9664\u76EE\u6807");
      assertWorkflowDirectoriesStillTrusted(directories);
      return { name, ...identity };
    } finally {
      safeClose(fd);
    }
  });
}
function listWorkflowNames(root) {
  return withWorkflowDirectories(root, false, () => [], (directories) => {
    assertWorkflowDirectoriesStillTrusted(directories);
    const names = readdirSync6(directories.workflows.fdPath ?? directories.workflows.lexicalPath).filter((file) => file.endsWith(".yaml") && file !== "default.yaml");
    for (const file of names) {
      const paths = childEntry(directories.workflows, file);
      const entry = lstatSync4(paths.operation);
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`workflow \u5217\u8868\u76EE\u6807\u4E0D\u5B89\u5168\uFF08\u987B\u4E3A\u666E\u901A\u6587\u4EF6\uFF09: ${paths.lexical}`);
      }
    }
    assertWorkflowDirectoriesStillTrusted(directories);
    return names.map((file) => file.slice(0, -".yaml".length));
  });
}
function readWorkflowForApi(root, name) {
  assertWorkflowName(name);
  return withWorkflowDirectories(
    root,
    false,
    () => {
      throw new WorkflowNotFoundError(`workflow '${name}' \u672A\u627E\u5230`);
    },
    (directories) => {
      const paths = childEntry(directories.workflows, `${name}.yaml`);
      assertWorkflowDirectoriesStillTrusted(directories);
      let fd;
      try {
        fd = openSync5(paths.operation, constants5.O_RDONLY | constants5.O_NOFOLLOW);
      } catch (e) {
        if (e.code === "ENOENT") {
          throw new WorkflowNotFoundError(`workflow '${name}' \u672A\u627E\u5230`);
        }
        throw e;
      }
      try {
        const opened = fstatSync5(fd);
        if (!opened.isFile()) throw new Error(`workflow \u8BFB\u53D6\u76EE\u6807\u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u6587\u4EF6: ${paths.lexical}`);
        assertEntryMatches(paths, opened, "workflow \u8BFB\u53D6\u76EE\u6807");
        assertWorkflowDirectoriesStillTrusted(directories);
        const wf = parseWorkflow(readFileSync16(fd, "utf8"));
        const errors = validateWorkflow(wf);
        if (errors.length > 0) {
          throw new Error(
            `ERROR: workflow '${name}' \u6821\u9A8C\u5931\u8D25\uFF08${paths.lexical}\uFF09\uFF1A
${errors.map((e) => `  - ${e}`).join("\n")}`
          );
        }
        return wf;
      } finally {
        safeClose(fd);
      }
    }
  );
}
function writeWorkflowForApi(root, name, wf) {
  assertWorkflowName(name);
  const errors = validateWorkflow(wf);
  if (wf.name !== name) errors.unshift(`workflow name '${wf.name}' \u5FC5\u987B\u4E0E\u5B58\u50A8\u952E '${name}' \u4E00\u81F4`);
  if (errors.length > 0) return { ok: false, errors };
  const content = serializeWorkflow(wf);
  return withWorkflowDirectories(root, true, () => {
    throw new Error("workflow \u76EE\u5F55\u521B\u5EFA\u5931\u8D25");
  }, (directories) => {
    const trackSnapshot = workflowWriteTrackRegistry(directories);
    if ("errors" in trackSnapshot) return { ok: false, errors: trackSnapshot.errors };
    const referenceErrors = validateWorkflowTrackReferences(wf, trackSnapshot.registry);
    if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };
    const target = childEntry(directories.workflows, `${name}.yaml`);
    const temp = childEntry(
      directories.workflows,
      `${name}.yaml.tmp.${process.pid}.${randomUUID6()}`
    );
    let tempFd;
    let tempIdentity;
    let committed = false;
    try {
      assertWorkflowDirectoriesStillTrusted(directories);
      tempFd = openSync5(
        temp.operation,
        constants5.O_WRONLY | constants5.O_CREAT | constants5.O_EXCL | constants5.O_NOFOLLOW,
        384
      );
      writeFileSync3(tempFd, content, "utf8");
      fsyncSync2(tempFd);
      const tempStat = fstatSync5(tempFd);
      if (!tempStat.isFile()) throw new Error(`workflow \u4E34\u65F6\u76EE\u6807\u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u6587\u4EF6: ${temp.lexical}`);
      tempIdentity = { dev: tempStat.dev, ino: tempStat.ino };
      assertEntryMatches(temp, tempIdentity, "workflow \u4E34\u65F6\u6587\u4EF6");
      const existing = lstatIfExists(target.operation);
      if (existing?.isSymbolicLink() || existing && !existing.isFile()) {
        throw new Error(`workflow \u5199\u5165\u76EE\u6807\u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u6587\u4EF6: ${target.lexical}`);
      }
      const expectedTarget = existing ? { dev: existing.dev, ino: existing.ino } : void 0;
      assertWorkflowDirectoriesStillTrusted(directories);
      assertTargetUnchanged(target, expectedTarget);
      assertEntryMatches(temp, tempIdentity, "workflow \u4E34\u65F6\u6587\u4EF6");
      renameSync3(temp.operation, target.operation);
      committed = true;
      return { ok: true };
    } catch (e) {
      if (!committed) cleanupOwnedTempFile(temp, tempIdentity, directories);
      throw e;
    } finally {
      if (tempFd !== void 0) safeClose(tempFd);
    }
  });
}
function deleteWorkflowForApi(root, name, permit) {
  assertWorkflowName(name);
  if (permit && permit.name !== name) {
    throw new WorkflowDeleteConflictError(`workflow \u5220\u9664 permit \u540D\u79F0\u4E0D\u5339\u914D\uFF1A${permit.name} != ${name}`);
  }
  return withWorkflowDirectories(root, false, () => false, (directories) => {
    const target = childEntry(directories.workflows, `${name}.yaml`);
    assertWorkflowDirectoriesStillTrusted(directories);
    let fd;
    try {
      fd = openSync5(target.operation, constants5.O_RDONLY | constants5.O_NOFOLLOW);
    } catch (e) {
      if (e.code === "ENOENT") {
        if (permit) throw new WorkflowDeleteConflictError(`workflow '${name}' \u5728\u5F15\u7528\u626B\u63CF\u671F\u95F4\u6D88\u5931`);
        return false;
      }
      throw e;
    }
    try {
      const opened = fstatSync5(fd);
      if (!opened.isFile()) throw new Error(`workflow \u5220\u9664\u76EE\u6807\u4E0D\u5B89\u5168\uFF08\u987B\u4E3A\u666E\u901A\u6587\u4EF6\uFF09: ${target.lexical}`);
      const expectedIdentity = { dev: opened.dev, ino: opened.ino };
      if (permit && !sameIdentity(opened, permit)) {
        throw new WorkflowDeleteConflictError(`workflow '${name}' \u5728\u5F15\u7528\u626B\u63CF\u671F\u95F4\u5DF2\u88AB\u66FF\u6362`);
      }
      assertEntryMatches(target, expectedIdentity, "workflow \u5220\u9664\u76EE\u6807");
      assertWorkflowDirectoriesStillTrusted(directories);
      assertEntryMatches(target, expectedIdentity, "workflow \u5220\u9664\u76EE\u6807");
      unlinkSync2(target.operation);
      return true;
    } finally {
      safeClose(fd);
    }
  });
}

// packages/server/src/token.ts
import { randomBytes as randomBytes3, timingSafeEqual } from "node:crypto";
import { writeFile as writeFile9 } from "node:fs/promises";
function generateToken() {
  return randomBytes3(32).toString("hex");
}
async function writeTokenHandshake(tokenPath, token, meta) {
  const payload = JSON.stringify({ token, ...meta });
  await writeFile9(tokenPath, payload, { encoding: "utf8", mode: 384 });
}
function tokenFromHeaders(headers) {
  const auth = headers["authorization"];
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1].trim();
  }
  const x = headers["x-pipeline-token"];
  if (typeof x === "string" && x.trim() !== "") return x.trim();
  return null;
}
function tokensMatch(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// packages/server/src/operations.ts
import { execFile } from "node:child_process";
import { existsSync as existsSync5 } from "node:fs";
import { dirname as dirname6, join as join30 } from "node:path";
import { fileURLToPath } from "node:url";
function pipelineCliBundlePath() {
  return join30(dirname6(fileURLToPath(import.meta.url)), "..", "..", "cli", "dist", "tenon.mjs");
}
function pipelineCliAvailable() {
  return existsSync5(pipelineCliBundlePath());
}
var runPipelineCli = (repoRoot, args) => new Promise((resolve13, reject) => {
  const bundle = pipelineCliBundlePath();
  if (!existsSync5(bundle)) {
    reject(new Error(`Tenon CLI bundle \u4E0D\u5B58\u5728\uFF1A${bundle}\uFF1B\u8BF7\u5148\u6267\u884C npm run bundle`));
    return;
  }
  execFile(
    process.execPath,
    [bundle, ...args],
    {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15 * 60 * 1e3
    },
    (error, stdout, stderr) => {
      if (error === null) {
        resolve13({ exitCode: 0, stdout, stderr });
        return;
      }
      const code = typeof error.code === "number" ? error.code : 1;
      if (typeof error.code === "number") {
        resolve13({ exitCode: code, stdout, stderr });
        return;
      }
      reject(error);
    }
  );
});
function parsePipelineCliJson(stdout) {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line === void 0) continue;
      try {
        return JSON.parse(line);
      } catch {
      }
    }
    return null;
  }
}
function cliExitHttpStatus(exitCode) {
  if (exitCode === 0) return 200;
  if (exitCode === 3) return 409;
  return 400;
}

// packages/server/src/routerPreview.ts
import { spawn } from "node:child_process";
function object2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function parseRouterDraft(value) {
  const row = object2(value);
  const workflow = object2(row?.workflow);
  const policy = object2(row?.policyProfile);
  const routing = object2(policy?.routing);
  const skills = object2(policy?.skills);
  const id = row?.id;
  const label = row?.label;
  const allowed = workflow?.allowed;
  const reviewSeed = policy?.reviewSeed;
  const autoEnqueueOnSpecComplete = policy?.autoEnqueueOnSpecComplete;
  const coverageProfile = policy?.coverageProfile;
  if (typeof id !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(id)) throw new Error("draft_track.id \u975E\u6CD5");
  if (typeof label !== "string" || label.trim() === "") throw new Error("draft_track.label \u4E0D\u5F97\u4E3A\u7A7A");
  if (row?.builtin !== false) throw new Error("draft_track.builtin \u5FC5\u987B\u4E3A false");
  if (typeof workflow?.default !== "string" || workflow.default.trim() === "") throw new Error("draft_track.workflow.default \u4E0D\u5F97\u4E3A\u7A7A");
  if (allowed !== "*" && (!Array.isArray(allowed) || allowed.length === 0 || allowed.some((item2) => typeof item2 !== "string" || item2 === ""))) {
    throw new Error("draft_track.workflow.allowed \u987B\u4E3A '*' \u6216\u975E\u7A7A string[]");
  }
  if (reviewSeed !== "pending" && reviewSeed !== "skipped") throw new Error("draft_track.policyProfile.reviewSeed \u975E\u6CD5");
  if (autoEnqueueOnSpecComplete !== void 0 && typeof autoEnqueueOnSpecComplete !== "boolean") {
    throw new Error("draft_track.policyProfile.autoEnqueueOnSpecComplete \u987B\u4E3A boolean");
  }
  if (typeof policy?.automationEligible !== "boolean") throw new Error("draft_track.policyProfile.automationEligible \u987B\u4E3A boolean");
  if (!["none", "pm", "frontend", "backend"].includes(String(coverageProfile))) throw new Error("draft_track.policyProfile.coverageProfile \u975E\u6CD5");
  if (typeof routing?.enabled !== "boolean") throw new Error("draft_track.policyProfile.routing.enabled \u987B\u4E3A boolean");
  const parsedRouting = routing.enabled ? (() => {
    if (typeof routing.pattern !== "string" || routing.pattern === "") throw new Error("draft_track routing.pattern \u4E0D\u5F97\u4E3A\u7A7A");
    if (routing.excludePattern !== void 0 && (typeof routing.excludePattern !== "string" || routing.excludePattern === "")) {
      throw new Error("draft_track routing.excludePattern \u63D0\u4F9B\u65F6\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32");
    }
    if (!Number.isSafeInteger(routing.priority) || Number(routing.priority) < 0) throw new Error("draft_track routing.priority \u987B\u4E3A\u975E\u8D1F\u6574\u6570");
    return {
      enabled: true,
      pattern: routing.pattern,
      ...routing.excludePattern === void 0 ? {} : { excludePattern: routing.excludePattern },
      priority: Number(routing.priority)
    };
  })() : { enabled: false };
  if (typeof skills?.matrix !== "boolean" || typeof skills.profile !== "string" || skills.profile === "") {
    throw new Error("draft_track.policyProfile.skills \u975E\u6CD5");
  }
  return {
    id,
    label: label.trim(),
    builtin: false,
    workflow: { default: workflow.default.trim(), allowed },
    policyProfile: {
      reviewSeed,
      ...autoEnqueueOnSpecComplete === void 0 ? {} : { autoEnqueueOnSpecComplete },
      automationEligible: policy.automationEligible,
      coverageProfile,
      routing: parsedRouting,
      skills: { matrix: skills.matrix, profile: skills.profile }
    }
  };
}
function applyRouterDraft(tracks, draft) {
  const index = tracks.findIndex((track) => track.id === draft.id);
  if (index >= 0 && tracks[index]?.builtin) throw new Error(`\u5185\u5EFA Track '${draft.id}' \u7684 policy \u4E0D\u53EF\u9884\u89C8\u8986\u76D6`);
  if (index < 0) return [...tracks, { ...draft, builtin: false }];
  return tracks.map((track, position) => position === index ? { ...draft, builtin: false } : track);
}
var SYSTEM_MARKERS = ["<task-notification>", "<task-id>", "<output-file>", "<workflow-state>", "<pipeline-router"];
var DISCUSSION_MARKERS = [
  "\u5982\u4F55\u4F7F\u7528",
  "\u600E\u4E48\u7528",
  "\u662F\u4EC0\u4E48",
  "\u4E3A\u4EC0\u4E48",
  "\u89E3\u91CA",
  "\u6587\u6863\u5728\u54EA",
  "\u5728\u54EA\u91CC",
  "\u610F\u601D\u662F",
  "\u6211\u89C9\u5F97",
  "\u6211\u611F\u89C9",
  "\u4F60\u89C9\u5F97",
  "\u662F\u4E0D\u662F",
  "\u600E\u4E48\u6837",
  "\u770B\u6CD5",
  "\u804A\u804A",
  "\u8BA8\u8BBA\u4E00\u4E0B",
  "\u6709\u6CA1\u6709\u66F4\u597D"
];
function routerSuppressionReason(prompt) {
  if (SYSTEM_MARKERS.some((marker) => prompt.includes(marker))) return "system-notification";
  if (prompt.startsWith("/")) return "slash-command";
  if (DISCUSSION_MARKERS.some((marker) => prompt.includes(marker))) return "discussion";
  if (/^[\t\n\v\f\r ]*(what|why|how|when|where|who|can you (tell|explain|describe))\b/i.test(prompt)) {
    return "discussion";
  }
  return null;
}
function scoreRouterPatternWithGrep(pattern, prompt) {
  return new Promise((resolve13, reject) => {
    const child = spawn("grep", ["-ciE", "--", pattern], {
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let stdinError = null;
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("router grep \u8D85\u65F6\uFF082000ms\uFF09")));
    }, 2e3);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(() => reject(new Error(`router grep \u542F\u52A8\u5931\u8D25\uFF1A${error.message}`))));
    child.on("close", (code, signal) => {
      finish(() => {
        if (signal !== null) return reject(new Error(`router grep \u88AB\u4FE1\u53F7 ${signal} \u7EC8\u6B62`));
        if (code !== 0 && code !== 1) return reject(new Error(`router grep exit ${String(code)}\uFF1A${stderr.trim() || "unknown error"}`));
        if (stdinError !== null) return reject(new Error(`router grep stdin \u5931\u8D25\uFF1A${stdinError.message}`));
        if (code === 1) return resolve13(0);
        const score = Number(stdout.trim());
        if (!Number.isSafeInteger(score) || score < 0) {
          return reject(new Error(`router grep \u8FD4\u56DE\u975E\u6CD5\u8BA1\u5206\uFF1A${JSON.stringify(stdout.trim())}`));
        }
        return resolve13(score);
      });
    });
    child.stdin.on("error", (error) => {
      stdinError = error;
    });
    child.stdin.end(prompt);
  });
}
async function previewTrackRouting(prompt, tracks, scorer = scoreRouterPatternWithGrep) {
  const candidates = await Promise.all(tracks.map(async (track, order) => {
    const routing = track.policyProfile.routing;
    const excluded = routing.enabled && routing.excludePattern !== void 0 ? await scorer(routing.excludePattern, prompt) > 0 : false;
    const score = routing.enabled && !excluded ? await scorer(routing.pattern, prompt) : 0;
    if (!Number.isSafeInteger(score) || score < 0) {
      throw new Error(`router scorer \u4E3A track '${track.id}' \u8FD4\u56DE\u975E\u6CD5\u8BA1\u5206 ${String(score)}`);
    }
    return {
      track,
      order,
      priority: routing.enabled ? routing.priority : 0,
      score,
      routable: routing.enabled,
      excluded
    };
  }));
  let winner = null;
  for (const candidate of candidates) {
    if (!candidate.routable || candidate.score <= 0) continue;
    if (winner === null || candidate.score > winner.score || candidate.score === winner.score && candidate.priority > winner.priority) {
      winner = candidate;
    }
  }
  const suppressedReason = routerSuppressionReason(prompt);
  return {
    winner: suppressedReason === null ? winner : null,
    candidates,
    suppressed_reason: suppressedReason
  };
}

// packages/server/src/cadence.ts
function asMillis(iso, label) {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) throw new Error(`${label} \u4E0D\u662F\u5408\u6CD5 ISO8601\uFF1A${iso}`);
  return value;
}
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}
function resultError(result) {
  return result.stderr.trim() || result.stdout.trim() || `Tenon CLI exit ${result.exitCode}`;
}
function keyOf(root, loopId) {
  return `${root}\0${loopId}`;
}
function createCadenceScheduler(options) {
  const pollIntervalMs = options.pollIntervalMs ?? 3e4;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 100) {
    throw new Error(`cadence pollIntervalMs \u5FC5\u987B\u662F >=100 \u7684\u5B89\u5168\u6574\u6570\uFF0C\u6536\u5230 ${String(pollIntervalMs)}`);
  }
  const registryLoader = options.loadRegistry ?? loadRegistry;
  const ledgerStore = createLoopLedgerStore();
  const readLedger = options.readLedger ?? ((root) => ledgerStore.read(root));
  const scheduleInterval = options.scheduleInterval ?? setInterval;
  const clearScheduledInterval = options.clearScheduledInterval ?? clearInterval;
  const lastAttemptAt = /* @__PURE__ */ new Map();
  let timer = null;
  let tickPromise = null;
  let latest = {
    enabled: true,
    poll_interval_ms: pollIntervalMs,
    generated_at: options.clock(),
    running: false,
    loops: [],
    errors: []
  };
  async function runTick() {
    const now = options.clock();
    const nowMs = asMillis(now, "cadence clock");
    const rows = [];
    const errors = [];
    const due = [];
    for (const root of [...new Set(options.roots())]) {
      let loaded;
      let ledger;
      try {
        loaded = registryLoader(root);
        if (loaded.errors.length > 0 || loaded.data === null) {
          errors.push(`${root}: ${loaded.errors.join("\uFF1B") || "loops.yaml \u7F3A\u5931"}`);
          continue;
        }
        ledger = await readLedger(root);
      } catch (error) {
        errors.push(`${root}: ${errorMessage3(error)}`);
        continue;
      }
      for (const loop of loaded.data.loops) {
        const base = {
          root,
          loop_id: loop.id,
          cadence: loop.cadence,
          runner: loop.runner,
          last_finished_at: null,
          due_at: null
        };
        if (loop.status !== "active") {
          rows.push({ ...base, state: "inactive" });
          continue;
        }
        const cadenceMins = cadenceMinutes(loop.cadence);
        if (cadenceMins === null) {
          rows.push({ ...base, state: "continuous" });
          continue;
        }
        try {
          const projection = projectLoopLedger(ledger.records, ledger.rejected.length, loop.id, budgetDayOf(now));
          const lastFinishedAt = projection.lastFinishedAt ?? null;
          if (projection.health === "degraded") {
            rows.push({
              ...base,
              last_finished_at: lastFinishedAt,
              state: "blocked",
              error: `durable loop ledger \u542B ${ledger.rejected.length} \u6761\u574F\u884C\u6216\u5173\u7CFB\u635F\u574F`
            });
            continue;
          }
          if (projection.inFlight > 0) {
            rows.push({ ...base, last_finished_at: lastFinishedAt, state: "in-flight" });
            continue;
          }
          const key = keyOf(root, loop.id);
          const reference = lastAttemptAt.get(key) ?? lastFinishedAt;
          const dueMs = reference === null ? nowMs : asMillis(reference, "last cadence reference") + cadenceMins * 6e4;
          const dueAt = new Date(dueMs).toISOString();
          if (nowMs < dueMs) {
            rows.push({ ...base, last_finished_at: lastFinishedAt, due_at: dueAt, state: "waiting" });
            continue;
          }
          const rowIndex = rows.length;
          rows.push({ ...base, last_finished_at: lastFinishedAt, due_at: dueAt, attempted_at: now, state: "running" });
          due.push({ root, loopId: loop.id, rowIndex });
          lastAttemptAt.set(key, now);
        } catch (error) {
          rows.push({ ...base, state: "blocked", error: errorMessage3(error) });
        }
      }
    }
    latest = {
      enabled: true,
      poll_interval_ms: pollIntervalMs,
      generated_at: now,
      running: due.length > 0,
      loops: rows,
      errors
    };
    await Promise.all(due.map(async (item2) => {
      const current = rows[item2.rowIndex];
      if (current === void 0) return;
      let result;
      try {
        result = await options.runPipelineCli(item2.root, ["loops", "run", item2.loopId, "--json"]);
      } catch (error) {
        rows[item2.rowIndex] = { ...current, state: "failed", error: errorMessage3(error) };
        return;
      }
      rows[item2.rowIndex] = result.exitCode === 0 ? { ...current, state: "succeeded", exit_code: 0 } : { ...current, state: "failed", exit_code: result.exitCode, error: resultError(result) };
    }));
    latest = { ...latest, running: false, loops: rows };
  }
  function tick() {
    if (tickPromise !== null) return tickPromise;
    tickPromise = runTick().finally(() => {
      tickPromise = null;
    });
    return tickPromise;
  }
  return {
    start() {
      if (timer !== null) return;
      void tick();
      timer = scheduleInterval(() => {
        void tick();
      }, pollIntervalMs);
    },
    tick,
    stop() {
      if (timer === null) return;
      clearScheduledInterval(timer);
      timer = null;
    },
    snapshot() {
      return {
        ...latest,
        loops: latest.loops.map((row) => ({ ...row })),
        errors: [...latest.errors]
      };
    }
  };
}

// packages/server/src/serverGetRoutes.ts
import { lstatSync as lstatSync5 } from "node:fs";
import { dirname as dirname9, join as join42 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// packages/server/src/afkReadiness.ts
import { accessSync, constants as fsConstants, statSync as statSync2 } from "node:fs";
import { join as join31 } from "node:path";

// packages/server/src/dockerImages.ts
import { execFile as execFile2 } from "node:child_process";
var nodeExecDocker = (args) => new Promise((resolve13) => {
  execFile2("docker", [...args], (err, stdout, stderr) => {
    const code = err?.code;
    const exitCode = err === null ? 0 : typeof code === "number" ? code : 1;
    resolve13({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode });
  });
});
async function execDocker(args, opts) {
  const exec = opts?.exec ?? nodeExecDocker;
  const timeoutMs = opts?.timeoutMs ?? 5e3;
  let timer;
  try {
    const timeout = new Promise((resolve13) => {
      timer = setTimeout(() => resolve13(null), timeoutMs);
    });
    const result = await Promise.race([exec(args).catch(() => null), timeout]);
    return result;
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function listDockerImages(exec, opts) {
  const result = await execDocker(["images", "--format", "{{.Repository}}:{{.Tag}}"], {
    timeoutMs: opts?.timeoutMs,
    exec
  });
  if (result === null || result.exitCode !== 0) return { available: false, images: [] };
  const images = [
    ...new Set(
      result.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.includes("<none>"))
    )
  ].sort();
  return { available: true, images };
}

// packages/server/src/afkReadiness.ts
function credLight(key, hostEnv, fileKeys) {
  const envVal = hostEnv[key];
  if (envVal !== void 0 && envVal !== "") return { set: true, source: "host-env" };
  if (fileKeys[key] !== void 0 && fileKeys[key] !== "") return { set: true, source: "secrets-file" };
  return { set: false };
}
function canReadFile(path7) {
  try {
    if (!statSync2(path7).isFile()) return false;
    accessSync(path7, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function buildAfkReadiness(opts) {
  const hostEnv = opts.hostEnv ?? process.env;
  const fileKeys = readSecrets(opts.secretsPath).keys;
  const info = await execDocker(["info"], { exec: opts.exec, timeoutMs: opts.timeoutMs });
  const available = info !== null && info.exitCode === 0;
  let present = false;
  if (available) {
    const inspect = await execDocker(["image", "inspect", opts.image], { exec: opts.exec, timeoutMs: opts.timeoutMs });
    present = inspect !== null && inspect.exitCode === 0;
  }
  return {
    ok: true,
    docker: { available },
    image: { configured: opts.image, present, build_hint: SANDCASTLE_BUILD_HINT },
    credentials: {
      "claude-code": { CLAUDE_CODE_OAUTH_TOKEN: credLight("CLAUDE_CODE_OAUTH_TOKEN", hostEnv, fileKeys) },
      codex: {
        OPENAI_API_KEY: credLight("OPENAI_API_KEY", hostEnv, fileKeys),
        CODEX_HOME: codexHomeCredentialLight(
          hostEnv.CODEX_HOME,
          opts.defaultCodexHome,
          (home) => (opts.canReadFile ?? canReadFile)(join31(home, "auth.json"))
        )
      }
    }
  };
}

// packages/server/src/automationConfig.ts
import { mkdirSync as mkdirSync4, readFileSync as readFileSync17, renameSync as renameSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join32 } from "node:path";
var AUTOMATION_DEFAULTS = {
  enabled: false,
  max_parallel: 4,
  max_retries: 1,
  default_opt_in: false,
  image: ""
};
function automationConfigPath(root) {
  return join32(root, ".pipeline", "automation.json");
}
var intIn2 = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
var validImage = (v) => v === "" || isValidImageRef(v);
function readAutomationSettings(root) {
  const config = readAutomationJson(root, { readFileSync: readFileSync17 });
  return {
    enabled: config.enabled ?? AUTOMATION_DEFAULTS.enabled,
    max_parallel: config.maxParallel ?? AUTOMATION_DEFAULTS.max_parallel,
    max_retries: config.maxRetries ?? AUTOMATION_DEFAULTS.max_retries,
    default_opt_in: config.defaultOptIn ?? AUTOMATION_DEFAULTS.default_opt_in,
    image: config.image ?? AUTOMATION_DEFAULTS.image
  };
}
function validateAutomationSettingsBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" };
  }
  const { enabled, max_parallel, max_retries, default_opt_in, image } = body;
  if (enabled !== void 0 && typeof enabled !== "boolean") {
    return { ok: false, error: "enabled \u987B\u4E3A\u5E03\u5C14\u503C" };
  }
  if (!intIn2(max_parallel, AUTOMATION_JSON_LIMITS.maxParallel.min, AUTOMATION_JSON_LIMITS.maxParallel.max)) {
    return { ok: false, error: `max_parallel \u987B\u4E3A ${AUTOMATION_JSON_LIMITS.maxParallel.min}-${AUTOMATION_JSON_LIMITS.maxParallel.max} \u7684\u6574\u6570` };
  }
  if (!intIn2(max_retries, AUTOMATION_JSON_LIMITS.maxRetries.min, AUTOMATION_JSON_LIMITS.maxRetries.max)) {
    return { ok: false, error: `max_retries \u987B\u4E3A ${AUTOMATION_JSON_LIMITS.maxRetries.min}-${AUTOMATION_JSON_LIMITS.maxRetries.max} \u7684\u6574\u6570` };
  }
  if (typeof default_opt_in !== "boolean") {
    return { ok: false, error: "default_opt_in \u987B\u4E3A\u5E03\u5C14\u503C" };
  }
  if (typeof image !== "string") {
    return { ok: false, error: "image \u987B\u4E3A\u5B57\u7B26\u4E32\uFF08\u7A7A\u4E32 = \u7528\u5185\u7F6E\u955C\u50CF sandcastle:local\uFF09" };
  }
  const trimmed = image.trim();
  if (!validImage(trimmed)) {
    return { ok: false, error: `image \u975E\u6CD5\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 . _ / : @ -\uFF0C\u957F\u5EA6 \u2264 ${AUTOMATION_JSON_LIMITS.imageMaxLen}\uFF09` };
  }
  return {
    ok: true,
    value: { enabled: enabled === true, max_parallel, max_retries, default_opt_in, image: trimmed }
  };
}
function writeAutomationSettings(root, settings) {
  const payload = {
    version: 1,
    enabled: settings.enabled === true,
    max_parallel: settings.max_parallel,
    max_retries: settings.max_retries,
    default_opt_in: settings.default_opt_in
  };
  if (settings.image !== "") payload.image = settings.image;
  const dir = join32(root, ".pipeline");
  mkdirSync4(dir, { recursive: true });
  const file = automationConfigPath(root);
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync4(tmp, `${JSON.stringify(payload, null, 2)}
`, "utf8");
  renameSync4(tmp, file);
}

// packages/server/src/config.ts
import { readFileSync as readFileSync18 } from "node:fs";
import { readFile as readFile17, rename as rename7, rm as rm3, writeFile as writeFile10 } from "node:fs/promises";
import { dirname as dirname7 } from "node:path";
var ConfigError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
};
var EDITABLE_TRACKS = ["pm", "frontend", "backend"];
var EDITABLE_TRACK_SET = new Set(EDITABLE_TRACKS);
var SKILL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,127}$/;
var MAX_SKILLS = 50;
var SECTION_HEADER_RE = /^mandatory_skills:\s*$/;
function flattenMandatorySkills(data) {
  const flat = {};
  for (const phase of PHASES) {
    const row = data.mandatorySkills[phase];
    if (!row) continue;
    for (const track of Object.keys(row)) {
      const skills = row[track];
      if (skills) flat[`${phase}.${track}`] = [...skills];
    }
  }
  return flat;
}
function projectTrack(track) {
  return {
    id: track.id,
    label: track.label,
    builtin: track.builtin,
    workflow: {
      default: track.workflow.default,
      allowed: track.workflow.allowed === "*" ? "*" : [...track.workflow.allowed]
    },
    policyProfile: {
      reviewSeed: track.policyProfile.reviewSeed,
      ...track.policyProfile.autoEnqueueOnSpecComplete === void 0 ? {} : { autoEnqueueOnSpecComplete: track.policyProfile.autoEnqueueOnSpecComplete },
      automationEligible: track.policyProfile.automationEligible,
      coverageProfile: track.policyProfile.coverageProfile,
      routing: track.policyProfile.routing.enabled ? {
        enabled: true,
        pattern: track.policyProfile.routing.pattern,
        ...track.policyProfile.routing.excludePattern === void 0 ? {} : { excludePattern: track.policyProfile.routing.excludePattern },
        priority: track.policyProfile.routing.priority
      } : { enabled: false },
      skills: {
        matrix: track.policyProfile.skills.matrix,
        profile: track.policyProfile.skills.profile
      }
    }
  };
}
function readConfigSnapshot(options) {
  const manifest = loadManifest(options.manifestPath);
  const registry = loadTrackRegistry(options.repoRoot, options.trackValidationContext);
  if (registry.ordered.length === 0) {
    throw new ConfigError("effective track registry \u4E3A\u7A7A\uFF0C\u62D2\u7EDD\u751F\u6210 config \u5FEB\u7167");
  }
  const hasWritableSection = readFileSync18(options.manifestPath, "utf8").split("\n").some((line) => SECTION_HEADER_RE.test(line));
  const writableProfiles = hasWritableSection ? EDITABLE_TRACKS.filter((profile) => {
    const track = registry.byId.get(profile);
    return track?.policyProfile.skills.matrix === true && track.policyProfile.skills.profile === profile;
  }) : [];
  return {
    ok: true,
    generated_at: options.generatedAt,
    revision: registry.revision,
    source: registry.source,
    mandatory_skills: flattenMandatorySkills(manifest),
    tracks: registry.ordered.map(projectTrack),
    mandatory_skills_writable_profiles: writableProfiles
  };
}
function validateMandatorySkillsBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" };
  }
  const b = body;
  const { phase, track, skills } = b;
  if (typeof phase !== "string" || !PHASES.includes(phase)) {
    return { ok: false, error: `phase \u987B\u4E3A\u5408\u6CD5\u76F8\u4F4D\u4E4B\u4E00\uFF08${PHASES.join("/")}\uFF09` };
  }
  if (phase === "archive") {
    return { ok: false, error: "archive \u76F8\u4F4D\u65E0\u5F3A\u5236 skill\uFF08\u8BBE\u8BA1\u5982\u6B64\uFF0C\u4E0D\u53EF\u5199\uFF09" };
  }
  if (typeof track !== "string" || !EDITABLE_TRACK_SET.has(track)) {
    return { ok: false, error: `track \u987B\u4E3A ${EDITABLE_TRACKS.join("/")} \u4E4B\u4E00` };
  }
  if (!Array.isArray(skills)) {
    return { ok: false, error: "skills \u987B\u4E3A\u5B57\u7B26\u4E32\u6570\u7EC4" };
  }
  if (skills.length > MAX_SKILLS) {
    return { ok: false, error: `skills \u6700\u591A ${MAX_SKILLS} \u9879` };
  }
  const seen = /* @__PURE__ */ new Set();
  for (const s of skills) {
    if (typeof s !== "string" || !SKILL_TOKEN_RE.test(s)) {
      return {
        ok: false,
        error: `\u975E\u6CD5 skill token ${JSON.stringify(s)}\uFF08\u4EC5\u5141\u8BB8\u5B57\u6BCD\u6570\u5B57\u4E0E : _ . / | -\uFF0C\u5B57\u6BCD\u6570\u5B57\u5F00\u5934\uFF0C\u957F\u5EA6 1-128\uFF09`
      };
    }
    if (seen.has(s)) {
      return { ok: false, error: `skills \u542B\u91CD\u590D\u9879 '${s}'` };
    }
    seen.add(s);
  }
  return {
    ok: true,
    value: { phase, track, skills: [...skills] }
  };
}
function stripComment3(line) {
  const t = line.trimStart();
  if (t.startsWith("#")) return "";
  const m = line.match(/^(.*?)\s#/);
  return (m ? m[1] : line).trimEnd();
}
var ENTRY_RE = /^\s+([A-Za-z_][A-Za-z0-9_.-]*):\s*(\[.*\])\s*$/;
function serializeEntry(key, skills) {
  return `  ${key}: [${skills.join(", ")}]`;
}
async function writeMandatorySkills(manifestPath2, phase, track, skills) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(phase) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(track)) {
    throw new ConfigError(`writeMandatorySkills: \u975E\u6CD5 phase/track\uFF08'${phase}'.'${track}'\uFF09`);
  }
  for (const s of skills) {
    if (!SKILL_TOKEN_RE.test(s)) {
      throw new ConfigError(`writeMandatorySkills: \u975E\u6CD5 skill token '${s}'\uFF0C\u62D2\u7EDD\u5199\u5165`);
    }
  }
  const key = `${phase}.${track}`;
  await withLock(dirname7(manifestPath2), async () => {
    const original = await readFile17(manifestPath2, "utf8");
    const lines = original.split("\n");
    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== void 0 && SECTION_HEADER_RE.test(line)) {
        sectionStart = i;
        break;
      }
    }
    if (sectionStart < 0) {
      throw new ConfigError(`${manifestPath2} \u7F3A mandatory_skills \u5C0F\u8282\uFF0C\u62D2\u7EDD\u5199\u5165`);
    }
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (raw === void 0) continue;
      if (raw.trim() === "") continue;
      if (!/^\s/.test(raw)) {
        sectionEnd = i;
        break;
      }
    }
    const next = lines.slice();
    let found = false;
    let lastEntryIdx = sectionStart;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      const line = lines[i];
      if (line === void 0) continue;
      const stripped = stripComment3(line);
      if (stripped.trim() === "") continue;
      const m = ENTRY_RE.exec(stripped);
      if (!m) {
        throw new ConfigError(
          `${manifestPath2}:${i + 1} \u975E\u9884\u671F\u7684 mandatory_skills \u6761\u76EE\u683C\u5F0F\uFF0C\u62D2\u7EDD\u5199\u5165\u4EE5\u9632\u8BEF\u6539\uFF1A'${lines[i]}'`
        );
      }
      lastEntryIdx = i;
      if (m[1] === key) {
        next[i] = serializeEntry(key, skills);
        found = true;
      }
    }
    if (!found) {
      next.splice(lastEntryIdx + 1, 0, serializeEntry(key, skills));
    }
    const patched = next.join("\n");
    const tmpPath = `${manifestPath2}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await writeFile10(tmpPath, patched, "utf8");
      let reparsed;
      try {
        reparsed = loadManifest(tmpPath);
      } catch (e) {
        throw new ConfigError(
          `\u5199\u5165\u540E kernel \u91CD\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u4E2D\u6B62\uFF08\u539F\u6587\u4EF6\u672A\u6539\u52A8\uFF09\uFF1A${e instanceof Error ? e.message : String(e)}`
        );
      }
      const got = reparsed.mandatorySkills[phase]?.[track];
      const want = [...skills];
      const same = Array.isArray(got) && got.length === want.length && got.every((v, idx) => v === want[idx]);
      if (!same) {
        throw new ConfigError("\u5199\u5165\u540E\u91CD\u89E3\u6790\u6821\u9A8C\u503C\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u4E2D\u6B62\uFF08\u539F\u6587\u4EF6\u672A\u6539\u52A8\uFF09");
      }
      await rename7(tmpPath, manifestPath2);
    } finally {
      await rm3(tmpPath, { force: true });
    }
  });
}

// packages/server/src/hooksConfig.ts
import { mkdirSync as mkdirSync5, readFileSync as readFileSync19, renameSync as renameSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join33 } from "node:path";
var HOOK_METAS = [
  { id: "session-start", event: "SessionStart", matcher: "*", script: "hooks/session-start.sh", configurable: true },
  { id: "breadcrumb", event: "UserPromptSubmit", matcher: "*", script: "hooks/breadcrumb.sh", configurable: true },
  { id: "router", event: "UserPromptSubmit", matcher: "*", script: "hooks/router.sh", configurable: true },
  { id: "gate", event: "PreToolUse", matcher: "*", script: "hooks/gate.sh", configurable: false },
  { id: "confirm-clear", event: "PostToolUse", matcher: "AskUserQuestion|request_user_input", script: "hooks/confirm-clear.sh", configurable: false },
  { id: "decision-recorder", event: "PostToolUse", matcher: "AskUserQuestion|request_user_input", script: "hooks/decision-recorder.sh", configurable: false },
  { id: "skill-tracker", event: "PostToolUse", matcher: "*", script: "hooks/skill-tracker.sh", configurable: true },
  { id: "interactive-skill-gate", event: "PostToolUse", matcher: "*", script: "hooks/interactive-skill-gate.sh", configurable: false }
];
var HOOK_BY_ID = new Map(HOOK_METAS.map((h) => [h.id, h]));
var CONFIGURABLE_IDS = HOOK_METAS.filter((h) => h.configurable).map((h) => h.id);
var PHASE_RE = /^[a-zA-Z0-9_-]+$/;
function hooksConfigPath(root) {
  return join33(root, ".pipeline", "hooks.json");
}
function readHooksMatrix(root) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync19(hooksConfigPath(root), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const rawMatrix = parsed.matrix;
  if (typeof rawMatrix !== "object" || rawMatrix === null || Array.isArray(rawMatrix)) return {};
  const matrix = {};
  for (const [key, value] of Object.entries(rawMatrix)) {
    if (value !== false) continue;
    const dot = key.indexOf(".");
    if (dot <= 0) continue;
    const hook = key.slice(0, dot);
    const phase = key.slice(dot + 1);
    if (!HOOK_BY_ID.get(hook)?.configurable) continue;
    if (!PHASE_RE.test(phase)) continue;
    matrix[key] = false;
  }
  return matrix;
}
function validateHookToggleBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" };
  }
  const { hook, phase, enabled } = body;
  if (typeof hook !== "string" || !HOOK_BY_ID.has(hook)) {
    return { ok: false, error: `\u672A\u77E5 hook\uFF08\u53EF\u914D\u7F6E\u9879\uFF1A${CONFIGURABLE_IDS.join(" / ")}\uFF09` };
  }
  const hookMeta = HOOK_BY_ID.get(hook);
  if (hookMeta === void 0) {
    return { ok: false, error: `\u672A\u77E5 hook\uFF08\u53EF\u914D\u7F6E\u9879\uFF1A${CONFIGURABLE_IDS.join(" / ")}\uFF09` };
  }
  if (!hookMeta.configurable) {
    return { ok: false, error: `hook '${hook}' \u5F3A\u5236\u5E38\u5F00\uFF0C\u4E0D\u53EF\u901A\u8FC7\u914D\u7F6E\u5173\u95ED\uFF08\u51B3\u8BAE#2 \u5B89\u5168\u95E8/\u4EA4\u4E92\u95E8\u7EAA\u5F8B\uFF09` };
  }
  if (typeof phase !== "string" || !PHASE_RE.test(phase)) {
    return { ok: false, error: "\u975E\u6CD5\u9636\u6BB5\u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" };
  }
  if (typeof enabled !== "boolean") {
    return { ok: false, error: "enabled \u987B\u4E3A\u5E03\u5C14\u503C" };
  }
  return { ok: true, value: { hook, phase, enabled } };
}
function writeHookToggle(root, toggle) {
  const matrix = readHooksMatrix(root);
  const key = `${toggle.hook}.${toggle.phase}`;
  if (toggle.enabled) {
    delete matrix[key];
  } else {
    matrix[key] = false;
  }
  const dir = join33(root, ".pipeline");
  mkdirSync5(dir, { recursive: true });
  const file = hooksConfigPath(root);
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync5(tmp, `${JSON.stringify({ version: 1, matrix }, null, 2)}
`, "utf8");
  renameSync5(tmp, file);
}

// packages/server/src/loops.ts
import { existsSync as existsSync6, readdirSync as readdirSync7, readFileSync as readFileSync20 } from "node:fs";
import { join as join34 } from "node:path";
function readRunLogText(root) {
  try {
    return readFileSync20(join34(root, ".superpowers", "loops", "progress.md"), "utf8");
  } catch {
    return null;
  }
}
function readLoopDocText(root) {
  try {
    return readFileSync20(join34(root, "LOOP.md"), "utf8");
  } catch {
    return null;
  }
}
var READONLY_GRADUATION_FS = {
  loadRegistry,
  readRunLog: readRunLogText,
  readLoopDoc: readLoopDocText,
  readRegistrySnapshot: async () => null,
  writeRegistryGoverned: async () => ({ ok: false, error: "snapshot graduation projection is read-only" })
};
function listMatchedChanges(root, changePrefix) {
  try {
    return readdirSync7(join34(root, "openspec", "changes"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "archive" && e.name.startsWith(changePrefix)).map((e) => e.name).sort();
  } catch {
    return [];
  }
}
var STARTER_EXECUTION_FIELDS = /* @__PURE__ */ new Set([
  "status",
  "runner",
  "phases",
  "goal",
  "risk",
  "change_prefix",
  "template_id",
  "template_version",
  "workflow_id",
  "skill_bundle_id"
]);
function registryFromText(text2) {
  return loadRegistry("", { readText: () => text2 });
}
function isStarter(loop) {
  return typeof loop?.template_id === "string" && loop.template_id.length > 0;
}
function requiresStarterActivationValidation(previous, candidate, patch) {
  if (!isStarter(candidate) || candidate?.status !== "active") return false;
  if (previous?.status !== "active") return true;
  return Object.keys(patch).some((field) => STARTER_EXECUTION_FIELDS.has(field));
}
async function applyLoopsUpdate(root, id, patch, deps = {}) {
  const snap0 = await readRegistrySnapshot(root);
  if (snap0.epoch === ABSENT_REGISTRY_EPOCH) {
    return { ok: false, error: `loops.yaml \u672A\u627E\u5230\u4E8E ${loopsYamlPath(root)}` };
  }
  const { text: text2, error } = updateLoopInYaml(snap0.text, id, patch);
  if (error !== null || text2 === null) {
    return { ok: false, error: error ?? "loops.yaml \u6587\u672C\u624B\u672F\u5931\u8D25" };
  }
  const parsed = parseLoopsYaml(text2);
  if (parsed.error !== null || parsed.data === null || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    return { ok: false, error: `\u5199\u56DE\u6587\u672C\u89E3\u6790\u5931\u8D25\uFF1A${parsed.error ?? "\u9876\u5C42\u975E mapping"}` };
  }
  const schemaErrors = validateSchema(parsed.data, LOOPS_SCHEMA);
  if (schemaErrors.length > 0) {
    return { ok: false, error: "patch \u540E schema \u6821\u9A8C\u5931\u8D25\uFF0C\u672A\u843D\u76D8", errors: schemaErrors };
  }
  const previousRegistry = registryFromText(snap0.text);
  const candidateRegistry = registryFromText(text2);
  if (previousRegistry.data === null || candidateRegistry.data === null) {
    return {
      ok: false,
      error: "starter activation \u5019\u9009 registry \u65E0\u6CD5\u8F7D\u5165\uFF0C\u672A\u843D\u76D8",
      errors: [...previousRegistry.errors, ...candidateRegistry.errors]
    };
  }
  const previousData = previousRegistry.data;
  const candidateData = candidateRegistry.data;
  const previousLoop = previousData.loops.find((loop) => loop.id === id);
  const candidateLoop = candidateData.loops.find((loop) => loop.id === id);
  const needsActivationValidation = requiresStarterActivationValidation(previousLoop, candidateLoop, patch);
  const validateCandidate = async (stage) => {
    if (!needsActivationValidation) return null;
    if (deps.validateActivation === void 0) return "starter activation validator \u672A\u88C5\u914D\uFF0C\u62D2\u7EDD\u6FC0\u6D3B";
    try {
      const verdict = await deps.validateActivation({
        root,
        loopId: id,
        previous: previousData,
        candidate: candidateData
      });
      return verdict.ok ? null : `starter activation ${stage} \u6821\u9A8C\u62D2\u7EDD\uFF1A${verdict.error}`;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return `starter activation ${stage} \u6821\u9A8C\u5931\u8D25\uFF1A${detail}`;
    }
  };
  const preflightValidationError = await validateCandidate("preflight");
  if (preflightValidationError !== null) {
    return { ok: false, error: `${preflightValidationError}\uFF0C\u672A\u843D\u76D8` };
  }
  const res = await writeRegistryWithGovernance(root, snap0.epoch, async () => {
    const commitValidationError = await validateCandidate("commit-point");
    return commitValidationError === null ? { text: text2, error: null } : { text: null, error: `${commitValidationError}\uFF0C\u672A\u843D\u76D8` };
  });
  if (!res.ok) {
    return { ok: false, error: `loops.yaml \u6CBB\u7406\u5199\u5165\u62D2\u7EDD\uFF08${res.error}\uFF09` };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    await clearDraftMark(draftMarksPath(root), id).catch(() => {
    });
  }
  return { ok: true };
}
async function readLedgerForRoot(root) {
  const exists = existsSync6(ledgerFilePath(root));
  if (!exists) return { records: [], rejected: 0, exists: false };
  try {
    const { records, rejected } = await createLoopLedgerStore().read(root);
    return { records, rejected: rejected.length, exists: true };
  } catch {
    return { records: [], rejected: 1, exists: true };
  }
}
async function buildLoopsSnapshot(deps) {
  const now = deps.now();
  const budgetDay = budgetDayOf(now.toISOString());
  const rows = [];
  for (const root of deps.registry()) {
    const { data } = loadRegistry(root);
    if (!data) continue;
    const runLogText = readRunLogText(root);
    const graduation = buildGraduationReport(root, null, now, READONLY_GRADUATION_FS).report;
    const graduationById = new Map((graduation?.verdicts ?? []).map((verdict) => [verdict.id, verdict]));
    const led = await readLedgerForRoot(root);
    const draftSet = new Set(readDraftMarks(draftMarksPath(root)));
    for (const loop of data.loops) {
      const proj = projectLoopLedger(led.records, led.rejected, loop.id, budgetDay);
      const reservationIds = new Set(
        led.records.flatMap(
          (record2) => record2.kind === "budget-reservation" && record2.loop_id === loop.id ? [record2.reservation_id] : []
        )
      );
      const healthy = proj.health === "ok";
      const activatedReservationIds = indexReservationTerminals(led.records).activatedReservationIds;
      const admissionEnforced = healthy && reservationIds.size > 0;
      const inflightEnforced = healthy && [...reservationIds].some((id) => activatedReservationIds.has(id));
      const ledger = {
        health: !led.exists ? "missing" : proj.health,
        rejected_records: proj.rejectedRecords,
        admission_enforced: admissionEnforced,
        inflight_enforced: inflightEnforced,
        runs_today: proj.runsToday,
        in_flight: proj.inFlight,
        activated_in_flight: proj.activatedInFlight,
        settled_tokens_actual: proj.settledTokensActual,
        settled_tokens_estimated: proj.settledTokensEstimated,
        reserved_tokens: proj.reservedTokensOutstanding,
        remaining_tokens: remainingTokens(proj, loop.budget.max_tokens_per_day),
        last_result: proj.lastResult ?? null,
        last_finished_at: proj.lastFinishedAt ?? null
      };
      rows.push({
        root,
        id: loop.id,
        name: loop.name,
        autonomy_level: loop.autonomy_level,
        status: loop.status,
        cadence: loop.cadence,
        goal: loop.goal,
        design_doc: loop.design_doc,
        change_prefix: loop.change_prefix,
        risk: loop.risk,
        runner: loop.runner,
        human_gates: loop.human_gates,
        kill_criteria: loop.kill_criteria,
        allowlist: loop.allowlist,
        denylist: loop.denylist,
        budget_decl: loop.budget,
        readiness: computeReadiness(loop),
        budget: computeBudgetStatus(loop, runLogText, now),
        matched_changes: loop.change_prefix === null ? [] : listMatchedChanges(root, loop.change_prefix),
        phases: loop.phases,
        draft: draftSet.has(loop.id),
        template_id: loop.template_id,
        template_version: loop.template_version,
        workflow_id: loop.workflow_id,
        skill_bundle_id: loop.skill_bundle_id ?? null,
        ledger,
        graduation: graduationById.get(loop.id) ?? null
      });
    }
  }
  return { generated_at: now.toISOString(), rows };
}

// packages/server/src/secrets.ts
var MAX_VALUE_LENGTH = 4096;
var SECRET_KEY_LIST = SECRET_KEYS.join(" / ");
function isValidSecretKey(key) {
  return SECRET_KEYS.includes(key);
}
function maskSecret(value) {
  if (value.length > 10) return `${value.slice(0, 3)}\u2026${value.slice(-4)}`;
  return "***";
}
function buildSecretsResponse(path7) {
  const store = readSecrets(path7);
  const keys = {};
  for (const key of SECRET_KEYS) {
    const value = store.keys[key];
    keys[key] = typeof value === "string" && value !== "" ? { set: true, masked: maskSecret(value) } : { set: false };
  }
  return { ok: true, keys };
}
function validateSecretWriteBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" };
  }
  const { key, value } = body;
  if (typeof key !== "string" || !isValidSecretKey(key)) {
    return { ok: false, error: `\u975E\u6CD5 key\uFF08\u4EC5\u5141\u8BB8 ${SECRET_KEY_LIST}\uFF09` };
  }
  if (typeof value !== "string" || value === "") {
    return { ok: false, error: "value \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" };
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return { ok: false, error: `value \u8FC7\u957F\uFF08\u2264 ${MAX_VALUE_LENGTH} \u5B57\u7B26\uFF09` };
  }
  return { ok: true, value: { key, value } };
}
async function writeSecret(path7, key, value) {
  await writeSecretKey(path7, key, value);
  return { set: true, masked: maskSecret(value) };
}
async function removeSecret(path7, key) {
  await deleteSecretKey(path7, key);
}

// packages/server/src/skillsRegistry.ts
import { accessSync as accessSync2, constants as constants6, existsSync as existsSync7, readdirSync as readdirSync8, readFileSync as readFileSync21, statSync as statSync3 } from "node:fs";
import { delimiter, dirname as dirname8, join as join35 } from "node:path";
var BUILTIN_SKILLS = /* @__PURE__ */ new Set(["verify", "run", "code-review", "security-review"]);
function skillDescriptionFrom(path7) {
  try {
    const text2 = readFileSync21(path7, "utf8");
    const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(text2)?.[1];
    if (frontmatter) {
      const line = frontmatter.split("\n").find((candidate) => /^description\s*:/.test(candidate.trim()));
      const value = line?.replace(/^\s*description\s*:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
      if (value) return value.replace(/\s+/g, " ").slice(0, 240);
    }
    const body = text2.replace(/^---\s*\n[\s\S]*?\n---\s*/, "");
    const paragraph = body.split(/\n\s*\n/).map((candidate) => candidate.replace(/^#+\s+.*$/gm, "").replace(/\s+/g, " ").trim()).find(Boolean);
    return paragraph ? paragraph.slice(0, 240) : void 0;
  } catch {
    return void 0;
  }
}
function installedPluginRoots(claudeDir) {
  try {
    const parsed = JSON.parse(readFileSync21(join35(claudeDir, "plugins", "installed_plugins.json"), "utf8"));
    const plugins = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "plugins") : void 0;
    if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return [];
    return Object.values(plugins).flat().map((entry) => typeof entry === "object" && entry !== null ? Reflect.get(entry, "installPath") : void 0).filter((path7) => typeof path7 === "string" && path7.trim() !== "");
  } catch {
    return [];
  }
}
function descriptionForSkill(name, repoRoot, claudeDir, meta) {
  const home = dirname8(claudeDir);
  const candidates = [...new Set([
    meta?.contentSkill,
    meta?.skill,
    name,
    name.includes(":") ? name.split(":").at(-1) : void 0
  ].filter((candidate) => typeof candidate === "string" && candidate !== ""))];
  const roots = [
    join35(repoRoot, "skills"),
    join35(claudeDir, "skills"),
    join35(home, ".agents", "skills"),
    ...installedPluginRoots(claudeDir).map((root) => join35(root, "skills"))
  ];
  for (const root of roots) {
    for (const candidate of candidates) {
      const description = skillDescriptionFrom(join35(root, candidate, "SKILL.md"));
      if (description) return description;
    }
  }
  if (meta?.tool === "claude-plugin") {
    const plugin = meta.skill ?? name.split(":")[0] ?? name;
    const cache = join35(home, ".codex", "plugins", "cache");
    for (const marketplace of childDirsIn(cache)) {
      const pluginRoot2 = join35(cache, marketplace, plugin);
      for (const version of childDirsIn(pluginRoot2)) {
        for (const candidate of candidates) {
          const description = skillDescriptionFrom(join35(pluginRoot2, version, "skills", candidate, "SKILL.md")) ?? skillDescriptionFrom(join35(pluginRoot2, version, "skills", "SKILL.md"));
          if (description) return description;
        }
      }
    }
  }
  return void 0;
}
function skillDirsIn(dir) {
  if (!existsSync7(dir)) return [];
  try {
    return readdirSync8(dir).filter((name) => {
      const p = join35(dir, name);
      try {
        return statSync3(p).isDirectory() && existsSync7(join35(p, "SKILL.md"));
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
function childDirsIn(dir) {
  if (!existsSync7(dir)) return [];
  try {
    return readdirSync8(dir).filter((name) => {
      try {
        return statSync3(join35(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
function localSkillDirs(repoRoot) {
  return skillDirsIn(join35(repoRoot, "skills"));
}
function externalSkillSections(repoRoot) {
  const p = join35(repoRoot, "skills", "EXTERNAL-SKILLS.md");
  const out = /* @__PURE__ */ new Map();
  if (!existsSync7(p)) return out;
  let section2 = "";
  for (const raw of readFileSync21(p, "utf8").split("\n")) {
    const line = raw.trim();
    const h = /^\*\*(.+)\*\*$/.exec(line);
    if (h?.[1]) {
      section2 = h[1];
      continue;
    }
    const m = /^-\s+(\S+)/.exec(line);
    if (m?.[1]) out.set(m[1], section2);
  }
  return out;
}
function detectInstalled(claudeDir) {
  const skills = new Set(skillDirsIn(join35(claudeDir, "skills")));
  for (const name of skillDirsIn(join35(dirname8(claudeDir), ".agents", "skills"))) skills.add(name);
  const pluginBases = /* @__PURE__ */ new Set();
  const codexPluginBases = /* @__PURE__ */ new Set();
  const codexCache = join35(dirname8(claudeDir), ".codex", "plugins", "cache");
  for (const marketplace of childDirsIn(codexCache)) {
    for (const plugin of childDirsIn(join35(codexCache, marketplace))) codexPluginBases.add(plugin);
  }
  try {
    const raw = readFileSync21(join35(claudeDir, "plugins", "installed_plugins.json"), "utf8");
    const parsed = JSON.parse(raw);
    let disabled = {};
    try {
      const settings = JSON.parse(readFileSync21(join35(claudeDir, "settings.json"), "utf8"));
      if (typeof settings === "object" && settings !== null) {
        const candidate = Reflect.get(settings, "enabledPlugins");
        if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
          disabled = candidate;
        }
      }
    } catch {
    }
    const plugins = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "plugins") : void 0;
    if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return { skills, pluginBases, codexPluginBases };
    for (const [key, entries] of Object.entries(plugins)) {
      if (disabled[key] === false) continue;
      const pluginBase = key.split("@")[0];
      if (pluginBase !== void 0) pluginBases.add(pluginBase);
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const installPath = Reflect.get(entry, "installPath");
        if (typeof installPath !== "string") continue;
        for (const name of skillDirsIn(join35(installPath, "skills"))) skills.add(name);
      }
    }
  } catch {
  }
  return { skills, pluginBases, codexPluginBases };
}
function sourceRegistry(repoRoot) {
  try {
    const rows = parseSkillSources(readFileSync21(join35(repoRoot, "templates", "skill-sources.yaml"), "utf8"));
    return new Map(rows.map((row) => [row.token, row]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function metadataFor2(registry, name) {
  const plugin = name.split(":")[0];
  return registry.get(name) ?? (name.includes(":") && plugin !== void 0 ? registry.get(plugin) : void 0);
}
function executableOnPath(bin) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    try {
      accessSync2(join35(dir, bin), constants6.X_OK);
      return true;
    } catch {
    }
  }
  return false;
}
function installCmdFor(source, name, repoRoot, meta) {
  if (meta?.unavailable) return void 0;
  if (meta?.tool === "skills-cli") {
    const select = meta.skill ? ` --skill ${meta.skill}` : "";
    return `npx skills add ${meta.source} -g -y${select}`;
  }
  if (meta?.tool === "npm") return `npm install -g ${meta.source}`;
  if (meta?.tool === "claude-plugin") return `claude plugin install ${meta.skill ?? meta.source}`;
  if (meta?.tool === "builtin" || meta?.tool === "bundled") return void 0;
  if (source === "local-plugin") return `claude --plugin-dir ${repoRoot}`;
  if (source === "external-marketplace") return `claude plugin install ${name.split(":")[0]}`;
  return void 0;
}
function listAllSkillsDetailed(repoRoot, claudeDir) {
  const detected = detectInstalled(claudeDir);
  const locals = new Set(localSkillDirs(repoRoot));
  const external = externalSkillSections(repoRoot);
  const registry = sourceRegistry(repoRoot);
  const names = /* @__PURE__ */ new Set([...locals, ...external.keys(), ...registry.keys()]);
  const entries = [];
  for (const name of [...names].sort()) {
    const meta = metadataFor2(registry, name);
    let source;
    if (locals.has(name)) {
      source = "local-plugin";
    } else if (BUILTIN_SKILLS.has(name)) {
      source = "builtin";
    } else {
      const section2 = external.get(name) ?? "";
      source = /superpowers 系|commit-commands 系/.test(section2) ? "external-marketplace" : "user";
    }
    const available = meta?.unavailable !== true;
    let installed;
    if (!available) {
      installed = false;
    } else if (source === "builtin" || meta?.tool === "builtin" || meta?.tool === "bundled" || locals.has(name)) {
      installed = true;
    } else if (meta?.tool === "npm") {
      installed = meta.bin !== void 0 && executableOnPath(meta.bin);
    } else if (meta?.tool === "claude-plugin") {
      const plugin = meta.skill ?? name.split(":")[0] ?? name;
      installed = detected.codexPluginBases.has(plugin) || detected.skills.has(plugin) || detected.skills.has(name);
    } else if (name.includes(":")) {
      const plugin = name.split(":")[0] ?? name;
      installed = detected.codexPluginBases.has(plugin) || detected.skills.has(meta?.skill ?? name);
    } else {
      installed = detected.skills.has(meta?.skill ?? name);
    }
    const description = descriptionForSkill(name, repoRoot, claudeDir, meta);
    entries.push({
      name,
      installed,
      source,
      ...description ? { description } : {},
      tier: meta?.tier ?? "optional",
      available,
      ...installed ? {} : { installCmd: installCmdFor(source, name, repoRoot, meta) }
    });
  }
  return entries;
}

// packages/server/src/snapshot.ts
import { lstat as lstat14, readFile as readFile18, readdir as readdir4, stat as stat5 } from "node:fs/promises";
import { join as join37, resolve as resolve12 } from "node:path";

// packages/server/src/projectCapabilities.ts
import { statSync as statSync4 } from "node:fs";
import { join as join36 } from "node:path";
function projectFileExists(root, repoRelativePath) {
  try {
    return statSync4(join36(root, repoRelativePath)).isFile();
  } catch {
    return false;
  }
}

// packages/server/src/workflowSnapshot.ts
function resolveSnapshotEffectivePlan(root, workflowName, binding) {
  const plan = resolveBoundEffectiveWorkflowPlan(workflowName, binding, (name) => {
    const definition = builtinWorkflow(name) ?? loadWorkflow(root, name);
    return definition === null ? null : compileWorkflow(definition);
  }, void 0, binding.workflowPlanSnapshot);
  if (plan === null) throw new Error(`workflow '${workflowName}' \u672A\u627E\u5230`);
  return plan;
}
function snapshotTodoStages(plan, phase) {
  if (plan) {
    return plan.workflow.steps.map((step) => ({
      id: step.id,
      label: step.label || step.id,
      transitions: step.transitions.map((transition) => transition.to)
    }));
  }
  return phase === "" ? [] : [{ id: phase, label: phase }];
}
function snapshotWorkflowRules(plan) {
  return {
    executionModel: plan.capabilities.execution.model,
    steps: plan.workflow.steps.map((step) => step.id),
    transitions: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.transitions.map((transition) => ({ event: transition.event, to: transition.to }))
    ])),
    gateByStep: Object.fromEntries(plan.workflow.steps.map((step) => [step.id, step.gate])),
    labelByStep: Object.fromEntries(
      plan.workflow.steps.map((step) => [step.id, step.label || step.id])
    ),
    outputsByStep: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.outputs.map((output) => output.field)
    ]))
  };
}
function legacySnapshotWorkflowRules(plan) {
  const current = snapshotWorkflowRules(plan);
  return {
    steps: current.steps,
    transitions: current.transitions,
    gateByStep: current.gateByStep,
    labelByStep: current.labelByStep,
    outputsByStep: current.outputsByStep,
    nonemptyOutputByStep: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.guards.some((guard) => guard.type === "output-present")
    ]))
  };
}
async function snapshotWorkflowExecution(plan, state, root, changeDir, changeName, deps) {
  const fileExists = deps.fileExists ?? projectFileExists;
  const gitHeadSha2 = deps.gitHeadSha;
  const workspaceFingerprint = deps.workspaceFingerprint;
  return {
    readinessByTransition: await readinessByTransition(plan, state, {
      changeDirAbs: changeDir,
      fileExists: (path7) => fileExists(root, path7),
      gitHeadSha: gitHeadSha2 === void 0 ? void 0 : () => gitHeadSha2(root),
      workspaceFingerprint: workspaceFingerprint === void 0 ? void 0 : () => workspaceFingerprint(root, changeName),
      specMigrationStatus: () => evaluateSpecMigrationEvidence(root, changeDir, changeName)
    })
  };
}

// packages/server/src/snapshot.ts
function str(v) {
  if (Array.isArray(v)) return v.join(",");
  return v ?? "";
}
async function readTasksMarkdown(changeDir) {
  const target = join37(changeDir, "tasks.md");
  try {
    const info = await lstat14(target);
    if (!info.isFile() || info.isSymbolicLink()) return void 0;
    return await readFile18(target, "utf8");
  } catch {
    return void 0;
  }
}
async function readTerminalActivity(changeDir, changeName, nowMs) {
  const target = join37(changeDir, TERMINAL_ACTIVITY_FILE);
  try {
    const entry = await lstat14(target);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 4096) return void 0;
    const parsed = parseTerminalActivityRecord(JSON.parse(await readFile18(target, "utf8")));
    if (parsed === null || parsed.change !== changeName) return void 0;
    const live = liveTerminalActivity(parsed, nowMs);
    if (live === null) return void 0;
    return {
      sessionId: live.sessionId,
      heartbeatAt: live.heartbeatAt,
      expiresAt: live.expiresAt,
      ...live.turnId === void 0 ? {} : { turnId: live.turnId }
    };
  } catch {
    return void 0;
  }
}
async function documentEvidence(root, changeDir, plan, phase) {
  const policy = plan?.capabilities.documents.policy;
  if (!policy) return { governed: false, blockers: [], items: [] };
  if (!isDocumentPolicyStep(policy, phase)) {
    return {
      governed: true,
      phase,
      ledgerPresent: false,
      pass: false,
      blockers: [`\u53D7 document contract \u6CBB\u7406\u7684 workflow \u5F53\u524D step \u975E\u6CD5\uFF08\u5F53\u524D '${phase || "\u7A7A"}'\uFF09`],
      items: []
    };
  }
  const report = await evaluateDocumentEvidence(root, changeDir, phase, {}, policy);
  return {
    governed: true,
    phase,
    ledgerPresent: report.hasLedger,
    pass: report.pass,
    blockers: [...report.blockers],
    items: report.items.map((item2) => ({
      kind: item2.kind,
      status: item2.status,
      requiredRead: item2.requiredRead,
      paths: [...item2.paths],
      producers: [...item2.producers]
    }))
  };
}
function documentTodoItems(plan, evidence) {
  const policy = plan?.capabilities.documents.policy;
  if (!policy) return {};
  const status = new Map(evidence.items.map((item2) => [item2.kind, item2.status]));
  return Object.fromEntries(policy.steps.map((step) => [
    step,
    (policy.outputsByStep[step] ?? []).map((requirement) => ({
      text: `[document] ${requirement.kind}`,
      completed: status.get(requirement.kind) === "recorded"
    }))
  ]));
}
function dedupeRoots(roots) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of roots) {
    if (!r) continue;
    const rp = resolve12(r);
    if (seen.has(rp)) continue;
    seen.add(rp);
    out.push(rp);
  }
  return out;
}
async function scanProject(deps, root, nowMs) {
  const { store } = deps;
  let isDir = false;
  try {
    isDir = (await stat5(root)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { root, ok: false, changes: [], workflowRules: {}, error: "root \u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8FBE" };
  const changesRoot = join37(root, "openspec", "changes");
  let entries;
  try {
    entries = await readdir4(changesRoot, { withFileTypes: true });
  } catch {
    return { root, ok: true, changes: [], workflowRules: {} };
  }
  const changes = [];
  const legacyWorkflowRules = {};
  const errors = [];
  let gitHeadPromise;
  const workspaceFingerprints = /* @__PURE__ */ new Map();
  const gitHeadSha2 = deps.gitHeadSha;
  const workspaceFingerprint = deps.workspaceFingerprint;
  const capabilityDeps = {
    ...deps.fileExists === void 0 ? {} : { fileExists: deps.fileExists },
    ...gitHeadSha2 === void 0 ? {} : {
      gitHeadSha: () => {
        gitHeadPromise ??= gitHeadSha2(root);
        return gitHeadPromise;
      }
    },
    ...workspaceFingerprint === void 0 ? {} : {
      workspaceFingerprint: (_root, changeName) => {
        let pending = workspaceFingerprints.get(changeName);
        if (pending === void 0) {
          pending = workspaceFingerprint(root, changeName);
          workspaceFingerprints.set(changeName, pending);
        }
        return pending;
      }
    }
  };
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "archive") continue;
    const changeDir = join37(changesRoot, e.name);
    let source;
    try {
      source = stateStorageSourcePathSync(changeDir);
    } catch (error) {
      errors.push(`${e.name}: \u72B6\u6001\u6765\u6E90\u68C0\u67E5\u5931\u8D25\uFF08${error instanceof Error ? error.message : String(error)}\uFF09`);
      continue;
    }
    if (source === void 0) continue;
    try {
      const projection = await store.inspectProjection(changeDir);
      if (projection.status === "missing" || projection.status === "stale" || projection.status === "legacy-compatible") {
        await store.repairProjection(changeDir);
      } else if (projection.status === "drift") {
        errors.push(`${e.name}: YAML projection drift\uFF08${projection.reason}\uFF09`);
      }
      const state = await store.read(changeDir);
      const f = state.fields;
      const phase = str(f.phase);
      const workflowName = str(f.workflow) || "default";
      const track = str(f.track);
      const plan = resolveSnapshotEffectivePlan(root, workflowName, {
        documentProfile: state.runMetadata?.documentProfile,
        documentGovernanceFingerprint: state.runMetadata?.documentGovernanceFingerprint,
        workflowPlanFingerprint: state.runMetadata?.workflowPlanFingerprint,
        workflowPlanSnapshot: state.runMetadata?.workflowPlanSnapshot
      });
      legacyWorkflowRules[workflowName] ??= legacySnapshotWorkflowRules(plan);
      const [documents, terminalActivity] = await Promise.all([
        documentEvidence(root, changeDir, plan, phase),
        readTerminalActivity(changeDir, e.name, nowMs)
      ]);
      const todo = projectPipelineTodo({
        phase,
        tasksMarkdown: await readTasksMarkdown(changeDir),
        stages: snapshotTodoStages(plan, phase),
        additionalItemsByStage: documentTodoItems(plan, documents)
      });
      changes.push({
        name: e.name,
        path: changeDir,
        phase,
        phase_status: str(f.phase_status),
        track,
        preset: str(f.preset),
        archived: str(f.archived),
        updated_at: str(f.updated_at),
        fields: f,
        workflowPlanFingerprint: plan.workflowFingerprint,
        workflowRules: snapshotWorkflowRules(plan),
        workflowExecution: await snapshotWorkflowExecution(
          plan,
          state,
          root,
          changeDir,
          e.name,
          capabilityDeps
        ),
        todo,
        documents,
        ...terminalActivity === void 0 ? {} : { terminalActivity }
      });
    } catch (error) {
      errors.push(
        `${e.name}: \u72B6\u6001\u635F\u574F\u6216\u4E0D\u53EF\u8BFB [${source}]\uFF08${error instanceof Error ? error.message : String(error)}\uFF09`
      );
    }
  }
  changes.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    root,
    ok: errors.length === 0,
    changes,
    workflowRules: legacyWorkflowRules,
    ...errors.length === 0 ? {} : { error: errors.join("; ") }
  };
}
async function buildSnapshot(deps) {
  const roots = dedupeRoots(deps.registry());
  const nowMs = deps.now?.() ?? Date.now();
  const projects = await Promise.all(roots.map((r) => scanProject(deps, r, nowMs)));
  const change_count = projects.reduce((n, p) => n + p.changes.length, 0);
  return {
    snapshot_protocol: "tenon-snapshot/v2",
    version: deps.version,
    generated_at: deps.clock(),
    // 能力声明（GOAL B6）：基线 4 域恒 true；afk/traffic 等由 server 按真实接线注入合并（未接线不谎报）。
    capabilities: { snapshot: true, health: true, stream: true, transition: true, ...deps.capabilities ?? {} },
    project_count: projects.length,
    change_count,
    projects
  };
}
async function computeFingerprint(roots, nowMs = Date.now()) {
  const parts = [];
  for (const root of dedupeRoots(roots)) {
    const changesRoot = join37(root, "openspec", "changes");
    let entries;
    try {
      entries = await readdir4(changesRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === "archive") continue;
      const source = stateStorageSourcePathSync(join37(changesRoot, e.name));
      if (source === void 0) continue;
      try {
        const st = await lstat14(source, { bigint: true });
        parts.push(`${source}:${st.size}:${st.mtimeNs}`);
      } catch {
      }
      const tasks = join37(changesRoot, e.name, "tasks.md");
      try {
        const st = await lstat14(tasks, { bigint: true });
        parts.push(`${tasks}:${st.size}:${st.mtimeNs}`);
      } catch {
      }
      const documents = join37(changesRoot, e.name, ".pipeline-documents.json");
      try {
        const st = await lstat14(documents, { bigint: true });
        parts.push(`${documents}:${st.size}:${st.mtimeNs}`);
      } catch {
      }
      const terminalActivity = join37(changesRoot, e.name, TERMINAL_ACTIVITY_FILE);
      try {
        const st = await lstat14(terminalActivity, { bigint: true });
        const live = await readTerminalActivity(join37(changesRoot, e.name), e.name, nowMs);
        parts.push(`${terminalActivity}:${st.size}:${st.mtimeNs}:${live === void 0 ? "stale" : "live"}`);
      } catch {
      }
    }
  }
  parts.sort();
  return parts.join("|");
}

// packages/server/src/traces.ts
function listTraceSessions(store, clock) {
  const sessions = store.listSessions().slice();
  sessions.sort((a, b) => a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0);
  return { generated_at: clock(), outbound: "local-only", count: sessions.length, sessions };
}
function readTraceRecords(store, session, clock) {
  const records = store.readRecords(session);
  return { generated_at: clock(), outbound: "local-only", session, count: records.length, records };
}

// packages/server/src/serverGetActivityRoutes.ts
import { join as join41, resolve as resolvePath4 } from "node:path";

// packages/server/src/afk.ts
import { execFile as execFile3 } from "node:child_process";
import { readFile as readFile19, writeFile as writeFile11 } from "node:fs/promises";
import { join as join38 } from "node:path";
var AFK_LANES = ["queued", "running", "merged", "failed", "conflict", "paused"];
function isAutomationState(value) {
  return AUTOMATION_STATES.includes(value);
}
function str2(v) {
  if (Array.isArray(v)) return v.join(",");
  return v ?? "";
}
function laneOf(automation) {
  if (!isAutomationState(automation)) return null;
  switch (automation) {
    case "queued":
      return "queued";
    case "scheduled":
    case "running":
      return "running";
    case "merged":
      return "merged";
    case "failed":
      return "failed";
    case "conflict":
      return "conflict";
    case "paused":
      return "paused";
    default:
      return null;
  }
}
function emptyLanes() {
  return { queued: [], running: [], merged: [], failed: [], conflict: [], paused: [] };
}
function cardOf(root, c) {
  const automation = str2(c.fields.automation);
  const lane = laneOf(automation);
  if (!lane) return null;
  const attemptsRaw = Number(str2(c.fields.automation_attempts) || "0");
  return {
    name: c.name,
    root,
    path: c.path,
    phase: c.phase,
    automation,
    lane,
    attempts: Number.isFinite(attemptsRaw) ? attemptsRaw : 0,
    queued_at: str2(c.fields.automation_queued_at),
    last_error: str2(c.fields.automation_last_error),
    sandbox: str2(c.fields.automation_sandbox),
    worktree: str2(c.fields.automation_worktree),
    preserved_path: str2(c.fields.automation_preserved_path),
    // F-b：宽索引访问而非 c.fields.automation_cause——server 不把编译耦合到 kernel FieldName
    // 是否已收录该键（写入端并行落 FIELD_ORDER，两端独立可发布）；缺字段 → str(undefined) = ''，
    // 即「未落/老数据」的契约信号，前端据此回落 regex（同模块头零依赖原则的字段面延伸）。
    cause: str2(c.fields.automation_cause)
  };
}
function buildAfkSnapshot(snapshot, clock) {
  const lanes = emptyLanes();
  const cards = [];
  for (const proj of snapshot.projects) {
    for (const c of proj.changes) {
      const card = cardOf(proj.root, c);
      if (!card) continue;
      cards.push(card);
      lanes[card.lane].push(card);
    }
  }
  const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  for (const lane of AFK_LANES) lanes[lane].sort(byName);
  cards.sort(byName);
  const queued = lanes.queued.length;
  const running = lanes.running.length;
  const merged = lanes.merged.length;
  const failed = lanes.failed.length;
  const conflict = lanes.conflict.length;
  const paused = lanes.paused.length;
  const total = cards.length;
  const attention = failed + conflict > 0;
  const status = attention ? "attention" : queued + running > 0 ? "busy" : "ok";
  const message = attention ? `\u8C03\u5EA6\u5668\u9700\u4EBA\u5DE5\u4ECB\u5165\uFF1A${failed} failed / ${conflict} conflict\uFF08\u73B0\u573A\u5DF2\u4FDD\u7559\uFF09` : queued + running > 0 ? `\u8C03\u5EA6\u5668\u8FD0\u884C\u4E2D\uFF1A${running} \u5728\u8DD1 / ${queued} \u6392\u961F` : total > 0 ? `\u65E0\u6D3B\u8DC3\u4EFB\u52A1\uFF1A${merged} \u5DF2\u5408\u5E76 / ${paused} \u6682\u505C` : "AFK \u7A7A\u95F2\uFF08\u65E0\u81EA\u52A8\u5316\u4EFB\u52A1\uFF09";
  return {
    generated_at: clock(),
    scheduler: { status, queued, running, merged, failed, conflict, paused, total, message },
    lanes,
    cards
  };
}
function buildAfkLog(snapshot, clock) {
  const now = clock();
  const entries = [];
  for (const proj of snapshot.projects) {
    for (const c of proj.changes) {
      const card = cardOf(proj.root, c);
      if (!card) continue;
      const anchor = card.queued_at || now;
      if (card.queued_at) {
        entries.push({ ts: card.queued_at, name: card.name, root: card.root, automation: card.automation, kind: "queued", detail: "\u5DF2\u6302\u961F\uFF08automation=queued\uFF09" });
      }
      if (card.last_error) {
        entries.push({ ts: anchor, name: card.name, root: card.root, automation: card.automation, kind: "error", detail: card.last_error });
      }
      entries.push({ ts: anchor, name: card.name, root: card.root, automation: card.automation, kind: "state", detail: `\u5F53\u524D\u6001 automation=${card.automation}` });
    }
  }
  entries.sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
  return { generated_at: now, entries };
}
async function cancelAfkRun(store, changeDir) {
  if (!stateStorageExistsSync(changeDir)) {
    return { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09\uFF0C\u627E\u4E0D\u5230\u8FD0\u884C\u4E2D\u7684 job" };
  }
  const automation = str2(await store.get(changeDir, "automation"));
  if (automation !== "running") {
    return { ok: false, error: `automation \u72B6\u6001\u662F '${automation || "(\u7A7A)"}'\uFF0C\u4E0D\u662F running\uFF0C\u627E\u4E0D\u5230\u8FD0\u884C\u4E2D\u7684 job` };
  }
  const worktree = str2(await store.get(changeDir, "automation_worktree"));
  const sandbox = str2(await store.get(changeDir, "automation_sandbox"));
  if (!worktree || !sandbox) {
    return { ok: false, error: "\u7F3A automation_worktree/automation_sandbox\uFF0C\u65E0\u6CD5\u5B9A\u4F4D\u5BB9\u5668" };
  }
  try {
    await writeFile11(join38(worktree, CANCEL_MARKER_FILE), "1", "utf8");
  } catch (err) {
    const code = err?.code ?? "unknown";
    return {
      ok: false,
      error: `\u65E0\u6CD5\u5728 automation_worktree \u76EE\u5F55\u843D\u53D6\u6D88\u6807\u8BB0\uFF08${code}\uFF09\uFF1Aworktree \u76EE\u5F55\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406\uFF0C\u6216\u5B57\u6BB5\u503C\u66FE\u88AB\u65E7\u7248\u622A\u65AD\u635F\u574F\u2014\u2014\u82E5\u4EFB\u52A1\u5B9E\u9645\u5DF2\u4E0D\u5728\u8DD1\uFF0C\u53EF\u76F4\u63A5\u91CD\u8BD5/\u653E\u5F03\u8BE5\u4EFB\u52A1`
    };
  }
  await new Promise((resolve13) => {
    execFile3("docker", ["kill", sandbox], () => resolve13());
  });
  return { ok: true };
}
var RETRYABLE_FROM = ["failed", "conflict", "paused"];
async function retryAfkRun(store, changeDir) {
  if (!stateStorageExistsSync(changeDir)) {
    return { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09\uFF0C\u627E\u4E0D\u5230\u53EF\u91CD\u8BD5\u7684\u4EFB\u52A1" };
  }
  const current = str2(await store.get(changeDir, "automation"));
  if (!RETRYABLE_FROM.includes(current)) {
    return { ok: false, error: `automation \u72B6\u6001\u662F '${current || "(\u7A7A)"}'\uFF0C\u4E0D\u53EF\u91CD\u8BD5\uFF08\u4EC5 failed/conflict/paused \u53EF\u91CD\u8BD5\uFF0Crunning \u8BF7\u5148 cancel\uFF09` };
  }
  const ok = await store.cas(changeDir, "automation", current, "queued");
  if (!ok) return { ok: false, error: "CAS \u5931\u8D25\uFF0C\u72B6\u6001\u5728\u6B64\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539" };
  await store.set(changeDir, "automation_attempts", "0");
  return { ok: true };
}
var DISMISSABLE_FROM = ["failed", "conflict"];
async function dismissAfkRun(store, changeDir) {
  if (!stateStorageExistsSync(changeDir)) {
    return { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09\uFF0C\u627E\u4E0D\u5230\u53EF\u653E\u5F03\u7684\u4EFB\u52A1" };
  }
  const current = str2(await store.get(changeDir, "automation"));
  if (!DISMISSABLE_FROM.includes(current)) {
    return { ok: false, error: `automation \u72B6\u6001\u662F '${current || "(\u7A7A)"}'\uFF0C\u4E0D\u53EF\u653E\u5F03\uFF08\u4EC5 failed/conflict \u53EF\u653E\u5F03\uFF1Brunning \u8BF7\u5148 cancel\uFF0Cpaused \u8D70\u653E\u884C/\u6253\u56DE\uFF09` };
  }
  const ok = await store.cas(changeDir, "automation", current, "off");
  if (!ok) return { ok: false, error: "CAS \u5931\u8D25\uFF0C\u72B6\u6001\u5728\u6B64\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539" };
  return { ok: true };
}
async function enqueueAfkRun(store, changeDir, clock, eligibility) {
  if (!stateStorageExistsSync(changeDir)) {
    return { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" };
  }
  if (!eligibility.automationEligible) {
    return { ok: false, error: `${eligibility.trackLabel} track \u4E0D\u652F\u6301 AFK \u81EA\u52A8\u5316\u6302\u961F` };
  }
  const current = str2(await store.get(changeDir, "automation"));
  if (current && current !== "off") {
    return { ok: false, error: `automation \u72B6\u6001\u5DF2\u662F '${current}'\uFF0C\u65E0\u9700\u91CD\u590D\u6302\u961F` };
  }
  await store.setMany(changeDir, { automation: "queued", automation_queued_at: clock() });
  return { ok: true };
}
async function readAfkRunLog(changeDir) {
  try {
    return await readFile19(join38(changeDir, ".sandcastle-run.log"), "utf8");
  } catch {
    return null;
  }
}

// packages/server/src/runDetail.ts
function scalar4(value) {
  return Array.isArray(value) ? value.join(",") : value ?? "";
}
async function revisionChain(changeDir, current) {
  if (!current) return [];
  await validateCanonicalRevisionHistory(changeDir);
  const result = [current];
  let cursor = current;
  while (cursor.revision > 0) {
    const previousRevisionId = cursor.previousRevisionId;
    if (previousRevisionId === void 0) {
      throw new Error(`canonical history revision ${cursor.revision} \u7F3A previousRevisionId`);
    }
    const previous = await readImmutableRunRevision(
      changeDir,
      cursor.revision - 1,
      previousRevisionId
    );
    if (!previous) throw new Error(`canonical history revision ${cursor.revision - 1} \u7F3A\u5931`);
    result.unshift(previous);
    cursor = previous;
  }
  return result;
}
function stringProp(record2, key) {
  const value = Reflect.get(record2, key);
  return typeof value === "string" ? value : void 0;
}
function relatedLedgerRecords(records, change, workflowRunId) {
  const selected = /* @__PURE__ */ new Set();
  const attempts = /* @__PURE__ */ new Set();
  const reservations = /* @__PURE__ */ new Set();
  const usageIds = /* @__PURE__ */ new Set();
  const recordIds = /* @__PURE__ */ new Set();
  const intentIds = /* @__PURE__ */ new Set();
  const absorb = (record2, index) => {
    if (selected.has(index)) return false;
    selected.add(index);
    const attempt = stringProp(record2, "attempt_id");
    const reservation = stringProp(record2, "reservation_id");
    const usage = stringProp(record2, "usage_id");
    const recordId = stringProp(record2, "record_id");
    const intentId = stringProp(record2, "intent_record_id");
    if (attempt) attempts.add(attempt);
    if (reservation) reservations.add(reservation);
    if (usage) usageIds.add(usage);
    if (recordId) recordIds.add(recordId);
    if (intentId) intentIds.add(intentId);
    const referencedUsage = Reflect.get(record2, "usage_record_ids");
    if (Array.isArray(referencedUsage)) {
      for (const id of referencedUsage) if (typeof id === "string") usageIds.add(id);
    }
    return true;
  };
  records.forEach((record2, index) => {
    if (stringProp(record2, "change") === change || workflowRunId !== void 0 && stringProp(record2, "workflow_run_id") === workflowRunId) {
      absorb(record2, index);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    records.forEach((record2, index) => {
      if (selected.has(index)) return;
      const attemptId = stringProp(record2, "attempt_id");
      const reservationId = stringProp(record2, "reservation_id");
      const usageId = stringProp(record2, "usage_id");
      const recordId = stringProp(record2, "record_id");
      const intentId = stringProp(record2, "intent_record_id");
      const match = attemptId !== void 0 && attempts.has(attemptId) || reservationId !== void 0 && reservations.has(reservationId) || usageId !== void 0 && usageIds.has(usageId) || recordId !== void 0 && intentIds.has(recordId) || intentId !== void 0 && recordIds.has(intentId);
      if (match && absorb(record2, index)) changed = true;
    });
  }
  return records.filter((_, index) => selected.has(index));
}
function attemptContexts(records) {
  return records.flatMap((record2) => {
    if (record2.kind !== "budget-reservation" || record2.attempt_context === void 0) return [];
    return [{
      record_id: record2.record_id,
      recorded_at: record2.recorded_at,
      reservation_id: record2.reservation_id,
      attempt_id: record2.attempt_id,
      ...record2.iteration_id ? { iteration_id: record2.iteration_id } : {},
      loop_id: record2.loop_id,
      source_run_record_ids: record2.attempt_context.source_run_record_ids,
      omitted_attempt_ids: record2.attempt_context.omitted_attempt_ids,
      rendered: record2.attempt_context.rendered,
      stagnation: record2.attempt_context.stagnation
    }];
  });
}
async function buildRunDetail(repoRoot, changeDir, changeName, deps) {
  const current = await readCurrentRunRevision(changeDir);
  const revisions = await revisionChain(changeDir, current);
  const state = current?.state ?? await deps.store.read(changeDir);
  const metadata = state.runMetadata;
  let transitions = [];
  if (metadata?.transitionHead) {
    transitions = await deps.recordStore.readChain(
      changeDir,
      metadata.transitionSequence,
      metadata.transitionHead,
      metadata.runId
    );
    if (current) await validateCanonicalRevisionHistory(changeDir);
  }
  const ledgerRead = await deps.ledger.read(repoRoot);
  const projection = await deps.store.inspectProjection(changeDir);
  const related = relatedLedgerRecords(ledgerRead.records, changeName, metadata?.runId);
  const fields = state.fields;
  const automationPolicy = metadata?.automationPolicy;
  return {
    ok: true,
    root: repoRoot,
    change: changeName,
    source: current ? "canonical" : "legacy",
    projection,
    workflow_run: metadata ? {
      id: metadata.runId,
      workflow_id: scalar4(fields.workflow) || "default",
      current_step: scalar4(fields.phase),
      lifecycle: scalar4(fields.archived) === "true" ? "archived" : "active",
      transition_sequence: metadata.transitionSequence,
      ...metadata.transitionHead ? { transition_head: metadata.transitionHead } : {},
      created_at: scalar4(fields.created_at),
      updated_at: scalar4(fields.updated_at),
      ...automationPolicy ? {
        policy_id: automationPolicy.policy_id,
        policy_version: automationPolicy.policy_version,
        automation_policy: automationPolicy
      } : {},
      ...metadata.loopId ? { loop_id: metadata.loopId, iteration_id: metadata.iterationId } : {}
    } : null,
    current_revision: current ?? null,
    revisions,
    transitions,
    attempt_contexts: attemptContexts(related),
    ledger: {
      health: ledgerRead.rejected.length > 0 ? "degraded" : ledgerRead.records.length > 0 ? "ok" : "missing",
      rejected: ledgerRead.rejected,
      records: related
    }
  };
}

// packages/server/src/transition.ts
import { readFile as readFile21 } from "node:fs/promises";
import { join as join40 } from "node:path";

// packages/server/src/transitionHistory.ts
import { readFile as readFile20 } from "node:fs/promises";
import { join as join39 } from "node:path";
function decodeHistoryEntry(value) {
  if (typeof value !== "object" || value === null) return null;
  const record2 = value;
  const kinds = /* @__PURE__ */ new Set([
    "transition",
    "set",
    "init",
    "tool",
    "prompt",
    "import"
  ]);
  if (typeof record2.ts !== "string" || typeof record2.kind !== "string" || !kinds.has(record2.kind)) return null;
  const kind = record2.kind;
  return {
    ts: record2.ts,
    kind,
    ...typeof record2.field === "string" ? { field: record2.field } : {},
    ...typeof record2.from === "string" ? { from: record2.from } : {},
    ...typeof record2.to === "string" ? { to: record2.to } : {},
    ...typeof record2.by === "string" ? { by: record2.by } : {},
    ...typeof record2.raw === "string" ? { raw: record2.raw } : {},
    ...typeof record2.phase === "string" ? { phase: record2.phase } : {},
    ...typeof record2.transitionRecordId === "string" ? { transitionRecordId: record2.transitionRecordId } : {}
  };
}
async function readJsonlHistory(changeDir) {
  let text2;
  try {
    text2 = await readFile20(join39(changeDir, HISTORY_FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const line of text2.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = decodeHistoryEntry(JSON.parse(trimmed));
      if (entry !== null) entries.push(entry);
    } catch {
    }
  }
  return entries;
}
async function readChangeHistory(changeDir, deps) {
  const jsonlEntries = await readJsonlHistory(changeDir);
  const state = await deps.store.read(changeDir);
  const metadata = state.runMetadata;
  if (!metadata?.transitionHead) return sortByTs(jsonlEntries);
  const chain = await deps.recordStore.readChain(
    changeDir,
    metadata.transitionSequence,
    metadata.transitionHead,
    metadata.runId
  );
  await validateCanonicalRevisionHistory(changeDir);
  const canonicalEntries = chain.map(transitionRecordToHistoryEntry);
  const legacyOrNonTransition = jsonlEntries.filter(
    (entry) => entry.kind !== "transition" || entry.transitionRecordId === void 0
  );
  return mergeCanonicalAndLegacy(canonicalEntries, sortByTs(legacyOrNonTransition));
}
function sortByTs(entries) {
  return entries.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
}
function mergeCanonicalAndLegacy(canonicalSorted, legacySorted) {
  const merged = [];
  let canonicalIndex = 0;
  let legacyIndex = 0;
  while (canonicalIndex < canonicalSorted.length && legacyIndex < legacySorted.length) {
    const canonical = canonicalSorted[canonicalIndex];
    const legacy = legacySorted[legacyIndex];
    if (canonical === void 0 || legacy === void 0) break;
    if (legacy.ts <= canonical.ts) {
      merged.push(legacy);
      legacyIndex++;
    } else {
      merged.push(canonical);
      canonicalIndex++;
    }
  }
  merged.push(...canonicalSorted.slice(canonicalIndex));
  merged.push(...legacySorted.slice(legacyIndex));
  return merged;
}

// packages/server/src/transition.ts
var CHANGE_NAME_RE2 = /^[a-zA-Z0-9_-]+$/;
function errText4(e) {
  return e instanceof Error ? e.message : String(e);
}
var NotFoundError = class extends Error {
};
function mapTransitionResult(name, event, result) {
  switch (result.kind) {
    case "applied": {
      for (const warning of result.warnings) {
        if (warning.kind === "build-sha-missing") continue;
        switch (warning.projection) {
          case "state-yaml":
            process.stderr.write(`WARN: state YAML projection \u5199\u5165\u5931\u8D25\uFF08canonical \u5DF2\u63D0\u4EA4\uFF09: ${errText4(warning.cause)}
`);
            break;
          case "breadcrumb":
            process.stderr.write(`WARN: breadcrumb \u5199\u5165\u5931\u8D25: ${errText4(warning.cause)}
`);
            break;
          case "history":
            process.stderr.write(`WARN: history \u5199\u5165\u5931\u8D25: ${errText4(warning.cause)}
`);
            break;
        }
      }
      return { code: 200, body: { ok: true, name, event, from: result.from, to: result.to } };
    }
    case "unknown-event":
      return { code: 400, body: { ok: false, error: `\u672A\u77E5 event: ${result.event}` } };
    case "event-source-mismatch":
      return {
        code: 409,
        body: {
          ok: false,
          error: `event '${result.event}' \u4E0E\u5F53\u524D phase '${result.current}' \u4E0D\u5339\u914D\uFF08\u671F\u671B\u6765\u81EA '${result.expected}'\uFF09`
        }
      };
    case "illegal-transition":
      return { code: 409, body: { ok: false, error: `illegal transition: ${result.from} -> ${result.to}` } };
    case "precondition-violated":
      return { code: 409, body: { ok: false, error: result.lines[0], detail: result.lines } };
    case "workflow-not-found":
      return {
        code: 409,
        body: {
          ok: false,
          error: `workflow '${result.workflowName}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${result.workflowName}.yaml\uFF09`
        }
      };
    case "document-governance-invalid":
      return {
        code: 409,
        body: { ok: false, error: result.reason, code: "document-governance-invalid" }
      };
    case "step-not-in-graph":
      return { code: 409, body: { ok: false, error: `step '${result.stepId}' \u4E0D\u5728 workflow '${result.workflowName}' \u91CC` } };
    case "event-unsupported":
      return {
        code: 409,
        body: {
          ok: false,
          error: `step '${result.stepId}' \u4E0D\u652F\u6301 event '${result.event}'\uFF1B\u8BE5 step \u652F\u6301\uFF1A${result.available.join(", ") || "(\u65E0)"}`
        }
      };
    case "step-guard-failed": {
      const lines = [`step '${result.stepId}' guard \u672A\u901A\u8FC7`, ...result.failures];
      return { code: 409, body: { ok: false, error: lines[0], detail: lines } };
    }
    case "step-skills-incomplete": {
      const lines = [`step '${result.stepId}' \u5C1A\u672A\u5B8C\u6210\u58F0\u660E\u7684 skill`, ...result.missing];
      return {
        code: 409,
        body: { ok: false, error: lines[0], detail: lines, code: "step-skills-incomplete" }
      };
    }
    case "document-evidence-failed": {
      const lines = [`OpenSpec \u6587\u6863\u8BC1\u636E\u672A\u901A\u8FC7\uFF08phase=${result.phase}\uFF09`, ...result.blockers];
      return { code: 409, body: { ok: false, error: lines[0], detail: lines, code: "document-evidence-failed" } };
    }
    case "review-approval-required":
      return {
        code: 409,
        body: {
          ok: false,
          error: `phase '${result.phase}' \u7684\u4EA7\u7269\u5C1A\u672A\u53D6\u5F97\u4EBA\u5DE5\u786E\u8BA4`,
          code: "review-approval-required"
        }
      };
    case "constraint-denied":
      return { code: 409, body: { ok: false, error: `automation constraint denied transition: ${result.reason}` } };
  }
}
async function performTransition(deps, root, name, event) {
  if (!name || !CHANGE_NAME_RE2.test(name) || name.includes("..")) {
    return { code: 400, body: { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" } };
  }
  const dir = join40(root, "openspec", "changes", name);
  if (!stateStorageExistsSync(dir)) {
    return { code: 404, body: { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" } };
  }
  const fileExists = deps.fileExists;
  const gitHeadSha2 = deps.gitHeadSha;
  const workspaceFingerprint = deps.workspaceFingerprint;
  const ctx = {
    fileExists: fileExists ? (p) => fileExists(root, p) : void 0,
    gitHeadSha: gitHeadSha2 ? () => gitHeadSha2(root) : void 0,
    workspaceFingerprint: workspaceFingerprint ? () => workspaceFingerprint(root, name) : void 0,
    specMigrationStatus: () => evaluateSpecMigrationEvidence(root, dir, name)
  };
  const app = createTransitionApplication({
    runRepository: deps.runRepo,
    flow: deps.flow,
    clock: deps.clock,
    history: deps.history,
    breadcrumb: deps.breadcrumb,
    resolveTrack: deps.resolveTrack,
    missingStepSkills: async ({ changeDir: targetDir, stepId, capability }) => {
      const slots = resolveRequiredSkillSlots(deps.skillResolver, capability, stepId);
      let historyRaw = "";
      try {
        historyRaw = await readFile21(join40(targetDir, HISTORY_FILE), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const completed = completedWorkflowSkillsSinceStepEntry(historyRaw, stepId);
      return slots.filter((slot) => !slot.alternatives.some((candidate) => completed.has(candidate))).map((slot) => slot.token);
    },
    resolveConstraintContext: async ({ policy }) => {
      const registry = loadRegistry(root, nodeLoopIoStrict);
      if (registry.data === null) throw new Error(`loops registry \u65E0\u6CD5\u6821\u9A8C\uFF1A${registry.errors.join("\uFF1B")}`);
      const loop = registry.data.loops.find((candidate) => candidate.id === policy.loop_id);
      return { active: loop?.status === "active", humanGateSatisfied: true };
    }
  });
  try {
    const result = await app.execute({
      root,
      changeDir: dir,
      changeName: name,
      event,
      context: ctx,
      // POST dashboard transition is a concrete user click in an authenticated browser flow.  It
      // is the host-bound approval surface for a review exit; CLI/agent paths cannot set this bit.
      humanReviewApproved: true,
      // loadWorkflow→compileWorkflow：TransitionApplication 收编译产物 WorkflowIR；编译错误
      // （= 基础设施错误）经 execute 抛出，落 performTransition 的 catch → 500（同既有非法 workflow 语义）。
      loadWorkflow: (wfName) => {
        const def = loadWorkflow(root, wfName);
        return def ? compileWorkflow(def) : null;
      }
    });
    let autoEnqueue;
    if (result.kind === "applied" && deps.resolveTrackPolicy !== void 0) {
      try {
        const auto = await enqueueAfterSpecComplete({
          repoRoot: root,
          store: deps.store,
          clock: deps.clock,
          resolveTrackPolicy: deps.resolveTrackPolicy
        }, {
          changeName: name,
          event,
          from: result.from,
          to: result.to
        });
        autoEnqueue = auto.kind;
      } catch (autoError) {
        process.stderr.write(`WARN: ${name} AFK \u81EA\u52A8\u6302\u961F\u5931\u8D25\uFF08transition \u5DF2\u6210\u529F\uFF09: ${errText4(autoError)}
`);
      }
    }
    const outcome = mapTransitionResult(name, event, result);
    if (autoEnqueue === void 0) return outcome;
    return { ...outcome, body: { ...outcome.body, auto_enqueue: autoEnqueue } };
  } catch (e) {
    if (e instanceof NotFoundError) return { code: 404, body: { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change" } };
    return { code: 500, body: { ok: false, error: errText4(e) } };
  }
}

// packages/server/src/serverGetActivityRoutes.ts
async function handleGetActivityRoutes(req, res, path7, deps) {
  const {
    cadenceScheduler,
    sendJson,
    sendHtml,
    serveIndexWithToken,
    serveAsset,
    indexHtml: indexHtml2,
    token,
    version,
    releaseId,
    transactionId,
    stateScopeId,
    isLocalHost: isLocalHost2,
    snapshotDeps,
    handleStream,
    isRegisteredRoot,
    clock,
    store,
    recordStore,
    loopLedger,
    errMsg: errMsg2
  } = deps;
  const boundPort = deps.boundPort();
  if (path7 === "/api/cadence/status") {
    if (cadenceScheduler === null) {
      return sendJson(res, 404, { ok: false, error: "cadence scheduler \u672A\u542F\u7528\uFF08capabilities.cadence=false\uFF09" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root");
    const status = cadenceScheduler.snapshot();
    return sendJson(res, 200, root === null ? status : {
      ...status,
      loops: status.loops.filter((row) => row.root === resolvePath4(root))
    });
  }
  if (path7 === "/" || path7 === "/index.html") {
    if (serveIndexWithToken(res)) return;
    return sendHtml(res, 200, indexHtml2(token));
  }
  if (serveAsset(res, path7)) return;
  if (path7 === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      scope: "global",
      version,
      ...releaseId === void 0 ? {} : { releaseId },
      ...transactionId === void 0 ? {} : { transactionId },
      stateScopeId,
      pid: process.pid
    });
  }
  if (!isLocalHost2(req.headers.host, boundPort)) {
    return sendJson(res, 403, { ok: false, error: "Host header \u4E0D\u5408\u6CD5\uFF08\u7591\u4F3C DNS \u91CD\u7ED1\u5B9A\u653B\u51FB\uFF09" });
  }
  if (path7 === "/api/snapshot") {
    try {
      return sendJson(res, 200, await buildSnapshot(snapshotDeps()));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/stream") return handleStream(req, res);
  if (path7 === "/api/operations/starters") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    return sendJson(res, 200, {
      ok: true,
      templates: listAutomationPolicyTemplates(),
      defaults: { runner: "codex", workflow: "default" }
    });
  }
  if (path7 === "/api/afk/snapshot") {
    try {
      return sendJson(res, 200, buildAfkSnapshot(await buildSnapshot(snapshotDeps()), clock));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/afk/log") {
    try {
      return sendJson(res, 200, buildAfkLog(await buildSnapshot(snapshotDeps()), clock));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  const logMatch = /^\/api\/afk\/([^/]+)\/log$/.exec(path7);
  if (logMatch) {
    const segment = logMatch[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name = decodeURIComponent(segment);
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join41(root, "openspec", "changes", name);
    if (!stateStorageExistsSync(dir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    return sendJson(res, 200, { log: await readAfkRunLog(dir) });
  }
  const mHistory = /^\/api\/change\/([^/]+)\/history$/.exec(path7);
  if (mHistory) {
    const segment = mHistory[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name = decodeURIComponent(segment);
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join41(root, "openspec", "changes", name);
    if (!stateStorageExistsSync(dir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    return sendJson(res, 200, { entries: await readChangeHistory(dir, { store, recordStore }) });
  }
  const mRunDetail = /^\/api\/change\/([^/]+)\/run-detail$/.exec(path7);
  if (mRunDetail) {
    const segment = mRunDetail[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name = decodeURIComponent(segment);
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join41(root, "openspec", "changes", name);
    if (!stateStorageExistsSync(dir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    try {
      return sendJson(res, 200, await buildRunDetail(root, dir, name, {
        store,
        recordStore,
        ledger: loopLedger
      }));
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: errMsg2(error) });
    }
  }
}

// packages/server/src/serverGetRoutes.ts
function repoRootForSkills() {
  return join42(dirname9(fileURLToPath2(import.meta.url)), "..", "..", "..");
}
function isWorkflowName2(name) {
  return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
}
async function handleGet(req, res, path7, deps) {
  const {
    cadenceScheduler,
    sendJson,
    sendHtml,
    serveIndexWithToken,
    serveAsset,
    indexHtml: indexHtml2,
    token,
    version,
    releaseId,
    transactionId,
    stateScopeId,
    isLocalHost: isLocalHost2,
    snapshotDeps,
    handleStream,
    isRegisteredRoot,
    clock,
    store,
    recordStore,
    loopLedger,
    registry,
    traceStore,
    workflowRootForRequest,
    trackValidationContextFor,
    trackRegistryBody,
    manifestPath: manifestPath2,
    paths,
    hostHome,
    options,
    resolveSessionLink,
    errMsg: errMsg2
  } = deps;
  const boundPort = deps.boundPort();
  await handleGetActivityRoutes(req, res, path7, deps);
  if (res.headersSent) return;
  if (path7 === "/api/loops/snapshot") {
    try {
      const snap = await buildLoopsSnapshot({ registry: () => dedupeRoots(registry()), now: () => new Date(clock()) });
      return sendJson(res, 200, snap);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/traces/sessions") {
    if (!traceStore) return sendJson(res, 404, { ok: false, error: "traces \u6570\u636E\u7AEF\u672A\u88C5\uFF08capabilities.traffic=false\uFF09" });
    try {
      return sendJson(res, 200, listTraceSessions(traceStore, clock));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/traces/records") {
    if (!traceStore) return sendJson(res, 404, { ok: false, error: "traces \u6570\u636E\u7AEF\u672A\u88C5\uFF08capabilities.traffic=false\uFF09" });
    const session = new URL(req.url ?? "/", "http://localhost").searchParams.get("session");
    if (!session) return sendJson(res, 400, { ok: false, error: "\u7F3A session \u67E5\u8BE2\u53C2\u6570" });
    try {
      return sendJson(res, 200, readTraceRecords(traceStore, session, clock));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/tracks") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      assertWorkflowRootAnchor(rootCheck.anchor);
      let pipelineExists = true;
      try {
        lstatSync5(join42(rootCheck.anchor.path, ".pipeline"));
      } catch (error) {
        if (error.code === "ENOENT") pipelineExists = false;
        else throw error;
      }
      if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
      const trackRegistry = loadTrackRegistry(rootCheck.anchor.path, trackValidationContextFor(rootCheck.anchor));
      assertWorkflowRootAnchor(rootCheck.anchor);
      return sendJson(res, 200, trackRegistryBody(trackRegistry));
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: errMsg2(error) });
    }
  }
  if (path7 === "/api/config") {
    if (!manifestPath2) return sendJson(res, 404, { ok: false, error: "config \u6570\u636E\u7AEF\u672A\u88C5\uFF08capabilities.config=false\uFF09" });
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (root === "") return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 root \u53C2\u6570" });
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      assertWorkflowRootAnchor(rootCheck.anchor);
      let pipelineExists = true;
      try {
        lstatSync5(join42(rootCheck.anchor.path, ".pipeline"));
      } catch (e) {
        if (e.code === "ENOENT") pipelineExists = false;
        else throw e;
      }
      if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
      const snapshot = readConfigSnapshot({
        manifestPath: manifestPath2,
        repoRoot: rootCheck.anchor.path,
        trackValidationContext: trackValidationContextFor(rootCheck.anchor),
        generatedAt: clock()
      });
      assertWorkflowRootAnchor(rootCheck.anchor);
      return sendJson(res, 200, snapshot);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/skills/registry") {
    try {
      return sendJson(res, 200, { skills: listAllSkillsDetailed(repoRootForSkills(), join42(hostHome, ".claude")) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/hooks") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    try {
      return sendJson(res, 200, { ok: true, hooks: HOOK_METAS, matrix: readHooksMatrix(root) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/automation") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    try {
      return sendJson(res, 200, { ok: true, settings: readAutomationSettings(root) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/workflows") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      return sendJson(res, 200, { names: listWorkflowNames(rootCheck.anchor) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  const mWfGet = /^\/api\/workflows\/([^/]+)$/.exec(path7);
  if (mWfGet) {
    const segment = mWfGet[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u8DEF\u5F84" });
    const wfName = decodeURIComponent(segment);
    if (!isWorkflowName2(wfName)) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u540D\uFF08\u5141\u8BB8\u4E2D\u6587\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001- \u4E0E _\uFF1B\u4E0D\u5141\u8BB8\u7A7A\u683C\u3001\u70B9\u6216\u8DEF\u5F84\u7B26\u53F7\uFF09" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    const builtin = builtinWorkflow(wfName);
    if (builtin !== null) {
      return sendJson(res, 200, builtin);
    }
    try {
      readWorkflowForApi(rootCheck.anchor, wfName);
      ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
    } catch (e) {
      return sendJson(res, e instanceof WorkflowNotFoundError ? 404 : 500, { ok: false, error: errMsg2(e) });
    }
    try {
      const checked = await withTrackRegistryLock(
        rootCheck.anchor.path,
        trackValidationContextFor(rootCheck.anchor),
        async ({ registry: registry2 }) => {
          assertWorkflowRootAnchor(rootCheck.anchor);
          const workflow = readWorkflowForApi(rootCheck.anchor, wfName);
          return { workflow, errors: validateWorkflowTrackReferences(workflow, registry2) };
        }
      );
      if (checked.errors.length > 0) {
        return sendJson(res, 409, {
          ok: false,
          code: "WORKFLOW_TRACK_REFERENCES_INVALID",
          workflow: wfName,
          errors: checked.errors
        });
      }
      return sendJson(res, 200, checked.workflow);
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) return sendJson(res, 404, { ok: false, error: errMsg2(e) });
      return sendJson(res, 409, {
        ok: false,
        code: "WORKFLOW_REFERENCE_CONTEXT_DEGRADED",
        workflow: wfName,
        errors: [errMsg2(e)]
      });
    }
  }
  if (path7 === "/api/secrets") {
    try {
      return sendJson(res, 200, buildSecretsResponse(paths.secretsPath));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/docker/images") {
    const r = await listDockerImages(options.execDocker);
    return sendJson(res, 200, { ok: true, ...r });
  }
  if (path7 === "/api/afk/readiness") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    if (root === "") return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 root \u53C2\u6570" });
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const image = readAutomationSettings(root).image || "sandcastle:local";
    const r = await buildAfkReadiness({
      image,
      secretsPath: paths.secretsPath,
      exec: options.execDocker,
      defaultCodexHome: join42(hostHome, ".codex")
    });
    return sendJson(res, 200, r);
  }
  if (path7 === "/api/mem/session-link") {
    const sp = new URL(req.url ?? "/", "http://localhost").searchParams;
    const name = sp.get("name") ?? "";
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const root = sp.get("root") ?? "";
    if (root === "") return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 root \u53C2\u6570" });
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const changeDir = join42(root, "openspec", "changes", name);
    if (!stateStorageExistsSync(changeDir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    return sendJson(res, 200, await resolveSessionLink(root, name));
  }
  if (path7 === "/api/mem/session-links") {
    const sp = new URL(req.url ?? "/", "http://localhost").searchParams;
    const roots = sp.getAll("root");
    const names = sp.getAll("name");
    if (roots.length !== names.length) {
      return sendJson(res, 400, { ok: false, error: "root/name \u53C2\u6570\u6570\u91CF\u4E0D\u5339\u914D" });
    }
    if (roots.length > 50) {
      return sendJson(res, 400, { ok: false, error: "items \u8FC7\u591A\uFF08\u4E0A\u9650 50\uFF09" });
    }
    const links = {};
    await Promise.all(
      roots.map(async (root, i) => {
        const name = names[i] ?? "";
        const key = `${name}@${root}`;
        const valid = name !== "" && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes("..") && root !== "" && isRegisteredRoot(root) && stateStorageExistsSync(join42(root, "openspec", "changes", name));
        links[key] = valid ? await resolveSessionLink(root, name) : { found: false, reason: "invalid" };
      })
    );
    return sendJson(res, 200, { links });
  }
  return sendJson(res, 404, { ok: false, error: "\u672A\u77E5\u7AEF\u70B9" });
}

// packages/server/src/serverMutationRoutes.ts
import { resolve as resolvePath7 } from "node:path";

// packages/server/src/projects.ts
import { statSync as statSync5 } from "node:fs";
import { resolve as resolvePath6 } from "node:path";
async function addProjectToRegistry(registryPath, rawRoot) {
  if (typeof rawRoot !== "string" || !rawRoot) {
    return { ok: false, code: 400, error: "root \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" };
  }
  let isDir;
  try {
    isDir = statSync5(rawRoot).isDirectory();
  } catch {
    return { ok: false, code: 404, error: `\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${rawRoot}` };
  }
  if (!isDir) {
    return { ok: false, code: 404, error: `\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55\uFF1A${rawRoot}` };
  }
  const normalized2 = resolvePath6(rawRoot);
  if (!await registerProjectRoot(registryPath, normalized2)) {
    return { ok: false, code: 409, error: `\u9879\u76EE\u5DF2\u6CE8\u518C\uFF1A${normalized2}` };
  }
  return { ok: true, root: normalized2 };
}
async function removeProjectFromRegistry(registryPath, rawRoot) {
  if (typeof rawRoot !== "string" || !rawRoot) {
    return { ok: false, code: 400, error: "\u7F3A root \u67E5\u8BE2\u53C2\u6570" };
  }
  const normalized2 = resolvePath6(rawRoot);
  if (!await unregisterProjectRoot(registryPath, normalized2)) {
    return { ok: false, code: 404, error: `\u9879\u76EE\u672A\u6CE8\u518C\uFF1A${normalized2}` };
  }
  return { ok: true };
}

// packages/server/src/serverMutationRoutes.ts
function isWorkflowName3(name) {
  return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
}
async function handlePatchRoute(req, res, path7, deps) {
  const {
    isLocalHost: isLocalHost2,
    sendJson,
    token,
    readJsonBody,
    workflowRootForRequest,
    mutateTrackForApi,
    scanActiveTrackChanges,
    trackRegistryBody,
    sendTrackError
  } = deps;
  const boundPort = deps.boundPort();
  if (!isLocalHost2(req.headers.host, boundPort)) {
    return sendJson(res, 403, { ok: false, error: "Host header \u4E0D\u5408\u6CD5\uFF08\u7591\u4F3C DNS \u91CD\u7ED1\u5B9A\u653B\u51FB\uFF09" });
  }
  const provided = tokenFromHeaders(req.headers);
  if (!provided || !tokensMatch(provided, token)) {
    return sendJson(res, 401, { ok: false, error: "\u7F3A\u5C11\u6216\u65E0\u6548 token\uFF08\u5199\u7AEF\u70B9\u9700\u9274\u6743\uFF09" });
  }
  const ctype = (String(req.headers["content-type"] ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
  if (ctype !== "application/json") {
    return sendJson(res, 400, { ok: false, error: "\u5199\u56DE\u7AEF\u70B9\u8981\u6C42 Content-Type: application/json" });
  }
  const match = /^\/api\/tracks\/([^/]+)$/.exec(path7);
  if (!match) return sendJson(res, 404, { ok: false, error: "\u672A\u77E5\u5199\u56DE\u7AEF\u70B9" });
  const segment = match[1];
  if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 track \u8DEF\u5F84" });
  const id = decodeURIComponent(segment);
  const rawBody = await readJsonBody(req);
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
  }
  const body = rawBody;
  const root = typeof body.root === "string" ? body.root : "";
  const revision = typeof body.revision === "string" ? body.revision : "";
  const patch = body.patch;
  if (revision === "" || typeof patch !== "object" || patch === null || Array.isArray(patch) || Object.keys(patch).length === 0) {
    return sendJson(res, 400, { ok: false, error: "revision \u4E0E\u975E\u7A7A patch \u5BF9\u8C61\u4E3A\u5FC5\u586B" });
  }
  const rootCheck = workflowRootForRequest(root);
  if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
  try {
    const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => {
      const next = updateTrack(config, id, patch);
      await assertUpdatePreservesReferences(next, id, () => scanActiveTrackChanges(rootCheck.anchor.path));
      return { next, result: void 0 };
    });
    return sendJson(res, 200, trackRegistryBody(mutation.registry));
  } catch (error) {
    return sendTrackError(res, error);
  }
}
async function handleDeleteRoute(req, res, path7, deps) {
  const {
    isLocalHost: isLocalHost2,
    sendJson,
    token,
    workflowRootForRequest,
    mutateTrackForApi,
    scanActiveTrackChanges,
    trackRegistryBody,
    sendTrackError,
    paths,
    workflowRootAnchors,
    trackValidationContextFor,
    errMsg: errMsg2
  } = deps;
  const boundPort = deps.boundPort();
  if (!isLocalHost2(req.headers.host, boundPort)) {
    return sendJson(res, 403, { ok: false, error: "Host header \u4E0D\u5408\u6CD5\uFF08\u7591\u4F3C DNS \u91CD\u7ED1\u5B9A\u653B\u51FB\uFF09" });
  }
  const provided = tokenFromHeaders(req.headers);
  if (!provided || !tokensMatch(provided, token)) {
    return sendJson(res, 401, { ok: false, error: "\u7F3A\u5C11\u6216\u65E0\u6548 token\uFF08\u5199\u7AEF\u70B9\u9700\u9274\u6743\uFF09" });
  }
  if (path7 === "/api/projects") {
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root");
    const result = await removeProjectFromRegistry(paths.registryPath, root);
    if (!result.ok) return sendJson(res, result.code, { ok: false, error: result.error });
    if (root === null) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 root \u53C2\u6570" });
    const normalized2 = resolvePath7(root);
    const anchor = workflowRootAnchors.get(normalized2);
    if (anchor) {
      closeWorkflowRootAnchor(anchor);
      workflowRootAnchors.delete(normalized2);
    }
    return sendJson(res, 200, { ok: true });
  }
  const trackDelete = /^\/api\/tracks\/([^/]+)$/.exec(path7);
  if (trackDelete) {
    const segment = trackDelete[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 track \u8DEF\u5F84" });
    const id = decodeURIComponent(segment);
    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
    const root = query.get("root") ?? "";
    const revision = query.get("revision") ?? "";
    if (revision === "") return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 revision \u53C2\u6570" });
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => {
        const next = deleteTrack(config, id);
        await assertTrackDeletable(id, () => scanActiveTrackChanges(rootCheck.anchor.path));
        return { next, result: void 0 };
      });
      return sendJson(res, 200, trackRegistryBody(mutation.registry));
    } catch (error) {
      return sendTrackError(res, error);
    }
  }
  const mWfDelete = /^\/api\/workflows\/([^/]+)$/.exec(path7);
  if (mWfDelete) {
    const segment = mWfDelete[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u8DEF\u5F84" });
    const wfName = decodeURIComponent(segment);
    if (!isWorkflowName3(wfName)) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u540D\uFF08\u5141\u8BB8\u4E2D\u6587\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001- \u4E0E _\uFF1B\u4E0D\u5141\u8BB8\u7A7A\u683C\u3001\u70B9\u6216\u8DEF\u5F84\u7B26\u53F7\uFF09" });
    }
    if (wfName === "default") {
      return sendJson(res, 400, { ok: false, error: "default workflow \u4E0D\u53EF\u901A\u8FC7\u7F16\u8F91\u5668\u5220\u9664" });
    }
    const root = new URL(req.url ?? "/", "http://localhost").searchParams.get("root") ?? "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    let permit;
    try {
      permit = captureWorkflowDeletePermit(rootCheck.anchor, wfName);
      if (!permit) return sendJson(res, 404, { ok: false, error: `workflow '${wfName}' \u4E0D\u5B58\u5728` });
      ensureWorkflowGovernanceCoordinationPath(rootCheck.anchor);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    let enteredGovernance = false;
    let enteredTrackSnapshot = false;
    try {
      const outcome = await withRegistryGovernanceLock(rootCheck.anchor.path, async () => {
        enteredGovernance = true;
        assertWorkflowRootAnchor(rootCheck.anchor);
        return withTrackRegistryLock(
          rootCheck.anchor.path,
          trackValidationContextFor(rootCheck.anchor),
          async ({ registry }) => {
            enteredTrackSnapshot = true;
            assertWorkflowRootAnchor(rootCheck.anchor);
            const scan = scanWorkflowReferencesForApi(rootCheck.anchor, wfName, registry);
            if (scan.blockers.length > 0) {
              return { kind: "scan-failed", references: scan.references, blockers: scan.blockers };
            }
            if (scan.references.length > 0) return { kind: "referenced", references: scan.references };
            if (permit === null) throw new WorkflowDeleteConflictError(`workflow '${wfName}' \u5220\u9664\u8BB8\u53EF\u7F3A\u5931`);
            deleteWorkflowForApi(rootCheck.anchor, wfName, permit);
            return { kind: "deleted" };
          }
        );
      });
      if (outcome.kind === "scan-failed") {
        return sendJson(res, 409, {
          ok: false,
          code: "WORKFLOW_REFERENCE_SCAN_FAILED",
          workflow: wfName,
          references: outcome.references,
          blockers: outcome.blockers
        });
      }
      if (outcome.kind === "referenced") {
        return sendJson(res, 409, {
          ok: false,
          code: "WORKFLOW_REFERENCED",
          workflow: wfName,
          references: outcome.references
        });
      }
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof WorkflowDeleteConflictError) {
        return sendJson(res, 409, {
          ok: false,
          code: "WORKFLOW_DELETE_STALE",
          workflow: wfName,
          error: errMsg2(e)
        });
      }
      if (enteredGovernance && !enteredTrackSnapshot) {
        return sendJson(res, 409, {
          ok: false,
          code: "WORKFLOW_REFERENCE_SCAN_FAILED",
          workflow: wfName,
          references: [],
          blockers: [{ source: "track-registry", detail: errMsg2(e) }]
        });
      }
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/secrets") {
    const key = new URL(req.url ?? "/", "http://localhost").searchParams.get("key") ?? "";
    if (!isValidSecretKey(key)) {
      return sendJson(res, 400, { ok: false, error: `\u975E\u6CD5 key\uFF08\u4EC5\u5141\u8BB8 ${SECRET_KEY_LIST}\uFF09` });
    }
    try {
      await removeSecret(paths.secretsPath, key);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  return sendJson(res, 404, { ok: false, error: "\u672A\u77E5\u7AEF\u70B9" });
}

// packages/server/src/serverPostChangesRoutes.ts
import { lstatSync as lstatSync6 } from "node:fs";
import { resolve as resolvePath8 } from "node:path";

// packages/server/src/changeLaunch.ts
import { randomUUID as randomUUID7 } from "node:crypto";
import { lstat as lstat15, readFile as readFile22, rename as rename8, unlink as unlink3, writeFile as writeFile12 } from "node:fs/promises";
import { join as join43 } from "node:path";
var CHANGE_TASK_FILE = "REAL_AGENT_TASK.md";
var MAX_TASK_PROMPT_CHARS = 24e3;
function errorCode7(error) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : null;
}
function errorMessage4(error) {
  return error instanceof Error ? error.message : String(error);
}
function parseChangeTaskPrompt(value) {
  if (value === void 0) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "task_prompt \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" };
  const prompt = value.trim();
  if (prompt === "") return { ok: false, error: "task_prompt \u4E0D\u80FD\u4E3A\u7A7A" };
  if (prompt.length > MAX_TASK_PROMPT_CHARS) {
    return { ok: false, error: `task_prompt \u4E0D\u80FD\u8D85\u8FC7 ${MAX_TASK_PROMPT_CHARS} \u4E2A\u5B57\u7B26` };
  }
  return { ok: true, value: prompt };
}
function parseChangeSessionActivation(value, hasTaskPrompt) {
  if (value === void 0) return { ok: true, value: hasTaskPrompt };
  if (typeof value !== "boolean") return { ok: false, error: "activate_session \u5FC5\u987B\u662F\u5E03\u5C14\u503C" };
  return { ok: true, value };
}
async function writeChangeTaskPrompt(changeDir, prompt) {
  const dirStat = await lstat15(changeDir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error("Change \u76EE\u5F55\u4E0D\u662F\u53EF\u4FE1\u666E\u901A\u76EE\u5F55\uFF0C\u62D2\u7EDD\u4FDD\u5B58\u4EFB\u52A1\u63D0\u793A\u8BCD");
  }
  const target = join43(changeDir, CHANGE_TASK_FILE);
  let targetExists = false;
  try {
    await lstat15(target);
    targetExists = true;
  } catch (error) {
    if (errorCode7(error) !== "ENOENT") throw error;
  }
  if (targetExists) throw new Error("\u4EFB\u52A1\u63D0\u793A\u8BCD\u5DF2\u5B58\u5728\uFF0C\u62D2\u7EDD\u8986\u76D6");
  const temporary = join43(changeDir, `.${CHANGE_TASK_FILE}.${randomUUID7()}.tmp`);
  try {
    await writeFile12(temporary, `${prompt}
`, { encoding: "utf8", flag: "wx", mode: 384 });
    await rename8(temporary, target);
  } catch (error) {
    try {
      await unlink3(temporary);
    } catch (cleanupError) {
      if (errorCode7(cleanupError) !== "ENOENT") {
        throw new Error(`\u4EFB\u52A1\u63D0\u793A\u8BCD\u53D1\u5E03\u5931\u8D25\uFF1A${errorMessage4(error)}\uFF1B\u4E34\u65F6\u6587\u4EF6\u6E05\u7406\u5931\u8D25\uFF1A${errorMessage4(cleanupError)}`);
      }
    }
    throw error;
  }
}
function notRequestedSessionActivation() {
  return { requested: false, active: false, status: "not_requested", exit_code: null };
}
async function activateChangeSession(input) {
  if (!input.available) {
    return { requested: true, active: false, status: "unavailable", exit_code: null };
  }
  let result;
  try {
    result = await input.runner(input.repoRoot, ["session", "activate", input.changeName]);
  } catch {
    return { requested: true, active: false, status: "failed", exit_code: null };
  }
  if (result.exitCode !== 0) {
    return { requested: true, active: false, status: "failed", exit_code: result.exitCode };
  }
  const pointer = join43(input.repoRoot, ".pipeline-active");
  try {
    const pointerStat = await lstat15(pointer);
    if (!pointerStat.isFile() || pointerStat.isSymbolicLink()) {
      return { requested: true, active: false, status: "degraded", exit_code: result.exitCode };
    }
    const activeName = (await readFile22(pointer, "utf8")).trim();
    return activeName === input.changeName ? { requested: true, active: true, status: "active", exit_code: result.exitCode } : { requested: true, active: false, status: "degraded", exit_code: result.exitCode };
  } catch {
    return { requested: true, active: false, status: "degraded", exit_code: result.exitCode };
  }
}

// packages/server/src/serverPostChangesRoutes.ts
async function handlePostChangesRoutes(req, res, path7, deps) {
  const {
    sendJson,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi,
    trackRegistryBody,
    sendTrackError,
    errMsg: errMsg2
  } = deps;
  const REAL_GRADUATION_FS2 = deps.realGraduationFs;
  function isWorkflowName4(name) {
    return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
  }
  if (path7 === "/api/projects") {
    const body = await readJsonBody(req);
    const rawRoot = typeof body === "object" && body !== null ? body.root : void 0;
    let pendingAnchor;
    if (typeof rawRoot === "string" && rawRoot) {
      try {
        pendingAnchor = captureWorkflowRootAnchor(rawRoot);
      } catch (e) {
        try {
          if (lstatSync6(resolvePath8(rawRoot)).isSymbolicLink()) {
            return sendJson(res, 400, { ok: false, error: `registered root \u4E0D\u5F97\u662F symlink\uFF1A${resolvePath8(rawRoot)}` });
          }
        } catch {
        }
      }
    }
    const result = await addProjectToRegistry(paths.registryPath, rawRoot);
    if (!result.ok) {
      if (pendingAnchor) closeWorkflowRootAnchor(pendingAnchor);
      return sendJson(res, result.code, { ok: false, error: result.error });
    }
    if (!pendingAnchor || pendingAnchor.path !== result.root) {
      if (pendingAnchor) closeWorkflowRootAnchor(pendingAnchor);
      await removeProjectFromRegistry(paths.registryPath, result.root).catch(() => void 0);
      return sendJson(res, 400, { ok: false, error: "registered root \u5728\u6CE8\u518C\u671F\u95F4\u672A\u80FD\u5EFA\u7ACB\u7A33\u5B9A inode \u951A" });
    }
    try {
      assertWorkflowRootAnchor(pendingAnchor);
    } catch (e) {
      closeWorkflowRootAnchor(pendingAnchor);
      await removeProjectFromRegistry(paths.registryPath, result.root).catch(() => void 0);
      return sendJson(res, 400, { ok: false, error: errMsg2(e) });
    }
    const previous = workflowRootAnchors.get(result.root);
    if (previous) closeWorkflowRootAnchor(previous);
    workflowRootAnchors.set(result.root, pendingAnchor);
    return sendJson(res, 200, { ok: true, root: result.root });
  }
  if (path7 === "/api/changes") {
    const rawBody = await readJsonBody(req);
    if (typeof rawBody !== "object" || rawBody === null) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const b = rawBody;
    const root = typeof b.root === "string" ? b.root : "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    const name = typeof b.name === "string" ? b.name : "";
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const taskPrompt = parseChangeTaskPrompt(b.task_prompt);
    if (!taskPrompt.ok) return sendJson(res, 400, { ok: false, error: taskPrompt.error });
    const activation = parseChangeSessionActivation(b.activate_session, taskPrompt.value !== null);
    if (!activation.ok) return sendJson(res, 400, { ok: false, error: activation.error });
    const trackId = typeof b.track === "string" && b.track ? b.track : "chat";
    const workflowRaw = typeof b.workflow === "string" && b.workflow ? b.workflow : "";
    try {
      ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    let outcome;
    try {
      outcome = await withTrackRegistryLock(
        rootCheck.anchor.path,
        trackValidationContextFor(rootCheck.anchor),
        async ({ registry }) => {
          assertWorkflowRootAnchor(rootCheck.anchor);
          let track;
          let workflowId;
          try {
            track = requireTrack(registry, trackId);
            workflowId = workflowRaw || track.workflow.default;
            assertWorkflowAllowed(track, workflowId);
          } catch (e) {
            return { ok: false, code: 400, error: errMsg2(e) };
          }
          let initialWorkflow;
          let plan;
          try {
            plan = loadEffectiveWorkflowPlan(rootCheck.anchor.path, workflowId, track);
          } catch (e) {
            return { ok: false, code: 404, error: errMsg2(e) };
          }
          if (plan.capabilities.execution.model === "step-graph") {
            let workflow;
            try {
              workflow = builtinWorkflow(workflowId) ?? readWorkflowForApi(rootCheck.anchor, workflowId);
            } catch (e) {
              return e instanceof WorkflowNotFoundError ? { ok: false, code: 404, error: `workflow '${workflowId}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${workflowId}.yaml\uFF09` } : { ok: false, code: 400, error: errMsg2(e) };
            }
            const referenceErrors = validateWorkflowTrackReferences(workflow, registry);
            if (referenceErrors.length > 0) {
              return { ok: false, code: 400, error: referenceErrors.join("\uFF1B") };
            }
          }
          const first = plan.workflow.steps[0];
          if (first === void 0) {
            return { ok: false, code: 400, error: `workflow '${workflowId}' \u672A\u58F0\u660E\u4EFB\u4F55 step` };
          }
          initialWorkflow = {
            workflow: workflowId,
            phase: first.id,
            ...effectiveWorkflowPlanBinding(plan),
            workflowPlanSnapshot: workflowPlanSnapshot(plan),
            ...plan.capabilities.documents.policy?.id === "openspec-v1" ? { openspecContract: true } : {},
            ...plan.capabilities.documents.policy?.id === "document-v1" ? { documentContract: true } : {}
          };
          try {
            const initResult = await runRepo.initChange({
              repoRoot: root,
              name,
              track: track.id,
              reviewSeed: track.policyProfile.reviewSeed,
              preset: "full",
              clock,
              initialWorkflow
            });
            if (taskPrompt.value !== null) {
              try {
                await writeChangeTaskPrompt(initResult.changeDir, taskPrompt.value);
              } catch (error) {
                return {
                  ok: false,
                  code: 500,
                  error: `Change \u5DF2\u521B\u5EFA\uFF0C\u4F46\u4EFB\u52A1\u63D0\u793A\u8BCD\u672A\u4FDD\u5B58\uFF1A${errMsg2(error)}`
                };
              }
            }
            return { ok: true, created: initResult.changeDir, taskPromptSaved: taskPrompt.value !== null };
          } catch (e) {
            return { ok: false, code: 400, error: errMsg2(e) };
          }
        }
      );
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: errMsg2(e) });
    }
    if (!outcome.ok) return sendJson(res, outcome.code, { ok: false, error: outcome.error });
    const created = outcome.created;
    try {
      await history.append(created, { ts: clock(), kind: "init" });
    } catch (e) {
      process.stderr.write(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg2(e)}
`);
    }
    const session = activation.value ? await activateChangeSession({
      available: operationsAvailable,
      runner: operationRunner,
      repoRoot: rootCheck.anchor.path,
      changeName: name
    }) : notRequestedSessionActivation();
    return sendJson(res, 200, {
      ok: true,
      name,
      path: created,
      task_prompt_saved: outcome.taskPromptSaved,
      session
    });
  }
}

// packages/server/src/serverPostExecutionRoutes.ts
import { join as join45 } from "node:path";
async function handlePostExecutionRoutes(req, res, path7, deps) {
  const {
    sendJson,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi,
    trackRegistryBody,
    sendTrackError,
    errMsg: errMsg2
  } = deps;
  const REAL_GRADUATION_FS2 = deps.realGraduationFs;
  function isWorkflowName4(name2) {
    return name2 !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name2);
  }
  const cancelMatch = /^\/api\/afk\/([^/]+)\/cancel$/.exec(path7);
  if (cancelMatch) {
    const segment2 = cancelMatch[1];
    if (segment2 === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name2 = decodeURIComponent(segment2);
    if (!name2 || !/^[a-zA-Z0-9_-]+$/.test(name2) || name2.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const body2 = await readJsonBody(req);
    const root2 = typeof body2 === "object" && body2 !== null ? body2.root : void 0;
    if (typeof root2 !== "string" || !root2) {
      return sendJson(res, 400, { ok: false, error: "root \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" });
    }
    if (!isRegisteredRoot(root2)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join45(root2, "openspec", "changes", name2);
    const result = await cancelAfkRun(store, dir);
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  const retryMatch = /^\/api\/afk\/([^/]+)\/retry$/.exec(path7);
  if (retryMatch) {
    const segment2 = retryMatch[1];
    if (segment2 === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name2 = decodeURIComponent(segment2);
    if (!name2 || !/^[a-zA-Z0-9_-]+$/.test(name2) || name2.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const body2 = await readJsonBody(req);
    const root2 = typeof body2 === "object" && body2 !== null ? body2.root : void 0;
    if (typeof root2 !== "string" || !root2) {
      return sendJson(res, 400, { ok: false, error: "root \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" });
    }
    if (!isRegisteredRoot(root2)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join45(root2, "openspec", "changes", name2);
    const result = await retryAfkRun(store, dir);
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  const dismissMatch = /^\/api\/afk\/([^/]+)\/dismiss$/.exec(path7);
  if (dismissMatch) {
    const segment2 = dismissMatch[1];
    if (segment2 === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name2 = decodeURIComponent(segment2);
    if (!name2 || !/^[a-zA-Z0-9_-]+$/.test(name2) || name2.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const body2 = await readJsonBody(req);
    const root2 = typeof body2 === "object" && body2 !== null ? body2.root : void 0;
    if (typeof root2 !== "string" || !root2) {
      return sendJson(res, 400, { ok: false, error: "root \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" });
    }
    if (!isRegisteredRoot(root2)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join45(root2, "openspec", "changes", name2);
    const result = await dismissAfkRun(store, dir);
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  const enqueueMatch = /^\/api\/afk\/([^/]+)\/enqueue$/.exec(path7);
  if (enqueueMatch) {
    const segment2 = enqueueMatch[1];
    if (segment2 === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name2 = decodeURIComponent(segment2);
    if (!name2 || !/^[a-zA-Z0-9_-]+$/.test(name2) || name2.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const body2 = await readJsonBody(req);
    const root2 = typeof body2 === "object" && body2 !== null ? body2.root : void 0;
    if (typeof root2 !== "string" || !root2) {
      return sendJson(res, 400, { ok: false, error: "root \u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" });
    }
    if (!isRegisteredRoot(root2)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join45(root2, "openspec", "changes", name2);
    if (!stateStorageExistsSync(dir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    let track;
    try {
      const rawTrack = await store.get(dir, "track");
      const trackId = Array.isArray(rawTrack) ? rawTrack.join(",") : rawTrack ?? "";
      const trackCtx = {
        workflowExists: (id) => {
          if (id === "default") return true;
          try {
            return loadWorkflow(root2, id) !== null;
          } catch {
            return false;
          }
        },
        skillProfiles: trackSkillProfiles
      };
      track = requireTrack(loadTrackRegistry(root2, trackCtx), trackId);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: errMsg2(e) });
    }
    const result = await enqueueAfkRun(store, dir, clock, {
      automationEligible: track.policyProfile.automationEligible,
      trackLabel: track.label
    });
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  if (path7 === "/api/secrets") {
    const rawBody = await readJsonBody(req);
    const validated = validateSecretWriteBody(rawBody);
    if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error });
    try {
      const info = await writeSecret(paths.secretsPath, validated.value.key, validated.value.value);
      return sendJson(res, 200, { ok: true, key: validated.value.key, ...info });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
  }
  if (path7 === "/api/tracks") {
    const rawBody = await readJsonBody(req);
    if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const trackBody = rawBody;
    const root2 = typeof trackBody.root === "string" ? trackBody.root : "";
    const revision = typeof trackBody.revision === "string" ? trackBody.revision : "";
    const track = trackBody.track;
    if (revision === "" || typeof track !== "object" || track === null || Array.isArray(track)) {
      return sendJson(res, 400, { ok: false, error: "revision \u4E0E track \u5BF9\u8C61\u4E3A\u5FC5\u586B" });
    }
    const rootCheck = workflowRootForRequest(root2);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      const mutation = await mutateTrackForApi(rootCheck.anchor, revision, async ({ config }) => ({
        next: createTrack(config, track),
        result: void 0
      }));
      return sendJson(res, 200, trackRegistryBody(mutation.registry));
    } catch (error) {
      return sendTrackError(res, error);
    }
  }
  const mTr = /^\/api\/change\/([^/]+)\/transition$/.exec(path7);
  if (!mTr) return sendJson(res, 404, { ok: false, error: "\u672A\u77E5\u5199\u56DE\u7AEF\u70B9" });
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null) {
    return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
  }
  const b = body;
  const root = b.root;
  const event = b.event;
  if (typeof root !== "string" || typeof event !== "string") {
    return sendJson(res, 400, { ok: false, error: "root / event \u987B\u4E3A\u5B57\u7B26\u4E32" });
  }
  if (!isRegisteredRoot(root)) {
    return sendJson(res, 404, { ok: false, error: "root \u975E\u5DF2\u77E5 Project\uFF08\u672A\u6CE8\u518C\u6216\u4E0D\u53EF\u4FE1\uFF09" });
  }
  const segment = mTr[1];
  if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
  const name = decodeURIComponent(segment);
  const loadEffectiveTrackRegistry = () => loadTrackRegistry(root, {
    workflowExists: (workflowId) => {
      if (workflowId === "default") return true;
      try {
        return loadWorkflow(root, workflowId) !== null;
      } catch {
        return false;
      }
    },
    skillProfiles: trackSkillProfiles
  });
  const outcome = await performTransition(
    {
      store,
      runRepo,
      flow,
      clock,
      fileExists,
      gitHeadSha: gitHeadSha2,
      workspaceFingerprint,
      history,
      breadcrumb,
      // 这里用的正是 Dashboard 当前 root 的 effective Track Registry，而不是靠 track id
      // 写死 PM。自定义 track 也可通过 auto_enqueue_on_spec_complete 显式接入同一条后置编排。
      resolveTrackPolicy: (trackId) => requireTrack(loadEffectiveTrackRegistry(), trackId).policyProfile,
      resolveTrack: (trackId) => requireTrack(loadEffectiveTrackRegistry(), trackId),
      skillResolver: loadedManifest ? createEffectiveSkillResolver({
        registry: loadEffectiveTrackRegistry,
        manifest: loadedManifest
      }) : void 0
    },
    root,
    name,
    event
  );
  return sendJson(res, outcome.code, outcome.body);
}

// packages/server/src/serverPostGovernanceRoutes.ts
async function handlePostGovernanceRoutes(req, res, path7, deps) {
  const {
    sendJson,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi,
    trackRegistryBody,
    sendTrackError,
    errMsg: errMsg2
  } = deps;
  const REAL_GRADUATION_FS2 = deps.realGraduationFs;
  function isWorkflowName4(name) {
    return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
  }
  if (path7 === "/api/config/mandatory-skills") {
    if (!manifestPath2) return sendJson(res, 404, { ok: false, error: "config \u6570\u636E\u7AEF\u672A\u88C5\uFF08capabilities.config=false\uFF09" });
    const body = await readJsonBody(req);
    const validated = validateMandatorySkillsBody(body);
    if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error });
    const { phase, track, skills } = validated.value;
    try {
      await writeMandatorySkills(manifestPath2, phase, track, skills);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    return sendJson(res, 200, { ok: true, phase, track, skills });
  }
  if (path7 === "/api/loops/level") {
    const body = await readJsonBody(req);
    const root = typeof body === "object" && body !== null ? body.root : void 0;
    const id = typeof body === "object" && body !== null ? body.id : void 0;
    const target = typeof body === "object" && body !== null ? body.target : void 0;
    if (typeof root !== "string" || typeof id !== "string" || typeof target !== "string" || !root || !id || !target) {
      return sendJson(res, 400, { ok: false, error: "root/id/target \u5FC5\u586B" });
    }
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const result = await applyLevelChange(root, id, target, { now: new Date(clock()), confirm: true }, REAL_GRADUATION_FS2);
    return sendJson(res, result.exitCode === 0 ? 200 : 400, result);
  }
  if (path7 === "/api/loops/update") {
    const rawBody = await readJsonBody(req);
    if (typeof rawBody !== "object" || rawBody === null) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const b = rawBody;
    const root = typeof b.root === "string" ? b.root : "";
    const id = typeof b.id === "string" ? b.id : "";
    if (!root || !id) {
      return sendJson(res, 400, { ok: false, error: "root/id \u5FC5\u586B" });
    }
    const patch = b.patch;
    if (typeof patch !== "object" || patch === null || Array.isArray(patch) || Object.keys(patch).length === 0) {
      return sendJson(res, 400, { ok: false, error: "patch \u987B\u4E3A\u975E\u7A7A JSON \u5BF9\u8C61\uFF08\u5B57\u6BB5\u540D \u2192 \u65B0\u503C\uFF09" });
    }
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const result = await applyLoopsUpdate(root, id, patch, {
      validateActivation: validateLoopActivation
    });
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  if (path7 === "/api/hooks") {
    const rawBody = await readJsonBody(req);
    const validated = validateHookToggleBody(rawBody);
    if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error });
    const root = typeof rawBody.root === "string" ? rawBody.root : "";
    if (!root) {
      return sendJson(res, 400, { ok: false, error: "root \u5FC5\u586B" });
    }
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    try {
      writeHookToggle(root, validated.value);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    return sendJson(res, 200, { ok: true, ...validated.value });
  }
  if (path7 === "/api/automation") {
    const rawBody = await readJsonBody(req);
    const validated = validateAutomationSettingsBody(rawBody);
    if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error });
    const root = typeof rawBody.root === "string" ? rawBody.root : "";
    if (!root) {
      return sendJson(res, 400, { ok: false, error: "root \u5FC5\u586B" });
    }
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    try {
      writeAutomationSettings(root, validated.value);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    return sendJson(res, 200, { ok: true, settings: validated.value });
  }
  const mWfPost = /^\/api\/workflows\/([^/]+)$/.exec(path7);
  if (mWfPost) {
    const segment = mWfPost[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u8DEF\u5F84" });
    const wfName = decodeURIComponent(segment);
    if (!isWorkflowName4(wfName)) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 workflow \u540D\uFF08\u5141\u8BB8\u4E2D\u6587\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001- \u4E0E _\uFF1B\u4E0D\u5141\u8BB8\u7A7A\u683C\u3001\u70B9\u6216\u8DEF\u5F84\u7B26\u53F7\uFF09" });
    }
    if (wfName === "default") {
      return sendJson(res, 400, { ok: false, error: "default workflow \u4E0D\u53EF\u901A\u8FC7\u7F16\u8F91\u5668\u521B\u5EFA/\u8986\u76D6\uFF08\u8FD0\u884C\u65F6\u4E0D\u8BFB\u8FD9\u4E2A\u6587\u4EF6\uFF09" });
    }
    const rawBody = await readJsonBody(req);
    if (typeof rawBody !== "object" || rawBody === null) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = rawBody;
    if (body.name !== wfName) {
      return sendJson(res, 400, { ok: false, error: "URL workflow name \u5FC5\u987B\u4E0E body.name \u5B8C\u5168\u4E00\u81F4" });
    }
    const root = typeof body.root === "string" ? body.root : "";
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    let workflow;
    try {
      const workflowInput = Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== "root")
      );
      workflow = decodeWorkflowDef(workflowInput);
    } catch (error) {
      return sendJson(res, 400, { ok: false, errors: [errMsg2(error)] });
    }
    const shapeErrors = validateWorkflow(workflow);
    if (shapeErrors.length > 0) return sendJson(res, 400, { ok: false, errors: shapeErrors });
    try {
      ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errMsg2(e) });
    }
    let enteredRegistrySnapshot = false;
    try {
      const result = await withTrackRegistryLock(
        rootCheck.anchor.path,
        trackValidationContextFor(rootCheck.anchor),
        async ({ registry }) => {
          enteredRegistrySnapshot = true;
          assertWorkflowRootAnchor(rootCheck.anchor);
          const referenceErrors = validateWorkflowTrackReferences(workflow, registry);
          if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };
          return writeWorkflowForApi(rootCheck.anchor, wfName, workflow);
        }
      );
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return enteredRegistrySnapshot ? sendJson(res, 500, { ok: false, error: errMsg2(e) }) : sendJson(res, 400, { ok: false, errors: [errMsg2(e)] });
    }
  }
}

// packages/server/src/serverPostOperationsRoutes.ts
import { lstatSync as lstatSync7 } from "node:fs";
import { join as join46 } from "node:path";
async function handlePostOperationsRoutes(req, res, path7, deps) {
  const {
    sendJson,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi,
    trackRegistryBody,
    sendTrackError,
    errMsg: errMsg2
  } = deps;
  const REAL_GRADUATION_FS2 = deps.realGraduationFs;
  function isWorkflowName4(name) {
    return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
  }
  if (path7 === "/api/router/preview") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (prompt.trim() === "") return sendJson(res, 400, { ok: false, error: "prompt \u4E0D\u5F97\u4E3A\u7A7A" });
    const rootCheck = workflowRootForRequest(root);
    if (!rootCheck.ok) return sendJson(res, rootCheck.code, { ok: false, error: rootCheck.error });
    try {
      assertWorkflowRootAnchor(rootCheck.anchor);
      let pipelineExists = true;
      try {
        lstatSync7(join46(rootCheck.anchor.path, ".pipeline"));
      } catch (error) {
        if (error.code === "ENOENT") pipelineExists = false;
        else throw error;
      }
      if (pipelineExists) ensureWorkflowProjectCoordinationPath(rootCheck.anchor);
      const registry = loadTrackRegistry(rootCheck.anchor.path, trackValidationContextFor(rootCheck.anchor));
      const draft = body.draft_track === void 0 ? null : parseRouterDraft(body.draft_track);
      const candidates = draft === null ? registry.ordered : applyRouterDraft(registry.ordered, draft);
      const preview = await previewTrackRouting(prompt, candidates, routerPatternScorer);
      assertWorkflowRootAnchor(rootCheck.anchor);
      return sendJson(res, 200, { ok: true, revision: registry.revision, source: registry.source, ...preview });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: errMsg2(error) });
    }
  }
  if (path7 === "/api/operations/loops/init") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const template = typeof body.template === "string" ? body.template : "";
    const workflow = typeof body.workflow === "string" && body.workflow.trim() !== "" ? body.workflow.trim() : "default";
    const runner = typeof body.runner === "string" && body.runner.trim() !== "" ? body.runner.trim() : "codex";
    const skillBundle = typeof body.skill_bundle === "string" ? body.skill_bundle.trim() : "";
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
      return sendJson(res, 400, { ok: false, error: "id \u987B\u4E3A 2-64 \u4F4D kebab-case" });
    }
    if (!listAutomationPolicyTemplates().some((item2) => item2.id === template)) {
      return sendJson(res, 400, { ok: false, error: "template \u4E0D\u5728\u7248\u672C\u5316 starter \u76EE\u5F55\u4E2D" });
    }
    if (runner !== "codex" && runner !== "claude-code") {
      return sendJson(res, 400, { ok: false, error: "runner \u4EC5\u5141\u8BB8 codex \u6216 claude-code" });
    }
    const args = [
      "loops",
      "init",
      "--id",
      id,
      "--template",
      template,
      "--workflow",
      workflow,
      ...skillBundle === "" ? [] : ["--skill-bundle", skillBundle],
      "--runner",
      runner,
      ...goal === "" ? [] : ["--goal", goal],
      "--yes",
      "--json"
    ];
    return executeOperation(res, root, args);
  }
  if (path7 === "/api/operations/loops/run") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const selector = typeof body.selector === "string" ? body.selector.trim() : "";
    const level = typeof body.level === "string" ? body.level : "L1";
    const dryRun = body.dry_run !== false;
    const commit = body.commit === true;
    if (selector === "" || !["L1", "L2", "L3"].includes(level)) {
      return sendJson(res, 400, { ok: false, error: "selector \u5FC5\u586B\uFF0Clevel \u4EC5\u5141\u8BB8 L1/L2/L3" });
    }
    if (!dryRun && body.confirm_run !== true) {
      return sendJson(res, 400, { ok: false, error: "\u771F\u5B9E\u8FD0\u884C\u987B\u663E\u5F0F confirm_run=true" });
    }
    if (!dryRun && level === "L3" && body.confirm_l3 !== true) {
      return sendJson(res, 400, { ok: false, error: "L3 \u81EA\u52A8\u5408\u5E76\u987B\u989D\u5916 confirm_l3=true" });
    }
    const args = [
      "loops",
      "run",
      selector,
      ...dryRun ? ["--dry-run"] : [],
      "--level",
      level,
      ...!dryRun && commit ? ["--commit"] : [],
      "--json"
    ];
    return executeOperation(res, root, args);
  }
  if (path7 === "/api/operations/loops/sync") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const loopId = typeof body.loop_id === "string" ? body.loop_id.trim() : "";
    const mode = body.mode === "apply" ? "apply" : body.mode === "dry-run" ? "dry-run" : "";
    if (loopId === "" || mode === "") {
      return sendJson(res, 400, { ok: false, error: "loop_id \u5FC5\u586B\uFF0Cmode \u4EC5\u5141\u8BB8 dry-run/apply" });
    }
    if (mode === "apply" && body.confirm_apply !== true) {
      return sendJson(res, 400, { ok: false, error: "sync apply \u987B\u663E\u5F0F confirm_apply=true" });
    }
    const registrySha = typeof body.expected_registry_sha === "string" ? body.expected_registry_sha.trim() : "";
    const workflowSha = typeof body.expected_workflow_sha === "string" ? body.expected_workflow_sha.trim() : "";
    const args = [
      "loops",
      "sync",
      loopId,
      mode === "apply" ? "--apply" : "--dry-run",
      ...registrySha === "" ? [] : ["--expected-registry-sha", registrySha],
      ...workflowSha === "" ? [] : ["--expected-workflow-sha", workflowSha],
      "--json"
    ];
    return executeOperation(res, root, args);
  }
  if (path7 === "/api/operations/triage") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const source = body.source === "git-commits" || body.source === "loop-run-terminals" ? body.source : "";
    if (source === "") return sendJson(res, 400, { ok: false, error: "source \u4EC5\u5141\u8BB8 git-commits/loop-run-terminals" });
    if (body.confirm_apply !== true) {
      return sendJson(res, 400, { ok: false, error: "triage \u4F1A\u521B\u5EFA WorkflowRun \u5E76\u63D0\u4EA4 checkpoint\uFF0C\u987B\u663E\u5F0F confirm_apply=true" });
    }
    const positiveInt = (value, fallback) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const args = [
      "triage",
      source,
      "--provider",
      "codex",
      ...model === "" ? [] : ["--model", model],
      "--page-size",
      String(positiveInt(body.page_size, 20)),
      "--max-pages",
      String(positiveInt(body.max_pages, 4)),
      "--max-high-candidates",
      String(positiveInt(body.max_high_candidates, 10)),
      "--json"
    ];
    return executeOperation(res, root, args);
  }
  if (path7 === "/api/operations/artifact/register") {
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    const change = typeof body.change === "string" ? body.change.trim() : "";
    const field = typeof body.field === "string" ? body.field.trim() : "";
    const artifactPath = typeof body.path === "string" ? body.path : "";
    const producer = typeof body.producer === "string" ? body.producer.trim() : "";
    if (!/^[a-zA-Z0-9_-]+$/.test(change) || field === "" || artifactPath === "" || producer === "") {
      return sendJson(res, 400, { ok: false, error: "change/field/path/producer \u5747\u4E3A\u5FC5\u586B\u4E14 change \u540D\u987B\u5408\u6CD5" });
    }
    return executeOperation(res, root, [
      "artifact",
      "register",
      change,
      field,
      artifactPath,
      "--producer",
      producer
    ]);
  }
  const projectionMatch = /^\/api\/change\/([^/]+)\/projection$/.exec(path7);
  if (projectionMatch) {
    const segment = projectionMatch[1];
    if (segment === void 0) return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u8DEF\u5F84" });
    const name = decodeURIComponent(segment);
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes("..")) {
      return sendJson(res, 400, { ok: false, error: "\u975E\u6CD5 change \u540D\uFF08\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _\uFF09" });
    }
    const raw = await readJsonBody(req);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return sendJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u987B\u4E3A JSON \u5BF9\u8C61" });
    }
    const body = raw;
    const root = typeof body.root === "string" ? body.root : "";
    if (!isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    const dir = join46(root, "openspec", "changes", name);
    if (!stateStorageExistsSync(dir)) {
      return sendJson(res, 400, { ok: false, error: "\u627E\u4E0D\u5230\u8BE5 change\uFF08\u65E0 canonical/legacy \u72B6\u6001\uFF09" });
    }
    try {
      if (body.action === "repair-projection") {
        const projection = await store.repairProjection(dir, { forceCanonical: body.force_canonical === true });
        return sendJson(res, 200, { ok: true, action: body.action, projection });
      }
      if (body.action === "import-legacy") {
        if (body.confirm_import !== true) {
          return sendJson(res, 400, { ok: false, error: "import-legacy \u987B\u663E\u5F0F confirm_import=true" });
        }
        const imported = await store.importLegacyProjection(dir);
        return sendJson(res, 200, { ok: true, action: body.action, projection: imported.projection });
      }
      return sendJson(res, 400, { ok: false, error: "action \u4EC5\u5141\u8BB8 repair-projection/import-legacy" });
    } catch (error) {
      return sendJson(res, 409, { ok: false, error: errMsg2(error) });
    }
  }
}

// packages/server/src/serverPostMemoryRoutes.ts
import { join as join47 } from "node:path";
var RELATED_SEARCH_PATH = "/api/mem/related-sessions/search";
var PLATFORM_VALUES = /* @__PURE__ */ new Set(["all", "claude", "codex", "opencode", "pi"]);
var CHANGE_NAME_RE3 = /^[a-zA-Z0-9_-]+$/;
function invalidRequest(deps, res) {
  deps.sendJson(res, 400, {
    ok: false,
    code: "invalid-request",
    error: "Related session search request is invalid"
  });
}
function missingTarget(deps, res) {
  deps.sendJson(res, 404, {
    ok: false,
    code: "project-or-change-not-found",
    error: "Project or Change is unavailable"
  });
}
async function handlePostMemoryRoutes(req, res, path7, deps) {
  if (path7 !== RELATED_SEARCH_PATH) return;
  const raw = await deps.readJsonBody(req);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return invalidRequest(deps, res);
  }
  const body = raw;
  const root = typeof body.root === "string" ? body.root : "";
  const name = typeof body.name === "string" ? body.name : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const platform = body.platform;
  const queryLength = [...query].length;
  const tokenCount = query === "" ? 0 : query.split(/\s+/u).length;
  if (root === "" || !CHANGE_NAME_RE3.test(name) || name.includes("..") || queryLength < 2 || queryLength > 128 || tokenCount > 8 || typeof platform !== "string" || !PLATFORM_VALUES.has(platform)) {
    return invalidRequest(deps, res);
  }
  const rootCheck = deps.workflowRootForRequest(root);
  if (!rootCheck.ok) return missingTarget(deps, res);
  const anchoredRoot = rootCheck.anchor.path;
  if (!stateStorageExistsSync(join47(anchoredRoot, "openspec", "changes", name))) {
    return missingTarget(deps, res);
  }
  const result = await deps.relatedSessionSearch({
    root: anchoredRoot,
    query,
    platform
  });
  if (!result.ok) {
    if (result.reason === "busy") {
      return deps.sendJson(res, 429, {
        ok: false,
        code: "memory-search-busy",
        error: "Related session search is already running"
      });
    }
    return deps.sendJson(res, 500, {
      ok: false,
      code: "memory-search-unavailable",
      error: "Related session search is unavailable"
    });
  }
  return deps.sendJson(res, 200, result.response);
}

// packages/server/src/serverPostRoutes.ts
async function handlePostRoute(req, res, path7, deps) {
  const {
    isLocalHost: isLocalHost2,
    sendJson,
    token,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi,
    trackRegistryBody,
    sendTrackError,
    errMsg: errMsg2
  } = deps;
  const boundPort = deps.boundPort();
  const REAL_GRADUATION_FS2 = deps.realGraduationFs;
  function isWorkflowName4(name) {
    return name !== "" && /^[\p{L}\p{N}\p{M}_-]+$/u.test(name);
  }
  if (!isLocalHost2(req.headers.host, boundPort)) {
    return sendJson(res, 403, { ok: false, error: "Host header \u4E0D\u5408\u6CD5\uFF08\u7591\u4F3C DNS \u91CD\u7ED1\u5B9A\u653B\u51FB\uFF09" });
  }
  const provided = tokenFromHeaders(req.headers);
  if (!provided || !tokensMatch(provided, token)) {
    return sendJson(res, 401, { ok: false, error: "\u7F3A\u5C11\u6216\u65E0\u6548 token\uFF08\u5199\u7AEF\u70B9\u9700\u9274\u6743\uFF09" });
  }
  const ctype = (String(req.headers["content-type"] ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
  if (ctype !== "application/json") {
    return sendJson(res, 400, { ok: false, error: "\u5199\u56DE\u7AEF\u70B9\u8981\u6C42 Content-Type: application/json" });
  }
  await handlePostOperationsRoutes(req, res, path7, deps);
  if (res.writableEnded) return;
  await handlePostChangesRoutes(req, res, path7, deps);
  if (res.writableEnded) return;
  await handlePostGovernanceRoutes(req, res, path7, deps);
  if (res.writableEnded) return;
  await handlePostMemoryRoutes(req, res, path7, deps);
  if (res.writableEnded) return;
  await handlePostExecutionRoutes(req, res, path7, deps);
  if (res.writableEnded) return;
  return sendJson(res, 404, { ok: false, error: "\u672A\u77E5\u7AEF\u70B9" });
}

// packages/server/src/serverSupport.ts
import { readFileSync as readFileSync22 } from "node:fs";
import { dirname as dirname10, join as join48 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var REAL_GRADUATION_FS = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => {
    try {
      return readFileSync22(join48(repoRoot, ".superpowers", "loops", "progress.md"), "utf8");
    } catch {
      return null;
    }
  },
  readLoopDoc: (repoRoot) => {
    try {
      return readFileSync22(join48(repoRoot, "LOOP.md"), "utf8");
    } catch {
      return null;
    }
  },
  readRegistrySnapshot: async (repoRoot) => {
    const snapshot = await readRegistrySnapshot(repoRoot);
    return snapshot.epoch === ABSENT_REGISTRY_EPOCH ? null : { text: snapshot.text, epoch: snapshot.epoch };
  },
  writeRegistryGoverned: async (repoRoot, expectedEpoch, produce) => {
    const result = await writeRegistryWithGovernance(repoRoot, expectedEpoch, (current) => produce(current));
    return { ok: result.ok, error: result.ok ? null : result.error };
  }
};
function repoRootForSkills2() {
  return join48(dirname10(fileURLToPath3(import.meta.url)), "..", "..", "..");
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function errMsg(error) {
  return error instanceof Error ? error.message : String(error);
}
function assertDashboardTransactionId(value) {
  if (value !== void 0 && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("Dashboard managed transaction identity \u683C\u5F0F\u975E\u6CD5");
  }
}
function shQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function isLocalHost(host, port) {
  if (!host) return false;
  const normalized2 = host.trim().toLowerCase();
  return (/* @__PURE__ */ new Set([
    "127.0.0.1",
    "localhost",
    "[::1]",
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`
  ])).has(normalized2);
}
function indexHtml(token) {
  const jsToken = JSON.stringify(token).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><title>Tenon Dashboard</title>
<h1>Pipeline Global Dashboard</h1>
<p>TS \u5168\u5C40 server \u5DF2\u5C31\u7EEA\u3002\u53EA\u8BFB\u6570\u636E\u89C1 <code>/api/snapshot</code> / <code>/api/stream</code>\uFF1B\u5065\u5EB7\u63A2\u9488 <code>/api/health</code>\u3002</p>
<p>\u5199\u7AEF\u70B9\u9700\u5E26\u4E00\u6B21\u6027 token\uFF08B5\uFF09\u3002\u524D\u7AEF\u4FE1\u606F\u67B6\u6784\u91CD\u6784\uFF1ABACKLOG #26\u3002</p>
<script>window.__TENON_DASHBOARD_TOKEN__ = ${jsToken};</script>`;
}

// packages/server/src/serverTransport.ts
import { readFileSync as readFileSync23 } from "node:fs";
import { join as join49 } from "node:path";
var MAX_POST_BODY = 64 * 1024;
function createServerTransport(options) {
  const { registry, snapshotDeps, heartbeatMs, pollIntervalMs, token } = options;
  const clients = /* @__PURE__ */ new Set();
  let lastFp = "";
  let lastBeat = Date.now();
  let pollTimer = null;
  function broadcast(event, data) {
    lastBeat = Date.now();
    const frame = `event: ${event}
data: ${data}

`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
      }
    }
  }
  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
  async function pollTick() {
    if (clients.size === 0) {
      stopPoll();
      return;
    }
    let fp;
    const nowMs = Date.now();
    try {
      fp = await computeFingerprint(registry(), nowMs);
    } catch {
      return;
    }
    if (fp !== lastFp) {
      lastFp = fp;
      try {
        broadcast("snapshot", JSON.stringify(await buildSnapshot(snapshotDeps(nowMs))));
      } catch {
      }
    } else if (Date.now() - lastBeat > heartbeatMs) {
      lastBeat = Date.now();
      for (const res of clients) {
        try {
          res.write(": ping\n\n");
        } catch {
        }
      }
    }
  }
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      void pollTick();
    }, pollIntervalMs);
    pollTimer.unref?.();
  }
  function sendJson(res, code, obj) {
    const body = Buffer.from(JSON.stringify(obj), "utf8");
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    res.end(body);
  }
  function sendHtml(res, code, html) {
    const body = Buffer.from(html, "utf8");
    res.writeHead(code, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    res.end(body);
  }
  function readJsonBody(req) {
    return new Promise((resolve13) => {
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          resolve13(v);
        }
      };
      const len = Number.parseInt(String(req.headers["content-length"] ?? ""), 10);
      if (Number.isFinite(len) && len > MAX_POST_BODY) return finish(void 0);
      let data = "";
      let size = 0;
      req.setEncoding("utf8");
      req.on("data", (c) => {
        size += Buffer.byteLength(c);
        if (size > MAX_POST_BODY) {
          finish(void 0);
          req.destroy();
          return;
        }
        data += c;
      });
      req.on("end", () => {
        try {
          finish(JSON.parse(data));
        } catch {
          finish(void 0);
        }
      });
      req.on("error", () => finish(void 0));
    });
  }
  async function handleStream(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    clients.add(res);
    try {
      const nowMs = Date.now();
      lastFp = await computeFingerprint(registry(), nowMs);
      res.write(`event: snapshot
data: ${JSON.stringify(await buildSnapshot(snapshotDeps(nowMs)))}

`);
    } catch {
    }
    startPoll();
    req.on("close", () => {
      clients.delete(res);
      if (clients.size === 0) stopPoll();
    });
  }
  const webRoot = options.webRoot;
  const STATIC_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2"
  };
  function serveIndexWithToken(res) {
    if (!webRoot) return false;
    try {
      let html = readFileSync23(join49(webRoot, "index.html"), "utf8");
      const jsToken = JSON.stringify(token).replace(/</g, "\\u003c");
      const inject = `<script>window.__TENON_DASHBOARD_TOKEN__ = ${jsToken};</script>`;
      html = html.includes("</head>") ? html.replace("</head>", `${inject}</head>`) : `${inject}${html}`;
      sendHtml(res, 200, html);
      return true;
    } catch {
      return false;
    }
  }
  function serveAsset(res, path7) {
    if (!webRoot || !path7.startsWith("/assets/")) return false;
    const rel = path7.slice(1);
    if (rel.includes("..")) return false;
    const abs = join49(webRoot, rel);
    if (!abs.startsWith(join49(webRoot, "assets"))) return false;
    try {
      const body = readFileSync23(abs);
      const ext = abs.slice(abs.lastIndexOf("."));
      res.writeHead(200, {
        "Content-Type": STATIC_TYPES[ext] ?? "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end(body);
      return true;
    } catch {
      return false;
    }
  }
  return {
    clients,
    stopPoll,
    sendJson,
    sendHtml,
    readJsonBody,
    handleStream,
    serveIndexWithToken,
    serveAsset
  };
}

// packages/server/src/serverGovernance.ts
import { readdir as readdir5 } from "node:fs/promises";
import { join as join50, resolve as resolvePath11 } from "node:path";
function createServerGovernance(options) {
  const { registry, store, sendJson, trackSkillProfiles, operationsAvailable, operationRunner } = options;
  function trackRegistryBody(trackRegistry) {
    return {
      ok: true,
      revision: trackRegistry.revision,
      source: trackRegistry.source,
      tracks: trackRegistry.ordered
    };
  }
  async function scanActiveTrackChanges(root) {
    const changesRoot = join50(root, "openspec", "changes");
    let entries;
    try {
      entries = await readdir5(changesRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return { refs: [], unreadable: [] };
      return { refs: [], unreadable: [`<changes-root>: ${errMsg(error)}`] };
    }
    const names = entries.filter((entry) => entry.isDirectory() && entry.name !== "archive").map((entry) => entry.name).sort();
    const refs = [];
    const unreadable = [];
    for (const name of names) {
      try {
        const state = await store.read(join50(changesRoot, name));
        const track = state.fields.track;
        const workflow = state.fields.workflow;
        refs.push({
          name,
          track: Array.isArray(track) ? track.join(",") : track ?? "",
          workflow: Array.isArray(workflow) ? workflow.join(",") : workflow ?? ""
        });
      } catch {
        unreadable.push(name);
      }
    }
    return { refs, unreadable };
  }
  function sendTrackError(res, error) {
    if (error instanceof RegistryRevisionConflictError) {
      return sendJson(res, 409, {
        ok: false,
        code: "TRACK_REVISION_CONFLICT",
        error: error.message,
        expected: error.expected,
        actual: error.actual
      });
    }
    if (error instanceof TrackReferencedError) {
      return sendJson(res, 409, { ok: false, code: "TRACK_REFERENCED", error: error.message, references: error.references });
    }
    if (error instanceof TrackReferencesInvalidatedError) {
      return sendJson(res, 409, { ok: false, code: "TRACK_REFERENCES_INVALIDATED", error: error.message, references: error.offending });
    }
    if (error instanceof ChangeScanFailedError) {
      return sendJson(res, 409, { ok: false, code: "TRACK_REFERENCE_SCAN_FAILED", error: error.message, blockers: error.unreadable });
    }
    if (error instanceof TrackAlreadyExistsError) {
      return sendJson(res, 409, { ok: false, code: "TRACK_ALREADY_EXISTS", error: error.message });
    }
    if (error instanceof TrackNotFoundError) {
      return sendJson(res, 404, { ok: false, code: "TRACK_NOT_FOUND", error: error.message });
    }
    if (error instanceof BuiltinTrackDeleteError || error instanceof BuiltinTrackPolicyError) {
      return sendJson(res, 400, { ok: false, code: "TRACK_BUILTIN_LOCKED", error: error.message });
    }
    const message = errMsg(error);
    if (message.startsWith("mutateTrackRegistry: next \u672A\u8FC7\u5B8C\u6574\u6821\u9A8C")) {
      return sendJson(res, 400, { ok: false, code: "TRACK_INVALID", error: message });
    }
    return sendJson(res, 500, { ok: false, error: message });
  }
  async function mutateTrackForApi(anchor, expectedRevision, mutate) {
    assertWorkflowRootAnchor(anchor);
    ensureWorkflowProjectCoordinationPath(anchor);
    return mutateTrackRegistry(anchor.path, trackValidationContextFor(anchor), async (snapshot) => {
      if (snapshot.registry.revision !== expectedRevision) {
        throw new RegistryRevisionConflictError(expectedRevision, snapshot.registry.revision);
      }
      return mutate(snapshot);
    });
  }
  const fileExists = projectFileExists;
  const isRegisteredRoot = (root) => dedupeRoots(registry()).includes(resolvePath11(root));
  async function executeOperation(res, root, args) {
    if (!operationsAvailable) {
      return sendJson(res, 503, { ok: false, error: "Operations \u672A\u63A5\u7EBF\uFF1ATenon CLI bundle \u4E0D\u5B58\u5728" });
    }
    if (!root || !isRegisteredRoot(root)) {
      return sendJson(res, 404, { ok: false, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" });
    }
    try {
      const result = await operationRunner(resolvePath11(root), args);
      return sendJson(res, cliExitHttpStatus(result.exitCode), {
        ok: result.exitCode === 0,
        exit_code: result.exitCode,
        command: ["pipeline", ...args],
        result: parsePipelineCliJson(result.stdout),
        stdout: result.stdout.trimEnd(),
        stderr: result.stderr.trimEnd()
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: errMsg(error) });
    }
  }
  const workflowRootAnchors = /* @__PURE__ */ new Map();
  try {
    for (const root of dedupeRoots(registry())) {
      try {
        workflowRootAnchors.set(root, captureWorkflowRootAnchor(root));
      } catch {
      }
    }
  } catch {
  }
  const workflowRootForRequest = (root) => {
    const normalized2 = resolvePath11(root);
    if (!dedupeRoots(registry()).includes(normalized2)) {
      const stale = workflowRootAnchors.get(normalized2);
      if (stale) {
        closeWorkflowRootAnchor(stale);
        workflowRootAnchors.delete(normalized2);
      }
      return { ok: false, code: 404, error: "root \u672A\u5728\u673A\u5668\u7EA7\u9879\u76EE\u6CE8\u518C\u8868\u4E2D" };
    }
    const anchor = workflowRootAnchors.get(normalized2);
    if (!anchor) {
      try {
        const captured = captureWorkflowRootAnchor(normalized2);
        workflowRootAnchors.set(normalized2, captured);
        return { ok: true, anchor: captured };
      } catch (e) {
        return { ok: false, code: 403, error: errMsg(e) };
      }
    }
    try {
      assertWorkflowRootAnchor(anchor);
      return { ok: true, anchor };
    } catch (e) {
      return { ok: false, code: 403, error: errMsg(e) };
    }
  };
  const trackValidationContextFor = (anchor) => ({
    workflowExists: (id) => {
      if (id === "default") return true;
      try {
        readWorkflowForApi(anchor, id);
        return true;
      } catch {
        return false;
      }
    },
    skillProfiles: trackSkillProfiles
  });
  let boundPort = 0;
  return {
    trackRegistryBody,
    scanActiveTrackChanges,
    sendTrackError,
    mutateTrackForApi,
    fileExists,
    isRegisteredRoot,
    executeOperation,
    workflowRootAnchors,
    workflowRootForRequest,
    trackValidationContextFor
  };
}

// packages/server/src/relatedSessionMemory.ts
function createKernelRelatedSessionSearchRunner(memFs) {
  return (request) => {
    const result = searchRelatedSessions(memFs, request);
    return {
      protocol: "tenon-related-session-memory/v1",
      query: result.query,
      platform: result.platform,
      partial: result.partial,
      warnings: result.warnings.map((warning) => ({
        code: warning.code,
        message: warning.message
      })),
      matches: result.matches.map((match) => ({
        platform: match.platform,
        session_id: match.sessionId,
        ...match.title == null ? {} : { title: match.title },
        ...match.updatedAt == null ? {} : { updated_at: match.updatedAt },
        score: match.score,
        hit_count: match.hitCount,
        excerpt: match.excerpt,
        descendants_merged: match.descendantsMerged
      }))
    };
  };
}
function createRelatedSessionMemoryServices(options) {
  const memFs = options.memFs ?? nodeMemFs(options.hostHome);
  const runner = options.runner ?? createKernelRelatedSessionSearchRunner(memFs);
  return { memFs, executor: createRelatedSessionSearchExecutor(runner) };
}
function createRelatedSessionSearchExecutor(runner) {
  let inFlight = false;
  return async (request) => {
    if (inFlight) return { ok: false, reason: "busy" };
    inFlight = true;
    try {
      await new Promise((resolve13) => setImmediate(resolve13));
      return { ok: true, response: await runner(request) };
    } catch {
      return { ok: false, reason: "unavailable" };
    } finally {
      inFlight = false;
    }
  };
}

// packages/server/src/version.ts
import { readFileSync as readFileSync24 } from "node:fs";
import { basename as basename4, dirname as dirname11, join as join51 } from "node:path";
var SERVER_VERSION = "0.1.0";
var RELEASE_ID = /^sha256-[a-f0-9]{64}$/;
function isPluginManifestVersion(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function resolveReleaseVersion(pluginRoot2) {
  for (const relative6 of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
    try {
      const parsed = JSON.parse(readFileSync24(join51(pluginRoot2, relative6), "utf8"));
      if (isPluginManifestVersion(parsed) && typeof parsed.version === "string" && /^\d+\.\d+\.\d+$/.test(parsed.version)) {
        return parsed.version;
      }
    } catch {
    }
  }
  return SERVER_VERSION;
}
function resolvePayloadReleaseId(pluginRoot2) {
  if (basename4(pluginRoot2) !== "payload") return void 0;
  const releaseId = basename4(dirname11(pluginRoot2));
  return RELEASE_ID.test(releaseId) ? releaseId : void 0;
}

// packages/server/src/server.ts
var MAX_POST_BODY2 = 64 * 1024;
function createDashboardServer(options) {
  const version = options.version ?? SERVER_VERSION;
  const releaseId = options.releaseId;
  const transactionId = options.transactionId;
  assertDashboardTransactionId(transactionId);
  const token = options.token ?? generateToken();
  const clock = options.clock ?? isoNow;
  const paths = options.paths;
  const hostHome = options.hostHome ?? paths.homeDir;
  const stateScopeId = machineStateScopeId(paths.stateRoot);
  const registry = options.registry ?? (() => readProjectRegistry(paths.registryPath));
  const store = options.store ?? createStateStore();
  const recordStore = createTransitionRecordStore();
  const loopLedger = createLoopLedgerStore();
  const runRepo = createWorkflowRunRepository({ store, recordStore, clock });
  const history = createHistoryWriter();
  const breadcrumb = createBreadcrumbWriter();
  const loadedManifest = options.manifestPath ? loadManifest(options.manifestPath) : void 0;
  const flow = options.flow ?? (loadedManifest ? createFlowEngine(loadedManifest) : (() => {
    throw new Error("createDashboardServer: \u9700\u6CE8\u5165 flow \u6216 manifestPath");
  })());
  const trackSkillProfiles = (() => {
    const s = /* @__PURE__ */ new Set();
    for (const t of BUILTIN_TRACK_DEFINITIONS) {
      if (t.policyProfile.skills.profile !== "_all") s.add(t.policyProfile.skills.profile);
    }
    if (loadedManifest) {
      for (const table of [loadedManifest.mandatorySkills, loadedManifest.recommendedSkills]) {
        for (const row of Object.values(table)) {
          for (const k of Object.keys(row)) if (k !== "_all") s.add(k);
        }
      }
    }
    return s;
  })();
  const validateLoopActivation = options.validateLoopActivation ?? (loadedManifest === void 0 ? void 0 : async ({ root, loopId, candidate }) => {
    const loop = candidate.loops.find((entry) => entry.id === loopId);
    if (loop === void 0) return { ok: false, error: `\u5019\u9009 registry \u4E2D\u627E\u4E0D\u5230 loop "${loopId}"` };
    const resolver = createEffectiveSkillResolver({
      registry: () => {
        const rootCheck = workflowRootForRequest(root);
        if (!rootCheck.ok) throw new Error(rootCheck.error);
        return loadTrackRegistry(root, trackValidationContextFor(rootCheck.anchor));
      },
      manifest: loadedManifest
    });
    const wiringForRunner = (runner) => ({
      resolver,
      locator: createRunnerSkillContentLocator({
        runner,
        home: hostHome,
        bundledRoot: join52(repoRootForSkills2(), "skills")
      }),
      isSkillProfileKnown: (profileId) => profileId === "_all" || trackSkillProfiles.has(profileId)
    });
    const wiring = await evaluateLoopExecutionWiring(loop, candidate.loops, {
      repoRoot: root,
      skillBundleWiring: wiringForRunner(loop.runner),
      skillBundleWiringForLoop: (entry) => wiringForRunner(entry.runner)
    });
    return wiring.status === "ready" ? { ok: true } : { ok: false, error: `${wiring.dimension}: ${wiring.reason}` };
  });
  const pollIntervalMs = options.pollIntervalMs ?? 1e3;
  const heartbeatMs = options.heartbeatMs ?? 15e3;
  const gitHeadSha2 = options.gitHeadSha;
  const workspaceFingerprint = options.workspaceFingerprint;
  const traceStore = options.traceStore;
  const { memFs, executor: relatedSessionSearch } = createRelatedSessionMemoryServices({ hostHome, memFs: options.memFs, runner: options.relatedSessionSearch });
  const manifestPath2 = options.manifestPath;
  const operationRunner = options.runPipelineCli ?? runPipelineCli;
  const operationsAvailable = options.runPipelineCli !== void 0 || pipelineCliAvailable();
  const cadenceScheduler = options.cadence === void 0 || options.cadence === false ? null : createCadenceScheduler({
    ...options.cadence,
    roots: registry,
    clock,
    runPipelineCli: operationRunner
  });
  const routerPatternScorer = options.scoreRouterPattern ?? scoreRouterPatternWithGrep;
  const capabilities = {
    afk: true,
    loops: true,
    operations: operationsAvailable,
    traffic: Boolean(traceStore),
    config: Boolean(manifestPath2),
    router_preview: true,
    cadence: cadenceScheduler !== null
  };
  const snapshotDeps = (nowMs) => ({
    registry,
    store,
    version,
    clock,
    capabilities,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    ...nowMs === void 0 ? {} : { now: () => nowMs }
  });
  const {
    clients,
    stopPoll,
    sendJson,
    sendHtml,
    readJsonBody,
    handleStream,
    serveIndexWithToken,
    serveAsset
  } = createServerTransport({
    registry,
    snapshotDeps,
    heartbeatMs,
    pollIntervalMs,
    webRoot: options.webRoot,
    token
  });
  const {
    trackRegistryBody,
    scanActiveTrackChanges,
    sendTrackError,
    mutateTrackForApi,
    fileExists,
    isRegisteredRoot,
    executeOperation,
    workflowRootAnchors,
    workflowRootForRequest,
    trackValidationContextFor
  } = createServerGovernance({
    registry,
    store,
    sendJson,
    trackSkillProfiles,
    operationsAvailable,
    operationRunner
  });
  let boundPort = 0;
  async function resolveSessionLink(root, name) {
    const changeDir = join52(root, "openspec", "changes", name);
    try {
      const wtRaw = await store.get(changeDir, "automation_worktree");
      const wt = Array.isArray(wtRaw) ? wtRaw.join(",") : wtRaw ?? "";
      const lookupDir = wt !== "" && wt !== "null" ? wt : root;
      const claudeTop = listMemSessions(memFs, { filter: { cwd: lookupDir, platform: "claude", limit: 1 } })[0];
      const codexTop = listMemSessions(memFs, { filter: { cwd: lookupDir, platform: "codex", limit: 1 } })[0];
      const s = claudeTop && codexTop ? (codexTop.updated || codexTop.created || "") > (claudeTop.updated || claudeTop.created || "") ? codexTop : claudeTop : claudeTop ?? codexTop ?? listMemSessions(memFs, { filter: { cwd: lookupDir, platform: "all", limit: 1 } })[0];
      if (!s) return { found: false, dir: lookupDir, reason: "no-session" };
      const dir = s.cwd || lookupDir;
      const resumeCmd = s.platform === "claude" ? `cd ${shQuote(dir)} && claude --resume ${shQuote(s.id)}` : s.platform === "codex" ? `cd ${shQuote(dir)} && codex resume ${shQuote(s.id)}` : null;
      return {
        found: true,
        platform: s.platform,
        sessionId: s.id,
        dir,
        resumeCmd,
        ...s.updated || s.created ? { mtime: s.updated || s.created } : {}
      };
    } catch {
      return { found: false, dir: root, reason: "lookup-error" };
    }
  }
  const mutateTrackForRoutes = async (anchor, revision, mutate) => mutateTrackForApi(anchor, revision, async ({ config }) => mutate({ config }));
  const handleGet2 = (req, res, path7) => handleGet(req, res, path7, {
    cadenceScheduler,
    sendJson,
    sendHtml,
    serveIndexWithToken,
    serveAsset,
    indexHtml,
    token,
    version,
    releaseId,
    transactionId,
    stateScopeId,
    isLocalHost,
    boundPort: () => boundPort,
    snapshotDeps,
    handleStream,
    isRegisteredRoot,
    clock,
    store,
    recordStore,
    loopLedger,
    registry,
    traceStore,
    workflowRootForRequest,
    trackValidationContextFor,
    trackRegistryBody,
    manifestPath: manifestPath2,
    paths,
    hostHome,
    options,
    resolveSessionLink,
    errMsg
  });
  const handlePost = (req, res, path7) => handlePostRoute(req, res, path7, {
    isLocalHost,
    boundPort: () => boundPort,
    sendJson,
    token,
    readJsonBody,
    routerPatternScorer,
    workflowRootForRequest,
    trackValidationContextFor,
    executeOperation,
    operationRunner,
    operationsAvailable,
    isRegisteredRoot,
    store,
    clock,
    history,
    workflowRootAnchors,
    trackSkillProfiles,
    loadedManifest,
    runRepo,
    flow,
    fileExists,
    gitHeadSha: gitHeadSha2,
    workspaceFingerprint,
    breadcrumb,
    manifestPath: manifestPath2,
    paths,
    validateLoopActivation,
    mutateTrackForApi: mutateTrackForRoutes,
    trackRegistryBody,
    sendTrackError,
    errMsg,
    realGraduationFs: REAL_GRADUATION_FS,
    relatedSessionSearch
  });
  const mutationRouteDeps = {
    isLocalHost,
    boundPort: () => boundPort,
    sendJson,
    token,
    readJsonBody,
    workflowRootForRequest,
    mutateTrackForApi: mutateTrackForRoutes,
    scanActiveTrackChanges,
    trackRegistryBody,
    sendTrackError,
    paths,
    workflowRootAnchors,
    trackValidationContextFor,
    errMsg
  };
  const handlePatch = (req, res, path7) => handlePatchRoute(req, res, path7, mutationRouteDeps);
  const handleDelete = (req, res, path7) => handleDeleteRoute(req, res, path7, mutationRouteDeps);
  const httpServer = createServer((req, res) => {
    const path7 = (req.url ?? "/").split("?", 1)[0] ?? "/";
    const method = req.method ?? "GET";
    const handler = method === "GET" ? handleGet2(req, res, path7) : method === "POST" ? handlePost(req, res, path7) : method === "PATCH" ? handlePatch(req, res, path7) : method === "DELETE" ? handleDelete(req, res, path7) : Promise.resolve(sendJson(res, 405, { ok: false, error: "method not allowed" }));
    handler.catch((e) => {
      try {
        sendJson(res, 500, { ok: false, error: errMsg(e) });
      } catch {
      }
    });
  });
  return {
    token,
    version,
    httpServer,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve13, reject) => {
        const onError = (e) => reject(e);
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
          httpServer.removeListener("error", onError);
          const address = httpServer.address();
          if (address === null || typeof address === "string") {
            reject(new Error("dashboard server \u672A\u8FD4\u56DE TCP address"));
            return;
          }
          boundPort = address.port;
          cadenceScheduler?.start();
          resolve13({ port: boundPort, host });
        });
      });
    },
    close() {
      return new Promise((resolve13) => {
        stopPoll();
        cadenceScheduler?.stop();
        for (const anchor of workflowRootAnchors.values()) closeWorkflowRootAnchor(anchor);
        workflowRootAnchors.clear();
        for (const res of clients) {
          try {
            res.end();
          } catch {
          }
        }
        clients.clear();
        httpServer.close(() => resolve13());
        const closeAllConnections = Reflect.get(httpServer, "closeAllConnections");
        if (typeof closeAllConnections === "function") closeAllConnections.call(httpServer);
      });
    }
  };
}

// packages/server/src/paths.ts
function resolveServerPaths(opts = {}) {
  const product = resolveProductPaths({
    ...opts.home === void 0 ? {} : { homeDir: opts.home },
    ...opts.env === void 0 ? {} : { env: opts.env },
    ...opts.platform === void 0 ? {} : { platform: opts.platform }
  });
  return {
    ...product,
    tokenPath: product.dashboardTokenPath,
    pidfilePath: product.dashboardPidfilePath
  };
}

// packages/server/src/preempt.ts
import { execFile as execFile4 } from "node:child_process";
import { get as httpGet } from "node:http";
import { readFileSync as readFileSync25 } from "node:fs";
import { createConnection } from "node:net";
function compareVersions(a, b) {
  const pa = a.split(".").map((x) => parseInt(x, 10));
  const pb = b.split(".").map((x) => parseInt(x, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const candidateA = pa[i];
    const candidateB = pb[i];
    const x = typeof candidateA === "number" && Number.isFinite(candidateA) ? candidateA : 0;
    const y = typeof candidateB === "number" && Number.isFinite(candidateB) ? candidateB : 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
function decodeHealthInfo(value) {
  if (typeof value !== "object" || value === null) return null;
  const version = Reflect.get(value, "version");
  const scope = Reflect.get(value, "scope");
  const ok = Reflect.get(value, "ok");
  if (typeof version !== "string" || scope !== "global" || typeof ok !== "boolean") return null;
  const releaseId = Reflect.get(value, "releaseId");
  const stateScopeId = Reflect.get(value, "stateScopeId");
  const pid = Reflect.get(value, "pid");
  const transactionId = Reflect.get(value, "transactionId");
  return {
    ok,
    scope,
    version,
    ...typeof releaseId === "string" ? { releaseId } : {},
    ...typeof stateScopeId === "string" ? { stateScopeId } : {},
    ...typeof pid === "number" ? { pid } : {},
    ...typeof transactionId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(transactionId) ? { transactionId } : {}
  };
}
function readPidfile(pidfilePath) {
  try {
    const raw = JSON.parse(readFileSync25(pidfilePath, "utf8"));
    if (raw && typeof raw === "object") {
      const o = raw;
      if (typeof o.pid === "number" && typeof o.port === "number" && typeof o.version === "string") {
        return {
          pid: o.pid,
          port: o.port,
          version: o.version,
          started: typeof o.started === "number" ? o.started : void 0,
          ...typeof o.transactionId === "string" ? { transactionId: o.transactionId } : {}
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
function probeHealth(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve13) => {
    let done = false;
    let wallClockTimer;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (wallClockTimer !== void 0) clearTimeout(wallClockTimer);
      resolve13(v);
    };
    const req = httpGet({ host, port, path: "/api/health", timeout: timeoutMs }, (res) => {
      let body = "";
      let receivedBytes = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        receivedBytes += Buffer.byteLength(chunk);
        if (receivedBytes > 16 * 1024) {
          res.destroy();
          finish(null);
          return;
        }
        body += chunk;
      });
      res.once("aborted", () => finish(null));
      res.once("error", () => finish(null));
      res.on("end", () => {
        if (receivedBytes > 16 * 1024) {
          finish(null);
          return;
        }
        try {
          finish(decodeHealthInfo(JSON.parse(body)));
        } catch {
          finish(null);
        }
      });
    });
    wallClockTimer = setTimeout(() => {
      req.destroy();
      finish(null);
    }, timeoutMs);
    req.on("timeout", () => {
      req.destroy();
      finish(null);
    });
    req.on("error", () => finish(null));
  });
}
function decidePreemption(existing, myVersion, myReleaseId, myStateScopeId, myTransactionId) {
  if (!existing) return "bind";
  if (existing.transactionId !== myTransactionId && (existing.transactionId !== void 0 || myTransactionId !== void 0)) return "reuse";
  if (myReleaseId === void 0 && existing.releaseId !== void 0) return "reuse";
  if (existing.stateScopeId !== myStateScopeId) return myReleaseId === void 0 ? "reuse" : "preempt";
  const versionOrder = compareVersions(myVersion, existing.version);
  if (versionOrder !== 0) return versionOrder > 0 ? "preempt" : "reuse";
  if (myReleaseId !== void 0) return myReleaseId === existing.releaseId ? "reuse" : "preempt";
  return "reuse";
}
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function parseListenerPids(stdout) {
  return [...new Set(stdout.split(/\r?\n/).map((line) => Number.parseInt(line.trim(), 10)).filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
}
function listenerPids(port) {
  return new Promise((resolve13) => {
    execFile4("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }, (error, stdout) => {
      if (error === null) {
        resolve13(parseListenerPids(String(stdout ?? "")));
        return;
      }
      const code = error.code;
      if (code === 1) {
        resolve13([]);
        return;
      }
      resolve13(null);
    });
  });
}
function probePortOpen(port, host = "127.0.0.1", timeoutMs = 250) {
  return new Promise((resolve13) => {
    let done = false;
    const finish = (open4) => {
      if (done) return;
      done = true;
      resolve13(open4);
    };
    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      finish(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      finish(true);
    });
    socket.once("error", (error) => {
      const code = error.code;
      finish(code !== "ECONNREFUSED");
    });
  });
}
async function preemptOldServer(pidfilePath, port, host = "127.0.0.1", opts) {
  const pf = readPidfile(pidfilePath);
  const expected = /* @__PURE__ */ new Set();
  if (pf !== null && pf.port === port && pf.transactionId === opts?.transactionId) expected.add(pf.pid);
  const legacyPid = opts?.legacyPid;
  if (opts?.transactionId === void 0 && typeof legacyPid === "number" && Number.isSafeInteger(legacyPid) && legacyPid > 0) expected.add(legacyPid);
  const listeners = await listenerPids(port);
  if (listeners === null) return false;
  if (listeners.length === 0) return !await probePortOpen(port, host);
  const target = listeners.find((pid) => expected.has(pid));
  if (target === void 0) return false;
  try {
    process.kill(target, "SIGTERM");
  } catch {
  }
  const deadline = Date.now() + (opts?.waitMs ?? 3e3);
  while (Date.now() < deadline) {
    if (!await probePortOpen(port, host, 150)) return true;
    await sleep2(50);
  }
  return false;
}

// packages/server/src/port.ts
var DEFAULT_DASHBOARD_PORT = 18765;
function resolveDashboardPort(raw) {
  if (raw === void 0 || raw.trim() === "") return DEFAULT_DASHBOARD_PORT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : DEFAULT_DASHBOARD_PORT;
}

// packages/server/src/server-args.ts
function parseDashboardServerArgs(args) {
  if (args.length === 0) return { mode: "run" };
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return { mode: "help" };
  return {
    mode: "invalid",
    detail: `unsupported direct server arguments: ${args.join(" ")}`
  };
}

// packages/server/src/main.ts
function serverPort() {
  return resolveDashboardPort(process.env.TENON_DASHBOARD_PORT);
}
function cadencePollInterval() {
  const raw = Number.parseInt(process.env.TENON_CADENCE_POLL_MS ?? "", 10);
  return Number.isSafeInteger(raw) && raw >= 100 ? raw : 3e4;
}
function managedTransactionId() {
  const value = process.env.TENON_MANAGED_TRANSACTION_ID;
  if (value === void 0 || value === "") return void 0;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("TENON_MANAGED_TRANSACTION_ID \u683C\u5F0F\u975E\u6CD5");
  }
  return value;
}
function pluginRoot() {
  return join53(dirname13(fileURLToPath4(import.meta.url)), "..", "..", "..");
}
function manifestPath() {
  return join53(pluginRoot(), "templates", "manifest.yaml");
}
function gitHeadSha(cwd) {
  return new Promise((resolve13) => {
    execFile5("git", ["rev-parse", "HEAD"], { cwd }, (_err, stdout) => resolve13((stdout ?? "").trim()));
  });
}
async function main() {
  const argumentMode = parseDashboardServerArgs(process.argv.slice(2));
  if (argumentMode.mode === "help") {
    process.stdout.write(
      "Tenon Dashboard server is an internal managed-runtime entrypoint.\nUse `tenon dashboard` to start or inspect the product.\n"
    );
    return;
  }
  if (argumentMode.mode === "invalid") {
    process.stderr.write(`[dashboard-server] ${argumentMode.detail}
`);
    process.exitCode = 2;
    return;
  }
  const paths = resolveServerPaths();
  const host = "127.0.0.1";
  const port = serverPort();
  const root = pluginRoot();
  const version = resolveReleaseVersion(root);
  const releaseId = resolvePayloadReleaseId(root);
  const transactionId = managedTransactionId();
  const stateScopeId = machineStateScopeId(paths.stateRoot);
  mkdirSync6(paths.stateRoot, { recursive: true, mode: 448 });
  const existing = await probeHealth(port, host, 400);
  const decision = decidePreemption(existing, version, releaseId, stateScopeId, transactionId);
  if (decision === "reuse") {
    process.stdout.write(`[dashboard-server] \u590D\u7528\u65E2\u6709 Global server :${port}\uFF08\u7248\u672C ${existing?.version} \u2265 ${version}\uFF09
`);
    return;
  }
  if (decision === "preempt") {
    process.stdout.write(`[dashboard-server] \u62A2\u5360\u65E7\u7248\u672C ${existing?.version} \u2192 \u672C\u7248\u672C ${version}
`);
    const freed = await preemptOldServer(paths.pidfilePath, port, host, {
      waitMs: 4e3,
      legacyPid: existing?.pid,
      transactionId
    });
    if (!freed) {
      process.stderr.write("[dashboard-server] \u65E7\u5B9E\u4F8B\u672A\u5728\u671F\u9650\u5185\u8BA9\u51FA\u7AEF\u53E3\uFF0C\u542F\u52A8\u5931\u8D25\n");
      process.exitCode = 1;
      return;
    }
  }
  const token = generateToken();
  const srv = createDashboardServer({
    version,
    releaseId,
    transactionId,
    paths,
    hostHome: paths.homeDir,
    token,
    manifestPath: manifestPath(),
    gitHeadSha,
    workspaceFingerprint: (cwd) => fingerprintWorkspace(cwd),
    // dashboard-app 构建产物（BACKLOG #26c）：存在则服务真 SPA，否则回退最小落地页
    webRoot: join53(dirname13(fileURLToPath4(import.meta.url)), "..", "..", "dashboard-app", "dist"),
    // tap 流量查看器数据源（BACKLOG #34d）：只读 listSessions/readRecords，capabilities.traffic=true。
    // tap capture 默认 OFF，无捕获时返回空会话——数据端仍在线（#34e：只读本地、不外发）
    traceStore: createTraceStore(),
    // H15：生产 server 显式启用真实 cadence；执行复用已构建 CLI，不在 server 复制 runner。
    cadence: { pollIntervalMs: cadencePollInterval() }
  });
  try {
    await srv.listen(port, host);
  } catch (e) {
    process.stderr.write(`[dashboard-server] \u76D1\u542C :${port} \u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}
`);
    process.exitCode = 1;
    return;
  }
  try {
    await writeTokenHandshake(paths.tokenPath, token, { pid: process.pid, port, version, created: Date.now() });
  } catch {
  }
  try {
    writeFileSync6(paths.pidfilePath, JSON.stringify({
      pid: process.pid,
      port,
      version,
      started: Date.now(),
      ...transactionId === void 0 ? {} : { transactionId }
    }), "utf8");
  } catch {
  }
  process.stdout.write(
    `[dashboard-server] Global server http://${host}:${port}  version=${version}${releaseId === void 0 ? "" : ` release=${releaseId}`}
`
  );
  const shutdown = () => {
    void srv.close().finally(() => {
      try {
        unlinkSync3(paths.pidfilePath);
      } catch {
      }
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
void main();
