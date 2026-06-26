# Plan: Add `aweskill serve` with Web Dashboard

## Context

`aweskill` is a CLI-first skill package manager. Users manage skills entirely through terminal commands. A local web dashboard would make browsing skills, bundles, and agent projection states significantly clearer — especially when diagnosing issues with `doctor sync`.

This feature adds a `serve` command that starts a lightweight local HTTP server. The frontend is a single-page application served from a `dashboard/` directory, consuming JSON APIs exposed by the same server.

## Constraints

- **Zero new production dependencies.** Use Node.js built-in `http` module.
- **All frontend code lives in `dashboard/`** at the project root.
- **Read-only dashboard.** No install/delete/sync mutations through the UI (per DESIGN.md scope).
- **Follow existing CLI patterns.** Register via `src/cli/commands.ts`, implement in `src/commands/serve.ts`.
- **Re-use existing lib functions** for data aggregation instead of duplicating filesystem logic.

## Recommended Approach

### 1. Add `dashboard/` directory with static SPA assets

Create the following files. They are plain HTML/CSS/JS — no build step, no framework.

```
dashboard/
├── index.html    # SPA shell with navigation sidebar + content area
├── style.css     # Clean, minimal styles (responsive, dark-mode friendly)
└── app.js        # Hash-based routing, API fetch, DOM rendering
```

**Frontend pages:**
- `#/skills` — List all skills in central store. Cards show name, description (from `getSkillDescription`), source (from lock file), install date. Search filter. Click to expand detail pane showing parsed SKILL.md frontmatter and body preview.
- `#/skills/:name` — Detail view for a single skill.
- `#/bundles` — List all bundles. Each card shows name and contained skill names (with existence indicators).
- `#/agents` — Table of supported agents. Columns: display name, installed status, global skills directory, number of linked/projected skills (from `scanSkills`).
- `#/health` — Store hygiene summary: total skills, suspicious entries (missing SKILL.md, reserved names), broken symlinks, duplicates. Suggests `doctor sync` / `doctor clean` when issues exist.

**Design notes:**
- Use hash routing so the server only needs to serve `index.html` for all paths.
- API base URL is relative (`/api`).
- Styles should be self-contained; no external CDN dependencies.

### 2. Add dashboard directory resolver (`src/lib/dashboard.ts`)

Mirror the pattern in `src/lib/resources.ts` to locate the `dashboard/` directory at runtime, both in development (`tsx src/index.ts`) and in the bundled npm package (`dist/index.js`).

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathExists } from "./fs.js";

export async function getDashboardDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "..", "..", "dashboard"),
    path.resolve(moduleDir, "..", "..", "..", "dashboard"),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("Dashboard directory not found.");
}
```

### 3. Implement `src/commands/serve.ts`

**Command signature:**
```ts
export interface ServeOptions {
  port?: number;
  host?: string;
}

export async function runServe(
  context: RuntimeContext,
  options: ServeOptions = {}
): Promise<{ port: number; host: string; server: Server }>
```

**Server behavior:**
1. Determine `dashboardDir` via `getDashboardDir()`.
2. Create an `http.createServer` handler.
3. Route logic:
   - `GET /api/skills` → aggregate data via `listSkills()`, `readSkillLock()`, `getSkillDescription()`.
   - `GET /api/skills/:name` → read `SKILL.md`, parse with `parseSkillDoc()`, return `{ name, frontmatter, body, description, lockEntry }`.
   - `GET /api/bundles` → `listBundles()`.
   - `GET /api/agents` → `listSupportedAgentsWithGlobalStatus()` + `scanSkills()` per installed agent to count projections.
   - `GET /api/health` → `scanStoreHygiene()` + per-agent `classifyCheckedSkill()` aggregation.
   - `GET /api/store` → basic store metadata (paths, counts).
   - Any other `GET` → serve static file from `dashboardDir` (fall back to `index.html` for SPA routing).
4. Start listening on `host:port` (default `127.0.0.1:3000`).
5. Log startup URL via `context.write()`.
6. Return the server instance so tests can close it.

**Key lib functions to reuse:**
| Data needed | Existing function | File |
|---|---|---|
| Skill list | `listSkills(homeDir)` | `src/lib/skills.ts` |
| SKILL.md parse | `parseSkillDoc(content)`, `getSkillDescription(content)` | `src/lib/skill-doc.ts` |
| Bundles | `listBundles(homeDir)` | `src/lib/bundles.ts` |
| Lock entries | `readSkillLock(homeDir)` | `src/lib/lock.ts` |
| Agent registry | `listSupportedAgentsWithGlobalStatus(homeDir)` | `src/lib/agents.ts` |
| Agent projections | `scanSkills({ homeDir, scope, agents })` | `src/lib/scanner.ts` |
| Store hygiene | `scanStoreHygiene({ rootDir, skillsDir, bundlesDir })` | `src/lib/hygiene.ts` |
| Agent-side classification | `classifyCheckedSkill(skill, managed, canonicalSkillNames)` | `src/commands/agent-inspection.ts` |

### 4. Register the command in `src/cli/commands.ts`

Add import:
```ts
import { runServe } from "../commands/serve.js";
```

Register inside `createProgram`:
```ts
program
  .command("serve")
  .description("Start a local dashboard server")
  .option("-p, --port <number>", "port to listen on", (v) => Number.parseInt(v, 10), 3000)
  .option("--host <host>", "host to bind to", "127.0.0.1")
  .action(async (options) => {
    await runFramedCommand(" aweskill serve ", async () =>
      runServe(context, { port: options.port, host: options.host }),
    );
  });
```

### 5. Update `package.json`

Add `"dashboard"` to the `files` array so the directory is included in the npm package:
```json
"files": ["dist", "resources", "dashboard", "README.md", "README.zh-CN.md"]
```

### 6. Add tests (`tests/serve.test.ts`)

Test the data aggregation logic and HTTP routing:
- Start server on ephemeral port (`port: 0`).
- `GET /api/skills` returns JSON array with expected shape.
- `GET /api/bundles` returns bundles.
- `GET /api/health` returns hygiene summary.
- `GET /` serves `dashboard/index.html`.
- `GET /nonexistent` falls back to `index.html` (SPA support).
- Close server after each test.

Use `createRuntimeContext({ homeDir: tempDir })` for isolation.

## Critical Files to Modify / Create

| File | Action |
|---|---|
| `dashboard/index.html` | Create |
| `dashboard/style.css` | Create |
| `dashboard/app.js` | Create |
| `src/lib/dashboard.ts` | Create |
| `src/commands/serve.ts` | Create |
| `src/cli/commands.ts` | Edit (register `serve` command) |
| `package.json` | Edit (add `"dashboard"` to `files`) |
| `tests/serve.test.ts` | Create |

## Verification

1. **Build:** `npm run build` succeeds with no errors.
2. **Lint:** `npm run lint` passes.
3. **Tests:** `npm test` passes, including new `serve.test.ts`.
4. **Manual E2E:**
   ```bash
   npm run dev -- serve --port 3456
   # Open http://localhost:3456
   # Verify: skills list loads, bundles visible, agents table populated, health panel shows counts.
   ```
5. **Pack check:** `npm pack` includes `dashboard/` directory.
