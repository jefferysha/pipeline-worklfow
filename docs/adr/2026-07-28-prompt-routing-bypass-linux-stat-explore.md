# ADR：用能力探针统一 GNU/Darwin fd identity

## 背景

Hook 配置读取需要比较 pathname 与 `/dev/fd/9` 的 inode/size。Darwin 与 GNU `stat`
参数兼容但语义不兼容，Darwin-first 写法在 GNU/Linux 上产生 stdout 污染和 symlink identity
偏差。

## 决策

先执行 GNU `stat -Lc '%i:%s'`；失败后执行 BSD `stat -f '%i:%z'`。GNU 的 `-L`
显式解引用 `/dev/fd/N`，而 macOS 会让 GNU 探针无输出失败并进入原有 BSD 分支。

## 备选方案

- Darwin-first 加输出过滤：仍依赖解析不属于 identity 的文件系统报告。
- `uname` 平台分支：增加平台枚举与未来兼容负担。
- 放宽 pathname/fd identity：会削弱 TOCTOU 防线，不接受。

## 后果

修复仅触及异常/只读配置读取路径，无 API、格式或 UI 变化。回滚为 revert 单个 helper
变更；风险由 macOS 511 项 hook suite、Linux 非 root 最小复现和 GitHub CI 共同覆盖。
