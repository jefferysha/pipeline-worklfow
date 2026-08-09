import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadCanonicalSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import {
  REAL_RELEASED_DASHBOARD_STARTER,
} from './released-dashboard-starter.js'
import type { ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  nativeInstallPlan,
  selectPipelineHost,
  type NativePipelineHost,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────

import { REAL_SETUP_ENV, resolvePipelineRoot, type SetupEnv, type SetupOpts } from './setupEnvironment.js'
import {
  buildSkillsPlan, cmdStr, higherTier, renderSkillsPlan, skillInstalled,
  type PlannedCommand, type SkillsPlan,
} from './setupSkillsPlan.js'
import { provenanceVerifierBinding } from './native-host-command-binding.js'
interface ExecOutcome {
  successes: PlannedCommand[]
  failures: Array<{ cmd: PlannedCommand; detail: string }>
  drifts: Array<{ source: string; name: string }> // `--list` 未命中的 token 名（可能已改名）
}

/** 分组逐条执行（注入 exec）:skills-cli 先 `--list` 核 id 记漂移,再装;单条失败记入汇总不 abort 其余。
 * 非 bare 的 skills-cli 即使命令 exit 0，也须逐项确认真实用户级安装目录已出现；上游 CLI 会在
 * 部分 `--skill` 名不存在时仍安装其余子集并 exit 0，不能据此把整组冒充成功。 */
function executeSkillsPlan(deps: CliDeps, plan: SkillsPlan, env: SetupEnv): ExecOutcome {
  const out: ExecOutcome = { successes: [], failures: [], drifts: [] }
  for (const c of plan.commands) {
    if (c.listCmd) {
      try {
        const r = env.runCommand(c.listCmd.cmd, c.listCmd.args)
        if (r.code === 0) for (const n of c.names) if (!r.stdout.includes(n)) out.drifts.push({ source: c.source, name: n })
      } catch { /* --list 失败不阻断,照装（名可能仍有效,或按 find-skills 兜底） */ }
    }
    deps.io.out(`[setup skills] $ ${cmdStr(c)}`)
    try {
      const r = env.runCommand(c.cmd, c.args)
      if (r.stdout.trim() !== '') deps.io.out(r.stdout.trimEnd())
      if (r.code !== 0) {
        out.failures.push({ cmd: c, detail: r.stderr.trim() !== '' ? r.stderr.trim() : `退出码 ${r.code}` })
        continue
      }
      const missing = (c.skillRequests ?? []).filter((request) => !skillInstalled(env, request.name))
      if (missing.length > 0) {
        let tier: SkillTier = 'optional'
        for (const request of missing) tier = higherTier(tier, request.tier)
        out.failures.push({
          cmd: {
            ...c,
            tier,
            tokens: missing.map((request) => request.token),
            names: missing.map((request) => request.name),
            skillRequests: missing,
          },
          detail: `安装命令 exit 0，但用户级技能目录仍缺失：${missing.map((request) => request.name).join('、')}`,
        })
      } else {
        out.successes.push(c)
      }
    } catch (e) {
      out.failures.push({ cmd: c, detail: errMsg(e) })
    }
  }
  return out
}

/** 末尾汇总:成功数/跳过数/失败清单（mandatory 失败红字 [FAIL·强制]+手动命令);有强制失败 → 退出码非零。 */
function renderSummary(deps: CliDeps, o: ExecOutcome, plan: SkillsPlan): number {
  deps.io.out(
    `[setup skills] 完成 —— 成功 ${o.successes.length} / 跳过 ${plan.alreadyInstalled.length} / 失败 ${o.failures.length}`,
  )
  for (const d of o.drifts) {
    deps.io.out(
      `  [WARN] 名称漂移:${d.source} 的 '${d.name}' 在 --list 未命中（上游可能已改名——装最新语义;可用 find-skills 重新定位）`,
    )
  }
  let mandatoryFail = false
  for (const f of o.failures) {
    const s = cmdStr(f.cmd)
    if (f.cmd.tier === 'mandatory') { // 强制级失败:红字标出 + 手动命令（对齐 doctor [FAIL] 严重级文本口径,非 ANSI）
      mandatoryFail = true
      deps.io.err(`  [FAIL·强制] ${s} —— ${f.detail}`)
      deps.io.err(`             手动重试:${s}`)
    } else {
      deps.io.err(`  [FAIL] ${s} —— ${f.detail}（${f.cmd.tier};非强制,不阻断退出码）`)
    }
  }
  if (o.failures.length === 0) deps.io.out('  全部命令执行成功。')
  return mandatoryFail ? 1 : 0
}

/**
 * 真实 bundled CLI 的 setup skills 入口必须先验证 exact plugin root 的完整 provenance。
 * verifier 通过冻结 Bash 同步执行完整 `tools/verify-skills.sh`；不重新实现 hash，也不读取
 * cwd 或任何 lower-tier registry。复合 binding 在这一次 spawn 前重放 Bash 与委托 Node。
 * 显式注入 sources/loader 的单元测试保留原有 seam，不触发真实仓库 IO。
 */
function verifyRealPluginRootBeforePlanning(deps: CliDeps, env: SetupEnv): number {
  const root = env.pluginRoot() ?? resolvePipelineRoot(env)
  const provenance = provenanceVerifierBinding(env)
  const nodePath = provenance.nodePath || '<unavailable>'
  const result = provenance.run([
    join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root, '--node', nodePath,
  ], { timeoutMs: 30_000 })
  const stdout = result.stdout.trim()
  const stderr = result.stderr.trim()
  const output = stderr !== '' ? stderr : stdout
  if (result.code !== 0) {
    deps.io.err(
      `ERROR: canonical Skill provenance 校验失败（root=${root}）` +
        (output === '' ? '' : `\n${output}`),
    )
    return 1
  }
  return 0
}

/**
 * 技能安装段（Phase 2 · S2）:读 registry → 计划 → dry-run 只打印零副作用 / 非 dry-run 确认(y/N or --yes) → 逐条容错 → 汇总。
 *   sources 缺省真 canonical v3 registry；测试可注入 SkillSource[] 子集或 loader。env 缺省真 fs+exec，测试注入 spy。
 */
export function cmdSetupSkills(
  deps: CliDeps,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  sources?: SkillSource[],
  loadSources: () => SkillSourcesResult = loadCanonicalSkillSources,
): number {
  const selfPath = resolve(env.selfPath())
  const isBundledCli = /(?:^|[\\/])packages[\\/]cli[\\/]dist[\\/]tenon\.mjs$/u.test(selfPath)
  // Full native setup passes a bound lifecycle environment (a shallow copy of REAL_SETUP_ENV)
  // so the physical proofs survive the first host mutation.  Treat that marker as production
  // too; checking object identity alone would silently skip the exact-root gate in full setup.
  const isProductionEnv = env === REAL_SETUP_ENV || env.runTrustedLifecycleCommand !== undefined
  const productionCanonicalSetup = sources === undefined
    && loadSources === loadCanonicalSkillSources
    && isProductionEnv
    && isBundledCli
  if (productionCanonicalSetup) {
    const provenanceCode = verifyRealPluginRootBeforePlanning(deps, env)
    if (provenanceCode !== 0) return provenanceCode
  }
  let list: SkillSource[]
  if (sources !== undefined) {
    list = sources // 测试注入的显式子集（含合法空 []，为合法空 registry）
  } else {
    // 装机段区分「读失败/解析失败」与「真空 registry」：坏/缺 registry 不能当空计划走
    // 「无待装 exit 0」假成功（什么都没装 → 破 full-install 前提）→ fail-loud 非零退出。
    const loaded = productionCanonicalSetup
      ? loadCanonicalSkillSources(join(env.pluginRoot() ?? resolvePipelineRoot(env), 'templates', 'skill-sources.yaml'))
      : loadSources()
    if (!loaded.ok) {
      deps.io.err(
        `ERROR: 技能 registry 未就绪（${loaded.error}）——无法生成安装计划，` +
          '请修复 templates/skill-sources.yaml 后重试 tenon setup skills。',
      )
      return 1
    }
    list = loaded.sources // 合法（含真空 registry [] → 下方走「无待装」exit 0）
  }
  const plan = buildSkillsPlan(list, env)
  renderSkillsPlan(deps, plan)

  if (opts.dryRun) { // dry-run:零执行零全局写（继承 F3 dry-run 不变量）
    deps.io.out('[setup skills] --dry-run:仅打印计划,未执行任何命令、未写任何全局目录。')
    return 0
  }
  if (plan.commands.length === 0) {
    deps.io.out('[setup skills] 无待装技能（全部已就绪或无可安装项）。')
    return 0
  }
  if (!opts.yes) { // 终端确认（--yes 跳过）
    const dirs = [...new Set(plan.commands.map((c) => c.globalDir))].join(' / ')
    if (!env.confirm(`[setup skills] 将执行 ${plan.commands.length} 条命令,写入全局目录:${dirs}。确认?(y/N) `)) {
      deps.io.out('[setup skills] 已取消（未执行任何命令）。')
      return 0
    }
  }
  return renderSummary(deps, executeSkillsPlan(deps, plan, env), plan)
}

// ── 运行时检查段（Phase 3 · R1）:AFK 就绪探测 → 打印就绪清单（docker/镜像/两 runner 凭证）──────

/**
 * 运行时段注入面（docker 探测 + 凭证宿主 env + 镜像解析）——真实现走真 docker/process.env/
 * .pipeline/automation.json;测试注入 fake exec + 定值 hostEnv/image（零真 docker 子进程）。
 * secrets 侧仍复用 deps.readSecretsEnv（与 afk run 同源），不在此重复读文件。
 */
