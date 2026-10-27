import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import {
  acceptSuggestion,
  acceptedType,
  addAssessment,
  clearDaySchedule,
  declineSuggestion,
  deleteAssessment,
  deleteReportedAssessment,
  dismissReport,
  ensureCacheVersions,
  fetchDayTypes,
  fetchPeriodTimes,
  saveDayType,
  saveSchedule,
  putReportBack,
  putSuggestionBack,
  seedDefaultSchedule,
  undoAcceptedSuggestion,
  watchReports,
  watchSuggestions,
} from "./adminData.js";

const DELETE = { __delete: true };
const deleteField = () => DELETE;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const stamp = (key, at) => ({ op: "set", collection: "meta", id: "cacheVersions", value: { [key]: at }, options: { merge: true } });

beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(1000));
afterEach(() => vi.restoreAllMocks());

describe("day types", () => {
  it("sets a day's type, or deletes it for unset, then restamps dayTypes", async () => {
    const db = fakeFirestore({ dayTypes: { "2026-10-12": { type: "B" } } });
    await saveDayType(db, "2026-10-13", "A");
    await saveDayType(db, "2026-10-12", null);
    await flush();
    expect(db.writes).toEqual([
      { op: "set", collection: "dayTypes", id: "2026-10-13", value: { type: "A" } },
      stamp("dayTypes", 1000),
      { op: "delete", collection: "dayTypes", id: "2026-10-12" },
      stamp("dayTypes", 1000),
    ]);
    expect(await fetchDayTypes(db)).toEqual({ "2026-10-13": "A" });
  });
});

describe("the bell schedule", () => {
  it("seeds the default schedule as a whole doc", async () => {
    const db = fakeFirestore();
    await seedDefaultSchedule(db);
    expect(db.writes[0]).toEqual({
      op: "set",
      collection: "periodTimes",
      id: "default",
      value: {
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
      },
    });
    expect(db.writes[1]).toEqual(stamp("periodTimes", 1000));
  });

  it("saves the times and the date's arrangement merged in, deleting a normal one", async () => {
    const db = fakeFirestore();
    const schedule = { times: [{ start: "08:50", end: "10:13" }], testingBlock: { start: "08:00", end: "08:50" } };
    await saveSchedule(db, "2026-10-12", schedule, { slots: { block0: "period4" }, included: ["period4"] }, deleteField);
    await saveSchedule(db, "2026-10-13", schedule, null, deleteField);
    await clearDaySchedule(db, "2026-10-14", deleteField);
    await flush();
    const scheduleWrites = db.writes.filter((write) => write.collection === "periodTimes");
    expect(scheduleWrites).toEqual([
      { op: "set", collection: "periodTimes", id: "default", value: { ...schedule, daySchedules: { "2026-10-12": { slots: { block0: "period4" }, included: ["period4"] } } }, options: { merge: true } },
      { op: "set", collection: "periodTimes", id: "default", value: { ...schedule, daySchedules: { "2026-10-13": DELETE } }, options: { merge: true } },
      { op: "set", collection: "periodTimes", id: "default", value: { daySchedules: { "2026-10-14": DELETE } }, options: { merge: true } },
    ]);
  });

  it("reads a missing schedule as empty parts", async () => {
    expect(await fetchPeriodTimes(fakeFirestore())).toEqual({ times: null, testingBlock: null, academicSupport: null, advisory: null, daySchedules: {} });
  });
});

describe("cache stamps", () => {
  it("creates all three stamps when there are none, and leaves existing ones alone", async () => {
    const empty = fakeFirestore();
    await ensureCacheVersions(empty);
    expect(empty.writes).toEqual([{ op: "set", collection: "meta", id: "cacheVersions", value: { assessments: 1000, dayTypes: 1000, periodTimes: 1000 }, options: { merge: true } }]);
    const stamped = fakeFirestore({ meta: { cacheVersions: { assessments: 5 } } });
    await ensureCacheVersions(stamped);
    expect(stamped.writes).toEqual([]);
  });
});

