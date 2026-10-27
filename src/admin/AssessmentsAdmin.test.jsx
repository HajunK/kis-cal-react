// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toISODate } from "../core/dates.js";
import { fakeAuth, fakeFirestore } from "../test/fakeFirebase.js";
import { AssessmentsAdmin } from "./AssessmentsAdmin.jsx";

const ADMIN = { email: "hajunk105@gmail.com" };
const DELETE = { __delete: true };
// A Monday this month, so it's on the calendar that opens.
const now = new Date();
const firstMonday = new Date(now.getFullYear(), now.getMonth(), 1 + ((8 - new Date(now.getFullYear(), now.getMonth(), 1).getDay()) % 7));
const MONDAY = toISODate(firstMonday);

function renderPage({ user = ADMIN, collections = {} } = {}) {
  const db = fakeFirestore({
    assessments: { a1: { type: "In-Class", date: MONDAY, courseName: "Geometry", createdAt: 1 } },
    dayTypes: {},
    periodTimes: {},
    meta: { cacheVersions: { assessments: 1, dayTypes: 1, periodTimes: 1 } },
    suggested: {
      s1: { date: MONDAY, courseName: "Biology", type: "Summative", emails: ["kim@kis.ac", "lee@kis.ac"], lastAddedAt: 5 },
      s2: { date: MONDAY, courseName: "Chemistry", type: "Formative", emails: ["park@kis.ac"], lastAddedAt: 6 },
    },
    ...collections,
  });
  const page = {
    auth: fakeAuth(user),
    db,
    deleteField: () => DELETE,
    toasts: [],
    toast: (message) => page.toasts.push(message),
    alert: vi.fn(),
    formatDate: (date) => `${date.getMonth() + 1}/${date.getDate()}`,
  };
  render(<AssessmentsAdmin page={page} />);
  return page;
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const day = (iso) => [...document.querySelectorAll("#admin-cal-grid .assessment-calendar-day:not(.assessment-calendar-day--outside)")][Number(iso.slice(8)) - 1];
const writesTo = (page, collection) => page.db.writes.filter((write) => write.collection === collection);

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AssessmentsAdmin", () => {
  it("turns away a non-admin without reading anything", async () => {
    const page = renderPage({ user: { email: "student@kis.ac" } });
    await settle();
    expect(screen.getByText("This page is for admins only.").hidden).toBe(false);
    expect(document.getElementById("admin-calendar-layout").hidden).toBe(true);
    expect(page.db.writes).toEqual([]);
  });

  it("draws the month with each day's assessments as dots, once loaded", async () => {
    renderPage();
    expect(document.getElementById("admin-cal-loading").hidden).toBe(false);
    await settle();
    expect(document.getElementById("admin-cal-loading").hidden).toBe(true);
    expect(document.querySelectorAll("#admin-cal-weekdays span")).toHaveLength(7);
    expect(day(MONDAY).querySelectorAll(".assessment-calendar-day-dot")).toHaveLength(1);
    expect(day(MONDAY).className).toContain("assessment-calendar-day--block-day");
  });

  it("selects a day, showing its assessments, the A/B toggle and the form", async () => {
    renderPage();
    await settle();
    expect(document.getElementById("admin-add-form").hidden).toBe(true);
    fireEvent.click(day(MONDAY));
    expect(document.getElementById("admin-day-title").textContent).toMatch(/\d{4}$/);
    expect(document.getElementById("admin-add-form").hidden).toBe(false);
    expect(document.getElementById("admin-day-type-toggle").hidden).toBe(false);
    expect(document.querySelector(".admin-day-entry-name").textContent).toBe("Geometry");
  });

  it("sets an A day, seeding the default schedule when there's none", async () => {
    const page = renderPage();
    await settle();
    fireEvent.click(day(MONDAY));
    fireEvent.click(within(document.getElementById("admin-day-type-toggle")).getByText("A"));
    await settle();
    expect(writesTo(page, "dayTypes")).toEqual([{ op: "set", collection: "dayTypes", id: MONDAY, value: { type: "A" } }]);
    expect(writesTo(page, "periodTimes")[0].value.times).toHaveLength(5);
    expect(day(MONDAY).querySelector(".assessment-calendar-day-type").textContent).toBe("A");
  });

  it("adds an assessment for the typed course and its division", async () => {
    const page = renderPage();
    await settle();
    fireEvent.click(day(MONDAY));
    const input = document.querySelector(".admin-course-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "engl" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("English");
    expect(document.getElementById("admin-division-field").hidden).toBe(false);
    fireEvent.click(within(document.getElementById("admin-division-picker")).getByText("10"));
    fireEvent.click(within(document.getElementById("admin-type-toggle")).getByText("Formative"));
    fireEvent.submit(document.getElementById("admin-add-form"));
    await settle();
    expect(writesTo(page, "assessments")).toEqual([
      { op: "add", collection: "assessments", value: { type: "Formative", date: MONDAY, courseName: "English (10)", createdAt: expect.any(Number) } },
    ]);
    expect(input.value).toBe("");
    expect([...document.querySelectorAll(".admin-day-entry-name")].map((el) => el.textContent)).toEqual(["Geometry", "English (10)"]);
  });

  it("needs a division, and a label for Other, before adding", async () => {
    const page = renderPage();
    await settle();
    fireEvent.click(day(MONDAY));
    const input = document.querySelector(".admin-course-input");
    fireEvent.change(input, { target: { value: "English" } });
    fireEvent.submit(document.getElementById("admin-add-form"));
    expect(page.alert).toHaveBeenCalledWith("Pick a division first — this course tests on different days for each one.");
    fireEvent.change(input, { target: { value: "Geometry" } });
    fireEvent.click(within(document.getElementById("admin-type-toggle")).getByText("Other"));
    expect(document.activeElement).toBe(document.getElementById("admin-type-other-input"));
    fireEvent.submit(document.getElementById("admin-add-form"));
    expect(page.alert).toHaveBeenCalledWith("Type a label for the custom assessment type first.");
    expect(writesTo(page, "assessments")).toEqual([]);
  });

  it("deletes an assessment, putting it back if that fails", async () => {
    const page = renderPage();
    await settle();
    fireEvent.click(day(MONDAY));
    page.db.failNext("delete");
    fireEvent.click(screen.getByRole("button", { name: "Delete assessment" }));
    expect(document.querySelector(".admin-day-entry-name")).toBe(null);
    await settle();
    expect(page.alert).toHaveBeenCalledWith("Something went wrong deleting that assessment. Please try again.");
    expect(document.querySelector(".admin-day-entry-name").textContent).toBe("Geometry");
  });

  it("lists suggestions soonest first, offering In-Class or Testing Block for a Monday summative", async () => {
    renderPage();
    await settle();
    expect(document.getElementById("suggestions-count").textContent).toBe("2");
    const rows = [...document.querySelectorAll("#suggestions-rows .suggestions-row")];
    expect(rows.map((row) => row.querySelector(".suggestions-cell--course").textContent)).toEqual(["Biology", "Chemistry"]);
    expect([...rows[0].querySelectorAll(".suggestions-accept-btn")].map((btn) => btn.textContent)).toEqual(["In-Class", "Testing Block"]);
    expect([...rows[1].querySelectorAll(".suggestions-accept-btn")].map((btn) => btn.textContent)).toEqual(["Accept"]);
    expect(rows[0].querySelector(".suggestions-cell--emails").textContent).toBe("kim, lee");
  });

  it("accepts a suggestion onto the calendar and declines another", async () => {
    const page = renderPage();
    await settle();
    fireEvent.click(screen.getByText("Testing Block", { selector: ".suggestions-accept-btn" }));
    await settle();
    fireEvent.click(screen.getAllByText("Decline")[0]);
    await settle();
    expect(writesTo(page, "assessments")).toEqual([
      { op: "add", collection: "assessments", value: { type: "Testing Block", date: MONDAY, courseName: "Biology", createdAt: expect.any(Number), fromStudent: true } },
    ]);
    expect(writesTo(page, "suggested")).toEqual([
      { op: "delete", collection: "suggested", id: "s1" },
      { op: "delete", collection: "suggested", id: "s2" },
    ]);
    expect(document.getElementById("suggestions-empty").hidden).toBe(false);
    expect(day(MONDAY).querySelectorAll(".assessment-calendar-day-dot")).toHaveLength(2);
  });

  it("accepts a Wednesday summative as In-Class, from a plain Accept button", async () => {
    const page = renderPage({
      collections: {
        suggested: {
          s9: { date: "2026-10-14", courseName: "Physics", type: "Summative", emails: ["kim@kis.ac"], lastAddedAt: 9 },
        },
      },
    });
    await settle();
    const accept = screen.getByText("Accept", { selector: ".suggestions-accept-btn" });
    expect(screen.queryByText("Summative", { selector: ".suggestions-accept-btn" })).toBe(null);
    fireEvent.click(accept);
    await settle();
    expect(writesTo(page, "assessments")).toEqual([
      { op: "add", collection: "assessments", value: { type: "In-Class", date: "2026-10-14", courseName: "Physics", createdAt: expect.any(Number), fromStudent: true } },
    ]);
  });

  it("saves the day's bell schedule from its popup", async () => {
    const page = renderPage({
      collections: {
        periodTimes: {
          default: { times: [{ start: "08:50", end: "10:13" }, { start: "10:18", end: "11:41" }, { start: "11:41", end: "12:30" }, { start: "12:30", end: "13:53" }, { start: "13:58", end: "15:21" }] },
        },
      },
    });
    await settle();
    fireEvent.click(day(MONDAY));
    fireEvent.click(screen.getByRole("button", { name: "Bell Schedule" }));
    const dialog = screen.getByRole("dialog", { name: "Schedule" });
    expect(dialog.querySelectorAll(".admin-schedule-row").length).toBeGreaterThan(5);
    expect(dialog.querySelector(".admin-schedule-reset-slot").hasAttribute("inert")).toBe(true);
    fireEvent.click(within(dialog).getByText("Save Schedule"));
    await settle();
    const saved = writesTo(page, "periodTimes");
    expect(saved).toHaveLength(1);
    expect(saved[0].options).toEqual({ merge: true });
    expect(saved[0].value.daySchedules).toEqual({ [MONDAY]: DELETE });
    expect(saved[0].value.times[0]).toEqual({ start: "08:50", end: "10:13" });
    expect(page.toasts).toEqual(["Schedule saved."]);
  });

  it.each(["A", "B", undefined])("puts a saved day back to normal with Reset, which then goes away (%s day)", async (dayType) => {
    const times = [{ start: "08:50", end: "10:13" }, { start: "10:18", end: "11:41" }, { start: "11:41", end: "12:30" }, { start: "12:30", end: "13:53" }, { start: "13:58", end: "15:21" }];
    const custom = { included: ["period1", "period2"], times: { period1: { start: "09:00", end: "10:00" }, period2: { start: "10:30", end: "11:30" } } };
    renderPage({
      collections: {
        dayTypes: dayType ? { [MONDAY]: dayType } : {},
        periodTimes: { default: { times, daySchedules: { [MONDAY]: custom } } },
      },
    });
    await settle();
    fireEvent.click(day(MONDAY));
    fireEvent.click(screen.getByRole("button", { name: "Bell Schedule" }));
    const dialog = screen.getByRole("dialog", { name: "Schedule" });
    const slot = dialog.querySelector(".admin-schedule-reset-slot");
    expect(slot.hasAttribute("inert")).toBe(false);
    fireEvent.click(within(dialog).getByText("Reset this day"));
    expect(slot.hasAttribute("inert")).toBe(true);
  });

  it("puts an event's times back to what they were when it's taken off with its X", async () => {
    renderPage({ collections: { periodTimes: { default: {} } } });
    await settle();
    fireEvent.click(day(MONDAY));
    fireEvent.click(screen.getByRole("button", { name: "Bell Schedule" }));
    const dialog = screen.getByRole("dialog", { name: "Schedule" });
    const start = () => within(dialog).getByLabelText("Lunch start").value;
    const original = start();
    fireEvent.change(within(dialog).getByLabelText("Lunch start"), { target: { value: "11:00" } });
    expect(start()).toBe("11:00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Lunch" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Lunch" }));
    expect(start()).toBe(original);
  });

  it("takes an event off the day with its X and adds one from the pills", async () => {
    const page = renderPage({ collections: { periodTimes: { default: {} } } });
    await settle();
    fireEvent.click(day(MONDAY));
    fireEvent.click(screen.getByRole("button", { name: "Bell Schedule" }));
    const dialog = screen.getByRole("dialog", { name: "Schedule" });
    const labels = () => [...dialog.querySelectorAll(".admin-schedule-row-label")].map((el) => el.textContent);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Lunch" }));
    expect(labels()).not.toContain("Lunch");
    const pills = () => [...dialog.querySelectorAll(".admin-schedule-add-pill")].map((el) => el.textContent);
    expect(pills()).toContain("Lunch");
    expect(pills()).toContain("Advisory");
    expect(pills()).not.toContain(labels()[0]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Advisory" }));
    expect(labels()).toContain("Advisory");
    expect(pills()).not.toContain("Advisory");
    expect(pills()).toContain("Lunch");
    expect(dialog.querySelector(".admin-schedule-reset-slot").hasAttribute("inert")).toBe(false);
    fireEvent.click(within(dialog).getByText("Save Schedule"));
    await settle();
    const custom = writesTo(page, "periodTimes")[0].value.daySchedules[MONDAY];
    expect(custom.included).not.toContain("block2");
    expect(custom.included).toContain("advisory");
    expect(custom.times.advisory).toEqual({ start: "08:20", end: "08:45" });
  });
});
