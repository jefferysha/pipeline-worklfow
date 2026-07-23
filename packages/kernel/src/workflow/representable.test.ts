/**
 * field-equals value 可表示域（G2 P2 阻断 2）——三层钉死：
 *   1. 委托 text/representable 通用面 + workflow 独有叠加 U+2028/U+2029；
 *   2. cross-check：workflow 谓词 vs tracks/representable，钉死「lone surrogate + 控制字符」通用域
 *      判定一致（分歧项——U+2028/U+2029、空串/首尾空白、同含双引号——单独断言，证明是序列化策略/
 *      parser 差异的**设计**分道，不是事故漂移）；
 *   3. 真实 UTF-8 落盘 round-trip：可表示 value serialize→真写文件→读回→parse 逐字往返；不可表示
 *      value compile 期 fail-loud 被挡（永不落盘）。含 lone surrogate 落盘被 U+FFFD 替换的探针，证明
 *      拦截防的是真实腐蚀。
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fieldEqualsValueUnrepresentableReason } from './representable.js'
import { stringUnrepresentableReason as trackStringUnrepresentableReason } from '../tracks/representable.js'
import { compileWorkflow } from './compile.js'
import { parseWorkflow } from './parse.js'
import { serializeWorkflow } from './serialize.js'
import type { WorkflowDef } from './types.js'

describe('fieldEqualsValueUnrepresentableReason —— 委托通用面 + 叠加行解析限制', () => {
  it('委托 text/representable 通用面（空串/控制字符/首尾空白/lone surrogate）→ 拒，且前缀 field-equals', () => {
    for (const v of ['', 'a\nb', 'a\rb', 'a\tb', ' pad', 'pad ', 'a\uD800b', 'a\uDC00b']) {
      const r = fieldEqualsValueUnrepresentableReason(v)
      expect(r, JSON.stringify(v)).not.toBeNull()
      expect(r, JSON.stringify(v)).toMatch(/^field-equals 的 value/)
    }
  })

  it('workflow 独有叠加：U+2028/U+2029（逐行 (.+?) 读不回；text 中性面放行）→ 拒', () => {
    for (const v of ['a\u2028b', 'a\u2029b']) {
      expect(fieldEqualsValueUnrepresentableReason(v), JSON.stringify(v)).toMatch(/U\+2028\/U\+2029/)
    }
  })

  it('可表示 → null（内部空格/冒号/井号/逗号/歧义标量/同含单双引号——bare 值无引号语义）', () => {
    for (const v of ['handled', 'needs review', 'a: b', 'a #b', 'x,y', 'true', '123', '~', '*ref', `a'b"c`, '会话']) {
      expect(fieldEqualsValueUnrepresentableReason(v), JSON.stringify(v)).toBeNull()
    }
  })
})

describe('cross-check：workflow 谓词 vs tracks/representable —— 通用域一致性契约', () => {
  // 通用腐蚀域（lone surrogate 高/低代理 + 行结构控制符 \n\r\t）：两套事实源必须都判不可表示，否则
  // 重演「一处拒一处放、保存成功下次打不开」的漂移（阻断 2 根因：workflow 曾漏拒 lone surrogate）。
  it('通用不可表示域两谓词一致「拒」', () => {
    for (const s of ['a\uD800b', 'a\uDC00b', '\uD800', '\uDFFF', 'a\nb', 'a\rb', 'a\tb', 'a\r\nb']) {
      expect(fieldEqualsValueUnrepresentableReason(s), `workflow ${JSON.stringify(s)}`).not.toBeNull()
      expect(trackStringUnrepresentableReason(s), `tracks ${JSON.stringify(s)}`).not.toBeNull()
    }
  })

  // 两套序列化策略下都能往返的合法值：都放行。
  it('合法值（标点/歧义标量/CJK/成对 emoji）两谓词一致「放行」', () => {
    for (const s of [
      'handled', 'needs review', 'a: b', 'a #b', 'x,y', 'true', '123', '-7', '~', '*ref',
      'yes', 'no', 'null', '会话', 'emoji 😀 ok',
    ]) {
      expect(fieldEqualsValueUnrepresentableReason(s), `workflow ${JSON.stringify(s)}`).toBeNull()
      expect(trackStringUnrepresentableReason(s), `tracks ${JSON.stringify(s)}`).toBeNull()
    }
  })

  // ── 刻意分道（不同序列化策略/parser 的真实差异，单独钉死：分歧是设计不是事故）──
  it('workflow 独有拒 U+2028/U+2029（逐行 (.+?) 读不回）；tracks 放行（值捕获 [\\s\\S]* 能读回）', () => {
    for (const s of ['a\u2028b', 'a\u2029b']) {
      expect(fieldEqualsValueUnrepresentableReason(s), `workflow ${JSON.stringify(s)}`).not.toBeNull()
      expect(trackStringUnrepresentableReason(s), `tracks ${JSON.stringify(s)}`).toBeNull()
    }
  })

  it('workflow 独有拒空串/首尾空白（bare 值读不回）；tracks 放行（引号包裹保真）', () => {
    for (const s of ['', ' pad', 'pad ', '  ']) {
      expect(fieldEqualsValueUnrepresentableReason(s), `workflow ${JSON.stringify(s)}`).not.toBeNull()
      expect(trackStringUnrepresentableReason(s), `tracks ${JSON.stringify(s)}`).toBeNull()
    }
  })

  it('tracks 独有拒「同含单双引号」（引号包裹无转义语义）；workflow 放行（bare 值无引号语义）', () => {
    expect(fieldEqualsValueUnrepresentableReason(`a'b"c`)).toBeNull()
    expect(trackStringUnrepresentableReason(`a'b"c`)).not.toBeNull()
  })
})

describe('真实 UTF-8 落盘 round-trip（阻断 2）', () => {
  function wfWithValue(value: string): WorkflowDef {
    return {
      name: 'reprfile',
      steps: [
        {
          id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [],
          guards: [{ type: 'field-equals', field: 'branch_status', value }], transitions: [],
        },
      ],
    }
  }

  it('可表示 value：compile 放行 → serialize → 真写临时文件(utf8) → readFile → parse → 逐字往返', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wf-repr-'))
    const values = ['handled', 'needs review', 'a: b', 'has #hash', 'a,b,c', 'true', '123', '~', '*ref', "it's", 'say "hi"', '会话值']
    for (const [i, value] of values.entries()) {
      const wf = wfWithValue(value)
      expect(() => compileWorkflow(wf), JSON.stringify(value)).not.toThrow()
      const file = join(dir, `wf${i}.yaml`)
      await writeFile(file, serializeWorkflow(wf), 'utf8')
      const readBack = parseWorkflow(await readFile(file, 'utf8'))
      expect(readBack, JSON.stringify(value)).toEqual(wf)
      expect((readBack.steps[0]!.guards[0] as { value: string }).value).toBe(value)
    }
  })

  it('不可表示 value：compile 期 fail-loud 被挡（永不进 serialize/落盘）', () => {
    for (const value of ['', 'a\nb', 'a\rb', 'a\tb', ' pad', 'pad ', 'a\u2028b', 'a\u2029b', 'a\uD800b', 'a\uDC00b']) {
      expect(() => compileWorkflow(wfWithValue(value)), JSON.stringify(value)).toThrow(/value/)
    }
  })

  it('探针：lone surrogate 经 writeFile(utf8) 落盘确被 U+FFFD 替换（证明 compile 拦截防的是真实腐蚀，非假想）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wf-surrogate-'))
    const file = join(dir, 'probe.txt')
    const lone = 'x\uD800y'
    await writeFile(file, lone, 'utf8')
    const readBack = await readFile(file, 'utf8')
    expect(readBack).not.toBe(lone) // 落盘后值变了
    expect(readBack).toContain('\uFFFD') // 孤立代理被替换成替换字符
  })
})
