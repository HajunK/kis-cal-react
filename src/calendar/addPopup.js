// Adding to the Calendar: the + button's and a day's type menu, the Add popup
// and its steps, and picking a date straight off the calendar. Carried over
// from my-courses.js unchanged (only its helpers now come from model.js,
// data.js and pills.js).

import { shortCourseName } from "../core/catalog.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { addableCourseOptions, courseColorNames, logSuggestedAssessment, upcomingClassDays } from "./data.js";
import { ICON_BACK, ICON_CHEVRON, ICON_CHEVRON_DOWN } from "./icons.js";
import { formatClockTime } from "./model.js";
import { attachHoverMarquee } from "./pills.js";
import { currentUid, loadAddedAssessments, loadPeriods, saveAddedAssessments } from "../shell/data.js";
import { formatPreferredDate } from "../shell/preferences.js";
import { allAssessments, allDayTypes, isAssessmentVisibleForPeriod, scheduledTimeOn, scheduleForDate } from "../shell/school.js";
import { CLOSE_POPUPS_EVENT, attachHoverTooltip, hideHoverTooltip, runAfterPaint, showCursorTooltip, showToast, uiIconPath } from "../shell/ui.js";

const ADD_POPUP_TYPES = [
  { value: "Assignment", noun: "assignment" },
  { value: "Formative", noun: "formative" },
  { value: "Summative", noun: "summative" },
  { value: "Reassessment", noun: "reassessment" },
];
const CAL_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ADD_POPUP_STEP_MS = 220;
const CALENDAR_PICK_FADE_MS = 200;

