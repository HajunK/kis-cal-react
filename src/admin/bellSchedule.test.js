import { describe, expect, it } from "vitest";
import { scheduleForDate } from "../core/schedule.js";
import { customDaySchedule, dayHasTestingBlock, scheduleDay, scheduleDayComplete, scheduleEventsFor, sortScheduleEvents } from "./bellSchedule.js";

const SCHED = { times: null, testingBlock: null, academicSupport: null, advisory: null, daySchedules: {} };
// 2026-10-12 is a Monday, 2026-10-13 a Tuesday.
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const A = { [MONDAY]: "A" };

const listed = (events) => events.map(({ key, included, time }) => `${key} ${time.start}-${time.end}${included ? "" : " (off)"}`);
// The date's events as the popup shows them: the ones it has, by time.
const day = (events) => {
  const on = events.filter(({ included }) => included);
  return { included: on.map(({ key }) => key), times: Object.fromEntries(on.map(({ key, time }) => [key, time])) };
};

describe("scheduleEventsFor", () => {
  it("lists a Monday A day's events at their usual times, the B periods off at their slots' times", () => {
    expect(listed(scheduleEventsFor(MONDAY, SCHED, A))).toEqual([
      "testingBlock 08:00-08:50",
      "advisory 08:20-08:45 (off)",
      "block2 11:41-12:30",
      "academicSupport 15:25-16:00",
      "period1 08:50-10:13",
      "period2 10:18-11:41",
      "period3 12:30-13:53",
      "period4 13:58-15:21",
      "period5 08:50-10:13 (off)",
      "period6 10:18-11:41 (off)",
      "period7 12:30-13:53 (off)",
      "period8 13:58-15:21 (off)",
    ]);
  });

  it("keeps the shared class slots on a day not set A or B", () => {
    const keys = scheduleEventsFor(TUESDAY, SCHED, {}).map(({ key }) => key);
    expect(keys).toEqual(["testingBlock", "advisory", "block2", "academicSupport", "block0", "block1", "block3", "block4"]);
  });

  it("follows a date's own events and times", () => {
    const custom = { included: ["period1", "period5"], times: { period1: { start: "09:00", end: "10:00" }, period5: { start: "10:30", end: "11:30" } } };
    const sched = { ...SCHED, daySchedules: { [MONDAY]: custom } };
    expect(listed(scheduleEventsFor(MONDAY, sched, A)).filter((line) => !line.endsWith("(off)"))).toEqual([
      "period1 09:00-10:00",
      "period5 10:30-11:30",
    ]);
  });

  it("reads a date saved the old way: each event at the times of the slot it was put in", () => {
    const custom = { slots: { block0: "period4", block4: "period1" }, included: ["period4", "period2", "period1"] };
    const sched = { ...SCHED, daySchedules: { [MONDAY]: custom } };
    const on = scheduleEventsFor(MONDAY, sched, A).filter(({ included }) => included);
    expect(listed(on)).toEqual(["period1 13:58-15:21", "period2 10:18-11:41", "period4 08:50-10:13"]);
  });
});

describe("customDaySchedule", () => {
  it("is null for a date set as normal", () => {
    expect(customDaySchedule(MONDAY, day(scheduleEventsFor(MONDAY, SCHED, A, null)), SCHED, A)).toBe(null);
  });

  it("keeps every event the day has, with all their times, once one differs", () => {
    const shown = day(scheduleEventsFor(MONDAY, SCHED, A, null));
    shown.times.period3 = { start: "12:45", end: "13:53" };
    const custom = customDaySchedule(MONDAY, shown, SCHED, A);
    expect(custom.included).toEqual(shown.included);
    expect(custom.times).toEqual(shown.times);
  });

  it("counts an added period or a skipped event as different", () => {
    const shown = day(scheduleEventsFor(MONDAY, SCHED, A, null));
    shown.included.push("period5");
    shown.times.period5 = { start: "08:50", end: "10:13" };
    expect(customDaySchedule(MONDAY, shown, SCHED, A)).not.toBe(null);
    const skipped = day(scheduleEventsFor(MONDAY, SCHED, A, null));
    skipped.included = skipped.included.filter((key) => key !== "block2");
    delete skipped.times.block2;
    expect(customDaySchedule(MONDAY, skipped, SCHED, A)).not.toBe(null);
  });

  it("saves what the students' schedule then shows, in time order", () => {
    const shown = day(scheduleEventsFor(MONDAY, SCHED, A, null));
    shown.included.push("period5");
    shown.times.period5 = { start: "12:30", end: "13:20" };
    shown.times.period3 = { start: "13:25", end: "14:10" };
    const custom = customDaySchedule(MONDAY, shown, SCHED, A);
    const periodTimes = { ...normal(), daySchedules: { [MONDAY]: custom } };
    expect(scheduleForDate(MONDAY, A, periodTimes).map(({ key, start }) => `${key} ${start}`)).toEqual([
      "testingBlock 08:00",
      "period1 08:50",
      "period2 10:18",
      "block2 11:41",
      "period5 12:30",
      "period3 13:25",
      "period4 13:58",
      "academicSupport 15:25",
    ]);
  });
});

