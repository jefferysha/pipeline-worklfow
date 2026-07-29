# Prompt Routing Bypass UI 评修记录

## 第一轮：frontend-design / web-design-guidelines / design-taste-frontend

运行目标：当前 worktree 构建的 `Tenon Dashboard`，Workbench → default workflow →
UserPromptSubmit。

### 问题清单

| 严重度 | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| MEDIUM | 375px 窄屏英文文案使 HookRows 按内容宽度撑到视口外 | 英文用户需要横向滚动才能完整看到保存按钮 | 在移动断点令 HookRows `w-full`，并将开关/说明纵排以使用父卡可用宽度 |
| LOW | 首次构建有 Vite 单 chunk 大于 500kB 警告 | 本切片未新增重依赖，首屏功能可用；属于既有 bundle 优化项 | 记录，不扩大本 Change |

第一轮已验证：

- 标题为 `Tenon Dashboard`，URL 精确绑定当前 bfb9 worktree 项目根。
- 默认值、Enter 保存、非法输入 alert、保存失败保留草稿、重试成功、关闭后空值保存均真实可操作。
- switch → textbox → submit button 的 Tab 顺序正确；label/role/status/alert 可由 accessibility tree 读取。
- 中文 1200px 与 375px 状态层级清楚；console 0 error / 0 warning，真实 Hook API 请求 200。

## 第二轮复评（首个 Build baseline）

- 375px 中英文下 HookRows 与旁路词表单均限制在父卡可用宽度，输入与保存按钮纵排，无横向溢出。
- 1440px 桌面下控件保持单行，提示、操作与状态层级不抢 Hook 主列表。
- 无 critical / high / medium 遗留。

## Verify 反馈修复轮

首轮 Verify 的 agent reviewer、Codex review 与 visual review 汇总出 5 个 MEDIUM：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| MEDIUM | shell 行扫描会接受嵌套、重复或截断的 `prompt_skip_keyword` | 改为纯 Bash 顶层 canonical 结构解析；异常配置安全回退 `no-tenon` |
| MEDIUM | `/api/hooks` 加载失败仍显示为 loading | UserPromptSubmit 行显示 `role=alert`，其他行保持 `—` |
| MEDIUM | 持久化空值重载后没有明确 disabled 状态 | `promptSkipKeyword === ''` 时始终显示禁用状态 |
| MEDIUM | 切换项目 root 时，旧 root 的迟到保存可覆盖新 root 状态 | 用 root generation 隔离迟到 success / error / finally |
| MEDIUM | 11px 成功状态使用 `text-green`，对比度不足 | 改用 `text-green-d`；实测 `rgb(21, 128, 61)` 对 `rgb(248, 250, 252)` 为 4.79:1 |

修复遵循红绿重构：Dashboard 新增加载错误、初始禁用、迟到成功和迟到失败用例；hooks 新增嵌套、
重复和截断配置用例。红态分别为 4 个与 3 个预期失败，修复后定向用例全绿。

## 第三轮复评（Verify 回退后的 Build）

- 当前服务来自 bfb9 worktree，页面标题为 `Tenon Dashboard`，URL root 精确指向该 worktree。
- 真实浏览器覆盖 Enter 保存、非法值 alert、注入 500、重试成功、禁用保存后重载、恢复默认值。
- 键盘顺序为 switch → textbox → submit；375px 中英文与 1440px 中文均无页面横向溢出。
- 新标签页复核 console 0 error / 0 warning；所有目标 API 请求为 200。
- 无 critical / high / medium 遗留。

## 冻结前全量收敛复审

独立 Reviewer 在首次修复后仍发现 2 个 MEDIUM，并在 Build 内闭环：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| MEDIUM | matrix 末项 trailing comma 或 key 后附加 token 仍可能被 Bash 行解析器接受 | 用独立的“逗号后必须还有下一项”状态，并把提取后的 key 重构成完整 canonical 行做精确比较；补两条反例 |
| MEDIUM | Hook 配置 loading 文案硬编码中文 | 增加 `hk_config_loading` 中英文键，英文 pending GET 用例断言 4 个节点均无中文泄漏 |