export function initAddToCalendarPopup(refreshAssessmentCalendar, signal) {
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
  // Set while the popup is open: it started on the details screen with the
  // row's course already chosen, so there's no course screen to go back to.
  let startedOnDetails = false;
  let anchorPoint = null;
  // Where the type menu sat; the popup opens there, so the cursor barely moves.
  let menuSpot = null;
  // Where the popup first sat, which it slides back to when it has room again.
  let homeTop = null;

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
    step.appendChild(el("p", "add-popup-prompt")).textContent = "Select course";
    const options = addableCourseOptions();
    if (options.length === 0) {
      step.appendChild(el("p", "add-popup-hint")).textContent =
        "Pick a division for your courses in My Courses first.";
      return step;
    }
    const list = el("div", "add-popup-courses");
    // Opened from a calendar day, an assessment is saved as soon as its course
    // is picked: no next screen, so no arrow pointing to one.
    const savesAtOnce = !isAssignment() && Boolean(presetDate);
    options.forEach((option) => {
      const row = el("button", "add-popup-course");
      row.type = "button";
      row.style.setProperty("--chip-color", colorFor(option));
      row.appendChild(el("span", "add-popup-course-dot"));
      const nameWindow = row.appendChild(el("span", "add-popup-course-name"));
      attachHoverMarquee(row, nameWindow, option.displayName, shortCourseName(option.displayName));
      if (!savesAtOnce) row.appendChild(el("span", "add-popup-course-chevron", ICON_CHEVRON));
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
        back: startedOnDetails
          ? null
          : () => {
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
        formatPreferredDate(date) + (dayType === "A" || dayType === "B" ? ` (${dayType}-day)` : "");
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
    // When the day's first event starts (usually Advisory or the Testing Block), or
    // null when the day has no schedule.
    const firstEventStart = () => {
      const events = selectedDate ? scheduleForDate(selectedDate) : [];
      return events.length > 0 ? events[0].start : null;
    };
    // When the day's last event ends, or null when the day has no schedule.
    const lastEventEnd = () => {
      const events = selectedDate ? scheduleForDate(selectedDate) : [];
      return events.length > 0 ? events.reduce((latest, event) => (event.end > latest ? event.end : latest), "") : null;
    };
    // When this course's class starts that day, or null if it isn't known.
    const classStart = () => {
      const event = selectedDate ? scheduledTimeOn(selectedDate, `period${period}`) : null;
      return event ? event.start : null;
    };
    const nightBeforeHint = () => {
      const before = fromISODate(selectedDate);
      before.setDate(before.getDate() - 1);
      return `${before.toLocaleDateString("en-US", { weekday: "short" })}, 11:59 PM`;
    };
    // Picked, the school's start and end follow the date: a new date moves them to
    // that day's first start or last end. label is what the option is called (and what the button shows);
    // hint is the time it means, in gray at the right of the row.
    let followsSchedule = null;
    const presets = [
      { value: "start", label: "Night before", hint: nightBeforeHint, applies: () => true },
      {
        // The time itself, which changes with the date.
        get value() {
          return firstEventStart();
        },
        label: "School starts",
        hint: () => (firstEventStart() ? formatClockTime(firstEventStart()) : ""),
        applies: () => firstEventStart() !== null,
        follows: firstEventStart,
      },
      {
        value: "period",
        label: "Class starts",
        hint: () => (classStart() ? `P${period}, ${formatClockTime(classStart())}` : `P${period}`),
        applies: periodKnown,
      },
      {
        get value() {
          return lastEventEnd();
        },
        label: "School ends",
        hint: () => (lastEventEnd() ? formatClockTime(lastEventEnd()) : ""),
        applies: () => lastEventEnd() !== null,
        follows: lastEventEnd,
      },
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
      }, true);
    };
    timeBtn.addEventListener("click", () => setOpen(options.hidden));

    const presetBtns = presets.map((preset) => {
      const option = options.appendChild(el("button", "add-popup-time-option"));
      option.type = "button";
      option.appendChild(el("span")).textContent = preset.label;
      option.appendChild(el("span", "add-popup-time-option-hint"));
      option.addEventListener("click", () => {
        dueTime = preset.value;
        followsSchedule = preset.follows || null;
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
      followsSchedule = null;
      // The class's own start time is that option, as the school's are.
      if (periodKnown() && dueTime === classStart()) dueTime = "period";
      sync();
    });
    // Losing focus stops the field showing the part being typed into.
    customInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && customInput.value) {
        customInput.blur();
        setOpen(false);
      } else if (/^[ap]$/i.test(event.key)) {
        // Typing AM/PM ends the time; the value only completes once the key lands.
        setTimeout(() => {
          if (customInput.value) customInput.blur();
        }, 0);
      }
    });

    function sync() {
      presetBtns.forEach((option, index) => {
        option.hidden = !presets[index].applies();
        // The times depend on the date.
        option.querySelector(".add-popup-time-option-hint").textContent = presets[index].hint();
      });
      timeText.innerHTML = "";
      timeText.appendChild(el("span", "add-popup-date-label")).textContent = describe();
      const isPreset = presets.some((preset) => preset.value === dueTime);
      presetBtns.forEach((option, index) =>
        option.classList.toggle("add-popup-time-option--selected", presets[index].value === dueTime)
      );
      custom.classList.toggle("add-popup-time-option--selected", !isPreset);
      if (!isPreset) customInput.value = dueTime;
    }
    // A new date can remove options; a removed choice falls back to the night
    // before.
    field.syncToDate = () => {
      if (followsSchedule) {
        const start = followsSchedule();
        if (start) dueTime = start;
        else {
          dueTime = "start";
          followsSchedule = null;
        }
      }
      const chosen = presets.find((preset) => preset.value === dueTime);
      if (chosen && !chosen.applies()) dueTime = "start";
      sync();
    };
    field.syncToDate();
    return field;
  }

  // Grows or shrinks the popup around a change. With `slide`, it also moves up
  // when the new height would run past the bottom of the screen, and back down
  // once it fits.
  function resizeAround(change, slide = false) {
    const from = popup.offsetHeight;
    const fromTop = parseFloat(popup.style.top);
    const fromMax = popup.style.maxHeight;
    if (homeTop === null) homeTop = fromTop;
    change();
    let top = fromTop;
    if (slide) {
      popup.style.maxHeight = "none";
      top = Math.max(16, Math.min(homeTop, window.innerHeight - 16 - popup.offsetHeight));
      popup.style.top = `${top}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
    }
    const to = popup.offsetHeight;
    if (from !== to || fromTop !== top) {
      popup.animate(
        [
          // The max height travels too: jumping to its end value would clamp the
          // height mid-slide and stall the edge.
          { height: `${from}px`, top: `${fromTop}px`, maxHeight: fromMax },
          { height: `${to}px`, top: `${top}px`, maxHeight: popup.style.maxHeight },
        ],
        { duration: ADD_POPUP_STEP_MS, easing: "ease" }
      );
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
    }, true);
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
    homeTop = null;
    syncSelectedDay();
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Add to calendar");
    document.body.appendChild(popup);
    if (anchorPoint) {
      // At the type menu's corner if it was used, kept on screen.
      const spot = menuSpot || anchorPoint;
      menuSpot = null;
      const left = Math.max(16, Math.min(spot.left ?? spot.x, window.innerWidth - popup.offsetWidth - 16));
      const top = Math.max(16, spot.top ?? spot.y);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
      // Opened over the calendar itself, so it's glass, like the tooltips.
      popup.classList.add("calendar-glass");
    } else {
      const rect = triggerBtn.getBoundingClientRect();
      const top = rect.bottom + 8;
      popup.style.top = `${top}px`;
      popup.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
    }

    startedOnDetails = Boolean(knownCourse);
    const first = knownCourse ? buildDetailsStep() : buildPickStep();
    showStep(first, 1);
    if (anchorPoint) {
      // Moved up only as far as its first screen needs to fit.
      popup.style.maxHeight = "none";
      const left = parseFloat(popup.style.left);
      const top = Math.max(16, Math.min(parseFloat(popup.style.top), window.innerHeight - 16 - popup.offsetHeight));
      popup.style.top = `${top}px`;
      popup.style.maxHeight = `${window.innerHeight - top - 16}px`;
      growFromPoint(popup, left, top);
    }
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
    const suggest = !isAssignment() && !matchingSchoolWideEntry();

    closePopup();
    if (refreshAssessmentCalendar) refreshAssessmentCalendar(true, true);
    // Told to the cloud once the calendar has started drawing the new entry.
    if (suggest) runAfterPaint(() => logSuggestedAssessment(entry.date, entry.courseName, entry.type));
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
    menu = el("div", "popup-menu popup-menu--types");
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
      menuSpot = { left, top };
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

  document.addEventListener(
    "click",
    (event) => {
      const path = event.composedPath();
      if (path.includes(triggerBtn) || event.openedAddMenu) return;
      if (menu && !path.includes(menu)) closeMenu();
      if (popup && !path.includes(popup)) closePopup();
    },
    { signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (menu) closeMenu();
      else if (datePick) endDatePick();
      else if (popup) closePopup();
    },
    { signal }
  );
  // Another popup (a pill's details) asks for the way to be cleared.
  window.addEventListener(
    CLOSE_POPUPS_EVENT,
    () => {
      if (menu) closeMenu();
      if (popup) closePopup();
    },
    { signal }
  );
  // Leaving the tab takes whatever's open with it.
  signal.addEventListener("abort", () => {
    if (datePick) endDatePick();
    if (menu) menu.remove();
    if (popup) popup.remove();
  });
}
