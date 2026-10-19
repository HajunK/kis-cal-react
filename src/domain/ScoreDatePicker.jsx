import { Fragment, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { fromISODate } from "../core/dates.js";
import { WEEKDAY_LABELS, initialPickerMonth, pickerMonth, schoolYearBounds } from "./model.js";

// A score's "taken on" date picker, under its row's date button. In <body>
// so the list's scroll area doesn't clip it; limited to the current school
// year. Opening another row's closes this one first, so the two briefly
// cross: each panel is kept until its exit has played.

const CLOSE_MS = 180;
// Matches the Calendar Add popup's step change.
const SLIDE_MS = 220;

let panels = []; // { id, button, date, onPick, month, bounds, element, leaving, slide }
let nextId = 0;
let openPanel = null;
const listeners = new Set();
const store = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => panels,
};
const update = (next) => {
  panels = next;
  flushSync(() => listeners.forEach((listener) => listener()));
};

// For the card arrows' keys, which leave a picker's arrows alone.
export const isScoreDatePickerOpen = () => openPanel !== null;

function closeScoreDatePicker() {
  if (!openPanel) return;
  const panel = openPanel;
  openPanel = null;
  panel.button.classList.remove("score-date-btn--active");
  // Shrinks back into the corner it grew from.
  if (panel.element) panel.element.classList.remove("score-date-calendar--visible");
  setTimeout(() => update(panels.filter((other) => other !== panel)), CLOSE_MS);
}

// date() reads the row's date as it is; onPick(iso or undefined) sets it.
export function toggleScoreDatePicker(button, date, onPick) {
  const reopening = openPanel && openPanel.button === button;
  closeScoreDatePicker();
  if (reopening) return;
  const bounds = schoolYearBounds();
  const panel = {
    id: nextId++,
    button,
    date,
    onPick,
    bounds,
    month: initialPickerMonth(bounds),
    element: null,
    slide: null,
  };
  openPanel = panel;
  update([...panels, panel]);
  button.classList.add("score-date-btn--active");
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".score-date-btn") || event.target.closest(".score-date-calendar")) return;
  closeScoreDatePicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openPanel) closeScoreDatePicker();
});

export function ScoreDatePickers() {
  const list = useSyncExternalStore(store.subscribe, store.get);
  return createPortal(
    list.map((panel) => <Panel key={panel.id} panel={panel} />),
    document.body
  );
}

function Panel({ panel }) {
  const ref = useRef(null);
  const windowRef = useRef(null);
  const { month, bounds } = panel;
  const shown = pickerMonth(month, bounds);
  const date = panel.date();

  // From the corner nearest the button. Near the screen's right edge the
  // panel is shifted left, which can put the button nearer its right side.
  useLayoutEffect(() => {
    const el = ref.current;
    panel.element = el;
    const rect = panel.button.getBoundingClientRect();
    const panelLeft = Math.min(rect.left, window.innerWidth - 260);
    el.style.position = "fixed";
    el.style.top = `${rect.bottom + 6}px`;
    el.style.left = `${panelLeft}px`;
    const panelWidth = el.getBoundingClientRect().width;
    const buttonCenterX = rect.left + rect.width / 2 - panelLeft;
    const originXPercent = Math.max(0, Math.min(100, (buttonCenterX / panelWidth) * 100));
    el.style.transformOrigin = `${originXPercent}% 0%`;
    void el.offsetWidth;  // so the entrance transitions
    el.classList.add("score-date-calendar--visible");
  }, [panel]);

  // The days slide, the old month's out as the new one's in, and the window
  // eases between heights, since a month can take 5 rows or 6.
  useLayoutEffect(() => {
    const slide = panel.slide;
    if (!slide) return;
    panel.slide = null;
    const daysWindow = windowRef.current;
    const newDays = daysWindow.querySelector(".score-date-days");
    const oldDays = slide.oldDays;
    oldDays.classList.add("score-date-days--leaving");
    daysWindow.appendChild(oldDays);
    const from = oldDays.offsetHeight;
    const to = newDays.offsetHeight;
    if (from !== to) {
      daysWindow.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: SLIDE_MS,
        easing: "ease",
      });
    }
    const shift = 24 * slide.direction;
    oldDays
      .animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: `translateX(${-shift}px)` },
        ],
        { duration: SLIDE_MS * 0.7, easing: "ease", fill: "forwards" }
      )
      .finished.catch(() => {})
      .finally(() => oldDays.remove());
    newDays.animate(
      [
        { opacity: 0, transform: `translateX(${shift}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: SLIDE_MS, easing: "ease" }
    );
  });

  const changeMonth = (event, direction) => {
    event.stopPropagation();
    if (direction < 0 ? shown.atStart : shown.atEnd) return;
    const current = windowRef.current.querySelector(".score-date-days:not(.score-date-days--leaving)");
    panel.slide = { oldDays: current.cloneNode(true), direction };
    panel.month = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    update([...panels]);
  };

  const pick = (event, iso) => {
    event.stopPropagation();
    panel.onPick(iso);
    closeScoreDatePicker();
  };

  return (
    <div className="score-date-calendar" ref={ref}>
      {/* Built afresh for each month, as the old picker was: a clicked arrow
          goes, and focus with it. */}
      <Fragment key={shown.label}>
        {date ? (
          <div className="score-date-calendar-clear-row">
            <span className="score-date-calendar-clear-label">{`Taken on ${window.formatPreferredDate(fromISODate(date))}`}</span>
            <button
              type="button"
              className="score-date-calendar-clear-btn"
              aria-label="Remove date"
              onClick={(event) => pick(event, undefined)}
            >
              Remove
            </button>
          </div>
        ) : null}
        <div className="score-date-calendar-header">
          <button
            type="button"
            className="score-date-nav-btn"
            aria-label="Previous month"
            disabled={shown.atStart}
            onClick={(event) => changeMonth(event, -1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M12 4.5L6.5 10l5.5 5.5" />
            </svg>
          </button>
          <span className="score-date-calendar-label">{shown.label}</span>
          <button
            type="button"
            className="score-date-nav-btn"
            aria-label="Next month"
            disabled={shown.atEnd}
            onClick={(event) => changeMonth(event, 1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8 4.5l5.5 5.5L8 15.5" />
            </svg>
          </button>
        </div>
        <div className="score-date-grid score-date-weekday-row">
          {WEEKDAY_LABELS.map((day) => (
            <span key={day} className="score-date-weekday">
              {day}
            </span>
          ))}
        </div>
        {/* Its own clipped window, so only the days move; the old month's
          days leave from inside the new one. */}
        <div className="score-date-days-window" ref={windowRef}>
          <div className="score-date-grid score-date-days">
            {shown.days.map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`score-date-day${day.outside ? " score-date-day--other-month" : ""}${day.today ? " score-date-day--today" : ""}${
                  date === day.iso ? " score-date-day--selected" : ""
                }`}
                // Not ringed now, while the calendar fades out; it's ringed
                // when next opened.
                onClick={(event) => pick(event, day.iso)}
              >
                {String(day.date.getDate())}
              </button>
            ))}
          </div>
        </div>
      </Fragment>
    </div>
  );
}
