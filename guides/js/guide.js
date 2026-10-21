// One guide: its title, where it belongs, its picture and its text.
import { subjectLabel } from "./config.js";
import { loadGuide } from "./data.js";
import { openEditor } from "./editor.js";
import { minutesLabel, updatedLabel, withRecent } from "./guides.js";
import { renderMarkdown } from "./markdown.js";
import { maybeAdmin, watchAdmin } from "./session.js";

const $ = (id) => document.getElementById(id);
const RECENT_KEY = "guidesRecent";

// /g/<id> (the site's rewrite), or guide.html?id=<id>.
const idFromAddress = () => {
  const path = /^\/g\/([^/]+)/.exec(location.pathname);
  return path ? decodeURIComponent(path[1]) : new URLSearchParams(location.search).get("id");
};

const id = idFromAddress();
let guide = null;
let admin = false;

function note(title, text) {
  const box = document.createElement("div");
  box.className = "message";
  box.append(Object.assign(document.createElement("h2"), { textContent: title }), Object.assign(document.createElement("p"), { textContent: text }));
  $("content").replaceChildren(box);
}

function remember() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(Array.isArray(ids) ? ids : [], id)));
  } catch {
    // Storage is optional.
  }
}

function render() {
  if (!guide) return;
  document.title = `${guide.title} · KIS Cal Guides`;
  const title = Object.assign(document.createElement("h1"), { textContent: guide.title });
  const meta = Object.assign(document.createElement("p"), {
    className: "meta",
    textContent: [guide.course, guide.test, subjectLabel(guide.subject), minutesLabel(guide.minutes), updatedLabel(guide.updatedAt)].filter(Boolean).join(" · "),
  });
  const parts = [title, meta];
  if (!guide.published) {
    parts.unshift(Object.assign(document.createElement("p"), { className: "meta", textContent: "Draft: only admins can see this guide." }));
  }
  if (guide.thumbnailUrl) {
    parts.push(Object.assign(document.createElement("img"), { className: "cover", src: guide.thumbnailUrl, alt: "" }));
  }
  const body = document.createElement("div");
  body.className = "prose";
  // renderMarkdown escapes everything it doesn't turn into one of its own tags.
  body.innerHTML = renderMarkdown(guide.body);
  parts.push(body);
  $("content").replaceChildren(...parts);
  $("admin-actions").hidden = !admin;
}

async function load() {
  if (!id) return note("Guide not found", "That address doesn't point to a guide.");
  try {
    guide = await loadGuide(id);
  } catch (error) {
    // A draft is refused to anyone but an admin, as if it weren't there.
    console.error("Couldn't load guide:", error);
    guide = null;
    return note("Couldn't open this guide", "It may not be published yet, or the connection dropped.");
  }
  if (!guide) return note("Guide not found", "It may have been removed.");
  remember();
  render();
}

$("edit-guide").addEventListener("click", () => openEditor({ guide, onSaved: load, onDeleted: () => (location.href = "/") }));

if (maybeAdmin()) {
  watchAdmin(({ admin: isAdmin }) => {
    const changed = isAdmin !== admin;
    admin = isAdmin;
    // A draft needs the admin's session to be read at all.
    if (changed) load();
    else render();
  });
}

load();
