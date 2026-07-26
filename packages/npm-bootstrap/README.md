# Tenon npm bootstrap template

This workspace is the reviewed source for Tenon's optional public npx entry. It
is intentionally private and is not the public package.

Release automation must run `tools/build-npx-package.mjs` with the npm package
name owned by the publisher. The generated package contains only this thin
entrypoint, the product identity, license, and this explanation. It delegates
to the release-pinned Marketplace installer, so Marketplace and npx activate
the same verified runtime and Skill root.

Until a publisher scope and npm credentials are configured, use the documented
Marketplace bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --codex
```
