import { useLayoutEffect, useRef, useState } from "react";
import { saveSchedule } from "./adminData.js";
import {
  customDaySchedule,
  normalSchedule,
  scheduleDay,
  scheduleDayComplete,
  scheduleEventLabel,
  scheduleEventsFor,
  sortScheduleEvents,
} from "./bellSchedule.js";

// Every event the date can hold, as scheduleEventsFor lists them. sortTime is
// where a row sits: its times as of when they were last left, so a row doesn't
// jump about while one is being typed.
const eventsFor = (iso, sched, dayTypes, custom) =>
  scheduleEventsFor(iso, sched, dayTypes, custom).map((event) => ({ ...event, sortTime: event.time }));

// The Bell Schedule popup for one date, inside its Modal: the date's events,
// each with its times that day, in time order. An X takes one off the day
// (and undoes any edit to its times), and the pills below add back any it
// doesn't have. page: { db, deleteField,
// toast }. onSaved({ schedule, custom }) once saved.
export function BellScheduleModal({ iso, sched, dayTypes, page, onSaved, onClose }) {
  // As the day stood when the popup opened: what an event goes back to when
  // it's taken off.
  const [initial] = useState(() => eventsFor(iso, sched, dayTypes));
  const [events, setEvents] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dayType = dayTypes[iso];
  const dateLabel = new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const shown = sortScheduleEvents(events);
  const missing = events.filter(({ included }) => !included);
  // Only offered while the day differs from normal.
  const differs = Boolean(customDaySchedule(iso, scheduleDay(events), sched, dayTypes));
  // Set by Reset: its rows animate first, then the popup's height (see
  // useGrowingDialog). Read by both hooks, cleared by the second.
  const stepped = useRef(false);
  const rowRefs = useGlide(shown.map(({ key }) => key), stepped);
  const headingRef = useRef(null);
  useGrowingDialog(headingRef, stepped);

  const update = (key, change) => setEvents((list) => list.map((event) => (event.key === key ? { ...event, ...change(event) } : event)));
  const setTime = (key, field, value) => update(key, ({ time }) => ({ time: { ...time, [field]: value } }));
  // Re-sorted once the field is left, and then only by a time that's filled in.
  const settle = (key) =>
    update(key, ({ time, sortTime }) => ({ sortTime: { start: time.start || sortTime.start, end: time.end || sortTime.end } }));
  // Taken off, an event also drops any edit made to its times: added back, it
  // has the ones it started with.
  const remove = (key) => {
    const { time, sortTime } = initial.find((event) => event.key === key);
    update(key, () => ({ included: false, time, sortTime }));
  };
  const add = (key) => update(key, () => ({ included: true }));
  const reset = () => {
    stepped.current = true;
    setEvents(eventsFor(iso, sched, dayTypes, null));
  };

  const save = () => {
    if (!scheduleDayComplete(events)) {
      page.toast("Fill in every start and end time first.");
      return;
    }
    const schedule = normalSchedule(sched);
    const custom = customDaySchedule(iso, scheduleDay(events), sched, dayTypes);
    setSaving(true);
    saveSchedule(page.db, iso, schedule, custom, page.deleteField)
      .then(() => {
        onSaved({ schedule, custom });
        page.toast("Schedule saved.");
        onClose();
      })
      .catch((error) => {
        console.error("Failed to save schedule:", error);
        page.toast("Something went wrong saving the schedule. Please try again.");
        setSaving(false);
      });
  };

  return (
    <>
      <button type="button" className="admin-schedule-close-btn" aria-label="Close" onClick={onClose}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      <div className="admin-schedule-heading" ref={headingRef}>
        <h2 className="admin-schedule-title">Schedule</h2>
        <p className="admin-schedule-date">{dayType === "A" || dayType === "B" ? `${dateLabel} · ${dayType} Day` : dateLabel}</p>
      </div>
      <div className="admin-schedule-rows">
        {shown.map(({ key, time }) => (
          <div className="admin-schedule-row" key={key} data-key={key} ref={(el) => rowRefs.set(key, el)}>
            <span className="admin-schedule-row-label">{scheduleEventLabel(key)}</span>
            <input
              type="time"
              className="admin-schedule-time-input"
              aria-label={`${scheduleEventLabel(key)} start`}
              value={time.start}
              onChange={(event) => setTime(key, "start", event.target.value)}
              onBlur={() => settle(key)}
            />
            <span className="admin-schedule-row-sep">–</span>
            <input
              type="time"
              className="admin-schedule-time-input"
              aria-label={`${scheduleEventLabel(key)} end`}
              value={time.end}
              onChange={(event) => setTime(key, "end", event.target.value)}
              onBlur={() => settle(key)}
            />
            <button type="button" className="admin-schedule-remove-btn" aria-label={`Remove ${scheduleEventLabel(key)}`} onClick={() => remove(key)}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="admin-schedule-footer">
        <AddPills keys={missing.map(({ key }) => key)} onPick={add} />
      </div>
      <div className="admin-schedule-actions">
        <button type="button" className="admin-schedule-save-btn" disabled={saving} onClick={save}>
          Save Schedule
        </button>
        <ResetSlot open={differs} onReset={reset} />
      </div>
    </>
  );
}

// The popup's height follows its content (rows and pills coming and going,
// Reset opening on a new line) with a short ease-out rather than a jump, and
// the parts below the rows (the pills, Save Schedule) travel with it instead
// of jumping to their new places first. from is where they stood, even
// partway through an earlier change. Not as the popup opens, which has its
// own entrance. inside: any element in the dialog.
// stepped (a ref, cleared here): the change comes from Reset, so the popup
// and those parts keep their places while the rows animate (ROW_MOVE_MS), and
// only then move.
const DIALOG_RESIZE_MS = 220;
const RESIZE_EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";
// How far an element is currently shifted by a transform (an animation's or
// a hold's).
const shiftOf = (el) => {
  const { transform } = getComputedStyle(el);
  return transform === "none" ? 0 : new DOMMatrix(transform).m42;
};
function useGrowingDialog(inside, stepped) {
  const lastHeight = useRef(null);
  const lastTops = useRef(null);
  const running = useRef([]);
  const holding = useRef(null);
  const lowerParts = (dialog) => [...dialog.querySelectorAll(".admin-schedule-footer, .admin-schedule-actions")];
  const release = (dialog) => {
    clearTimeout(holding.current);
    holding.current = null;
    dialog.style.height = "";
    dialog.style.overflow = "";
    lowerParts(dialog).forEach((el) => (el.style.transform = ""));
  };
  const stopAll = () => {
    running.current.forEach((animation) => animation.cancel());
    running.current = [];
  };
  useLayoutEffect(() => {
    const dialog = inside.current.closest(".admin-schedule-dialog");
    const step = stepped.current;
    stepped.current = false;
    const lower = lowerParts(dialog);
    // Where everything visibly stood, which a change in flight hasn't yet
    // brought to its place.
    const inFlight = running.current.length > 0 || holding.current !== null;
    const from = inFlight ? dialog.getBoundingClientRect().height : lastHeight.current;
    const startTops = lastTops.current && lower.map((el, i) => lastTops.current[i] + shiftOf(el));
    stopAll();
    release(dialog);
    const to = dialog.getBoundingClientRect().height;
    const tops = lower.map((el) => el.offsetTop);
    lastHeight.current = to;
    lastTops.current = tops;
    // No Web Animations in the tests' jsdom.
    if (from === null || !startTops || !dialog.animate) return;
    const shifts = startTops.map((top, i) => top - tops[i]);
    const heightChanged = Math.abs(from - to) >= 1;
    if (!heightChanged && shifts.every((shift) => Math.abs(shift) < 0.5)) return;
    // The dialog is content-box (its width too), so what's animated is the
    // measured height less its padding and border; sizing it any other way
    // for the moment would change its width as well.
    const style = getComputedStyle(dialog);
    const frame = (total) =>
      `${total - ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, name) => sum + parseFloat(style[name]), 0)}px`;
    const options = { duration: DIALOG_RESIZE_MS, easing: RESIZE_EASING };
    const move = () => {
      const animations = [];
      if (heightChanged) animations.push(dialog.animate([{ height: frame(from) }, { height: frame(to) }], options));
      lower.forEach((el, i) => {
        if (Math.abs(shifts[i]) >= 0.5) animations.push(el.animate([{ transform: `translateY(${shifts[i]}px)` }, { transform: "none" }], options));
      });
      running.current = animations;
      animations.forEach((animation) =>
        animation.finished.then(
          () => (running.current = running.current.filter((other) => other !== animation)),
          () => {}
        )
      );
    };
    if (!step) {
      move();
      return;
    }
    // Held where they were (anything past the old edge out of sight) until
    // the rows have finished.
    if (heightChanged) {
      dialog.style.height = frame(from);
      dialog.style.overflow = "hidden";
    }
    lower.forEach((el, i) => (el.style.transform = `translateY(${shifts[i]}px)`));
    holding.current = setTimeout(() => {
      release(dialog);
      move();
    }, ROW_MOVE_MS);
  });
  useLayoutEffect(
    () => () => {
      stopAll();
      clearTimeout(holding.current);
    },
    []
  );
}

// "Reset this day", beside Save Schedule: always here, but shut (no width,
// faded, out of reach) while the day is as normal. Opening takes its width out
// of Save's, closing gives it back, both smoothly; none as the popup opens.
function ResetSlot({ open, onReset }) {
  const buttonRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [animated, setAnimated] = useState(false);
  useLayoutEffect(() => {
    setWidth(buttonRef.current.offsetWidth);
    // Transitions start only once it's been drawn, so it doesn't open from
    // nothing as the popup does.
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`admin-schedule-reset-slot${open ? " admin-schedule-reset-slot--open" : ""}${animated ? " admin-schedule-reset-slot--animated" : ""}`}
      style={open ? { width } : undefined}
      inert={!open}
    >
      <button type="button" className="admin-schedule-reset-btn" ref={buttonRef} onClick={onReset}>
        Reset this day
      </button>
    </div>
  );
}

// How long a row takes to glide to its new place.
const ROW_MOVE_MS = 250;

// Rows that move (re-sorted, or making room for one added or removed) glide
// to their new places, and an added one fades in; none do as the popup opens.
// Returns the map each row puts its element in.
function useGlide(keys, stepped) {
  const elements = useRef(new Map()).current;
  const tops = useRef(null);
  useLayoutEffect(() => {
    const last = tops.current;
    const now = new Map(keys.map((key) => [key, elements.get(key).offsetTop]));
    tops.current = now;
    // No Web Animations in the tests' jsdom.
    if (!last || !Element.prototype.animate) return;
    now.forEach((top, key) => {
      const el = elements.get(key);
      // In two steps, an added row waits for the popup to open its room.
      if (!last.has(key)) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: stepped.current ? ROW_MOVE_MS : 0, fill: "backwards", easing: "ease" });
      else if (last.get(key) !== top) {
        el.animate([{ transform: `translateY(${last.get(key) - top}px)` }, { transform: "none" }], { duration: ROW_MOVE_MS, easing: "ease" });
      }
    });
  });
  return elements;
}

// The events the day doesn't have, as hollow pills in a row (wrapping when
// there are more than fit). Picking one adds it, and the pills after it slide
// over to take its place.
function AddPills({ keys, onPick }) {
  const pillRefs = usePillGlide(keys);
  return (
    <div className="admin-schedule-add-pills" role="group" aria-label="Add to this day">
      {keys.map((key) => (
        <button type="button" className="admin-schedule-add-pill" key={key} ref={(el) => pillRefs.set(key, el)} onClick={() => onPick(key)}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.5v9M1.5 6h9" />
          </svg>
          {scheduleEventLabel(key)}
        </button>
      ))}
    </div>
  );
}

// Like useGlide, for the pills: they move both ways (along the row and, once
// it wraps, between rows), and one that appears (its row's X was pressed)
// fades in. One that goes is simply gone.
function usePillGlide(keys) {
  const elements = useRef(new Map()).current;
  const spots = useRef(null);
  useLayoutEffect(() => {
    const last = spots.current;
    const now = new Map(keys.map((key) => [key, { left: elements.get(key).offsetLeft, top: elements.get(key).offsetTop }]));
    spots.current = now;
    // None as the popup opens, and none in the tests' jsdom (no Web Animations).
    if (!last || !Element.prototype.animate) return;
    now.forEach((spot, key) => {
      const el = elements.get(key);
      const before = last.get(key);
      if (!before) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
      else if (before.left !== spot.left || before.top !== spot.top) {
        el.animate([{ transform: `translate(${before.left - spot.left}px, ${before.top - spot.top}px)` }, { transform: "none" }], {
          duration: 250,
          easing: "ease",
        });
      }
    });
  });
  return elements;
}
