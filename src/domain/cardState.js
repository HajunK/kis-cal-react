// A Domain card's scores and what each score cell shows, as plain state, and
// the rules for changing them: domain.js's functions, carried over one for
// one, working on this state rather than on the page. ClassCard.jsx draws it.
//
// Each cell keeps what domain.js kept on its <input> and the elements around
// it: the text in the box (value), the last committed score (rawValue), the
// last accepted keystroke (lastValid), the Formative link state (unlinked),
// the date, the grade icon, the original score shown beside a replaced
// Formative, the link button, and the two hints. Things only the page can do
// (animations, saving) are asked of ctx:
//   ctx.prefs()                      the preferences
//   ctx.focused(box, row)            whether that cell's input has focus
//   ctx.swapping(row)                whether that Formative's swap is playing
//   ctx.endSwap(row)                 drops that swap in place (endFormativeSwap)
//   ctx.after(fn)                    runs fn once the change is on screen
//   ctx.recalculated(card, results)  the grades changed (see recalculateCard)

import {
  TARGET_TIERS,
  average,
  commitFractionInput,
  formativeIsReplaced,
  letterGradeForScore,
  sanitizeScoreInput,
  scoreNeeded,
  weightedGrade,
} from "../core/grades.js";

export const EMPTY_SCORE_ROWS = 8;

export const BOX_LABELS = { formative: "Formatives", summative: "Summatives", final: "Final Exam" };

export function newCell() {
  return {
    value: "",
    rawValue: undefined,
    lastValid: undefined,
    unlinked: undefined,
    date: undefined,
    icon: null, // { slug, label, preview }
    original: "",
    link: null, // { applied }
    typeHint: "",
    target: null, // { score, tier, decimals }
  };
}

const newCells = (count) => Array.from({ length: count }, newCell);

// null excludes the box from the domain calculation.
export function parsePercent(text) {
  const match = /\d+(\.\d+)?/.exec(text);
  return match ? parseFloat(match[0]) : null;
}

export function newCard(hasFinal) {
  const card = {
    formative: newCells(EMPTY_SCORE_ROWS),
    summative: newCells(EMPTY_SCORE_ROWS),
    final: hasFinal ? newCells(1) : [],
    weights: { formative: parsePercent("20%"), summative: parsePercent(hasFinal ? "60%" : "80%"), final: parsePercent("20%") },
  };
  updateEmptyBoxPlaceholder(card, "formative");
  updateEmptyBoxPlaceholder(card, "summative");
  return card;
}

// A copy that can be changed without touching the state React has drawn.
export function cloneCard(card) {
  const cells = (list) => list.map((cell) => ({ ...cell }));
  return { ...card, formative: cells(card.formative), summative: cells(card.summative), final: cells(card.final) };
}

// The boxes a card shows, in page order.
export const cardBoxes = (card) => (card.final.length > 0 ? ["formative", "summative", "final"] : ["formative", "summative"]);

const isLinkedBox = (box) => box === "formative" || box === "summative";

// Only on blur or Enter, so the icon and FA/SA/D don't change mid-typing.
export function updateScoreIcon(cell) {
  if (cell.icon) cell.icon = { ...cell.icon, preview: false };
  if (cell.value === "") {
    cell.icon = null;
    return;
  }
  const score = parseFloat(cell.value);
  if (isNaN(score)) return;
  const tier = letterGradeForScore(score);
  cell.icon = { slug: tier.slug, label: tier.label, preview: false };
}

// Below 50 the leading digits say little about the final score.
export function updateScorePreview(cell) {
  // A numerator alone says nothing about the final score.
  const isFraction = cell.value.includes("/");
  const typed = isFraction ? NaN : parseFloat(cell.value);
  if (!isNaN(typed) && typed >= 50) {
    const tier = letterGradeForScore(Math.min(typed, 100));
    cell.icon = { slug: tier.slug, label: tier.label, preview: true };
    return;
  }

  if (cell.icon) cell.icon = { ...cell.icon, preview: false };
  const committed = cell.rawValue;
  if (!committed) {
    cell.icon = null;
    return;
  }
  const score = parseFloat(committed);
  if (isNaN(score)) return;
  const tier = letterGradeForScore(score);
  cell.icon = { slug: tier.slug, label: tier.label, preview: false };
}

