// Grade math: letter tiers, score entry, a Domain card's weighted grade, the
// score a cell needs for a target, and GPA. Nothing here touches the page.

import { findCourseCatalogEntry } from "./catalog.js";

// Lowest score (inclusive) for each tier.
export const GRADE_SCALE = [
  { min: 98, slug: "a-plus", label: "A+" },
  { min: 93, slug: "a", label: "A" },
  { min: 90, slug: "a-minus", label: "A-" },
  { min: 87, slug: "b-plus", label: "B+" },
  { min: 83, slug: "b", label: "B" },
  { min: 80, slug: "b-minus", label: "B-" },
  { min: 77, slug: "c-plus", label: "C+" },
  { min: 73, slug: "c", label: "C" },
  { min: 70, slug: "c-minus", label: "C-" },
  { min: 67, slug: "d-plus", label: "D+" },
  { min: 63, slug: "d", label: "D" },
  { min: 60, slug: "d-minus", label: "D-" },
  { min: 0, slug: "f", label: "F" },
];

// What the target hints aim for. Not A+: an A is the goal.
export const TARGET_TIERS = GRADE_SCALE.slice(GRADE_SCALE.findIndex((tier) => tier.slug === "a"));

export function letterGradeForScore(score) {
  return GRADE_SCALE.find((tier) => score >= tier.min);
}

// The epsilon stops float error from truncating down a step.
export function truncateToDecimals(value, decimals) {
  const factor = 10 ** decimals;
  const truncated = Math.floor(value * factor + 1e-9) / factor;
  return truncated.toFixed(decimals);
}

export function truncateToTwoDecimals(value) {
  return truncateToDecimals(value, 2);
}

export function truncateToFourDecimals(value) {
  return truncateToDecimals(value, 4);
}

export function roundToFourDecimals(value) {
  return value.toFixed(4);
}

export function average(numbers) {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Keeps one decimal place at most, and one dot.
export function sanitizeScoreDigits(value) {
  const firstDot = value.indexOf(".");
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, "");
    value = value.slice(0, firstDot + 2);
  }
  return value;
}

// The 0-100 range is checked separately (and skipped mid-fraction) so an
// over-100 keystroke can be rejected rather than clamped.
export function sanitizeScoreInput(raw) {
  const value = raw.replace(/[^0-9./]/g, "");
  const slashIndex = value.indexOf("/");
  if (slashIndex === -1) return sanitizeScoreDigits(value);

  const numerator = sanitizeScoreDigits(value.slice(0, slashIndex));
  const denominator = sanitizeScoreDigits(value.slice(slashIndex + 1).replace(/\//g, ""));
  return `${numerator}/${denominator}`;
}

// A typed fraction ("17/20") as a whole percent; "" when it's incomplete or
// invalid. Anything without a slash passes through.
export function commitFractionInput(value) {
  const slashIndex = value.indexOf("/");
  if (slashIndex === -1) return value;

  const numerator = parseFloat(value.slice(0, slashIndex));
  const denominator = parseFloat(value.slice(slashIndex + 1));
  if (isNaN(numerator) || !denominator) return "";

  const score = Math.round((numerator / denominator) * 100);
  return String(Math.max(0, Math.min(100, score)));
}

// A Formative a higher Summative in its row replaces, unless the row is
// unlinked. Both as typed (strings, "" when empty).
export function formativeIsReplaced(formative, summative, replaces) {
  if (formative === "" || summative === "") return false;
  const f = parseFloat(formative);
  const s = parseFloat(summative);
  return !isNaN(f) && !isNaN(s) && s > f && replaces;
}

// boxes: [{ weight, scores: [number | null] }]. Each box's average counts at its
// weight; boxes with no scores (or no weight) are left out. null when nothing
// is scored.
export function weightedGrade(boxes) {
  let weightedSum = 0;
  let weightTotal = 0;
  boxes.forEach(({ weight, scores }) => {
    const avg = average(scores.filter((value) => value !== null && !isNaN(value)));
    if (avg === null || isNaN(weight)) return;
    weightedSum += avg * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

// The lowest score (in steps of 1, or 0.1 with decimals) that gets
// gradeWith(score) to the best of tiers it can reach at 100. A tier counts from
// its minimum less 0.5, since the badge shows the rounded grade. The grade only
// rises with the score, so a binary search works. null when no tier is
// reachable.
export function scoreNeeded(gradeWith, tiers = TARGET_TIERS, decimals = false) {
  const best = gradeWith(100);
  const tier = tiers.find((candidate) => best >= candidate.min - 0.5);
  if (!tier) return null;
  const steps = decimals ? 10 : 1;
  let low = 0;
  let high = 100 * steps;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (gradeWith(mid / steps) >= tier.min - 0.5) high = mid;
    else low = mid + 1;
  }
  return { tier, score: low / steps };
}

export const GPA_SCALE = {
  "a-plus": 4.0,
  a: 4.0,
  "a-minus": 3.667,
  "b-plus": 3.333,
  b: 3.0,
  "b-minus": 2.667,
  "c-plus": 2.333,
  c: 2.0,
  "c-minus": 1.667,
  "d-plus": 1.333,
  d: 1.0,
  "d-minus": 0.667,
  f: 0.0,
};

// classes: [{ name, slug }]. Catalog weight can lower a course's credit (half
// for each part of a combo course) or zero it (Lunch); an AP course adds a
// point to the weighted GPA. hasAp is true for any AP course taken, graded or
// not, since it decides how the GPA is shown.
export function computeGpa(classes) {
  let unweightedSum = 0;
  let weightedSum = 0;
  let creditTotal = 0;
  let hasAp = false;

  classes.forEach(({ name, slug }) => {
    const course = findCourseCatalogEntry(name);
    const isAp = course ? course.ap : false;
    if (isAp) hasAp = true;

    const points = GPA_SCALE[slug];
    if (points === undefined) return;

    const credit = course ? course.weight : 1;
    if (credit === 0) return;

    unweightedSum += points * credit;
    weightedSum += (points + (isAp ? 1.0 : 0)) * credit;
    creditTotal += credit;
  });

  return {
    unweighted: creditTotal > 0 ? unweightedSum / creditTotal : null,
    weighted: creditTotal > 0 ? weightedSum / creditTotal : null,
    hasAp,
  };
}
