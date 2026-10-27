import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { guidesDevServer } from "./dev/guidesServer.js";

// One page, index.html; React Router picks the tab from the path, and every
// path serves it (see firebase.json's rewrite). public/ (styles, images, the
// vendored scripts) is copied into the build unchanged.

// firebase.json's redirects (/ to /domain, old page names), applied by the dev
// and preview servers too, read from that file so the two can't drift apart.
function firebaseRedirects() {
  // hosting is a list, one entry per Hosting site (this app's and guides/'s).
  const { hosting } = JSON.parse(readFileSync(new URL("firebase.json", import.meta.url), "utf8"));
  const app = [].concat(hosting).find((site) => site.public === "dist") || {};
  const redirects = new Map((app.redirects || []).map(({ source, destination }) => [source, destination]));
  const middleware = (req, res, next) => {
    const [path, query = ""] = req.url.split("?");
    const destination = redirects.get(path);
    if (!destination) return next();
    res.statusCode = 301;
    res.setHeader("Location", destination + (query ? `?${query}` : ""));
    res.end();
  };
  return {
    name: "firebase-redirects",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  plugins: [react(), guidesDevServer(), firebaseRedirects()],
  // Always http://localhost:3000 (and the study guides at http://guides.localhost:3000):
  // if the port is taken, it says so rather than quietly starting on another one.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    include: ["src/**/*.test.{js,jsx}", "guides/**/*.test.js", "dev/**/*.test.js"],
  },
});
