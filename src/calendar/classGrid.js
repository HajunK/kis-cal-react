// The Courses view: a row per course, a column per day, laid out like a
// school's assessment spreadsheet. Carried over from my-courses.js unchanged
// (only its helpers now come from model.js, data.js and pills.js).

import { shortCourseName } from "../core/catalog.js";
import { toISODate } from "../core/dates.js";
import { courseColorAssignments } from "./data.js";
import { CAL_WEEKDAY_LABELS, assessmentCategory, latestAugustFirst, startOfWeek } from "./model.js";
import { CAL_MONTH_SHORT, CLASS_GRID_PILL_CELLS, PILL_FADE_MS, PILL_MOVE_MS, animatePillChanges, buildAssessmentPill, fitName, renderedPillsByDate } from "./pills.js";
import { loadCompletedTasks, loadPeriods } from "../shell/data.js";
import { allDayTypes } from "../shell/school.js";
import { hideHoverTooltip } from "../shell/ui.js";

// How many weeks past this one the calendars run.
export const ASSESSMENT_CALENDAR_WEEK_COUNT = 4;

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

// A day's cell, empty, cloned for each course and day: far quicker than
// building hundreds of them (and parsing the + icon) one by one.
function classCellTemplate() {
  const cell = document.createElement("div");
  cell.className = "class-grid-cell";
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
  return cell;
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

export function renderClassGrid(grid, entries, matchEntries, resolvedNames, courseColors, onContextMenu, animatePills) {
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
  // Everything the grid is drawn from. When none of it changed (switching
  // back from the Calendar view, say), the grid already shows it, so it's only
  // refitted rather than rebuilt.
  const signature = JSON.stringify([
    entries,
    matchEntries,
    [...resolvedNames],
    [...courseColors],
    [...courseColorAssignments()],
    periods,
    today,
    allDayTypes,
    loadCompletedTasks(),
  ]);
  if (!firstBuild && grid._signature === signature) {
    sizeClassGridRows(grid);
    grid._showCornerMonth();
    updateClassCellAdds(grid);
    return;
  }
  grid._signature = signature;
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
  const isoDays = days.map(toISODate);
  const cellTemplate = classCellTemplate();
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
    // The Course Colors list is hidden in this view, so the row recolors its
    // course (the page draws the picker).
    name.addEventListener("click", () =>
      window.dispatchEvent(new CustomEvent("app:course-color-pick", { detail: { anchor: name, name: course } }))
    );

    days.forEach((date, dayIndex) => {
      const iso = isoDays[dayIndex];
      const cell = grid.appendChild(cellTemplate.cloneNode(true));
      if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("class-grid-cell--weekend");
      cell.dataset.iso = iso;
      cell.dataset.course = course;
      const pills = cell.firstChild;
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
// Every + is hidden first, then every cell measured, then the +s set: one
// layout for the whole grid, rather than one per cell.
function updateClassCellAdds(grid) {
  const filled = [];
  grid.querySelectorAll(".class-grid-cell").forEach((cell) => {
    const list = cell.querySelector(".class-grid-cell-pills");
    const add = cell.querySelector(".class-grid-cell-add");
    if (!list || !add) return;
    add.hidden = true;
    if (list.lastElementChild) filled.push({ list, add });
  });
  filled.forEach((cell) => {
    const { list } = cell;
    const last = list.lastElementChild;
    const paddingBottom = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    const used = last.offsetTop - list.offsetTop + last.offsetHeight;
    cell.roomy = list.clientHeight - paddingBottom - used >= CLASS_CELL_MIN_FREE_PX;
  });
  filled.forEach(({ add, roomy }) => (add.hidden = roomy));
}
