import { describe, expect, it } from "vitest";
import {
  assessmentEndsAt,
  assessmentStillUpcoming,
  isAssessmentVisibleForPeriod,
  isDuringSchool,
  scheduleForDate,
  scheduledTimeOn,
} from "./schedule.js";

const PERIOD_TIMES = {
  times: [
    { start: "08:50", end: "10:13" },
    { start: "10:18", end: "11:41" },
    { start: "11:41", end: "12:30" },
    { start: "12:30", end: "13:53" },
    { start: "13:58", end: "15:21" },
  ],
  testingBlock: { start: "08:00", end: "08:50" },
  advisory: { start: "08:20", end: "08:45" },
  academicSupport: { start: "15:25", end: "16:00" },
};

// 2026-10-12 is a Monday.
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const SATURDAY = "2026-10-17";

const keys = (events) => events.map((event) => event.key);

describe("scheduleForDate", () => {
  it("is empty on weekends and without a bell schedule", () => {
    expect(scheduleForDate(SATURDAY, {}, PERIOD_TIMES)).toEqual([]);
    expect(scheduleForDate(MONDAY, { [MONDAY]: "A" }, null)).toEqual([]);
  });

  it("has the Testing Block on Mondays and the day's periods in time order", () => {
    expect(keys(scheduleForDate(MONDAY, { [MONDAY]: "A" }, PERIOD_TIMES))).toEqual([
      "testingBlock",
      "period1",
      "period2",
      "block2",
      "period3",
      "period4",
      "academicSupport",
    ]);
  });

  it("has Advisory instead on other weekdays, and periods 5-8 on a B day", () => {
    expect(keys(scheduleForDate(TUESDAY, { [TUESDAY]: "B" }, PERIOD_TIMES))).toEqual([
      "advisory",
      "period5",
      "period6",
      "block2",
      "period7",
      "period8",
      "academicSupport",
    ]);
  });

  it("keeps the shared class slots on a day not set A or B", () => {
    expect(keys(scheduleForDate(TUESDAY, {}, PERIOD_TIMES))).toContain("block0");
  });

  it("follows a date's own arrangement", () => {
    const custom = {
      ...PERIOD_TIMES,
      daySchedules: {
        [MONDAY]: { slots: { block0: "period4", block4: "period1" }, included: ["period4", "period2", "period1"] },
      },
    };
    expect(keys(scheduleForDate(MONDAY, { [MONDAY]: "A" }, custom))).toEqual(["period4", "period2", "period1"]);
  });

  it("uses fallback times for the Testing Block and Academic Support", () => {
    const { testingBlock, academicSupport, ...bare } = PERIOD_TIMES;
    expect(scheduledTimeOn(MONDAY, "testingBlock", {}, bare)).toMatchObject({ start: "08:00", end: "08:50" });
    expect(scheduledTimeOn(MONDAY, "academicSupport", {}, bare)).toMatchObject({ start: "15:25", end: "16:00" });
  });
});

describe("isAssessmentVisibleForPeriod", () => {
  const onMonday = (type) => ({ date: MONDAY, type });

  it("shows A-day assessments to periods 1-4 and B-day ones to 5-8", () => {
    expect(isAssessmentVisibleForPeriod(onMonday("In-Class"), 0, { [MONDAY]: "A" })).toBe(true);
    expect(isAssessmentVisibleForPeriod(onMonday("In-Class"), 5, { [MONDAY]: "A" })).toBe(false);
    expect(isAssessmentVisibleForPeriod(onMonday("In-Class"), 5, { [MONDAY]: "B" })).toBe(true);
  });

  it("shows Testing Blocks, reassessments and unset days to everyone", () => {
    expect(isAssessmentVisibleForPeriod(onMonday("Testing Block"), 5, { [MONDAY]: "A" })).toBe(true);
    expect(isAssessmentVisibleForPeriod(onMonday("Reassessment"), 5, { [MONDAY]: "A" })).toBe(true);
    expect(isAssessmentVisibleForPeriod(onMonday("In-Class"), 5, {})).toBe(true);
    expect(isAssessmentVisibleForPeriod(onMonday("In-Class"), null, { [MONDAY]: "A" })).toBe(true);
  });
});

describe("assessmentEndsAt", () => {
  const dayTypes = { [MONDAY]: "A" };

  it("ends with its class period", () => {
    const end = assessmentEndsAt({ date: MONDAY, type: "In-Class" }, 1, dayTypes, PERIOD_TIMES);
    expect([end.getHours(), end.getMinutes()]).toEqual([11, 41]);
  });

  it("ends with the Testing Block or Academic Support", () => {
    const testing = assessmentEndsAt({ date: MONDAY, type: "Testing Block" }, 6, dayTypes, PERIOD_TIMES);
    expect([testing.getHours(), testing.getMinutes()]).toEqual([8, 50]);
    const reassessment = assessmentEndsAt({ date: MONDAY, type: "Reassessment" }, 6, dayTypes, null);
    expect([reassessment.getHours(), reassessment.getMinutes()]).toEqual([16, 0]);
  });

  it("is null when the period doesn't meet that day", () => {
    expect(assessmentEndsAt({ date: MONDAY, type: "In-Class" }, 5, dayTypes, PERIOD_TIMES)).toBe(null);
  });
});

describe("assessmentStillUpcoming", () => {
  const entry = { date: MONDAY, type: "In-Class" };
  const dayTypes = { [MONDAY]: "A" };
  const at = (iso, hours, minutes) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, hours, minutes);
  };

  it("counts until its class ends that day", () => {
    expect(assessmentStillUpcoming(entry, 0, at(MONDAY, 10, 0), dayTypes, PERIOD_TIMES)).toBe(true);
    expect(assessmentStillUpcoming(entry, 0, at(MONDAY, 10, 13), dayTypes, PERIOD_TIMES)).toBe(false);
  });

  it("compares dates otherwise", () => {
    expect(assessmentStillUpcoming(entry, 0, at("2026-10-11", 23, 0), dayTypes, PERIOD_TIMES)).toBe(true);
    expect(assessmentStillUpcoming(entry, 0, at(TUESDAY, 8, 0), dayTypes, PERIOD_TIMES)).toBe(false);
  });

  it("lasts the whole day when its end can't be told", () => {
    expect(assessmentStillUpcoming(entry, 0, at(MONDAY, 23, 0), dayTypes, null)).toBe(true);
  });
});

describe("isDuringSchool", () => {
  const at = (iso, hours, minutes) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, hours, minutes);
  };

  it("runs from the first event's start to the last one's end", () => {
    expect(isDuringSchool(at(MONDAY, 7, 59), {}, PERIOD_TIMES)).toBe(false);
    expect(isDuringSchool(at(MONDAY, 8, 0), {}, PERIOD_TIMES)).toBe(true);
    expect(isDuringSchool(at(MONDAY, 15, 59), {}, PERIOD_TIMES)).toBe(true);
    expect(isDuringSchool(at(MONDAY, 16, 0), {}, PERIOD_TIMES)).toBe(false);
  });

  it("starts with Advisory on days without a Testing Block", () => {
    expect(isDuringSchool(at(TUESDAY, 8, 10), {}, PERIOD_TIMES)).toBe(false);
    expect(isDuringSchool(at(TUESDAY, 8, 20), {}, PERIOD_TIMES)).toBe(true);
  });

  it("is never on weekends or without a schedule", () => {
    expect(isDuringSchool(at(SATURDAY, 10, 0), {}, PERIOD_TIMES)).toBe(false);
    expect(isDuringSchool(at(MONDAY, 10, 0), {}, null)).toBe(false);
  });
});
