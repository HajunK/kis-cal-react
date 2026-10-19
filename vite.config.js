import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One page, index.html; React Router picks the tab from the path, and every
// path serves it (see firebase.json's rewrite). public/ (styles, images, the
// vendored scripts) is copied into the build unchanged.

// firebase.json's redirects (/ to /domain, old page names), applied by the dev
// and preview servers too, read from that file so the two can't drift apart.
function firebaseRedirects() {
  const { hosting } = JSON.parse(readFileSync(new URL("firebase.json", import.meta.url), "utf8"));
  const redirects = new Map((hosting.redirects || []).map(({ source, destination }) => [source, destination]));
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
  plugins: [react(), firebaseRedirects()],
  test: {
    include: ["src/**/*.test.{js,jsx}", "functions/**/*.test.js"],
  },
});
