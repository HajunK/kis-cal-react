// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The school's data, with the assessments refused to anyone who hasn't signed in
// (see firestore.rules).
const state = { signedIn: false };
const asDoc = (id, data) => ({ id, data: () => data });

vi.mock("./firebase.js", () => ({
  hasFirebase: () => true,
  firestore: () => ({
    collection: (name) => ({
      get: () => {
        if (name === "assessments" && !state.signedIn) return Promise.reject({ code: "permission-denied" });
        if (name === "assessments") return Promise.resolve({ docs: [asDoc("a1", { type: "Summative", date: "2026-10-30", courseName: "Biology" })] });
        return Promise.resolve({ docs: [] });
      },
      doc: () => ({ get: () => Promise.resolve({ exists: false, data: () => ({}) }) }),
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
  state.signedIn = false;
});

describe("the school's data without a sign-in", () => {
  it("carries on without the assessments, so the bell schedule and day types still arrive", async () => {
    const school = await freshSchool();
    school.startSchoolData();
    const done = vi.fn();
    school.loadScheduleData(done);
    await flush();
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
    expect(school.allAssessments).toEqual([]);
  });

  it("reads the assessments once someone signs in, and tells what was waiting for them", async () => {
    const school = await freshSchool();
    school.startSchoolData();
    await flush();
    await flush();
    expect(school.allAssessments).toEqual([]);

    state.signedIn = true;
    school.retryAssessmentsAfterSignIn();
    // Not counted as loaded until they are, so a tab drawn for the sign-in waits.
    expect(school.assessmentsLoaded).toBe(false);
    const seen = vi.fn();
    school.loadAssessments(seen);
    await flush();
    await flush();
    expect(school.assessmentsLoaded).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(school.allAssessments.map((entry) => entry.id)).toEqual(["a1"]);
  });

  it("does nothing on sign-in when nothing was refused", async () => {
    state.signedIn = true;
    const school = await freshSchool();
    school.startSchoolData();
    await flush();
    await flush();
    expect(school.allAssessments).toHaveLength(1);
    school.retryAssessmentsAfterSignIn();
    expect(school.assessmentsLoaded).toBe(true);
  });
});
