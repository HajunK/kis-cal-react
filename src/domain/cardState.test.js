import { describe, expect, it } from "vitest";
import {
  EMPTY_SCORE_ROWS,
  cardResults,
  commitScore,
  focusScore,
  newCard,
  restoreCard,
  revertScore,
  serializeCard,
  toggleFormativeLink,
  typeScore,
} from "./cardState.js";

// A stand-in for the page: records what it's asked to do.
function fakeCtx(prefs = { replaceFormativesByDefault: true }) {
  const log = [];
  const ctx = {
    log,
    saves: [],
    prefs: () => prefs,
    focused: () => false,
    swapping: () => false,
    endSwap: () => {},
    after: (run) => run(),
    first: (run) => run(),
    swap: (row, toLinked) => log.push(["swap", row, toLinked]),
    showLinkTip: (row) => log.push(["tip", row]),
    formativeChanged: (row, before, after) => log.push(["rolled", row, before, after]),
    recalculated: (card, results) => ctx.saves.push({ data: serializeCard(card, "Course"), results }),
  };
  return ctx;
}

const type = (card, box, row, text, ctx) => {
  typeScore(card, box, row, text);
  commitScore(card, box, row, ctx);
};
const values = (card, box) => card[box].map((cell) => cell.value);

describe("a new card", () => {
  it("starts with eight empty rows each and a hint in the first", () => {
    const card = newCard(true);
    expect(card.formative).toHaveLength(EMPTY_SCORE_ROWS);
    expect(card.summative).toHaveLength(EMPTY_SCORE_ROWS);
    expect(card.final).toHaveLength(1);
    expect(card.formative[0].typeHint).toBe("Type here");
    expect(card.weights).toEqual({ formative: 20, summative: 60, final: 20 });
    expect(newCard(false).weights.summative).toBe(80);
  });
});

describe("typing", () => {
  it("rejects over 100 and leading zeros, keeping the last good text", () => {
    const card = newCard(false);
    typeScore(card, "formative", 0, "9");
    typeScore(card, "formative", 0, "95");
    typeScore(card, "formative", 0, "950");
    expect(card.formative[0].value).toBe("95");
    typeScore(card, "formative", 1, "05");
    expect(card.formative[1].value).toBe("");
    typeScore(card, "formative", 1, "0.5");
    expect(card.formative[1].value).toBe("0.5");
  });

  it("previews the grade from 50 up, not for a fraction's numerator", () => {
    const card = newCard(false);
    typeScore(card, "formative", 0, "4");
    expect(card.formative[0].icon).toBe(null);
    typeScore(card, "formative", 0, "93");
    expect(card.formative[0].icon).toMatchObject({ slug: "a", preview: true });
    typeScore(card, "formative", 0, "93/");
    expect(card.formative[0].icon).toBe(null);
  });

  it("commits a fraction as a percent and drops a trailing point", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 0, "17/20", ctx);
    expect(card.formative[0]).toMatchObject({ value: "85", rawValue: "85" });
    type(card, "summative", 0, "70.", ctx);
    expect(card.summative[0].value).toBe("70");
  });

  it("puts the committed value back on Escape", () => {
    const card = newCard(false);
    type(card, "formative", 0, "80", fakeCtx());
    typeScore(card, "formative", 0, "8");
    revertScore(card, "formative", 0);
    expect(card.formative[0].value).toBe("80");
  });
});

describe("grades", () => {
  it("averages each box and weights them, leaving empty boxes out", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 0, "80", ctx);
    expect(cardResults(card)).toMatchObject({ faAverage: 80, saAverage: null, domain: 80, onlyAverage: 80 });
    type(card, "summative", 0, "90", ctx);
    // A Summative higher than its Formative replaces it by default.
    expect(cardResults(card)).toMatchObject({ faAverage: 90, saAverage: 90, domain: 90, onlyAverage: null });
  });

  it("saves after each commit, before a new row is added", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 7, "70", ctx);
    expect(ctx.saves.at(-1).data.formative).toHaveLength(8);
    expect(card.formative).toHaveLength(9);
    expect(card.summative).toHaveLength(9);
  });

  it("trims trailing empty rows back to one past the last score", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    for (let row = 0; row < 10; row++) type(card, "formative", row, "70", ctx);
    expect(card.formative).toHaveLength(11);
    type(card, "formative", 9, "", ctx);
    expect(card.formative).toHaveLength(10);
    expect(card.summative).toHaveLength(10);
  });
});

