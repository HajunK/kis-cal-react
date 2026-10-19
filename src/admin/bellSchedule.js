// The Bell Schedule popup's model. Each event (a period, Lunch, Advisory...)
// has its own times for the date, and the day's events are always in time
// order.
//
// sched: { times, testingBlock, academicSupport, advisory, daySchedules }, the
// periodTimes/default doc as loaded (null parts where there's none yet).
// dayTypes: { [iso]: "A" | "B" }.

// Mirrors SCHEDULE_BLOCKS in src/core/schedule.js.
const SCHEDULE_BLOCK_LABELS = ["Period 1/5", "Period 2/6", "Lunch", "Period 3/7", "Period 4/8"];
// Which period the class slots (block0, 1, 3, 4) hold on an A day; a B day's
// is 4 more.
const BLOCK_PERIOD_SLOTS = [0, 1, null, 2, 3];
// The Bell Schedule's slots. blockN is times[N]; the others are their own
// fields. Mirrors SCHEDULE_EVENT_KEYS in src/core/schedule.js.
const SCHEDULE_EVENT_KEYS = ["testingBlock", "advisory", "block0", "block1", "block2", "block3", "block4", "academicSupport"];
const PERIOD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `period${n}`);
const SCHEDULE_EVENT_LABELS = {
  testingBlock: "Testing Block",
  advisory: "Advisory",
  academicSupport: "Academic Support",
  ...Object.fromEntries(SCHEDULE_BLOCK_LABELS.map((label, index) => [`block${index}`, label])),
  ...Object.fromEntries(PERIOD_KEYS.map((key, index) => [key, `Period ${index + 1}`])),
};

// Seeded the first time a day is marked A or B, so there's a sensible schedule
// without a trip through the Bell Schedule first.
export const DEFAULT_SCHEDULE_TIMES = [
  { start: "08:50", end: "10:13" },
  { start: "10:18", end: "11:41" },
  { start: "11:41", end: "12:30" },
  { start: "12:30", end: "13:53" },
  { start: "13:58", end: "15:21" },
];
export const DEFAULT_TESTING_BLOCK_TIMES = { start: "08:00", end: "08:50" };
export const DEFAULT_ACADEMIC_SUPPORT_TIMES = { start: "15:25", end: "16:00" };
export const DEFAULT_ADVISORY_TIMES = { start: "08:20", end: "08:45" };

// A slot's normal times.
function eventTimes(key, sched) {
  if (key === "testingBlock") return sched.testingBlock || DEFAULT_TESTING_BLOCK_TIMES;
  if (key === "advisory") return sched.advisory || DEFAULT_ADVISORY_TIMES;
  if (key === "academicSupport") return sched.academicSupport || DEFAULT_ACADEMIC_SUPPORT_TIMES;
  const index = Number(key.slice(5));
  return (sched.times && sched.times[index]) || DEFAULT_SCHEDULE_TIMES[index];
}

// Normally the Testing Block is Mondays and Fridays, Advisory the other
// weekdays, and everything else every weekday.
function normallyIncluded(key, weekday) {
  if (key === "testingBlock") return weekday === 1 || weekday === 5;
  if (key === "advisory") return weekday !== 1 && weekday !== 5;
  return true;
}

// What a slot normally holds: itself, except a class slot, which holds the
// day's period, or both ("Period 1/5") on a day not set A or B.
function defaultScheduleEvent(slot, dayType) {
  const periodSlot = slot.startsWith("block") ? BLOCK_PERIOD_SLOTS[Number(slot.slice(5))] : null;
  if (periodSlot === null || (dayType !== "A" && dayType !== "B")) return slot;
  return `period${periodSlot + (dayType === "A" ? 1 : 5)}`;
}

// Every event a date can hold, in the order the ones it doesn't are listed:
// the day's own slots, then the periods (or, on a day not set A or B, the
// shared class slots).
function scheduleEventOrder(dayType) {
  const shared = SCHEDULE_EVENT_KEYS.filter((key) => !key.startsWith("block") || BLOCK_PERIOD_SLOTS[Number(key.slice(5))] === null);
  const classes = dayType === "A" || dayType === "B" ? PERIOD_KEYS : SCHEDULE_EVENT_KEYS.filter((key) => !shared.includes(key));
  return [...shared, ...classes];
}