describe("assessments", () => {
  it("adds exactly type, date, courseName and createdAt, and deletes by id", async () => {
    const db = fakeFirestore();
    const id = await addAssessment(db, { type: "In-Class", date: "2026-10-12", courseName: "English (10)" });
    await deleteAssessment(db, id);
    await flush();
    expect(db.writes).toEqual([
      { op: "add", collection: "assessments", value: { type: "In-Class", date: "2026-10-12", courseName: "English (10)", createdAt: 1000 } },
      stamp("assessments", 1000),
      { op: "delete", collection: "assessments", id },
      stamp("assessments", 1000),
    ]);
  });
});

describe("suggestions", () => {
  const suggestion = { id: "s1", date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["a@kis.ac"], lastAddedAt: 5 };

  it("lists suggestions with emails and deletes emptied ones", async () => {
    // Stored without their ids, as Firestore docs are.
    const { id, ...stored } = suggestion;
    const db = fakeFirestore({ suggested: { s1: stored, s2: { ...stored, emails: [] } } });
    const seen = [];
    watchSuggestions(db, (list) => seen.push(list.map((entry) => entry.id)));
    await flush();
    expect(seen).toEqual([["s1"]]);
    expect(db.writes).toEqual([{ op: "delete", collection: "suggested", id: "s2" }]);
  });

  it("accepts as the type chosen: the assessment first, then the suggestion goes", async () => {
    const db = fakeFirestore({ suggested: { s1: suggestion } });
    const added = [];
    await acceptSuggestion(db, suggestion, "Testing Block", (id) => added.push([id, db.writes.length]));
    await flush();
    expect(db.writes).toEqual([
      { op: "add", collection: "assessments", value: { type: "Testing Block", date: "2026-10-12", courseName: "Geometry", createdAt: 1000, fromStudent: true } },
      stamp("assessments", 1000),
      { op: "delete", collection: "suggested", id: "s1" },
    ]);
    // Shown on the calendar before the suggestion is deleted.
    expect(added[0][1]).toBe(2);
  });

  it("goes in as In-Class when a Tuesday, Wednesday or Thursday summative is accepted", () => {
    // 2026-10-13 is a Tuesday, the 14th a Wednesday, the 15th a Thursday.
    for (const date of ["2026-10-13", "2026-10-14", "2026-10-15"]) {
      expect(acceptedType({ ...suggestion, date })).toBe("In-Class");
    }
  });

  it("stays as suggested on any other day, and for any other type", () => {
    // Monday the 12th, Friday the 16th, Saturday the 17th, Sunday the 18th.
    for (const date of ["2026-10-12", "2026-10-16", "2026-10-17", "2026-10-18"]) {
      expect(acceptedType({ ...suggestion, date })).toBe("Summative");
    }
    for (const type of ["Formative", "Reassessment", "In-Class", "Testing Block"]) {
      expect(acceptedType({ ...suggestion, date: "2026-10-14", type })).toBe(type);
    }
  });

  it("accepts a Wednesday summative onto the calendar as In-Class", async () => {
    const wednesday = { ...suggestion, date: "2026-10-14" };
    const db = fakeFirestore({ suggested: { s1: wednesday } });
    await acceptSuggestion(db, wednesday, acceptedType(wednesday), () => {});
    await flush();
    expect(db.writes[0]).toEqual({ op: "add", collection: "assessments", value: { type: "In-Class", date: "2026-10-14", courseName: "Geometry", createdAt: 1000, fromStudent: true } });
  });

  it("declines by deleting only the suggestion", async () => {
    const db = fakeFirestore({ suggested: { s1: suggestion } });
    await declineSuggestion(db, suggestion);
    expect(db.writes).toEqual([{ op: "delete", collection: "suggested", id: "s1" }]);
  });
});

