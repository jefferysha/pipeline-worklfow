# 架构决策记录

## 背景

Linux server 通过 `/proc/self/fd/<n>` 使用已打开的 Change 目录锚点读取 ledger；通用有界读取器把该 parent 视为 symlink/path alias 并拒绝。直接放宽通用检查会破坏现有 fail-closed 契约。

## 决策

引入显式、身份绑定的 anchored-directory 读取能力。只有调用者提供与已打开目录 `fstat` 相同的 dev/ino 时允许 parent alias；leaf 仍使用 `O_NOFOLLOW`，父目录和 leaf 在读取窗口内持续核对身份与 realpath。server 只在可遍历 FD alias 分支传递该能力，并在整个读取期间持有 FD。

## 备选方案

- 总是使用真实路径：无法保留 directory-FD 的 rename/swap 锚定优势。
- 放宽所有 parent symlink：安全边界过宽。
- native `openat`：平台与分发复杂度不符合本次窄修复。

## 后果

Linux FD alias 与现有 server 锚点兼容；默认通用读取行为、HTTP DTO、ledger 格式与写路径不变。代价是 kernel 暴露一个最小 option/capability，生产调用者必须证明身份来自仍持有的打开目录；错误或变化一律失败关闭。tracked CLI/server bundles 必须随源码更新。