修复后重新执行 Hook 全量、Dashboard 50 文件 / 971 用例、typecheck、生产 build、架构检查与
Oracle 双跑，均通过。全仓 `npm test` 首轮因资源竞争出现 2 个未改动 CLI 时序失败；精确复跑
相关 2 文件 / 27 用例全部通过，波动将在最终 Verify 报告中保留。Reviewer 重新覆盖完整 diff，
结论为无 critical / high / medium。

## 第二次 Verify 回退修复

第二次冻结审查确认 3 个 MEDIUM 与 1 个 LOW，均已在本次 Build 中闭环：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| MEDIUM | 清空草稿会隐式关闭开关并禁用输入，阻断“全选删除后直接输入” | 将显式启用状态与草稿内容分离；只有用户操作 switch 才禁用控件，并补 clear → type → Enter 回归 |
| MEDIUM | 同 root 切换语言会重跑 GET 并重置 generation/busy，可能覆盖进行中的 POST | 数据请求只依赖 root；翻译函数用 ref 读取当前 locale，语言切换不再制造请求竞态 |
| MEDIUM | server 的通用 JSON 解析会接受 Bash canonical parser 拒绝的重复、额外或重排字段 | server 改用与 Bash 同构的 canonical parser；重复、额外、重排整体回退默认值，并补 CRLF/外层空白/无末尾换行 parity |
| MEDIUM | `matrix` 内重复 key 仍被 Bash 接受、但被 server canonical 比较拒绝 | Bash 以 Bash 3.2 兼容的分隔集合拒绝重复 matrix key；两侧加入相同 fixture，红态 494/1 后绿态 495/0 |
| LOW | 提示没有明确标点和路径分隔符也是边界 | 中英文文案加入标点、路径分隔符与 `path/no-tenon.md` 示例 |

新测试先在旧实现上分别观察到预期失败，再修复至 server 24/24、Dashboard 18/18、hooks
495/495。全量 `npm test` 首轮出现未改动临时目录竞态，精确复跑 32/32，通过后独立全量重跑为
315/315 files、5406 pass、5 skip；`npm run test:web` 独立重跑为 50/50 files、975 tests。

## 第三次 Verify 回退修复

第三次冻结审查的 1 个 HIGH、3 个 MEDIUM 与 2 个 LOW 均已闭环：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| HIGH | 项目可控 `hooks.json` 可借 symlink、FIFO 或超大文件阻塞读取 | server 使用 `O_NOFOLLOW`、同一 fd 的 `fstat` 与 4097-byte 有界读取；Bash 在打开前拒绝 symlink/非普通文件并限制 4096 bytes；新增 symlink、目录、超限和 FIFO 回归 |
| MEDIUM | 两个 writer 无跨进程锁，read-modify-rename 会丢字段 | 复用 kernel `withLock(.pipeline)`，锁内重读并异步原子写；真实 holder/writer 双进程 barrier 证明 matrix 与 keyword 互保 |
| MEDIUM | Bash 复制完整 JSON/matrix codec | 收敛为仅解析固定 version/keyword header，matrix 损坏独立降级；hooks 498/498 |
| MEDIUM | 英文错误态可透传中文 server/network/fallback 详情 | GET 与旁路 POST 使用完整本地化错误句；覆盖 server 500、network reject 与 malformed 200 response |
| LOW | server/Bash 重复解析分支 | 共享同一三行 header 契约与相同 fixture，删除 server 全文 canonical 比较和 Bash matrix 状态机 |
| LOW | REVIEW 的历史 Hook 计数不一致 | 逐轮明确为第二次修复 495/495、第三次修复 498/498 |

