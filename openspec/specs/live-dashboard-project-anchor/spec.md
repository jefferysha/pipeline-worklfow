# Live Dashboard Project Anchor Specification

## Requirements

### Requirement: A registered project is available without restarting the dashboard

The global dashboard MUST accept projects added to the machine registry after process startup. On the first workflow-related request, it MUST capture the project through the validated filesystem anchor primitive and continue without a restart.

### Requirement: Project identity is fail-closed

Only a currently registered real directory with matching descriptor, inode, and realpath identity may be captured. Capture occurs at most once. A later rename, replacement, symlink swap, inaccessible path, or identity mismatch MUST return HTTP 403 and MUST NOT replace the retained anchor. An unregistered root MUST return HTTP 404 and MUST NOT create an anchor.

### Requirement: Registry removal releases retained resources

When a project is removed from the machine registry, the dashboard MUST close and discard its retained descriptor so a later explicit registration begins from a new unanchored identity.
