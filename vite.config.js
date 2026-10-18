import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

// Each tab is its own page. public/ (the plain scripts, styles and images) is
// copied into the build unchanged.
const PAGES = ["domain", "calendar", "gpa", "assessments", "posts", "calendar-demo"];

// Firebase Hosting serves /calendar from calendar.html (cleanUrls) and applies
// firebase.json's redirects; the dev and preview servers do the same, read
// from that file so the two can't drift apart.
function firebaseHostingUrls() {
  const { hosting } = JSON.parse(readFileSync(new URL("firebase.json", import.meta.url), "utf8"));
  const redirects = new Map((hosting.redirects || []).map(({ source, destination }) => [source, destination]));
  const middleware = (req, res, next) => {
    const [path, query = ""] = req.url.split("?");
    const destination = redirects.get(path);
    if (destination) {
      res.statusCode = 301;
      res.setHeader("Location", destination + (query ? `?${query}` : ""));
      res.end();
      return;
    }
    if (!path.includes(".") && existsSync(`${root}${path}.html`)) {
      req.url = `${path}.html${query ? `?${query}` : ""}`;
    }
    next();
  };
  return {
    name: "firebase-hosting-urls",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [react(), firebaseHostingUrls()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, `${root}${page}.html`])),
    },
  },
  test: {
    include: ["src/**/*.test.{js,jsx}"],
  },
});
