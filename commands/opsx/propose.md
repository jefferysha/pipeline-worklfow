---
name: "OPSX: Propose"
description: Propose a new change - create it and generate all artifacts in one step
category: Workflow
tags: [workflow, artifacts, experimental]
---

Propose a new change - create the change and generate all artifacts in one step.

**Input**: The argument after `/opsx:propose` is the change name (kebab-case), OR a description of what the user wants to build.

**Execute now**: Use the Skill tool to load `pipeline-lite:openspec-propose`, passing the argument through as the change name/description. Follow that skill end to end — do not improvise a different proposal flow.

（薄封装：完整步骤/护栏的单一真相源是 `skills/openspec-propose/SKILL.md`，命令与 skill 不双写。）
