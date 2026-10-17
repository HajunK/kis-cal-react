import { describe, expect, it } from "vitest";
import {
  TARGET_TIERS,
  average,
  commitFractionInput,
  computeGpa,
  formativeIsReplaced,
  letterGradeForScore,
  roundToFourDecimals,
  sanitizeScoreInput,
  scoreNeeded,
  truncateToTwoDecimals,
  weightedGrade,
} from "./grades.js";

describe("letterGradeForScore", () => {
  it("uses each tier's minimum, inclusive", () => {
    expect(letterGradeForScore(100).label).toBe("A+");
    expect(letterGradeForScore(98).label).toBe("A+");
    expect(letterGradeForScore(97.9).label).toBe("A");
    expect(letterGradeForScore(93).label).toBe("A");
    expect(letterGradeForScore(89.99).label).toBe("B+");
    expect(letterGradeForScore(60).label).toBe("D-");
    expect(letterGradeForScore(59).label).toBe("F");
    expect(letterGradeForScore(0).label).toBe("F");
  });
});

describe("truncating and rounding", () => {
  it("truncates instead of rounding, without float error dropping a step", () => {
    expect(truncateToTwoDecimals(89.999)).toBe("89.99");
    expect(truncateToTwoDecimals(0.29)).toBe("0.29");
    expect(truncateToTwoDecimals(1.005)).toBe("1.00");
    expect(truncateToTwoDecimals(90)).toBe("90.00");
  });

  it("rounds GPAs to four places", () => {
    expect(roundToFourDecimals(3.66666)).toBe("3.6667");
  });
});

describe("average", () => {
  it("is null for no scores", () => {
    expect(average([])).toBe(null);
    expect(average([80, 90])).toBe(85);
  });
});

describe("sanitizeScoreInput", () => {
  it("keeps digits, one dot and one decimal place", () => {
    expect(sanitizeScoreInput("9a5")).toBe("95");
    expect(sanitizeScoreInput("88.75")).toBe("88.7");
    expect(sanitizeScoreInput("8.8.")).toBe("8.8");
  });

  it("keeps one slash, sanitizing each side", () => {
    expect(sanitizeScoreInput("17/20")).toBe("17/20");
    expect(sanitizeScoreInput("17//20")).toBe("17/20");
    expect(sanitizeScoreInput("17/2/0")).toBe("17/20");
  });
});

describe("commitFractionInput", () => {
  it("turns a fraction into a whole percent", () => {
    expect(commitFractionInput("17/20")).toBe("85");
    expect(commitFractionInput("2/3")).toBe("67");
  });

  it("clamps to 0-100", () => {
    expect(commitFractionInput("25/20")).toBe("100");
  });

  it("drops an incomplete or invalid fraction", () => {
    expect(commitFractionInput("17/")).toBe("");
    expect(commitFractionInput("/20")).toBe("");
    expect(commitFractionInput("17/0")).toBe("");
  });

  it("passes plain numbers through", () => {
    expect(commitFractionInput("92.5")).toBe("92.5");
  });
});

describe("formativeIsReplaced", () => {
  it("replaces only with a strictly higher Summative, when linked", () => {
    expect(formativeIsReplaced("70", "90", true)).toBe(true);
    expect(formativeIsReplaced("70", "90", false)).toBe(false);
    expect(formativeIsReplaced("90", "90", true)).toBe(false);
    expect(formativeIsReplaced("90", "70", true)).toBe(false);
    expect(formativeIsReplaced("70", "", true)).toBe(false);
    expect(formativeIsReplaced("", "90", true)).toBe(false);
  });
});

