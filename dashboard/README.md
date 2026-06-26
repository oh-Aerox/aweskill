# aweskill Dashboard

A local, read-only web UI for browsing your aweskill central store — skills, bundles, agent projections, and store health — without leaving the browser.

The dashboard is a zero-build-step SPA (plain HTML/CSS/JS) served by the `aweskill serve` command. All data comes from JSON APIs on the same HTTP server; nothing is mutated through the UI.

## Quick start

```bash
# Initialize the store if you have not already
aweskill store init

# Start the dashboard (default: http://127.0.0.1:3000)
aweskill serve

# Custom host/port
aweskill serve --port 3456 --host 127.0.0.1
```

From a git checkout:

```bash
npm run dev -- serve --port 3456
```

Then open the printed URL in your browser.

## Pages

| Route | Description |
|-------|-------------|
| `#/skills` | Searchable skill cards with description, source, and install date |
| `#/skills/:name` | Single skill detail — frontmatter, body preview, lock entry |
| `#/bundles` | Bundle list with per-skill installed/missing indicators |
| `#/agents` | Supported agents, install status, global skills dir, projection counts |
| `#/health` | Store hygiene summary, agent issues, actionable CLI suggestions |
| `#/readme` | Project README (English / 简体中文 toggle) |

Hash routing keeps the server simple: any unknown path falls back to `index.html`.

## Directory layout

```
dashboard/
├── README.md           # This file — dashboard module documentation
├── index.html          # SPA shell (sidebar + content area)
├── style.css           # Responsive, dark-mode-friendly styles
├── app.js              # Hash router, API client, page renderers
├── markdown.js         # Minimal markdown renderer for the Readme page
├── plan.md             # Original implementation spec
├── progress.md         # Implementation progress tracker
├── feature-list.json   # Structured feature checklist
├── agents.md           # Agent runtime notes for the dashboard
├── init.sh             # Local dev environment checker
└── session-handoff.md  # Session continuity template for agents
```

Backend wiring lives outside this folder:

| File | Role |
|------|------|
| `src/commands/serve.ts` | HTTP server, API routes, static file serving |
| `src/lib/dashboard.ts` | Resolves `dashboard/` at runtime (source + npm package) |
| `src/cli/commands.ts` | Registers `aweskill serve` |

## HTTP API

All endpoints are read-only and scoped to the current user's aweskill store (`~/.aweskill` by default).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/store` | Store root path, skill/bundle counts |
| `GET` | `/api/skills` | All skills with descriptions and lock metadata |
| `GET` | `/api/skills/:name` | Parsed SKILL.md + lock entry for one skill |
| `GET` | `/api/bundles` | Bundles with skill existence flags |
| `GET` | `/api/agents` | Agent registry with projection counts |
| `GET` | `/api/health` | Hygiene findings and doctor suggestions |
| `GET` | `/api/readme?variant=en\|zh-CN` | Project README content for the Readme page |
| `GET` | `/api/readme/assets/*` | README-linked assets (images, etc.) |

Static assets (`index.html`, `style.css`, `app.js`, …) are served from this directory. Extensionless paths fall back to `index.html` for SPA support.

## Design constraints

- **No new production dependencies** — Node.js built-in `http` only
- **Read-only** — install, delete, sync, and other mutations stay in the CLI
- **Self-contained frontend** — no CDN, no bundler, no framework
- **Reuses existing lib** — `listSkills`, `scanStoreHygiene`, `classifyCheckedSkill`, etc.

See `plan.md` for the full design rationale.

## Development

```bash
# Check environment
./dashboard/init.sh

# Run serve tests
npm test -- tests/serve.test.ts

# Full verification
npm run build && npm run lint && npm test
```

When editing frontend files, refresh the browser — there is no hot reload. Restart `aweskill serve` only if you change backend code.

### Adding a page

1. Add a sidebar link in `index.html`
2. Register the route in `app.js` (`parseHash`, `ROUTE`, `NAV_HASH_BY_ROUTE`, dispatch switch)
3. Implement a `render*Page()` function using existing CSS classes in `style.css`
4. Add an API endpoint in `src/commands/serve.ts` if new data is needed
5. Extend `tests/serve.test.ts`

## npm package

`dashboard/` is listed in the root `package.json` `files` array, so it ships with the published npm package. `getDashboardDir()` resolves it from both development (`src/lib`) and installed (`dist/lib`) layouts.

Verify inclusion:

```bash
npm pack --dry-run | grep dashboard/
```

## Related docs

- [plan.md](./plan.md) — implementation specification
- [progress.md](./progress.md) — feature completion status
- [agents.md](./agents.md) — agent display notes
- [../README.md](../README.md) — aweskill CLI user guide
- [../README.zh-CN.md](../README.zh-CN.md) — aweskill CLI 用户指南
