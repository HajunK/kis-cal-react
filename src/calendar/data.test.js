import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropAcceptedSuggestions, logSuggestedAssessment, unlogSuggestedAssessment } from "./data.js";

// data.js reads the page's globals by name; these stand in for them.
const FIELD_VALUE = {
  arrayUnion: (...values) => ({ arrayUnion: values }),
  arrayRemove: (...values) => ({ arrayRemove: values }),
};
let writes;
let appData;

beforeEach(() => {
  writes = [];
  const doc = (collection, id) => ({
    set: (value, options) => (writes.push({ op: "set", collection, id, value, options }), Promise.resolve()),
    update: (value) => (writes.push({ op: "update", collection, id, value }), Promise.resolve()),
  });
  const firestore = () => ({ collection: (name) => ({ doc: (id) => doc(name, id) }) });
  firestore.FieldValue = FIELD_VALUE;
  appData = { periods: ["English", "Geometry"], periodDivisions: ["10", ""], addedAssessments: [], completedTasks: [] };
  Object.assign(globalThis, {
    firebase: { firestore },
    currentUid: "u1",
    auth: { currentUser: { email: "kim@kis.ac" } },
    appData,
    loadPeriods: () => appData.periods,
    loadPeriodDivisions: () => appData.periodDivisions,
    loadAddedAssessments: () => appData.addedAssessments,
    saveAddedAssessments: vi.fn((entries) => (appData.addedAssessments = entries)),
    loadCompletedTasks: () => appData.completedTasks,
    allAssessments: [],
    assessmentsFetchDone: true,
    loadAssessments: (callback) => callback(),
    isAssessmentVisibleForPeriod: () => true,
  });
  globalThis.window = { myCoursesRefreshCalendar: vi.fn() };
  vi.spyOn(Date, "now").mockReturnValue(1000);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const name of ["firebase", "currentUid", "auth", "appData", "loadPeriods", "loadPeriodDivisions", "loadAddedAssessments", "saveAddedAssessments", "loadCompletedTasks", "allAssessments", "assessmentsFetchDone", "loadAssessments", "isAssessmentVisibleForPeriod", "window"]) delete globalThis[name];
});

describe("suggested assessments", () => {
  it("adds this student's email to the suggestion, merged", () => {
    logSuggestedAssessment("2026-10-12", "English (10)", "Summative");
    expect(writes).toEqual([
      {
        op: "set",
        collection: "suggested",
        id: "1wpbwc1",
        value: { date: "2026-10-12", courseName: "English (10)", type: "Summative", emails: { arrayUnion: ["kim@kis.ac"] }, lastAddedAt: 1000 },
        options: { merge: true },
      },
    ]);
  });

  it("removes only this student's email", () => {
    unlogSuggestedAssessment("2026-10-12", "English (10)", "Summative");
    expect(writes).toEqual([{ op: "update", collection: "suggested", id: "1wpbwc1", value: { emails: { arrayRemove: ["kim@kis.ac"] } } }]);
  });

  it("writes nothing signed out", () => {
    globalThis.currentUid = null;
    logSuggestedAssessment("2026-10-12", "English (10)", "Summative");
    unlogSuggestedAssessment("2026-10-12", "English (10)", "Summative");
    expect(writes).toEqual([]);
  });
});

describe("dropAcceptedSuggestions", () => {
  it("drops an own copy an admin accepted, carrying its check-off over, and redraws", () => {
    appData.addedAssessments = [
      { id: "mine1", date: "2026-10-12", courseName: "English (10)", type: "Summative" },
      { id: "mine2", date: "2026-10-13", courseName: "Geometry", type: "Formative" },
    ];
    appData.completedTasks = [{ id: "mine1", completedAt: 7 }];
    globalThis.allAssessments = [{ id: "s1", date: "2026-10-12", courseName: "English (10)", type: "In-Class" }];
    dropAcceptedSuggestions();
    expect(appData.addedAssessments).toEqual([{ id: "mine2", date: "2026-10-13", courseName: "Geometry", type: "Formative" }]);
    expect(appData.completedTasks).toEqual([{ id: "mine1", completedAt: 7 }, { id: "s1", completedAt: 7 }]);
    expect(globalThis.window.myCoursesRefreshCalendar).toHaveBeenCalledWith(true, true);
  });

  it("changes nothing with nothing accepted", () => {
    appData.addedAssessments = [{ id: "mine1", date: "2026-10-12", courseName: "English (10)", type: "Summative" }];
    dropAcceptedSuggestions();
    expect(globalThis.saveAddedAssessments).not.toHaveBeenCalled();
  });
});
