// What the home page does with the list of guides, apart from drawing it.
import { SUBJECTS, subjectLabel } from "./config.js";

// "Cell respiration: the whole process!" -> "cell-respiration-the-whole-process"
export function slugify(text) {
  const slug = String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "guide";
}

// A guide's address: its title, and a few random characters so two guides
// with the same title don't share one.
export function newGuideId(title, random = () => Math.random().toString(36).slice(2, 6)) {
  return `${slugify(title)}-${random()}`;
}

// Every word typed has to be somewhere in the guide's title, course, test or subject.
export function guideMatches(guide, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [guide.title, guide.course, guide.test, subjectLabel(guide.subject)].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

// What the grid shows: filtered by search and subject, in the order asked for.
export function visibleGuides(guides, { query = "", subject = "all", sort = "newest" } = {}) {
  const shown = guides.filter((guide) => (subject === "all" || guide.subject === subject) && guideMatches(guide, query));
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));
  return shown.sort(sort === "az" ? byTitle : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || byTitle(a, b));
}

// The subjects that have guides, in the usual order, each with its count.
export function subjectsIn(guides) {
  return SUBJECTS.map((subject) => ({ ...subject, count: guides.filter((guide) => guide.subject === subject.id).length })).filter(
    (subject) => subject.count > 0
  );
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