describe("reports that an assessment is wrong", () => {
  const stored = { assessmentId: "as1", date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["a@kis.ac", "b@kis.ac"], lastReportedAt: 7 };

  it("lists reports as rows the suggestions list can draw, and deletes emptied ones", async () => {
    const db = fakeFirestore({ reportedAssessments: { as1: stored, as2: { ...stored, assessmentId: "as2", emails: [] } } });
    const seen = [];
    watchReports(db, (list) => seen.push(list));
    await flush();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    expect(seen[0][0]).toMatchObject({ id: "report-as1", reportId: "as1", kind: "report", assessmentId: "as1", courseName: "Geometry", lastAddedAt: 7 });
    expect(db.writes).toEqual([{ op: "delete", collection: "reportedAssessments", id: "as2" }]);
  });

  it("dismisses by deleting only the report", async () => {
    const db = fakeFirestore({ reportedAssessments: { as1: stored } });
    await dismissReport(db, { reportId: "as1" });
    expect(db.writes).toEqual([{ op: "delete", collection: "reportedAssessments", id: "as1" }]);
  });

  it("deletes the assessment itself, then the report", async () => {
    const db = fakeFirestore({ assessments: { as1: { type: "Summative", date: "2026-10-12", courseName: "Geometry" } }, reportedAssessments: { as1: stored } });
    await deleteReportedAssessment(db, { reportId: "as1", assessmentId: "as1" });
    await flush();
    expect(db.writes).toEqual([
      { op: "delete", collection: "assessments", id: "as1" },
      stamp("assessments", 1000),
      { op: "delete", collection: "reportedAssessments", id: "as1" },
    ]);
  });
});

describe("taking an accept back", () => {
  const entry = { id: "s1", date: "2026-10-12", courseName: "Geometry", type: "In-Class", suggestedType: "Summative", emails: ["a@kis.ac"], lastAddedAt: 5, assessmentId: "as1" };

  it("puts the suggestion back as it was suggested, then takes the assessment off the calendar", async () => {
    const db = fakeFirestore({ assessments: { as1: { type: "In-Class", date: "2026-10-12", courseName: "Geometry" } } });
    await undoAcceptedSuggestion(db, entry);
    await flush();
    expect(db.writes).toEqual([
      { op: "set", collection: "suggested", id: "s1", value: { date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["a@kis.ac"], lastAddedAt: 5 } },
      { op: "delete", collection: "assessments", id: "as1" },
      stamp("assessments", 1000),
    ]);
  });

  it("keeps a student who suggested it again in the meantime", async () => {
    const db = fakeFirestore({ suggested: { s1: { date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["b@kis.ac"], lastAddedAt: 9 } } });
    await undoAcceptedSuggestion(db, entry);
    await flush();
    expect(db.writes[0].value).toMatchObject({ emails: ["a@kis.ac", "b@kis.ac"], lastAddedAt: 9, type: "Summative" });
  });

  it("leaves the assessment on the calendar if putting the suggestion back fails", async () => {
    const db = fakeFirestore({});
    db.failNext("set");
    await expect(undoAcceptedSuggestion(db, entry)).rejects.toBeTruthy();
    expect(db.writes.filter((write) => write.op === "delete")).toEqual([]);
  });
});

describe("putting dismissed ones back", () => {
  it("puts a declined suggestion back as it was, keeping a student who suggested it again", async () => {
    const db = fakeFirestore({ suggested: { s1: { date: "2026-10-12", courseName: "Geometry", type: "Formative", emails: ["b@kis.ac"], lastAddedAt: 9 } } });
    await putSuggestionBack(db, { id: "s1", date: "2026-10-12", courseName: "Geometry", type: "Formative", emails: ["a@kis.ac"], lastAddedAt: 5 });
    expect(db.writes).toEqual([
      { op: "set", collection: "suggested", id: "s1", value: { date: "2026-10-12", courseName: "Geometry", type: "Formative", emails: ["a@kis.ac", "b@kis.ac"], lastAddedAt: 9 } },
    ]);
  });

  it("puts a dismissed report back under its assessment's id", async () => {
    const db = fakeFirestore();
    await putReportBack(db, { id: "report-as1", kind: "report", date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["a@kis.ac", "b@kis.ac"], lastAddedAt: 7 });
    expect(db.writes).toEqual([
      { op: "set", collection: "reportedAssessments", id: "as1", value: { assessmentId: "as1", date: "2026-10-12", courseName: "Geometry", type: "Summative", emails: ["a@kis.ac", "b@kis.ac"], lastReportedAt: 7 } },
    ]);
  });
});