function boxScores(cells) {
  const scores = [];
  cells.forEach((cell) => {
    if (cell.value === "") return;
    const value = parseFloat(cell.value);
    if (!isNaN(value)) scores.push(value);
  });
  return scores;
}

// Both lists grow together because they scroll together and must stay the
// same length.
function growScoreListsIfLastRowFilled(card, box, row) {
  const cells = card[box];
  if (cells[row].value === "") return;
  if (!isLinkedBox(box)) return;
  if (row !== cells.length - 1) return;
  card.formative.push(newCell());
  card.summative.push(newCell());
}

// Both trim to whichever needs to stay longer, so they stay the same length.
function shrinkScoreListsIfTrailingRowsEmpty(card, box, row) {
  if (card[box][row].value !== "") return;
  if (!isLinkedBox(box)) return;
  const desiredLength = (cells) => {
    let lastFilledIndex = -1;
    cells.forEach((cell, index) => {
      if (cell.value !== "") lastFilledIndex = index;
    });
    return Math.max(EMPTY_SCORE_ROWS, lastFilledIndex + 2);
  };
  const target = Math.max(desiredLength(card.formative), desiredLength(card.summative));
  card.formative.length = Math.min(card.formative.length, target);
  card.summative.length = Math.min(card.summative.length, target);
}

// Only on the first row, and only while the box is empty; Final Exam's single
// row needs no hint.
export function updateEmptyBoxPlaceholder(card, box) {
  if (!isLinkedBox(box)) return;
  const cells = card[box];
  if (!cells[0]) return;
  cells[0].typeHint = cells.every((cell) => cell.value === "") ? "Type score" : "";
}

const rawOf = (cell) => (cell ? cell.rawValue ?? cell.value : "");

// Mirrors recalculate, including a higher Summative replacing its Formative,
// so the hint matches what typing that score would really do.
function cardGradeWith(card, targetBox, targetRow, score, prefs) {
  const replaces = (cell) =>
    cell.unlinked === undefined ? Boolean(prefs.replaceFormativesByDefault) : cell.unlinked !== "true";
  const isTarget = (box, row) => box === targetBox && row === targetRow;
  const boxes = cardBoxes(card).map((box) => ({
    weight: card.weights[box],
    scores: card[box].map((cell, row) => {
      if (box === "formative") {
        const formative = isTarget("formative", row) ? String(score) : rawOf(cell);
        const summative = isTarget("summative", row) ? String(score) : rawOf(card.summative[row]);
        if (formative === "") return null;
        return parseFloat(formativeIsReplaced(formative, summative, replaces(cell)) ? summative : formative);
      }
      const value = isTarget(box, row) ? String(score) : cell.value;
      return value === "" ? null : parseFloat(value);
    }),
  }));
  return weightedGrade(boxes);
}

function cardUsesDecimals(card) {
  return cardBoxes(card).some((box) => card[box].some((cell) => rawOf(cell).includes(".")));
}

// Always rounded up (see scoreNeeded), so the number shown is enough.
function scoreNeededForTarget(card, box, row, prefs) {
  return scoreNeeded((score) => cardGradeWith(card, box, row, score, prefs), TARGET_TIERS, cardUsesDecimals(card));
}

