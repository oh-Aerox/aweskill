# Dashboard Agents

This document tracks the agents and runtimes that interact with or are displayed by the aweskill dashboard.

## Supported Agent Runtimes (Display)

The dashboard displays projection status for all 53 agents defined in `src/lib/agents.ts`.
Key agents with active skill directories:

| Agent ID | Display Name | Global Skills Dir | Notes |
|----------|-------------|-------------------|-------|
| claude-code | Claude Code | ~/.claude/skills | Primary target |
| cursor | Cursor | ~/.cursor/skills | |
| copilot | GitHub Copilot | ~/.copilot/skills | |
| windsurf | Windsurf | ~/.codeium/windsurf/skills | |
| continue | Continue | ~/.continue/skills | |
| gemini-cli | Gemini CLI | ~/.gemini/skills | |
| codex | Codex | ~/.codex/skills | |

## CLI Agent (Operator)

The `aweskill serve` command itself is the operator agent:
- **Entry**: `src/commands/serve.ts`
- **Runtime**: Node.js built-in `http` module
- **Port**: 3000 (default), configurable via `--port`
- **Host**: 127.0.0.1 (default), configurable via `--host`

## Future Agents

- Browser-based dashboard consumer (the SPA itself)
- Potential WebSocket agent for real-time sync updates
