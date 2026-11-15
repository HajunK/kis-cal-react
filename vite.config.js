import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { guidesDevServer } from "./dev/guidesServer.js";

// One page, index.html; React Router picks the tab from the path, and every
// path serves it (see firebase.json's rewrite). public/ (styles, images, the
// vendored scripts) is copied into the build unchanged.

// firebase.json's redirects (/ to /domain, old page names), applied by the dev
// and preview servers too, read from that file so the two can't drift apart. The
// admin site (admin.localhost, see src/app/site.js) has its own list, as its Hosting
// site does. A redirect to another address (the old admin paths, to the admin site) isn't
// followed here: in development the student site just doesn't have those pages.
function firebaseRedirects() {
  // hosting is a list, one entry per Hosting site (the app's, the admin site's, guides/'s).
  const { hosting } = JSON.parse(readFileSync(new URL("firebase.json", import.meta.url), "utf8"));
  const built = [].concat(hosting).filter((site) => site.public === "dist");
  const listOf = (site) =>
    new Map(((site && site.redirects) || []).filter(({ destination }) => destination.startsWith("/")).map(({ source, destination }) => [source, destination]));
  const student = listOf(built.find((site) => site.site !== "kiscal-admin"));
  const admin = listOf(built.find((site) => site.site === "kiscal-admin"));
  const middleware = (req, res, next) => {
    const [path, query = ""] = req.url.split("?");
    const destination = (/^admin\./i.test(req.headers.host || "") ? admin : student).get(path);
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
  // Always http://localhost:3000 (the study guides at http://guides.localhost:3000, the admin
  // site at http://admin.localhost:3000):
  // if the port is taken, it says so rather than quietly starting on another one.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    include: ["src/**/*.test.{js,jsx}", "guides/**/*.test.js", "dev/**/*.test.js"],
  },
});
