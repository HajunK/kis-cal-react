import { describe, expect, it } from "vitest";
import { aliasDivision, matchCourses } from "./courseSearch.js";

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

  it("finds a course by its aliases", () => {
    expect(matchCourses("macro")).toEqual(["AP Economics"]);
    expect(matchCourses("Micro")).toEqual(["AP Economics"]);
    expect(matchCourses("bc")).toEqual(["AP Calculus"]);
    expect(matchCourses("AP Macro")).toEqual(["AP Economics"]);
    expect(matchCourses("apmicro")).toEqual(["AP Economics"]);
    expect(matchCourses("ap bc")).toEqual(["AP Calculus"]);
    expect(matchCourses("ab")).toContain("AP Calculus");
  });

  it("lists at most eight, and nothing for nothing typed", () => {
    expect(matchCourses("a").length).toBe(8);
    expect(matchCourses("   ")).toEqual([]);
  });

  it("names the division an alias stands for, once a course is picked by it", () => {
    expect(aliasDivision("AP Calculus", "BC")).toBe("BC");
    expect(aliasDivision("AP Calculus", "ap ab")).toBe("AB");
    expect(aliasDivision("AP Economics", "Macro")).toBe("Mac");
    expect(aliasDivision("AP Economics", "mic")).toBe("Mic");
    // The name fits too, or the alias isn't clear, or it isn't an alias.
    expect(aliasDivision("AP Calculus", "a")).toBe("");
    expect(aliasDivision("AP Calculus", "ap")).toBe("");
    expect(aliasDivision("AP Calculus", "calc")).toBe("");
    expect(aliasDivision("Algebra II", "alg")).toBe("");
  });
});
