import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { listBundles } from "../lib/bundles.js";
import { getDashboardDir } from "../lib/dashboard.js";
import { pathExists } from "../lib/fs.js";
import { readSkillLock, type SkillLockEntry } from "../lib/lock.js";
import { getSkillDescription, parseSkillDoc } from "../lib/skill-doc.js";
import { getSkillPath, listSkills, skillExists } from "../lib/skills.js";
import type { RuntimeContext } from "../types.js";

export interface ServeOptions {
  port?: number;
  host?: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const SKILL_MD_FILENAME = "SKILL.md";

interface SkillApiResponse {
  name: string;
  description: string | null;
  hasSKILLMd: boolean;
  lockEntry: SkillLockEntry | null;
}

interface SkillDetailApiResponse {
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
  description: string | null;
  lockEntry: SkillLockEntry | null;
}

interface BundleSkillApiResponse {
  name: string;
  exists: boolean;
}

interface BundleApiResponse {
  name: string;
  skills: BundleSkillApiResponse[];
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isApiRoute(urlPath: string): boolean {
  return urlPath === "/api" || urlPath.startsWith("/api/");
}

function resolveWithinDashboard(dashboardDir: string, relativePath: string): string | null {
  const base = path.resolve(dashboardDir);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    return null;
  }
  return resolved;
}

// Missing or unreadable SKILL.md should not fail the list endpoint.
async function loadSkillDescription(skillPath: string, hasSKILLMd: boolean): Promise<string | null> {
  if (!hasSKILLMd) {
    return null;
  }

  try {
    const content = await readFile(path.join(skillPath, SKILL_MD_FILENAME), "utf8");
    return getSkillDescription(content) ?? null;
  } catch {
    return null;
  }
}

async function buildSkillsResponse(homeDir: string): Promise<SkillApiResponse[]> {
  const [skills, lock] = await Promise.all([listSkills(homeDir), readSkillLock(homeDir)]);

  return Promise.all(
    skills.map(async (skill) => ({
      name: skill.name,
      description: await loadSkillDescription(skill.path, skill.hasSKILLMd),
      hasSKILLMd: skill.hasSKILLMd,
      lockEntry: lock.skills[skill.name] ?? null,
    })),
  );
}

async function buildBundlesResponse(homeDir: string): Promise<BundleApiResponse[]> {
  const bundles = await listBundles(homeDir);

  return Promise.all(
    bundles.map(async (bundle) => ({
      name: bundle.name,
      skills: await Promise.all(
        bundle.skills.map(async (skillName) => ({
          name: skillName,
          exists: await skillExists(homeDir, skillName),
        })),
      ),
    })),
  );
}

async function buildSkillDetailResponse(
  homeDir: string,
  skillName: string,
): Promise<SkillDetailApiResponse | null> {
  if (!(await skillExists(homeDir, skillName))) {
    return null;
  }

  const skillPath = getSkillPath(homeDir, skillName);
  const name = path.basename(skillPath);
  const skillFile = path.join(skillPath, SKILL_MD_FILENAME);

  let frontmatter: Record<string, unknown> = {};
  let body = "";
  let description: string | null = null;

  if (await pathExists(skillFile)) {
    const content = await readFile(skillFile, "utf8");
    const parsed = parseSkillDoc(content);
    frontmatter = parsed.frontmatter;
    body = parsed.body;
    description = getSkillDescription(content) ?? null;
  }

  const lock = await readSkillLock(homeDir);

  return {
    name,
    frontmatter,
    body,
    description,
    lockEntry: lock.skills[name] ?? null,
  };
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  homeDir: string,
  urlPath: string,
): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return true;
  }

  if (urlPath === "/api/skills") {
    const skills = await buildSkillsResponse(homeDir);
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return true;
    }

    sendJson(res, 200, skills);
    return true;
  }

  if (urlPath === "/api/bundles") {
    const bundles = await buildBundlesResponse(homeDir);
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return true;
    }

    sendJson(res, 200, bundles);
    return true;
  }

  const skillDetailMatch = /^\/api\/skills\/([^/]+)$/.exec(urlPath);
  if (skillDetailMatch) {
    const skillName = decodeURIComponent(skillDetailMatch[1] ?? "");
    const detail = await buildSkillDetailResponse(homeDir, skillName);
    if (!detail) {
      sendJson(res, 404, { error: "Skill not found" });
      return true;
    }

    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return true;
    }

    sendJson(res, 200, detail);
    return true;
  }

  return false;
}

async function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  dashboardDir: string,
  urlPath: string,
): Promise<void> {
  const relativePath = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const resolved = resolveWithinDashboard(dashboardDir, relativePath);
  if (!resolved) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  let filePath = resolved;
  let fileStat = await stat(filePath).catch(() => null);

  if (fileStat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    fileStat = await stat(filePath).catch(() => null);
  }

  if (!fileStat?.isFile()) {
    const isSpaRoute = urlPath === "/" || path.extname(relativePath) === "";
    if (!isSpaRoute) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    filePath = path.join(path.resolve(dashboardDir), "index.html");
    fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
  }

  const contentType = getContentType(filePath);
  if (req.method === "HEAD") {
    res.writeHead(200, { "Content-Type": contentType });
    res.end();
    return;
  }

  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dashboardDir: string,
  homeDir: string,
): Promise<void> {
  const urlPath = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;

  if (isApiRoute(urlPath)) {
    const handled = await handleApiRequest(req, res, homeDir, urlPath);
    if (handled) {
      return;
    }

    sendJson(res, 501, { error: "Not implemented" });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  await serveStaticFile(req, res, dashboardDir, urlPath);
}

export async function runServe(
  context: RuntimeContext,
  options: ServeOptions = {},
): Promise<{ port: number; host: string; server: Server }> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const dashboardDir = await getDashboardDir();

  const server = createServer((req, res) => {
    handleRequest(req, res, dashboardDir, context.homeDir).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Internal server error";
      sendJson(res, 500, { error: message });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;

  context.write(`Dashboard server listening at http://${host}:${boundPort}/`);

  return { port: boundPort, host, server };
}
