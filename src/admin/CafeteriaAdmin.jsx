import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAdminEmail } from "../core/admins.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { addDays, lunchChoices, menuDocId, mondayOf } from "../menu/menuData.js";
import { tally } from "../menu/menuVotes.js";
import { ConfirmDialog } from "../ui/ConfirmDialog.jsx";

// The Cafeteria admin page: how the students voted on each day's lunch (cafeteriaVotes, one
// document a day; see menuVotes.js), laid out like the Assessments page: a calendar of the
// days (each marked with its votes), and a panel for the day picked. Admin-only here as a
// courtesy; firestore.rules lets any signed-in user read the votes, and the page only shows
// totals, never who voted for what.
const DOC_DATE = /^hs-(\d{4}-\d{2}-\d{2})$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function longDate(iso) {
  const date = fromISODate(iso);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// An admin's test vote is stored under a made-up key (never a user's uid), one of test-01 to
// test-30 (so a day holds at most 30); see the cafeteriaVotes rules in firestore.rules.
const TEST_PREFIX = "test-";
const TEST_KEYS = Array.from({ length: 30 }, (_, index) => `${TEST_PREFIX}${String(index + 1).padStart(2, "0")}`);

// A test vote is "A" or "B", or "-A" or "-B" to take a real vote off (students' own tallies
// ignore those).
const NEGATIVE = { A: "-A", B: "-B" };

// What a day's panel and calendar show: the real votes (base) plus the test votes' net for each
// menu, never below 0.
function shownCounts(base, tests) {
  const net = (choice) => Object.values(tests).filter((vote) => vote === choice).length - Object.values(tests).filter((vote) => vote === NEGATIVE[choice]).length;
  const a = Math.max(0, base.a + net("A"));
  const b = Math.max(0, base.b + net("B"));
  return { a, b, total: a + b, net: { A: net("A"), B: net("B") } };
}

// Every day with votes as { [date]: { a, b, total, base, tests } }, base being the real votes
// ({ a, b }) and tests the admin's test votes ({ key: "A" | "B" | "-A" | "-B" }); a and b are
// what they come to.
export function voteDays(snapshot) {
  const days = {};
  snapshot.forEach((doc) => {
    const match = DOC_DATE.exec(doc.id);
    if (!match) return;
    const votes = (doc.data() || {}).votes || {};
    const real = Object.fromEntries(Object.entries(votes).filter(([key]) => !key.startsWith(TEST_PREFIX)));
    const { a, b } = tally(real);
    const tests = Object.fromEntries(Object.entries(votes).filter(([key]) => key.startsWith(TEST_PREFIX)));
    days[match[1]] = votesOfDay({ a, b }, tests);
  });
  return days;
}

function votesOfDay(base, tests) {
  const { a, b, total } = shownCounts(base, tests);
  return { a, b, total, base, tests };
}

// How long the days take to slide between months, as in the Assessments page.
const MONTH_SLIDE_MS = 220;

// The menus are shown in Korean, as the Menu tab's are for now.
const LANGUAGE = "ko";

// One menu's dishes, each a line of text that is edited where it stands: hovering underlines it,
// clicking it grows the menu-colored underline (as in the Add popup's fields), Enter starts the
// next dish, clearing a dish (or its x) deletes it, and "Add dish" appends one. Saved, when the
// focus leaves the list, with onSave(the dishes).
function DishList({ dishes, onSave }) {
  const listRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const focusIndex = useRef(null);
  const cancelled = useRef(false);
  const shown = draft || dishes;
  useEffect(() => {
    if (focusIndex.current === null) return;
    const input = listRef.current && listRef.current.querySelectorAll("input")[focusIndex.current];
    focusIndex.current = null;
    if (input) input.focus();
  });

  const clean = (list) => list.map((dish) => dish.trim()).filter(Boolean);
  const save = (list) => {
    const next = clean(list);
    if (next.length > 0 && next.join("\n") !== dishes.join("\n")) onSave(next);
  };
  const finish = () => {
    if (draft && !cancelled.current) save(draft);
    cancelled.current = false;
    setDraft(null);
  };
  const change = (index, value) => setDraft(shown.map((dish, i) => (i === index ? value : dish)));
  const insertAfter = (index) => {
    focusIndex.current = index + 1;
    setDraft([...shown.slice(0, index + 1), "", ...shown.slice(index + 1)]);
  };
  const remove = (index) => {
    const next = shown.filter((_, i) => i !== index);
    if (next.length === 0) return;
    setDraft(null);
    save(next);
  };

  return (
    <div className="cafeteria-dish-list" ref={listRef} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && finish()}>
      <ul className="cafeteria-dishes">
        {shown.map((dish, index) => (
          <li key={index} className="cafeteria-dish" onClick={(event) => event.target === event.currentTarget && event.currentTarget.querySelector("input").focus()}>
            <input
              className="cafeteria-dish-input"
              value={dish}
              aria-label={`Dish ${index + 1}`}
              onFocus={() => !draft && setDraft([...dishes])}
              onChange={(event) => change(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (dish.trim()) insertAfter(index);
                } else if (event.key === "Escape") {
                  cancelled.current = true;
                  event.target.blur();
                } else if (event.key === "Backspace" && dish === "" && shown.length > 1) {
                  event.preventDefault();
                  focusIndex.current = Math.max(0, index - 1);
                  setDraft(shown.filter((_, i) => i !== index));
                }
              }}
            />
            {shown.length > 1 && (
              <button type="button" className="cafeteria-dish-remove" aria-label={`Delete ${dish || "dish"}`} onMouseDown={(event) => event.preventDefault()} onClick={() => remove(index)}>
                <span className="close-icon" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="cafeteria-dish-add" onClick={() => insertAfter(shown.length - 1)}>
        + Add dish
      </button>
    </div>
  );
}

// page: { auth, db }.
export function CafeteriaAdmin({ page }) {
  // undefined until Firebase has restored the session.
  const [user, setUser] = useState(undefined);
  const [days, setDays] = useState(null);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(null);
  useEffect(() => page.auth.onAuthStateChanged((next) => setUser(next)), [page]);
  const isAdmin = user !== undefined && isAdminEmail(user && user.email);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let current = true;
    page.db
      .collection("cafeteriaVotes")
      .get()
      .then((snapshot) => current && setDays(voteDays(snapshot)))
      .catch((error) => {
        console.error("Failed to load the cafeteria votes:", error);
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [page, isAdmin]);

  // The weeks' menus read so far (the week's Monday -> its document, or null where there isn't
  // one): those the month shown touches, for which of its days have a menu, and so the day
  // picked's.
  const [weeks, setWeeks] = useState({});
  const monday = selected ? mondayOf(selected) : null;
  const monthKey = toISODate(month);
  useEffect(() => {
    const last = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const wanted = [];
    for (let week = mondayOf(monthKey); week <= last; week = addDays(week, 7)) if (!(week in weeks)) wanted.push(week);
    if (wanted.length === 0) return undefined;
    let current = true;
    wanted.forEach((week) =>
      page.db
        .collection("cafeteriaMenus")
        .doc(menuDocId(week))
        .get()
        .then((snapshot) => current && setWeeks((known) => ({ ...known, [week]: snapshot.exists ? snapshot.data() : null })))
        .catch((error) => {
          console.error("Failed to load the menu:", error);
          if (current) setWeeks((known) => ({ ...known, [week]: null }));
        })
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, monthKey, weeks]);
  const dayOf = (iso) => {
    const week = weeks[mondayOf(iso)];
    return week && Array.isArray(week.days) ? week.days.find((candidate) => candidate.date === iso) : null;
  };
  const week = monday ? weeks[monday] : undefined;

  // Saves a menu's dishes (the Korean ones shown here) to the day's lunch, in the week's document.
  const saveDishes = (iso, menu, dishes) => {
    const key = mondayOf(iso);
    const before = weeks[key];
    if (!before) return;
    const text = dishes.join("\n");
    const change = (option) => (option.section === menu && option.status === "printed" ? { ...option, text } : option);
    const after = {
      ...before,
      days: before.days.map((day) =>
        day.date === iso ? { ...day, meals: { ...day.meals, lunch: { ...day.meals.lunch, [LANGUAGE]: day.meals.lunch[LANGUAGE].map(change) } } } : day
      ),
    };
    setWeeks((known) => ({ ...known, [key]: after }));
    page.db
      .collection("cafeteriaMenus")
      .doc(menuDocId(key))
      .update({ days: after.days })
      .catch((error) => {
        console.error("Failed to save the menu:", error);
        setWeeks((known) => ({ ...known, [key]: before }));
        window.alert("Something went wrong saving the menu. Please try again.");
      });
  };
  const choices = lunchChoices(selected ? dayOf(selected) : null, LANGUAGE);

  // Clearing: every test vote of the day, or (after asking) every vote.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearVotes = (iso, all) => {
    const day = days && days[iso];
    if (!day) return;
    const doc = page.db.collection("cafeteriaVotes").doc(`hs-${iso}`);
    const write = all ? () => doc.set({ votes: {} }) : () => doc.update(Object.fromEntries(Object.keys(day.tests).map((key) => [`votes.${key}`, page.deleteField()])));
    setTestBusy(true);
    write()
      .then(() => setDays((known) => ({ ...known, [iso]: votesOfDay(all ? { a: 0, b: 0 } : day.base, {}) })))
      .catch((error) => {
        console.error("Failed to clear the votes:", error);
        window.alert("Something went wrong clearing the votes. Please try again.");
      })
      .finally(() => setTestBusy(false));
  };

  // Test votes, for trying the page out: each is a vote under a made-up key, tagged to no one. A
  // minus takes off a test vote of that menu, or with none, adds one that takes a real vote off.
  // Counted here once saved.
  const [testBusy, setTestBusy] = useState(false);
  const stepTestVote = (iso, choice, direction) => {
    const day = (days && days[iso]) || votesOfDay({ a: 0, b: 0 }, {});
    const tests = day.tests;
    const wanted = direction > 0 ? choice : NEGATIVE[choice];
    const opposite = direction > 0 ? NEGATIVE[choice] : choice;
    const doc = page.db.collection("cafeteriaVotes").doc(`hs-${iso}`);
    const removable = Object.keys(tests).reverse().find((key) => tests[key] === opposite);
    let write;
    let next;
    if (removable) {
      write = () => doc.update({ [`votes.${removable}`]: page.deleteField() });
      next = Object.fromEntries(Object.entries(tests).filter(([key]) => key !== removable));
    } else {
      const key = TEST_KEYS.find((candidate) => !(candidate in tests));
      if (!key) {
        window.alert("That day already has 30 test votes. Remove some to add more.");
        return;
      }
      write = () => doc.set({ votes: { [key]: wanted } }, { merge: true });
      next = { ...tests, [key]: wanted };
    }
    setTestBusy(true);
    write()
      .then(() => setDays((known) => ({ ...known, [iso]: votesOfDay(day.base, next) })))
      .catch((error) => {
        console.error("Failed to change the test votes:", error);
        window.alert("Something went wrong changing the test votes. Please try again.");
      })
      .finally(() => setTestBusy(false));
  };

  // A month change as in the Assessments page: the old month's days slide out as the new one's
  // slide in, and the space eases between heights, since a month can take 5 rows or 6.
  const daysWindowRef = useRef(null);
  const gridRef = useRef(null);
  const slide = useRef(null);
  const slideCount = useRef(0);
  const changeMonth = (direction) => {
    if (gridRef.current) slide.current = { oldDays: gridRef.current.cloneNode(true), direction };
    setMonth((last) => new Date(last.getFullYear(), last.getMonth() + direction, 1));
    setSelected(null);
  };
  useLayoutEffect(() => {
    if (!slide.current) return;
    const { oldDays, direction } = slide.current;
    slide.current = null;
    const daysWindow = daysWindowRef.current;
    const newDays = gridRef.current;
    // No Web Animations in the tests' jsdom.
    if (!daysWindow || !newDays || !newDays.animate) return;
    daysWindow.querySelectorAll(".admin-cal-grid--leaving").forEach((left) => left.remove());
    oldDays.classList.add("admin-cal-grid--leaving");
    daysWindow.appendChild(oldDays);
    // Clipped only while sliding, so a day's hover and selection aren't.
    daysWindow.classList.add("admin-cal-days-window--sliding");
    const from = oldDays.offsetHeight;
    const to = newDays.offsetHeight;
    if (from !== to) daysWindow.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: MONTH_SLIDE_MS, easing: "ease" });
    const shift = 24 * direction;
    oldDays
      .animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: `translateX(${-shift}px)` },
        ],
        { duration: MONTH_SLIDE_MS * 0.7, easing: "ease", fill: "forwards" }
      )
      .finished.catch(() => {})
      .finally(() => oldDays.remove());
    const mine = ++slideCount.current;
    newDays
      .animate(
        [
          { opacity: 0, transform: `translateX(${shift}px)` },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: MONTH_SLIDE_MS, easing: "ease" }
      )
      .finished.catch(() => {})
      // Unless another month's slide has started since.
      .finally(() => mine === slideCount.current && daysWindow.classList.remove("admin-cal-days-window--sliding"));
  });

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < new Date(year, monthIndex, 1).getDay(); i++) {
    cells.push(<span key={`outside-${i}`} className="assessment-calendar-day assessment-calendar-day--outside" />);
  }
  for (let day = 1; day <= new Date(year, monthIndex + 1, 0).getDate(); day++) {
    const iso = toISODate(new Date(year, monthIndex, day));
    const total = days && days[iso] ? days[iso].total : 0;
    const isToday = year === today.getFullYear() && monthIndex === today.getMonth() && day === today.getDate();
    cells.push(
      <button
        key={iso}
        type="button"
        className={`assessment-calendar-day${selected === iso ? " assessment-calendar-day--selected" : ""}`}
        onClick={() => setSelected(iso)}
      >
        {/* Today is marked by a dot above its date, black (white in dark mode). */}
        {isToday && <span className="cafeteria-day-today" aria-label="Today" />}
        <span className="assessment-calendar-day-number">{day}</span>
        <span className="assessment-calendar-day-type" />
        {/* The day's votes under the date: Menu A's count, a bar split between the two menus
            (gray while there are none), and Menu B's count. None at all for a day with no menu
            (and no votes), nor while its menu is still being read. */}
        {(total > 0 || lunchChoices(dayOf(iso), LANGUAGE)) && (
          <span className="cafeteria-day-votes">
            <span className="cafeteria-day-count cafeteria-menu--a">{total > 0 ? days[iso].a : 0}</span>
            <span className={`cafeteria-day-bar${total > 0 ? "" : " cafeteria-day-bar--empty"}`} aria-hidden="true">
              {total > 0 && (
                <>
                  {days[iso].a > 0 && <span className="cafeteria-day-bar-a" style={{ width: `${(days[iso].a / total) * 100}%` }} />}
                  {days[iso].b > 0 && <span className="cafeteria-day-bar-b" style={{ width: `${(days[iso].b / total) * 100}%` }} />}
                </>
              )}
            </span>
            <span className="cafeteria-day-count cafeteria-menu--b">{total > 0 ? days[iso].b : 0}</span>
          </span>
        )}
      </button>
    );
  }

  // Only the days are held back, behind the loading ring, until the votes have been read.
  const loading = days === null && !failed;
  const testKeyCount = selected && days && days[selected] ? Object.keys(days[selected].tests).length : 0;
  const testNet = (choice) => {
    const tests = selected && days && days[selected] ? Object.values(days[selected].tests) : [];
    return tests.filter((vote) => vote === choice).length - tests.filter((vote) => vote === NEGATIVE[choice]).length;
  };
  const result = selected && days ? days[selected] || { a: 0, b: 0, total: 0 } : null;
  const stepper = (menu) => (
    <div className={`cafeteria-stepper cafeteria-stepper--${menu.toLowerCase()}`}>
      <button type="button" aria-label={`Remove a test vote for Menu ${menu}`} disabled={testBusy} onClick={() => stepTestVote(selected, menu, -1)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10" />
        </svg>
      </button>
      <span className="cafeteria-stepper-count">{testNet(menu) < 0 ? `−${-testNet(menu)}` : testNet(menu) > 0 ? `+${testNet(menu)}` : "0"}</span>
      <button type="button" aria-label={`Add a test vote for Menu ${menu}`} disabled={testBusy} onClick={() => stepTestVote(selected, menu, 1)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10M10 5v10" />
        </svg>
      </button>
    </div>
  );
  return (
    <>
      <p className="admin-not-authorized" hidden={user === undefined || isAdmin}>
        This page is for admins only.
      </p>

      <div className="admin-calendar-layout" hidden={!isAdmin}>
        <div className="assessment-calendar-card cafeteria-calendar">
          <h2 className="assessment-calendar-title">Cafeteria Menus</h2>
          <div className="assessment-calendar-header">
            <button type="button" className="assessment-calendar-nav-btn" aria-label="Previous month" onClick={() => changeMonth(-1)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M12 4.5L6.5 10l5.5 5.5" />
              </svg>
            </button>
            <span className="assessment-calendar-label">{`${MONTH_NAMES[monthIndex]} ${year}`}</span>
            <button type="button" className="assessment-calendar-nav-btn" aria-label="Next month" onClick={() => changeMonth(1)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M8 4.5l5.5 5.5L8 15.5" />
              </svg>
            </button>
          </div>
          <div className="assessment-calendar-weekday-row">
            {WEEKDAY_LABELS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="admin-cal-days-window" ref={daysWindowRef} hidden={loading}>
            <div className="assessment-calendar-grid" ref={gridRef}>{cells}</div>
          </div>
          <div className="assessment-calendar-loading" id="admin-cal-loading" hidden={!loading}>
            <div className="assessment-calendar-spinner" />
          </div>
        </div>

        <div className="admin-day-panel">
          <div className="admin-day-panel-header">
            <h2 className="admin-day-panel-title">{selected ? longDate(selected) : ""}</h2>
          </div>
          {failed && <p className="admin-day-entry-empty">The votes couldn't be loaded.</p>}
          {!failed && !result && <p className="admin-day-select-hint cafeteria-hint">Select a day</p>}
          {result && (
            <div className="admin-day-entry-list cafeteria-result">
              <div className="cafeteria-menus">
                {["A", "B"].map((menu) => (
                  <div key={menu} className={`cafeteria-menu cafeteria-menu--${menu.toLowerCase()}`}>
                    <h3 className="cafeteria-menu-name">Menu {menu}</h3>
                    {choices ? (
                      <DishList key={`${selected}-${menu}`} dishes={choices[menu]} onSave={(dishes) => saveDishes(selected, menu, dishes)} />
                    ) : (
                      <p className="cafeteria-no-menu">{week === undefined ? "" : "No menu."}</p>
                    )}
                  </div>
                ))}
              </div>
              {/* Nothing about voting for a day with no menu. */}
              {choices && (
                <>
                      {/* Like an election's: each side's count large at its end, and the bar filling
                      in from the two ends, with a tick at the half that wins it. With no votes
                      yet it's 0 to 0 over an empty gray bar. */}
                  <div className="cafeteria-tally">
                    <div className="cafeteria-tally-side cafeteria-menu--a">
                      <span className="cafeteria-tally-count">{result.a}</span>
                      <span className="cafeteria-tally-name">Menu A</span>
                    </div>
                    <div className="cafeteria-tally-side cafeteria-tally-side--b cafeteria-menu--b">
                      <span className="cafeteria-tally-count">{result.b}</span>
                      <span className="cafeteria-tally-name">Menu B</span>
                    </div>
                  </div>
                  <div className="cafeteria-votebar" role="img" aria-label={`${result.a} for Menu A, ${result.b} for Menu B`}>
                    {result.total > 0 && (
                      <>
                        <span className="cafeteria-votebar-a" style={{ width: `${(result.a / result.total) * 100}%` }} />
                        <span className="cafeteria-votebar-b" style={{ width: `${(result.b / result.total) * 100}%` }} />
                        <span className="cafeteria-votebar-half" />
                      </>
                    )}
                  </div>
                  {/* For trying the page out: votes tagged to no one. */}
                  <div className="cafeteria-test-votes">
                    <div className="cafeteria-test-row">
                      {stepper("A")}
                      {testKeyCount > 0 && (
                        <button type="button" className="cafeteria-clear-btn" disabled={testBusy} onClick={() => clearVotes(selected, false)}>
                          Clear test votes
                        </button>
                      )}
                      {stepper("B")}
                    </div>
                  </div>
                  {/* At the bottom of the panel. */}
                  <div className="cafeteria-test-row cafeteria-test-row--end">
                    {result.total > 0 && (
                      <button type="button" className="cafeteria-clear-btn" disabled={testBusy} onClick={() => setConfirmingClear(true)}>
                        Clear all votes
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmingClear}
        title="Clear all votes?"
        message={selected ? `Delete every vote for ${longDate(selected)}, the students' too? This can't be undone.` : ""}
        confirmLabel="Clear all votes"
        onConfirm={() => {
          setConfirmingClear(false);
          clearVotes(selected, true);
        }}
        onCancel={() => setConfirmingClear(false)}
      />
    </>
  );
}
