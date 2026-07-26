# Tenon npm bootstrap 模板

这个 workspace 是 Tenon 可选公开 npx 入口的受审源文件。它本身保持 private，不是最终发布到
npm 的公共包。

发布自动化必须使用发布者实际拥有的 npm 包名运行 `tools/build-npx-package.mjs`。生成包只包含
这个薄入口、产品身份、许可证和本说明。入口会下载对应 release tag 的 Marketplace 安装脚本，
并校验内嵌 SHA-256；脚本随后使用 Tenon 的 `main` 稳定发行通道。因此 Marketplace 与 npx
会激活同一个已验证候选 digest，又不会把未来宿主更新永久锁在旧 tag。

在 publisher scope 与 npm 凭据尚未配置前，请使用已公开的 Marketplace bootstrap：

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --codex
```
