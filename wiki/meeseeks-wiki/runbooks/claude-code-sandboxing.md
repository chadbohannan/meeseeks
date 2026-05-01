# Claude Code Sandboxing

This runbook covers the three complementary layers for constraining Claude Code instances in an orchestrator context: permission modes, settings file rules, and OS-level sandboxing. These mechanisms combine to create soft sandboxes where agents operate autonomously within defined boundaries without prompting for approval.

## Permission Modes

The `--permission-mode <mode>` flag sets the tool-approval policy for a session. Seven modes exist, but three are primary for orchestration:

**`dontAsk`** — the soft-sandbox primitive. Tools pre-approved by `allowedTools`, settings file allow rules, or hooks run automatically. Everything else is denied without prompting. This is the foundational mode for autonomous agent execution, where the orchestrator defines the permitted surface and the agent operates freely within it.

**`acceptEdits`** — auto-accepts file edits within the working directory and `additionalDirectories`, prompts for other tools. Useful for semi-supervised agents that need human approval for network access, process spawning, or external API calls but can freely modify their workspace.

**`bypassPermissions`** — skips all permission checks entirely. Only safe when OS-level sandboxing is enabled, as the sandbox becomes the sole enforcement mechanism. This mode is documented for completeness but should not be used in Meeseeks without sandboxing.

The other modes (`auto`, `default`, `plan`) are interactive or adaptive modes that don't fit the orchestrator pattern.

## Settings File Precedence

Claude Code loads settings from multiple sources. This precedence chain governs permissions and hooks; the parallel instruction bootstrapping chain (CLAUDE.md, rules, nested instructions) is documented in the [Claude Code Client](../components/claude-code-client.md#instruction-bootstrapping) component page. Settings are evaluated in this order:

1. **Managed settings** — Admin-deployed via MDM or OS-level policies, cannot be overridden. Located at `/etc/claude/managed-settings.json` (Linux) or `/Library/Application Support/Claude/managed-settings.json` (macOS).
2. **Command line arguments** — Per-invocation flags like `--allowedTools`, `--permission-mode`, `--settings`.
3. **Local project settings** — `.claude/settings.local.json` in the working directory, gitignored.
4. **Shared project settings** — `.claude/settings.json` in the working directory, committed.
5. **User settings** — `~/.claude/settings.json`, global to the user.

If a tool is denied at any level, no lower level can allow it. This precedence model enables orchestrators to enforce floor policies via managed settings while still allowing per-board customization through project-level settings files.

## Folder-Scoped Permissions

Each Claude Code working directory can have its own `.claude/settings.json` with independent permission rules. For an orchestrator like Meeseeks, this means:

- Spawn each instance with `--cwd` pointing to the appropriate lane or board directory.
- That directory's `.claude/settings.json` drives its permissions automatically.
- The orchestrator can template these settings files at board creation time or generate them dynamically per runtime.

A typical per-folder sandbox configuration:

```json
{
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Read",
      "Edit(./src/**)",
      "Edit(./tests/**)",
      "Bash(npm run build)",
      "Bash(npm run test *)",
      "Bash(git status)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Read(.env*)",
      "Bash(git push *)",
      "Bash(rm *)",
      "Bash(sudo *)",
      "WebFetch"
    ]
  }
}
```

Rules are evaluated by category: all deny rules are checked first, then ask rules, then allow rules. A deny rule always beats an allow rule, regardless of order in the JSON array or which settings file it lives in.

## The Deny-Rule Gap

**Critical limitation:** deny rules block built-in tools, not Bash subprocesses. A `Read(./.env)` deny rule blocks the Read tool but does not prevent `cat .env` in Bash. For full protection, deny both the tool and the Bash invocation:

```json
{
  "permissions": {
    "deny": [
      "Read(.env*)",
      "Bash(cat .env*)"
    ]
  }
}
```

For comprehensive protection without exhaustive Bash deny rules, enable OS-level sandboxing.

## OS-Level Sandboxing

The native sandbox provides OS-enforced filesystem and network isolation, covering not just Claude Code's direct tool calls but also any scripts, programs, or subprocesses spawned via Bash. It is built on bubblewrap (Linux) and Seatbelt (macOS).

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true
  }
}
```

With sandboxing enabled, the agent can work more freely within the sandbox boundaries because the OS enforces the constraints. `autoAllowBashIfSandboxed` automatically allows the Bash tool when sandboxing is active, since the OS-level restrictions make it safe to run arbitrary shell commands within the sandbox.

Permissions and sandboxing are complementary: permissions control which tools Claude Code can use and which files or domains it can access; sandboxing provides OS-level enforcement that restricts filesystem and network access even when Bash is allowed.

## `additionalDirectories` for Cross-Folder Access

By default, a Claude Code instance only accesses its working directory. `additionalDirectories` grants access to additional paths. Common use cases:

- **Monorepo cross-package access** — an agent working on one package needs to read shared types or utilities from another package.
- **Shared configuration** — reading config files outside the project root.
- **System logs or build artifacts** — inspecting output directories managed by external tools.

```json
{
  "permissions": {
    "additionalDirectories": ["/shared/libs", "/shared/types"],
    "allow": [
      "Read(/shared/libs/**)",
      "Read(/shared/types/**)"
    ]
  }
}
```

`acceptEdits` mode applies to paths inside the working directory and `additionalDirectories`. Paths outside that scope still prompt. Writes to protected paths (e.g., system directories) also still prompt.

## Managed Settings for Orchestrator-Wide Policy

For organizations that need centralized control, managed settings provide unoverridable policy. These are delivered through MDM, OS-level policy systems, or manually placed managed settings files.

Example managed settings for an orchestrator:

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "deny": [
      "Read(.env*)",
      "Bash(sudo *)",
      "Bash(rm -rf *)"
    ]
  }
}
```

