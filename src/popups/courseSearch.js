import { COURSE_CATALOG } from "../core/catalog.js";

// The courses My Courses suggests for what's typed, at most eight. Spaces
// and case don't matter ("APLit", "algebra  ii"), and only word starts match,
// so "es" doesn't find Chinese; punctuation starts a word too (the "Dual" in
// Individual/Dual Pursuits). A course whose short name is exactly what's typed
// comes first, so "PE" leads with the PE courses.
export function matchCourses(typed) {
  const squash = (text) => text.toLowerCase().replace(/\s+/g, "");
  const query = squash(typed);
  if (query === "") return [];
  const matches = (name) => [...name.matchAll(/[a-z0-9]+/gi)].some((word) => squash(name.slice(word.index)).startsWith(query));
  const isExactShort = (course) => Boolean(course.short) && squash(course.short) === query;
  return COURSE_CATALOG.filter((course) => matches(course.name) || (course.short && matches(course.short)))
    .sort((a, b) => Number(isExactShort(b)) - Number(isExactShort(a)))
    .slice(0, 8)
    .map((course) => course.name);
}
