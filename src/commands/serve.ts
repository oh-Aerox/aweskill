import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { getDashboardDir } from "../lib/dashboard.js";
import type { RuntimeContext } from "../types.js";

export interface ServeOptions {
  port?: number;
  host?: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

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

async function handleRequest(req: IncomingMessage, res: ServerResponse, dashboardDir: string): Promise<void> {
  const urlPath = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;

  if (isApiRoute(urlPath)) {
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

  // Upcoming API routes will read store data from context.homeDir.
  void context.homeDir;

  const server = createServer((req, res) => {
    handleRequest(req, res, dashboardDir).catch((error: unknown) => {
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
