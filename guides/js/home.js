// The guides home: search, a grid of guide cards, a row of the
// ones you opened lately, and (for admins) the controls to make and change them.
import { guideCard, skeletonCard } from "./cards.js";
import { loadGuides } from "./data.js";
import { openEditor } from "./editor.js";
import { visibleGuides } from "./guides.js";
import { loadViewCounts } from "./views.js";
import { maybeAdmin, signIn, signOut, watchAdmin } from "./session.js";

const $ = (id) => document.getElementById(id);
const RECENT_KEY = "guidesRecent";

const params = new URLSearchParams(location.search);
const state = { query: params.get("q") || "", sort: params.get("o") === "az" ? "az" : "newest" };
let guides = [];
let admin = false;
let loaded = false;

function recentIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function syncUrl() {
  const next = new URLSearchParams();
  if (state.query) next.set("q", state.query);
  if (state.sort !== "newest") next.set("o", state.sort);
  const text = next.toString();
  history.replaceState(null, "", text ? `?${text}` : location.pathname);
}

function showMessage(title, text) {
  const box = $("message");
  box.replaceChildren(Object.assign(document.createElement("h2"), { textContent: title }), Object.assign(document.createElement("p"), { textContent: text }));
  box.hidden = false;
}

function render() {
  if (!loaded) return;
  $("message").hidden = true;
  $("sort").value = state.sort;
  const shown = visibleGuides(guides, state);
  const options = { admin, onEdit: edit };
  $("grid").replaceChildren(...shown.map((guide) => guideCard(guide, options)));

  const filtering = Boolean(state.query);
  const recent = filtering ? [] : recentIds().map((id) => guides.find((guide) => guide.id === id)).filter(Boolean).slice(0, 4);
  $("recent").hidden = recent.length === 0;
  $("recent-grid").replaceChildren(...recent.map((guide) => guideCard(guide, options)));

  $("count").textContent = shown.length === 1 ? "1 guide" : `${shown.length} guides`;
  $("count").hidden = guides.length === 0;
  if (guides.length === 0) showMessage("No guides yet", admin ? "Use New guide to add the first one." : "Check back soon.");
  else if (shown.length === 0) showMessage("No guides match", "Try a different word.");
}

async function refresh() {
  $("grid").replaceChildren(...Array.from({ length: 8 }, skeletonCard));
  $("count").hidden = true;
  $("message").hidden = true;
  try {
    guides = await loadGuides({ admin });
    loaded = true;
    render();
  } catch (error) {
    console.error("Couldn't load guides:", error);
    $("grid").replaceChildren();
    showMessage("Couldn't load guides", "Check your connection and reload the page.");
  }
}

// For an admin: how many different browsers have read each guide, which a guide
// page of its own (like /biology) shows here too.
async function showViews() {
  const box = $("views");
  if (!box.hidden) {
    box.hidden = true;
    return;
  }
  const note = $("views-note");
  const list = $("views-list");
  box.hidden = false;
  note.textContent = "Counting…";
  list.replaceChildren();
  try {
    const counts = await loadViewCounts();
    const total = counts.reduce((sum, row) => sum + row.views, 0);
    note.textContent = counts.length === 0 ? "No one has read a guide yet." : `${total} ${total === 1 ? "reader" : "readers"} in all. Each browser counts once per guide.`;
    list.replaceChildren(
      ...counts.map((row) => {
        const item = document.createElement("li");
        const title = (guides.find((guide) => guide.id === row.guide) || {}).title;
        const link = Object.assign(document.createElement("a"), { href: `/${encodeURIComponent(row.guide)}`, textContent: title || row.guide });
        item.append(link, Object.assign(document.createElement("span"), { textContent: String(row.views) }));
        return item;
      })
    );
  } catch (error) {
    console.error("Couldn't load views:", error);
    note.textContent = "Couldn't load the counts.";
  }
}

function edit(guide) {
  openEditor({ guide, onSaved: refresh, onDeleted: refresh });
}

function setAdmin(next, rejected) {
  // The note stays through the sign-out that follows a refusal, until the next try.
  if (rejected) $("admin-note").textContent = "That account isn't an admin's. ";
  else if (next) $("admin-note").textContent = "";
  $("admin-actions").hidden = !next;
  if (!next) $("views").hidden = true;
  $("sign-in").hidden = next;
  if (next !== admin) {
    admin = next;
    refresh();
  } else if (loaded) {
    render();
  }
}

// Search as you type, but not on every keystroke.
let typing = 0;
$("search").value = state.query;
$("search").addEventListener("input", (event) => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    state.query = event.target.value.trim();
    syncUrl();
    render();
  }, 120);
});
$("sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  syncUrl();
  render();
});

$("new-guide").addEventListener("click", () => openEditor({ onSaved: refresh }));
$("show-views").addEventListener("click", showViews);
$("sign-in").addEventListener("click", async () => {
  $("admin-note").textContent = "";
  try {
    await watchAdmin(({ admin: isAdmin, rejected }) => setAdmin(isAdmin, rejected));
    await signIn();
  } catch (error) {
    if (error && error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
      console.error("Sign-in failed:", error);
      $("admin-note").textContent = "Couldn't sign in. ";
    }
  }
});
$("sign-out").addEventListener("click", () => signOut());

// Someone who has signed in as an admin before gets their session back (and
// the admin controls) without pressing anything.
if (maybeAdmin()) watchAdmin(({ admin: isAdmin, rejected }) => setAdmin(isAdmin, rejected));

refresh();
