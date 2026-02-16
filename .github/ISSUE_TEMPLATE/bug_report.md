---
name: Bug Report
about: Report a bug to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Configure with '...'
2. Send command '...'
3. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Screenshots

If applicable, add screenshots to help explain your problem.

## Environment

- OS: [e.g., macOS 14.0, Ubuntu 22.04]
- Node.js version: [e.g., 18.19.0]
- happy-lunch version: [e.g., 0.1.0]

## Configuration

Relevant parts of your `config.json` (redact sensitive data like user IDs):

```json
{
  "allowedTools": ["claude", "codex"],
  "startupTimeoutMs": 8000
}
```

## Audit Log

If relevant, include the JSONL audit log entry (redact user IDs):

```json
{"ts":"...","result":"failure","reasonCode":"..."}
```

## Additional Context

Add any other context about the problem here.
