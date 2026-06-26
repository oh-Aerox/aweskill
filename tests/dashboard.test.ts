import path from "node:path";

import { describe, expect, it } from "vitest";

import { getDashboardDir } from "../src/lib/dashboard.js";
import { getPackageRootDir } from "../src/lib/package-root.js";

describe("dashboard path resolution", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");

  it("resolves dashboard directory from source layout", async () => {
    await expect(getDashboardDir()).resolves.toBe(path.join(repoRoot, "dashboard"));
  });

  it("resolves package root from source layout", async () => {
    await expect(getPackageRootDir()).resolves.toBe(repoRoot);
  });

  it("resolves dashboard directory from bundled dist layout", async () => {
    const distDir = path.join(repoRoot, "dist");
    const bundledCandidate = path.resolve(distDir, "..", "dashboard");
    await expect(getDashboardDir()).resolves.toBe(bundledCandidate);
  });
});
