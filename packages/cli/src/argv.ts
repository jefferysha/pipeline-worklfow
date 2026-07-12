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
