// The Domain tab's page-level rules, from domain.js: which cards show, the
// upcoming-assessment label, the date picker's school year and month grid,
// and the posts' order.

import { effectiveCourseName, findCourseCatalogEntry } from "../core/catalog.js";
import { toISODate } from "../core/dates.js";

// One card per course in period order: both halves of a combo course, none
// for hidden ones. Each keeps its period (for A/B days and the class in
// session) and the division-specific name its dates are found under.
export function visibleCourseCards(periods, divisions, hiddenCourses) {
  const entries = periods
    .map((name, index) => ({ name: (name || "").trim(), division: divisions[index] || "", periodIndex: index }))
    .filter((entry) => entry.name !== "");
  if (entries.length === 0) return [];

  const hidden = new Set(hiddenCourses);
  const cards = [];
  // Not expandCourseNames, which would lose each period's index and division.
  entries.forEach(({ name, division, periodIndex }) => {
    const course = findCourseCatalogEntry(name);
    if (course && course.combo) {
      // Both cards of a combo course share its division.
      const matchName = effectiveCourseName(name, division);
      course.combo.forEach((sub) => {
        if (!hidden.has(sub.name)) cards.push({ name: sub.name, hasFinal: sub.final, matchName, periodIndex });
      });
    } else if (!hidden.has(name)) {
      cards.push({ name, hasFinal: course ? course.final : false, matchName: effectiveCourseName(name, division), periodIndex });
    }
  });
  return cards;
}

// So an empty account doesn't look broken. They disappear once a real course
// exists, and can't be hidden: they have no period to show them again from.
export const SAMPLE_CARDS = [
  { name: "Course with Finals", hasFinal: true },
  { name: "Course without Finals", hasFinal: false },
];

const FULL_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// null beyond 5 days out, which hides the line.
export function formatRelativeAssessmentLabel(date, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const daysUntil = Math.round((target - today) / 86400000);
  if (daysUntil < 0 || daysUntil > 5) return null;
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return FULL_WEEKDAY_NAMES[target.getDay()];
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const SCHOOL_YEAR_START_MONTH = 7; // August, 0-based
const SCHOOL_YEAR_END_MONTH = 6; // July, 0-based

// The date picker is limited to the current school year.
export function schoolYearBounds(today = new Date()) {
  const year = today.getFullYear();
  const startYear = today.getMonth() >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
  return {
    start: new Date(startYear, SCHOOL_YEAR_START_MONTH, 1),
    end: new Date(startYear + 1, SCHOOL_YEAR_END_MONTH, 1),
  };
}

// The month it opens on: this one, or the school year's first outside it.
export function initialPickerMonth(bounds, today = new Date()) {
  return today >= bounds.start && today < bounds.end ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(bounds.start);
}

const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

// A month's day buttons. The weeks are filled out with neighboring months'
// days, which can be picked too.
export function pickerMonth(displayedMonth, bounds, today = new Date()) {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = toISODate(today);
  const days = [];
  const addDay = (date, outside) => days.push({ date, iso: toISODate(date), outside, today: toISODate(date) === todayIso });
  for (let i = firstWeekday; i > 0; i--) addDay(new Date(year, month, 1 - i), true);
  for (let day = 1; day <= daysInMonth; day++) addDay(new Date(year, month, day), false);
  const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  for (let i = 1; i <= trailing; i++) addDay(new Date(year, month + 1, i), true);
  return {
    label: `${MONTH_NAMES[month]} ${year}`,
    atStart: sameMonth(displayedMonth, bounds.start),
    atEnd: sameMonth(displayedMonth, bounds.end),
    days,
  };
}

// Newest first.
export function sortPosts(posts) {
  return posts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
