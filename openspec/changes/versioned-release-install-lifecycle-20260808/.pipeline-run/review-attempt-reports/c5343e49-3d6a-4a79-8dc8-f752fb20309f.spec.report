# 版本化发布安装生命周期 · Verify Attempt 3

## 结论

Attempt `c5343e49-3d6a-4a79-8dc8-f752fb20309f` 审查唯一冻结候选
`workspace:sha256:be20ce0b4075cd9abc96262b393e0b36c362aad024b7a02d55d31dd7a8c77345`。
`standards`、`spec`、`e2e` 是同一次 Review 的聚合 lanes；本次为已配置上限 `3` 次中的第 `3` 次，
不允许创建第 4 次 Review attempt。

三条 lane 均 **pass**。主线程对最终补丁与整条发布链复核后，未发现剩余 Critical、High 或 Medium；
候选可以进入 Ship、PR、合并及受控 workflow 创建的 `v1.0.2` 稳定 Release。公网安装和真实本机插件
替换仍必须等 Release 已发布且 public acceptance workflow 通过后执行。

## Standards lane — pass

- 最终补丁只放宽 Codex host 的安全 `// @exec:` output-budget pragma；pragma 与实际 exec 参数仍只接受
  闭集键，`max_output_tokens` 必须为正的 safe integer，可信 Skill 输出仍按完整字节逐项比对。新增正例与
  截断负例均通过，不能用合法 pragma 把不完整输出升级为 receipt。
- `git diff --check HEAD` 通过；真实 implementation workspace 在 Review 前后均精确等于冻结候选。
- `check:comments`、`check:architecture`（845 个生产文件）、identity、release-workflows（26/26）、docs、
  default-workflow freshness、npx/package、skills、N-1 bundle（32/32）和严格 OpenSpec 门均通过。
- Build 阶段在真实候选根连续两次构建，受控 CLI/server/Dashboard dist 聚合哈希均为
  `897dd85314a27f7804d8e82728f53dd0f834b3c98666f2b2417e5d72cdd57573`。Verify 临时快照使用指向真实
  仓库的 `node_modules` symlink，后续重建会让 esbuild 把绝对解析路径写进 bundle 注释/内部模块名；该
  环境性产物未回写真实候选，也未被当作 freshness 证据。
- Review 次数是 Workflow/Pipeline 可配置的持久预算；code/spec/security/E2E/browser 只作为同一候选
  attempt 的 lanes，不重复扣次。此次预算已耗尽，后续 CI/Ship 门不得解释成新的 Review 循环。

## Spec lane — pass

- `openspec validate versioned-release-install-lifecycle-20260808 --strict` 通过。
- 隔离归档演练目录：`/tmp/tenon-archive-rehearsal.AD7Umm/repo`。
- `openspec show --json --deltas-only` 成功；隔离 `openspec archive --yes --json` 汇总 added=21、
  modified=5、removed=0、renamed=0；归档后 `openspec validate --all --strict` 为 42/42。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 保持
  `62b3499f5a698626dd7029b4ae0265cc6481bde3a33a0e3a41b0d5baca383064`，Verify 未写主规格。
- 最终补丁映射到 `codex-skill-receipt-current-turn`；完整 Change 继续覆盖版本化发布、plugin distribution、
  runtime/launcher、Dashboard、host target plan、可信可执行文件、N-1 bridge、文档与 review-attempt-budget。

## E2E lane — pass

- 定向回归：`codexToolProgram.test.ts` + `codexSkillReceipt.test.ts` 共 169/169，exit 0。
- Core：381/381 test files，6685 passed，27 个有明确条件的 skipped，exit 0。
- Dashboard/Web：98/98 test files，1741 passed，exit 0。第一次从 npm workspace 子目录启动时，
  `designSystem.test.tsx` 因测试显式要求仓库根 cwd 报 ENOENT；改用仓库声明的根级 Vitest config 后全绿，
  属验证命令 cwd 错误，不是产品或候选失败。
- Local clean install + repeat：exit 0，releaseId
  `sha256-7614d75f33d3bca0d9ecb81c8136bba87279e4b19cd08a5598d927ad52a6b840`，Dashboard port 55440，
  重复安装复用 PID 1238，hookTrust=`untrusted`；脚本完成后隔离进程与 listener 均清理。
- 当前 Dashboard 资产浏览器检查：页面标题为 `Tenon Dashboard`，主导航与“宿主目标计划”可达，
  `/api/health` 返回 `ok=true`、`version=1.0.2`，console error/warning 为 0。隔离端口 55441 已停止，
  截图保存在仓库外 `/tmp/tenon-final-verify-host-plan.png`。

## 冻结与未执行项

- 真实候选在最终报告写入前再次计算为
  `workspace:sha256:be20ce0b4075cd9abc96262b393e0b36c362aad024b7a02d55d31dd7a8c77345`；raw status 指纹仍为
  `c8c247ef69221ffbff946dcd64bba72824e85ea1bcb1d4b178599fcdc9671457`。
- `v1.0.2` tag/Release 在 Verify 时尚不存在，因此未触碰真实 v1.0.1/local 插件。Ship 必须先通过受控
  workflow 发布 immutable Release，再运行公网 clean install/repeat/update，最后才执行真实卸载和版本化重装。

## Verdict

`standards=pass`、`spec=pass`、`e2e=pass`；聚合结果 `pass`。这是有限 Review 3/3 的最终 verdict。
