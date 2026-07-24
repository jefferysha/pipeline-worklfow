# ADR: Permit a one-time workflow-root anchor capture for CLI-registered projects

## Status

Accepted — 2026-07-24

## Context

`pipeline init` registers its project directly in the machine-level project registry. A dashboard already running before that command previously knew the registry entry but had no inode anchor, so every `/api/config` and `/api/workflows` request returned `403`. This prevented a first installation from creating Tracks or Workflows through the UI.

## Decision

The server treats the machine-level registry as the authoritative initial trust input. For a root that is currently registered but has no in-memory anchor, its first workflow-related request captures a non-symlink inode anchor exactly once. The capture uses the existing descriptor/inode validation. After capture, all requests must validate the same anchor; a replacement, rename, or symlink swap fails closed and is never re-anchored.

Roots that are not registered remain `404`, and an unsafe or inaccessible registered path returns `403` without adding an anchor.

## Consequences

This restores parity between projects registered before server start and projects created with `pipeline init` while the dashboard is running. The registry's existing trust boundary is explicit: an attacker able to change that machine-level registry can nominate a path before its first use, but cannot use a later pathname swap to redirect an already-bound workflow capability. The regression test covers both the CLI registration path and the no-rebind guarantee.
