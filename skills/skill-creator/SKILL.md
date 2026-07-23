---
name: skill-creator
description: First-party process for adding a reusable packaged pipeline skill.
license: MIT
metadata:
  author: pipeline-lite
---

# Skill Creator

Create a skill only after extracting a repeated, stable workflow. Give it a focused trigger,
inputs, steps, outputs, and verification. Keep it under this plugin's `skills/` tree, add it to the
packaged registry, and test that the plugin verifier accepts it; do not write it into a host-global
directory as an undeclared dependency.
