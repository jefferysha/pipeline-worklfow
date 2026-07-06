---
name: "OPSX: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, prompt for available changes — do NOT guess or auto-select.

**Execute now**: Use the Skill tool to load `pipeline-lite:openspec-archive-change`, passing the argument through as the change name. Follow that skill end to end (completion checks → delta spec sync assessment → archive move → summary).

（薄封装：完整步骤/护栏的单一真相源是 `skills/openspec-archive-change/SKILL.md`，命令与 skill 不双写。）
