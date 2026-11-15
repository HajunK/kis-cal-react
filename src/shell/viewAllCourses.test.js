// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { COURSE_CATALOG } from "../core/catalog.js";
import { emptyAppData } from "../core/sync.js";
import { appData, isViewOnly, pushDataToCloud } from "./data.js";
import { showWithoutFirebase, viewAllCourses } from "./session.js";

// The admin site's Calendar: every course, the account's own data left out, nothing saved.
describe("viewAllCourses", () => {
  it("shows every course in place of the account's own, view-only", () => {
    viewAllCourses();
    const own = { ...emptyAppData(), periods: ["Only This"], hiddenCourses: ["X"], preferences: { calendarView: "byClass" } };
    showWithoutFirebase("someone", own);
    // Each course once, none with a division picked, so the calendar names every division.
    expect(appData.periods.filter((name) => name === "English")).toHaveLength(1);
    expect(appData.periodDivisions.every((division) => division === "")).toBe(true);
    expect(appData.periods).toContain("Korean Language");
    expect(appData.periods).not.toContain("Lunch");
    expect(appData.hiddenCourses).toEqual([]);
    expect(appData.preferences).toEqual({ calendarView: "byClass" });
    expect(isViewOnly()).toBe(true);
    const before = appData.lastModified;
    pushDataToCloud();
    expect(appData.lastModified).toBe(before);
  });
});

import { matchEntries } from "../calendar/model.js";
describe("what the admin Calendar matches", () => {
  it("names each division of a course, as assessments are filed", () => {
    const names = matchEntries(appData.periods, appData.periodDivisions).matchEntries.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(["English (9)", "English (12)", "AP Calculus (BC)", "Korean (9)", "Korean (10)", "Korean Language", "Korean SS"]));
  });
});

import { getPreferences, setPreference } from "./preferences.js";
describe("the admin Calendar's own preferences", () => {
  it("keeps its colors and view apart from the account's", () => {
    // The account's saved copy of them is not read here.
    expect(getPreferences().courseColors).toEqual({});
    setPreference("courseColors", { Art: "red" });
    setPreference("calendarView", "byClass");
    expect(getPreferences()).toMatchObject({ courseColors: { Art: "red" }, calendarView: "byClass" });
    expect(JSON.parse(localStorage.getItem("adminCalendarPrefs"))).toMatchObject({ calendarView: "byClass" });
    // Other preferences are still the account's, and still save to it.
    setPreference("dateFormat", "numeric");
    expect(getPreferences().dateFormat).toBe("numeric");
  });
});
