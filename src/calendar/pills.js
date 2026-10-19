// The Calendar's pills and their motion: building a pill, the fade and
// collapse as pills come and go, course names scrolling when cut off, and a
// month-grid day. Carried over from my-courses.js unchanged (only its helpers
// now come from model.js and data.js), so they move exactly as before.

import { shortCourseName } from "../core/catalog.js";
import { toISODate } from "../core/dates.js";
import { completedTaskRecords } from "./data.js";
import { assessmentCategory, stripDivisionSuffix } from "./model.js";
import { allDayTypes } from "../shell/school.js";
import { attachHoverTooltip } from "../shell/ui.js";

// Rechecked whenever the window resizes, since a hidden grid can't be measured
// and day widths follow the page.
const nameFitObserver = new ResizeObserver((records) =>
  records.forEach(({ target }) => {
    if (!target.isConnected) nameFitObserver.unobserve(target);
    else target._fitName();
  })
);

// held(), while true, keeps the name as it is.
export function fitName(windowEl, textEl, full, short, held = () => false) {
  textEl.textContent = full;
  if (!short || short === full) return;
  windowEl._fitName = () => {
    if (held()) return;
    textEl.textContent = full;
    if (textEl.scrollWidth > windowEl.clientWidth) textEl.textContent = short;
  };
  nameFitObserver.observe(windowEl);
}

export function buildAssessmentPill(entry, resolvedNames, onContextMenu, courseColors) {
  const pill = document.createElement("span");
  const category = assessmentCategory(entry);
  // Reassessments share the summative look.
  const kind = category === "assignment" ? "assignment" : category === "formative" ? "formative" : "summative";
  // Assigned outright, so it must come before any classList.add.
  pill.className = `assessment-chip assessment-chip--${kind}`;
  // A reassessment's name already says so.
  if (category !== "reassessment") {
    // A Testing Block counts as a summative. _noTooltip skips it where the
    // pill's text already says the same.
    attachHoverTooltip(pill, { summative: "Summative", formative: "Formative", assignment: "Assignment" }[category], {
      when: () => !pill._noTooltip,
    });
  }
  // Lets animatePillChanges match this pill across rebuilds.
  pill.dataset.entryId = entry.id;

  const dot = document.createElement("span");
  dot.className = "assessment-chip-dot";
  pill.appendChild(dot);

  const strippedName = stripDivisionSuffix(entry.courseName);
  const label = resolvedNames.has(strippedName) ? strippedName : entry.courseName;
  const color = courseColors.get(entry.courseName) || courseColors.get(strippedName);
  if (color) pill.style.setProperty("--chip-color", color);
  // The outer span is the clipping window; the inner one is what the marquee
  // scrolls.
  const nameEl = document.createElement("span");
  nameEl.className = "assessment-pill-name";
  const nameText = document.createElement("span");
  nameText.className = "assessment-pill-text";
  // Custom types ("Reassessment") look like a standard style, so the type stays
  // in the name.
  const isCustomType = !["In-Class", "Testing Block", "Summative", "Formative", "Assignment"].includes(entry.type);
  const shortLabel = shortCourseName(label);
  const withType = (name) => (isCustomType ? `${name} ${entry.type}` : name);
  nameEl.appendChild(nameText);
  fitName(nameEl, nameText, withType(label), shortLabel && withType(shortLabel));
  if (kind === "assignment") {
    // Like a to-do item: the course, then what's due.
    const lines = document.createElement("span");
    lines.className = "assessment-chip-lines";
    const subtitle = document.createElement("span");
    subtitle.className = "assessment-chip-subtitle";
    // Its own span so the subtitle can fold to nothing when done.
    const subtitleText = document.createElement("span");
    subtitleText.textContent = entry.title || "";
    subtitle.appendChild(subtitleText);
    lines.append(nameEl, subtitle);
    pill.appendChild(lines);
    if (completedTaskRecords().some((record) => record.id === entry.id)) {
      pill.classList.add("assessment-chip--done");
    }
  } else if (entry.type === "Testing Block") {
    // Otherwise it looks like any summative.
    pill.classList.add("assessment-chip--stacked");
    const lines = document.createElement("span");
    lines.className = "assessment-chip-lines";
    const subtitle = document.createElement("span");
    subtitle.className = "assessment-pill-testing-label";
    subtitle.textContent = "Testing block";
    lines.append(nameEl, subtitle);
    pill.appendChild(lines);
  } else {
    pill.appendChild(nameEl);
  }
  pill.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    onContextMenu(entry, pill);
  });
  return pill;
}

