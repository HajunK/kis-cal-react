import { describe, expect, it } from "vitest";
import { DISMISSED_KEEP_MS, loadDismissedSuggestions, recordDismissedSuggestion, removeDismissedSuggestion } from "./dismissedSuggestions.js";

const suggestion = (id, extra = {}) => ({ id, date: "2026-10-30", courseName: "Biology", type: "Formative", emails: ["a@kis.ac"], lastAddedAt: 5, ...extra });

describe("dismissed suggestions", () => {
  it("keeps what was dismissed, newest first, telling a report from a suggestion", () => {
    recordDismissedSuggestion(suggestion("one"), 1000);
    recordDismissedSuggestion(suggestion("report-two", { kind: "report", type: "Summative" }), 2000);
    const list = loadDismissedSuggestions(3000);
    expect(list.map((entry) => entry.id)).toEqual(["report-two", "one"]);
    expect(list.map((entry) => entry.kind)).toEqual(["report", "suggestion"]);
    expect(list[1]).toMatchObject({ courseName: "Biology", count: 1, emails: ["a@kis.ac"] });
  });

  it("drops each one once it has been there five days, and one that is removed", () => {
    recordDismissedSuggestion(suggestion("old"), 0);
    expect(loadDismissedSuggestions(DISMISSED_KEEP_MS - 1).map((entry) => entry.id)).toContain("old");
    expect(loadDismissedSuggestions(DISMISSED_KEEP_MS).map((entry) => entry.id)).not.toContain("old");
    removeDismissedSuggestion("report-two");
    expect(loadDismissedSuggestions(3000).map((entry) => entry.id)).not.toContain("report-two");
  });
});
