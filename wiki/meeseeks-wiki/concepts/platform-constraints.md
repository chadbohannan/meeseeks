# Platform Constraints

This page documents platform-specific incompatibilities and workarounds discovered during development. These constraints are not visible in the codebase without context — the code just has a `usePolling: true` or a deleted flag, and future developers need to know why.

## chokidar native watchers vs node-pty on macOS

chokidar's native filesystem watchers (FSEvents on macOS, inotify on Linux) corrupt the file descriptor state that node-pty needs to fork a PTY. When chokidar is active with native watchers, any process spawned via node-pty exits immediately with code 1 and produces no output — not even `/bin/echo`. The process gets a valid PID but dies before writing a single byte to the PTY.

This was discovered on macOS (Darwin 25.4.0, arm64) with node-pty 1.2.0-beta.12 and Node v24. The issue does not reproduce on Linux, which is why it went undetected during initial development. It also does not reproduce in isolation — standalone scripts using node-pty work fine; the conflict only manifests when chokidar's native watcher is active in the same process.

The fix is `usePolling: true` on chokidar in `src/server/watcher.ts`. Polling uses more CPU than native watchers but is the only mode compatible with node-pty on macOS. The polling interval is set to 500ms with a stabilityThreshold of 100ms to balance responsiveness against CPU cost.

The `useFsEvents: false` option was tested and does not help — chokidar falls back to a different native watcher implementation that has the same conflict. Only `usePolling: true` avoids the issue entirely.

If a future chokidar or node-pty release resolves this, the polling fallback can be removed. The symptom to test for: spawn `/bin/echo hello` via node-pty while chokidar is watching a directory with native watchers. If echo produces output, native watchers are safe to re-enable.

## node-pty version compatibility

node-pty 1.1.0's prebuilt binaries do not support Node v22+ on macOS arm64. The spawn call fails with `posix_spawnp failed` before the child process is even created. This affects all PTY operations, not just Claude Code.

The project uses node-pty 1.2.0-beta.12 which ships updated prebuilt binaries for the darwin-arm64 + Node v22/v24 combination. This is a beta release; when a stable 1.2.x ships, it should be adopted.

## tsx watch scope

`tsx watch` monitors the entire project tree by default. Writing files to any directory — including runtime artifacts like settings files in `boards/<board>/.meeseeks/` — triggers a server restart, killing any active PTY child processes. The dev server command uses `--exclude 'boards/**' --exclude 'wiki/**'` to prevent this. This is configured in both the Makefile and `package.json`.

## Environment variable leakage

The server process inherits environment variables from its parent (typically `concurrently` running under `tsx watch`). Some of these interfere with Claude Code when passed through to spawned processes. `FORCE_COLOR=3` (set by concurrently for colored output) is stripped from the spawn environment in `src/runtime/claude-code.ts` to avoid unexpected behavior in the agent process.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-28 | Debugging session: chokidar/node-pty incompatibility, node-pty version issues, tsx watch restarts |
