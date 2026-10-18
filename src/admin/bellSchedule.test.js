import { describe, expect, it } from "vitest";
import { customDaySchedule, dayHasTestingBlock, scheduleSlotsFor } from "./bellSchedule.js";

const SCHED = { times: null, testingBlock: null, academicSupport: null, advisory: null, daySchedules: {} };
// 2026-10-12 is a Monday, 2026-10-13 a Tuesday.
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";

const keys = (slots) => slots.map(({ key, included, slot }) => `${key}${included ? "" : " (off)"}${slot ? "" : " (unplaced)"}`);

describe("scheduleSlotsFor", () => {
  it("lists a Monday A day: the Testing Block on, Advisory off, then the B periods unplaced", () => {
    expect(keys(scheduleSlotsFor(MONDAY, SCHED, { [MONDAY]: "A" }))).toEqual([
      "testingBlock",
      "advisory (off)",
      "period1",
      "period2",
      "block2",
      "period3",
      "period4",
      "academicSupport",
      "period5 (off) (unplaced)",
      "period6 (off) (unplaced)",
      "period7 (off) (unplaced)",
      "period8 (off) (unplaced)",
    ]);
  });

  it("keeps the shared class slots on a day not set A or B", () => {
    expect(keys(scheduleSlotsFor(TUESDAY, SCHED, {})).slice(0, 4)).toEqual(["testingBlock (off)", "advisory", "block0", "block1"]);
  });

  it("follows a date's own arrangement, or its normal one when told to", () => {
    const custom = { slots: { block0: "period4", block4: "period1" }, included: ["period4", "period2", "period1"] };
    const sched = { ...SCHED, daySchedules: { [MONDAY]: custom } };
    const arranged = scheduleSlotsFor(MONDAY, sched, { [MONDAY]: "A" });
    expect(arranged.filter(({ included }) => included).map(({ key }) => key)).toEqual(["period4", "period2", "period1"]);
    expect(keys(scheduleSlotsFor(MONDAY, sched, { [MONDAY]: "A" }, null))[2]).toBe("period1");
  });
});

describe("customDaySchedule", () => {
  const normalDay = () => {
    const slots = {};
    const included = [];
    scheduleSlotsFor(MONDAY, SCHED, { [MONDAY]: "A" }, null).forEach(({ slot, key, included: on }) => {
      if (!slot) return;
      slots[slot] = key;
      if (on) included.push(key);
    });
    return { slots, included };
  };

  it("is null for a date arranged as normal", () => {
    expect(customDaySchedule(MONDAY, normalDay(), SCHED, { [MONDAY]: "A" })).toBe(null);
  });

  it("keeps only the slots that differ, with everything the day uses", () => {
    const day = normalDay();
    day.slots.block0 = "period2";
    day.slots.block1 = "period1";
    expect(customDaySchedule(MONDAY, day, SCHED, { [MONDAY]: "A" })).toEqual({ slots: { block0: "period2", block1: "period1" }, included: day.included });
  });

  it("counts a skipped slot as different", () => {
    const day = normalDay();
    day.included = day.included.filter((key) => key !== "block2");
    expect(customDaySchedule(MONDAY, day, SCHED, { [MONDAY]: "A" })).toEqual({ slots: {}, included: day.included });
  });
});

describe("dayHasTestingBlock", () => {
  it("is Mondays and Fridays unless the date says otherwise", () => {
    expect(dayHasTestingBlock(MONDAY, SCHED, {})).toBe(true);
    expect(dayHasTestingBlock(TUESDAY, SCHED, {})).toBe(false);
    const sched = { ...SCHED, daySchedules: { [MONDAY]: { slots: {}, included: ["period1"] } } };
    expect(dayHasTestingBlock(MONDAY, sched, {})).toBe(false);
  });
});
