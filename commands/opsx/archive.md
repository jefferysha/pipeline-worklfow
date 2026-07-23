---
name: "OPSX: Archive"
description: Prepare a completed change for the canonical pipeline archive phase
category: Workflow
tags: [workflow, archive, experimental]
---

Prepare a completed change for the canonical pipeline archive phase. The skill verifies applied
spec evidence; the pipeline archive phase owns the final state transition.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, prompt for available changes — do NOT guess or auto-select.

**Execute now**: Use the Skill tool to load `openspec-archive-change`, passing the argument through as the change name. Follow that skill end to end (completion checks → applied-spec verification → archive preflight → summary).

（薄封装：完整步骤/护栏的单一真相源是 `skills/openspec-archive-change/SKILL.md`，命令与 skill 不双写。）
