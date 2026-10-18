import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { isAdminEmail } from "../core/admins.js";
import { COURSE_CATALOG, effectiveCourseName, findCourseCatalogEntry } from "../core/catalog.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { Modal } from "../ui/Modal.jsx";
import {
  acceptSuggestion,
  addAssessment,
  clearDaySchedule,
  declineSuggestion,
  deleteAssessment,
  ensureCacheVersions,
  fetchAssessments,
  fetchDayTypes,
  fetchPeriodTimes,
  saveDayType,
  seedDefaultSchedule,
  watchSuggestions,
} from "./adminData.js";
import { BellScheduleModal } from "./BellScheduleModal.jsx";
import { DEFAULT_SCHEDULE_TIMES, dayHasTestingBlock } from "./bellSchedule.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPES = ["In-Class", "Testing Block", "Formative", "Reassessment", "Other"];
const DAY_TYPES = ["A", "B", "?"];
// Custom "Other" labels sort after these.
const TYPE_SORT_ORDER = ["Testing Block", "In-Class", "Formative", "Reassessment"];
const typeSortRank = (type) => (TYPE_SORT_ORDER.includes(type) ? TYPE_SORT_ORDER.indexOf(type) : TYPE_SORT_ORDER.length);

// The Assessments admin page: the school-wide assessment calendar, each day's
// A/B type and Bell Schedule, a form to add an assessment, and the
// assessments students have suggested. Admin-only here as a courtesy;
// firestore.rules is the real gate.
//
// Built the way the old assessments-admin.js was: the data lives in one
// model, and every change redraws the calendar and day panel from it in full
// (render()), so what wasn't redrawn before stays as it was. page: { auth, db,
// deleteField, toast, alert, formatDate }.
export function AssessmentsAdmin({ page }) {
  // undefined until Firebase has restored the session.
  const [user, setUser] = useState(undefined);
  useEffect(() => page.auth.onAuthStateChanged((next) => setUser(next)), [page]);
  const isAdmin = user !== undefined && isAdminEmail(user && user.email);

  const model = useRef({
    assessments: [],
    dayTypes: {},
    sched: { times: null, testingBlock: null, academicSupport: null, advisory: null, daySchedules: {} },
    schedFetched: false,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: null,
  }).current;
  // The calendar and day panel as last drawn; null until first drawn.
  const [view, setView] = useState(null);
  const render = () =>
    setView((last) => ({
      generation: (last ? last.generation : 0) + 1,
      month: model.month,
      selectedDate: model.selectedDate,
      assessments: model.assessments.slice(),
      dayTypes: { ...model.dayTypes },
    }));
  const [loaded, setLoaded] = useState(false);

  // Once, the first time an admin is signed in.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!isAdmin || initialized) return;
    setInitialized(true);
    ensureCacheVersions(page.db);
    fetchPeriodTimes(page.db)
      .then((sched) => {
        Object.assign(model.sched, sched);
        model.schedFetched = true;
      })
      .catch((error) => console.error("Failed to load period times:", error));
    fetchDayTypes(page.db)
      .then((dayTypes) => {
        model.dayTypes = dayTypes;
        return fetchAssessments(page.db)
          .then((assessments) => {
            model.assessments = assessments;
            render();
            setLoaded(true);
          })
          .catch((error) => console.error("Failed to load assessments:", error));
      })
      .catch((error) => console.error("Failed to load day types:", error));
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, initialized, page]);

  // The add form's choices.
  const [type, setType] = useState("In-Class");
  const [otherText, setOtherText] = useState("");
  const [courseText, setCourseText] = useState("");
  const [division, setDivision] = useState("");
  // Each course change redraws the division buttons from scratch, as it did.
  const [divisionDraw, setDivisionDraw] = useState(0);
  const courseInputRef = useRef(null);
  const otherInputRef = useRef(null);

  const courseChanged = (text) => {
    const course = findCourseCatalogEntry(text.trim());
    const divisions = course && course.divisions;
    // Changing the course invalidates a division the new one doesn't have.
    if (!divisions || divisions.length === 0 || !divisions.includes(division)) setDivision("");
    setDivisionDraw((count) => count + 1);
  };

  // An optimistic change: the calendar redraws at once; a failed write puts
  // things back and says so.
  const setDayType = (iso, value) => {
    const previous = model.dayTypes[iso] || null;
    if (value) model.dayTypes[iso] = value;
    else delete model.dayTypes[iso];
    render();
    saveDayType(page.db, iso, value).catch((error) => {
      console.error("Failed to save day type:", error);
      page.alert("Something went wrong saving that day type. Please try again.");
      if (previous) model.dayTypes[iso] = previous;
      else delete model.dayTypes[iso];
      render();
    });
    if (!value) return;
    // Only when there's genuinely no schedule (not just a fetch still in
    // flight), and never over an existing one.
    if (model.schedFetched && !model.sched.times) {
      model.sched.times = DEFAULT_SCHEDULE_TIMES;
      seedDefaultSchedule(page.db).catch((error) => {
        console.error("Failed to seed the default bell schedule:", error);
        model.sched.times = null;
      });
    }
    // Picking A or B starts the day over on its normal schedule.
    const custom = model.sched.daySchedules[iso];
    if (custom) {
      delete model.sched.daySchedules[iso];
      clearDaySchedule(page.db, iso, page.deleteField).catch((error) => {
        console.error("Failed to reset the day's schedule:", error);
        model.sched.daySchedules[iso] = custom;
      });
    }
  };

  const removeAssessment = (id) => {
    const index = model.assessments.findIndex((entry) => entry.id === id);
    const removed = index === -1 ? null : model.assessments[index];
    if (removed) {
      model.assessments.splice(index, 1);
      render();
    }
    deleteAssessment(page.db, id).catch((error) => {
      console.error("Failed to delete assessment:", error);
      page.alert("Something went wrong deleting that assessment. Please try again.");
      if (removed) {
        model.assessments.splice(index, 0, removed);
        render();
      }
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const name = courseText.trim();
    if (!name) return;
    const course = findCourseCatalogEntry(name);
    if (!course) {
      page.toast("The course you typed does not exist.");
      return;
    }
    if (course.divisions && !division) {
      page.alert("Pick a division first — this course tests on different days for each one.");
      return;
    }
    const other = otherText.trim();
    if (type === "Other" && !other) {
      page.alert("Type a label for the custom assessment type first.");
      return;
    }
    const date = model.selectedDate;
    if (date) {
      const entry = { type: type === "Other" ? other : type, date, courseName: effectiveCourseName(name, division) };
      addAssessment(page.db, entry)
        .then((id) => {
          // Pushed into the list directly rather than refetching the whole
          // collection.
          model.assessments.push({ id, ...entry, createdAt: Date.now() });
          render();
        })
        .catch((error) => {
          console.error("Failed to add assessment:", error);
          page.alert("Something went wrong adding that assessment. Please try again.");
        });
    }
    setCourseText("");
    courseInputRef.current.value = "";
    courseChanged("");
    setOtherText("");
  };

  const [scheduleModal, setScheduleModal] = useState(null); // { id, iso, open }

  return (
    <>
      <p className="admin-not-authorized" id="admin-not-authorized" hidden={user === undefined || isAdmin}>
        This page is for admins only.
      </p>

      <div className="admin-calendar-layout" id="admin-calendar-layout" hidden={!isAdmin}>
        <div className="assessment-calendar-card">
          <h2 className="assessment-calendar-title">Assessment Calendar</h2>
          <div className="assessment-calendar-header">
            <button
              type="button"
              className="assessment-calendar-nav-btn"
              id="admin-cal-prev"
              aria-label="Previous month"
              onClick={() => {
                model.month = new Date(model.month.getFullYear(), model.month.getMonth() - 1, 1);
                model.selectedDate = null;
                render();
              }}
            >
              ‹
            </button>
            <span className="assessment-calendar-label" id="admin-cal-label">
              {view ? `${MONTH_NAMES[view.month.getMonth()]} ${view.month.getFullYear()}` : ""}
            </span>
            <button
              type="button"
              className="assessment-calendar-nav-btn"
              id="admin-cal-next"
              aria-label="Next month"
              onClick={() => {
                model.month = new Date(model.month.getFullYear(), model.month.getMonth() + 1, 1);
                model.selectedDate = null;
                render();
              }}
            >
              ›
            </button>
          </div>
          <div className="assessment-calendar-weekday-row" id="admin-cal-weekdays">
            {initialized && WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
          </div>
          {/* Testing Blocks only go on Mondays and Fridays, so those are
              highlighted while that type is picked. */}
          <div className={`assessment-calendar-grid${type === "Testing Block" ? " admin-cal-grid--testing-block" : ""}`} id="admin-cal-grid">
            {view && (
              <CalendarDays
                key={view.generation}
                view={view}
                onPick={(iso) => {
                  model.selectedDate = iso;
                  render();
                }}
              />
            )}
          </div>
          <div className="assessment-calendar-loading" id="admin-cal-loading" hidden={loaded}>
            <div className="assessment-calendar-spinner" />
          </div>
        </div>

        <div className="admin-day-panel">
          <div className="admin-day-panel-header">
            <h2 className="admin-day-panel-title" id="admin-day-title">
              {view && view.selectedDate ? longDate(view.selectedDate) : "Select a day"}
            </h2>
            <div className="admin-day-panel-header-actions">
              {/* Not tied to whichever day happens to be selected, just placed
                  next to the A/B/? toggle. */}
              <button
                type="button"
                className="admin-schedule-open-btn"
                id="admin-schedule-open-btn"
                aria-label="Bell Schedule"
                hidden={!(view && view.selectedDate)}
                onClick={() => setScheduleModal((last) => ({ id: (last ? last.id : 0) + 1, iso: model.selectedDate, open: true }))}
              >
                <svg className="admin-schedule-open-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <DayTypeToggle
                withThumb={initialized}
                view={view}
                onPick={(value) => {
                  if (!model.selectedDate) return;
                  setDayType(model.selectedDate, value === "?" ? null : value);
                }}
              />
            </div>
          </div>

          <ul className="admin-day-entry-list" id="admin-day-entries">
            {view && view.selectedDate && <DayEntries key={view.generation} view={view} onDelete={removeAssessment} />}
          </ul>

          <form className="admin-add-form" id="admin-add-form" hidden={!(view && view.selectedDate)} onSubmit={submit}>
            <div className="admin-add-field">
              <span className="admin-add-label">Course</span>
              <CourseField
                inputRef={courseInputRef}
                value={courseText}
                onChange={(text) => {
                  setCourseText(text);
                  courseChanged(text);
                }}
                onInvalid={() => page.toast("The course you typed does not exist.")}
              />
            </div>
            <DivisionField key={divisionDraw} courseText={courseText} division={division} onPick={setDivision} />
            <div className="admin-add-field">
              <span className="admin-add-label">Type of Assessment</span>
              <TypeToggle
                withThumb={initialized}
                value={type}
                onPick={(value) => {
                  // Shown (and the thumb on its way) within the click, so the
                  // label field can take focus in the same frame, as before.
                  flushSync(() => setType(value));
                  if (value === "Other") otherInputRef.current.focus();
                }}
                otherInputRef={otherInputRef}
                otherText={otherText}
                onOtherText={setOtherText}
              />
            </div>
            <button type="submit" className="admin-add-submit-btn">
              Add assessment
            </button>
          </form>
        </div>
      </div>

      <Suggestions
        page={page}
        isAdmin={isAdmin}
        model={model}
        onAccepted={(assessment) => {
          model.assessments.push(assessment);
          render();
        }}
      />

      {scheduleModal && (
        <Modal
          key={scheduleModal.id}
          open={scheduleModal.open}
          name="admin-schedule"
          dialog="admin-schedule-dialog"
          label="Bell Schedule"
          onClose={() => setScheduleModal((last) => ({ ...last, open: false }))}
        >
          <BellScheduleModal
            iso={scheduleModal.iso}
            sched={model.sched}
            dayTypes={model.dayTypes}
            page={page}
            onSaved={({ schedule, custom }) => {
              model.sched.times = schedule.times;
              model.sched.testingBlock = schedule.testingBlock;
              model.sched.academicSupport = schedule.academicSupport;
              model.sched.advisory = schedule.advisory;
              if (custom) model.sched.daySchedules[scheduleModal.iso] = custom;
              else delete model.sched.daySchedules[scheduleModal.iso];
            }}
            onClose={() => setScheduleModal((last) => ({ ...last, open: false }))}
          />
        </Modal>
      )}
    </>
  );
}

function longDate(iso) {
  const date = fromISODate(iso);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// The month's days, drawn afresh each time (keyed by the view's generation).
function CalendarDays({ view, onPick }) {
  const year = view.month.getFullYear();
  const month = view.month.getMonth();
  const entriesByDate = {};
  view.assessments.forEach((entry) => {
    (entriesByDate[entry.date] = entriesByDate[entry.date] || []).push(entry);
  });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(<span key={`outside-${i}`} className="assessment-calendar-day assessment-calendar-day--outside" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISODate(new Date(year, month, day));
    const weekday = new Date(year, month, day).getDay();
    const classes = ["assessment-calendar-day"];
    // Marks the Testing Block days so they can be highlighted as one column.
    if (weekday === 1 || weekday === 5) {
      classes.push("assessment-calendar-day--block-day");
      if (day <= 7) classes.push("assessment-calendar-day--block-day-first");
      if (day + 7 > daysInMonth) classes.push("assessment-calendar-day--block-day-last");
    }
    if (view.selectedDate === iso) classes.push("assessment-calendar-day--selected");
    const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
    const count = (entriesByDate[iso] || []).length;
    cells.push(
      <button key={iso} type="button" className={classes.join(" ")} onClick={() => onPick(iso)}>
        {/* Its own span so today's circle fits the number rather than the
            whole cell. */}
        <span className={`assessment-calendar-day-number${isToday ? " assessment-calendar-day-number--today" : ""}`}>{day}</span>
        <span className="assessment-calendar-day-type">{view.dayTypes[iso] || ""}</span>
        {/* Every five become one square, like a tally, so a busy day's marks
            never outgrow the cell. */}
        {count > 0 && (
          <div className="assessment-calendar-day-dots">
            {Array.from({ length: Math.floor(count / 5) }, (_, i) => (
              <span key={`five-${i}`} className="assessment-calendar-day-dot assessment-calendar-day-dot--five" />
            ))}
            {Array.from({ length: count % 5 }, (_, i) => (
              <span key={`one-${i}`} className="assessment-calendar-day-dot" />
            ))}
          </div>
        )}
      </button>
    );
  }
  return cells;
}

// The selected day's assessments, alphabetical by course within each type.
function DayEntries({ view, onDelete }) {
  const entries = view.assessments.filter((entry) => entry.date === view.selectedDate);
  if (entries.length === 0) return <li className="admin-day-entry-empty">Nothing scheduled yet.</li>;
  return entries
    .slice()
    .sort((a, b) => {
      const rankDiff = typeSortRank(a.type) - typeSortRank(b.type);
      return rankDiff !== 0 ? rankDiff : a.courseName.localeCompare(b.courseName);
    })
    .map((entry) => {
      // Matches how the Calendar tab draws these types.
      const isSummative = ["In-Class", "Summative", "Testing Block"].includes(entry.type) || /reassess/i.test(entry.type);
      return (
        <li key={entry.id} className="admin-day-entry">
          <span className="admin-day-entry-name">{entry.courseName}</span>
          <span className={`assessment-calendar-entry-type assessment-calendar-entry-type--${isSummative ? "summative" : "formative"}`}>{entry.type}</span>
          <button type="button" className="admin-day-entry-delete" aria-label="Delete assessment" onClick={() => onDelete(entry.id)}>
            ×
          </button>
        </li>
      );
    });
}

// A segmented control's thumb, set on the active option: sliding when animate,
// else jumping there. Positioned again once Inter has loaded.
function useThumb(thumbRef, activeRef, deps, animate, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const thumb = thumbRef.current;
    const active = activeRef.current;
    if (!thumb || !active) return;
    if (!animate) thumb.style.transition = "none";
    thumb.style.left = `${active.offsetLeft}px`;
    thumb.style.width = `${active.offsetWidth}px`;
    if (!animate) {
      void thumb.offsetWidth;  // so the "none" transition applies first
      thumb.style.transition = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// The selected day's A/B/? type. Hidden until a day is picked. Its thumb
// slides for a change to the same day and jumps when another day is picked.
function DayTypeToggle({ withThumb, view, onPick }) {
  const thumbRef = useRef(null);
  const activeRef = useRef(null);
  const syncedDateRef = useRef(null);
  const selectedDate = view && view.selectedDate;
  const active = selectedDate ? view.dayTypes[selectedDate] || "?" : "?";
  const animate = Boolean(selectedDate) && syncedDateRef.current === selectedDate;
  // Left where it was while no day is picked (the toggle is hidden then).
  useThumb(thumbRef, activeRef, [view && view.generation], animate, Boolean(selectedDate));
  useLayoutEffect(() => {
    syncedDateRef.current = selectedDate || null;
  });
  return (
    <div className="segmented-control" id="admin-day-type-toggle" hidden={!selectedDate}>
      {withThumb && <span className="segmented-thumb" ref={thumbRef} />}
      {DAY_TYPES.map((value) => (
        <button
          key={value}
          type="button"
          className={`segmented-option${value === active ? " segmented-option--active" : ""}`}
          data-value={value}
          ref={value === active ? activeRef : undefined}
          onClick={() => {
            if (value !== active) onPick(value);
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

// The type of assessment being added; "Other" shows a field for its own label,
// inside the same bar.
function TypeToggle({ withThumb, value, onPick, otherInputRef, otherText, onOtherText }) {
  const thumbRef = useRef(null);
  const activeRef = useRef(null);
  const placedRef = useRef(false);
  useThumb(thumbRef, activeRef, [value, withThumb], placedRef.current);
  useLayoutEffect(() => {
    if (withThumb) placedRef.current = true;
  });
  // The first position was measured with the fallback font, whose widths
  // differ from Inter's.
  useEffect(() => {
    if (!withThumb || !document.fonts) return;
    document.fonts.ready.then(() => {
      const thumb = thumbRef.current;
      const active = activeRef.current;
      if (!thumb || !active) return;
      thumb.style.transition = "none";
      thumb.style.left = `${active.offsetLeft}px`;
      thumb.style.width = `${active.offsetWidth}px`;
      void thumb.offsetWidth;
      thumb.style.transition = "";
    });
  }, [withThumb]);
  return (
    <div className="segmented-control" id="admin-type-toggle">
      {withThumb && <span className="segmented-thumb" ref={thumbRef} />}
      {TYPES.map((option) => (
        <button
          key={option}
          type="button"
          className={`segmented-option${option === value ? " segmented-option--active" : ""}`}
          data-value={option}
          ref={option === value ? activeRef : undefined}
          onClick={() => {
            if (option !== value) onPick(option);
          }}
        >
          {option}
        </button>
      ))}
      <input
        type="text"
        className="admin-type-other-input"
        id="admin-type-other-input"
        placeholder="Type a label"
        hidden={value !== "Other"}
        ref={otherInputRef}
        value={otherText}
        onChange={(event) => onOtherText(event.target.value)}
      />
    </div>
  );
}

// The course being added, with up to eight catalog names containing what's
// typed. Picked from the list with the mouse or Enter, which then doesn't
// submit the form.
function CourseField({ inputRef, value, onChange, onInvalid }) {
  const [matches, setMatches] = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const listRef = useRef(null);
  const blurTimer = useRef(null);

  const showMatches = (typed) => {
    const query = typed.trim().toLowerCase();
    setHighlighted(-1);
    setMatches(query === "" ? [] : COURSE_CATALOG.filter((course) => course.name.toLowerCase().includes(query)).slice(0, 8).map((course) => course.name));
  };
  const pick = (name) => {
    // Into the field at once: the blur check that can follow reads it.
    inputRef.current.value = name;
    setMatches([]);
    onChange(name);
  };

  useLayoutEffect(() => {
    if (highlighted < 0 || !listRef.current) return;
    const item = listRef.current.children[highlighted];
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  return (
    <div className="schedule-field admin-course-field">
      <input
        ref={inputRef}
        className="schedule-input admin-course-input"
        type="text"
        autoComplete="off"
        placeholder="Type a course name"
        value={value}
        onChange={(event) => {
          showMatches(event.target.value);
          onChange(event.target.value);
        }}
        onFocus={(event) => showMatches(event.target.value)}
        onBlur={(event) => {
          clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => setMatches([]), 100);
          // Only catalog courses can be scheduled. Checked on blur, since
          // partial text while typing is expected.
          const name = event.target.value.trim();
          if (name && !findCourseCatalogEntry(name)) onInvalid();
        }}
        onKeyDown={(event) => {
          // Before the early return, so Escape works even with no matches.
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.blur();
            return;
          }
          if (matches.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted(highlighted < matches.length - 1 ? highlighted + 1 : 0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted(highlighted > 0 ? highlighted - 1 : matches.length - 1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            pick(matches[highlighted >= 0 ? highlighted : 0]);
          }
        }}
      />
      <ul className="schedule-dropdown" ref={listRef}>
        {matches.map((name, i) => (
          <li
            key={name}
            className={`schedule-dropdown-item${i === highlighted ? " schedule-dropdown-item--highlighted" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              pick(name);
            }}
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Only shown once the typed course has divisions. Redrawn from scratch each
// time the course changes (keyed by the caller).
function DivisionField({ courseText, division, onPick }) {
  const course = findCourseCatalogEntry(courseText.trim());
  const divisions = course && course.divisions && course.divisions.length > 0 ? course.divisions : null;
  return (
    <div className="admin-add-field" id="admin-division-field" hidden={!divisions}>
      <span className="admin-add-label">Division</span>
      <div className="division-picker" id="admin-division-picker">
        {divisions &&
          divisions.map((option) => (
            <button
              key={option}
              type="button"
              className={`division-option${option === division ? " division-option--selected" : ""}`}
              // mousedown, not click: a click would blur the course input
              // first, which can redraw this picker before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(option)}
            >
              {option}
            </button>
          ))}
      </div>
    </div>
  );
}

// Assessments students added that the school calendar is missing, soonest
// first, with how many suggested each. Accepting adds it to the calendar.
function Suggestions({ page, isAdmin, model, onAccepted }) {
  const list = useRef([]);
  // As last drawn; null until the collection first loads.
  const [view, setView] = useState(null);
  const render = () => setView((last) => ({ generation: (last ? last.generation : 0) + 1, suggestions: list.current.slice() }));

  const [watching, setWatching] = useState(false);
  useEffect(() => {
    if (!isAdmin || watching) return;
    setWatching(true);
    watchSuggestions(page.db, (suggestions) => {
      list.current = suggestions;
      render();
    });
    // Once, the first time an admin is signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, watching, page]);

  // Dates are formatted at render time, so a Date format change redraws.
  useEffect(() => {
    if (!watching) return undefined;
    const redraw = () => render();
    window.addEventListener("app:preferences-changed", redraw);
    return () => window.removeEventListener("app:preferences-changed", redraw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

  // Gone from the list at once; put back where it was if the write fails.
  const optimistic = (suggestion, write, failure) => {
    const index = list.current.findIndex((entry) => entry.id === suggestion.id);
    if (index !== -1) {
      list.current.splice(index, 1);
      render();
    }
    write().catch((error) => {
      console.error(failure.log, error);
      page.alert(failure.alert);
      if (index !== -1) {
        list.current.splice(index, 0, suggestion);
        render();
      }
    });
  };
  const accept = (suggestion, type) =>
    optimistic(
      suggestion,
      () =>
        acceptSuggestion(page.db, suggestion, type, (id) =>
          onAccepted({ id, type, date: suggestion.date, courseName: suggestion.courseName })
        ),
      { log: "Failed to accept suggestion:", alert: "Something went wrong accepting that suggestion. Please try again." }
    );
  const decline = (suggestion) =>
    optimistic(suggestion, () => declineSuggestion(page.db, suggestion), {
      log: "Failed to decline suggestion:",
      alert: "Something went wrong declining that suggestion. Please try again.",
    });

  const suggestions = view ? view.suggestions : null;
  return (
    <div className="suggestions-card" id="suggestions-layout" hidden={!isAdmin}>
      <h2 className="suggestions-title">
        Suggestions{" "}
        <span className="suggestions-count" id="suggestions-count" hidden={!suggestions || suggestions.length === 0}>
          {suggestions ? String(suggestions.length) : ""}
        </span>
      </h2>

      <div className="assessment-calendar-loading" id="suggestions-loading" hidden={suggestions !== null}>
        <span className="assessment-calendar-spinner" />
      </div>

      <p className="suggestions-empty" id="suggestions-empty" hidden={!(suggestions && suggestions.length === 0)}>
        Nothing suggested right now.
      </p>

      <div className="suggestions-list" id="suggestions-list" hidden={!(suggestions && suggestions.length > 0)}>
        <div className="suggestions-row suggestions-row--header">
          <span className="suggestions-cell suggestions-cell--added">Added</span>
          <span className="suggestions-cell suggestions-cell--date">Date</span>
          <span className="suggestions-cell suggestions-cell--course">Course</span>
          <span className="suggestions-cell suggestions-cell--type">Type</span>
          <span className="suggestions-cell suggestions-cell--count">Count</span>
          <span className="suggestions-cell suggestions-cell--emails">Emails</span>
          <span className="suggestions-cell suggestions-cell--actions" />
        </div>
        <div className="suggestions-rows" id="suggestions-rows">
          {suggestions && suggestions.length > 0 && (
            <SuggestionRows key={view.generation} suggestions={suggestions} page={page} model={model} onAccept={accept} onDecline={decline} />
          )}
        </div>
      </div>
    </div>
  );
}

// lastAddedAt is restamped by each new suggester, so this is the most recent
// suggestion.
function formatAddedAt(ms, formatDate) {
  if (!ms) return "";
  const date = new Date(ms);
  const hours = date.getHours();
  const time = `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return `${formatDate(date)}, ${time}`;
}

function SuggestionRows({ suggestions, page, model, onAccept, onDecline }) {
  return suggestions
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((suggestion) => {
      const emails = suggestion.emails || [];
      // A summative on a day with a Testing Block could be in class or in the
      // Testing Block, so the admin picks.
      const choices =
        suggestion.type === "Summative" && dayHasTestingBlock(suggestion.date, model.sched, model.dayTypes)
          ? [
              ["In-Class", "In-Class"],
              ["Testing Block", "Testing Block"],
            ]
          : [["Accept", suggestion.type]];
      return (
        <div key={suggestion.id} className="suggestions-row">
          <span className="suggestions-cell suggestions-cell--added">{formatAddedAt(suggestion.lastAddedAt, page.formatDate)}</span>
          <span className="suggestions-cell suggestions-cell--date">{page.formatDate(fromISODate(suggestion.date))}</span>
          <span className="suggestions-cell suggestions-cell--course">{suggestion.courseName}</span>
          <span className="suggestions-cell suggestions-cell--type">{suggestion.type}</span>
          <span className="suggestions-cell suggestions-cell--count">{String(emails.length)}</span>
          {/* The domain is the same for everyone, so it's only noise. */}
          <span className="suggestions-cell suggestions-cell--emails">{emails.map((email) => email.split("@")[0]).join(", ")}</span>
          <div className="suggestions-cell suggestions-cell--actions">
            {choices.map(([label, type]) => (
              <button key={label} type="button" className="suggestions-accept-btn" onClick={() => onAccept(suggestion, type)}>
                {label}
              </button>
            ))}
            <button type="button" className="suggestions-decline-btn" onClick={() => onDecline(suggestion)}>
              Decline
            </button>
          </div>
        </div>
      );
    });
}
