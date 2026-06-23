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
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("Dashboard directory not found.");
}
