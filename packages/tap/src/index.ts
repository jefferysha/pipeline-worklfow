/**
 * @pipeline-lite/tap —— tap 流量代理核心（GOAL A7 / BACKLOG #34 + #34e）。
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
 * 后续: dashboard 数据端(#34d)。
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
