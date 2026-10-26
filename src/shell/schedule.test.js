import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleForDate as coreScheduleForDate } from "../core/schedule.js";

// The school's state (src/shell/school.js), kept here: an A day on Monday
// 2026-10-12 with the usual times.
const school = vi.hoisted(() => ({ dayTypes: {}, periodTimes: null }));
vi.mock("./school.js", async () => {
  const core = await import("../core/schedule.js");
  return {
    get allDayTypes() {
      return school.dayTypes;
    },
    get defaultPeriodTimes() {
      return school.periodTimes;
    },
    scheduleForDate: (iso) => core.scheduleForDate(iso, school.dayTypes, school.periodTimes),
  };
});
const { currentScheduleBlock } = await import("./schedule.js");

const PERIOD_TIMES = {
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
  daySchedules: {},
};
const at = (time) => vi.setSystemTime(new Date(`2026-10-12T${time}`));

beforeEach(() => {
  vi.useFakeTimers();
  school.dayTypes = { "2026-10-12": "A", "2026-10-13": "B" };
  school.periodTimes = PERIOD_TIMES;
});
afterEach(() => vi.useRealTimers());

describe("currentScheduleBlock", () => {
  it("is the class, lunch or testing block on now, with the time left in it", () => {
    at("09:00:00");
    expect(currentScheduleBlock()).toMatchObject({ block: { type: "class", periodIndex: 0 }, dayType: "A" });
    expect(currentScheduleBlock().minutesLeft).toBeCloseTo(73);
    at("12:00:00");
    expect(currentScheduleBlock().block).toEqual({ type: "lunch" });
    at("08:10:00");
    expect(currentScheduleBlock().block).toEqual({ type: "testing" });
  });

  it("counts down Academic Support, so the schedule can be opened then too", () => {
    at("15:30:00");
    const now = currentScheduleBlock();
    expect(now.block).toEqual({ type: "support" });
    expect(now.minutesLeft).toBeCloseTo(30);
    at("15:59:30");
    expect(currentScheduleBlock().block).toEqual({ type: "support" });
  });

  it("counts down Advisory, which is on Tuesday to Thursday", () => {
    vi.setSystemTime(new Date("2026-10-13T08:30:00")); // Tuesday
    expect(currentScheduleBlock().block).toEqual({ type: "advisory" });
    expect(currentScheduleBlock().minutesLeft).toBeCloseTo(15);
    at("08:30:00"); // Monday has the Testing Block there instead, and no Advisory
    expect(currentScheduleBlock().block).toEqual({ type: "testing" });
  });

  it("has a block for every event of every weekday, at any moment inside it", () => {
    const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    school.dayTypes = Object.fromEntries(days.map((day, i) => [day, i % 2 ? "B" : "A"]));
    for (const day of days) {
      for (const event of coreScheduleForDate(day, school.dayTypes, school.periodTimes)) {
        // The first minute of the event, and one second before it ends.
        const [startH, startM] = event.start.split(":").map(Number);
        const [endH, endM] = event.end.split(":").map(Number);
        for (const when of [new Date(`${day}T00:00:00`).setHours(startH, startM, 0), new Date(`${day}T00:00:00`).setHours(endH, endM, -1)]) {
          vi.setSystemTime(when);
          const now = currentScheduleBlock();
          expect(now, `${day} ${event.key} at ${new Date(when).toTimeString().slice(0, 8)}`).not.toBe(null);
        }
      }
    }
  });

  it("is nothing between classes, after school, or on a day not set A or B", () => {
    at("10:15:00");
    expect(currentScheduleBlock()).toBe(null);
    at("15:23:00"); // after Period 5, before Academic Support
    expect(currentScheduleBlock()).toBe(null);
    at("16:00:00");
    expect(currentScheduleBlock()).toBe(null);
    vi.setSystemTime(new Date("2026-10-14T09:00:00")); // no type
    expect(currentScheduleBlock()).toBe(null);
  });

  it("has no Academic Support on a day that doesn't include it", () => {
    school.periodTimes = {
      ...PERIOD_TIMES,
      daySchedules: { "2026-10-12": { included: ["period1", "period2"], times: { period1: { start: "08:50", end: "10:13" }, period2: { start: "10:18", end: "11:41" } } } },
    };
    at("15:30:00");
    expect(currentScheduleBlock()).toBe(null);
    expect(coreScheduleForDate("2026-10-12", school.dayTypes, school.periodTimes).map((e) => e.key)).toEqual(["period1", "period2"]);
  });
});
