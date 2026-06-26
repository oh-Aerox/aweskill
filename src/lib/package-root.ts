import path from "node:path";
import { fileURLToPath } from "node:url";

import { pathExists } from "./fs.js";

export type ReadmeVariant = "en" | "zh-CN";

export function getReadmeFilename(variant: ReadmeVariant): string {
  return variant === "zh-CN" ? "README.zh-CN.md" : "README.md";
}

export async function getPackageRootDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(moduleDir, "..", ".."), path.resolve(moduleDir, "..")];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "README.md"))) {
      return candidate;
    }
  }

  throw new Error("Package root not found.");
}

export async function getReadmePath(variant: ReadmeVariant): Promise<string> {
  const root = await getPackageRootDir();
  const filePath = path.join(root, getReadmeFilename(variant));
  if (!(await pathExists(filePath))) {
    throw new Error(`Readme file not found: ${filePath}`);
  }
  return filePath;
}

export function resolveWithinPackageRoot(rootDir: string, relativePath: string): string | null {
  const base = path.resolve(rootDir);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function rewriteReadmeAssetUrls(content: string): string {
  return content
    .replace(/\]\(\.\/([^)]+)\)/g, "](/api/readme/assets/$1)")
    .replace(/src="\.\/([^"]+)"/g, 'src="/api/readme/assets/$1"');
}
