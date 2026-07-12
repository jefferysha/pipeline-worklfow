import { describe, it, expect } from 'vitest'
import { diagnoseFailure } from './failureDiagnosis'

// ── full-install W3 · TDD ①：diagnoseFailure 纯函数——把 scheduler 落盘的 automation_last_error
//    原文（classifyFailure sanitize 后消息 / lifecycle [AGENT_EXIT] 标记 / docker·image 抛错串）
//    映射成稳定成因枚举 + 可复制修复命令。断言只钉 { cause, fixCommand }，人话经 i18n（不在此层）。──

describe('diagnoseFailure 成因分类（W3 ①）', () => {
  it('凭证类：含 OPENAI_API_KEY / CLAUDE_CODE_OAUTH / 凭证 / authentication → missing-credential + pipeline setup', () => {
    for (const s of [
      'codex 认证失败：请设置 OPENAI_API_KEY 后重试',
      '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY 或挂载 CODEX_HOME',
      '未检测到 CLAUDE_CODE_OAUTH_TOKEN 或 claude CLI：本轮走确定性兜底',
      'authentication failed: token expired (401)',
    ]) {
      expect(diagnoseFailure(s)).toEqual({ cause: 'missing-credential', fixCommand: 'pipeline setup' })
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

  it('agent 非零：[AGENT_EXIT] <runner> <exit> → agent-nonzero（agent 真跑过且非零，无配置类修复命令）', () => {
    expect(diagnoseFailure('[AGENT_EXIT] claude 96')).toEqual({ cause: 'agent-nonzero', fixCommand: null })
    expect(diagnoseFailure('[AGENT_EXIT] codex 1')).toEqual({ cause: 'agent-nonzero', fixCommand: null })
  })

  it('空串 / 无法识别 → unknown + pipeline doctor 兜底', () => {
    expect(diagnoseFailure('')).toEqual({ cause: 'unknown', fixCommand: 'pipeline doctor' })
    expect(diagnoseFailure('some weird failure nobody predicted')).toEqual({
      cause: 'unknown',
      fixCommand: 'pipeline doctor',
    })
  })

  it('回归：verify 失败原文 `verify: 2 failed · auth.test.ts` 不被裸 auth 误判成 missing-credential', () => {
    // 真实 last_error（TaskDetail 既有 fixture）——auth.test.ts 是失败的测试文件名，非凭证问题。
    expect(diagnoseFailure('verify: 2 failed · auth.test.ts').cause).not.toBe('missing-credential')
    expect(diagnoseFailure('verify: 2 failed · auth.test.ts').cause).toBe('unknown')
  })
})
