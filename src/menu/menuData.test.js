import { describe, expect, it } from "vitest";
import { addDays, choiceDays, dishesOf, lunchChoices, mondayOf, openingIndex } from "./menuData.js";

const option = (section, text, status = "printed") => ({ section, text, lines: text.split("\n"), status });
const day = (date, options) => ({ date, meals: { lunch: { ko: options } } });

describe("dishesOf", () => {
  it("drops allergen numbers and origins, even broken over lines", () => {
    const text =
      "미나리곰탕*당면사리 [소:호주\n산]\n(02.05.06,12,15,16,18)\n쌀밥\n푸질리샐러드 (05,06,12,13,15)\n고추잎무침 (09,13)\n\n배주김치\n(02.05,.06,09,12,15,16,18)";
    expect(dishesOf({ text })).toEqual(["미나리곰탕*당면사리", "쌀밥", "푸질리샐러드", "고추잎무침", "배주김치"]);
    expect(dishesOf({ text: "함박오므라이스 [함박-돼지:국\n산]\n(01,02,05,06,10,12,13,15,16,1\n8)\n\n유부우동국물 (05,06)" })).toEqual([
      "함박오므라이스",
      "유부우동국물",
    ]);
  });

  it("leaves out the OCR's noise from the artwork and numbers stuck to a dish", () => {
    const text = "텍사스부대찌개\nof 2=\nALUM oO] Az\n쌀밥1/2\n마쉬멜로초코파이 ges!\n#4| ZEAE\n\"at,";
    expect(dishesOf({ text }, "ko")).toEqual(["텍사스부대찌개", "쌀밥", "마쉬멜로초코파이"]);
    expect(dishesOf({ text: "Rice\nBulgogi (05,06)" }, "en")).toEqual(["Rice", "Bulgogi"]);
  });

  it("copes with no text", () => {
    expect(dishesOf(null)).toEqual([]);
    expect(dishesOf({ text: "" })).toEqual([]);
  });
});

describe("lunchChoices", () => {
  it("is the A and B menus", () => {
    const choices = lunchChoices(day("2026-10-26", [option("vegan", "비건"), option("A", "쌀밥\n국"), option("B", "면"), option("special", "음료")]), "ko");
    expect(choices).toEqual({ A: ["쌀밥", "국"], B: ["면"] });
  });

  it("is null for a closed day, a blank cell, or a missing language", () => {
    expect(lunchChoices(day("2026-10-31", [option("closure", "", "closed")]), "ko")).toBe(null);
    expect(lunchChoices(day("2026-10-27", [option("A", "쌀밥"), option("B", "", "blank")]), "ko")).toBe(null);
    expect(lunchChoices(day("2026-10-27", [option("A", "rice"), option("B", "noodles")]), "en")).toBe(null);
  });
});

describe("choiceDays and openingIndex", () => {
  const weeks = [
    { days: [day("2026-11-10", [option("A", "가"), option("B", "나")]), day("2026-11-08", [option("closure", "", "closed")])] },
    null,
    { days: [day("2026-10-26", [option("A", "가"), option("B", "나")]), day("2026-10-27", [option("A", "가"), option("B", "나")])] },
  ];

  it("lists the days with a choice, earliest first", () => {
    expect(choiceDays(weeks, "ko").map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27", "2026-11-10"]);
  });

  it("opens on today, else the next day, else the last", () => {
    const days = choiceDays(weeks, "ko");
    expect(openingIndex(days, "2026-10-27")).toBe(1);
    expect(openingIndex(days, "2026-10-28")).toBe(2);
    expect(openingIndex(days, "2026-12-01")).toBe(2);
    expect(openingIndex([], "2026-10-27")).toBe(-1);
  });

  it("skips today once its lunch is over, unless no later day has a choice", () => {
    const days = choiceDays(weeks, "ko");
    expect(openingIndex(days, "2026-10-26", true)).toBe(1);
    expect(openingIndex(days, "2026-10-27", true)).toBe(2);
    expect(openingIndex(days, "2026-11-10", true)).toBe(2);
    expect(openingIndex(days, "2026-10-27", false)).toBe(1);
  });
});

describe("weeks", () => {
  it("are named for their Monday", () => {
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2026-11-05")).toBe("2026-11-02");
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
  });
});
