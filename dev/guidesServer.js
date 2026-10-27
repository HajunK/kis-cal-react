// The study guides site (guides/, the kiscal-guides Hosting site) in the dev
// server: open http://guides.localhost:3000 next to http://localhost:3000. Browsers
// send *.localhost to this machine on their own, and Vite already accepts that
// host. It answers the way firebase.json's guides site does: a file that exists
// is served as it is, a folder with an index.html (/biology) is that page, a clean
// URL (/guide for guide.html) works, and any other path is guide.html, which reads
// the guide's key from the address.

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GUIDES_DIR = fileURLToPath(new URL("../guides", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Whether a request is for the guides site: guides.localhost, with or without a
// port.
export function isGuidesHost(host) {
  return /^guides\.localhost(:\d+)?$/i.test(String(host || ""));
}

// The file (relative to guides/) a path is answered with. isFile(relative) says
// whether such a file exists. Never one outside guides/.
export function resolveGuidesPath(pathname, isFile) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return "guide.html";
  }
  const clean = normalize(path).split(sep).join("/").replace(/^\/+/, "");
  if (clean.startsWith("..") || clean.includes("\0")) return "guide.html";
  const trimmed = clean.replace(/\/+$/, "");
  const candidates = trimmed === "" ? ["index.html"] : [trimmed, `${trimmed}/index.html`, `${trimmed}.html`];
  return candidates.find((candidate) => isFile(candidate)) || "guide.html";
}

function middleware(req, res, next) {
  if (!isGuidesHost(req.headers.host)) return next();
  const [pathname] = req.url.split("?");
  const isFile = (relative) => {
    const full = join(GUIDES_DIR, relative);
    return full.startsWith(GUIDES_DIR) && existsSync(full) && statSync(full).isFile();
  };
  const relative = resolveGuidesPath(pathname, isFile);
  res.statusCode = 200;
  res.setHeader("Content-Type", TYPES[extname(relative).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.end(readFileSync(join(GUIDES_DIR, relative)));
}

export function guidesDevServer() {
  return {
    name: "guides-dev-server",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
