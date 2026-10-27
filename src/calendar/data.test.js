import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What data.js reads from the app (src/shell): the student's data, the
// school's, Firebase, and the open tab's redraw. Kept here.
const app = vi.hoisted(() => ({ writes: [], data: null, uid: "u1", assessments: [] }));
vi.mock("../shell/data.js", () => ({
  get appData() {
    return app.data;
  },
  get currentUid() {
    return app.uid;
  },
  loadPeriods: () => app.data.periods,
  loadPeriodDivisions: () => app.data.periodDivisions,
  loadAddedAssessments: () => app.data.addedAssessments,
  saveAddedAssessments: vi.fn((entries) => (app.data.addedAssessments = entries)),
  loadCompletedTasks: () => app.data.completedTasks,
  loadConfirmedAssessments: () => app.data.confirmedAssessments || [],
  saveCompletedTasks: vi.fn(),
}));
vi.mock("../shell/school.js", () => ({
  get allAssessments() {
    return app.assessments;
  },
  allDayTypes: {},
  defaultPeriodTimes: null,
  assessmentsLoaded: true,
  assessmentsFetchDone: true,
  loadAssessments: (callback) => callback(),
  isAssessmentVisibleForPeriod: () => true,
}));
vi.mock("../shell/firebase.js", () => {
  const doc = (collection, id) => ({
    set: (value, options) => (app.writes.push({ op: "set", collection, id, value, options }), Promise.resolve()),
    update: (value) => (app.writes.push({ op: "update", collection, id, value }), Promise.resolve()),
  });
  return {
    hasFirebase: () => true,
    firestore: () => ({ collection: (name) => ({ doc: (id) => doc(name, id) }) }),
    firebaseAuth: () => ({ currentUser: { email: "kim@kis.ac" } }),
    arrayUnion: (...values) => ({ arrayUnion: values }),
    arrayRemove: (...values) => ({ arrayRemove: values }),
  };
});
vi.mock("../shell/preferences.js", () => ({ getPreferences: () => ({}), formatPreferredDate: (date) => String(date) }));
vi.mock("../shell/openTab.js", () => ({ redrawCalendar: vi.fn() }));

const { confirmedAssessmentIds, dropAcceptedSuggestions, logSuggestedAssessment, unlogSuggestedAssessment } = await import("./data.js");
const { saveAddedAssessments } = await import("../shell/data.js");
const { redrawCalendar } = await import("../shell/openTab.js");

let writes;
let appData;
beforeEach(() => {
  app.writes = [];
  writes = app.writes;
  app.uid = "u1";
  app.assessments = [];
  appData = { periods: ["English", "Geometry"], periodDivisions: ["10", ""], addedAssessments: [], completedTasks: [] };
  app.data = appData;
  saveAddedAssessments.mockClear();
  redrawCalendar.mockClear();
  vi.spyOn(Date, "now").mockReturnValue(1000);
});
afterEach(() => {
  vi.mocked(Date.now).mockRestore();
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
    app.uid = null;
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
    app.assessments = [{ id: "s1", date: "2026-10-12", courseName: "English (10)", type: "In-Class" }];
    dropAcceptedSuggestions();
    expect(appData.addedAssessments).toEqual([{ id: "mine2", date: "2026-10-13", courseName: "Geometry", type: "Formative" }]);
    expect(appData.completedTasks).toEqual([{ id: "mine1", completedAt: 7 }, { id: "s1", completedAt: 7 }]);
    expect(redrawCalendar).toHaveBeenCalledWith(true, true);
    // Remembered as this student's, so the details can still say "You (Confirmed)".
    expect(appData.confirmedAssessments).toEqual(["s1"]);
  });

  it("knows which school assessments began as the student's own, from what's remembered and what's matched now", () => {
    appData.confirmedAssessments = ["old1"];
    appData.addedAssessments = [{ id: "mine1", date: "2026-10-12", courseName: "English (10)", type: "Summative" }];
    app.assessments = [{ id: "s1", date: "2026-10-12", courseName: "English (10)", type: "In-Class" }, { id: "other", date: "2026-10-13", courseName: "English (10)", type: "Formative" }];
    expect([...confirmedAssessmentIds()].sort()).toEqual(["old1", "s1"]);
  });

  it("changes nothing with nothing accepted", () => {
    appData.addedAssessments = [{ id: "mine1", date: "2026-10-12", courseName: "English (10)", type: "Summative" }];
    dropAcceptedSuggestions();
    expect(saveAddedAssessments).not.toHaveBeenCalled();
  });
});
