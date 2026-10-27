// The Calendar's decisions, with nothing on the page: which assessments are a
// student's, their colors, when each is due, what's still upcoming, and the
// cleanups its data needs. Carried over from my-courses.js; everything it
// needs comes in as arguments.

import { effectiveCourseName, findCourseCatalogEntry } from "../core/catalog.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { TESTING_BLOCK_FALLBACK_TIMES, academicSupportTimes, isReassessment, scheduledTimeOn } from "../core/schedule.js";

export const CAL_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// With no division picked yet, any division could be the student's, so all are
// matched. periodIndex lets A/B-day assessments show only when this period
// meets. resolvedNames: courses whose division is picked, which then go by
// their plain name.
export function matchEntries(periods, divisions) {
  const entries = [];
  const resolvedNames = new Set();
  periods.forEach((name, index) => {
    const trimmed = (name || "").trim();
    if (trimmed === "") return;

    const course = findCourseCatalogEntry(trimmed);
    const divisionOptions = course && course.divisions;
    if (!divisionOptions || divisionOptions.length === 0) {
      entries.push({ name: trimmed, periodIndex: index });
      return;
    }

    const picked = divisions[index] || "";
    if (picked) {
      entries.push({ name: effectiveCourseName(trimmed, picked), periodIndex: index });
      resolvedNames.add(trimmed);
    } else {
      divisionOptions.forEach((division) => entries.push({ name: effectiveCourseName(trimmed, division), periodIndex: index }));
    }
  });
  return { matchEntries: entries, resolvedNames };
}

// Yellow and lime are skipped: too faint for a dot or pill text on a light
// background.
export const COURSE_COLOR_PALETTE = ["red", "dark-blue", "orange", "purple", "light-blue", "green", "pink", "teal"];

export const COURSE_COLOR_CHOICES = [
  "red", "coral", "orange", "amber", "yellow", "lime", "true-green", "green",
  "teal", "cyan", "light-blue", "dark-blue", "indigo", "purple", "magenta", "pink",
  "rose", "brown", "slate", "gray",
];

// Keyed by the typed name, so a course in two periods keeps one color. picked:
// the courseColors preference (name -> color name).
export function courseColorNames(periods, picked = {}) {
  const colors = new Map();
  periods.forEach((name) => {
    const trimmed = (name || "").trim();
    if (trimmed === "" || colors.has(trimmed)) return;
    const fallback = COURSE_COLOR_PALETTE[colors.size % COURSE_COLOR_PALETTE.length];
    colors.set(trimmed, COURSE_COLOR_CHOICES.includes(picked[trimmed]) ? picked[trimmed] : fallback);
  });
  return colors;
}

// The same, as CSS colors.
export function courseColorVars(colorNames) {
  return new Map([...colorNames].map(([name, color]) => [name, `var(--color-${color})`]));
}

// Reassessments are a custom type, so they're recognized by name.
export function assessmentCategory(entry) {
  if (isReassessment(entry)) return "reassessment";
  if (entry.type === "In-Class" || entry.type === "Testing Block" || entry.type === "Summative") return "summative";
  if (entry.type === "Homework" || entry.type === "Assignment") return "assignment";
  return "formative";
}

// How a day's pills are stacked, top to bottom: Testing Blocks, In-Classes,
// Formatives, every other type of assessment, then assignments (the student's
// own). Rank 0 to 4. A plain "Summative" (an older type) is drawn exactly like an
// In-Class, so it goes with the In-Classes rather than under "other".
export function dayPillRank(entry) {
  if (assessmentCategory(entry) === "assignment") return 4;
  if (entry.type === "Testing Block") return 0;
  if (entry.type === "In-Class" || entry.type === "Summative") return 1;
  if (entry.type === "Formative") return 2;
  return 3;
}

// By date, then within a day by dayPillRank, then (among the same kind) by the
// period of the class, 1 to 8: the A day's classes are periods 1 to 4 and the
// B day's 5 to 8, so this is the order they meet that day. Anything still tied
// keeps the order it came in. periodIndexOf(entry) is the 0-based period of the
// entry's class.
export function sortDayEntries(entries, periodIndexOf) {
  return entries
    .slice()
    .sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        dayPillRank(a) - dayPillRank(b) ||
        periodIndexOf(a) - periodIndexOf(b)
    );
}

export function stripDivisionSuffix(courseName) {
  return courseName.replace(/ \([^)]*\)$/, "");
}

// The school year's start: this August, or last year's before August.
export function latestAugustFirst(today = new Date()) {
  return new Date(today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1, 7, 1);
}

