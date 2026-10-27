import { describe, expect, it } from "vitest";
import {
  acceptedReplacements,
  addableCourseOptions,
  assessmentCategory,
  calendarDateRange,
  carriedCompletions,
  courseColorNames,
  courseColorVars,
  dayPillRank,
  lateLabel,
  addedByLabel,
  pillDetails,
  latestAugustFirst,
  matchEntries,
  normalizeCompletedRecords,
  sortDayEntries,
  startOfWeek,
  stripDivisionSuffix,
  suggestedAssessmentDocId,
  upcomingClassDays,
  upcomingDateLabel,
  upcomingDueAt,
  upcomingSortTime,
  upcomingTimeLabel,
  upcomingTitle,
} from "./model.js";

const PERIOD_TIMES = {
  times: [{ start: "08:50", end: "10:13" }, { start: "10:18", end: "11:41" }, { start: "11:41", end: "12:30" }, { start: "12:30", end: "13:53" }, { start: "13:58", end: "15:21" }],
  testingBlock: { start: "08:00", end: "08:50" },
  academicSupport: { start: "15:25", end: "16:00" },
};
// 2026-10-12 is a Monday, an A day here.
const MONDAY = "2026-10-12";
const DAY_TYPES = { [MONDAY]: "A", "2026-10-13": "B" };
const hm = (date) => (date ? `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}` : null);

describe("matchEntries", () => {
  it("matches a picked division, or every division until one's picked", () => {
    const { matchEntries: entries, resolvedNames } = matchEntries(["English", "Geometry", "", "Spanish"], ["10", "", "", ""]);
    expect(entries).toEqual([
      { name: "English (10)", periodIndex: 0 },
      { name: "Geometry", periodIndex: 1 },
      { name: "Spanish (I)", periodIndex: 3 },
      { name: "Spanish (II)", periodIndex: 3 },
      { name: "Spanish (III)", periodIndex: 3 },
      { name: "Spanish (IV)", periodIndex: 3 },
    ]);
    expect([...resolvedNames]).toEqual(["English"]);
  });
});

describe("course colors", () => {
  it("gives each course a palette color in period order, a picked one winning", () => {
    const colors = courseColorNames(["English", "Geometry", "English", " ", "Biology"], { Biology: "brown", Geometry: "not-a-color" });
    expect([...colors]).toEqual([
      ["English", "red"],
      ["Geometry", "dark-blue"],
      ["Biology", "brown"],
    ]);
    expect(courseColorVars(colors).get("English")).toBe("var(--color-red)");
  });
});

