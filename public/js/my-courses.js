
// The My Courses popup itself is React now (src/popups/MyCoursesPopup.jsx).

// Opens on the current week and scrolls back to the start of the school year.

const CALENDAR_SCROLL_SETTLE_MS = 150;

const ASSESSMENT_CALENDAR_WEEK_COUNT = 4;
const ASSESSMENT_CALENDAR_WEEKDAYS_PER_WEEK = 7;

const CAL_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// With no division picked yet, any division could be the student's, so all are
// matched. periodIndex lets A/B-day assessments show only when this period
// meets.
function myAssessmentMatchEntries() {
  const periods = loadPeriods();
  const divisions = loadPeriodDivisions();
  const matchEntries = [];
  const resolvedNames = new Set();

  periods.forEach((name, index) => {
    const trimmed = (name || "").trim();
    if (trimmed === "") return;

    const course = findCourseCatalogEntry(trimmed);
    const divisionOptions = course && course.divisions;
    if (!divisionOptions || divisionOptions.length === 0) {
      matchEntries.push({ name: trimmed, periodIndex: index });
      return;
    }

    const picked = divisions[index] || "";
    if (picked) {
      matchEntries.push({ name: effectiveCourseName(trimmed, picked), periodIndex: index });
      resolvedNames.add(trimmed);
    } else {
      divisionOptions.forEach((division) =>
        matchEntries.push({ name: effectiveCourseName(trimmed, division), periodIndex: index })
      );
    }
  });

  return { matchEntries, resolvedNames };
}

// Yellow and lime are skipped: too faint for a dot or pill text on a light
// background.
const COURSE_COLOR_PALETTE = ["red", "dark-blue", "orange", "purple", "light-blue", "green", "pink", "teal"];

const COURSE_COLOR_CHOICES = [
  "red", "coral", "orange", "amber", "yellow", "lime", "true-green", "green",
  "teal", "cyan", "light-blue", "dark-blue", "indigo", "purple", "magenta", "pink",
  "rose", "brown", "slate", "gray",
];

// Keyed by the typed name, so a course in two periods keeps one color.
function courseColorNames() {
  const picked = window.getPreferences().courseColors || {};
  const colors = new Map();
  loadPeriods().forEach((name) => {
    const trimmed = (name || "").trim();
    if (trimmed === "" || colors.has(trimmed)) return;
    const fallback = COURSE_COLOR_PALETTE[colors.size % COURSE_COLOR_PALETTE.length];
    colors.set(trimmed, COURSE_COLOR_CHOICES.includes(picked[trimmed]) ? picked[trimmed] : fallback);
  });
  return colors;
}

function courseColorAssignments() {
  return new Map([...courseColorNames()].map(([name, color]) => [name, `var(--color-${color})`]));
}

let openCourseColorPicker = null; // { anchor, panel }

// Matches Domain's date popup, but opening to the dot's left.
function closeCourseColorPicker() {
  if (!openCourseColorPicker) return;
  const { panel } = openCourseColorPicker;
  openCourseColorPicker = null;
  // Its swatch won't get a mouseleave once the panel is gone.
  hideHoverTooltip();
  panel.classList.remove("course-color-picker--visible");
  setTimeout(() => panel.remove(), 180);
}

function openCourseColorPickerFor(anchor, courseName, currentColor) {
  const panel = document.createElement("div");
  panel.className = "course-color-picker";
  COURSE_COLOR_CHOICES.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "course-color-swatch";
    if (color === currentColor) swatch.classList.add("course-color-swatch--selected");
    swatch.style.setProperty("--chip-color", `var(--color-${color})`);
    swatch.setAttribute("aria-label", color.replace("-", " "));
    const colorLabel = color.replace("-", " ");
    attachHoverTooltip(swatch, colorLabel[0].toUpperCase() + colorLabel.slice(1));
    swatch.addEventListener("click", () => {
      closeCourseColorPicker();
      if (color === currentColor) return;
      const picked = { ...(window.getPreferences().courseColors || {}), [courseName]: color };
      window.setPreference("courseColors", picked);
    });
    panel.appendChild(swatch);
  });
  document.body.appendChild(panel);

  const dot = anchor.querySelector(".course-color-dot").getBoundingClientRect();
  // The panel starts scaled down, which getBoundingClientRect would measure.
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const dotCenterY = dot.top + dot.height / 2;
  const top = Math.max(8, Math.min(dotCenterY - height / 2, window.innerHeight - height - 8));
  panel.style.top = `${top}px`;
  // Room for the pointer, whose tip sits 8px from the dot.
  panel.style.left = `${Math.max(8, dot.left - 24 - width)}px`;
  panel.style.setProperty("--pointer-y", `${dotCenterY - top}px`);
  panel.style.transformOrigin = `calc(100% + 16px) ${dotCenterY - top}px`;

  void panel.offsetWidth;  // so the entrance transitions
  panel.classList.add("course-color-picker--visible");
  openCourseColorPicker = { anchor, panel };
}

document.addEventListener("click", (event) => {
  if (!openCourseColorPicker) return;
  if (event.target.closest(".course-color-picker") || openCourseColorPicker.anchor.contains(event.target)) return;
  closeCourseColorPicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCourseColorPicker();
});

// Reassessments are a custom type, so they're recognized by name.
function assessmentCategory(entry) {
  if (isReassessment(entry)) return "reassessment";
  if (entry.type === "In-Class" || entry.type === "Testing Block" || entry.type === "Summative") return "summative";
  if (entry.type === "Homework" || entry.type === "Assignment") return "assignment";
  return "formative";
}

function stripDivisionSuffix(courseName) {
  return courseName.replace(/ \([^)]*\)$/, "");
}

// Rechecked whenever the window resizes, since a hidden grid can't be measured
// and day widths follow the page.
const nameFitObserver = new ResizeObserver((records) =>
  records.forEach(({ target }) => {
    if (!target.isConnected) nameFitObserver.unobserve(target);
    else target._fitName();
  })
);

function fitName(windowEl, textEl, full, short) {
  textEl.textContent = full;
  if (!short || short === full) return;
  windowEl._fitName = () => {
    textEl.textContent = full;
    if (textEl.scrollWidth > windowEl.clientWidth) textEl.textContent = short;
  };
  nameFitObserver.observe(windowEl);
}

function latestAugustFirst() {
  const today = new Date();
  return new Date(today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1, 7, 1);
}

