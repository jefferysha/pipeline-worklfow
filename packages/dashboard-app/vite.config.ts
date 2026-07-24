import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiPort = Number(process.env.PIPELINE_DASHBOARD_PORT)
const dashboardApiPort = Number.isInteger(apiPort) && apiPort >= 1 && apiPort <= 65_535 ? apiPort : 18765
const configuredDevPort = Number(process.env.PIPELINE_DASHBOARD_DEV_PORT)
const dashboardDevPort = Number.isInteger(configuredDevPort) && configuredDevPort >= 1 && configuredDevPort <= 65_535
  ? configuredDevPort
  : 5173

// base: './' —— 相对资源路径，令产物无论被 server 挂在 / 还是 /app/ 皆可同源加载
// （CSP 严格同源：/api/* 用绝对同源路径 fetch/EventSource，静态资源用相对路径）。
// 见 packages/server GET / 同源 token 注入（#25）；产物如何交 server 见 README 接线清单（#26 报告）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    // '@' → src：与 tsconfig paths、components.json alias 保持一致（shadcn 基建）。
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // 本地 dev 独立在 5173（可用 PIPELINE_DASHBOARD_DEV_PORT 覆盖）；/api 代理到生产 API
    // 监听端口。生产由 server 同源提供 SPA，不会起第二个前端端口。
    port: dashboardDevPort,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${dashboardApiPort}`, changeOrigin: true },
    },
  },
})
