import { describe, expect, it } from "vitest";
import { guideMatches, minutesLabel, newGuideId, slugify, subjectsIn, updatedLabel, visibleGuides, withRecent } from "./guides.js";

const guides = [
  { id: "a", title: "Cell respiration", course: "AP Biology", test: "Unit 3 test", subject: "science", updatedAt: 300 },
  { id: "b", title: "Triangle congruence", course: "Geometry", test: "Chapter 5 quiz", subject: "math", updatedAt: 500 },
  { id: "c", title: "Reading a poem", course: "English 10", test: "Poetry test", subject: "english", updatedAt: 100 },
  { id: "d", title: "Mitosis and meiosis", course: "AP Biology", test: "Unit 4 test", subject: "science", updatedAt: 400 },
];

describe("slugify / newGuideId", () => {
  it("makes a plain address out of a title", () => {
    expect(slugify("Cell respiration: the whole process!")).toBe("cell-respiration-the-whole-process");
    expect(slugify("  Café  Écrit ")).toBe("cafe-ecrit");
    expect(slugify("???")).toBe("guide");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(48);
  });

  it("adds a few characters so equal titles get different addresses", () => {
    expect(newGuideId("Mitosis", () => "k3z9")).toBe("mitosis-k3z9");
    expect(newGuideId("Mitosis")).not.toBe(newGuideId("Mitosis"));
  });
});

describe("searching and filtering", () => {
  it("needs every word typed, anywhere in the title, course, test or subject, in any case", () => {
    expect(guideMatches(guides[0], "biology unit")).toBe(true);
    expect(guideMatches(guides[0], "BIO 3")).toBe(true);
    expect(guideMatches(guides[0], "science")).toBe(true);
    expect(guideMatches(guides[0], "geometry")).toBe(false);
    expect(guideMatches(guides[0], "   ")).toBe(true);
  });

  it("filters by subject and search together, newest first by default", () => {
    expect(visibleGuides(guides).map((g) => g.id)).toEqual(["b", "d", "a", "c"]);
    expect(visibleGuides(guides, { subject: "science" }).map((g) => g.id)).toEqual(["d", "a"]);
    expect(visibleGuides(guides, { subject: "science", query: "unit 3" }).map((g) => g.id)).toEqual(["a"]);
    expect(visibleGuides(guides, { query: "nothing like this" })).toEqual([]);
  });

  it("can sort A to Z, and leaves the original list alone", () => {
    const before = guides.map((g) => g.id);
    expect(visibleGuides(guides, { sort: "az" }).map((g) => g.id)).toEqual(["a", "d", "c", "b"]);
    expect(guides.map((g) => g.id)).toEqual(before);
  });

  it("lists only the subjects that have guides, with counts", () => {
    expect(subjectsIn(guides).map((s) => `${s.id}:${s.count}`)).toEqual(["math:1", "science:2", "english:1"]);
  });
});

describe("labels", () => {
  it("shows minutes only when there are some", () => {
    expect(minutesLabel(12)).toBe("12 min");
    expect(minutesLabel("8")).toBe("8 min");
    expect(minutesLabel(0)).toBe("");
    expect(minutesLabel(undefined)).toBe("");
  });

  it("gives the year only when it isn't this one", () => {
    const now = new Date(2026, 9, 21);
    expect(updatedLabel(new Date(2026, 9, 12).getTime(), now)).toBe("Updated Oct 12");
    expect(updatedLabel(new Date(2025, 5, 3).getTime(), now)).toBe("Updated Jun 3, 2025");
    expect(updatedLabel(0, now)).toBe("");
  });

  it("keeps the recently opened guides newest first, once each, up to a limit", () => {
    expect(withRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(withRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });
});