// Which class slot a period meets in (mirrors usualEventTimes in
// src/core/schedule.js): periods 1-4 on A days, 5-8 on B days.
const PERIOD_BLOCKS = [0, 1, 3, 4];

// An event's usual times: its slot's, a period's being its class slot's.
function usualTimes(key, sched) {
  if (PERIOD_KEYS.includes(key)) return eventTimes(`block${PERIOD_BLOCKS[(Number(key.slice(6)) - 1) % 4]}`, sched);
  return eventTimes(key, sched);
}

// The events a date normally has: the shared ones and the day's periods (or
// the shared class slots on a day not set A or B).
function normalEvents(dayType) {
  return SCHEDULE_EVENT_KEYS.map((slot) => defaultScheduleEvent(slot, dayType));
}

// Every event the popup offers for a date, with its times that day and
// whether it happens: the day's own first, then the other day's periods.
// Mirrors scheduleForDate in src/core/schedule.js. custom: the date's own
// schedule (default: the saved one; null: its normal one), in either form:
// { included, times }, or from before times went with the event, { slots,
// included }, where an event takes the times of the slot it was put in.
export function scheduleEventsFor(iso, sched, dayTypes, custom = sched.daySchedules[iso]) {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  const dayType = dayTypes[iso];
  const normal = normalEvents(dayType);
  const slotOf = {};
  if (custom && custom.slots && !custom.times) {
    Object.entries(custom.slots).forEach(([slot, key]) => (slotOf[key] = slot));
  }
  return scheduleEventOrder(dayType).map((key) => {
    const included = custom && Array.isArray(custom.included) ? custom.included.includes(key) : normal.includes(key) && normallyIncluded(key, weekday);
    const own = custom && custom.times && custom.times[key];
    const time = own || (slotOf[key] ? eventTimes(slotOf[key], sched) : usualTimes(key, sched));
    return { key, time: { start: time.start || "", end: time.end || "" }, included };
  });
}

export function dayHasTestingBlock(iso, sched, dayTypes) {
  return scheduleEventsFor(iso, sched, dayTypes).some(({ key, included }) => key === "testingBlock" && included);
}

// The normal times, as the doc keeps them (defaults where it has none yet),
// saved with each date so a first save stores them.
export function normalSchedule(sched) {
  return {
    times: DEFAULT_SCHEDULE_TIMES.map((_, index) => eventTimes(`block${index}`, sched)),
    testingBlock: eventTimes("testingBlock", sched),
    academicSupport: eventTimes("academicSupport", sched),
    advisory: eventTimes("advisory", sched),
  };
}

export const scheduleEventLabel = (key) => SCHEDULE_EVENT_LABELS[key];

// The events the day has, in time order: by start, then end (an event without
// one goes last), then the order scheduleEventsFor lists them in. sortTime, when
// an event has one, is used in place of its times.
export function sortScheduleEvents(events) {
  const order = new Map(events.map((event, index) => [event.key, index]));
  const timeOf = (event) => event.sortTime || event.time;
  return events
    .filter(({ included }) => included)
    .sort(
      (a, b) =>
        (timeOf(a).start || "99:99").localeCompare(timeOf(b).start || "99:99") ||
        (timeOf(a).end || "99:99").localeCompare(timeOf(b).end || "99:99") ||
        order.get(a.key) - order.get(b.key)
    );
}

// The date's events and their times, in time order, as saved.
export function scheduleDay(events) {
  const on = sortScheduleEvents(events);
  return { included: on.map(({ key }) => key), times: Object.fromEntries(on.map(({ key, time }) => [key, { start: time.start, end: time.end }])) };
}

// null when the date is set as normal (its usual events at their usual
// times), so nothing needs storing; else the events it has, each with its
// times. Every one's times are stored, not just the unusual ones: the doc is
// saved with merge, which would keep an old time no longer sent.
export function customDaySchedule(iso, day, sched, dayTypes) {
  const normal = scheduleEventsFor(iso, sched, dayTypes, null).filter(({ included }) => included);
  const sameEvents = normal.length === day.included.length && normal.every(({ key }) => day.included.includes(key));
  const sameTimes = normal.every(({ key, time }) => day.times[key] && day.times[key].start === time.start && day.times[key].end === time.end);
  return sameEvents && sameTimes ? null : { included: day.included, times: day.times };
}

// Every event the day has needs both times.
export const scheduleDayComplete = (events) => events.every(({ included, time }) => !included || (time.start && time.end));
