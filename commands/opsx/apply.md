---
name: "OPSX: Apply"
description: Implement tasks from an OpenSpec change (Experimental)
category: Workflow
tags: [workflow, artifacts, experimental]
---

Implement tasks from an OpenSpec change.

**Input**: Optionally specify a change name after `/opsx:apply` (e.g., `/opsx:apply add-auth`). If omitted, infer from context or prompt for available changes.

**Execute now**: Use the Skill tool to load `pipeline-lite:openspec-apply-change`, passing the argument through as the change name. Follow that skill end to end.

（薄封装：完整步骤/护栏的单一真相源是 `skills/openspec-apply-change/SKILL.md`，命令与 skill 不双写。）