// Each empty cell's number is for that cell alone. Because a Summative can
// replace its row's Formative, what it needs depends on its row, so
// Summatives may show two: the last Formative's row and the one below.
export function updateTargetHints(card, prefs) {
  const boxes = ["formative", "summative"];
  // Once decimals are in use, every number shows one place for consistency.
  const decimals = cardUsesDecimals(card);
  const show = (cell, needed) => {
    cell.target = needed === null ? null : { score: needed.score, tier: needed.tier, decimals };
    // It takes the "Type score" hint's spot, which gives way to it.
    if (needed !== null) cell.typeHint = "";
  };
  boxes.forEach((box) => {
    card[box].forEach((cell) => show(cell, null));
    updateEmptyBoxPlaceholder(card, box);
  });
  const anyScore = cardBoxes(card).some((box) => card[box].some((cell) => cell.value !== ""));
  if (!anyScore) return;

  const lastFilledRow = (cells) => cells.reduce((last, cell, row) => (cell.value !== "" ? row : last), -1);
  const lastFormativeRow = lastFilledRow(card.formative);

  boxes.forEach((box) => {
    const cells = card[box];
    const lastFilled = lastFilledRow(cells);
    let rows = [lastFilled + 1];
    if (box === "formative") {
      // A row that already has a Summative may replace whatever goes in beside
      // it, so it's no place to aim.
      let row = lastFilled + 1;
      while (card.summative[row] && card.summative[row].value !== "") row++;
      rows = [row];
    } else {
      const tied = [lastFormativeRow, lastFormativeRow + 1].filter((row) => row > lastFilled && row >= 0);
      if (tied.length > 0) rows = tied;
    }
    let shown = null;
    rows.forEach((row) => {
      const cell = cells[row];
      if (!cell) return;
      const needed = scoreNeededForTarget(card, box, row, prefs);
      // A second identical number would only repeat it.
      const same = (a, b) => (a === null) === (b === null) && (a === null || (a.score === b.score && a.tier === b.tier));
      if (shown !== null && same(needed, shown)) return;
      show(cell, needed);
      shown = needed;
    });
    if (shown !== null) cells.forEach((cell) => (cell.typeHint = ""));
  });
}

// Boxes with no scores are left out of the weighted average. What the card's
// grade, its badge and breakdown show; recalculate hands it to ctx to draw and
// save.
export function cardResults(card) {
  let faAverage = null;
  let saAverage = null;
  let scoredBoxes = 0;
  const boxes = cardBoxes(card).map((box) => {
    const scores = boxScores(card[box]);
    const avg = average(scores);
    if (box === "formative") faAverage = avg;
    if (box === "summative") saAverage = avg;
    if (avg !== null) scoredBoxes++;
    return { weight: card.weights[box], scores };
  });
  const domain = weightedGrade(boxes);
  // With one box scored, D would just repeat its average, so only that is
  // shown.
  const onlyAverage = scoredBoxes === 1 ? (faAverage ?? saAverage) : null;
  return { faAverage, saAverage, domain, onlyAverage };
}

export function recalculate(card, ctx) {
  const results = cardResults(card);
  updateTargetHints(card, ctx.prefs());
  ctx.recalculated(card, results);
}

// The typed Formative stays in rawValue, so editing restores it and the
// replacement undoes itself if the Summative drops. recalc=false lets restore
// recalculate once at the end; per-row recalculations would roll the
// breakdown through intermediate values on every load.
export function applyFormativeReplacement(card, row, ctx, animate = false, recalc = true) {
  if (ctx.focused("formative", row)) return;
  const formative = card.formative[row];
  const summative = card.summative[row];

  const rawFormative = rawOf(formative);
  const rawSummative = rawOf(summative);
  const fNum = parseFloat(rawFormative);
  const sNum = parseFloat(rawSummative);

  // Qualifies decides whether the link icon shows; applied also needs the row
  // not to be manually unlinked.
  const qualifies = rawFormative !== "" && rawSummative !== "" && !isNaN(fNum) && !isNaN(sNum) && sNum > fNum;

  // A row's first qualification follows the Replace formatives by default
  // setting.
  if (qualifies && formative.unlinked === undefined && !ctx.prefs().replaceFormativesByDefault) {
    formative.unlinked = "true";
  }

  const applied = qualifies && formative.unlinked !== "true";
  const effective = applied ? rawSummative : rawFormative;
  const needsChange = formative.value !== effective;

  // A swap still playing turns around rather than restarting, even when the
  // value already matches (it was set when that swap began).
  const swapping = ctx.swapping(row);
  if (animate && (needsChange || swapping)) {
    // The value changes at once, so averages and saves never see a value that
    // is only there for the animation.
    if (needsChange) {
      formative.value = effective;
      if (!applied) formative.lastValid = effective;
      updateScoreIcon(formative);
      if (recalc) recalculate(card, ctx);
    }
    startFormativeSwap(card, row, ctx, applied, rawSummative, rawFormative);
  } else {
    ctx.endSwap(row);
    if (needsChange) {
      formative.value = effective;
      updateScoreIcon(formative);
      if (recalc) recalculate(card, ctx);
    }
    formative.original = applied ? rawFormative : "";
  }

  formative.link = qualifies ? { applied } : null;
}

