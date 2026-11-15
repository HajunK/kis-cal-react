// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The labels an admin typed for days (periodTimes/dayLabels), read with the bell schedule.
const state = { labels: { "2026-10-30": "Fall Festival" }, labelsFail: false };
const asDoc = (value) => ({ exists: value !== undefined, data: () => value });

vi.mock("./firebase.js", () => ({
  hasFirebase: () => true,
  firestore: () => ({
    collection: (name) => ({
      get: () => Promise.resolve({ docs: [] }),
      doc: (id) => ({
        get: () => {
          if (name === "periodTimes" && id === "dayLabels") {
            return state.labelsFail ? Promise.reject(new Error("no")) : Promise.resolve(asDoc(state.labels && { labels: state.labels }));
          }
          if (name === "periodTimes" && id === "default") return Promise.resolve(asDoc({ times: [{ start: "08:50", end: "10:13" }] }));
          return Promise.resolve(asDoc(undefined));
        },
      }),
    }),
  }),
}));
vi.mock("./data.js", () => ({ loadAddedAssessments: () => [] }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function freshSchool() {
  vi.resetModules();
  return import("./school.js");
}

beforeEach(() => {
  localStorage.clear();
  state.labels = { "2026-10-30": "Fall Festival" };
  state.labelsFail = false;
});

describe("day labels", () => {
  it("reads them with the schedule and keeps them for the next visit", async () => {
    const school = await freshSchool();
    expect(school.dayLabelFor("2026-10-30")).toBe("");
    school.startSchoolData();
    await flush();
    await flush();
    expect(school.dayLabelFor("2026-10-30")).toBe("Fall Festival");
    expect(school.dayLabelFor("2026-10-31")).toBe("");

    const later = await freshSchool();
    expect(later.dayLabelFor("2026-10-30")).toBe("Fall Festival");
  });

  it("still gets the schedule when the labels can't be read, and leaves the kept ones alone", async () => {
    localStorage.setItem("cachedDayLabels", JSON.stringify({ "2026-10-30": "Kept" }));
    state.labelsFail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const school = await freshSchool();
    school.startSchoolData();
    const done = vi.fn();
    school.loadPeriodTimes(done);
    await flush();
    await flush();
    expect(school.defaultPeriodTimes.times).toHaveLength(1);
    expect(done).toHaveBeenCalled();
    expect(school.dayLabelFor("2026-10-30")).toBe("Kept");
  });

  it("has none when none were typed", async () => {
    state.labels = undefined;
    const school = await freshSchool();
    school.startSchoolData();
    await flush();
    await flush();
    expect(school.dayLabelFor("2026-10-30")).toBe("");
    expect(JSON.parse(localStorage.getItem("cachedDayLabels"))).toEqual({});
  });
});