export const PILL_FADE_MS = 200;
export const PILL_MOVE_MS = 200;

export const MONTH_PILL_CELLS = {
  selector: ".assessment-week-day",
  key: (cell) => cell.dataset.iso,
  list: (cell) => cell.querySelector(".assessment-week-day-pills"),
};
export const CLASS_GRID_PILL_CELLS = {
  selector: ".class-grid-cell",
  key: (cell) => `${cell.dataset.course}|${cell.dataset.iso}`,
  list: (cell) => cell.querySelector(".class-grid-cell-pills"),
};

// Pills still leaving from an earlier change count as already gone.
export function renderedPillsByDate(container, cells = MONTH_PILL_CELLS) {
  const byDate = new Map();
  container.querySelectorAll(cells.selector).forEach((cell) => {
    const pills = [...cell.querySelectorAll(".assessment-chip")].filter(
      (pill) => !pill.closest(".assessment-pill-slot--leaving")
    );
    byDate.set(
      cells.key(cell),
      pills.map((pill) => ({ id: pill.dataset.entryId, el: pill }))
    );
  });
  return byDate;
}

// A pill can't shrink below its padding and border, but a slot with hidden
// overflow can squeeze it to nothing. The negative margin cancels the list's
// gap so a closed slot takes no room.
export function pillListGap(list) {
  return parseFloat(getComputedStyle(list).rowGap) || 0;
}

// Space opens first, then the pill fades in.
export function enterPill(pill) {
  const list = pill.parentElement;
  const slot = document.createElement("div");
  slot.className = "assessment-pill-slot";
  pill.replaceWith(slot);
  slot.appendChild(pill);
  const height = slot.offsetHeight;
  const gap = pillListGap(list);
  slot.animate(
    [
      { height: "0px", marginBottom: `${-gap}px` },
      { height: `${height}px`, marginBottom: "0px" },
    ],
    { duration: PILL_MOVE_MS, easing: "ease" }
  );
  // Hidden by the animation's fill rather than inline opacity: pills have an
  // opacity transition, which would fade an inline 0 in and show the pill cut
  // off while its space opens.
  pill
    .animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: PILL_FADE_MS,
      delay: PILL_MOVE_MS,
      easing: "ease",
      fill: "backwards",
    })
    .finished.catch(() => {})
    .finally(() => {
      if (slot.isConnected && pill.parentElement === slot) slot.replaceWith(pill);
    });
}

// before is the pill it goes back in front of (null: the end).
export function leavePill(pill, list, before) {
  pill.getAnimations().forEach((animation) => animation.cancel());
  pill.style.opacity = "";
  pill.querySelectorAll(".assessment-pill-text").forEach((textEl) => {
    cancelMarqueeReturn(textEl);
    stopMarqueeText(textEl);
  });
  const slot = document.createElement("div");
  slot.className = "assessment-pill-slot assessment-pill-slot--leaving";
  list.insertBefore(slot, before);
  slot.appendChild(pill);
  const height = slot.offsetHeight;
  const gap = pillListGap(list);
  pill
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: PILL_FADE_MS, easing: "ease", fill: "forwards" })
    .finished.then(
      () =>
        slot.animate(
          [
            { height: `${height}px`, marginBottom: "0px" },
            { height: "0px", marginBottom: `${-gap}px` },
          ],
          { duration: PILL_MOVE_MS, easing: "ease", fill: "forwards" }
        ).finished
    )
    .catch(() => {})
    .finally(() => slot.remove());
}