describe("a Summative replacing its Formative", () => {
  it("links, rolls the Formative and starts the tour", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 0, "70", ctx);
    type(card, "summative", 0, "90", ctx);
    expect(card.formative[0]).toMatchObject({ value: "90", rawValue: "70", original: "70", link: { applied: true } });
    expect(ctx.log).toEqual([["tip", 0], ["rolled", 0, "70", "90"]]);
  });

  it("starts unlinked with replacing off, and can be linked by hand", () => {
    const card = newCard(false);
    const ctx = fakeCtx({ replaceFormativesByDefault: false });
    type(card, "formative", 0, "70", ctx);
    type(card, "summative", 0, "90", ctx);
    expect(card.formative[0]).toMatchObject({ value: "70", unlinked: "true", original: "", link: { applied: false } });
    toggleFormativeLink(card, 0, ctx);
    expect(card.formative[0]).toMatchObject({ value: "90", unlinked: "", link: { applied: true } });
    expect(ctx.log.at(-1)).toEqual(["swap", 0, true]);
  });

  it("shows its own score while being edited", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 0, "70", ctx);
    type(card, "summative", 0, "90", ctx);
    expect(focusScore(card, "formative", 0, ctx)).toBe(true);
    expect(card.formative[0].value).toBe("70");
    expect(ctx.log.at(-1)).toEqual(["swap", 0, false]);
  });

  it("forgets the link when either side is cleared", () => {
    const card = newCard(false);
    const ctx = fakeCtx({ replaceFormativesByDefault: false });
    type(card, "formative", 0, "70", ctx);
    type(card, "summative", 0, "90", ctx);
    type(card, "summative", 0, "", ctx);
    expect(card.formative[0]).toMatchObject({ unlinked: undefined, link: null, value: "70" });
  });
});

describe("hints", () => {
  it("says what the next empty cell needs for the next grades up", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    type(card, "formative", 0, "80", ctx);
    expect(card.formative[0].typeHint).toBe("");
    expect(card.formative[1].target).toMatchObject({ decimals: false });
    expect(card.formative[1].target.score).toBeGreaterThan(80);
  });
});

describe("saving and restoring", () => {
  const saved = {
    name: "Course",
    formative: [85, 70, null, 92.5, ...Array(30).fill(null)],
    summative: [90, null, null, 80],
    final: [],
    formativeDates: ["2026-10-01"],
    summativeDates: [],
    unlinkedRows: [],
  };

  it("restores scores, dates and links, trimming an old save's empty tail", () => {
    const card = newCard(false);
    const ctx = fakeCtx();
    restoreCard(card, saved, ctx);
    expect(values(card, "formative")).toEqual(["90", "70", "", "92.5", "", "", "", ""]);
    expect(card.formative[0]).toMatchObject({ rawValue: "85", unlinked: "false", original: "85", date: "2026-10-01" });
    expect(ctx.saves).toHaveLength(1);
    expect(ctx.saves[0].data).toEqual({
      name: "Course",
      formative: [85, 70, null, 92.5, null, null, null, null],
      summative: [90, null, null, 80, null, null, null, null],
      final: [],
      formativeDates: ["2026-10-01", "", "", "", "", "", "", ""],
      summativeDates: ["", "", "", "", "", "", "", ""],
      unlinkedRows: [],
    });
  });

  it("keeps an unlinked row unlinked", () => {
    const card = newCard(false);
    restoreCard(card, { ...saved, unlinkedRows: [0] }, fakeCtx());
    expect(card.formative[0]).toMatchObject({ value: "85", unlinked: "true", original: "" });
  });

  it("does nothing, and saves nothing, without saved scores", () => {
    const card = newCard(true);
    const ctx = fakeCtx();
    restoreCard(card, undefined, ctx);
    expect(ctx.saves).toEqual([]);
    expect(values(card, "final")).toEqual([""]);
  });
});