describe("weightedGrade", () => {
  it("weights each box's average", () => {
    // 20% Formatives averaging 80, 80% Summatives averaging 95.
    expect(
      weightedGrade([
        { weight: 20, scores: [70, 90] },
        { weight: 80, scores: [95] },
      ])
    ).toBeCloseTo(92);
  });

  it("leaves out empty boxes, renormalizing the rest", () => {
    expect(
      weightedGrade([
        { weight: 20, scores: [null, null] },
        { weight: 60, scores: [90] },
        { weight: 20, scores: [] },
      ])
    ).toBe(90);
  });

  it("ignores empty and invalid cells", () => {
    expect(weightedGrade([{ weight: 20, scores: [80, null, NaN] }])).toBe(80);
  });

  it("is null when nothing is scored", () => {
    expect(weightedGrade([{ weight: 20, scores: [null] }])).toBe(null);
    expect(weightedGrade([])).toBe(null);
  });

  it("skips a box with no weight", () => {
    expect(weightedGrade([{ weight: NaN, scores: [50] }, { weight: 80, scores: [90] }])).toBe(90);
  });
});

describe("scoreNeeded", () => {
  // A card with a 20% Formative of 80 and an empty 80% Summative cell.
  const gradeWith = (summative) => weightedGrade([
    { weight: 20, scores: [80] },
    { weight: 80, scores: [summative] },
  ]);

  it("finds the lowest whole score that rounds up to the best reachable tier", () => {
    // 0.2 * 80 + 0.8 * s >= 92.5 (an A, less 0.5) -> s >= 95.625.
    expect(scoreNeeded(gradeWith)).toEqual({ tier: TARGET_TIERS[0], score: 96 });
  });

  it("works in tenths once the card uses decimals", () => {
    expect(scoreNeeded(gradeWith, TARGET_TIERS, true).score).toBe(95.7);
  });

  it("drops to a lower tier when an A is out of reach", () => {
    // 0.2 * 20 + 0.8 * 100 = 84 at best: a B, at 82.5 or more.
    const low = (summative) => weightedGrade([
      { weight: 20, scores: [20] },
      { weight: 80, scores: [summative] },
    ]);
    const needed = scoreNeeded(low);
    expect(needed.tier.label).toBe("B");
    expect(needed.score).toBe(99);
  });

  it("falls all the way to F, needing nothing, when nothing better is reachable", () => {
    expect(scoreNeeded(() => 10)).toEqual({ tier: TARGET_TIERS[TARGET_TIERS.length - 1], score: 0 });
  });

  it("is null when none of the given tiers is reachable", () => {
    expect(scoreNeeded(() => 10, TARGET_TIERS.slice(0, 3))).toBe(null);
  });
});

describe("computeGpa", () => {
  it("averages grade points by credit, with a point more for AP in the weighted GPA", () => {
    const { unweighted, weighted, hasAp } = computeGpa([
      { name: "AP Biology", slug: "a" },
      { name: "English", slug: "b" },
    ]);
    expect(unweighted).toBeCloseTo(3.5);
    expect(weighted).toBeCloseTo(4.0);
    expect(hasAp).toBe(true);
  });

  it("gives combo course parts half credit and skips zero-credit courses", () => {
    const { unweighted } = computeGpa([
      { name: "Korean Language", slug: "a" },
      { name: "Korean SS", slug: "c" },
      { name: "Lunch", slug: "f" },
    ]);
    expect(unweighted).toBeCloseTo(3.0);
  });

  it("counts an ungraded AP course toward hasAp only", () => {
    const result = computeGpa([
      { name: "AP Statistics", slug: "" },
      { name: "Geometry", slug: "b-plus" },
    ]);
    expect(result.hasAp).toBe(true);
    expect(result.unweighted).toBeCloseTo(3.333);
    expect(result.weighted).toBeCloseTo(3.333);
  });

  it("is null with nothing graded", () => {
    expect(computeGpa([{ name: "Geometry", slug: null }])).toEqual({ unweighted: null, weighted: null, hasAp: false });
  });

  it("treats a course not in the catalog as one regular credit", () => {
    expect(computeGpa([{ name: "Something Else", slug: "a" }]).unweighted).toBe(4);
  });
});