// A new swap shows the original score for its whole run (see
// animateFormativeSwap in motion.js); one already playing only turns around.
function startFormativeSwap(card, row, ctx, toLinked, linkedText, rawText) {
  if (!ctx.swapping(row)) card.formative[row].original = rawText;
  ctx.after(() => ctx.swap(row, toLinked, linkedText, rawText));
}

// Only animated when the Formative itself was deselected.
function syncFormativeReplacementForRow(card, box, row, ctx) {
  if (!isLinkedBox(box)) return;
  const formative = card.formative[row];
  const summative = card.summative[row];
  if (!formative || !summative) return;

  // Clearing either side resets the link state, so the row is re-seeded from
  // preferences next time.
  if (card[box][row].value === "") formative.unlinked = undefined;

  const formativeBefore = formative.value;
  const iconBefore = formative.icon;
  const isLinked = () => Boolean(formative.original);
  const wasLinked = isLinked();
  applyFormativeReplacement(card, row, ctx, box === "formative");
  if (box === "summative" && !wasLinked && isLinked()) ctx.after(() => ctx.showLinkTip(row));
  // Under Privacy Blur the changed Formative is briefly revealed; otherwise
  // its number rolls.
  if (box === "summative" && formative.value !== formativeBefore) {
    const formativeAfter = formative.value;
    ctx.after(() => ctx.formativeChanged(row, formativeBefore, formativeAfter, iconBefore));
  }
}

// Grades and the committed icon wait until the field is left; only the
// preview updates while typing.
export function typeScore(card, box, row, typed) {
  const cell = card[box][row];
  const sanitized = sanitizeScoreInput(typed);
  // A fraction's range can't be judged until it's complete, so it's checked
  // on commit.
  const isFraction = sanitized.includes("/");
  const numeric = parseFloat(sanitized);
  const isOverMax = !isFraction && sanitized !== "" && sanitized !== "." && !isNaN(numeric) && numeric > 100;
  // "0", "0.5" and "0/..." are fine; only "05"-style input isn't.
  const hasInvalidLeadingZero = !isFraction && sanitized.length > 1 && sanitized[0] === "0" && sanitized[1] !== ".";

  if (isOverMax || hasInvalidLeadingZero) {
    // Rejected outright rather than corrected after the fact.
    cell.value = cell.lastValid !== undefined ? cell.lastValid : "";
  } else {
    cell.value = sanitized;
    cell.lastValid = sanitized;
  }
  updateScorePreview(cell);
}

// Leaving the field (or Enter) is the only thing that commits a score.
export function commitScore(card, box, row, ctx) {
  const cell = card[box][row];
  cell.value = commitFractionInput(cell.value);
  if (cell.value.endsWith(".")) cell.value = cell.value.slice(0, -1);
  cell.rawValue = cell.value;
  if (cell.value === "") cell.date = undefined;

  syncFormativeReplacementForRow(card, box, row, ctx);
  updateScoreIcon(cell);
  // Before recalculating, which saves the card: shrinking after would save
  // the old row count.
  shrinkScoreListsIfTrailingRowsEmpty(card, box, row);
  recalculate(card, ctx);
  if (card[box][row]) growScoreListsIfLastRowFilled(card, box, row);
  updateEmptyBoxPlaceholder(card, box);
  // Again once the new empty row exists, since that's where the next hint
  // goes.
  updateTargetHints(card, ctx.prefs());
}

// Escape puts back the last committed value before the field is left, so
// nothing changes.
export function revertScore(card, box, row) {
  const cell = card[box][row];
  cell.value = cell.rawValue || "";
  cell.lastValid = cell.value;
  updateScorePreview(cell);
}

