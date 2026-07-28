# Comet `--platform` 宿主目标调研

> 日期：2026-07-28
> 范围：仅核对 `rpamis/comet` 的一手 Git 历史、固定提交源码、PR #227 与 GitHub Release/Tag
> 基线：`0.4.0-beta.9` / `84038b0d6b7c185b233f0f36b294ae74dd9121d0`
> 研究点：`master` / `2945693e4061c369be0d400ed2999a66fa87c680`
> 边界：只记录外部实现事实，不替 Tenon 选择产品范围、API 形态或 UI 方案

## 一句话定位

Comet PR #227 把原先由检测/交互得到的平台集合补充为一个显式的单目标入口：
`comet init` 与 `comet update` 都接受 `--platform`，共享同一套目标解析规则，并把“已注册平台”
与“仅限 project scope 的保守 custom target”区分开。

## 固定版本与合并事实

截至 2026-07-28，一手 Git 远端显示 `origin/master` 正是
[`2945693e4061c369be0d400ed2999a66fa87c680`](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680)。
该提交标题为 `feat: add platform target option to init and update (#227)`；父提交是
`888df8a00c0cedb664de84426d25b520b32cafa8`。GitHub
[`PR #227`](https://github.com/rpamis/comet/pull/227) 显示它在 2026-07-26 合并到 `master`，
merge commit 即上述 SHA。

逐字证据（本次 clone 后的 Git 对象）：

```text
$ git rev-parse origin/master
2945693e4061c369be0d400ed2999a66fa87c680

$ git show -s --format='%H%n%P%n%ad%n%s' --date=iso-strict 2945693e...
2945693e4061c369be0d400ed2999a66fa87c680
888df8a00c0cedb664de84426d25b520b32cafa8
2026-07-26T20:19:37+08:00
feat: add platform target option to init and update (#227)
```

出处：[`rpamis/comet@2945693`](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680)；
[`PR #227`](https://github.com/rpamis/comet/pull/227)。

`0.4.0-beta.9` tag 直接指向
[`84038b0d6b7c185b233f0f36b294ae74dd9121d0`](https://github.com/rpamis/comet/commit/84038b0d6b7c185b233f0f36b294ae74dd9121d0)。
从该 tag 到研究点共有三个提交：一个 `--platform` 功能提交、一个 website 子模块指针更新和一个微信图片更新。
因此，“相对 beta.9 唯一实质功能是 `init/update --platform`”在**产品功能 / changelog**
口径下成立；它不表示只有两个文件变化，也不排除该功能所需的校验、语言映射、测试、文档和版本元数据。

```text
$ git log --oneline 0.4.0-beta.9..2945693e...
2945693 feat: add platform target option to init and update (#227)
888df8a docs: update website
ff4b444 docs: update wechat

$ git show --stat --oneline 888df8a
888df8a docs: update website
 website | 2 +-

$ git show --stat --oneline ff4b444
ff4b444 docs: update wechat
 img/wechat.png | Bin 64893 -> 132678 bytes
```

出处：[`0.4.0-beta.9...2945693 compare`](https://github.com/rpamis/comet/compare/0.4.0-beta.9...2945693e4061c369be0d400ed2999a66fa87c680)。

Changelog 也只为 beta.10 声明一个 Added 项：

```markdown
## What's Changed [0.4.0-beta.10] - 2026-07-26

### Added

- **Explicit platform targeting**: `comet init` and `comet update` now accept
  `--platform <platform>` to initialize or refresh one registered platform,
  or a project-scoped custom platform such as `.test`, while preserving
  workflow-scoped asset installation and the existing detection fallback
  when the option is omitted.
```

出处：
[`CHANGELOG.md:5-10@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/CHANGELOG.md#L5-L10)。

## 竞品深挖：目标解析契约

### 定位与差异化

`resolvePlatformTarget` 是 PR #227 的最窄共享契约。输入只有 `platformId` 与 `scope`，输出是
`{ platform, native }`：

- 命中 `PLATFORMS` 注册表时，返回原注册对象并标记 `native: true`；
- 未命中时，仅允许 project scope，并合成固定的保守描述符；
- global scope 的未知 ID 直接报错；
- ID 会先 `trim`，空值与不符合小写字母/数字/连字符规则的值直接报错。

```ts
export function resolvePlatformTarget(
  platformId: string,
  scope: InstallScope,
): PlatformTargetResolution {
  const normalized = platformId.trim();
  if (normalized.length === 0) {
    throw new Error('--platform must be a non-empty platform id');
  }
  if (!isValidPlatformId(normalized)) {
    throw new Error('--platform must contain only lowercase letters, numbers, and hyphens');
  }

  const registered = PLATFORMS.find((platform) => platform.id === normalized);
  if (registered) {
    return { platform: registered, native: true };
  }

  if (scope === 'global') {
    throw new Error('custom --platform targets are only supported with project scope');
  }

  return {
    platform: {
      id: normalized,
      name: normalized,
      skillsDir: `.${normalized}`,
      openspecToolId: normalized,
      rulesDir: 'rules',
      rulesFormat: 'md',
      supportsHooks: true,
      hookFormat: 'claude-code',
    },
    native: false,
  };
}
```

出处：
[`platform/install/platform-targets.ts:9-43@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platform-targets.ts#L9-L43)。

ID 规则并非注释约定，而是注册表模块导出的同一验证函数：

```ts
const PLATFORM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isValidPlatformId(platformId: string): boolean {
  return PLATFORM_ID_PATTERN.test(platformId);
}
```

出处：
[`platform/install/platforms.ts:44-48@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platforms.ts#L44-L48)。

### CLI 暴露面

两个命令各自增加一个单值 option；`scope` 仍只有 `global` 与 `project`：

```ts
program
  .command('init [path]')
  .description('Initialize Comet workflow in your project')
  .option('--yes', 'Auto-install missing components, skip existing')
  .option('--skip-existing', 'Never overwrite existing components')
  .option('--overwrite', 'Overwrite manifest-managed files')
  .option('--json', 'Output as JSON')
  .option('--platform <platform>', 'Platform target to initialize')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
```

```ts
program
  .command('update [path]')
  .description('Update comet skill files to latest version')
  .option('--json', 'Output as JSON')
  .option('--platform <platform>', 'Platform target to update')
  .addOption(new Option('--language <lang>', 'Language for skills').choices(['en', 'zh']))
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--all-projects', 'Update all indexed project-scope Comet installs')
  .option('--current-project', 'Update only the current project')
```

出处：
[`app/cli/index.ts:66-75@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/cli/index.ts#L66-L75)；
[`app/cli/index.ts:153-161@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/cli/index.ts#L153-L161)。

### `init` 的显式目标与既有选择路径

`init` 有 `--platform` 时只解析一个目标；没有时仍走原有检测/选择流程，并把注册平台标为 native。
后续 plan 保留 `native` 标志；例如 Classic 的 OpenSpec / Superpowers 检查只对 native target 执行。

```ts
const selectedPlatformTargets: PlatformTargetResolution[] = options.platform
  ? [resolvePlatformTarget(options.platform, scope)]
  : (await selectPlatforms(detected, options, lang)).map((platformId) => ({
      platform: PLATFORMS.find((platform) => platform.id === platformId)!,
      native: true,
    }));
const selectedPlatformIds = selectedPlatformTargets.map((target) => target.platform.id);
if (selectedPlatformTargets.length === 0) {
  // existing no-platforms handling
}

const selectedPlatforms = selectedPlatformTargets.map((target) => target.platform);
const baseDir = getBaseDir(scope, projectPath);
```

```ts
for (const target of selectedPlatformTargets) {
  const { platform, native } = target;
  const hasOS =
    native && includesWorkflow(workflowSelection, 'classic')
      ? await hasSkills(baseDir, platform, 'openspec', selectedPlatforms, scope)
      : false;
  const hasSP =
    native && includesWorkflow(workflowSelection, 'classic')
      ? await hasSkills(baseDir, platform, 'superpowers', selectedPlatforms, scope)
      : false;
```

出处：
[`app/commands/init.ts:506-545@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/init.ts#L506-L545)；
[`app/commands/init.ts:557-566@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/init.ts#L557-L566)。

### `update` 的显式目标与既有检测路径

`update` 有 `--platform` 时按目标 scope 解析并尝试继承已安装目标/项目配置的语言；没有时继续检测所有
已安装目标。它还显式拒绝 `--platform` 与 `--all-projects` 组合。

```ts
const targets = options.platform
  ? await Promise.all(
      (options.targetScopes ?? [options.scope ?? 'project']).map(async (scope) => {
        const existing = options.language
          ? null
          : (
              await detectInstalledCometTargets(projectPath, {
                scopes: [scope],
                respectDetectionPaths: scope === 'project' && options.scope === undefined,
              })
            ).find((candidate) => candidate.platform.id === options.platform);
        const fallbackLanguage =
          existing?.language ??
          (scope === 'project'
            ? artifactLanguageToSkillLanguage(projectConfig?.native.language)
            : 'en');
        const target = resolvePlatformTarget(options.platform!, scope);
        return {
          scope,
          platform: target.platform,
          language: resolveTargetLanguage(options.language, fallbackLanguage),
        };
      }),
    )
  : await detectInstalledCometTargets(projectPath, {
      scopes: options.targetScopes ?? (options.scope ? [options.scope] : undefined),
      respectDetectionPaths: options.scope === undefined,
    });
```

```ts
assertProjectScopeOptions(options);
if (options.platform && options.allProjects) {
  throw new Error('--platform cannot be combined with --all-projects');
}
const registryProjects = await listProjectRegistryEntries({ strict: true });
```

出处：
[`app/commands/update.ts:1237-1264@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/update.ts#L1237-L1264)；
[`app/commands/update.ts:1896-1900@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/update.ts#L1896-L1900)。

### 测试表达的边界

共享 resolver 的测试把 registered、project custom、空值、非法 ID 与 global custom 五类行为固定下来。
其中 custom target 的 `.test` 路径、rules 与 hook 默认值是显式断言，不是从 README 推测。

```ts
it('returns a registered native platform by id', () => {
  const codex = PLATFORMS.find((platform) => platform.id === 'codex')!;

  expect(resolvePlatformTarget('codex', 'project')).toEqual({
    platform: codex,
    native: true,
  });
});

it('creates a conservative project-scoped custom platform', () => {
  expect(resolvePlatformTarget('test', 'project')).toEqual({
    native: false,
    platform: {
      id: 'test',
      name: 'test',
      skillsDir: '.test',
      openspecToolId: 'test',
      rulesDir: 'rules',
      rulesFormat: 'md',
      supportsHooks: true,
      hookFormat: 'claude-code',
    },
  });
});
```

```ts
it.each(['Codex', 'codex_cli', 'codex.cli', 'codex/cli'])(
  'rejects malformed platform id %s',
  (platformId) => {
    expect(() => resolvePlatformTarget(platformId, 'project')).toThrow(
      '--platform must contain only lowercase letters, numbers, and hyphens',
    );
  },
);

it('rejects global custom platform targets', () => {
  expect(() => resolvePlatformTarget('test', 'global')).toThrow(
    'custom --platform targets are only supported with project scope',
  );
});
```

出处：
[`test/platform/platform-targets.test.ts:5-29@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/platform/platform-targets.test.ts#L5-L29)；
[`test/platform/platform-targets.test.ts:37-50@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/platform/platform-targets.test.ts#L37-L50)。

## beta.9 与研究点差异矩阵

| 维度 | `0.4.0-beta.9` | `2945693` / package beta.10 | 一手事实含义 |
| --- | --- | --- | --- |
| `init` 目标来源 | 检测/交互选择注册平台 | 新增单值 `--platform`；省略时保留旧路径 | 显式路径是增量，不替换检测 fallback |
| `update` 目标来源 | 检测已安装目标 | 新增单值 `--platform`；省略时保留旧路径 | 可以定向一个目标；不能与 `--all-projects` 组合 |
| 注册平台 | 来自 `PLATFORMS` | resolver 返回同一注册对象，`native: true` | 没有复制另一份注册表 |
| 未注册 ID | 无这个显式入口 | project scope 合成 `.<id>` target，`native: false` | custom 是固定默认描述符，不是任意路径输入 |
| global custom | 无这个显式入口 | 显式拒绝 | global 不会为未知 ID 合成目录 |
| 发布元数据 | package/tag/release 均为 beta.9 | package/changelog/manifest 是 beta.10 | 源码版本已前移 |
| Git tag / GitHub Release | beta.9 已发布 | 截至调研时没有 beta.10 tag/release | `master` 的 beta.10 不能写成已发布版本 |

## beta.10 未打 tag 的一手核对

固定提交的 `package.json` 声明 `0.4.0-beta.10`：

```json
{
  "name": "@rpamis/comet",
  "version": "0.4.0-beta.10",
  "description": "Agent Skill Harness For Turning Ideas Into Evaluated Workflows",
  "keywords": [
    "comet",
    "openspec",
    "superpowers",
    "skills",
    "workflow"
  ],
  "license": "MIT"
}
```

出处：
[`package.json:1-12@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/package.json#L1-L12)。

但远端 tag 查询只有 beta.9，`git tag --contains 2945693...` 也为空；GitHub Releases 首项仍是 beta.9。
这是“源码 package 是未打 tag 的 beta.10”的直接依据。

```text
$ git ls-remote --tags https://github.com/rpamis/comet.git \
    refs/tags/0.4.0-beta.10 refs/tags/0.4.0-beta.9
84038b0d6b7c185b233f0f36b294ae74dd9121d0	refs/tags/0.4.0-beta.9

$ git tag --contains 2945693e4061c369be0d400ed2999a66fa87c680
(no output)

$ GitHub Releases API (first item)
0.4.0-beta.9  2026-07-24T16:55:25Z
```

出处：[`Git tags`](https://github.com/rpamis/comet/tags)；
[`GitHub Releases`](https://github.com/rpamis/comet/releases)；
[`0.4.0-beta.9 release`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9)。

## 可吸取的灵感清单（只映射决策点）

以下不是对 Tenon 的产品选择，只是 Comet 证据能支持主线讨论的决策点：

1. **共享解析契约还是命令内各自解析**：Comet 把 `init` / `update` 共用的 ID、注册表与 scope 规则收敛到
   `resolvePlatformTarget`；主线需决定 Tenon 是否也需要单一 DTO/解析边界。
2. **显式目标与自动检测的关系**：Comet 让显式目标覆盖本次目标选择，但省略 option 时保留旧检测；
   主线需定义 Tenon 的计划 API 是否同样保持现有默认行为。
3. **注册目标与 custom target 的信任边界**：Comet 允许 project custom、拒绝 global custom；
   主线需单独决定 Tenon P1 是否开放 custom，而不能从 Comet 的选择自动推出。
4. **目标描述符中的能力信息**：Comet custom target 会假定 rules 与 Claude Code 风格 hooks；
   主线需决定计划预览是展示“声明能力”“探测能力”还是二者及其差异。
5. **互斥参数的错误位置**：Comet 在进入 update 主流程前拒绝 `--platform + --all-projects`；
   主线需定义同类组合是在共享契约层还是 server/CLI 入口层报错。

## 市场空白与风险

| 严重度 | 事实或风险 | 一手依据 |
| --- | --- | --- |
| 高 | 未打 tag 的 `master` 行为可能继续变化；不能把 beta.10 当作稳定发布契约 | package 为 beta.10，但远端 tag/release 仍停在 beta.9 |
| 高 | custom target 自动赋予 `supportsHooks: true` 和 `hookFormat: claude-code`；这是一组实现默认，不等于宿主真实能力探测 | `platform-targets.ts:30-40` |
| 中 | `init` / `update` 的“显式目标”仍进入各自不同的执行规划；resolver 只统一目标，不统一副作用计划 | `init.ts:506-566` 与 `update.ts:1237-1264` |
| 中 | registered/custom 的关键差异通过 `native` 布尔值传播；后续消费者必须正确保留它，否则 Classic 资产边界可能漂移 | `init.ts:557-566` |
| 中 | update 的显式目标会结合已检测语言或 project config 选择 fallback；“目标 ID 相同”不代表计划完全由 ID 决定 | `update.ts:1237-1258` |
| 低 | PR 描述列出的 full test 当时仍有两个“unrelated existing”失败；报告没有复跑 Comet 测试，不能把 PR 测试计划当作本地通过证据 | PR #227 Notes |

Comet 仓库的固定提交 `package.json` 声明 MIT；这只是许可证事实，不构成对复制具体实现的建议。

```json
{
  "name": "@rpamis/comet",
  "version": "0.4.0-beta.10",
  "description": "Agent Skill Harness For Turning Ideas Into Evaluated Workflows",
  "keywords": [
    "comet",
    "openspec",
    "superpowers",
    "skills",
    "workflow"
  ],
  "license": "MIT"
}
```

出处：
[`package.json:1-12@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/package.json#L1-L12)；
[`LICENSE@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/LICENSE)。

## 来源

- [`rpamis/comet` commit `2945693e4061c369be0d400ed2999a66fa87c680`](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680)
- [`rpamis/comet` PR #227](https://github.com/rpamis/comet/pull/227)
- [`0.4.0-beta.9...2945693` compare](https://github.com/rpamis/comet/compare/0.4.0-beta.9...2945693e4061c369be0d400ed2999a66fa87c680)
- [`0.4.0-beta.9` release](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9)
- [`0.4.0-beta.9` baseline commit `84038b0`](https://github.com/rpamis/comet/commit/84038b0d6b7c185b233f0f36b294ae74dd9121d0)
- [`platform/install/platform-targets.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platform-targets.ts)
- [`platform/install/platforms.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platforms.ts)
- [`app/commands/init.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/init.ts)
- [`app/commands/update.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/update.ts)
- [`app/cli/index.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/cli/index.ts)
- [`test/platform/platform-targets.test.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/platform/platform-targets.test.ts)
- [`CHANGELOG.md@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/CHANGELOG.md)
- [`package.json@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/package.json)
- [`GitHub tags`](https://github.com/rpamis/comet/tags)
- [`GitHub releases`](https://github.com/rpamis/comet/releases)

## 本报告未回答、必须由主线决断的开放问题

1. Tenon P1 是否只允许已注册宿主，还是允许类似 Comet 的 project-scope custom target？
2. 如果只做只读计划，目标 DTO 应表达“宿主声明能力”“当前环境探测结果”还是二者并存？
3. setup 与 update 是否共享一个计划 schema，还是需要共享 envelope 加操作特有步骤？
4. Dashboard/server 遇到未知宿主、未知操作和不兼容能力时，错误应在哪一层定型并对外稳定？
5. 显式选择目标后，Tenon 是否仍需要展示自动检测 fallback 的结果，还是仅展示用户选择的单目标计划？