export function startOfWeek(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

// The dates the Calendar draws, first to last as YYYY-MM-DD: from the start of
// the week the school year's August 1 falls in, to the end of the week
// weeksAhead weeks on from this one's start. Anything outside it isn't on the
// calendar, so isn't in Upcoming either.
export function calendarDateRange(weeksAhead, today = new Date()) {
  const thisWeekStart = startOfWeek(today);
  const last = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() + weeksAhead * 7 - 1);
  return { start: toISODate(startOfWeek(latestAugustFirst(today))), end: toISODate(last) };
}

// A Testing Block is just a summative here.
export function upcomingTitle(entry, courseLabel) {
  if (assessmentCategory(entry) === "assignment") return entry.title || "Assignment";
  const type = entry.type === "In-Class" || entry.type === "Testing Block" ? "Summative" : entry.type;
  return `${courseLabel} ${type}`;
}

export function formatClockTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export function upcomingTimeLabel(dueTime, periodIndex) {
  if (dueTime === "start") return "";
  if (dueTime === "period") return periodIndex === undefined ? "" : `Period ${periodIndex + 1}`;
  return formatClockTime(dueTime);
}

// Like Google Tasks' date chip. today: an ISO date. formatDate: the Date format
// preference's.
export function upcomingDateLabel(iso, today, formatDate) {
  const date = fromISODate(iso);
  const days = Math.round((date - fromISODate(today)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return `${CAL_WEEKDAY_LABELS[date.getDay()]}, ${formatDate(date)}`;
}

// When something is due: a reassessment as Academic Support starts, a Testing
// Block as it starts, an assessment as its class starts, an assignment at its
// set time (the start of the day unless it says). null for a class time when
// there's no bell schedule or the class doesn't meet that day.
export function upcomingDueAt(entry, periodIndex, dayTypes, periodTimes) {
  const at = (hhmm) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const date = fromISODate(entry.date);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };
  if (isReassessment(entry)) {
    return at((scheduledTimeOn(entry.date, "academicSupport", dayTypes, periodTimes) || academicSupportTimes(periodTimes)).start);
  }
  if (entry.type === "Testing Block") {
    const time =
      scheduledTimeOn(entry.date, "testingBlock", dayTypes, periodTimes) ||
      (periodTimes && periodTimes.testingBlock) ||
      TESTING_BLOCK_FALLBACK_TIMES;
    return at(time.start);
  }
  const dueTime = assessmentCategory(entry) === "assignment" ? entry.dueTime || "start" : "period";
  if (/^\d{1,2}:\d{2}$/.test(dueTime)) return at(dueTime);
  if (dueTime === "start") return at("00:00");
  const times = periodTimes && periodTimes.times;
  if (!times) return null;
  // Only on a day the period actually meets.
  if (periodIndex === undefined) return null;
  const time = scheduledTimeOn(entry.date, `period${periodIndex + 1}`, dayTypes, periodTimes);
  return time ? at(time.start) : null;
}

const CAL_WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Who an assessment is from, for its details: "You" (the student added it and it
// isn't on the school's calendar yet), "You (Confirmed)" (they suggested it and an
// admin accepted it), "Classmate" (another student suggested it and it was accepted)
// or "Your school" (the school put it there itself).
export function addedByLabel({ added, confirmed, fromStudent }) {
  if (added) return "You";
  if (confirmed) return "You (Confirmed)";
  if (fromStudent) return "Classmate";
  return "Your school";
}

// What the card a clicked pill opens says, as { title, subtitle, rows, done }:
// rows are [label, value] pairs. dueAt: when it's due (a Date) or null;
// endsAt: when it ends (a Date) or null; formatDate: the Date format preference's;
// addedBy: who it's from (see addedByLabel).
export function pillDetails(entry, { courseLabel, periodIndex, dueAt, endsAt, formatDate, addedBy, done }) {
  const assignment = assessmentCategory(entry) === "assignment";
  const date = fromISODate(entry.date);
  const clockOf = (when) => formatClockTime(`${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`);
  const period = periodIndex === undefined ? "" : `Period ${periodIndex + 1}`;

  let time = "";
  if (assignment) {
    if (/^\d{1,2}:\d{2}$/.test(entry.dueTime || "")) time = formatClockTime(entry.dueTime);
    else if (entry.dueTime === "period") time = dueAt ? `${period}, ${clockOf(dueAt)}` : period;
    else time = "Start of the day";
  } else if (entry.type === "Testing Block") {
    // Just when it starts: the card's subtitle already says what it is.
    time = dueAt ? clockOf(dueAt) : "";
  } else if (dueAt) {
    // When it runs: its start to its end (the class's, for a class's own assessment).
    time = endsAt ? `${clockOf(dueAt)} – ${clockOf(endsAt)}` : clockOf(dueAt);
  }

  const rows = [["Date", `${CAL_WEEKDAY_LONG[date.getDay()]}, ${formatDate(date)}`]];
  if (time) rows.push([assignment ? "Due" : "Time", time]);
  rows.push(["Added by", addedBy]);
  return {
    title: upcomingTitle(entry, courseLabel),
    subtitle: assignment ? courseLabel : entry.type === "Testing Block" ? "Morning Testing Block" : period,
    rows,
    done: Boolean(done),
  };
}

// How late something is, in its largest whole unit: "14s late", "5m late",
// "3h late", "2d late". Never under a second, so it doesn't read "0s late" the
// instant it's due.
export function lateLabel(ms) {
  const seconds = Math.max(1, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s late`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m late`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h late`;
  return `${Math.floor(hours / 24)}d late`;
}

// By the actual moment due, so midnight homework comes before a Period 1
// formative that day. Unknown times go just after that day's midnight.
export function upcomingSortTime(entry, periodIndex, dayTypes, periodTimes) {
  const dueAt = upcomingDueAt(entry, periodIndex, dayTypes, periodTimes);
  return dueAt ? dueAt.getTime() : fromISODate(entry.date).getTime() + 1;
}

// Completed tasks as { id, completedAt }; older saves stored bare ids.
export function normalizeCompletedRecords(records, now = Date.now()) {
  return records.map((record) => (typeof record === "string" ? { id: record, completedAt: now } : record));
}

// Only courses that are unambiguous now (no divisions, or one picked).
// periodIndex lets the Add popup judge visibility the way the calendar does.
export function addableCourseOptions(periods, divisions) {
  const options = [];
  periods.forEach((name, index) => {
    const trimmed = (name || "").trim();
    if (trimmed === "") return;

    const course = findCourseCatalogEntry(trimmed);
    const divisionOptions = course && course.divisions;
    if (!divisionOptions || divisionOptions.length === 0) {
      options.push({ displayName: trimmed, courseName: trimmed, periodIndex: index });
      return;
    }

    const picked = divisions[index] || "";
    if (picked) options.push({ displayName: trimmed, courseName: effectiveCourseName(trimmed, picked), periodIndex: index });
  });
  return options;
}

// Not cryptographic: it only needs a stable doc id so repeat suggestions land
// on one doc.
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// arrayUnion makes a repeat suggestion from the same email a no-op, so
// emails.length is the count.
export function suggestedAssessmentDocId(date, courseName, type) {
  return simpleHash(`${date}|${courseName}|${type}`);
}

// The next count days this period meets (after today), up to 120 days out.
// With no school calendar set up, every weekday counts.
export function upcomingClassDays(periodIndex, count, dayTypes, today = new Date()) {
  const days = [];
  const hasSchoolCalendar = Object.keys(dayTypes).length > 0;
  for (let offset = 1; offset <= 120 && days.length < count; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dayType = dayTypes[toISODate(date)];
    const meets = hasSchoolCalendar
      ? (dayType === "A" && periodIndex < 4) || (dayType === "B" && periodIndex >= 4)
      : date.getDay() !== 0 && date.getDay() !== 6;
    if (meets) days.push(date);
  }
  return days;
}

// A suggested Summative may come back as In-Class or Testing Block.
export const SUMMATIVE_TYPES = ["Summative", "In-Class", "Testing Block"];

// The student's own assessments an admin has since put on the school calendar:
// own id -> the school entry's id. Only an exact match the student's section
// can see counts (isVisible(entry, periodIndex)); assignments never do.
export function acceptedReplacements(added, schoolAssessments, periodIndexOf, isVisible) {
  const sameKind = (mine, school) => mine.type === school.type || (mine.type === "Summative" && SUMMATIVE_TYPES.includes(school.type));
  const replacedBy = new Map();
  added.forEach((mine) => {
    if (assessmentCategory(mine) === "assignment") return;
    const school = schoolAssessments.find(
      (entry) =>
        entry.date === mine.date &&
        entry.courseName === mine.courseName &&
        sameKind(mine, entry) &&
        isVisible(entry, periodIndexOf.get(mine.courseName))
    );
    if (school) replacedBy.set(mine.id, school.id);
  });
  return replacedBy;
}

// A checked-off own copy passes its done state on to the school entry that
// replaced it, unless that's already checked off.
export function carriedCompletions(completed, replacedBy) {
  const completedIds = new Set(completed.map((record) => (typeof record === "string" ? record : record.id)));
  return completed
    .filter((record) => typeof record !== "string" && replacedBy.has(record.id))
    .map((record) => ({ id: replacedBy.get(record.id), completedAt: record.completedAt }))
    .filter((record) => !completedIds.has(record.id));
}
