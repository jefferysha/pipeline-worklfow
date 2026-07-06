import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' —— 相对资源路径，令产物无论被 server 挂在 / 还是 /app/ 皆可同源加载
// （CSP 严格同源：/api/* 用绝对同源路径 fetch/EventSource，静态资源用相对路径）。
// 见 packages/server GET / 同源 token 注入（#25）；产物如何交 server 见 README 接线清单（#26 报告）。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // 本地 dev：把 /api 代理到全局 server（生产由 server 同源提供，不经此代理）。
    proxy: {
      '/api': { target: 'http://127.0.0.1:8765', changeOrigin: true },
    },
  },
})