红态证据：server 新增用例分别因 matrix 牵连 keyword、symlink 被跟随而失败；跨进程 writer 在
holder 释放前即退出；修复后 server 304/304（含 1 个真实跨进程用例）、Dashboard 定向 22/22、
hooks 498/498、`typecheck:web` 与生产 build 通过。

## 最新 main 重放后的冻结前复评

- 本轮起点为 `2d103e33`；远端 `main` 在 Build 期间前移到 `15fe619b`，四个本轮提交已干净重放，
  最终比较边界的 merge-base 精确等于 `origin/main`，没有夹带或回退 Codex auth 安装引导改动。
- 重放后的全仓 `npm test` 为 317/317 files、5459 pass、5 个缺外部凭据的 honest skip；
  `npm run test:web` 为 50/50 files、979/979，既有 React `act(...)` / GSAP 警告不属于本切片。
- server 定向 304/304、Dashboard 定向 22/22、hooks 498/498、adapters 272/272、bundle 31/31；
  `typecheck:web`、生产 build、identity、repository hygiene、architecture、comments、skills 全通过。
- Oracle 五个 fixture 双跑 0 处不一致；仅报告既有的 `in-place` isolation 与 PM 自动入队产品扩展。
- 独立 E2E 在 HEAD 隔离快照重跑 986/986；独立视觉轨在真实 Chromium 覆盖中英文、
  1440/375、loading/ready/error/invalid/busy/retry/success/disabled、Enter 与 Tab 路径，
  `scrollWidth=innerWidth=375`，console/pageerror 均为 0。

## 第四次冻结前审查修复

全量 Standards + Spec reviewer 阻断的 3 个 HIGH 与 2 个 MEDIUM 已在 Build 内闭环：

| 严重度 | 问题 | 修复 |
| --- | --- | --- |
| HIGH | server 在确认类型前以阻塞模式打开 FIFO | `O_NONBLOCK \| O_NOFOLLOW` 打开后在同一 fd `fstat`；子进程和真 HTTP 用例证明 FIFO 有界回退 |
| HIGH | router/breadcrumb 的旧矩阵 `grep` 与 keyword pathname 重开仍可被 FIFO/换位阻塞 | 新增共享 Bash 3.2 有界 fd 快照：读写打开避免 FIFO 阻塞、pathname/fd inode 对账、4097-byte 上限；keyword 与 matrix 复用同一快照 |
| HIGH | 写端点只做词法注册判断，且可预测 tmp 会跟随 symlink | GET/POST 改用 `workflowRootForRequest` inode 锚；拒绝 `.pipeline` symlink；随机 tmp 以 `O_EXCL \| O_NOFOLLOW` 创建并在 trusted parent 内 rename |
| MEDIUM | GET/POST 客户端只验证响应是 string | 两条响应路径复用 empty-or-ASCII-token validator，非法字符串进入本地化错误态而非假成功 |
| MEDIUM | tasks ledger 漂移 | 最终候选冻结前须以真实 `tenon-build` producer 重录并生成当前 phase read receipt；未完成前不得声明关闭 |

红态证据：server 2 files 出现 3 个预期失败；完整 breadcrumb/router 分别返回 `ETIMEDOUT`；
前端 decoder 与 POST 非法字符串各出现 1 个预期失败。修复后 server 309/309、前端定向 36/36、
hooks 502/502、`typecheck:web` 与生产 build 通过。

冻结前全量重跑为 `npm test` 317/317 files、5464 pass、5 个缺外部凭据的 honest skip；
`test:web` 50/50 files、981/981；adapters 272/272、bundle 31/31、skills 66/62/0/62，
identity、repository hygiene、architecture（619 files / 5 size-only exceptions）、comments、
diff-check 与 Oracle 五 fixture / 0 difference 全通过。

