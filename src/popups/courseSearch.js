import { COURSE_CATALOG } from "../core/catalog.js";

const squash = (text) => text.toLowerCase().replace(/\s+/g, "");
// Only word starts match, so "es" doesn't find Chinese; punctuation starts a
// word too (the "Dual" in Individual/Dual Pursuits). query is squashed.
const matches = (name, query) => [...name.matchAll(/[a-z0-9]+/gi)].some((word) => squash(name.slice(word.index)).startsWith(query));

// Everything each course is found by, listed once here so a search is just a
// walk over it: the name, the short name, and the aliases ("Macro" for AP
// Economics), which on an AP course also count with "AP" before them
// ("AP Macro").
const SEARCHABLE = COURSE_CATALOG.map((course) => {
  const aliases = Object.keys(course.alias || {});
  const names = [course.name, course.short, ...aliases, ...(course.ap ? aliases.map((alias) => `AP ${alias}`) : [])];
  return { course, names: names.filter(Boolean), exactShort: course.short ? squash(course.short) : null };
});
const BY_NAME = new Map(COURSE_CATALOG.map((course) => [course.name, course]));

// The courses My Courses suggests for what's typed, at most eight. Spaces
// and case don't matter ("APLit", "algebra  ii"). A course whose short name is
// exactly what's typed comes first, so "PE" leads with the PE courses.
export function matchCourses(typed) {
  const query = squash(typed);
  if (query === "") return [];
  return SEARCHABLE.filter(({ names }) => names.some((name) => matches(name, query)))
    .sort((a, b) => Number(b.exactShort === query) - Number(a.exactShort === query))
    .slice(0, 8)
    .map(({ course }) => course.name);
}

// The division to preselect when a course is picked after typing one of its
// aliases ("BC" for AP Calculus): the one that alias stands for, or "" when
// what was typed also fits the course's name or fits more than one alias.
export function aliasDivision(courseName, typed) {
  const course = BY_NAME.get(courseName);
  const query = squash(typed);
  if (!course || !course.alias || query === "" || matches(course.name, query)) return "";
  const hits = Object.entries(course.alias).filter(([alias]) => matches(alias, query) || (course.ap && matches(`AP ${alias}`, query)));
  return hits.length === 1 ? hits[0][1] : "";
}
