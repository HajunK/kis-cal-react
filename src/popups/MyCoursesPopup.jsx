import { useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { expandCourseNames, findCourseCatalogEntry } from "../core/catalog.js";
import { aliasDivision, matchCourses } from "./courseSearch.js";

const PERIOD_COUNT = 8;

// The course's divisions, or null for a course without any (or no course).
function divisionsFor(name) {
  const course = findCourseCatalogEntry(name.trim());
  return course && course.divisions && course.divisions.length > 0 ? course.divisions : null;
}

// The My Courses card: a course for each of the 8 periods, typed with
// suggestions, a division where the course has them, and a button to show a
// course hidden from Domain again. Every edit saves at once. page: see
// main.jsx. focusPeriod opens it with that period's course selected (Domain's
// class names use it).
export function MyCoursesPopup({ page, focusPeriod = null, open }) {
  // Everything shown is read from the user's data as it is now; each save
  // redraws.
  const [, redraw] = useReducer((count) => count + 1, 0);
  const inputRefs = useRef([]);
  const allEmpty = page.periods().every((name) => !name || name.trim() === "");

  // Opens ready to type into: on an empty account, the first period.
  useLayoutEffect(() => {
    if (allEmpty && inputRefs.current[0]) {
      inputRefs.current[0].focus();
      inputRefs.current[0].select();
    }
    if (focusPeriod !== null && inputRefs.current[focusPeriod]) {
      inputRefs.current[focusPeriod].focus({ preventScroll: true });
      inputRefs.current[focusPeriod].select();
    }
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The last period deselects instead of wrapping around.
  const moveToNextPeriod = (index) => {
    const next = inputRefs.current[index + 1];
    if (index >= PERIOD_COUNT - 1 || !next) {
      inputRefs.current[index].blur();
      return;
    }
    next.focus();
    next.select();
  };

  return (
    <>
      <button type="button" className="settings-modal-close-btn" aria-label="Close" onClick={page.close}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      <h2 className="settings-title">My Courses</h2>
      {Array.from({ length: PERIOD_COUNT }, (_, index) => (
        <ScheduleRowSlot key={index} index={index}>
          <ScheduleRow
            index={index}
            page={page}
            open={open}
            placeholder={index === 0 ? (allEmpty ? "Start typing here" : "") : undefined}
            inputRef={(el) => (inputRefs.current[index] = el)}
            onSaved={redraw}
            onNext={() => moveToNextPeriod(index)}
          />
        </ScheduleRowSlot>
      ))}
    </>
  );
}

// Periods 1-4 (A days) and 5-8 (B days), with a line between.
function ScheduleRowSlot({ index, children }) {
  return (
    <>
      {index === 4 && <div className="settings-divider" />}
      {children}
    </>
  );
}

function ScheduleRow({ index, page, open, placeholder, inputRef, onSaved, onNext }) {
  const [value, setValue] = useState(() => page.periods()[index] || "");
  const [matches, setMatches] = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const fieldRef = useRef(null);
  const inputEl = useRef(null);
  const dropdownRef = useRef(null);
  const showBtnRef = useRef(null);
  const blurTimer = useRef(null);

  // A period's division, kept valid for its course: commit (a finished edit)
  // corrects and saves one the course no longer has; typing only shows.
  const syncDivision = (name, commit) => {
    const divisions = divisionsFor(name);
    const all = page.divisions();
    const saved = all[index] || "";
    const current = divisions && divisions.includes(saved) ? saved : "";
    if (commit && current !== saved) {
      all[index] = current;
      page.saveDivisions(all);
    }
  };

  // Every edit saves. Only a finished one (commit) redraws the tab underneath:
  // otherwise colors would follow every half-typed name and Domain cards would
  // fade on every letter.
  const persist = (commit, name = value) => {
    const current = page.periods();
    current[index] = name;
    page.savePeriods(current);
    syncDivision(name, commit);
    onSaved();
    if (!commit) return;
    page.refreshCalendar();
    page.refreshDomain();
  };

  // Opening checks the saved division too, as it always has: one the course
  // no longer has is cleared and saved.
  useLayoutEffect(() => {
    const before = page.divisions()[index] || "";
    syncDivision(value, true);
    if ((page.divisions()[index] || "") !== before) onSaved();
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMatches = (typed) => {
    setMatches(matchCourses(typed));
    setHighlighted(-1);
  };

  const pick = (name) => {
    // What was typed says which division, if it was an alias ("BC").
    const division = aliasDivision(name, inputEl.current.value);
    if (division) {
      const all = page.divisions();
      all[index] = division;
      page.saveDivisions(all);
    }
    // Into the field at once, not on the next render: Enter goes straight on
    // to the next period, and the blur that causes checks what the field
    // holds (half-typed, it would be rejected and cleared).
    inputEl.current.value = name;
    setValue(name);
    setMatches([]);
    persist(true, name);
  };

  // Moved to <body>: inside the popup the card's overflow and transform would
  // clip and misplace it. Flips above or shrinks so it never runs off the
  // screen.
  useLayoutEffect(() => {
    const dropdown = dropdownRef.current;
    const field = fieldRef.current;
    if (!dropdown || !field) return undefined;
    const SCREEN_MARGIN = 8;
    const FIELD_GAP = 8;
    const position = () => {
      if (dropdown.childElementCount === 0) return;
      const rect = field.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - FIELD_GAP - SCREEN_MARGIN;
      const spaceAbove = rect.top - FIELD_GAP - SCREEN_MARGIN;
      const wanted = Math.min(240, dropdown.scrollHeight);
      const openBelow = spaceBelow >= wanted || spaceBelow >= spaceAbove;
      dropdown.style.maxHeight = `${Math.max(80, Math.min(240, openBelow ? spaceBelow : spaceAbove))}px`;
      const width = Math.min(rect.width, window.innerWidth - SCREEN_MARGIN * 2);
      dropdown.style.width = `${width}px`;
      dropdown.style.left = `${Math.max(SCREEN_MARGIN, Math.min(rect.left, window.innerWidth - width - SCREEN_MARGIN))}px`;
      if (openBelow) {
        dropdown.style.top = `${rect.bottom + FIELD_GAP}px`;
        dropdown.style.bottom = "auto";
      } else {
        dropdown.style.bottom = `${window.innerHeight - rect.top + FIELD_GAP}px`;
        dropdown.style.top = "auto";
      }
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [matches]);

  useLayoutEffect(() => {
    if (highlighted < 0 || !dropdownRef.current) return;
    const item = dropdownRef.current.children[highlighted];
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const onKeyDown = (event) => {
    // Before the early return, so they work even with no matches showing.
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (matches.length > 0) {
        pick(matches[highlighted >= 0 ? highlighted : 0]);
      } else {
        // Rejected here rather than in the blur handler, whose own refocus
        // would fight onNext's.
        const name = value.trim();
        if (name !== "" && !findCourseCatalogEntry(name)) {
          page.toast("The course you typed does not exist.");
          setValue("");
          persist(true, "");
          inputEl.current.value = "";
        }
      }
      onNext();
      return;
    }
    if (matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted(highlighted < matches.length - 1 ? highlighted + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(highlighted > 0 ? highlighted - 1 : matches.length - 1);
    }
  };

  // Only a real course or a blank may stay; anything else is cleared and
  // warned. Covers Escape too, which just blurs.
  const onBlur = (event) => {
    const input = event.currentTarget;
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setMatches([]), 100);
    const name = input.value.trim();
    if (name !== "" && !findCourseCatalogEntry(name)) {
      page.toast("The course you typed does not exist.");
      setValue("");
      input.value = "";
      persist(true, "");
      // Deferred so it wins over the browser's own focus change in progress.
      setTimeout(() => input.focus(), 0);
      return;
    }
    persist(true, input.value);
  };

  const divisions = divisionsFor(value);
  const savedDivision = page.divisions()[index] || "";
  const division = divisions && divisions.includes(savedDivision) ? savedDivision : "";

  // A combo course can have either of its cards hidden.
  const name = value.trim();
  const hiddenCards = (name ? expandCourseNames([name]) : []).filter((card) => page.hidden().includes(card));
  // Its icon is loaded the first time it's needed, and kept.
  const showIconRef = useRef(null);
  if (hiddenCards.length > 0 && !showIconRef.current) showIconRef.current = page.uiIconPath("show.png");

  const showCourse = () => {
    page.saveHidden(page.hidden().filter((card) => !hiddenCards.includes(card)));
    animateFieldGrowth(fieldRef.current, () => {
      showBtnRef.current.hidden = true;
    });
    page.toast(`View ${name} in the Domain Tab`);
    page.refreshDomain();
    onSaved();
  };

  return (
    <div className="schedule-row">
      <span className="schedule-label">Period {index + 1}</span>
      <div className={`schedule-field${value.trim() !== "" ? " has-value" : ""}`} ref={fieldRef}>
        <input
          ref={(el) => {
            inputEl.current = el;
            inputRef(el);
          }}
          className="schedule-input"
          type="text"
          autoComplete="off"
          data-period={index}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            showMatches(event.target.value);
            persist(false, event.target.value);
          }}
          onFocus={(event) => showMatches(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        <button
          className="schedule-clear-btn"
          type="button"
          aria-label="Clear"
          onClick={() => {
            // Emptied at once, before the focus below suggests courses for
            // what the field holds.
            inputEl.current.value = "";
            setValue("");
            persist(true, "");
            inputEl.current.focus();
          }}
        >
          <span className="close-icon" aria-hidden="true" />
        </button>
      </div>
      <div className="division-picker" hidden={!divisions}>
        {divisions && !division && <span className="division-picker-label">Select division</span>}
        {divisions &&
          divisions.map((option) => (
            <button
              key={option}
              type="button"
              className={`division-option${option === division ? " division-option--selected" : ""}`}
              // mousedown, not click: blurring the course input first would
              // redraw this picker before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const all = page.divisions();
                all[index] = option;
                page.saveDivisions(all);
                syncDivision(value, true);
                onSaved();
                page.refreshCalendar();
                page.refreshDomain();
              }}
            >
              {option}
            </button>
          ))}
      </div>
      <button
        ref={showBtnRef}
        className="show-course-btn"
        type="button"
        data-period={index}
        aria-label="Show hidden course"
        hidden={hiddenCards.length === 0}
        onClick={showCourse}
      >
        <img className="show-course-icon" alt="" src={showIconRef.current || undefined} />
      </button>
      {open &&
        createPortal(
          <ul className="schedule-dropdown schedule-dropdown--floating" ref={dropdownRef}>
            {matches.map((course, i) => (
              <li
                key={course}
                className={`schedule-dropdown-item${i === highlighted ? " schedule-dropdown-item--highlighted" : ""}`}
                // Picked on mousedown, before the input's blur hides the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(course);
                }}
              >
                {course}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

// flex: 1 would snap to the new width; a FLIP transition reads better. As in
// the old my-courses.js.
function animateFieldGrowth(field, hideBtn) {
  const startWidth = field.getBoundingClientRect().width;
  hideBtn();
  const endWidth = field.getBoundingClientRect().width;

  // The measured widths include padding, so flex-basis must too, or it renders
  // about 20px too wide until released.
  field.style.boxSizing = "border-box";
  field.style.transition = "none";
  field.style.flex = `0 0 ${startWidth}px`;
  void field.offsetWidth;  // so the starting width applies first
  field.style.transition = "flex-basis 250ms ease";
  field.style.flex = `0 0 ${endWidth}px`;

  field.addEventListener(
    "transitionend",
    () => {
      // Only a temporary lock for the animation.
      field.style.transition = "";
      field.style.flex = "";
      field.style.boxSizing = "";
    },
    { once: true }
  );
}