主验收浏览器精确绑定 bfb9 worktree 的 `Tenon Dashboard`，覆盖非法值本地化 alert、Enter 保存、
保存中禁用、成功恢复 `no-tenon`、英文文案与 375px 布局；移动端
`scrollWidth = clientWidth = 375`，console 0 error / 0 warning。独立代码、E2E 与视觉轨的最终结论
将在冻结前复审完成后登记；视觉 baseline 不存在，因此像素回归项保持 INCONCLUSIVE。

## 第五次冻结前审查修复

第四轮复审继续发现 `hooks-config.sh` 在初始 `stat` 后遇可写文件持续增长时，`od` 仍可能无界读取；
只读超时路径也可能在内层读取未结束时遗留子进程。修复将同一 fd 的读取改为
`dd bs=4097 count=1 <&9 | od`，再按 hex 字节流计数并拒绝超过 4096 bytes 的输入，同时保留
读取前后 fd identity/size 对账。由此，FIFO 只可能在创建任何 `dd`/`od` 子进程之前阻塞于
`exec 9<`；普通文件一旦打开，内层读取即有 4097-byte 硬上限。

新增机制回归固定同 fd 的 `dd` 上限；完整 hooks 重跑 508/508，`bash -n` 与
`git diff --check` 通过。修复后 `hooks-config.sh` SHA-256 为
`ee076f438a5c16d1285b5ddd44d1f379c1504595985b39b98469e1267f04307e`。
独立 Standards + Spec 基于该确切快照复审为 PASS：
Critical 0 / High 0 / Medium 0 / Low 0；确认持续增长有硬上限，FIFO 超时发生在创建
`stat`/`dd`/`od` 后代之前，先前 HIGH 已关闭。独立 E2E 在隔离副本复验 hooks 508/508、
server 309/309、frontend 36/36，共 853/853，Critical / High / Medium / Low 均为 0。
独立视觉轨复验中英文、1440/375、主要状态与键盘路径为 PASS，Critical / High / Medium / Low
均为 0；视觉 baseline 不存在，像素回归项继续如实记为 INCONCLUSIVE。

## 第六次冻结前审查修复

第四轮冻结后的嵌套 Standards 轨发现一个 MEDIUM：异常文件系统若让已启动的 `stat`、`dd` 或
`od` 自身阻塞，只终止 process-substitution 外壳可能遗留被重新托管的后代。该轮按
`verify-fail` exact review receipt 返回 Build，未接受偏差。

TDD 红态用 PATH 注入的伪 `stat` 创建真实阻塞后代，完整 hooks 为 508 pass / 1 fail；
修复新增 Bash 3.2 兼容的超时清理：保留外壳、由 `ps -eo pid=,ppid=` 求后代闭包，三轮先终止
后代，再终止并最佳努力 `wait` 外壳，最后最多 1 秒做 `kill -0` 有界存活轮询。绿态完整 hooks
为 509/509，阻塞后代在 hook 返回前已不再存活。

第一版进程树清理的独立全量复审又发现 PID 复用 HIGH：跨三轮保存并重复 signal 陈旧 PID，
以及把 Bash 3.2 的 `read -t` 返回 1 一律当 timeout，可能在 EOF 后误杀复用 PID。修复后在
reader 启动时固定 `ppid + lstart + comm` identity；失败时只有当前 identity 仍精确一致才执行清理，
否则按 EOF 最佳努力 `wait`。每轮只从 fresh parent-child 快照求闭包，同一 PID 最多 signal 一次，
根进程也仅在 identity 再次一致时终止。新增陈旧 descendant / sibling 与 EOF 回归，完整 hooks
为 511/511。独立 E2E 在隔离副本复验 hooks 511、server 309、frontend 36，共 856/856；
独立 Standards + Spec 对 SHA-256
`9cd1bc6866cc182c232801b2e8fddae40b458d523a56ae5be022a4badca99789` 全量复审为 PASS，
Critical 0 / High 0 / Medium 0 / Low 0，确认先前 PID reuse HIGH 已关闭。
