import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runServe } from "../src/commands/serve.js";
import { createProgram } from "../src/index.js";
import { addSkillToBundle, createBundle } from "../src/lib/bundles.js";
import { getSkillPath } from "../src/lib/skills.js";
import { createRuntime, createTempWorkspace, writeSkill } from "./helpers.js";

describe("serve command", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = undefined;
  });

  async function setupWorkspace() {
    const workspace = await createTempWorkspace();
    const runtime = createRuntime(workspace.homeDir, workspace.projectDir);
    const program = createProgram({
      cwd: workspace.projectDir,
      homeDir: workspace.homeDir,
      write: runtime.context.write,
      error: runtime.context.error,
    });

    await program.parseAsync(["node", "aweskill", "store", "init"], { from: "node" });
    await writeSkill(getSkillPath(workspace.homeDir, "pr-review"), "PR Review");
    await createBundle(workspace.homeDir, "frontend");
    await addSkillToBundle(workspace.homeDir, "frontend", "pr-review");

    return { workspace, runtime };
  }

  async function startServer(runtime: ReturnType<typeof createRuntime>) {
    const result = await runServe(runtime.context, { port: 0 });
    server = result.server;
    return result;
  }

  it("starts on an ephemeral port", async () => {
    const { runtime } = await setupWorkspace();
    const { port } = await startServer(runtime);
    expect(port).toBeGreaterThan(0);
  });

  it("GET /api/skills returns a JSON array with the expected shape", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);

    const response = await fetch(`http://${host}:${port}/api/skills`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const skills = (await response.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(skills)).toBe(true);

    const prReview = skills.find((skill) => skill.name === "pr-review");
    expect(prReview).toMatchObject({
      name: "pr-review",
      hasSKILLMd: true,
      lockEntry: null,
    });
    expect(prReview).toHaveProperty("description");
  });

  it("GET /api/bundles returns bundles with skill existence indicators", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);

    const response = await fetch(`http://${host}:${port}/api/bundles`);
    expect(response.status).toBe(200);

    const bundles = (await response.json()) as Array<{
      name: string;
      skills: Array<{ name: string; exists: boolean }>;
    }>;

    expect(bundles).toEqual([
      {
        name: "frontend",
        skills: [{ name: "pr-review", exists: true }],
      },
    ]);
  });

  it("GET /api/health returns a hygiene summary", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);

    const response = await fetch(`http://${host}:${port}/api/health`);
    expect(response.status).toBe(200);

    const health = (await response.json()) as {
      totalSkills: number;
      totalBundles: number;
      storeFindings: unknown[];
      agentIssues: { brokenSymlinks: number; duplicates: number; suspicious: number };
      suggestions: string[];
    };

    expect(health.totalSkills).toBeGreaterThan(0);
    expect(health.totalBundles).toBe(1);
    expect(Array.isArray(health.storeFindings)).toBe(true);
    expect(health.agentIssues).toMatchObject({
      brokenSymlinks: expect.any(Number),
      duplicates: expect.any(Number),
      suspicious: expect.any(Number),
    });
    expect(Array.isArray(health.suggestions)).toBe(true);
  });

  it("GET / serves dashboard/index.html", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);
    const dashboardIndex = await readFile(path.join(process.cwd(), "dashboard", "index.html"), "utf8");

    const response = await fetch(`http://${host}:${port}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toBe(dashboardIndex);
  });

  it("GET /nonexistent falls back to index.html for SPA routing", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);
    const dashboardIndex = await readFile(path.join(process.cwd(), "dashboard", "index.html"), "utf8");

    const response = await fetch(`http://${host}:${port}/nonexistent`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toBe(dashboardIndex);
  });

  it("GET /api/readme returns README content with rewritten asset URLs", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);

    const response = await fetch(`http://${host}:${port}/api/readme`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const readme = (await response.json()) as {
      variant: string;
      filename: string;
      content: string;
    };

    expect(readme.variant).toBe("en");
    expect(readme.filename).toBe("README.md");
    expect(readme.content).toContain("aweskill");
    expect(readme.content).toContain("/api/readme/assets/logo.png");
  });

  it("GET /api/readme/assets/logo.png serves a project asset", async () => {
    const { runtime } = await setupWorkspace();
    const { host, port } = await startServer(runtime);

    const response = await fetch(`http://${host}:${port}/api/readme/assets/logo.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });
});
