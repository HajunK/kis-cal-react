// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleForDate as coreScheduleForDate } from "../core/schedule.js";

// The school's state (src/shell/school.js), the student's courses, and the parts
// of the app the popup's list doesn't use, kept here.
const school = vi.hoisted(() => ({ dayTypes: {}, periodTimes: null }));
vi.mock("../shell/school.js", async () => {
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
vi.mock("../shell/data.js", () => ({ loadPeriods: () => ["English", "AP Biology", "Geometry", "Korean", "Chinese", "", "Spanish", ""] }));
vi.mock("../calendar/data.js", () => ({ courseColorNames: () => new Map() }));
vi.mock("../shell/ui.js", () => ({ animateNumberChange: () => {} }));
const { closeTodaySchedule, openTodaySchedule, scheduleEventsOn, setCountdownPill } = await import("./todaySchedule.js");

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
const DAYS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]; // Monday to Friday

describe("the schedule popup's list", () => {
  it("has a row for every event of the day, in time order, on every weekday and both day types", () => {
    for (const types of [["A", "B", "A", "B", "A"], ["B", "A", "B", "A", "B"]]) {
      school.periodTimes = PERIOD_TIMES;
      school.dayTypes = Object.fromEntries(DAYS.map((day, i) => [day, types[i]]));
      for (const day of DAYS) {
        const events = coreScheduleForDate(day, school.dayTypes, school.periodTimes);
        const rows = scheduleEventsOn(day);
        expect(rows.map((row) => [row.start, row.end]), day).toEqual(events.map((event) => [event.start, event.end]));
        expect(rows.length, day).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("names Testing Block (Monday and Friday), Advisory (the other days) and Academic Support, with each class's course", () => {
    school.periodTimes = PERIOD_TIMES;
    school.dayTypes = { "2026-10-12": "A", "2026-10-13": "B" };
    const monday = scheduleEventsOn("2026-10-12").map((row) => row.label);
    expect(monday).toEqual(["Testing Block", "English", "AP Biology", "Lunch", "Geometry", "Korean", "Academic Support"]);
    const tuesday = scheduleEventsOn("2026-10-13").map((row) => row.label);
    expect(tuesday).toEqual(["Advisory", "Chinese", "Period 6", "Lunch", "Spanish", "Period 8", "Academic Support"]);
  });

  it("lists exactly what a day with its own schedule includes", () => {
    school.periodTimes = {
      ...PERIOD_TIMES,
      daySchedules: {
        "2026-10-14": {
          included: ["period1", "advisory", "academicSupport"],
          times: { period1: { start: "09:00", end: "10:00" }, advisory: { start: "08:30", end: "08:50" }, academicSupport: { start: "15:00", end: "15:30" } },
        },
      },
    };
    school.dayTypes = { "2026-10-14": "A" };
    expect(scheduleEventsOn("2026-10-14").map((row) => `${row.label} ${row.start}-${row.end}`)).toEqual([
      "Advisory 08:30-08:50",
      "English 09:00-10:00",
      "Academic Support 15:00-15:30",
    ]);
  });

  it("is empty without a bell schedule", () => {
    school.periodTimes = null;
    expect(scheduleEventsOn("2026-10-12")).toEqual([]);
  });
});

describe("swiping between today and the next school day", () => {
  const recorded = [];
  const realAnimate = Element.prototype.animate;

  afterEach(() => {
    closeTodaySchedule();
    Element.prototype.animate = realAnimate;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  function openPopup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T09:00:00")); // Monday, an A day
    school.periodTimes = {
      ...PERIOD_TIMES,
      // Tuesday has fewer events than Monday, so the popup's height changes.
      daySchedules: {
        "2026-10-13": {
          included: ["period5", "period6", "academicSupport"],
          times: { period5: { start: "08:50", end: "10:13" }, period6: { start: "10:18", end: "11:41" }, academicSupport: { start: "15:25", end: "16:00" } },
        },
      },
    };
    school.dayTypes = { "2026-10-12": "A", "2026-10-13": "B" };
    // Heights follow the number of rows, which jsdom doesn't lay out.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("today-schedule-days") ? this.querySelectorAll(".today-schedule-pane:not(.today-schedule-pane--leaving) li").length * 40 : 0;
      },
    });
    Element.prototype.getAnimations = () => [];
    Element.prototype.animate = function (frames, options) {
      recorded.push({ target: this, frames, options });
      return { finished: Promise.resolve(), cancel() {}, onfinish: null };
    };
    const pill = document.createElement("button");
    pill.innerHTML = '<svg class="class-countdown-icon"></svg><span class="class-countdown-time"></span><span class="class-countdown-label">English</span>';
    pill.dataset.timeText = "73m";
    document.body.appendChild(pill);
    setCountdownPill(pill);
    openTodaySchedule();
    recorded.length = 0;
    return document.querySelector(".today-schedule");
  }

  it("shows the footer in plain type, with only the day's name in the main color", () => {
    const popup = openPopup();
    const footer = popup.querySelector(".today-schedule-footer");
    expect(footer.textContent.trim()).toBe("Tomorrow · B Day");
    expect(footer.querySelector(".today-schedule-footer-when").textContent).toBe("Tomorrow");
    expect(footer.querySelectorAll("b, strong")).toHaveLength(0);
  });

  it("swipes to the next day as the Domain date picker moves to the next month, and the reverse on the way back", async () => {
    const popup = openPopup();
    const footer = popup.querySelector(".today-schedule-footer");
    const days = popup.querySelector(".today-schedule-days");
    const rowsNow = () => days.querySelectorAll(".today-schedule-pane:not(.today-schedule-pane--leaving) li").length;
    expect(rowsNow()).toBe(7);

    footer.click(); // to Tuesday
    expect(popup.querySelector(".today-schedule-heading").textContent).toContain("Tuesday");
    expect(footer.textContent.trim()).toBe("Back to today");
    expect(rowsNow()).toBe(3);
    // The old day and old heading wait, laid over the new, until they've gone.
    expect(days.querySelectorAll(".today-schedule-pane--leaving")).toHaveLength(1);
    expect(popup.querySelectorAll(".today-schedule-heading--leaving")).toHaveLength(1);

    const describeAll = () =>
      recorded.map(({ target, frames, options }) => ({
        what: target.classList.contains("today-schedule-days") ? "height" : target.classList.contains("today-schedule-pane--leaving") ? "day out" : target.classList.contains("today-schedule-pane") ? "day in" : target.classList.contains("today-schedule-heading--leaving") ? "heading out" : "heading in",
        frames: frames.map((frame) => frame.height || `${frame.opacity} ${frame.transform}`),
        duration: options.duration,
        easing: options.easing,
        fill: options.fill,
      }));
    const forward = describeAll();
    expect(forward).toContainEqual({ what: "height", frames: ["280px", "120px"], duration: 220, easing: "ease", fill: undefined });
    for (const [out, into] of [["day out", "day in"], ["heading out", "heading in"]]) {
      expect(forward).toContainEqual({ what: out, frames: ["1 translateX(0)", "0 translateX(-24px)"], duration: 220 * 0.7, easing: "ease", fill: "forwards" });
      expect(forward).toContainEqual({ what: into, frames: ["0 translateX(24px)", "1 translateX(0)"], duration: 220, easing: "ease", fill: undefined });
    }

    await Promise.resolve();
    await Promise.resolve();
    expect(days.querySelectorAll(".today-schedule-pane--leaving")).toHaveLength(0);
    expect(popup.querySelectorAll(".today-schedule-heading--leaving")).toHaveLength(0);

    recorded.length = 0;
    footer.click(); // back to today
    expect(popup.querySelector(".today-schedule-heading").textContent).toContain("Monday");
    expect(rowsNow()).toBe(7);
    const back = describeAll();
    expect(back).toContainEqual({ what: "height", frames: ["120px", "280px"], duration: 220, easing: "ease", fill: undefined });
    for (const [out, into] of [["day out", "day in"], ["heading out", "heading in"]]) {
      expect(back).toContainEqual({ what: out, frames: ["1 translateX(0)", "0 translateX(24px)"], duration: 220 * 0.7, easing: "ease", fill: "forwards" });
      expect(back).toContainEqual({ what: into, frames: ["0 translateX(-24px)", "1 translateX(0)"], duration: 220, easing: "ease", fill: undefined });
    }
  });

  it("still changes days, without animating, where animations aren't available", () => {
    const popup = openPopup();
    const withAnimate = Element.prototype.animate;
    Element.prototype.animate = undefined;
    popup.querySelector(".today-schedule-footer").click();
    Element.prototype.animate = withAnimate; // closing the popup afterwards animates
    expect(popup.querySelector(".today-schedule-heading").textContent).toContain("Tuesday");
    expect(popup.querySelectorAll(".today-schedule-pane--leaving, .today-schedule-heading--leaving")).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });
});
