# Issue #44 Skill provenance — Verify attempt 1

## 结论

- Change：`issue-44-skill-provenance`
- Review attempt：`c561e9be-18aa-47df-8eeb-d32852d139b0`（1/2）
- 冻结实现候选：`755cc439ab16e0409e1e4d7ea0ea3b7d63cc69c6`
- 编排起始基线：`2283992375ae5fb74b2b1ed8e1234c11ef99a1c7`（候选包含该提交）
- Tenon 1.0.2 review-budget candidate：`workspace:sha256:bb90ee43309b9b0cfce749c41569bdd935ec781f6d9bbfb8c1fcb4531122410e`
- 聚合结论：**FAIL**。E2E lane 完整通过，但 standards/spec lane 存在已确认的 fail-closed、authoring 与 portability 缺陷，不能进入 `verify-pass`。

Tenon 1.0.2 的 candidate 解析只识别 `git:<sha>` 形式，当前 `build_sha` 为裸 SHA，因此 attempt budget 退化绑定 workspace fingerprint。所有 reviewer、E2E clone 与根代理复核仍明确冻结到上述 Git commit；workspace fingerprint 只作为 1.0.2 review-budget 身份，不能替代提交证据。

## Lane 结果

| Lane | 结果 | 证据 |
| --- | --- | --- |
| standards | FAIL | 根代理逐文件 review、独立 reviewer 94/94 changed paths、Codex commit-scoped review；确认路径安全、解释器身份、symlink、error mapping、原子 authoring 等缺陷。 |
| spec | FAIL | 不满足 `skill-content-resolution` 的 no-downgrade、`skill-provenance` 的 strict/complete-set/measurement/authoring，以及 `plugin-distribution` 的 frozen-verifier 要求。 |
| e2e | PASS | exact-commit `/tmp` clone 的唯一一次完整最终门：23/23 主项通过，专项 drift/candidate/setup/OpenSpec rehearsal 通过。 |

## 已确认 findings

### P1

1. `tools/verify-skills.sh` 以环境 `PATH` 解析 `node`，未消费 release/doctor 已冻结的 `nodePath`。Candidate provenance 成功状态因而未绑定受信 verifier executable。生产调用方必须把绝对 Node 身份传入或直接以冻结 Node 执行 hidden verifier，并补 runner 身份断言。
2. `skills/<id>` 顶层 symlink 会被 `buildCanonicalManifest()` 的根级 `realpath()` 当作可信内容根；filesystem verifier 与 bundled locator 都可接受 `skillsRoot` 外的树。Provenance 调用层必须要求顶层 physical root 为非 symlink 普通目录、验证 containment/identity，并覆盖 verifier 与 locator。
3. `sync` 只在 hashing 前预检 registry parent；temp create/rename 前未复核 parent dev/inode/realpath，也未 fsync parent，存在目录身份变化窗口。必须冻结并复核 parent identity，变化即保留原 registry、失败关闭。
4. bundled `skills/` 根缺失或为空时，locator 在读取 canonical registry 前返回 `SkillContentNotFoundError`；生产 wrapper 会选择同名 lower-tier Skill，违反 declared bundled Skill 的 `missing-distributed-skill` no-downgrade 要求。
5. provenance-aware locator 在调用共享 `isPathSafeSkillId` 前执行 `join()`/`lstat`。根代理已确认越界 id 会因根外路径是否存在而返回不同错误；必须在任何文件系统访问前复用共享安全判据并返回 `SkillContentInvalidError`。
6. `SkillProvenanceLocatorError` 的 `_tag` 未被 `execution-preparation.ts::skillErrorReason()` 识别。确定性 registry/hash 损坏会穿透为基础设施异常，而不是既有 `skill-bundle-content-invalid` settlement；必须在不反转包依赖的前提下映射并补 admission 回归。

### P2

