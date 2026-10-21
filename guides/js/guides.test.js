import { describe, expect, it } from "vitest";
import { RESERVED_KEYS, guideMatches, keyProblem, minutesLabel, normalizeKey, updatedLabel, visibleGuides, withRecent } from "./guides.js";

const guides = [
  { id: "a", title: "Cell respiration", course: "AP Biology", test: "Unit 3 test", updatedAt: 300 },
  { id: "b", title: "Triangle congruence", course: "Geometry", test: "Chapter 5 quiz", updatedAt: 500 },
  { id: "c", title: "Reading a poem", course: "English 10", test: "Poetry test", updatedAt: 100 },
  { id: "d", title: "Mitosis and meiosis", course: "AP Biology", test: "Unit 4 test", updatedAt: 400 },
];

describe("keys", () => {
  it("accepts lowercase words, numbers and single hyphens", () => {
    for (const key of ["biology", "ap-bio-unit-3", "b2", "chem101"]) expect(keyProblem(key)).toBe(null);
  });

  it("ignores case and spacing around it", () => {
    expect(normalizeKey("  Biology ")).toBe("biology");
    expect(keyProblem("  Biology ")).toBe(null);
  });

  it("explains what's wrong with a key that won't do", () => {
    expect(keyProblem("")).toMatch(/Enter a key/);
    expect(keyProblem("   ")).toMatch(/Enter a key/);
    expect(keyProblem("a")).toMatch(/2 to 40/);
    expect(keyProblem("x".repeat(41))).toMatch(/2 to 40/);
    for (const key of ["ap bio", "ap_bio", "bio!", "-bio", "bio-", "ap--bio", "bio/unit", "café"]) expect(keyProblem(key)).toMatch(/letters, numbers/);
  });

  it("keeps the names the site itself uses", () => {
    for (const key of RESERVED_KEYS) expect(keyProblem(key)).toMatch(/used by the site/);
    expect(keyProblem("Guide")).toMatch(/used by the site/);
  });
});

describe("searching and filtering", () => {
  it("needs every word typed, anywhere in the title, course, test or key, in any case", () => {
    expect(guideMatches(guides[0], "biology unit")).toBe(true);
    expect(guideMatches(guides[0], "BIO 3")).toBe(true);
    expect(guideMatches({ ...guides[0], id: "photosynthesis" }, "photosyn")).toBe(true);
    expect(guideMatches(guides[0], "geometry")).toBe(false);
    expect(guideMatches(guides[0], "   ")).toBe(true);
  });

  it("filters by what's typed, newest first by default", () => {
    expect(visibleGuides(guides).map((g) => g.id)).toEqual(["b", "d", "a", "c"]);
    expect(visibleGuides(guides, { query: "biology" }).map((g) => g.id)).toEqual(["d", "a"]);
    expect(visibleGuides(guides, { query: "biology unit 3" }).map((g) => g.id)).toEqual(["a"]);
    expect(visibleGuides(guides, { query: "nothing like this" })).toEqual([]);
  });

  it("can sort A to Z, and leaves the original list alone", () => {
    const before = guides.map((g) => g.id);
    expect(visibleGuides(guides, { sort: "az" }).map((g) => g.id)).toEqual(["a", "d", "c", "b"]);
    expect(guides.map((g) => g.id)).toEqual(before);
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
