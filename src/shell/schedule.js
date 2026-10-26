// What's on right now, from class-countdown.js: the countdown pill and
// Domain's class-in-session card both read it.

import { toISODate } from "../core/dates.js";
import { allDayTypes, defaultPeriodTimes, scheduleForDate } from "./school.js";

export function parseTimeToMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// Only ever about right now, never ahead: null outside school hours, on unset
// days, or with no bell schedule.
export function currentScheduleBlock() {
  const now = new Date();
  const iso = toISODate(now);
  const dayType = allDayTypes[iso];
  if (dayType !== "A" && dayType !== "B") return null;

  if (!defaultPeriodTimes) return null;

  // Fractional so the countdown ticks smoothly within each minute.
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // Every event on the day counts down, so the schedule can be opened during
  // each of them.
  for (const event of scheduleForDate(iso)) {
    let block = null;
    if (event.key === "testingBlock") block = { type: "testing" };
    else if (event.key === "advisory") block = { type: "advisory" };
    else if (event.key === "academicSupport") block = { type: "support" };
    else if (event.key.startsWith("period")) block = { type: "class", periodIndex: Number(event.key.slice(6)) - 1 };
    else if (event.key === "block2") block = { type: "lunch" };
    if (!block) continue;
    const start = parseTimeToMinutes(event.start);
    const end = parseTimeToMinutes(event.end);
    if (nowMinutes >= start && nowMinutes < end) {
      return { block, dayType, minutesLeft: end - nowMinutes };
    }
  }
  return null;
}