This ensures no per-board settings can re-enable `bypassPermissions` mode or allow access to environment files, privileged commands, or destructive filesystem operations.

## Hooks for Dynamic Policy Enforcement

For cases where static glob patterns aren't expressive enough, hooks provide programmatic control. A `PreToolUse` hook can inspect the exact command and arguments before Claude executes it, allowing runtime validation beyond pattern matching.

Example use cases:
- Validating that a Bash command only accesses specific directories, with more complex logic than glob patterns support.
- Enforcing naming conventions (e.g., only allow git branches prefixed with the ticket ID).
- Logging tool usage for audit trails.

Hooks are configured in settings files and run as shell commands. They can allow, deny, or modify tool requests based on arbitrary logic.

## Architecture for Orchestrators

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Per-instance tool allowlist | `allowedTools` CLI flag or Agent SDK option | Per invocation |
| No-prompt mode | `permissionMode: "dontAsk"` | Per invocation |
| Folder-scoped rules | `.claude/settings.json` in each board/lane directory | Per working directory |
| Extended directories | `additionalDirectories` | Per settings file |
| Bash subprocess containment | `sandbox.enabled: true` | Per process (OS-enforced) |
| Org-wide floor | Managed settings | All instances |

The recommended pattern for Meeseeks:
1. Spawn each instance with `--cwd /path/to/board-or-lane`.
2. Set `defaultMode: dontAsk` in that folder's `.claude/settings.json` with an explicit `allow` list.
3. Layer OS sandboxing on top for comprehensive protection against Bash escapes.
4. Use managed settings to enforce unoverridable constraints across all boards.

This gives autonomous operation within the permitted surface with a hard enforcement boundary below it.

## Meeseeks Integration Status

As of 2026-04-29, Meeseeks:
- Uses per-session settings files at `<board>/.meeseeks/session-<runtimeId>.json` for hooks and basic allow/deny rules.
- Compiles `permissions.yaml` into `--add-dir` flags and settings file rules.
- Does **not** set `--permission-mode`, so instances run in the default interactive approval mode.
- Does **not** use `additionalDirectories`.
- Does **not** enable OS-level sandboxing.

The permission mode, additional directories, and sandboxing features are documented here for future implementation when autonomous ticket execution is built.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-29 | Web documentation on soft-sandboxing Claude Code instances in orchestrators |
| 2026-04-30 | [Claude Context](../../sources/Claude%20Context.md) — instruction bootstrapping and active reloading behaviour |