describe("sortScheduleEvents", () => {
  const event = (key, start, end, included = true) => ({ key, time: { start, end }, included });

  it("lists only what the day has, by start, then end, then listed order", () => {
    const events = [event("advisory", "09:00", "09:30"), event("block2", "08:00", "08:40"), event("period1", "08:00", "08:30"), event("period5", "07:00", "08:00", false), event("period2", "09:00", "09:30")];
    expect(sortScheduleEvents(events).map(({ key }) => key)).toEqual(["period1", "block2", "advisory", "period2"]);
  });

  it("puts an event without a start last, and goes by sortTime when there is one", () => {
    const blank = event("period1", "", "10:00");
    const typing = { ...event("period2", "07:00", "08:00"), sortTime: { start: "11:00", end: "12:00" } };
    expect(sortScheduleEvents([blank, typing, event("period3", "09:00", "10:00")]).map(({ key }) => key)).toEqual(["period3", "period2", "period1"]);
  });
});

describe("scheduleDay", () => {
  it("is what the date has in time order, with each one's times", () => {
    const events = scheduleEventsFor(MONDAY, SCHED, A, null).map((event) => (event.key === "period5" ? { ...event, included: true, time: { start: "12:30", end: "13:00" } } : event));
    const shown = scheduleDay(events);
    expect(shown.included).toEqual(["testingBlock", "period1", "period2", "block2", "period5", "period3", "period4", "academicSupport"]);
    expect(shown.times.period5).toEqual({ start: "12:30", end: "13:00" });
    expect(shown.times.advisory).toBe(undefined);
  });

  it("needs both times on every event the day has, not on the ones it doesn't", () => {
    const events = scheduleEventsFor(MONDAY, SCHED, A, null);
    expect(scheduleDayComplete(events)).toBe(true);
    expect(scheduleDayComplete(events.map((e) => (e.key === "advisory" ? { ...e, time: { start: "", end: "" } } : e)))).toBe(true);
    expect(scheduleDayComplete(events.map((e) => (e.key === "period1" ? { ...e, time: { start: "08:50", end: "" } } : e)))).toBe(false);
  });
});

describe("dayHasTestingBlock", () => {
  it("is Mondays and Fridays unless the date says otherwise", () => {
    expect(dayHasTestingBlock(MONDAY, SCHED, {})).toBe(true);
    expect(dayHasTestingBlock(TUESDAY, SCHED, {})).toBe(false);
    const sched = { ...SCHED, daySchedules: { [MONDAY]: { included: ["period1"], times: {} } } };
    expect(dayHasTestingBlock(MONDAY, sched, {})).toBe(false);
  });
});

// The doc's normal times, as a first save stores them.
function normal() {
  return {
    times: [
      { start: "08:50", end: "10:13" },
      { start: "10:18", end: "11:41" },
      { start: "11:41", end: "12:30" },
      { start: "12:30", end: "13:53" },
      { start: "13:58", end: "15:21" },
    ],
    testingBlock: { start: "08:00", end: "08:50" },
    academicSupport: { start: "15:25", end: "16:00" },
    advisory: { start: "08:20", end: "08:45" },
  };
}
