// The HS cafeteria menu, as the scheduled scraper stores it (see backend/README.md):
// cafeteriaMenus/hs-YYYY-MM-DD is a week, named for its Monday, with a day for each date,
// and each day has meals (breakfast, lunch, dinner) with a list of options in each
// language: { section: "A" | "B" | "vegan" | "special" | "closure", text, lines, status }.
// The text is OCR of the printed menu, so it carries the allergen numbers and the origins
// that are printed beside the dishes.

import { fromISODate, toISODate } from "../core/dates.js";

// The Monday on or before a date (YYYY-MM-DD): the name of the week's document.
export function mondayOf(iso) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toISODate(date);
}

export function addDays(iso, days) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export const menuDocId = (weekStart) => `hs-${weekStart}`;

// One option's dishes, a line each: the printed allergen numbers "(02,05,06)" and the
// origins "[소:호주 산]" are left out, along with whatever the OCR broke off from them onto
// a line of its own (the origins can run over several, and so can the numbers). The OCR
// also makes noise of the artwork around the dishes ("of 2=", "ALUM oO] Az"), so in Korean a
// line needs Hangul to count, and only its Hangul words stay; a number the OCR left at the
// end of a dish ("쌀밥1/2") goes too.
export function dishesOf(option, language = "ko") {
  const korean = language === "ko";
  return String((option && option.text) || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([\d\s.,]*\)/g, "")
    .split("\n")
    .map((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      const kept = korean ? words.filter((word) => /[\u3131-\u318e\uac00-\ud7a3]/.test(word)) : words;
      return kept.join(" ").replace(/[\d/]+$/, "").trim();
    })
    .filter((line) => /\p{L}/u.test(line));
}

// A day's lunch as { A: [dishes], B: [dishes] }: the two menus the students choose between,
// or null when the day has no printed pair (a closed day, or a blank cell).
export function lunchChoices(day, language) {
  const options = day && day.meals && day.meals.lunch && day.meals.lunch[language];
  if (!Array.isArray(options)) return null;
  const choices = {};
  for (const section of ["A", "B"]) {
    const option = options.find((candidate) => candidate.section === section && candidate.status === "printed");
    const dishes = option ? dishesOf(option, language) : [];
    if (dishes.length === 0) return null;
    choices[section] = dishes;
  }
  return choices;
}

// Every day with a choice to make in the weeks given, earliest first, as
// { date, choices }.
export function choiceDays(weeks, language) {
  return weeks
    .flatMap((week) => (week && Array.isArray(week.days) ? week.days : []))
    .map((day) => ({ date: day.date, choices: lunchChoices(day, language) }))
    .filter((day) => day.choices)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Where to open: today if it has a choice, else the next day that does, else the last
// one before it. -1 with no days. With today's lunch over (lunchOver), today is passed by
// when a later day has a choice, so it opens on the next lunch.
export function openingIndex(days, today, lunchOver = false) {
  if (days.length === 0) return -1;
  const next = days.findIndex((day) => (lunchOver ? day.date > today : day.date >= today));
  if (lunchOver && next === -1) return openingIndex(days, today);
  return next === -1 ? days.length - 1 : next;
}
