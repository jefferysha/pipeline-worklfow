/**
 * @tenon/tap —— tap 流量代理核心（GOAL A7 / BACKLOG #34 + #34e）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/*.py
 *   tap_daemon.py（单进程多端口）· capture_proxy.py（reverse 抓转发）· forward_proxy.py（forward/MITM）
 *   · trace_store.py（落盘）· capture_state.py（录制开关）· paths.py（路径锚）
 *
 * 安全护栏（#34e，收编前置）: tap 默认 OFF（不启动不抓）· 捕获数据只落本地 trace_store 绝不外发
 *   · tapStatus() 让 doctor 明示「正在拦截」。见 security.ts。
 *
 * 本批范围（#34 核心）: daemon 多端口 + capture/forward proxy + trace_store（JSONL）+ 安全护栏。
 * 协议面（#34b/#34c）: ws 帧重组 + bedrock eventstream + 本地 CA/TLS MITM + 多 runtime clients。
 * dashboard 数据端（#34d）在 server 侧消费本包，不在此实现: server/src/main.ts:75 注入
 *   createTraceStore() → server/src/traces.ts 出只读 GET /api/traces/sessions|records
 *   （capabilities.traffic 随注入与否如实报）→ dashboard-app 的 advanced/TrafficPanel.tsx 消费。
 */
export * from './paths.js'
export * from './record.js'
export * from './trace-store.js'
export * from './security.js'
export * from './capture-proxy.js'
export * from './forward-proxy.js'
export * from './daemon.js'
// ── #34b/#34c 协议面（只加，不改上方 #34 既有 export）──
export * from './ws-reconstruct.js'
export * from './bedrock.js'
export * from './certs.js'
export * from './clients.js'
// #34-wire：daemon 启动器编排（detectTarget + reverseEnvMap/forwardEnvMap + CertificateAuthority.fromDir）
export * from './launch.js'
// #34-wire：wss:// 升级请求真中继 + ws-reconstruct 帧重组入录（forward-proxy.ts mitmServer 消费）
export * from './ws-proxy.js'
