// The bell schedule and when assessments happen. Everything takes the school
// data it needs as arguments:
//   dayTypes: { [iso]: "A" | "B" }; a date without an entry is unset ("?").
//   periodTimes: the periodTimes/default doc ({ times, testingBlock, advisory,
//     academicSupport, daySchedules }), or null when there's no schedule.

import { fromISODate, toISODate } from "./dates.js";

// Every A and B day has the same shape; slot maps a block to periodIndex slot
// (A) or slot + 4 (B).
export const SCHEDULE_BLOCKS = [
  { type: "class", slot: 0, label: "Period 1/5" },
  { type: "class", slot: 1, label: "Period 2/6" },
  { type: "lunch", label: "Lunch" },
  { type: "class", slot: 2, label: "Period 3/7" },
  { type: "class", slot: 3, label: "Period 4/8" },
];

// The Bell Schedule's slots, whose times are the same every day. blockN is
// SCHEDULE_BLOCKS[N] (and times[N]); the others are their own fields.
export const SCHEDULE_EVENT_KEYS = ["testingBlock", "advisory", "block0", "block1", "block2", "block3", "block4", "academicSupport"];

// Until an admin saves one in the Bell Schedule.
export const TESTING_BLOCK_FALLBACK_TIMES = { start: "08:00", end: "08:50" };
export const ACADEMIC_SUPPORT_FALLBACK_TIMES = { start: "15:25", end: "16:00" };

export function isReassessment(entry) {
  return /reassess/i.test(entry.type);
}

export function academicSupportTimes(periodTimes) {
  return (periodTimes && periodTimes.academicSupport) || ACADEMIC_SUPPORT_FALLBACK_TIMES;
}

// Periods 1-4 meet on A days and 5-8 on B days. Unset days, Testing Blocks
// (school-wide) and reassessments (in Academic Support) are visible to every
// period.
export function isAssessmentVisibleForPeriod(entry, periodIndex, dayTypes) {
  if (periodIndex == null || entry.type === "Testing Block" || isReassessment(entry)) return true;
  const dayType = dayTypes[entry.date];
  if (dayType === "A") return periodIndex < 4;
  if (dayType === "B") return periodIndex >= 4;
  return true;
}

// What a slot normally holds on a date: itself, except a class slot, which
// holds that day's period (period1-4 on an A day, period5-8 on a B day), or
// both ("Period 1/5", its own key) on a day not yet set A or B.
export function defaultScheduleEvent(slot, dayType) {
  if (!slot.startsWith("block")) return slot;
  const block = SCHEDULE_BLOCKS[Number(slot.slice(5))];
  if (block.type !== "class" || (dayType !== "A" && dayType !== "B")) return slot;
  return `period${block.slot + (dayType === "A" ? 1 : 5)}`;
}

// An event's normal times, which are also the times of its slot.
export function scheduleEventTimes(key, periodTimes) {
  if (!periodTimes) return null;
  if (key === "testingBlock") return periodTimes.testingBlock || TESTING_BLOCK_FALLBACK_TIMES;
  if (key === "advisory") return periodTimes.advisory || null;
  if (key === "academicSupport") return academicSupportTimes(periodTimes);
  return (periodTimes.times || [])[Number(key.slice(5))] || null;
}

// A date's schedule: [{ key, start, end }] in time order. Slots and their times
// are the same every day; normally each holds its own event (the day's period
// in a class slot), the Testing Block on Mondays and Fridays and Advisory on
// other weekdays. An admin can rearrange a single date (daySchedules[iso]):
// which event sits in which slot, any period included, and which slots are
// used at all.
export function scheduleForDate(iso, dayTypes, periodTimes) {
  const weekday = fromISODate(iso).getDay();
  if (weekday === 0 || weekday === 6 || !periodTimes) return [];
  const dayType = dayTypes[iso];
  const custom = periodTimes.daySchedules && periodTimes.daySchedules[iso];
  const included = (key) => {
    if (custom && Array.isArray(custom.included)) return custom.included.includes(key);
    if (key === "testingBlock") return weekday === 1 || weekday === 5;
    if (key === "advisory") return weekday !== 1 && weekday !== 5;
    return true;
  };
  return SCHEDULE_EVENT_KEYS.map((slot) => ({ slot, time: scheduleEventTimes(slot, periodTimes) }))
    .filter(({ time }) => time && time.start && time.end)
    .sort((a, b) => (a.time.start < b.time.start ? -1 : a.time.start > b.time.start ? 1 : 0))
    .map(({ slot, time }) => ({
      key: (custom && custom.slots && custom.slots[slot]) || defaultScheduleEvent(slot, dayType),
      start: time.start,
      end: time.end,
    }))
    .filter(({ key }) => included(key));
}

// When an event happens on a date, or null if it doesn't that day.
export function scheduledTimeOn(iso, key, dayTypes, periodTimes) {
  return scheduleForDate(iso, dayTypes, periodTimes).find((event) => event.key === key) || null;
}

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// From the first event's start to the last one's end, on any weekday, A/B set
// or not, since the bell rings the same either way.
export function isDuringSchool(now, dayTypes, periodTimes) {
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  if (!periodTimes) return false;

  let first = null;
  let last = null;
  scheduleForDate(toISODate(now), dayTypes, periodTimes).forEach((time) => {
    if (!time || !time.start || !time.end) return;
    const start = toMinutes(time.start);
    const end = toMinutes(time.end);
    if (first === null || start < first) first = start;
    if (last === null || end > last) last = end;
  });
  if (first === null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return nowMinutes >= first && nowMinutes < last;
}

// null when it can't be told (no schedule, or the class doesn't meet that day);
// it then counts until the day is over.
export function assessmentEndsAt(entry, periodIndex, dayTypes, periodTimes) {
  if (!periodTimes && !isReassessment(entry)) return null;
  let end = null;
  // Wherever that date's schedule puts the event, falling back to its normal
  // times for the Testing Block and Academic Support.
  if (isReassessment(entry)) {
    end = (scheduledTimeOn(entry.date, "academicSupport", dayTypes, periodTimes) || academicSupportTimes(periodTimes)).end;
  } else if (entry.type === "Testing Block") {
    end = (
      scheduledTimeOn(entry.date, "testingBlock", dayTypes, periodTimes) ||
      periodTimes.testingBlock ||
      TESTING_BLOCK_FALLBACK_TIMES
    ).end;
  } else {
    if (periodIndex === undefined || periodIndex === null) return null;
    // Only on a date the period meets.
    const time = scheduledTimeOn(entry.date, `period${periodIndex + 1}`, dayTypes, periodTimes);
    end = time && time.end;
  }
  if (!end) return null;
  const [hours, minutes] = end.split(":").map(Number);
  const date = fromISODate(entry.date);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function assessmentStillUpcoming(entry, periodIndex, now, dayTypes, periodTimes) {
  const today = toISODate(now);
  if (entry.date !== today) return entry.date > today;
  const endsAt = assessmentEndsAt(entry, periodIndex, dayTypes, periodTimes);
  return !endsAt || now < endsAt;
}
