import { describe, it, expect } from 'vitest'
import { diagnoseFailure, diagnoseFailureWithCause } from './failureDiagnosis'

// ── full-install W3 · TDD ①：diagnoseFailure 纯函数——把 scheduler 落盘的 automation_last_error
//    原文（classifyFailure sanitize 后消息 / lifecycle [AGENT_EXIT] 标记 / docker·image 抛错串）
//    映射成稳定成因枚举 + 可复制修复命令。断言只钉 { cause, fixCommand }，人话经 i18n（不在此层）。──

describe('diagnoseFailure 成因分类（W3 ①）', () => {
  it('凭证类：含 OPENAI_API_KEY / CLAUDE_CODE_OAUTH / 凭证 / authentication → missing-credential + tenon setup', () => {
    for (const s of [
      'codex 认证失败：请设置 OPENAI_API_KEY 后重试',
      '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY 或挂载 CODEX_HOME',
      '未检测到 CLAUDE_CODE_OAUTH_TOKEN 或 claude CLI：本轮走确定性兜底',
      'authentication failed: token expired (401)',
    ]) {
      expect(diagnoseFailure(s)).toEqual({ cause: 'missing-credential', fixCommand: 'tenon setup' })
    }
  })

  it('镜像类：含 镜像 / unable to find image / sandcastle → missing-image + build.sh', () => {
    for (const s of [
      'AFK 镜像 sandcastle:local 不在本机（无法起容器）',
      "docker run sandcastle:local failed (exit 125): Unable to find image 'sandcastle:local' locally",
    ]) {
      expect(diagnoseFailure(s)).toEqual({
        cause: 'missing-image',
        fixCommand: 'bash tools/sandcastle/build.sh',
      })
    }
  })

  it('docker 类：daemon 未起 → missing-docker（无单一可复制命令，fixCommand=null）', () => {
    const d = diagnoseFailure(
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    )
    expect(d.cause).toBe('missing-docker')
    expect(d.fixCommand).toBeNull()
  })

  it('docker daemon 串同时含镜像名 → 仍判 missing-docker（daemon 特征优先于镜像名，不被 image 抢走）', () => {
    expect(
      diagnoseFailure('docker run sandcastle:local failed (exit 125): Cannot connect to the Docker daemon').cause,
    ).toBe('missing-docker')
  })

  it('agent 非零退出（生产主路径）：lifecycle 改写的真实落盘句（含「凭证」）→ missing-credential + tenon setup（非 agent-nonzero）', () => {
    // 真实落盘串逐字对齐 lifecycle.ts:211 createAgentExitWatch——沙箱 `[AGENT_EXIT] <runner> <exit>` 行
    // 被改写成含「凭证」的中文句再落 automation_last_error（生产**不落**裸标记）。含「凭证」→ CREDENTIAL_RE
    // (优先级1)截获 → missing-credential（凭证为主因，原文保留可续诊）。此前 fixture 喂裸标记=假信心。
    for (const s of [
      'codex agent 非零退出（exit 96）：可能凭证失效或 codex 自身报错，详见 agent 日志',
      'claude agent 非零退出（exit 1）：可能凭证失效或 claude 自身报错，详见 agent 日志',
    ]) {
      expect(diagnoseFailure(s)).toEqual({ cause: 'missing-credential', fixCommand: 'tenon setup' })
    }
  })

  it('agent-nonzero 分支（防御性兜底）：裸 [AGENT_EXIT] 标记 → agent-nonzero——生产主路径不经此（watcher 已改写为上面的凭证句），保留兜底不删', () => {
    expect(diagnoseFailure('[AGENT_EXIT] claude 96')).toEqual({ cause: 'agent-nonzero', fixCommand: null })
    expect(diagnoseFailure('[AGENT_EXIT] codex 1')).toEqual({ cause: 'agent-nonzero', fixCommand: null })
  })

  it('空串 / 无法识别 → unknown + tenon doctor 兜底', () => {
    expect(diagnoseFailure('')).toEqual({ cause: 'unknown', fixCommand: 'tenon doctor' })
    expect(diagnoseFailure('some weird failure nobody predicted')).toEqual({
      cause: 'unknown',
      fixCommand: 'tenon doctor',
    })
  })

  it('回归：verify 失败原文 `verify: 2 failed · auth.test.ts` 不被裸 auth 误判成 missing-credential', () => {
    // 真实 last_error（TaskDetail 既有 fixture）——auth.test.ts 是失败的测试文件名，非凭证问题。
    expect(diagnoseFailure('verify: 2 failed · auth.test.ts').cause).not.toBe('missing-credential')
    expect(diagnoseFailure('verify: 2 failed · auth.test.ts').cause).toBe('unknown')
  })
})

