# prompt-routing-bypass 第四轮 Verify 报告（失败）

## 冻结基线

- Change：`prompt-routing-bypass`
- build SHA：`02bc54031fd7350625d46fb2b6afe7821c32aecb`
- 结论：FAIL，返回 Build 修复，不接受偏差。

## 已完成轨道

- 主 Standards + Spec reviewer：PASS，Critical 0 / High 0 / Medium 0 / Low 0。
- 独立 E2E：PASS；hooks 508/508、server 309/309、frontend 36/36，共 853/853。
- 独立浏览器与视觉：PASS；中英文、1440/375、loading/ready/error/invalid/busy/retry/
  success/disabled、Enter/Tab 路径均通过，console/pageerror 为 0。

## 阻断发现

- Medium：`hooks/hooks-config.sh` 的只读超时路径只终止 process-substitution 外壳。
  在异常文件系统让已经启动的 `stat`、`dd` 或 `od` 阻塞时，后代可能被重新托管并继续存活；
  当前没有显式、有界的后代终止与回收。
- 普通文件的 4097-byte hard bound 与 FIFO 在创建后代前阻塞的路径均已通过；该发现只针对
  外部读取命令自身异常阻塞时的清理完整性。

## 决策

持续授权下采用保守默认：不接受偏差。以 exact `verify-fail` review receipt 返回 Build，
为超时路径增加跨 Bash 3.2 / Darwin / GNU 的后代终止与有界回收，并补进程清理回归；随后重新执行
完整冻结前审查和 Verify。
