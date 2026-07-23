import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 本包组件测试基座（jsdom 真 render + 真断言 DOM，GOAL C9）。
// 环境隔离（不污染根 node 环境的 922 用例）：
//   · root = 本包目录；include 限定 src/**/*.test.tsx（根 vitest.config 只收 *.test.ts，两者互不相交）。
//   · environment: jsdom 仅作用本包；根 run 用 node 环境，各跑各的。
export default defineConfig({
  plugins: [react()],
  resolve: {
    // '@' → src：与 vite.config / tsconfig paths 一致（shadcn 基建；ui 组件内部 import '@/lib/utils'）。
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.tsx'],
  },
})
