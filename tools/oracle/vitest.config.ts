import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// tools/oracle 专属 vitest 配置：根配置只包含 packages/*/src/**，
// 本目录测试用 `npx vitest run --config tools/oracle/vitest.config.ts` 运行。
export default defineConfig({
  test: {
    root: dirname(fileURLToPath(import.meta.url)),
    include: ['**/*.test.ts'],
    // harness 双跑要逐条 spawn 老 bash 状态机（每次调用惰性 source + python3 manifest 派生），慢是常态
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
})
