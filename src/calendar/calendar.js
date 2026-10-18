/* global attachHoverTooltip, hideHoverTooltip, showCursorTooltip, showToast, hideToast, animateNumberChange, uiIconPath, loadPeriods, loadAddedAssessments, saveAddedAssessments, saveCompletedTasks,
   assessmentsLoaded, dayTypesLoaded, assessmentsForCourses, assessmentStillUpcoming, assessmentEndsAt, loadAssessmentData */

// The Calendar's month grid and Upcoming list, and the render that keeps them
// (and the Courses view) in step with the user's courses and the school
// calendar. Carried over from my-courses.js's initAssessmentCalendar
// unchanged, but for what React does now: the side panel's course colors,
// filters and view toggle, which it's handed as hooks:
//   showColorLegend(colorNames): draw the Course Colors list
//   hiddenCategories: the Set of categories the filters hide
//   viewMode(): "calendar" | "byClass"

import { shortCourseName } from "../core/catalog.js";
import { toISODate, todayISODate } from "../core/dates.js";
import { ASSESSMENT_CALENDAR_WEEK_COUNT, renderClassGrid } from "./classGrid.js";
import {
  completedTaskRecords,
  courseColorAssignments,
  courseColorNames,
  myAssessmentMatchEntries,
  unlogSuggestedAssessment,
  upcomingDateLabel,
  upcomingDueAt,
  upcomingSortTime,
} from "./data.js";
import { ICON_CHEVRON_DOWN } from "./icons.js";
import { CAL_WEEKDAY_LABELS, assessmentCategory, latestAugustFirst, startOfWeek, stripDivisionSuffix, upcomingTimeLabel, upcomingTitle } from "./model.js";
import { animatePillChanges, buildDayCell, fitName, pillListGap, renderedPillsByDate } from "./pills.js";

const CALENDAR_SCROLL_SETTLE_MS = 150;

const ASSESSMENT_CALENDAR_WEEKDAYS_PER_WEEK = 7;

const UPCOMING_LIMIT = 10;
const UPCOMING_DONE_HOLD_MS = 600;
const UPCOMING_SCROLLBAR_MIN_PX = 10;
const UPCOMING_FADE_MS = 150;
const UPCOMING_SLIDE_MS = 260;

const COMPLETED_SHOWN_DAYS = 14;

const UPCOMING_COUNTDOWN_MS = 12 * 60 * 60 * 1000;

// Returns render so other code (a period being typed) can refresh it; null
// without the calendar markup.
export function createAssessmentCalendar({ showColorLegend, hiddenCategories, viewMode }) {
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
    showColorLegend(colorNames);

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
      if (viewMode() === "byClass") {
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

  // Course colors are synced preferences, so a pick on another device arrives
  // here too.
  window.addEventListener("app:preferences-changed", () => render());

  loadAssessmentData(() => render());

  return render;
}
