# EXTERNAL-SKILLS — 外部 skill 依赖显式清单（CONTRACT §5.7）

本插件引用的所有**非本仓** skill 必须在下方「已声明依赖」中列出（每行 `- <plugin>:<skill>`
或 `- <skill>`）。`tools/verify-skills.sh` 会扫描 `skills/**/SKILL.md`、`hooks/hooks.json`、
`templates/manifest.yaml` 中形如 `external-skill: <名字>` 的引用，未在本清单声明者
→ 安装/CI **硬失败并逐条列出**——不允许运行时才发现「skill 找不到」
（老内核靠 manifest 选装外部 skills 曾出现此坑，本仓封死）。

安装/CI 校验命令：

```bash
bash tools/verify-skills.sh          # 全量校验（路径存在 + 脚本可执行 + SKILL.md + 外部依赖声明）
bash tools/verify-skills.sh --quiet  # 静默模式（SessionStart hook 使用；仅失败时输出）
```

## 已声明依赖

（当前无外部 skill 依赖）
