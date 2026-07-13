/**
 * argv 预处理：从原始 argv 切出 `-- <passthrough...>` 段。
 *
 * 只有 tap 子命令消费 passthroughArgv（见 commands/tap.ts / deps.ts passthroughArgv 顶注：
 * commander 的 variadic 捕获在裸 `--` 前一个 token 是普通位置参数时会静默吞掉那个 `--`）。
 * 因此**只在命令为 tap 时**手工切分 passthrough；其余命令的 `--` 尾段原样留在 toParse 还给
 * commander（否则被这里静默吞掉——如 `loops init ... -- extra` 的 extra 蒸发）。
 */
export function splitPassthroughArgv(argv: readonly string[]): { toParse: string[]; passthrough?: string[] } {
  const idx = argv.indexOf('--', 2) // 跳过 argv[0]=node、argv[1]=脚本路径，只在真实参数区找
  if (idx === -1) return { toParse: [...argv] }
  // 命令恒在 argv[2]（CLI 无全局 option）；只有 tap 消费 passthroughArgv，其余命令不切分——
  // 把 `--` 及其尾段原样留给 commander，避免这里静默吞掉（如 `loops init … -- extra` 的 extra 蒸发）。
  if (argv[2] !== 'tap') return { toParse: [...argv] }
  return { toParse: argv.slice(0, idx), passthrough: argv.slice(idx + 1) }
}

/**
 * 通用 `--flag` 分离器（mem/channel/scaffold 三份手写 parseArgs/parseFlags 的收敛，语义逐字保持）：
 *   `--k v`  → flags.k = 'v'（next 存在且不以 `--` 开头即当值吞掉——含 `-x`/负数/空串）；
 *   裸 `--k`（末尾或后跟另一 `--*`）→ flags.k = true（值不吞 flag）；
 *   其余 token 保序进 positional；重复 flag 后者覆盖；`--k=v` 不拆等号（key 含 `=`）。
 * 消费端以 `typeof v === 'string'` 区分带值/裸；不解释语义（数值/枚举校验归各命令）。
 * ★不适用 loops.ts（csv/强类型 flag 解析）与 tap.ts（--ca 三态），它们的差异是 feature。
 */
export function splitFlags(args: readonly string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  let i = 0
  while (i < args.length) {
    const a = args[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const nxt = args[i + 1]
      if (nxt !== undefined && !nxt.startsWith('--')) {
        flags[key] = nxt
        i += 1
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
    i += 1
  }
  return { positional, flags }
}
