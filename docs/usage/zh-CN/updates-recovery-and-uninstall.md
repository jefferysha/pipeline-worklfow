# 更新、恢复与卸载

Pipeline Lite 把插件 release 与项目 Change 分离。更新切换已验证的不可变 release，不改写项目证据。

## 目标

安全完成宿主指定更新、运行时修复或回滚；必要时恢复一个明确 Change；卸载时只删除插件拥有的用户级资产，并保留用户仓库里的 Change、Archive 和自定义配置。

## 前置条件

- 知道当前安装宿主是 Codex 还是 Claude Code；
- 能运行 `pipeline doctor` 和 `pipeline runtime status`；
- 更新前保存当前错误、active release 和项目状态；
- 不在运行中的 Build/Verify 中途手工替换项目证据；
- 外部发布或删除用户数据仍需要独立授权。

## 步骤

### 1. 更新指定宿主

```bash
pipeline update --codex
```

或：

```bash
pipeline update --claude
```

自动更新必须保留版本、失败原因和回滚路径。新模板只影响之后创建或明确缺失的文档。

### 2. 检查更新结果

```bash
pipeline doctor
pipeline runtime status
```

受管 launcher 指向内容寻址 release。不要直接覆盖当前 payload；完整下载、校验和激活应在切换指针前完成。

### 3. 受控修复与回滚

```bash
pipeline runtime status
pipeline runtime repair
pipeline runtime repair --rollback
```

repair 处理 launcher、release 或激活指针，不等于重置项目状态。文档语言固定在独立、旧 runtime 不会重写的 Change sidecar 中，因此 rollback 不需要让旧 canonical codec 理解新 locale 字段。

### 4. 恢复明确 Change

```bash
pipeline list --json
pipeline status <change> --json
pipeline session activate <change>
pipeline document status <change>
```

只有明确选择 Change 才恢复。多个候选不能按 mtime 猜测；独立新目标应创建新 Change。

### 5. 卸载宿主集成

```bash
pipeline uninstall --codex
```

卸载 scrubber 只删除自己拥有且未被用户修改的资产。项目内 Change、Archive、OpenSpec、ADR 和用户自定义 Workflow 默认保留。

## 更新不应修改什么

- `openspec/changes` 已有 Markdown；
- Archive；
- `.pipeline-documents.json` digest/read receipt；
- `.pipeline-document-locale.json` 的固定语言；
- 项目自定义 Workflow/Track；
- 用户数据、token 和凭证。

## 预期结果

- 更新成功后 launcher 指向完整、已校验的新 release；
- 更新失败时旧 release 仍可运行；
- rollback 后旧 runtime 能读取原 canonical state；
- 已有 Change 文档字节和 digest 不变；
- 新会话加载新的 skills/hooks，旧会话不被误报为已热更新；
- 卸载后用户仓库证据仍在。

## 验证

```bash
pipeline doctor
pipeline runtime status
pipeline list --json
pipeline status <change> --json
```

重新打开宿主会话，并核对 CLI、skills、hooks、Dashboard 和项目状态。对自动更新还要在干净临时目录验证首次安装、升级、失败回滚和重复执行幂等性。

## 常见失败

- `pipeline update` 未指定宿主：改用 `--codex` 或 `--claude`；
- 更新后旧会话仍使用旧 Skill：关闭并新开会话；
- runtime repair 之后 Change 消失：检查项目根，不要把 runtime 修复和项目删除混为一谈；
- rollback 报 canonical 未知字段：新元数据不应进入旧 codec 的严格闭集，修复发行兼容缺陷；
- 卸载删除了用户修改文件：ownership/hash 逻辑有缺陷，应停止并恢复备份；
- 更新后文档被自动翻译：这是不允许的历史改写，应回滚并报告。

## 下一步

若问题仍存在，按[故障排查](./troubleshooting.md)采集最小事实面；安全问题使用私密漏洞报告。
