import { describe, expect, it } from "vitest";
import { COURSE_CATALOG, effectiveCourseName, expandCourseNames, findCourseCatalogEntry, shortCourseName } from "./catalog.js";

describe("course catalog", () => {
  it("has unique names, combo parts included", () => {
    const names = COURSE_CATALOG.flatMap((course) => [course.name, ...(course.combo || []).map((sub) => sub.name)]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("finds courses and combo parts", () => {
    expect(findCourseCatalogEntry("AP Biology")).toMatchObject({ ap: true });
    expect(findCourseCatalogEntry("Korean SS")).toMatchObject({ weight: 0.5 });
    expect(findCourseCatalogEntry("Nope")).toBe(null);
  });

  it("shortens names that have a short form, keeping the division", () => {
    expect(shortCourseName("AP Literature")).toBe("AP Lit");
    expect(shortCourseName("AP Statistics (AB)")).toBe("AP Stats (AB)");
    expect(shortCourseName("English (10)")).toBe(null);
  });

  it("splits combo courses into their parts", () => {
    expect(expandCourseNames(["Korean", "English"])).toEqual(["Korean Language", "Korean SS", "English"]);
  });

  it("names a division the way assessments are scheduled", () => {
    expect(effectiveCourseName("English", "10")).toBe("English (10)");
    expect(effectiveCourseName("Biology", "")).toBe("Biology");
  });
});
