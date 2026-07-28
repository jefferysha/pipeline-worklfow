# 领域术语

- **Prompt routing bypass**：仅抑制当前 UserPromptSubmit 的 `router` 与 `breadcrumb` 输出。
- **Skip keyword**：项目级 ASCII token；独立边界命中时触发旁路。
- **独立边界**：token 两侧不是 ASCII 字母、数字、`_` 或 `-`，或位于文本首尾。
- **禁用**：持久化 keyword 为显式空字符串；不代表关闭任何 Hook 或安全门。
- **Canonical Hook config**：server 生成的 `.pipeline/hooks.json` version 1 单文件格式。