// Departed pills are put back where they were so they can animate out.
export function animatePillChanges(container, pillsBefore, cells = MONTH_PILL_CELLS) {
  container.querySelectorAll(cells.selector).forEach((cell) => {
    const before = pillsBefore.get(cells.key(cell));
    if (!before) return;
    const list = cells.list(cell);
    const pillsNow = [...list.querySelectorAll(".assessment-chip")];
    const idsNow = new Set(pillsNow.map((pill) => pill.dataset.entryId));
    const idsBefore = new Set(before.map(({ id }) => id));

    pillsNow.forEach((pill) => {
      if (!idsBefore.has(pill.dataset.entryId)) enterPill(pill);
    });
    // So it leaves from the spot it was actually in.
    before.forEach(({ id, el }, index) => {
      if (idsNow.has(id)) return;
      const nextStaying = before.slice(index + 1).find((later) => idsNow.has(later.id));
      const anchor = nextStaying ? pillsNow.find((pill) => pill.dataset.entryId === nextStaying.id) : null;
      leavePill(el, list, anchor);
    });
  });
}

export const CAL_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MARQUEE_RETURN_FADE_MS = 250;
// So sweeping across the calendar doesn't set every name scrolling.
export const MARQUEE_REST_MS = 50;

// A fixed speed, whatever the name's length.
const MARQUEE_SPEED_PX_PER_S = 100;
const MARQUEE_ACCEL_MS = 400;

// Worked out from time rather than added up per frame, so it's the same at any
// frame rate.
export function marqueeDistance(elapsed) {
  const rampSeconds = MARQUEE_ACCEL_MS / 1000;
  const seconds = elapsed / 1000;
  if (seconds < rampSeconds) {
    return (MARQUEE_SPEED_PX_PER_S * seconds ** 2) / (2 * rampSeconds);
  }
  return MARQUEE_SPEED_PX_PER_S * (rampSeconds / 2 + (seconds - rampSeconds));
}

// Driven per frame from marqueeDistance rather than a timed CSS animation, so
// speed doesn't depend on how far a pass goes.
export function startMarqueeText(textEl) {
  stopMarqueeText(textEl);
  const textWidth = textEl.offsetWidth;
  const windowWidth = textEl.parentElement.clientWidth;
  let startTime = null;
  const step = (time) => {
    // Its pill or day was rebuilt away.
    if (!textEl.isConnected) {
      stopMarqueeText(textEl);
      return;
    }
    if (startTime === null) startTime = time;
    const distance = marqueeDistance(time - startTime);
    // The first pass starts where the text rests; later ones come in from the
    // right edge.
    const offset =
      distance < textWidth
        ? -distance
        : windowWidth - ((distance - textWidth) % (textWidth + windowWidth));
    textEl.style.transform = `translateX(${offset}px)`;
    textEl._marqueeFrame = requestAnimationFrame(step);
  };
  textEl._marqueeFrame = requestAnimationFrame(step);
  textEl.classList.add("assessment-pill-text--scrolling");
}

export function stopMarqueeText(textEl) {
  cancelAnimationFrame(textEl._marqueeFrame);
  textEl._marqueeFrame = null;
  textEl.classList.remove("assessment-pill-text--scrolling");
  textEl.style.transform = "";
}

// Rather than snapping back mid-scroll, it fades out, jumps back while
// invisible and fades in.
export function returnMarqueeText(textEl) {
  textEl.style.transition = `opacity ${MARQUEE_RETURN_FADE_MS}ms ease`;
  textEl.style.opacity = "0";
  textEl._marqueeReturnTimer = setTimeout(() => {
    stopMarqueeText(textEl);
    textEl.style.opacity = "";
    textEl._marqueeReturnTimer = setTimeout(() => {
      textEl.style.transition = "";
      textEl._marqueeReturnTimer = null;
    }, MARQUEE_RETURN_FADE_MS);
  }, MARQUEE_RETURN_FADE_MS);
}

export function cancelMarqueeReturn(textEl) {
  if (!textEl._marqueeReturnTimer) return;
  clearTimeout(textEl._marqueeReturnTimer);
  textEl._marqueeReturnTimer = null;
  stopMarqueeText(textEl);
  textEl.style.transition = "";
  textEl.style.opacity = "";
}

