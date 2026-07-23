# External skill policy

## Default workflow

The default pipeline has **no external skill dependency**. Every skill referenced by the packaged
open → explore → spec → build ⇄ verify → ship → archive workflow is shipped under this plugin's
`skills/` directory and declared in `templates/skill-sources.yaml` with `tool: bundled`.

`pipeline setup --<host>` must therefore never download a third-party skill marketplace, npm
package, or another host's cache in order to make the default workflow runnable.

## Optional integrations

Users may independently install tools such as an issue tracker integration, a different research
provider, or a host-specific agent. They are optional accelerators, not default workflow
requirements. A future external integration must be documented with its install, licensing, and
failure behavior before it is allowed to become a hard dependency.
