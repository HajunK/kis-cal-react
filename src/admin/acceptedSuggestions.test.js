// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ACCEPTED_KEEP_MS, loadAcceptedSuggestions, recordAcceptedSuggestion, removeAcceptedSuggestion } from "./acceptedSuggestions.js";

const suggestion = (id, extra = {}) => ({ id, date: "2026-10-30", courseName: "Biology", type: "Summative", emails: ["a@kis.ac", "b@kis.ac"], lastAddedAt: 5, ...extra });

beforeEach(() => localStorage.clear());

describe("accepted suggestions", () => {
  it("keeps what was accepted, newest first, as what it was accepted as", () => {
    recordAcceptedSuggestion(suggestion("one"), "In-Class", 1000);
    recordAcceptedSuggestion(suggestion("two", { courseName: "Art" }), "Summative", 2000);
    const list = loadAcceptedSuggestions(3000);
    expect(list.map((entry) => entry.id)).toEqual(["two", "one"]);
    expect(list[1]).toMatchObject({ type: "In-Class", suggestedType: "Summative", count: 2, courseName: "Biology" });
  });

  it("drops each one once it has been there five days", () => {
    recordAcceptedSuggestion(suggestion("old"), "Summative", 0);
    recordAcceptedSuggestion(suggestion("new"), "Summative", ACCEPTED_KEEP_MS - 1000);
    expect(loadAcceptedSuggestions(ACCEPTED_KEEP_MS - 1).map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(loadAcceptedSuggestions(ACCEPTED_KEEP_MS).map((entry) => entry.id)).toEqual(["new"]);
    expect(loadAcceptedSuggestions(2 * ACCEPTED_KEEP_MS)).toEqual([]);
  });

  it("replaces an entry accepted again", () => {
    recordAcceptedSuggestion(suggestion("same"), "Summative", 1000);
    recordAcceptedSuggestion(suggestion("same"), "In-Class", 2000);
    const list = loadAcceptedSuggestions(3000);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("In-Class");
  });

  it("ignores saved data that isn't a list", () => {
    localStorage.setItem("acceptedSuggestions", "{nope");
    expect(loadAcceptedSuggestions()).toEqual([]);
    localStorage.setItem("acceptedSuggestions", JSON.stringify({ a: 1 }));
    expect(loadAcceptedSuggestions()).toEqual([]);
  });
});

describe("taking one out of the list", () => {
  it("keeps the assessment it became, and drops one that is removed", () => {
    recordAcceptedSuggestion(suggestion("one"), "In-Class", 1000, "assess1");
    recordAcceptedSuggestion(suggestion("two"), "Summative", 2000);
    const list = loadAcceptedSuggestions(3000);
    expect(list.find((entry) => entry.id === "one").assessmentId).toBe("assess1");
    expect(list.find((entry) => entry.id === "two").assessmentId).toBe(null);
    removeAcceptedSuggestion("one", 3000);
    expect(loadAcceptedSuggestions(3000).map((entry) => entry.id)).toEqual(["two"]);
  });
});