export function buildDayCell(weeksContainer, date, entriesByDate, resolvedNames, onContextMenu, courseColors) {
  const iso = toISODate(date);
  const today = new Date();

  const cell = document.createElement("div");
  cell.className = "assessment-week-day";
  cell.dataset.iso = iso;
  // Pills keep their own tooltips.
  // Not while the type menu or add popup is already open.
  attachHoverTooltip(cell, "Click to add", {
    when: (event) => !event.target.closest(".assessment-chip") && !document.querySelector(".add-popup, .popup-menu"),
  });
  if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("assessment-week-day--weekend");

  // The 1st of a month and the top week's Sunday name the month, so it's always
  // shown.
  const head = document.createElement("div");
  head.className = "assessment-week-day-head";
  if (date.getDate() === 1 || date.getDay() === 0) {
    const month = document.createElement("span");
    month.className = "assessment-week-day-month";
    if (date.getDate() !== 1) month.classList.add("assessment-week-day-month--top-only");
    month.textContent = CAL_MONTH_SHORT[date.getMonth()];
    head.appendChild(month);
  }

  const dayNumber = document.createElement("span");
  dayNumber.className = "assessment-week-day-number";
  dayNumber.textContent = String(date.getDate());
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) {
    dayNumber.classList.add("assessment-week-day-number--today");
  }
  head.appendChild(dayNumber);
  const dayType = allDayTypes[iso];
  if (dayType === "A" || dayType === "B") {
    const dayTypeLabel = document.createElement("span");
    dayTypeLabel.className = "assessment-week-day-type";
    dayTypeLabel.textContent = dayType;
    head.appendChild(dayTypeLabel);
  }
  cell.appendChild(head);

  // A stable sort, so the rest keep their order.
  const entries = (entriesByDate[iso] || [])
    .slice()
    .sort((a, b) => Number(b.type === "Testing Block") - Number(a.type === "Testing Block"));

  const pillList = document.createElement("div");
  pillList.className = "assessment-week-day-pills";
  entries.forEach((entry) =>
    pillList.appendChild(buildAssessmentPill(entry, resolvedNames, onContextMenu, courseColors))
  );
  cell.appendChild(pillList);

  // Only for names actually cut off, checked on every hover since day widths
  // change. Waits for the mouse to rest, then keeps going while it stays on the
  // day.
  let restTimer = null;
  let marqueeStarted = false;
  const startMarquee = () => {
    marqueeStarted = true;
    cell.querySelectorAll(".assessment-pill-text").forEach((textEl) => {
      if (textEl.scrollWidth > textEl.parentElement.clientWidth) startMarqueeText(textEl);
    });
  };
  const waitForRest = () => {
    if (marqueeStarted) return;
    clearTimeout(restTimer);
    restTimer = setTimeout(startMarquee, MARQUEE_REST_MS);
  };
  cell.addEventListener("mouseenter", () => {
    // Returned before a fade finished: start clean.
    cell.querySelectorAll(".assessment-pill-text").forEach(cancelMarqueeReturn);
    waitForRest();
  });
  cell.addEventListener("mousemove", waitForRest);
  cell.addEventListener("mouseleave", () => {
    clearTimeout(restTimer);
    marqueeStarted = false;
    cell.querySelectorAll(".assessment-pill-text--scrolling").forEach(returnMarqueeText);
  });

  weeksContainer.appendChild(cell);
}

// Unlike a calendar pill's, scrolls as soon as it's hovered. shortText stands
// in when the full text is cut off. Judged by the room it has at rest: a name
// that fits then doesn't scroll just because a course row's chevron slides in
// on hover and narrows it, nor switches to its short name then: while hovered
// it keeps the name it had.
export function attachHoverMarquee(hoverEl, windowEl, text, shortText = null) {
  const textEl = windowEl.appendChild(document.createElement("span"));
  textEl.className = "assessment-pill-text";
  fitName(windowEl, textEl, text, shortText, () => hoverEl.matches(":hover"));
  hoverEl.addEventListener("mouseenter", () => {
    cancelMarqueeReturn(textEl);
    if (textEl.scrollWidth > windowEl.clientWidth) startMarqueeText(textEl);
  });
  hoverEl.addEventListener("mouseleave", () => {
    if (textEl.classList.contains("assessment-pill-text--scrolling")) returnMarqueeText(textEl);
  });
}
