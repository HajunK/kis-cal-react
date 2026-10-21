// What the home page does with the list of guides, apart from drawing it.
// A guide's key is its address (guides.kiscal.app/<key>) and the name of its
// document. Lowercase words joined by single hyphens, 2 to 40 characters, and not
// a name the site already uses for something else.
export const RESERVED_KEYS = ["guide", "index", "js", "icons", "fonts"];
const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizeKey = (text) => String(text || "").trim().toLowerCase();

// null when the key will do, else what's wrong with it.
export function keyProblem(text) {
  const key = normalizeKey(text);
  if (!key) return "Enter a key: it's the guide's address, like biology.";
  if (key.length < 2 || key.length > 40) return "The key has to be 2 to 40 characters.";
  if (!KEY_PATTERN.test(key)) return "Use only letters, numbers and single hyphens in the key (no spaces).";
  if (RESERVED_KEYS.includes(key)) return `"${key}" is used by the site itself. Choose another key.`;
  return null;
}

// Every word typed has to be somewhere in the guide's title, course, test or key.
export function guideMatches(guide, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [guide.title, guide.course, guide.test, guide.id].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

// What the grid shows: filtered by search, in the order asked for.
export function visibleGuides(guides, { query = "", sort = "newest" } = {}) {
  const shown = guides.filter((guide) => guideMatches(guide, query));
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));
  return shown.sort(sort === "az" ? byTitle : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || byTitle(a, b));
}

export const minutesLabel = (minutes) => (Number(minutes) > 0 ? `${Math.round(Number(minutes))} min` : "");

// "Updated Oct 12", with the year once it isn't this one.
export function updatedLabel(ms, now = new Date()) {
  if (!ms) return "";
  const date = new Date(ms);
  const options = date.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" };
  return `Updated ${date.toLocaleDateString("en-US", options)}`;
}

// The most recently opened guides' ids, newest first, each once.
export function withRecent(ids, id, max = 8) {
  return [id, ...ids.filter((other) => other !== id)].slice(0, max);
}
