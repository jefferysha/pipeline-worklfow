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
 * 后续: ws_reconstruct/bedrock/certs(#34b) · 多 runtime clients(#34c) · dashboard 数据端(#34d)。
 */
export * from './paths.js'
export * from './record.js'
export * from './trace-store.js'
export * from './security.js'
export * from './capture-proxy.js'
export * from './forward-proxy.js'
export * from './daemon.js'
