import { describe, expect, it } from "vitest";
import { ACCEPTED_KEEP_MS, loadAcceptedSuggestions, recordAcceptedSuggestion, removeAcceptedSuggestion } from "./acceptedSuggestions.js";

const suggestion = (id, extra = {}) => ({ id, date: "2026-10-30", courseName: "Biology", type: "Summative", emails: ["a@kis.ac", "b@kis.ac"], lastAddedAt: 5, ...extra });

describe("accepted suggestions", () => {
  it("keeps what was accepted, newest first, as what it was accepted as", () => {
    recordAcceptedSuggestion(suggestion("one"), "In-Class", 1000);
    recordAcceptedSuggestion(suggestion("two", { courseName: "Art" }), "Summative", 2000, "assess2");
    const list = loadAcceptedSuggestions(3000);
    expect(list.map((entry) => entry.id)).toEqual(["two", "one"]);
    expect(list[1]).toMatchObject({ type: "In-Class", suggestedType: "Summative", count: 2, courseName: "Biology", assessmentId: null });
    expect(list[0].assessmentId).toBe("assess2");
  });

  it("drops each one once it has been there five days, and one that is removed", () => {
    recordAcceptedSuggestion(suggestion("old"), "Summative", 0);
    expect(loadAcceptedSuggestions(ACCEPTED_KEEP_MS - 1).map((entry) => entry.id)).toContain("old");
    expect(loadAcceptedSuggestions(ACCEPTED_KEEP_MS).map((entry) => entry.id)).not.toContain("old");
    removeAcceptedSuggestion("one");
    expect(loadAcceptedSuggestions(3000).map((entry) => entry.id)).not.toContain("one");
  });
});