// ── Bug5：成因分类修复 —— ①补 conflict/timeout/network 三类（此前全落 unknown 误导跑 doctor）；
//    ②收窄 IMAGE_RE 防 sandcastle.test.ts 测试文件名被判 missing-image；③收窄 401（栈行号/第三方
//    401 不再误判凭证）；④unauthorized+镜像上下文 → 镜像鉴权（missing-image）而非 missing-credential；
//    ⑤docker 泛词不再吞 ENOTFOUND registry-1.docker.io 网络错。照 auth.test.ts 正向的钉法补反例。──
describe('Bug5 成因分类修复：新增类 + 收窄误判', () => {
  it('①冲突类：git merge conflict / 中文冲突 → conflict（不再 unknown 误导 doctor；无单一命令 null）', () => {
    for (const s of [
      'CONFLICT (content): Merge conflict in src/app.ts',
      'error: could not apply 3f2a… hint: fix conflicts and then commit the result',
      'AFK 变基失败：存在冲突，需人工解决',
    ]) {
      expect(diagnoseFailure(s)).toEqual({ cause: 'conflict', fixCommand: null })
    }
  })

  it('①超时类：merge timed out / operation timeout / 中文超时 → timeout（非 unknown；瞬态无命令 null）', () => {
    for (const s of ['error: merge timed out after 300s', 'operation timed out', '请求超时，未收到响应']) {
      expect(diagnoseFailure(s)).toEqual({ cause: 'timeout', fixCommand: null })
    }
  })

  it('①⑤网络类：ENOTFOUND registry-1.docker.io / getaddrinfo → network（不被 \\bdocker\\b 吞成 missing-docker）', () => {
    expect(diagnoseFailure('getaddrinfo ENOTFOUND registry-1.docker.io')).toEqual({ cause: 'network', fixCommand: null })
    expect(diagnoseFailure('request to https://api.openai.com failed: EAI_AGAIN').cause).toBe('network')
    expect(diagnoseFailure('网络不可达：无法解析域名 registry.example.com').cause).toBe('network')
  })

  it('②收窄 IMAGE：sandcastle.test.ts 测试文件名不再被判 missing-image（→ unknown）', () => {
    expect(diagnoseFailure('verify: 3 failed · sandcastle.test.ts').cause).not.toBe('missing-image')
    expect(diagnoseFailure('verify: 3 failed · sandcastle.test.ts').cause).toBe('unknown')
    // 真镜像引用（冒号 tag）仍判 missing-image，收窄不误伤
    expect(diagnoseFailure("Unable to find image 'sandcastle:local' locally").cause).toBe('missing-image')
  })

  it('③收窄 401：栈行号 / 裸状态码 401 不再误判 missing-credential（→ unknown）', () => {
    expect(diagnoseFailure('TypeError: cannot read x (worker.js:401:18)').cause).toBe('unknown')
    expect(diagnoseFailure('upstream service returned status 401').cause).not.toBe('missing-credential')
    // 明确 authentication 语境仍判凭证（回归：与既有 401+authentication 用例一致）
    expect(diagnoseFailure('authentication failed: token expired (401)').cause).toBe('missing-credential')
  })

  it('④unauthorized + 镜像/registry 上下文 → missing-image（registry 鉴权），不被 credential 最前截胡', () => {
    expect(diagnoseFailure('docker pull sandcastle:local: unauthorized: authentication required').cause).toBe('missing-image')
    expect(
      diagnoseFailure("Error response from daemon: pull access denied for foo, repository may require 'docker login'").cause,
    ).toBe('missing-image')
  })
})

