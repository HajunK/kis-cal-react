import { describe, expect, it } from "vitest";
import { matchCourses } from "./courseSearch.js";

describe("matchCourses", () => {
  it("ignores case and spaces", () => {
    expect(matchCourses("aplit")).toContain("AP Literature");
    expect(matchCourses("algebra  ii")).toEqual(["Algebra II"]);
  });

  it("matches word starts only, punctuation included", () => {
    expect(matchCourses("es")).not.toContain("Chinese");
    expect(matchCourses("dual")).toContain("Individual/Dual Pursuits");
  });

  it("leads with exact short names", () => {
    const pe = matchCourses("PE");
    expect(pe.slice(0, 5).every((name) => ["Health & Fitness", "Individual/Dual Pursuits", "Movement & Expression", "Personal Fitness", "Recreational & Lifetime Sports"].includes(name))).toBe(true);
  });

  it("lists at most eight, and nothing for nothing typed", () => {
    expect(matchCourses("a").length).toBe(8);
    expect(matchCourses("   ")).toEqual([]);
  });
});
