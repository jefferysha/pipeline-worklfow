# 设计

## 初始假设

已验证：server 持有并用 dev/ino 验证 Change 目录句柄，可把该身份作为窄能力传给 kernel；kernel 仅对显式 anchored 入口允许父目录 FD alias，leaf 仍按普通文件 no-follow 读取。CI 失败日志、现有锚点链和 23 个定向测试支持该结论。

## 风险

- 能力参数被普通调用方滥用而放宽任意目录 symlink。
- FD alias 在读取期间重定向，或 leaf 被替换后仍返回内容。
- 源码与 tracked bundles 漂移。

## 待验证问题

- Linux `/proc/self/fd/<n>/.` 的 lstat/dev/ino 是否稳定绑定到已打开目录。
- 错误身份、父目录 realpath 变化、leaf symlink/身份变化是否全部失败关闭。
- 公开选项是否仅暴露 server 集成所需的最小能力。

## Explore 结论

采用显式 `{ dev, ino }` anchored-directory capability；通用入口不变，server 只在持有并验证 FD 的生命周期内传递。保留 parent identity/realpath 与 leaf no-follow/identity 的读前、读中、读后栅栏。拒绝真实路径回退、全局放宽 symlink 和 native addon 三种扩大风险或范围的方案。详细证据见 `docs/superpowers/specs/skill-invocation-fd-anchor-linux-design.md` 与 ADR。