1. Canonical Skill hash 绑定 working-tree bytes，但 `.gitattributes` 未固定 `skills/**` 的 EOL。根代理用 `core.autocrlf=true` clean clone 确认 `skills/tenon/SKILL.md` 被转换为 483 个 CRLF；需要为 hashed Skill/registry/verifier 资产声明稳定 EOL。
2. `npm run sync:skill-provenance` 只先跑 `bundle`。根代理在 fresh clone `npm ci` 后确认 esbuild 因 ignored `packages/*/dist` 缺失而无法解析 workspace exports；authoring script 必须先构建所需 workspace dependencies，不能读取 stale dist。
3. `sync` 使用 permissive `parseSkillSources()`，misspelled/missing `skills:` 可解析为 `[]` 并成功覆盖成空 v3 registry；它也只遍历旧 entry、不拒绝 extra physical Skill、写后不做 independent strict verification。必须在 rename 前验证输入结构、双向 physical set 与生成候选，失败时原 bytes/mode 不变。
4. strict parser 接受 closing brace 后尾随 token，也接受重复 `version`/`hash_algorithm`/`skills` header。Canonical narrow grammar 必须锚定完整 entry 行并拒绝重复顶层声明。
5. locator 把首次 registry read/parse failure 缓存在实例中，修复文件后仍永久重抛；设计只允许缓存成功的 immutable validation，失败必须可在下一次调用重新读取。
6. canonical verifier 仅在 `skills-lock.json` 为 file/symlink 时报告 legacy；同名目录或其他节点会被误报 clean。任何成功 `lstat` 都必须产生 `legacy-provenance-source`。
7. 测试没有真实 repo-root assertion 来证明 `unconsumed tracked provenance sources = 0` 与 `distributed Skills without verified hashes = 0`。必须增加 tracked inventory 唯一性与真实 62-entry strict full verification 断言。

## 完整验证证据

唯一完整 gate 根：`/tmp/tenon-issue44-final-gate.c561e9be.6BJWRR`。Exact clone HEAD 为 `755cc439ab16e0409e1e4d7ea0ea3b7d63cc69c6`，clone clean；源 worktree HEAD 与实现 fingerprint 前后不变，源侧仅本 Change 的 Tenon governance paths 有变化。

- 23/23 主项 exit 0：dependencies、release workflows、OpenSpec、comments、architecture、identity、repository hygiene、npx package、legacy bridge、default workflow freshness、build、clean install、docs、document templates、docs sync/check/build/smoke、bundle、full Vitest、web、hooks、verify-skills normal/quiet、migration CAS、bundle test、oracle。
- Full Vitest：385 files；6708 passed、27 honest skipped、0 failed；`release-store.integration.test.ts` 86 tests 实际完成。
- `check:npx-package`：66/66，0 skip；clean install local mode 通过。
- Oracle：DUAL 5 fixtures，exit 0。
- `verify-skills.sh --quiet`：exit 0，0 output bytes。
- Registry measurement：62 registry entries、62 physical roots、62 hashes、62 coordinates；set diff 0；`skills-lock.json` absent。
- Sync idempotence：两次 exit 0/0，均 0 output bytes；registry SHA `f0e5be7b3a42133f24b82fa1c72abdc2b04542c165461c78e1bd62a4a8014dfc` 与 mode `0644` 前后不变。
- Candidate copies：content bytes drift 与 executable-bit drift 均以 `content-hash-mismatch` exit 1；legacy lock 以 `legacy-provenance-source` exit 1。
- Real setup drift：`setup skills --yes` exit 1、命中 `content-hash-mismatch`，stdout 0 bytes，未生成计划/安装/noop 成功标记；9558 tracked files 的 content+mode fingerprint 前后相同。
- OpenSpec rehearsal：`show` 9 deltas/3 specs、change strict validate、隔离 `archive --yes --json`、全 specs strict 与三规格逐一 strict 均 exit 0；只在副本变更 `plugin-distribution`、`skill-content-resolution`、`skill-provenance`，真实主规格 digest 保持 `e477347f...`。
- Honest skips：full Vitest 的 27 项为环境条件型 Docker/credential 等既有 skip；没有把 skip 计作通过，也没有因本 Issue 新增未解释 skip。

原始主矩阵：`/tmp/tenon-issue44-final-gate.c561e9be.6BJWRR/evidence/results.tsv`；专项与 rehearsal metrics 位于同目录 `evidence/`；35 个 logs 与 44 个 evidence files 均保留在该 gate 根。

## Spec/file 回读与决定

已把 94 个 candidate paths 对照 `skill-provenance`、`skill-content-resolution`、`plugin-distribution` 三份 delta spec 及 issue #44 六项 Acceptance/三项 Measurement 回读。Setup exact-root、candidate legacy pre-copy、失败时 selection/launchers 保持、N-1 rollback 与已登记 content drift no-fallback 已有正向证据；上述 findings 仍阻断验收。

持续自主模式按最保守默认选择“修复”，不接受偏差。本 attempt 完成后必须用 exact-event `verify-fail` delegated receipt 回 Build；下一候选需整合最新 `origin/main=d58df7a0ecbb155d54d81e782150bf68567cb617`，由同一 `luna_worker` 做聚合窄修复。第二次也是最后一次 formal review，只能绑定 post-integration 新 SHA。