describe("a day's pill order", () => {
  const day = "2026-10-14";
  const entry = (courseName, type, date = day) => ({ id: `${courseName}-${type}-${date}`, courseName, type, date });
  const periods = { Biology: 0, Chemistry: 1, Physics: 2, English: 3, Korean: 4 };
  const order = (entries) => sortDayEntries(entries, (e) => periods[e.courseName]).map((e) => `${e.courseName}:${e.type}`);

  it("ranks Testing Block, In-Class, Formative, other types, then assignments", () => {
    const types = ["Assignment", "Reassessment", "Formative", "In-Class", "Testing Block", "Summative", "Homework", "Quiz"];
    // A plain Summative looks like an In-Class, so it ranks with them.
    expect(types.map((type) => dayPillRank({ type }))).toEqual([4, 3, 2, 1, 0, 1, 4, 3]);
  });

  it("stacks a day in that order, whatever order the entries came in", () => {
    const entries = [
      entry("Korean", "Assignment"),
      entry("English", "Reassessment"),
      entry("Chemistry", "Formative"),
      entry("Physics", "In-Class"),
      entry("Biology", "Testing Block"),
    ];
    expect(order(entries)).toEqual(["Biology:Testing Block", "Physics:In-Class", "Chemistry:Formative", "English:Reassessment", "Korean:Assignment"]);
  });

  it("keeps In-Classes and plain Summatives together, as they look the same: split by neither a Formative nor anything else", () => {
    const entries = [entry("English", "In-Class"), entry("Chemistry", "Formative"), entry("Korean", "Summative"), entry("Biology", "Formative")];
    expect(order(entries)).toEqual(["English:In-Class", "Korean:Summative", "Biology:Formative", "Chemistry:Formative"]);
  });

  it("puts the same kind in the order the classes meet: periods 1 to 4, or 5 to 8", () => {
    const entries = [entry("English", "Formative"), entry("Biology", "Formative"), entry("Physics", "Formative"), entry("Chemistry", "Formative")];
    expect(order(entries)).toEqual(["Biology:Formative", "Chemistry:Formative", "Physics:Formative", "English:Formative"]);
  });

  it("goes by the kind first and the period second", () => {
    // Biology (period 1) has a formative, English (period 4) an in-class: the in-class is still above it.
    expect(order([entry("Biology", "Formative"), entry("English", "In-Class")])).toEqual(["English:In-Class", "Biology:Formative"]);
  });

  it("keeps days in date order, and the order it came in when everything ties", () => {
    const entries = [entry("Biology", "Formative", "2026-10-15"), entry("English", "In-Class", "2026-10-14"), entry("Biology", "Formative", "2026-10-14")];
    expect(sortDayEntries(entries, (e) => periods[e.courseName]).map((e) => e.date)).toEqual(["2026-10-14", "2026-10-14", "2026-10-15"]);
    const a = { id: "a", courseName: "Biology", type: "Formative", date: day };
    const b = { id: "b", courseName: "Biology", type: "Formative", date: day };
    expect(sortDayEntries([b, a], () => 0).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("assessmentCategory", () => {
  it("sorts types into the calendar's four kinds", () => {
    expect(["In-Class", "Testing Block", "Summative", "Formative", "Quiz", "Assignment", "Homework", "Reassessment"].map((type) => assessmentCategory({ type }))).toEqual([
      "summative",
      "summative",
      "summative",
      "formative",
      "formative",
      "assignment",
      "assignment",
      "reassessment",
    ]);
  });
});

describe("dates", () => {
  it("finds the school year's start and a week's Sunday", () => {
    expect(latestAugustFirst(new Date(2026, 9, 18))).toEqual(new Date(2026, 7, 1));
    expect(latestAugustFirst(new Date(2027, 2, 1))).toEqual(new Date(2026, 7, 1));
    expect(startOfWeek(new Date(2026, 9, 14))).toEqual(new Date(2026, 9, 11));
  });

  it("labels days like Google Tasks", () => {
    const format = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
    expect(upcomingDateLabel("2026-10-18", "2026-10-18", format)).toBe("Today");
    expect(upcomingDateLabel("2026-10-19", "2026-10-18", format)).toBe("Tomorrow");
    expect(upcomingDateLabel("2026-10-17", "2026-10-18", format)).toBe("Yesterday");
    expect(upcomingDateLabel("2026-10-22", "2026-10-18", format)).toBe("Thu, 10/22");
  });
});

describe("titles and times", () => {
  it("names assessments by course and assignments by their own title", () => {
    expect(upcomingTitle({ type: "In-Class" }, "English")).toBe("English Summative");
    expect(upcomingTitle({ type: "Formative" }, "English")).toBe("English Formative");
    expect(upcomingTitle({ type: "Assignment", title: "Essay draft" }, "English")).toBe("Essay draft");
    expect(upcomingTitle({ type: "Assignment" }, "English")).toBe("Assignment");
    expect(stripDivisionSuffix("English (10)")).toBe("English");
  });

  it("labels a due time", () => {
    expect(upcomingTimeLabel("start", 0)).toBe("");
    expect(upcomingTimeLabel("period", 2)).toBe("Period 3");
    expect(upcomingTimeLabel("16:00", 2)).toBe("4:00 PM");
    expect(upcomingTimeLabel("00:30", 2)).toBe("12:30 AM");
  });
});

describe("upcomingDueAt", () => {
  const due = (entry, periodIndex, periodTimes = PERIOD_TIMES) => hm(upcomingDueAt({ date: MONDAY, ...entry }, periodIndex, DAY_TYPES, periodTimes));

  it("is due as its class starts, on a day it meets", () => {
    expect(due({ type: "In-Class" }, 1)).toBe("10:18");
    expect(due({ type: "Formative" }, 5)).toBe(null);
    expect(due({ type: "Formative" }, 1, null)).toBe(null);
  });

  it("is due as the Testing Block or Academic Support starts", () => {
    expect(due({ type: "Testing Block" }, 6)).toBe("8:00");
    expect(due({ type: "Reassessment" }, 6)).toBe("15:25");
    expect(due({ type: "Reassessment" }, 6, null)).toBe("15:25");
  });

  it("is due at an assignment's set time, the start of the day by default", () => {
    expect(due({ type: "Assignment", dueTime: "16:00" }, 0)).toBe("16:00");
    expect(due({ type: "Assignment" }, 0)).toBe("0:00");
    expect(due({ type: "Assignment", dueTime: "period" }, 2)).toBe("12:30");
  });

  it("sorts unknown times just after midnight", () => {
    expect(upcomingSortTime({ date: MONDAY, type: "Formative" }, 5, DAY_TYPES, PERIOD_TIMES)).toBe(new Date(2026, 9, 12).getTime() + 1);
  });
});

describe("completed tasks", () => {
  it("turns old bare ids into records", () => {
    expect(normalizeCompletedRecords(["a", { id: "b", completedAt: 5 }], 9)).toEqual([
      { id: "a", completedAt: 9 },
      { id: "b", completedAt: 5 },
    ]);
  });
});

describe("addableCourseOptions", () => {
  it("offers courses that need no division or have one picked", () => {
    expect(addableCourseOptions(["English", "Spanish", "Geometry"], ["11", "", ""])).toEqual([
      { displayName: "English", courseName: "English (11)", periodIndex: 0 },
      { displayName: "Geometry", courseName: "Geometry", periodIndex: 2 },
    ]);
  });
});

describe("suggestedAssessmentDocId", () => {
  it("keeps the ids existing suggestions were saved under", () => {
    // Worked out with the old my-courses.js's own simpleHash.
    expect(suggestedAssessmentDocId("2026-10-12", "English (10)", "Summative")).toBe("1wpbwc1");
    expect(suggestedAssessmentDocId("2026-01-05", "Geometry", "Formative")).toBe("1cvx6ct");
  });
});

describe("upcomingClassDays", () => {
  it("finds the next days a period meets", () => {
    const days = upcomingClassDays(4, 2, { "2026-10-13": "B", "2026-10-14": "A", "2026-10-15": "B" }, new Date(2026, 9, 12));
    expect(days).toEqual([new Date(2026, 9, 13), new Date(2026, 9, 15)]);
  });

  it("counts every weekday without a school calendar", () => {
    expect(upcomingClassDays(0, 2, {}, new Date(2026, 9, 16))).toEqual([new Date(2026, 9, 19), new Date(2026, 9, 20)]);
  });
});

describe("accepted suggestions", () => {
  const school = [
    { id: "s1", date: MONDAY, courseName: "English (10)", type: "Testing Block" },
    { id: "s2", date: "2026-10-13", courseName: "Geometry", type: "Formative" },
  ];
  const visible = (entry, periodIndex) => !(entry.date === "2026-10-13" && periodIndex < 4);

  it("matches an own copy to the school entry an admin added", () => {
    const added = [
      { id: "mine1", date: MONDAY, courseName: "English (10)", type: "Summative" },
      { id: "mine2", date: "2026-10-13", courseName: "Geometry", type: "Formative" },
      { id: "mine3", date: MONDAY, courseName: "English (10)", type: "Assignment" },
    ];
    const periodIndexOf = new Map([["English (10)", 0], ["Geometry", 1]]);
    // Geometry's entry is on a B day, which period 2 doesn't see.
    expect([...acceptedReplacements(added, school, periodIndexOf, visible)]).toEqual([["mine1", "s1"]]);
  });

  it("carries a check-off over to the school entry, once", () => {
    const replacedBy = new Map([["mine1", "s1"], ["mine2", "s2"]]);
    const completed = [{ id: "mine1", completedAt: 7 }, "old", { id: "mine2", completedAt: 8 }, { id: "s2", completedAt: 1 }];
    expect(carriedCompletions(completed, replacedBy)).toEqual([{ id: "s1", completedAt: 7 }]);
  });
});

describe("calendarDateRange", () => {
  it("runs from the first week of the school year to the end of the fourth week ahead", () => {
    // Monday 12 Oct 2026: this week starts Sunday the 11th, so four weeks ahead ends Saturday 7 Nov.
    expect(calendarDateRange(4, new Date(2026, 9, 12))).toEqual({ start: "2026-07-26", end: "2026-11-07" });
  });

  it("starts from the week of last August 1 in the spring", () => {
    // Aug 1 2025 was a Friday, so that week started Sunday 27 Jul.
    expect(calendarDateRange(4, new Date(2026, 2, 10)).start).toBe("2025-07-27");
  });

  it("counts the end from the start of this week, whatever day it is", () => {
    expect(calendarDateRange(4, new Date(2026, 9, 17)).end).toBe("2026-11-07"); // a Saturday
    expect(calendarDateRange(4, new Date(2026, 9, 11)).end).toBe("2026-11-07"); // the Sunday
  });
});

describe("lateLabel", () => {
  const sec = 1000;
  const min = 60 * sec;
  const hour = 60 * min;
  const day = 24 * hour;

  it("shows only the largest whole unit", () => {
    expect(lateLabel(2 * day + 3 * hour + 16 * min)).toBe("2d late");
    expect(lateLabel(8 * hour + 24 * min)).toBe("8h late");
    expect(lateLabel(5 * min + 40 * sec)).toBe("5m late");
    expect(lateLabel(14 * sec)).toBe("14s late");
  });

  it("changes unit exactly at the boundaries", () => {
    expect(lateLabel(59 * sec + 999)).toBe("59s late");
    expect(lateLabel(60 * sec)).toBe("1m late");
    expect(lateLabel(hour - 1)).toBe("59m late");
    expect(lateLabel(hour)).toBe("1h late");
    expect(lateLabel(day - 1)).toBe("23h late");
    expect(lateLabel(day)).toBe("1d late");
  });

  it("never says 0s", () => {
    expect(lateLabel(0)).toBe("1s late");
    expect(lateLabel(-5)).toBe("1s late");
  });
});

describe("pillDetails", () => {
  const formatDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
  const at = (hours, minutes) => new Date(2026, 9, 28, hours, minutes);

  it("describes an assignment with its due time and who added it", () => {
    const entry = { id: "a", date: "2026-10-28", courseName: "Biology", type: "Assignment", title: "Lab report", dueTime: "08:20" };
    const details = pillDetails(entry, { courseLabel: "Biology", periodIndex: 1, dueAt: at(8, 20), formatDate, addedBy: "You", done: false });
    expect(details.title).toBe("Lab report");
    expect(details.subtitle).toBe("Biology");
    expect(details.rows).toEqual([
      ["Date", "Wednesday, 10/28"],
      ["Due", "8:20 AM"],
      ["Added by", "You"],
    ]);
  });

  it("says the start of the day for an assignment with no set time, and its period when due then", () => {
    const base = { id: "a", date: "2026-10-28", courseName: "Biology", type: "Assignment", title: "HW" };
    const options = { courseLabel: "Biology", periodIndex: 1, formatDate, addedBy: "You" };
    expect(pillDetails({ ...base, dueTime: "start" }, { ...options, dueAt: at(0, 0) }).rows[1]).toEqual(["Due", "Start of the day"]);
    expect(pillDetails({ ...base, dueTime: "period" }, { ...options, dueAt: at(10, 18) }).rows[1]).toEqual(["Due", "Period 2, 10:18 AM"]);
  });

  it("describes a school assessment with its class time", () => {
    const entry = { id: "s", date: "2026-10-28", courseName: "Geometry", type: "Summative" };
    const details = pillDetails(entry, { courseLabel: "Geometry", periodIndex: 0, dueAt: at(8, 50), endsAt: at(10, 13), formatDate, addedBy: "Your school" });
    expect(details.title).toBe("Geometry Summative");
    expect(details.subtitle).toBe("Period 1");
    expect(details.rows).toContainEqual(["Time", "8:50 AM – 10:13 AM"]);
    expect(details.rows.at(-1)).toEqual(["Added by", "Your school"]);
  });

  it("gives just the start when no end is known", () => {
    const entry = { id: "s", date: "2026-10-28", courseName: "Geometry", type: "Summative" };
    const rows = pillDetails(entry, { courseLabel: "Geometry", periodIndex: 0, dueAt: at(8, 50), endsAt: null, formatDate, addedBy: "Your school" }).rows;
    expect(rows).toContainEqual(["Time", "8:50 AM"]);
  });

  it("leaves out the time when it isn't known", () => {
    const entry = { id: "s", date: "2026-10-28", courseName: "Geometry", type: "Formative" };
    const rows = pillDetails(entry, { courseLabel: "Geometry", periodIndex: undefined, dueAt: null, formatDate, addedBy: "Your school" }).rows;
    expect(rows.map(([label]) => label)).toEqual(["Date", "Added by"]);
  });
});

describe("addedByLabel", () => {
  it("says whose an assessment is", () => {
    expect(addedByLabel({ added: true, confirmed: false, fromStudent: false })).toBe("You");
    expect(addedByLabel({ added: false, confirmed: true, fromStudent: true })).toBe("You (Confirmed)");
    expect(addedByLabel({ added: false, confirmed: false, fromStudent: true })).toBe("Classmate");
    expect(addedByLabel({ added: false, confirmed: false, fromStudent: false })).toBe("Your school");
  });

  it("puts the student's own ahead of what the school has now", () => {
    expect(addedByLabel({ added: true, confirmed: true, fromStudent: true })).toBe("You");
    expect(addedByLabel({ added: false, confirmed: true, fromStudent: false })).toBe("You (Confirmed)");
  });
});

describe("pillDetails for a Testing Block", () => {
  const formatDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
  const entry = { id: "t", date: "2026-10-30", courseName: "Chemistry", type: "Testing Block" };

  it("names it in the subtitle and gives only its start as the time", () => {
    const details = pillDetails(entry, { courseLabel: "Chemistry", periodIndex: 4, dueAt: new Date(2026, 9, 30, 8, 0), formatDate, addedBy: "Your school" });
    expect(details.subtitle).toBe("Morning Testing Block");
    expect(details.rows).toContainEqual(["Time", "8:00 AM"]);
  });

  it("leaves out the time row when its start isn't known", () => {
    const details = pillDetails(entry, { courseLabel: "Chemistry", periodIndex: 4, dueAt: null, formatDate, addedBy: "Your school" });
    expect(details.rows.map(([label]) => label)).toEqual(["Date", "Added by"]);
  });
});
