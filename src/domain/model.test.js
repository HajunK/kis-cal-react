import { describe, expect, it } from "vitest";
import { formatRelativeAssessmentLabel, pickerMonth, schoolYearBounds, sortPosts, visibleCourseCards } from "./model.js";

describe("visibleCourseCards", () => {
  it("gives a card per course in period order, splitting combos and leaving out hidden ones", () => {
    const cards = visibleCourseCards(["English", "", "Korean", "Geometry"], ["10", "", "9", ""], ["Korean SS"]);
    expect(cards).toEqual([
      { name: "English", hasFinal: false, matchName: "English (10)", periodIndex: 0 },
      { name: "Korean Language", hasFinal: false, matchName: "Korean (9)", periodIndex: 2 },
      { name: "Geometry", hasFinal: false, matchName: "Geometry", periodIndex: 3 },
    ]);
    expect(visibleCourseCards(["", " "], [], [])).toEqual([]);
  });
});

describe("formatRelativeAssessmentLabel", () => {
  const monday = new Date(2026, 9, 12, 15, 0);
  it("names the day up to 5 days out", () => {
    expect(formatRelativeAssessmentLabel(new Date(2026, 9, 12), monday)).toBe("Today");
    expect(formatRelativeAssessmentLabel(new Date(2026, 9, 13), monday)).toBe("Tomorrow");
    expect(formatRelativeAssessmentLabel(new Date(2026, 9, 16), monday)).toBe("Friday");
    expect(formatRelativeAssessmentLabel(new Date(2026, 9, 18), monday)).toBe(null);
    expect(formatRelativeAssessmentLabel(new Date(2026, 9, 11), monday)).toBe(null);
  });
});

describe("the date picker", () => {
  it("runs August to July", () => {
    expect(schoolYearBounds(new Date(2027, 2, 1))).toEqual({ start: new Date(2026, 7, 1), end: new Date(2027, 6, 1) });
  });

  it("fills out a month's weeks with the neighbors' days", () => {
    const bounds = schoolYearBounds(new Date(2026, 9, 1));
    const october = pickerMonth(new Date(2026, 9, 1), bounds, new Date(2026, 9, 19));
    expect(october.label).toBe("October 2026");
    expect(october.days).toHaveLength(35);
    expect(october.days[0]).toMatchObject({ iso: "2026-09-27", outside: true });
    expect(october.days.find((day) => day.today).iso).toBe("2026-10-19");
    expect(pickerMonth(new Date(2026, 7, 1), bounds)).toMatchObject({ atStart: true, atEnd: false });
  });
});

describe("sortPosts", () => {
  it("puts the newest first", () => {
    expect(sortPosts([{ title: "a", createdAt: 1 }, { title: "b", createdAt: 3 }, { title: "c" }]).map((post) => post.title)).toEqual(["b", "a", "c"]);
  });
});
