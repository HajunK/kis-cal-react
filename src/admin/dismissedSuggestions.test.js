// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DISMISSED_KEEP_MS, loadDismissedSuggestions, recordDismissedSuggestion, removeDismissedSuggestion } from "./dismissedSuggestions.js";

const suggestion = (id, extra = {}) => ({ id, date: "2026-10-30", courseName: "Biology", type: "Formative", emails: ["a@kis.ac"], lastAddedAt: 5, ...extra });

beforeEach(() => localStorage.clear());

describe("dismissed suggestions", () => {
  it("keeps what was dismissed, newest first, telling a report from a suggestion", () => {
    recordDismissedSuggestion(suggestion("one"), 1000);
    recordDismissedSuggestion(suggestion("report-two", { kind: "report", type: "Summative" }), 2000);
    const list = loadDismissedSuggestions(3000);
    expect(list.map((entry) => entry.id)).toEqual(["report-two", "one"]);
    expect(list.map((entry) => entry.kind)).toEqual(["report", "suggestion"]);
    expect(list[1]).toMatchObject({ courseName: "Biology", count: 1, emails: ["a@kis.ac"] });
  });

  it("drops each one once it has been there five days", () => {
    recordDismissedSuggestion(suggestion("old"), 0);
    recordDismissedSuggestion(suggestion("new"), DISMISSED_KEEP_MS - 1000);
    expect(loadDismissedSuggestions(DISMISSED_KEEP_MS - 1).map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(loadDismissedSuggestions(DISMISSED_KEEP_MS).map((entry) => entry.id)).toEqual(["new"]);
  });

  it("replaces one dismissed again, and removes one on request", () => {
    recordDismissedSuggestion(suggestion("same"), 1000);
    recordDismissedSuggestion(suggestion("same"), 2000);
    expect(loadDismissedSuggestions(3000)).toHaveLength(1);
    removeDismissedSuggestion("same", 3000);
    expect(loadDismissedSuggestions(3000)).toEqual([]);
  });

  it("ignores saved data that isn't a list", () => {
    localStorage.setItem("dismissedSuggestions", "{nope");
    expect(loadDismissedSuggestions()).toEqual([]);
  });
});