// Editing starts from what was typed, not the replaced display value.
// Returns whether the text changed (the caret then needs placing).
export function focusScore(card, box, row, ctx) {
  const cell = card[box][row];
  const raw = cell.rawValue;
  if (raw === undefined || cell.value === raw) return false;
  const shownText = cell.value;
  cell.value = raw;
  cell.lastValid = raw;
  startFormativeSwap(card, row, ctx, false, shownText, raw);
  return true;
}

export function toggleFormativeLink(card, row, ctx) {
  const formative = card.formative[row];
  formative.unlinked = formative.unlinked === "true" ? "" : "true";
  applyFormativeReplacement(card, row, ctx, true);
}

// Numbers, not the strings the inputs hand back: the shape saved in
// appData.domainScores.
export function serializeCard(card, name) {
  const values = (cells) =>
    cells.map((cell) => {
      const raw = rawOf(cell);
      return raw === "" ? null : Number(raw);
    });
  const dates = (cells) => cells.map((cell) => cell.date || "");
  const unlinkedRows = [];
  card.formative.forEach((cell, index) => {
    if (cell.unlinked === "true") unlinkedRows.push(index);
  });
  return {
    name,
    formative: values(card.formative),
    summative: values(card.summative),
    final: values(card.final),
    formativeDates: dates(card.formative),
    summativeDates: dates(card.summative),
    unlinkedRows,
  };
}

export function restoreCard(card, saved, ctx) {
  if (!saved) return;
  // Rebuilt from the last filled score rather than the saved length: old
  // saves can end in long runs of empty entries (from when the blurred copy's
  // rows were counted), which would come back as rows every load.
  const lastFilled = (values) => {
    let last = -1;
    (values || []).forEach((value, index) => {
      if (value !== null && value !== undefined && value !== "") last = index;
    });
    return last;
  };
  const needed = Math.max(EMPTY_SCORE_ROWS, Math.max(lastFilled(saved.formative), lastFilled(saved.summative)) + 2);
  while (card.formative.length < needed) card.formative.push(newCell());
  while (card.summative.length < needed) card.summative.push(newCell());

  const restoreBoxRows = (cells, savedValues) => {
    if (!savedValues) return;
    savedValues.forEach((value, index) => {
      const cell = cells[index];
      // Not a falsy check: a real score of 0 is falsy.
      if (!cell || value === null || value === undefined) return;
      const text = String(value);
      cell.value = text;
      cell.rawValue = text;
      cell.lastValid = text;
      updateScoreIcon(cell);
    });
  };
  restoreBoxRows(card.formative, saved.formative);
  restoreBoxRows(card.summative, saved.summative);
  restoreBoxRows(card.final, saved.final);

  const restoreDates = (cells, savedDates) => {
    (savedDates || []).forEach((isoDate, index) => {
      if (cells[index] && isoDate) cells[index].date = isoDate;
    });
  };
  restoreDates(card.formative, saved.formativeDates);
  restoreDates(card.summative, saved.summativeDates);

  // Only rows where a Summative already beats its Formative have a decided
  // link. Others stay undefined so the Replace formatives by default setting
  // still applies when they first qualify.
  const unlinkedSet = new Set(saved.unlinkedRows || []);
  card.formative.forEach((cell, index) => {
    const formative = parseFloat(rawOf(cell));
    const summative = card.summative[index] ? parseFloat(card.summative[index].value) : NaN;
    cell.unlinked = !isNaN(formative) && !isNaN(summative) && summative > formative ? (unlinkedSet.has(index) ? "true" : "false") : undefined;
  });
  card.formative.forEach((cell, index) => {
    if (card.summative[index]) applyFormativeReplacement(card, index, ctx, false, false);
  });

  updateEmptyBoxPlaceholder(card, "formative");
  updateEmptyBoxPlaceholder(card, "summative");
  recalculate(card, ctx);
}

// Just a date picked or removed: saved, nothing to recalculate.
export function setScoreDate(card, box, row, iso) {
  card[box][row].date = iso || undefined;
}