// ── F-b 成因结构化落盘（读取端）：diagnoseFailureWithCause 双层入口——结构化 automation_cause
//    直判优先，空串/缺失/未识别值回落既有 regex。**上方全部既有断言零修改**即 fallback 语义原样
//    保留的证明（契约：fallback 永久保留不设日落，老数据与基础设施类失败继续走 regex）。──
describe('F-b diagnoseFailureWithCause：结构化成因直判 + regex fallback', () => {
  it('写入端本轮值域 5 值逐一映射：conflict/timeout 归既有类、agent-exit→agent-nonzero、cancelled/verify-fail→新类；fixCommand 全 null', () => {
    expect(diagnoseFailureWithCause('cancelled', '')).toEqual({ cause: 'cancelled', fixCommand: null })
    expect(diagnoseFailureWithCause('conflict', '')).toEqual({ cause: 'conflict', fixCommand: null })
    expect(diagnoseFailureWithCause('timeout', '')).toEqual({ cause: 'timeout', fixCommand: null })
    expect(diagnoseFailureWithCause('verify-fail', '')).toEqual({ cause: 'verify-fail', fixCommand: null })
    expect(diagnoseFailureWithCause('agent-exit', '')).toEqual({ cause: 'agent-nonzero', fixCommand: null })
  })

  it('cause 直判优先于 lastError regex（写入端第一手结论 > 原文倒猜；原文含 docker daemon 串也不改判）', () => {
    expect(
      diagnoseFailureWithCause('timeout', 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock').cause,
    ).toBe('timeout')
  })

  it('cause 空串（老数据 / 基础设施类本轮不落）→ 回落 regex：8 类分类学一个不丢', () => {
    expect(diagnoseFailureWithCause('', 'getaddrinfo ENOTFOUND registry-1.docker.io')).toEqual({ cause: 'network', fixCommand: null })
    expect(diagnoseFailureWithCause('', '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY')).toEqual({
      cause: 'missing-credential',
      fixCommand: 'tenon setup',
    })
    expect(diagnoseFailureWithCause('', '')).toEqual({ cause: 'unknown', fixCommand: 'tenon doctor' })
  })

  it('未识别 cause 值（开放集：写入端未来新增值/脏数据）→ 不 throw，回落 regex', () => {
    expect(diagnoseFailureWithCause('some-future-cause', 'AFK 镜像 sandcastle:local 不在本机')).toEqual({
      cause: 'missing-image',
      fixCommand: 'bash tools/sandcastle/build.sh',
    })
    expect(diagnoseFailureWithCause('some-future-cause', '')).toEqual({ cause: 'unknown', fixCommand: 'tenon doctor' })
  })

  it('回归钉死：取消场景 regex 只能 unknown+误建议 doctor；有 cause 后 cancelled 不再建议任何命令', () => {
    const msg = '任务被人工终止'
    expect(diagnoseFailure(msg)).toEqual({ cause: 'unknown', fixCommand: 'tenon doctor' })
    expect(diagnoseFailureWithCause('cancelled', msg)).toEqual({ cause: 'cancelled', fixCommand: null })
  })

  it('回归钉死：verify 未过原文 regex 只能 unknown；有 cause 后判 verify-fail（新类首次可达）', () => {
    const msg = 'verify: 2 failed · auth.test.ts'
    expect(diagnoseFailure(msg).cause).toBe('unknown')
    expect(diagnoseFailureWithCause('verify-fail', msg)).toEqual({ cause: 'verify-fail', fixCommand: null })
  })

  // ── cause-touchup 对账缝：写入端(scheduler.ts:143)第 6 值 `no-op`——零 commit 空跑结算
  //    (automation=paused,「run 成功但无产出」,非故障)。读取端 Map 若不认识 → fallback regex
  //    只能 unknown+误建议 doctor(空跑不是可 doctor 的环境故障)。──
  it('写入端第 6 值 no-op（零 commit 空跑）→ 新类 no-op；非故障无可修，fixCommand=null 不建议任何命令', () => {
    expect(diagnoseFailureWithCause('no-op', '')).toEqual({ cause: 'no-op', fixCommand: null })
  })

  it('回归钉死：no-op 写入端 last_error 原文 regex 只能 unknown+误建议 doctor；有 cause 后直判 no-op', () => {
    // 逐字对齐 scheduler.ts:140 落盘句——regex 8 类无一命中(「未合并」不含冲突关键词、无 agent 词)。
    const msg = 'no-op run：零 commit / 空构建（build_sha 缺失）——未合并、未解锁下游，停给人工复核'
    expect(diagnoseFailure(msg)).toEqual({ cause: 'unknown', fixCommand: 'tenon doctor' })
    expect(diagnoseFailureWithCause('no-op', msg)).toEqual({ cause: 'no-op', fixCommand: null })
  })

  it('原型链脏值防御：cause 恰为对象原型键（toString/constructor）→ 不误中映射，回落 regex', () => {
    expect(diagnoseFailureWithCause('toString', '').cause).toBe('unknown')
    expect(diagnoseFailureWithCause('constructor', '').cause).toBe('unknown')
  })

  it('返回值是新对象：改动返回结果不污染后续同 cause 调用（CAUSE_MAP 引用不外泄）', () => {
    const first = diagnoseFailureWithCause('cancelled', '')
    first.fixCommand = 'rm -rf /'
    expect(diagnoseFailureWithCause('cancelled', '')).toEqual({ cause: 'cancelled', fixCommand: null })
  })
})