function startOfWeek(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

function buildAssessmentPill(entry, resolvedNames, onContextMenu, courseColors) {
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

const PILL_FADE_MS = 200;
const PILL_MOVE_MS = 200;

const MONTH_PILL_CELLS = {
  selector: ".assessment-week-day",
  key: (cell) => cell.dataset.iso,
  list: (cell) => cell.querySelector(".assessment-week-day-pills"),
};
const CLASS_GRID_PILL_CELLS = {
  selector: ".class-grid-cell",
  key: (cell) => `${cell.dataset.course}|${cell.dataset.iso}`,
  list: (cell) => cell.querySelector(".class-grid-cell-pills"),
};

// Pills still leaving from an earlier change count as already gone.
function renderedPillsByDate(container, cells = MONTH_PILL_CELLS) {
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
function pillListGap(list) {
  return parseFloat(getComputedStyle(list).rowGap) || 0;
}

// Space opens first, then the pill fades in.
function enterPill(pill) {
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
function leavePill(pill, list, before) {
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
function animatePillChanges(container, pillsBefore, cells = MONTH_PILL_CELLS) {
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

const CAL_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MARQUEE_RETURN_FADE_MS = 250;
// So sweeping across the calendar doesn't set every name scrolling.
const MARQUEE_REST_MS = 50;

// A fixed speed, whatever the name's length.
const MARQUEE_SPEED_PX_PER_S = 100;
const MARQUEE_ACCEL_MS = 400;

// Worked out from time rather than added up per frame, so it's the same at any
// frame rate.
function marqueeDistance(elapsed) {
  const rampSeconds = MARQUEE_ACCEL_MS / 1000;
  const seconds = elapsed / 1000;
  if (seconds < rampSeconds) {
    return (MARQUEE_SPEED_PX_PER_S * seconds ** 2) / (2 * rampSeconds);
  }
  return MARQUEE_SPEED_PX_PER_S * (rampSeconds / 2 + (seconds - rampSeconds));
}

// Driven per frame from marqueeDistance rather than a timed CSS animation, so
// speed doesn't depend on how far a pass goes.
function startMarqueeText(textEl) {
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

function stopMarqueeText(textEl) {
  cancelAnimationFrame(textEl._marqueeFrame);
  textEl._marqueeFrame = null;
  textEl.classList.remove("assessment-pill-text--scrolling");
  textEl.style.transform = "";
}

// Rather than snapping back mid-scroll, it fades out, jumps back while
// invisible and fades in.
function returnMarqueeText(textEl) {
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

function cancelMarqueeReturn(textEl) {
  if (!textEl._marqueeReturnTimer) return;
  clearTimeout(textEl._marqueeReturnTimer);
  textEl._marqueeReturnTimer = null;
  stopMarqueeText(textEl);
  textEl.style.transition = "";
  textEl.style.opacity = "";
}

function buildDayCell(weeksContainer, date, entriesByDate, resolvedNames, onContextMenu, courseColors) {
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

// Returns render so other code (a period being typed) can refresh it; null
// without the calendar markup.
function initAssessmentCalendar() {
  const cardEl = document.getElementById("my-courses-calendar-card");
  const weeksContainer = document.getElementById("assessment-cal-weeks");
  if (!weeksContainer) return null;

  const loadingEl = document.getElementById("assessment-cal-loading");

  function weekRowHeight() {
    const cell = weeksContainer.querySelector(".assessment-week-day");
    // Unrounded: the cells' height is fractional, and rounding would drift
    // further each week.
    return cell ? cell.getBoundingClientRect().height + pillListGap(weeksContainer) : 0;
  }

  // Like the first row of a paper calendar.
  function markTopWeek() {
    const rowHeight = weekRowHeight();
    if (!rowHeight) return;
    const cells = weeksContainer.querySelectorAll(".assessment-week-day");
    const topIndex = Math.min(Math.round(weeksContainer.scrollTop / rowHeight) * 7, cells.length - 7);
    weeksContainer
      .querySelectorAll(".assessment-week-day--top-week")
      .forEach((cell) => cell.classList.remove("assessment-week-day--top-week"));
    if (cells[topIndex]) cells[topIndex].classList.add("assessment-week-day--top-week");
  }
  weeksContainer.addEventListener("scroll", markTopWeek, { passive: true });

  // See-through only while scrolling; a constant backdrop blur caused rendering
  // glitches.
  let scrollingTimer = null;
  weeksContainer.addEventListener(
    "scroll",
    () => {
      weeksContainer.classList.add("assessment-calendar-weeks--scrolling");
      clearTimeout(scrollingTimer);
      scrollingTimer = setTimeout(
        () => weeksContainer.classList.remove("assessment-calendar-weeks--scrolling"),
        CALENDAR_SCROLL_SETTLE_MS
      );
    },
    { passive: true }
  );

  // So a render that changes nothing can be skipped.
  let previousPillIds = new Set();
  let previousMatchNamesKey = "";
  // Nothing should animate in just from opening the tab.
  let calendarSettled = false;
  // Kept fresh each render rather than threaded through the whole pill-building
  // chain.
  let currentAddedIds = new Set();
  // Not saved, so every visit starts with everything shown.
  const hiddenCategories = new Set();

  function deleteAddedAssessment(id) {
    const entries = loadAddedAssessments();
    const removed = entries.find((entry) => entry.id === id);
    saveAddedAssessments(entries.filter((entry) => entry.id !== id));
    // Assignments are never suggested to admins.
    if (removed && removed.type !== "Assignment") unlogSuggestedAssessment(removed.date, removed.courseName, removed.type);
    render(true, false);
  }

  // Only the student's own entries can be removed.
  function handlePillContextMenu(entry, pillEl) {
    if (!currentAddedIds.has(entry.id)) {
      showToast("Only assessments added by you can be removed.");
      return;
    }
    deleteAddedAssessment(entry.id);
  }

  const CALENDAR_REVEAL_MS = 300;

  // Never on page load, even for an account with courses.
  function revealCalendarCard(animate) {
    if (!cardEl || !cardEl.hidden) return;
    cardEl.hidden = false;
    if (!animate) return;
    cardEl.style.opacity = "0";
    cardEl.style.transition = `opacity ${CALENDAR_REVEAL_MS}ms ease`;
    void cardEl.offsetWidth;  // so the "0" applies first
    cardEl.style.opacity = "1";
  }

  function hideCalendarCard() {
    if (!cardEl || cardEl.hidden) return;
    cardEl.hidden = true;
    cardEl.style.opacity = "";
    cardEl.style.transition = "";
  }

  // Without arguments (page load) it decides show or hide instantly. While
  // typing (commit=false) visibility is left alone; leaving the field reveals
  // or fades it.
  function render(commit = true, animate = false) {
    const hasAnyCourse = loadPeriods().some((name) => (name || "").trim() !== "");
    if (commit) {
      if (hasAnyCourse) revealCalendarCard(animate);
      else hideCalendarCard();
    }
    if (!hasAnyCourse) return;

    // Keyed by resolved course name (division included) so pills can look
    // colors up directly.
    const colorNames = courseColorNames();
    const typedColors = courseColorAssignments();
    renderCourseColorLegend(colorNames);

    // Also called on period changes; a real render is guaranteed once both
    // collections load.
    if (!assessmentsLoaded || !dayTypesLoaded) return;

    const { matchEntries, resolvedNames } = myAssessmentMatchEntries();
    const periods = loadPeriods();
    const courseColors = new Map([
      ...typedColors,
      ...matchEntries.map((entry) => [entry.name, typedColors.get((periods[entry.periodIndex] || "").trim())]),
    ]);
    const matchNames = new Set(matchEntries.map((entry) => entry.name));
    const schoolWideEntries = assessmentsForCourses(matchEntries);
    // Only those added against one of the student's current courses.
    const addedEntries = loadAddedAssessments().filter((entry) => matchNames.has(entry.courseName));

    // Once an admin schedules the same {date, courseName, type}, the student's
    // own copy is redundant, so it's dropped instead of showing twice.
    const schoolWideKeys = new Set(schoolWideEntries.map((entry) => `${entry.date}|${entry.courseName}|${entry.type}`));
    const staleAdded = addedEntries.filter((entry) => schoolWideKeys.has(`${entry.date}|${entry.courseName}|${entry.type}`));
    let effectiveAddedEntries = addedEntries;
    if (staleAdded.length > 0) {
      const staleIds = new Set(staleAdded.map((entry) => entry.id));
      saveAddedAssessments(loadAddedAssessments().filter((entry) => !staleIds.has(entry.id)));
      effectiveAddedEntries = addedEntries.filter((entry) => !staleIds.has(entry.id));
    }

    currentAddedIds = new Set(effectiveAddedEntries.map((entry) => entry.id));
    renderUpcoming(schoolWideEntries.concat(effectiveAddedEntries), resolvedNames, courseColors, matchEntries);
    const matchingEntries = schoolWideEntries
      .concat(effectiveAddedEntries)
      .filter((entry) => !hiddenCategories.has(assessmentCategory(entry)));
    // Includes colors, so a new color repaints the pills.
    const matchNamesKey =
      matchEntries.map((entry) => `${entry.name}|${entry.periodIndex}`).join(" ") + " " + [...colorNames.values()].join(" ");

    // The callback can run twice on first load (cache, then fetch); an
    // identical result skips the rebuild, which would cut pill animations
    // short. matchNamesKey is checked too: a division pick can change which
    // names are unambiguous without changing the entries.
    const classGrid = document.getElementById("assessment-class-grid");
    if (classGrid) {
      if (calendarViewMode === "byClass") {
        // Shown first: a hidden grid can't be scrolled.
        loadingEl.hidden = true;
        weeksContainer.hidden = true;
        // Not when the grid was just switched to; its old pills are out of
        // date.
        const animateClassPills = !classGrid.hidden && classGrid.childElementCount > 0;
        classGrid.hidden = false;
        renderClassGrid(classGrid, matchingEntries, matchEntries, resolvedNames, courseColors, handlePillContextMenu, animateClassPills);
        return;
      }
      classGrid.hidden = true;
    }

    if (!weeksContainer.hidden && matchNamesKey === previousMatchNamesKey) {
      const currentPillIds = new Set(matchingEntries.map((entry) => entry.id));
      const unchanged =
        currentPillIds.size === previousPillIds.size && [...currentPillIds].every((id) => previousPillIds.has(id));
      if (unchanged) return;
    }

    const entriesByDate = {};
    matchingEntries.forEach((entry) => {
      (entriesByDate[entry.date] = entriesByDate[entry.date] || []).push(entry);
    });

    // Separate from animate, which is only the card's reveal; pills animate on
    // any render after the first build.
    const animatePills = calendarSettled;
    calendarSettled = true;
    const pillsBefore = animatePills ? renderedPillsByDate(weeksContainer) : null;

    // The pill under the cursor is about to be replaced, and its mouseleave
    // won't fire.
    hideHoverTooltip();
    // The same weeks come back, so the rebuild keeps its place.
    const scrollTop = weeksContainer.scrollTop;
    const firstBuild = weeksContainer.childElementCount === 0;
    // A hidden element's scrollTop reads 0, so after By Class it reopens on
    // this week.
    const openOnThisWeek = firstBuild || weeksContainer.hidden;
    weeksContainer.innerHTML = "";
    CAL_WEEKDAY_LABELS.forEach((label, dayIndex) => {
      const weekday = document.createElement("span");
      weekday.className = "assessment-week-day-weekday";
      if (dayIndex === 0 || dayIndex === 6) weekday.classList.add("assessment-week-day-weekday--weekend");
      weekday.textContent = label;
      weeksContainer.appendChild(weekday);
    });
    const thisWeekStart = startOfWeek(new Date());
    const firstWeekStart = startOfWeek(latestAugustFirst());
    const pastWeeks = Math.round((thisWeekStart - firstWeekStart) / (7 * 86400000));
    for (let weekIndex = -pastWeeks; weekIndex < ASSESSMENT_CALENDAR_WEEK_COUNT; weekIndex++) {
      for (let dayIndex = 0; dayIndex < ASSESSMENT_CALENDAR_WEEKDAYS_PER_WEEK; dayIndex++) {
        const date = new Date(
          thisWeekStart.getFullYear(),
          thisWeekStart.getMonth(),
          thisWeekStart.getDate() + weekIndex * 7 + dayIndex
        );
        buildDayCell(weeksContainer, date, entriesByDate, resolvedNames, handlePillContextMenu, courseColors);
      }
    }
    previousPillIds = new Set(matchingEntries.map((entry) => entry.id));
    previousMatchNamesKey = matchNamesKey;

    // Before the pill animations, which measure heights and can't in a hidden
    // grid.
    loadingEl.hidden = true;
    weeksContainer.hidden = false;
    weeksContainer.scrollTop = openOnThisWeek ? weekRowHeight() * pastWeeks : scrollTop;
    markTopWeek();

    if (pillsBefore) animatePillChanges(weeksContainer, pillsBefore);
  }

  // Laid out like Google Tasks. Overdue assignments stay at the top;
  // assessments drop off once over.
  const upcomingList = document.getElementById("upcoming-list");
  let lastUpcomingArgs = null;

  // Realigned on every scroll and resize.
  const upcomingBlur = upcomingList && upcomingList.parentElement.querySelector(".upcoming-blur");
  let upcomingBlurCopy = null;

  function copyUpcomingForBlur() {
    upcomingBlurCopy = document.createElement("div");
    upcomingBlurCopy.className = "upcoming-blur-copy";
    upcomingBlurCopy.append(
      ...[...upcomingList.children].filter((node) => !node.classList.contains("upcoming-ghost")).map((node) => node.cloneNode(true))
    );
    upcomingBlur.replaceChildren(upcomingBlurCopy);
    placeUpcomingBlur();
  }

  function placeUpcomingBlur() {
    // The fades leave the scrollbar alone. At least UPCOMING_SCROLLBAR_MIN_PX,
    // because a macOS overlay scrollbar measures 0 while still drawn over the
    // rows.
    const scrollbarWidth = Math.max(UPCOMING_SCROLLBAR_MIN_PX, upcomingList.offsetWidth - upcomingList.clientWidth);
    upcomingList.closest(".todo-card").style.setProperty("--upcoming-scrollbar-w", `${scrollbarWidth}px`);
    upcomingBlur.style.top = `${upcomingList.offsetTop}px`;
    if (!upcomingBlurCopy) return;
    upcomingBlurCopy.style.marginLeft = `${upcomingList.offsetLeft - upcomingBlur.offsetLeft}px`;
    // clientWidth, so the copy's rows wrap like the real ones beside the
    // scrollbar.
    upcomingBlurCopy.style.width = `${upcomingList.clientWidth}px`;
    upcomingBlurCopy.style.paddingTop = getComputedStyle(upcomingList).paddingTop;
    upcomingBlurCopy.style.transform = `translateY(${-upcomingList.scrollTop}px)`;
    outlineAddButtonIfCovered();
  }

  // Outlined while a date chip or countdown touches it, so it doesn't blend
  // into them as they scroll behind the header.
  const upcomingAddBtn = document.getElementById("add-assessment-trigger-btn");
  function outlineAddButtonIfCovered() {
    if (!upcomingAddBtn) return;
    const btn = upcomingAddBtn.getBoundingClientRect();
    const covered = [...upcomingList.querySelectorAll(".upcoming-date-chip, .upcoming-countdown:not([hidden])")].some(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.right >= btn.left - 1 && r.left <= btn.right + 1 && r.bottom >= btn.top - 1 && r.top <= btn.bottom + 1;
      }
    );
    upcomingAddBtn.classList.toggle("todo-add-btn--covered", covered);
  }

  if (upcomingBlur) {
    let copyFrame = 0;
    new MutationObserver(() => {
      cancelAnimationFrame(copyFrame);
      copyFrame = requestAnimationFrame(copyUpcomingForBlur);
    }).observe(upcomingList, { childList: true, subtree: true, characterData: true, attributes: true });
    upcomingList.addEventListener("scroll", placeUpcomingBlur, { passive: true });
    new ResizeObserver(placeUpcomingBlur).observe(upcomingList);
  }

  // Not saved: it starts closed.
  let completedExpanded = false;
  // For its roll.
  let shownCompletedCount = null;

  function renderUpcoming(entries, resolvedNames, courseColors, matchEntries) {
    if (!upcomingList) return;
    lastUpcomingArgs = [entries, resolvedNames, courseColors, matchEntries];
    const today = todayISODate();
    const completed = new Map(completedTaskRecords().map((record) => [record.id, record.completedAt]));
    const periodIndexOf = new Map(matchEntries.map((entry) => [entry.name, entry.periodIndex]));
    const tomorrow = toISODate(new Date(Date.now() + 86400000));
    // Everything due by tomorrow always shows; UPCOMING_LIMIT only caps what
    // comes later.
    let laterShown = 0;
    const due = entries
      .filter((entry) => !completed.has(entry.id))
      .filter(
        (entry) =>
          assessmentCategory(entry) === "assignment" ||
          assessmentStillUpcoming(entry, periodIndexOf.get(entry.courseName))
      )
      .sort(
        (a, b) =>
          upcomingSortTime(a, periodIndexOf.get(a.courseName)) - upcomingSortTime(b, periodIndexOf.get(b.courseName))
      )
      .filter((entry) => entry.date <= tomorrow || laterShown++ < UPCOMING_LIMIT);

    const recentCutoff = Date.now() - COMPLETED_SHOWN_DAYS * 86400000;
    const recentlyCompleted = entries
      .filter((entry) => completed.has(entry.id) && completed.get(entry.id) >= recentCutoff)
      .sort((a, b) => completed.get(b.id) - completed.get(a.id));

    const itemFor = (entry, done) => {
      const strippedName = stripDivisionSuffix(entry.courseName);
      const courseLabel = resolvedNames.has(strippedName) ? strippedName : entry.courseName;
      const color = courseColors.get(entry.courseName) || courseColors.get(strippedName);
      const periodIndex = periodIndexOf.get(entry.courseName);
      // Overdue from the moment it's due, not only from the next day.
      const dueAt = upcomingDueAt(entry, periodIndex);
      const overdue =
        !done &&
        assessmentCategory(entry) === "assignment" &&
        (entry.date < today || (dueAt !== null && dueAt <= new Date()));
      return buildUpcomingItem(entry, courseLabel, color, periodIndex, overdue, done);
    };

    upcomingList.innerHTML = "";
    due.forEach((entry, index) => {
      if (index > 0 && entry.date > tomorrow && due[index - 1].date <= tomorrow) {
        const divider = upcomingList.appendChild(document.createElement("li"));
        divider.className = "upcoming-divider";
        divider.dataset.rowKey = "divider";
        divider.setAttribute("aria-hidden", "true");
      }
      upcomingList.appendChild(itemFor(entry, false));
    });
    if (due.length === 0) {
      const empty = upcomingList.appendChild(document.createElement("li"));
      empty.className = "upcoming-empty";
      empty.dataset.rowKey = "empty";
      empty.textContent = "Nothing coming up";
    }
    if (recentlyCompleted.length > 0) {
      const toggleItem = upcomingList.appendChild(document.createElement("li"));
      toggleItem.dataset.rowKey = "completed-toggle";
      const toggle = toggleItem.appendChild(document.createElement("button"));
      toggle.type = "button";
      toggle.className = "upcoming-completed-toggle";
      toggle.setAttribute("aria-expanded", String(completedExpanded));
      toggle.innerHTML = `<span>Completed (<span class="upcoming-completed-count"></span>)</span>${ICON_CHEVRON_DOWN}`;
      const countEl = toggle.querySelector(".upcoming-completed-count");
      const count = String(recentlyCompleted.length);
      if (shownCompletedCount === null || shownCompletedCount === count) {
        countEl.textContent = count;
      } else {
        countEl.textContent = shownCompletedCount;
        animateNumberChange(countEl, count);
      }
      shownCompletedCount = count;
      // In place rather than rebuilt, so the arrow turns instead of being
      // replaced.
      toggle.addEventListener("click", () => {
        completedExpanded = !completedExpanded;
        toggle.setAttribute("aria-expanded", String(completedExpanded));
        if (completedExpanded) {
          recentlyCompleted.forEach((entry) => upcomingList.appendChild(itemFor(entry, true)));
        } else {
          upcomingList.querySelectorAll(".upcoming-item--completed").forEach((item) => item.remove());
        }
      });
      if (completedExpanded) recentlyCompleted.forEach((entry) => upcomingList.appendChild(itemFor(entry, true)));
    } else {
      shownCompletedCount = null;
    }
    tickUpcomingCountdowns();
  }

  // Rebuilds the list when an item's moment comes, so it can turn overdue or
  // drop off.
  function tickUpcomingCountdowns() {
    const now = Date.now();
    let passed = false;
    upcomingList.querySelectorAll(".upcoming-item[data-due-at]").forEach((item) => {
      const countdown = item.querySelector(".upcoming-countdown");
      const left = Number(item.dataset.dueAt) - now;
      if (left <= 0 && !countdown.hidden) passed = true;
      const show = left > 0 && left < UPCOMING_COUNTDOWN_MS;
      const wasHidden = countdown.hidden;
      countdown.hidden = !show;
      item.querySelector(".upcoming-date-chip-label").hidden = show;
      if (!show) return;
      // "2h 05m", "25m", or in the last minute "45s". Minutes and seconds
      // are rounded up, so it never shows less time than is left.
      const totalSeconds = Math.ceil(left / 1000);
      const totalMinutes = Math.ceil(totalSeconds / 60);
      const hours = Math.floor(totalMinutes / 60);
      const parts = {
        hours: totalSeconds >= 60 && hours > 0 ? String(hours) : null,
        minutes: totalSeconds >= 60 ? String(totalMinutes % 60).padStart(hours > 0 ? 2 : 1, "0") : null,
        seconds: totalSeconds < 60 ? String(totalSeconds) : null,
      };
      // Separate numbers, as the roll judges direction from the whole number.
      // A part just appearing starts on its number rather than rolling to it.
      Object.entries(parts).forEach(([unit, value]) => {
        const part = countdown.querySelector(`.upcoming-countdown-${unit}-part`);
        const partWasHidden = wasHidden || part.hidden;
        part.hidden = value === null;
        if (value === null) return;
        animateNumberChange(part.querySelector(`.upcoming-countdown-${unit}`), value, partWasHidden ? "instant" : "countdown");
      });
    });
    const ended = [...upcomingList.querySelectorAll(".upcoming-item[data-ends-at]")].some(
      (item) => Number(item.dataset.endsAt) <= now
    );
    if ((passed || ended) && lastUpcomingArgs) renderUpcoming(...lastUpcomingArgs);
  }
  if (upcomingList) setInterval(tickUpcomingCountdowns, 1000);

  // done: an item in the Completed section, whose ring un-checks it.
  function buildUpcomingItem(entry, courseLabel, color, periodIndex, overdue, done) {
    const item = document.createElement("li");
    item.className = "upcoming-item";
    // Lets moveUpcomingItem match this row across rebuilds.
    item.dataset.rowKey = entry.id;
    if (done) item.classList.add("upcoming-item--done", "upcoming-item--completed");
    if (color) item.style.setProperty("--chip-color", color);

    const check = document.createElement("button");
    check.type = "button";
    check.className = "upcoming-check";
    check.setAttribute("aria-label", done ? "Mark not complete" : "Mark complete");
    check.innerHTML = '<span class="upcoming-check-icon" aria-hidden="true"></span>';
    item.appendChild(check);
    // A click on the ring, or the ring pressed by keyboard, lands here too.
    item.addEventListener("click", () =>
      done ? uncompleteUpcomingItem(entry.id, item) : completeUpcomingItem(item, entry.id)
    );

    const titleEl = item.appendChild(document.createElement("span"));
    titleEl.className = "upcoming-title";
    titleEl.textContent = upcomingTitle(entry, courseLabel);
    // An assessment's title already names its course.
    if (assessmentCategory(entry) === "assignment") {
      const courseEl = item.appendChild(document.createElement("span"));
      courseEl.className = "upcoming-course";
      courseEl.textContent = courseLabel;
      fitName(courseEl, courseEl, courseLabel, shortCourseName(courseLabel));
    } else {
      item.classList.add("upcoming-item--single-line");
    }

    const due = item.appendChild(document.createElement("div"));
    due.className = "upcoming-due";
    const chip = due.appendChild(document.createElement("span"));
    chip.className = "upcoming-date-chip";
    if (overdue) chip.classList.add("upcoming-date-chip--overdue");
    const time = entry.dueTime ? upcomingTimeLabel(entry.dueTime, periodIndex) : "";
    const chipLabel = chip.appendChild(document.createElement("span"));
    chipLabel.className = "upcoming-date-chip-label";
    chipLabel.textContent =
      upcomingDateLabel(entry.date) + (time ? `, ${time}` : "") + (overdue ? " - Overdue" : "");
    // Not for something already done.
    const endsAt = done || assessmentCategory(entry) === "assignment" ? null : assessmentEndsAt(entry, periodIndex);
    if (endsAt) item.dataset.endsAt = String(endsAt.getTime());
    const dueAt = done ? null : upcomingDueAt(entry, periodIndex);
    if (dueAt) {
      item.dataset.dueAt = String(dueAt.getTime());
      const countdown = chip.appendChild(document.createElement("span"));
      countdown.className = "upcoming-countdown";
      countdown.hidden = true;
      countdown.innerHTML = ["hours", "minutes", "seconds"]
        .map(
          (unit) =>
            `<span class="upcoming-countdown-part upcoming-countdown-${unit}-part" hidden>` +
            `<span class="upcoming-countdown-${unit}"></span>${unit[0]}</span>`
        )
        .join("");
    }
    return item;
  }

  // As in Google Tasks. The toast's Undo puts it back.
  function completeUpcomingItem(item, id) {
    if (item.classList.contains("upcoming-item--done")) return;
    item.classList.add("upcoming-item--done");
    saveCompletedTasks([...completedTaskRecords(), { id, completedAt: Date.now() }]);
    markCalendarPillDone(id, true);
    setTimeout(() => moveUpcomingItem(item), UPCOMING_DONE_HOLD_MS);

    const message = document.createDocumentFragment();
    message.append("Marked as complete. ");
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "toast-link";
    undo.textContent = "Undo";
    undo.addEventListener("click", () => {
      hideToast();
      uncompleteUpcomingItem(id);
    });
    message.append(undo);
    showToast(message);
  }

  // Rebuilds first, then plays every moved row from its old position (FLIP), so
  // the slow rebuild finishes before anything moves instead of hitching at the
  // end. Removed elements are shown fading out as ghosts. Transforms and
  // opacity only, so nothing is relaid out or repainted while it plays.
  function moveUpcomingItem(item) {
    if (!item.isConnected || !lastUpcomingArgs) return;
    const movingKey = item.dataset.rowKey;
    const keyedRows = () => [...upcomingList.children].filter((row) => row.dataset.rowKey);
    const before = new Map(keyedRows().map((row) => [row.dataset.rowKey, row]));
    const firstRects = new Map([...before].map(([key, row]) => [key, row.getBoundingClientRect()]));

    renderUpcoming(...lastUpcomingArgs);

    const listRect = upcomingList.getBoundingClientRect();
    const slide = { duration: UPCOMING_SLIDE_MS, delay: UPCOMING_FADE_MS * 0.6, easing: "cubic-bezier(0.2, 0, 0, 1)" };
    const play = (row, keyframes, timing) => {
      row.style.willChange = "transform, opacity";
      const animation = row.animate(keyframes, { ...timing, fill: "backwards" });
      animation.finished.catch(() => {}).finally(() => (row.style.willChange = ""));
      return animation;
    };

    const after = keyedRows();
    const afterKeys = new Set(after.map((row) => row.dataset.rowKey));
    after.forEach((row) => {
      const key = row.dataset.rowKey;
      if (key !== movingKey && firstRects.has(key)) {
        const shift = firstRects.get(key).top - row.getBoundingClientRect().top;
        if (Math.abs(shift) >= 0.5) {
          play(row, [{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }], slide);
        }
        return;
      }
      play(row, [{ opacity: 0 }, { opacity: 1 }], {
        duration: UPCOMING_FADE_MS,
        delay: slide.delay + UPCOMING_SLIDE_MS * 0.4,
        easing: "ease",
      });
    });

    before.forEach((row, key) => {
      if (key !== movingKey && afterKeys.has(key)) return;
      const rect = firstRects.get(key);
      // border-box, so its padding is inside the width; otherwise it stuck out
      // and brought up a scrollbar.
      row.style.cssText += `;position:absolute;top:${rect.top - listRect.top + upcomingList.scrollTop}px;left:${rect.left - listRect.left}px;width:${rect.width}px;box-sizing:border-box;margin:0;pointer-events:none;`;
      row.classList.add("upcoming-ghost");
      upcomingList.appendChild(row);
      play(row, [{ opacity: 1 }, { opacity: 0 }], { duration: UPCOMING_FADE_MS, easing: "ease" })
        .finished.catch(() => {})
        .finally(() => row.remove());
    });
  }

  // From the Completed section it moves back up like checking one off moves it
  // down; from the toast's Undo the list just rebuilds.
  function uncompleteUpcomingItem(id, item = null) {
    if (item && !item.classList.contains("upcoming-item--done")) return;
    saveCompletedTasks(completedTaskRecords().filter((record) => record.id !== id));
    markCalendarPillDone(id, false);
    if (item) {
      item.classList.remove("upcoming-item--done");
      setTimeout(() => moveUpcomingItem(item), UPCOMING_DONE_HOLD_MS);
      return;
    }
    if (lastUpcomingArgs) renderUpcoming(...lastUpcomingArgs);
  }

  // Assessments aren't struck through there.
  function markCalendarPillDone(id, done) {
    document
      .querySelectorAll(`#assessment-cal-weeks .assessment-chip--assignment[data-entry-id="${CSS.escape(id)}"]`)
      .forEach((pill) => pill.classList.toggle("assessment-chip--done", done));
  }

  function renderCourseColorLegend(colorNames) {
    const list = document.getElementById("course-color-list");
    if (!list) return;
    list.innerHTML = "";
    colorNames.forEach((color, name) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "course-color-item";
      button.style.setProperty("--chip-color", `var(--color-${color})`);
      const dot = document.createElement("span");
      dot.className = "course-color-dot";
      const label = document.createElement("span");
      label.className = "course-color-name";
      button.append(dot, label);
      fitName(label, label, name, shortCourseName(name));
      button.addEventListener("click", () => {
        const reopening = openCourseColorPicker && openCourseColorPicker.anchor === button;
        closeCourseColorPicker();
        if (!reopening) openCourseColorPickerFor(button, name, color);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  const filterButtons = document.querySelectorAll(".calendar-filter");
  filterButtons.forEach((btn) => {
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => {
      const category = btn.dataset.category;
      const off = !hiddenCategories.has(category);
      if (off) hiddenCategories.add(category);
      else hiddenCategories.delete(category);
      btn.classList.toggle("calendar-filter--off", off);
      btn.setAttribute("aria-pressed", String(!off));
      render();
    });
  });
  // Course colors are synced preferences, so a pick on another device arrives
  // here too.
  window.addEventListener("app:preferences-changed", () => render());

  loadAssessmentData(() => render());

  return render;
}

// Students can add assignments, and assessments the school calendar is missing;
// the latter are also tallied in "suggested" so admins see what multiple
// students report.

// Only courses that are unambiguous now (no divisions, or one picked).
// periodIndex lets isDuplicateSelection judge visibility the way the calendar
// does.
function addableCourseOptions() {
  const periods = loadPeriods();
  const divisions = loadPeriodDivisions();
  const options = [];

  periods.forEach((name, index) => {
    const trimmed = (name || "").trim();
    if (trimmed === "") return;

    const course = findCourseCatalogEntry(trimmed);
    const divisionOptions = course && course.divisions;
    if (!divisionOptions || divisionOptions.length === 0) {
      options.push({ displayName: trimmed, courseName: trimmed, periodIndex: index });
      return;
    }

    const picked = divisions[index] || "";
    if (picked) options.push({ displayName: trimmed, courseName: effectiveCourseName(trimmed, picked), periodIndex: index });
  });

  return options;
}

// Not cryptographic: it only needs a stable doc id so repeat suggestions land
// on one doc.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// arrayUnion makes a repeat suggestion from the same email a no-op, so
// emails.length is the count.
function suggestedAssessmentDocId(date, courseName, type) {
  return simpleHash(`${date}|${courseName}|${type}`);
}

function logSuggestedAssessment(date, courseName, type) {
  if (!currentUid || typeof firebase === "undefined" || !firebase.firestore) return;
  const email = (auth.currentUser && auth.currentUser.email) || "";
  if (!email) return;
  firebase
    .firestore()
    .collection("suggested")
    .doc(suggestedAssessmentDocId(date, courseName, type))
    .set(
      {
        date,
        courseName,
        type,
        emails: firebase.firestore.FieldValue.arrayUnion(email),
        lastAddedAt: Date.now(),
      },
      { merge: true }
    )
    .catch((error) => console.error("Failed to log suggested assessment:", error));
}

// arrayRemove writes without reading first, so it still works when the daily
// read quota has run out. Emptied docs are cleared by the admin page, since
// students can't delete them. A missing doc (accepted, declined) is ignored.
function unlogSuggestedAssessment(date, courseName, type) {
  if (!currentUid || typeof firebase === "undefined" || !firebase.firestore) return;
  const email = (auth.currentUser && auth.currentUser.email) || "";
  if (!email) return;
  firebase
    .firestore()
    .collection("suggested")
    .doc(suggestedAssessmentDocId(date, courseName, type))
    .update({ emails: firebase.firestore.FieldValue.arrayRemove(email) })
    .catch((error) => {
      if (error && error.code === "not-found") return;
      console.error("Failed to remove suggested assessment:", error);
    });
}

const ADD_POPUP_TYPES = [
  { value: "Assignment", noun: "assignment" },
  { value: "Formative", noun: "formative" },
  { value: "Summative", noun: "summative" },
  { value: "Reassessment", noun: "reassessment" },
];
const CAL_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ADD_POPUP_STEP_MS = 220;
// Room kept below the popup when it opens from a calendar day, so its steps can
// grow.
const ADD_POPUP_MIN_ROOM_PX = 420;
const UPCOMING_LIMIT = 10;
const UPCOMING_DONE_HOLD_MS = 600;
const UPCOMING_SCROLLBAR_MIN_PX = 10;
const UPCOMING_FADE_MS = 150;
const UPCOMING_SLIDE_MS = 260;

// A Testing Block is just a summative here.
function upcomingTitle(entry, courseLabel) {
  if (assessmentCategory(entry) === "assignment") return entry.title || "Assignment";
  const type = entry.type === "In-Class" || entry.type === "Testing Block" ? "Summative" : entry.type;
  return `${courseLabel} ${type}`;
}

// By the actual moment due, so midnight homework comes before a Period 1
// formative that day. Unknown times go just after that day's midnight.
function upcomingSortTime(entry, periodIndex) {
  const dueAt = upcomingDueAt(entry, periodIndex);
  return dueAt ? dueAt.getTime() : fromISODate(entry.date).getTime() + 1;
}

// Like Google Tasks' date chip.
function upcomingDateLabel(iso) {
  const date = fromISODate(iso);
  const today = fromISODate(todayISODate());
  const days = Math.round((date - today) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return `${CAL_WEEKDAY_LABELS[date.getDay()]}, ${window.formatPreferredDate(date)}`;
}

function formatClockTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

const COMPLETED_SHOWN_DAYS = 14;

// Ids that no longer exist anywhere are dropped so the list doesn't grow
// forever. Checked against every assessment, not just current courses, so
// dropping a course for a while loses nothing.
function completedTaskRecords() {
  const records = loadCompletedTasks().map((record) =>
    // Older saves stored bare ids.
    typeof record === "string" ? { id: record, completedAt: Date.now() } : record
  );
  if (!assessmentsLoaded) return records;
  const known = new Set([...allAssessments, ...loadAddedAssessments()].map((entry) => entry.id));
  const kept = records.filter((record) => known.has(record.id));
  if (kept.length !== records.length) saveCompletedTasks(kept);
  return kept;
}

const UPCOMING_COUNTDOWN_MS = 12 * 60 * 60 * 1000;

// null for period-based times when there's no bell schedule or the class
// doesn't meet that day.
function upcomingDueAt(entry, periodIndex) {
  const at = (hhmm) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const date = fromISODate(entry.date);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };
  if (isReassessment(entry)) return at((scheduledTimeOn(entry.date, "academicSupport") || academicSupportTimes()).start);
  if (entry.type === "Testing Block") {
    const time =
      scheduledTimeOn(entry.date, "testingBlock") ||
      (defaultPeriodTimes && defaultPeriodTimes.testingBlock) ||
      TESTING_BLOCK_FALLBACK_TIMES;
    return at(time.start);
  }
  const dueTime = assessmentCategory(entry) === "assignment" ? entry.dueTime || "start" : "period";
  if (/^\d{1,2}:\d{2}$/.test(dueTime)) return at(dueTime);
  if (dueTime === "start") return at("00:00");
  const times = defaultPeriodTimes && defaultPeriodTimes.times;
  if (!times) return null;
  // Only on a day the period actually meets.
  if (periodIndex === undefined) return null;
  const time = scheduledTimeOn(entry.date, `period${periodIndex + 1}`);
  return time ? at(time.start) : null;
}

function upcomingTimeLabel(dueTime, periodIndex) {
  if (dueTime === "start") return "";
  if (dueTime === "period") return periodIndex === undefined ? "" : `Period ${periodIndex + 1}`;
  return formatClockTime(dueTime);
}
const CALENDAR_PICK_FADE_MS = 200;

// With no school calendar set up, every weekday counts.
function upcomingClassDays(periodIndex, count) {
  const days = [];
  const today = new Date();
  const hasSchoolCalendar = Object.keys(allDayTypes).length > 0;
  for (let offset = 1; offset <= 120 && days.length < count; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const dayType = allDayTypes[toISODate(date)];
    const meets = hasSchoolCalendar
      ? (dayType === "A" && periodIndex < 4) || (dayType === "B" && periodIndex >= 4)
      : date.getDay() !== 0 && date.getDay() !== 6;
    if (meets) days.push(date);
  }
  return days;
}

const ICON_BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5L6.5 10l5.5 5.5" /></svg>';
const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" /></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5l5 5-5 5" /></svg>';

// Unlike a calendar pill's, scrolls as soon as it's hovered. shortText stands
// in when the full text is cut off. Judged by the room it has at rest: a name
// that fits then doesn't scroll just because a course row's chevron slides in
// on hover and narrows it.
function attachHoverMarquee(hoverEl, windowEl, text, shortText = null) {
  const textEl = windowEl.appendChild(document.createElement("span"));
  textEl.className = "assessment-pill-text";
  fitName(windowEl, textEl, text, shortText);
  hoverEl.addEventListener("mouseenter", () => {
    cancelMarqueeReturn(textEl);
    if (textEl.scrollWidth > windowEl.clientWidth) startMarqueeText(textEl);
  });
  hoverEl.addEventListener("mouseleave", () => {
    if (textEl.classList.contains("assessment-pill-text--scrolling")) returnMarqueeText(textEl);
  });
}

function initAddToCalendarPopup(refreshAssessmentCalendar) {
  const triggerBtn = document.getElementById("add-assessment-trigger-btn");
  if (!triggerBtn) return;
  attachHoverTooltip(triggerBtn, "Add to calendar");

  // Saving needs a real uid. Sign-in changes reload the page, so this reflects
  // the current state.
  if (!currentUid) {
    triggerBtn.hidden = true;
    return;
  }

  let popup = null;
  let selectedType = ADD_POPUP_TYPES[0].value;
  let selectedCourse = null; // an addableCourseOptions() entry | null
  let selectedDate = null; // ISO string | null
  // Opened from a calendar day, the date is already chosen.
  let presetDate = null;
  // In the By Class grid, only this cell is grayed, not the whole day.
  let presetCell = null;
  // That row's course needn't be asked for.
  let presetCourse = null;
  let anchorPoint = null;

  // Opened at a click, it grows out of that point, even when it's had to sit
  // higher up (no room below the click) or further left; and then it rises
  // into place rather than dropping.
  function growFromPoint(el, left, top) {
    el.style.transformOrigin = `${anchorPoint.x - left}px ${anchorPoint.y - top}px`;
    if (top < anchorPoint.y) el.style.setProperty("--popup-shift", "4px");
  }
  let title = "";
  let dueTime = "start";

  const typeInfo = () => ADD_POPUP_TYPES.find((type) => type.value === selectedType);
  const isAssignment = () => selectedType === "Assignment";
  const colorFor = (option) => {
    const color = courseColorNames().get(option.displayName);
    return color ? `var(--color-${color})` : "var(--color-gray-dark)";
  };

  // A course split across A- and B-day sections can have an entry only the
  // other section sees, so it doesn't block adding, though it isn't suggested
  // either (see submit).
  function matchingSchoolWideEntry() {
    if (!selectedCourse || !selectedDate) return null;
    return (
      allAssessments.find(
        (entry) =>
          entry.date === selectedDate && entry.courseName === selectedCourse.courseName && entry.type === selectedType
      ) || null
    );
  }

  // Assignments can repeat.
  function isDuplicateSelection() {
    if (isAssignment() || !selectedCourse || !selectedDate) return false;
    const matchesSelection = (entry) =>
      entry.date === selectedDate && entry.courseName === selectedCourse.courseName && entry.type === selectedType;
    if (loadAddedAssessments().some(matchesSelection)) return true;
    const match = matchingSchoolWideEntry();
    return Boolean(match) && isAssessmentVisibleForPeriod(match, selectedCourse.periodIndex);
  }

  function canSubmit() {
    if (!selectedCourse || !selectedDate) return false;
    return !isDuplicateSelection();
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function iconButton(icon, label, onClick) {
    const btn = el("button", "add-popup-icon-btn", icon);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", onClick);
    return btn;
  }

  // Long titles switch to shortHeading, then fade and scroll on hover, rather
  // than wrapping.
  function header({ heading, shortHeading, back, withDot }) {
    const bar = el("div", "add-popup-header");
    if (back) bar.appendChild(iconButton(ICON_BACK, "Back", back));
    const title = bar.appendChild(el("h2", "add-popup-title"));
    if (withDot) title.appendChild(el("span", "add-popup-course-dot"));
    attachHoverMarquee(title, title.appendChild(el("span", "add-popup-title-text")), heading, shortHeading);
    return bar;
  }

  function buildPickStep() {
    const step = el("div", "add-popup-step");
    step.appendChild(el("p", "add-popup-prompt")).textContent = "Which course?";
    const options = addableCourseOptions();
    if (options.length === 0) {
      step.appendChild(el("p", "add-popup-hint")).textContent =
        "Pick a division for your courses in My Courses first.";
      return step;
    }
    const list = el("div", "add-popup-courses");
    options.forEach((option) => {
      const row = el("button", "add-popup-course");
      row.type = "button";
      row.style.setProperty("--chip-color", colorFor(option));
      row.appendChild(el("span", "add-popup-course-dot"));
      const nameWindow = row.appendChild(el("span", "add-popup-course-name"));
      attachHoverMarquee(row, nameWindow, option.displayName, shortCourseName(option.displayName));
      row.appendChild(el("span", "add-popup-course-chevron", ICON_CHEVRON));
      // Each period keeps its own slot, so a missing period leaves a gap rather
      // than shifting the others.
      row.style.gridColumn = String(option.periodIndex < 4 ? 1 : 2);
      row.style.gridRow = String((option.periodIndex % 4) + 1);
      row.addEventListener("click", (event) => {
        selectedCourse = option;
        title = "";
        selectedDate = presetDate;
        dueTime = "start";
        if (isAssignment()) {
          showStep(buildDetailsStep(), 1);
          return;
        }
        // Opened from a calendar day: that's the date, so it saves straight
        // away.
        if (presetDate) {
          submit();
          return;
        }
        // An assessment needs only a date, so it skips the second step and
        // picks straight off the calendar. Stopped from reaching the document
        // handler, and blurred so Escape draws no focus ring.
        event.stopPropagation();
        row.blur();
        startDatePick(
          (iso) => {
            selectedDate = iso;
            submit();
          },
          { cursor: event, activeEl: row }
        );
      });
      list.appendChild(row);
    });
    step.appendChild(list);
    return step;
  }

  function buildDetailsStep() {
    const step = el("div", "add-popup-step add-popup-step--details");
    step.style.setProperty("--chip-color", colorFor(selectedCourse));
    step.appendChild(
      header({
        withDot: true,
        heading: `${selectedCourse.displayName} ${typeInfo().noun}`,
        shortHeading: shortCourseName(selectedCourse.displayName) && `${shortCourseName(selectedCourse.displayName)} ${typeInfo().noun}`,
        back: () => {
          showStep(buildPickStep(), -1);
        },
      })
    );

    const addBtn = el("button", "add-popup-primary-btn");
    let timeField = null;
    const refresh = () => {
      addBtn.disabled = !canSubmit();
      showSelectedDate();
      if (timeField) timeField.syncToDate();
    };

    const input = el("input", "add-popup-input");
    input.type = "text";
    input.placeholder = "Describe the task";
    input.value = title;
    input.addEventListener("input", () => {
      title = input.value;
      refresh();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && canSubmit()) submit();
    });
    step.appendChild(input);
    step._focusTarget = input;

    const dueRow = step.appendChild(el("div", "add-popup-due-row"));
    dueRow.appendChild(el("span", "add-popup-label")).textContent = "Due Date";
    const nextClass = upcomingClassDays(selectedCourse.periodIndex, 1)[0];
    const now = new Date();
    const dayFromToday = (offset) => toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
    if (!selectedDate) selectedDate = nextClass ? toISODate(nextClass) : dayFromToday(1);

    const dateBtn = dueRow.appendChild(
      el("button", "add-popup-date-btn", `<span class="add-popup-date-btn-text"></span><img class="add-popup-date-icon" src="${uiIconPath("date.png")}" alt="" />`)
    );
    dateBtn.type = "button";
    const dateBtnText = dateBtn.querySelector(".add-popup-date-btn-text");
    function showSelectedDate() {
      const date = fromISODate(selectedDate);
      const relativeNames = { [dayFromToday(-1)]: "Yesterday", [dayFromToday(0)]: "Today", [dayFromToday(1)]: "Tomorrow" };
      const name =
        nextClass && selectedDate === toISODate(nextClass)
          ? "Next class"
          : relativeNames[selectedDate] || CAL_WEEKDAY_NAMES[date.getDay()];
      const dayType = allDayTypes[selectedDate];
      dateBtnText.innerHTML = "";
      dateBtnText.appendChild(el("span", "add-popup-date-label")).textContent = name;
      dateBtnText.appendChild(el("span", "add-popup-date-sub")).textContent =
        window.formatPreferredDate(date) + (dayType === "A" || dayType === "B" ? ` (${dayType}-day)` : "");
    }
    dateBtn.addEventListener("click", (event) => {
      // Otherwise the document handler would read it as a click outside once
      // the dim layer covers the popup.
      event.stopPropagation();
      // Otherwise it keeps focus under the dim layer and Escape would draw its
      // focus ring.
      dateBtn.blur();
      dateBtnText.innerHTML = "";
      dateBtnText.appendChild(el("span", "add-popup-date-label")).textContent = "Select from calendar";
      startDatePick(
        (iso) => {
          selectedDate = iso;
          refresh();
        },
        { cursor: event, onEnd: showSelectedDate }
      );
    });

    timeField = step.appendChild(buildDueTimeField());

    const footer = el("div", "add-popup-footer");
    addBtn.type = "button";
    addBtn.textContent = "Save";
    addBtn.addEventListener("click", submit);
    footer.append(addBtn);
    step.appendChild(footer);

    refresh();
    return step;
  }

  // Its options open inside the popup, which grows to fit, rather than in a
  // floating menu.
  function buildDueTimeField() {
    const field = el("div", "add-popup-time-field");
    const period = selectedCourse.periodIndex + 1;
    // A period only means a time on a day that period meets.
    const periodKnown = () => allDayTypes[selectedDate] === (selectedCourse.periodIndex < 4 ? "A" : "B");
    const isWeekday = () => fromISODate(selectedDate).getDay() % 6 !== 0;
    const presets = [
      { value: "start", label: "Start of the day", applies: () => true },
      { value: "period", label: `By Period ${period}`, applies: periodKnown },
      { value: "16:00", label: "By 4:00 PM", applies: isWeekday },
    ];
    const describe = () =>
      (presets.find((preset) => preset.value === dueTime) || { label: formatClockTime(dueTime) }).label;

    const row = field.appendChild(el("div", "add-popup-due-row"));
    row.appendChild(el("span", "add-popup-label")).textContent = "Time";
    const timeBtn = row.appendChild(
      el("button", "add-popup-date-btn", `<span class="add-popup-date-btn-text"></span>${ICON_CHEVRON_DOWN}`)
    );
    timeBtn.type = "button";
    const timeText = timeBtn.querySelector(".add-popup-date-btn-text");

    const options = field.appendChild(el("div", "add-popup-time-options"));
    options.hidden = true;
    const setOpen = (open) => {
      if (options.hidden === !open) return;
      // Closed with Custom chosen but nothing typed: back to the time actually
      // set.
      if (!open) sync();
      resizeAround(() => {
        options.hidden = !open;
        timeBtn.classList.toggle("add-popup-date-btn--open", open);
      });
    };
    timeBtn.addEventListener("click", () => setOpen(options.hidden));

    const presetBtns = presets.map((preset) => {
      const option = options.appendChild(el("button", "add-popup-time-option"));
      option.type = "button";
      option.textContent = preset.label;
      option.addEventListener("click", () => {
        dueTime = preset.value;
        sync();
        setOpen(false);
      });
      return option;
    });

    const custom = options.appendChild(el("label", "add-popup-time-option add-popup-time-option--custom"));
    custom.appendChild(el("span")).textContent = "Custom";
    const customInput = custom.appendChild(el("input", "add-popup-time-input"));
    customInput.type = "time";
    // Highlighted before a time is typed, with the field ready to type into.
    const chooseCustom = () => {
      presetBtns.forEach((option) => option.classList.remove("add-popup-time-option--selected"));
      custom.classList.add("add-popup-time-option--selected");
    };
    custom.addEventListener("focusin", chooseCustom);
    custom.addEventListener("click", () => {
      chooseCustom();
      customInput.focus();
    });
    customInput.addEventListener("input", () => {
      if (!customInput.value) return;
      dueTime = customInput.value;
      sync();
    });
    // Losing focus stops the field showing the part being typed into.
    customInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && customInput.value) {
        customInput.blur();
        setOpen(false);
      } else if (/^[ap]$/i.test(event.key) && customInput.value) {
        setTimeout(() => customInput.blur(), 0);
      }
    });

    function sync() {
      presetBtns.forEach((option, index) => (option.hidden = !presets[index].applies()));
      timeText.innerHTML = "";
      timeText.appendChild(el("span", "add-popup-date-label")).textContent = describe();
      const isPreset = presets.some((preset) => preset.value === dueTime);
      presetBtns.forEach((option, index) =>
        option.classList.toggle("add-popup-time-option--selected", presets[index].value === dueTime)
      );
      custom.classList.toggle("add-popup-time-option--selected", !isPreset);
      if (!isPreset) customInput.value = dueTime;
    }
    // A new date can remove options; a removed choice falls back to the start
    // of the day.
    field.syncToDate = () => {
      const chosen = presets.find((preset) => preset.value === dueTime);
      if (chosen && !chosen.applies()) dueTime = "start";
      sync();
    };
    field.syncToDate();
    return field;
  }

  function resizeAround(change) {
    const from = popup.offsetHeight;
    change();
    const to = popup.offsetHeight;
    if (from !== to) {
      popup.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ADD_POPUP_STEP_MS, easing: "ease" });
    }
  }

  function showStep(next, direction) {
    const current = popup.querySelector(".add-popup-step:not(.add-popup-step--leaving)");
    if (!current) {
      popup.appendChild(next);
      // Opening straight onto the details (the course already known, as from
      // a Courses view cell) is ready to type into too.
      if (next._focusTarget) next._focusTarget.focus({ preventScroll: true });
      return;
    }
    resizeAround(() => {
      current.classList.add("add-popup-step--leaving");
      popup.appendChild(next);
    });
    const shift = 24 * direction;
    current
      .animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: `translateX(${-shift}px)` },
        ],
        { duration: ADD_POPUP_STEP_MS * 0.7, easing: "ease", fill: "forwards" }
      )
      .finished.catch(() => {})
      .finally(() => current.remove());
    next.animate(
      [
        { opacity: 0, transform: `translateX(${shift}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: ADD_POPUP_STEP_MS, easing: "ease" }
    );
    if (next._focusTarget) next._focusTarget.focus({ preventScroll: true });
  }

  function openPopup(type) {
    if (addableCourseOptions().length === 0 && loadPeriods().every((name) => !(name || "").trim())) {
      showToast("Add a course to My Courses first.");
      return;
    }
    selectedType = type;
    selectedCourse = null;
    selectedDate = null;
    title = "";
    dueTime = "start";

    // The row already says which course, unless that course can't be added yet
    // (no division picked).
    const knownCourse = presetCourse && addableCourseOptions().find((option) => option.displayName === presetCourse);
    if (knownCourse) {
      selectedCourse = knownCourse;
      selectedDate = presetDate;
      if (!isAssignment()) {
        submit();
        return;
      }
    }

    popup = el("div", "add-popup");
    syncSelectedDay();
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Add to calendar");
    document.body.appendChild(popup);
    if (anchorPoint) {
      // Kept on screen, with room below for its steps.
      const left = Math.max(16, Math.min(anchorPoint.x, window.innerWidth - popup.offsetWidth - 16));
      const top = Math.max(16, Math.min(anchorPoint.y, window.innerHeight - ADD_POPUP_MIN_ROOM_PX));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
      growFromPoint(popup, left, top);
      // Opened over the calendar itself, so it's glass, like the tooltips.
      popup.classList.add("calendar-glass");
    } else {
      const rect = triggerBtn.getBoundingClientRect();
      const top = rect.bottom + 8;
      popup.style.top = `${top}px`;
      popup.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
    }

    const first = knownCourse ? buildDetailsStep() : buildPickStep();
    showStep(first, 1);
    void popup.offsetWidth;  // so the entrance transitions
    popup.classList.add("add-popup--visible");
  }

  // Clicking the dim area or pressing Escape leaves without picking.
  let datePick = null; // { overlay, box, onClick } while picking

  // activeEl stays looking hovered while picking. onEnd runs either way, before
  // onPick.
  function startDatePick(onPick, { cursor, activeEl, onEnd } = {}) {
    const box = document.querySelector(".my-courses-calendar-box");
    if (!box || datePick) return;
    const overlay = el("div", "calendar-pick-overlay");
    document.body.appendChild(overlay);
    box.style.setProperty("--chip-color", colorFor(selectedCourse));
    box.classList.add("my-courses-calendar-box--raised", "my-courses-calendar-box--picking");
    // Faded out so every day can be seen and clicked.
    if (popup) popup.classList.add("add-popup--picking");
    syncSelectedDay();

    // Capture phase, ahead of the pills' handlers, and stopped so the document
    // doesn't treat it as a click outside.
    // A month grid day, or in the Courses view any cell or date in a day's
    // column.
    const onClick = (event) => {
      const cell = event.target.closest(".assessment-week-day, .class-grid-cell, .class-grid-head");
      if (!cell) return;
      event.stopPropagation();
      endDatePick();
      onPick(cell.dataset.iso);
    };
    box.addEventListener("click", onClick, true);
    // In the Courses view a date is a whole column, so the whole column is
    // outlined: its date and every course's cell under it.
    let pickColumn = null;
    const markColumn = (iso) => {
      if (iso === pickColumn) return;
      box.querySelectorAll(".class-grid-pick-col").forEach((node) =>
        node.classList.remove("class-grid-pick-col", "class-grid-pick-col--last")
      );
      pickColumn = iso;
      if (!iso) return;
      const nodes = box.querySelectorAll(`.class-grid-head[data-iso="${iso}"], .class-grid-cell[data-iso="${iso}"]`);
      nodes.forEach((node) => node.classList.add("class-grid-pick-col"));
      nodes[nodes.length - 1]?.classList.add("class-grid-pick-col--last");
    };
    const onHover = (event) => {
      const column = event.target.closest(".class-grid-cell, .class-grid-head");
      markColumn(column ? column.dataset.iso : null);
    };
    box.addEventListener("mouseover", onHover);
    box.addEventListener("mouseleave", onHover);
    overlay.addEventListener("click", (event) => {
      event.stopPropagation();
      endDatePick();
    });
    document.documentElement.dataset.suppressTooltips = "true";
    hideHoverTooltip();
    if (activeEl) activeEl.classList.add("add-popup-course--active");
    const removeTooltip = cursor ? showCursorTooltip("Select date", cursor.clientX, cursor.clientY) : null;
    datePick = { overlay, box, onClick, activeEl, removeTooltip, onEnd, onHover, markColumn };
    void overlay.offsetWidth;  // so the fade plays
    overlay.classList.add("calendar-pick-overlay--visible");
  }

  function endDatePick() {
    if (!datePick) return;
    const { overlay, box, onClick, activeEl, removeTooltip, onEnd, onHover, markColumn } = datePick;
    datePick = null;
    syncSelectedDay();
    if (onEnd) onEnd();
    // Lifted over the dim layer while it fades, so it isn't seen through it.
    const returning = popup;
    if (returning) returning.classList.replace("add-popup--picking", "add-popup--lifted");
    if (activeEl) activeEl.classList.remove("add-popup-course--active");
    if (removeTooltip) removeTooltip();
    delete document.documentElement.dataset.suppressTooltips;
    box.removeEventListener("click", onClick, true);
    box.removeEventListener("mouseover", onHover);
    box.removeEventListener("mouseleave", onHover);
    markColumn(null);
    box.classList.remove("my-courses-calendar-box--picking");
    overlay.classList.remove("calendar-pick-overlay--visible");
    // Above the dim layer until it has faded, or it would dim with it.
    setTimeout(() => {
      overlay.remove();
      if (returning) returning.classList.remove("add-popup--lifted");
      if (datePick) return;
      box.classList.remove("my-courses-calendar-box--raised");
    }, CALENDAR_PICK_FADE_MS);
  }

  function closePopup() {
    endDatePick();
    if (!popup) return;
    const closing = popup;
    popup = null;
    syncSelectedDay();
    closing.classList.remove("add-popup--visible");
    setTimeout(() => closing.remove(), 150);
  }

  function submit() {
    if (!canSubmit()) {
      if (isDuplicateSelection()) showToast("This is already on your calendar.");
      return;
    }
    const entry = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: selectedDate,
      courseName: selectedCourse.courseName,
      type: selectedType,
      createdAt: Date.now(),
    };
    if (isAssignment()) {
      entry.title = title.trim() || "Assignment";
      entry.dueTime = dueTime;
    }

    saveAddedAssessments([...loadAddedAssessments(), entry]);
    // Assignments are personal. A matching school-wide entry for another
    // section means the admin already has it.
    if (!isAssignment() && !matchingSchoolWideEntry()) {
      logSuggestedAssessment(entry.date, entry.courseName, entry.type);
    }

    closePopup();
    if (refreshAssessmentCalendar) refreshAssessmentCalendar(true, true);
  }

  const MENU_TYPES = ["Assignment", "Summative", "Formative", "Reassessment"];
  let menu = null;

  function closeMenu() {
    if (!menu) return;
    const closing = menu;
    menu = null;
    syncSelectedDay();
    closing.classList.remove("popup-menu--visible");
    setTimeout(() => closing.remove(), 150);
  }

  // Checked a moment later, so going from the menu to the popup doesn't flicker
  // the day off and on.
  function syncSelectedDay() {
    queueMicrotask(() => {
      const keptDate = !datePick && (!selectedDate || selectedDate === presetDate);
      const iso = (menu || popup) && keptDate && presetDate;
      document.querySelectorAll("#assessment-cal-weeks .assessment-week-day").forEach((cell) => {
        cell.classList.toggle("assessment-week-day--selected", cell.dataset.iso === iso);
      });
      document.querySelectorAll("#assessment-class-grid .class-grid-cell").forEach((cell) => {
        cell.classList.toggle("class-grid-cell--selected", Boolean(iso) && cell === presetCell);
      });
    });
  }

  function openMenu() {
    menu = el("div", "popup-menu");
    // Left over from the last popup, it would read as a different day picked
    // and keep this one from graying.
    selectedDate = null;
    syncSelectedDay();
    MENU_TYPES.forEach((type) => {
      const item = el("button", "popup-menu-item");
      item.type = "button";
      item.textContent = type;
      item.addEventListener("click", (event) => {
        // Otherwise the document handler would see a click outside the popup
        // it's about to open.
        event.stopPropagation();
        closeMenu();
        openPopup(type);
      });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    if (anchorPoint) {
      const left = Math.min(anchorPoint.x, window.innerWidth - menu.offsetWidth - 16);
      const top = Math.min(anchorPoint.y, window.innerHeight - menu.offsetHeight - 16);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      growFromPoint(menu, left, top);
      menu.classList.add("calendar-glass");
    } else {
      const rect = triggerBtn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.right = `${window.innerWidth - rect.right}px`;
    }
    void menu.offsetWidth;  // so the entrance transitions
    menu.classList.add("popup-menu--visible");
  }

  // Left to reach the document so an open account menu closes. The popup
  // rebuilds itself on click, so "inside" is judged by the event's path at the
  // time.
  triggerBtn.addEventListener("click", () => {
    if (menu) closeMenu();
    else if (popup) closePopup();
    else {
      presetDate = null;
      presetCell = null;
      presetCourse = null;
      anchorPoint = null;
      openMenu();
    }
  });

  // Cells are rebuilt each render, so this listens on the container.
  const calendarWeeks = document.getElementById("assessment-cal-weeks");
  const classGridEl = document.getElementById("assessment-class-grid");
  [calendarWeeks, classGridEl].filter(Boolean).forEach((grid) => {
    grid.addEventListener("click", (event) => {
      if (datePick) return;
      const cell = event.target.closest(".assessment-week-day, .class-grid-cell");
      if (!cell || event.target.closest(".assessment-chip")) return;
      // Clicking the same day again closes what it opened, like the + button.
      const sameDay = (menu || popup) && presetDate === cell.dataset.iso;
      if (menu) closeMenu();
      if (popup) closePopup();
      if (sameDay) return;
      presetDate = cell.dataset.iso;
      presetCell = cell;
      presetCourse = cell.dataset.course || null;
      anchorPoint = { x: event.clientX, y: event.clientY };
      openMenu();
      // So the document handler doesn't close the menu this click just opened.
      event.openedAddMenu = true;
    });
  });

  document.addEventListener("click", (event) => {
    const path = event.composedPath();
    if (path.includes(triggerBtn) || event.openedAddMenu) return;
    if (menu && !path.includes(menu)) closeMenu();
    if (popup && !path.includes(popup)) closePopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (menu) closeMenu();
    else if (datePick) endDatePick();
    else if (popup) closePopup();
  });
}

// Each part checks for its own markup, so this is a no-op on other pages.
let myCoursesRefreshCalendar = null;

// Admins can't touch students' data, so each student's app drops its own copy
// once an admin accepts it. Only an exact match its section can see counts (a
// suggested Summative may come back as In-Class or Testing Block). A checked-
// off copy passes its done state on. Only on confirmed data, never cache:
// saving pushes all of appData, and stale data would overwrite newer cloud
// data.
const SUMMATIVE_TYPES = ["Summative", "In-Class", "Testing Block"];

function dropAcceptedSuggestions() {
  loadAssessments(() => {
    if (!assessmentsFetchDone) return;
    const added = loadAddedAssessments();
    const periodIndexOf = new Map(myAssessmentMatchEntries().matchEntries.map((entry) => [entry.name, entry.periodIndex]));
    const sameKind = (mine, school) =>
      mine.type === school.type || (mine.type === "Summative" && SUMMATIVE_TYPES.includes(school.type));
    const replacedBy = new Map();
    added.forEach((mine) => {
      if (assessmentCategory(mine) === "assignment") return;
      const school = allAssessments.find(
        (entry) =>
          entry.date === mine.date &&
          entry.courseName === mine.courseName &&
          sameKind(mine, entry) &&
          isAssessmentVisibleForPeriod(entry, periodIndexOf.get(mine.courseName))
      );
      if (school) replacedBy.set(mine.id, school.id);
    });
    if (replacedBy.size === 0) return;

    const completed = loadCompletedTasks();
    const completedIds = new Set(completed.map((record) => (typeof record === "string" ? record : record.id)));
    const carried = completed
      .filter((record) => typeof record !== "string" && replacedBy.has(record.id))
      .map((record) => ({ id: replacedBy.get(record.id), completedAt: record.completedAt }))
      .filter((record) => !completedIds.has(record.id));
    if (carried.length > 0) appData.completedTasks = [...completed, ...carried];
    saveAddedAssessments(added.filter((entry) => !replacedBy.has(entry.id)));
    if (myCoursesRefreshCalendar) myCoursesRefreshCalendar(true, true);
  });
}

// Laid out like a school's assessment spreadsheet. Pills show what they are,
// not the course, since the row already names it.
const CLASS_GRID_DAY_PX = 123;

function classGridPill(entry, resolvedNames, onContextMenu, courseColors) {
  const pill = buildAssessmentPill(entry, resolvedNames, onContextMenu, courseColors);
  const category = assessmentCategory(entry);
  const label =
    category === "assignment"
      ? entry.title || "Assignment"
      : entry.type === "In-Class" || entry.type === "Testing Block"
        ? "Summative"
        : entry.type;
  const windowEl = pill.querySelector(".assessment-pill-name");
  const textEl = pill.querySelector(".assessment-pill-text");
  if (entry.type === "Testing Block") {
    // One line rather than "Summative" over "Testing block", shortened to fit
    // narrow cells.
    const lines = pill.querySelector(".assessment-chip-lines");
    if (lines) lines.replaceWith(windowEl);
    pill.classList.remove("assessment-chip--stacked");
    fitName(windowEl, textEl, "Testing Block", "Test Block");
    // Keeps its "Summative" tooltip, which the label alone doesn't say.
  } else {
    textEl.textContent = label;
    // Otherwise fitName would put the course name back on resize.
    windowEl._fitName = () => (textEl.textContent = label);
    // A tooltip would only repeat the label. Custom labels ("Quiz") keep
    // theirs.
    if (label === "Summative" || label === "Formative") pill._noTooltip = true;
  }
  const subtitle = pill.querySelector(".assessment-chip-subtitle");
  if (subtitle) subtitle.remove();
  // The row already gives the course. Assignments keep their ring, which shows
  // the check-off.
  if (category !== "assignment") pill.querySelector(".assessment-chip-dot").remove();
  return pill;
}

const CLASS_GRID_MIN_ROW_PX = 72;

// The course rows share the grid's height, at least 72px each. In whole
// pixels: an even 1fr split of a window-based height gives fractional rows,
// which left some of the 1px lines between them straddling two pixels and
// looking thinner than the rest. The few spare pixels go one each to the top
// rows.
function sizeClassGridRows(grid) {
  const count = grid._courseCount || 0;
  const headHeight = parseFloat(getComputedStyle(grid).getPropertyValue("--class-grid-head-h")) || 52;
  // One 1px row gap above each course row.
  const room = grid.clientHeight - headHeight - count;
  const base = Math.max(CLASS_GRID_MIN_ROW_PX, Math.floor(room / Math.max(count, 1)));
  const spare = base === CLASS_GRID_MIN_ROW_PX ? 0 : Math.max(0, room - base * count);
  const rows = Array.from({ length: count }, (_, index) => `${base + (index < spare ? 1 : 0)}px`);
  grid.style.gridTemplateRows = `var(--class-grid-head-h) ${rows.join(" ")}`;
}

function renderClassGrid(grid, entries, matchEntries, resolvedNames, courseColors, onContextMenu, animatePills) {
  const periods = loadPeriods();
  const courses = [];
  periods.forEach((name) => {
    const trimmed = (name || "").trim();
    if (trimmed && !courses.includes(trimmed)) courses.push(trimmed);
  });
  const courseOf = new Map(matchEntries.map((entry) => [entry.name, (periods[entry.periodIndex] || "").trim()]));
  const byCell = new Map();
  entries.forEach((entry) => {
    const key = `${courseOf.get(entry.courseName)}|${entry.date}`;
    (byCell.get(key) || byCell.set(key, []).get(key)).push(entry);
  });

  const thisWeekStart = startOfWeek(new Date());
  const firstWeekStart = startOfWeek(latestAugustFirst());
  const pastWeeks = Math.round((thisWeekStart - firstWeekStart) / (7 * 86400000));
  const days = [];
  for (let offset = -pastWeeks * 7; offset < ASSESSMENT_CALENDAR_WEEK_COUNT * 7; offset++) {
    days.push(new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() + offset));
  }
  const today = toISODate(new Date());

  const firstBuild = grid.childElementCount === 0;
  const scrollLeft = grid.scrollLeft;
  const scrollTop = grid.scrollTop;
  const pillsBefore = animatePills ? renderedPillsByDate(grid, CLASS_GRID_PILL_CELLS) : null;
  hideHoverTooltip();
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `var(--class-grid-course-w) repeat(${days.length}, ${CLASS_GRID_DAY_PX}px)`;
  grid._courseCount = courses.length;
  sizeClassGridRows(grid);
  if (!grid._rowSizer) {
    grid._rowSizer = new ResizeObserver(() => sizeClassGridRows(grid));
    grid._rowSizer.observe(grid);
  }

  // So the date row only needs the day numbers.
  const corner = grid.appendChild(document.createElement("div"));
  corner.className = "class-grid-corner";
  const cornerMonth = corner.appendChild(document.createElement("span"));
  cornerMonth.className = "class-grid-corner-month";
  const todayBtn = corner.appendChild(document.createElement("button"));
  todayBtn.type = "button";
  todayBtn.className = "class-grid-today-btn";
  todayBtn.innerHTML =
    '<svg class="class-grid-today-arrow class-grid-today-arrow--left" viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5L6.5 10l5.5 5.5" /></svg>' +
    "<span>Today</span>" +
    '<svg class="class-grid-today-arrow class-grid-today-arrow--right" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5l5.5 5.5L8 15.5" /></svg>';
  const todayLeft = (pastWeeks * 7 + new Date().getDay()) * CLASS_GRID_DAY_PX;
  const showCornerMonth = () => {
    const first = days[Math.min(days.length - 1, Math.max(0, Math.round(grid.scrollLeft / CLASS_GRID_DAY_PX)))];
    cornerMonth.textContent = CAL_MONTH_SHORT[first.getMonth()];
    // The course column covers part of the grid.
    const daysWidth = grid.clientWidth - corner.offsetWidth;
    const todayBehind = todayLeft + CLASS_GRID_DAY_PX <= grid.scrollLeft;
    const todayAhead = todayLeft >= grid.scrollLeft + daysWidth;
    todayBtn.classList.toggle("class-grid-today-btn--shown", todayBehind || todayAhead);
    // Kept while the button fades out, so the arrow doesn't flip mid-fade.
    if (todayBehind || todayAhead) todayBtn.classList.toggle("class-grid-today-btn--ahead", todayAhead);
  };
  grid._showCornerMonth = showCornerMonth;
  if (!grid._cornerMonthListener) {
    grid._cornerMonthListener = true;
    grid.addEventListener("scroll", () => grid._showCornerMonth && grid._showCornerMonth(), { passive: true });
  }
  // Its cells aren't inside the head, so the grid tracks the pointer's column
  // itself.
  const headsByIso = new Map();
  grid._headsByIso = headsByIso;
  if (!grid._hoverColumnListener) {
    grid._hoverColumnListener = true;
    let hovered = null;
    const setHovered = (head) => {
      if (head === hovered) return;
      if (hovered) hovered.classList.remove("class-grid-head--hover");
      hovered = head;
      if (hovered) hovered.classList.add("class-grid-head--hover");
    };
    grid.addEventListener("mouseover", (event) => {
      const column = event.target.closest(".class-grid-head, .class-grid-cell");
      setHovered(column ? grid._headsByIso.get(column.dataset.iso) || null : null);
    });
    grid.addEventListener("mouseleave", () => setHovered(null));
  }
  days.forEach((date) => {
    const head = grid.appendChild(document.createElement("div"));
    head.className = "class-grid-head";
    head.dataset.iso = toISODate(date);
    headsByIso.set(head.dataset.iso, head);
    if (date.getDay() === 0 || date.getDay() === 6) head.classList.add("class-grid-head--weekend");
    const weekday = head.appendChild(document.createElement("span"));
    weekday.className = "class-grid-head-weekday";
    weekday.textContent = CAL_WEEKDAY_LABELS[date.getDay()];
    const dateRow = head.appendChild(document.createElement("div"));
    dateRow.className = "class-grid-head-row";
    if (date.getDate() === 1) {
      const month = dateRow.appendChild(document.createElement("span"));
      month.className = "class-grid-head-month";
      month.textContent = CAL_MONTH_SHORT[date.getMonth()];
    }
    const dateEl = dateRow.appendChild(document.createElement("span"));
    dateEl.className = "class-grid-head-date";
    if (toISODate(date) === today) dateEl.classList.add("class-grid-head-date--today");
    dateEl.textContent = String(date.getDate());
    const dayType = allDayTypes[head.dataset.iso];
    if (dayType === "A" || dayType === "B") {
      const type = dateRow.appendChild(document.createElement("span"));
      type.className = "class-grid-head-type";
      type.textContent = dayType;
    }
  });

  const colors = courseColorAssignments();
  courses.forEach((course) => {
    const name = grid.appendChild(document.createElement("div"));
    name.className = "class-grid-course";
    if (colors.get(course)) name.style.setProperty("--chip-color", colors.get(course));
    const dot = name.appendChild(document.createElement("span"));
    dot.className = "class-grid-course-dot";
    const label = name.appendChild(document.createElement("span"));
    label.className = "class-grid-course-name";
    label.textContent = course;
    fitName(label, label, course, shortCourseName(course));

    days.forEach((date) => {
      const iso = toISODate(date);
      const cell = grid.appendChild(document.createElement("div"));
      cell.className = "class-grid-cell";
      if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("class-grid-cell--weekend");
      cell.dataset.iso = iso;
      cell.dataset.course = course;
      // So a busy day scrolls instead of stretching the row.
      const pills = cell.appendChild(document.createElement("div"));
      pills.className = "class-grid-cell-pills";
      // For when pills fill the cell and leave nowhere to click. Its click
      // reaches the grid's own handler.
      const add = cell.appendChild(document.createElement("button"));
      add.type = "button";
      add.className = "class-grid-cell-add";
      add.setAttribute("aria-label", "Add to calendar");
      add.hidden = true;
      add.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>';
      (byCell.get(`${course}|${iso}`) || []).forEach((entry) =>
        pills.appendChild(classGridPill(entry, resolvedNames, onContextMenu, courseColors))
      );
    });
  });

  // A rebuild keeps its place.
  grid.scrollLeft = firstBuild ? todayLeft : scrollLeft;
  todayBtn.addEventListener("click", () => grid.scrollTo({ left: todayLeft, behavior: "smooth" }));
  grid.scrollTop = firstBuild ? 0 : scrollTop;
  showCornerMonth();
  if (pillsBefore) animatePillChanges(grid, pillsBefore, CLASS_GRID_PILL_CELLS);
  updateClassCellAdds(grid);
  if (pillsBefore) setTimeout(() => updateClassCellAdds(grid), PILL_FADE_MS + PILL_MOVE_MS + 50);
  if (!grid._addResizeObserver && window.ResizeObserver) {
    grid._addResizeObserver = new ResizeObserver(() => updateClassCellAdds(grid));
    grid._addResizeObserver.observe(grid);
  }
}

const CLASS_CELL_MIN_FREE_PX = 20;

// Measured with the + hidden, since showing it shortens the list and would sway
// the next check.
function updateClassCellAdd(cell) {
  const list = cell.querySelector(".class-grid-cell-pills");
  const add = cell.querySelector(".class-grid-cell-add");
  if (!list || !add) return;
  const last = list.lastElementChild;
  if (!last) {
    add.hidden = true;
    return;
  }
  add.hidden = true;
  const paddingBottom = parseFloat(getComputedStyle(list).paddingBottom) || 0;
  const used = last.offsetTop - list.offsetTop + last.offsetHeight;
  add.hidden = list.clientHeight - paddingBottom - used >= CLASS_CELL_MIN_FREE_PX;
}

function updateClassCellAdds(grid) {
  grid.querySelectorAll(".class-grid-cell").forEach(updateClassCellAdd);
}

// Saved as a synced preference so the page opens on whichever view was used
// last.
let calendarViewMode = window.getPreferences().calendarView === "byClass" ? "byClass" : "calendar";

function initCalendarViewToggle() {
  const container = document.getElementById("calendar-view-toggle");
  if (!container) return;
  const thumb = document.createElement("span");
  thumb.className = "segmented-thumb";
  container.insertBefore(thumb, container.firstChild);
  const options = container.querySelectorAll(".segmented-option");
  const markActive = () =>
    options.forEach((btn) => btn.classList.toggle("segmented-option--active", btn.dataset.value === calendarViewMode));
  markActive();
  const placeThumb = (animate) => {
    const active = container.querySelector(".segmented-option--active");
    if (!active) return;
    if (!animate) thumb.style.transition = "none";
    // offsetLeft/Width round to whole pixels, and the uneven split left the rim
    // beside the thumb wider.
    const optionRect = active.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    thumb.style.left = `${optionRect.left - containerRect.left - container.clientLeft}px`;
    thumb.style.width = `${optionRect.width}px`;
    if (!animate) {
      void thumb.offsetWidth;  // so the "none" transition applies first
      thumb.style.transition = "";
    }
  };
  options.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("segmented-option--active")) return;
      calendarViewMode = btn.dataset.value;
      markActive();
      placeThumb(true);
      window.setPreference("calendarView", calendarViewMode);
      if (myCoursesRefreshCalendar) myCoursesRefreshCalendar(false);
    });
  });
  placeThumb(false);
  window.addEventListener("app:preferences-changed", () => {
    const saved = window.getPreferences().calendarView === "byClass" ? "byClass" : "calendar";
    if (saved === calendarViewMode) return;
    calendarViewMode = saved;
    markActive();
    placeThumb(true);
    if (myCoursesRefreshCalendar) myCoursesRefreshCalendar(false);
  });
  if (document.fonts) document.fonts.ready.then(() => placeThumb(false));
  if (window.ResizeObserver) new ResizeObserver(() => placeThumb(false)).observe(container);
}

function initMyCoursesPage() {
  myCoursesRefreshCalendar = initAssessmentCalendar();
  initAddToCalendarPopup(myCoursesRefreshCalendar);
  initCalendarViewToggle();
  // The Calendar is empty without courses, so it opens My Courses to fill them
  // in.
  if (myCoursesRefreshCalendar && loadPeriods().every((name) => !(name || "").trim())) {
    openMyCoursesModal();
  }
}
