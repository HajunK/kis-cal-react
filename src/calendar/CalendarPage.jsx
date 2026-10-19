/* global attachHoverTooltip, hideHoverTooltip, loadPeriods, openMyCoursesModal */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { shortCourseName } from "../core/catalog.js";
import { initAddToCalendarPopup } from "./addPopup.js";
import { createAssessmentCalendar } from "./calendar.js";
import { COURSE_COLOR_CHOICES } from "./model.js";
import { fitName } from "./pills.js";

const FILTERS = [
  { category: "summative", label: "Summatives", look: "calendar-filter--filled" },
  { category: "reassessment", label: "Reassessments", look: "calendar-filter--filled" },
  { category: "formative", label: "Formatives", look: "calendar-filter--dashed" },
  { category: "assignment", label: "Assignments", look: "" },
];
// Matches .course-color-picker's fade.
const COLOR_PICKER_EXIT_MS = 180;

const savedViewMode = () => (window.getPreferences().calendarView === "byClass" ? "byClass" : "calendar");

// The Calendar tab: the assessment calendar (a month grid, or a row per
// course), the Upcoming list beside it, and the side panel's view toggle,
// filters and course colors. React draws the page and the side panel; the
// grids, the Upcoming list and adding to the calendar are calendar.js,
// classGrid.js and addPopup.js, which keep their own motion and are started
// here once the page is up (see main.jsx).
export function CalendarPage() {
  // Not saved, so every visit starts with everything shown.
  const hiddenCategoriesRef = useRef(new Set());
  const [hiddenCategories, setHiddenCategories] = useState(() => new Set());
  // Saved as a synced preference so the page opens on whichever view was
  // used last.
  const viewModeRef = useRef(savedViewMode());
  const [viewMode, setViewMode] = useState(viewModeRef.current);
  // The Course Colors list as last drawn (each render of the calendar draws it
  // afresh); null until the first.
  const [legend, setLegend] = useState(null);
  const calendarRef = useRef(null);
  const viewToggleRef = useRef(null);

  useLayoutEffect(() => {
    const render = createAssessmentCalendar({
      showColorLegend: (colorNames) => setLegend((last) => ({ generation: (last ? last.generation : 0) + 1, colorNames })),
      hiddenCategories: hiddenCategoriesRef.current,
      viewMode: () => viewModeRef.current,
    });
    calendarRef.current = render;
    window.myCoursesRefreshCalendar = render;
    initAddToCalendarPopup(render);
    viewToggleRef.current.start((mode) => {
      viewModeRef.current = mode;
      flushSync(() => setViewMode(mode));
    });
    // The Calendar is empty without courses, so it opens My Courses to fill
    // them in.
    if (render && loadPeriods().every((name) => !(name || "").trim())) openMyCoursesModal();
  }, []);

  const toggleFilter = (category) => {
    const hidden = hiddenCategoriesRef.current;
    if (hidden.has(category)) hidden.delete(category);
    else hidden.add(category);
    flushSync(() => setHiddenCategories(new Set(hidden)));
    calendarRef.current();
  };

  const pickView = (mode) => {
    viewModeRef.current = mode;
    flushSync(() => setViewMode(mode));
    viewToggleRef.current.place(true);
    if (window.myCoursesRefreshCalendar) window.myCoursesRefreshCalendar(false);
    window.setPreference("calendarView", mode);
  };

  return (
    // Hidden until a period has a course: nothing to show a calendar for
    // otherwise. calendar.js shows and hides it.
    <div className="my-courses-calendar" id="my-courses-calendar-card" hidden>
      <div className="my-courses-calendar-box">
        {/* Shown until the assessments collection actually loads, rather
            than an empty grid first. */}
        <div className="assessment-calendar-loading" id="assessment-cal-loading">
          <span className="assessment-calendar-spinner" />
        </div>
        <div className="assessment-calendar-weeks" id="assessment-cal-weeks" hidden />
        {/* The Courses view: a row per course, a column per day. */}
        <div className="class-grid" id="assessment-class-grid" hidden />
      </div>
      <div className="calendar-side">
        <section className="calendar-side-card todo-card">
          <div className="todo-card-header">
            <h2 className="todo-card-title">Upcoming</h2>
            <button type="button" className="todo-add-btn" id="add-assessment-trigger-btn" aria-label="Add to calendar">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 3.5v13M3.5 10h13" />
              </svg>
            </button>
          </div>
          <ul className="upcoming-list" id="upcoming-list" />
          {/* A blurred copy of the list, shown where it scrolls up under the
              header; see .upcoming-blur in calendar.css. inert, so its copied
              buttons can't be tabbed to or clicked. */}
          <div className="upcoming-blur" aria-hidden="true" inert />
        </section>
        <div className="calendar-side-divider" />
        <section className="calendar-side-card calendar-legend-card">
          <div className="calendar-legend-column">
            <span className="calendar-legend-label">View</span>
            <ViewToggle handleRef={viewToggleRef} mode={viewMode} onPick={pickView} />
            <span className="calendar-legend-label">Filters</span>
            <div className="calendar-filter-list" id="calendar-filter-list">
              {FILTERS.map(({ category, label, look }) => {
                const off = hiddenCategories.has(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`calendar-filter${look ? ` ${look}` : ""}${off ? " calendar-filter--off" : ""}`}
                    data-category={category}
                    aria-pressed={String(!off)}
                    onClick={() => toggleFilter(category)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="calendar-legend-column">
            <span className="calendar-legend-label">Course Colors</span>
            <CourseColors legend={legend} />
          </div>
        </section>
      </div>
    </div>
  );
}

// Calendar or Courses, with a thumb that slides between them. Not placed until
// start(), once the calendar has drawn (and shown) itself, as it measures.
// handleRef gets { start(onSavedChange), place(animate) }.
function ViewToggle({ handleRef, mode, onPick }) {
  const containerRef = useRef(null);
  const thumbRef = useRef(null);
  const optionRefs = useRef({});
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // offsetLeft/Width round to whole pixels, and the uneven split left the rim
  // beside the thumb wider.
  const place = (animate) => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    const active = optionRefs.current[modeRef.current];
    if (!active) return;
    if (!animate) thumb.style.transition = "none";
    const optionRect = active.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    thumb.style.left = `${optionRect.left - containerRect.left - container.clientLeft}px`;
    thumb.style.width = `${optionRect.width}px`;
    if (!animate) {
      void thumb.offsetWidth;  // so the "none" transition applies first
      thumb.style.transition = "";
    }
  };

  handleRef.current = {
    place,
    // onSavedChange(mode): the preference changed elsewhere (another tab or
    // device), after which the thumb slides and the calendar redraws.
    start(onSavedChange) {
      place(false);
      window.addEventListener("app:preferences-changed", () => {
        const saved = savedViewMode();
        if (saved === modeRef.current) return;
        onSavedChange(saved);
        place(true);
        if (window.myCoursesRefreshCalendar) window.myCoursesRefreshCalendar(false);
      });
      if (document.fonts) document.fonts.ready.then(() => place(false));
      if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(containerRef.current);
    },
  };

  return (
    <div className="segmented-control calendar-view-toggle" id="calendar-view-toggle" ref={containerRef}>
      <span className="segmented-thumb" ref={thumbRef} />
      {[
        ["calendar", "Calendar"],
        ["byClass", "Courses"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`segmented-option${value === mode ? " segmented-option--active" : ""}`}
          data-value={value}
          ref={(el) => (optionRefs.current[value] = el)}
          // A mouse switches as the button goes down, not when it comes back
          // up. Touch waits for the tap (a press may start a scroll), and
          // the keyboard's Enter or Space arrives as a click.
          onPointerDown={(event) => {
            if (event.pointerType !== "touch" && event.button === 0 && value !== modeRef.current) onPick(value);
          }}
          onClick={() => {
            if (value !== modeRef.current) onPick(value);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The Course Colors list: each course's dot and name (shortened when it
// doesn't fit), opening a picker for its color. Drawn afresh with each
// calendar render (keyed by its generation), as it always was.
function CourseColors({ legend }) {
  const [pickers, setPickers] = useState([]); // { id, anchor, name, color, open }
  // The open one, kept current as it changes (not as React next draws), since
  // the click that opens one also reaches the document's outside-click check.
  const openRef = useRef(null);

  const closePicker = () => {
    if (!openRef.current) return;
    openRef.current = null;
    // Its swatch won't get a mouseleave once the panel is gone.
    hideHoverTooltip();
    setPickers((list) => list.map((picker) => ({ ...picker, open: false })));
    setTimeout(() => setPickers((list) => list.filter((picker) => picker.open)), COLOR_PICKER_EXIT_MS);
  };
  const openPickerFor = (anchor, name, color) => {
    const picker = { id: Date.now() + Math.random(), anchor, name, color, open: true };
    openRef.current = picker;
    setPickers((list) => [...list, picker]);
  };

  useEffect(() => {
    const onClick = (event) => {
      const open = openRef.current;
      if (!open) return;
      if (event.target.closest(".course-color-picker") || open.anchor.contains(event.target)) return;
      closePicker();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
    // closePicker only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <ul className="course-color-list" id="course-color-list">
        {legend &&
          [...legend.colorNames].map(([name, color]) => (
            <li key={`${legend.generation}:${name}`}>
              <button
                type="button"
                className="course-color-item"
                style={{ "--chip-color": `var(--color-${color})` }}
                onClick={(event) => {
                  const anchor = event.currentTarget;
                  const reopening = openRef.current && openRef.current.anchor === anchor;
                  closePicker();
                  if (!reopening) openPickerFor(anchor, name, color);
                }}
              >
                <span className="course-color-dot" />
                <span
                  className="course-color-name"
                  ref={(el) => {
                    if (el && !el._fitted) {
                      el._fitted = true;
                      fitName(el, el, name, shortCourseName(name));
                    }
                  }}
                />
              </button>
            </li>
          ))}
      </ul>
      {pickers.map((picker) =>
        createPortal(<ColorPicker key={picker.id} picker={picker} onClose={closePicker} />, document.body)
      )}
    </>
  );
}

// Every color a course can take, opening to the left of the course's dot, a
// pointer at the dot. Picking one saves it as a preference.
function ColorPicker({ picker, onClose }) {
  const panelRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const dot = picker.anchor.querySelector(".course-color-dot").getBoundingClientRect();
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
    setVisible(true);
    // Placed once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`course-color-picker${visible && picker.open ? " course-color-picker--visible" : ""}`} ref={panelRef}>
      {COURSE_COLOR_CHOICES.map((color) => {
        const colorLabel = color.replace("-", " ");
        return (
          <button
            key={color}
            type="button"
            className={`course-color-swatch${color === picker.color ? " course-color-swatch--selected" : ""}`}
            style={{ "--chip-color": `var(--color-${color})` }}
            aria-label={colorLabel}
            ref={(el) => {
              if (el && !el._tooltip) {
                el._tooltip = true;
                attachHoverTooltip(el, colorLabel[0].toUpperCase() + colorLabel.slice(1));
              }
            }}
            onClick={() => {
              onClose();
              if (color === picker.color) return;
              const picked = { ...(window.getPreferences().courseColors || {}), [picker.name]: color };
              window.setPreference("courseColors", picked);
            }}
          >
          </button>
        );
      })}
    </div>
  );
}
