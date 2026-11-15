import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAdminEmail } from "../core/admins.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { addDays, lunchChoices, menuDocId, mondayOf } from "../menu/menuData.js";
import { tally } from "../menu/menuVotes.js";

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

// Every day with votes as { [date]: { a, b, total, tests } }, tests being the admin's test
// votes among them ({ key: "A" | "B" }).
export function voteDays(snapshot) {
  const days = {};
  snapshot.forEach((doc) => {
    const match = DOC_DATE.exec(doc.id);
    if (!match) return;
    const votes = (doc.data() || {}).votes;
    const { a, b, total } = tally(votes);
    days[match[1]] = { a, b, total, tests: Object.fromEntries(Object.entries(votes || {}).filter(([key]) => key.startsWith(TEST_PREFIX))) };
  });
  return days;
}

// How long the days take to slide between months, as in the Assessments page.
const MONTH_SLIDE_MS = 220;

// The menus are shown in Korean, as the Menu tab's are for now.
const LANGUAGE = "ko";

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
  const choices = lunchChoices(selected ? dayOf(selected) : null, LANGUAGE);

  // Test votes, for trying the page out: each is a vote under a made-up key, tagged to no one.
  // Counted here once saved.
  const [testBusy, setTestBusy] = useState(false);
  const changeTestVotes = (iso, write, apply) => {
    setTestBusy(true);
    write()
      .then(() => setDays((known) => ({ ...known, [iso]: apply(known[iso] || { a: 0, b: 0, total: 0, tests: {} }) })))
      .catch((error) => {
        console.error("Failed to change the test votes:", error);
        window.alert("Something went wrong changing the test votes. Please try again.");
      })
      .finally(() => setTestBusy(false));
  };
  const addTestVote = (iso, choice) => {
    const taken = (days[iso] && days[iso].tests) || {};
    const key = TEST_KEYS.find((candidate) => !(candidate in taken));
    if (!key) {
      window.alert("That day already has 30 test votes. Remove them to add more.");
      return;
    }
    changeTestVotes(
      iso,
      () => page.db.collection("cafeteriaVotes").doc(`hs-${iso}`).set({ votes: { [key]: choice } }, { merge: true }),
      (day) => ({ a: day.a + (choice === "A" ? 1 : 0), b: day.b + (choice === "B" ? 1 : 0), total: day.total + 1, tests: { ...day.tests, [key]: choice } })
    );
  };
  const clearTestVotes = (iso) => {
    const tests = (days[iso] && days[iso].tests) || {};
    const doc = page.db.collection("cafeteriaVotes").doc(`hs-${iso}`);
    changeTestVotes(
      iso,
      () => doc.update(Object.fromEntries(Object.keys(tests).map((key) => [`votes.${key}`, page.deleteField()]))),
      (day) => {
        const a = Object.values(tests).filter((choice) => choice === "A").length;
        const b = Object.values(tests).length - a;
        return { a: day.a - a, b: day.b - b, total: day.total - a - b, tests: {} };
      }
    );
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
        <span className={`assessment-calendar-day-number${isToday ? " assessment-calendar-day-number--today" : ""}`}>{day}</span>
        <span className="assessment-calendar-day-type" />
        {/* An underline of the day's votes, blue from the left and red from the right as in the
            day's panel, and gray where there are none; none at all for a day with no menu (and
            no votes), nor while its menu is still being read. */}
        {(total > 0 || lunchChoices(dayOf(iso), LANGUAGE)) && (
          <span className={`cafeteria-day-line${total > 0 ? "" : " cafeteria-day-line--empty"}`} aria-hidden="true">
            {total > 0 && (
              <>
                {days[iso].a > 0 && <span className="cafeteria-day-line-a" style={{ width: `${(days[iso].a / total) * 100}%` }} />}
                {days[iso].b > 0 && <span className="cafeteria-day-line-b" style={{ width: `${(days[iso].b / total) * 100}%` }} />}
              </>
            )}
          </span>
        )}
      </button>
    );
  }

  // Only the days are held back, behind the loading ring, until the votes have been read.
  const loading = days === null && !failed;
  const testCount = selected && days && days[selected] ? Object.keys(days[selected].tests || {}).length : 0;
  const result = selected && days ? days[selected] || { a: 0, b: 0, total: 0 } : null;
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
              <hr className="cafeteria-divider" />
              <div className="cafeteria-menus">
                {["A", "B"].map((menu) => (
                  <div key={menu} className={`cafeteria-menu cafeteria-menu--${menu.toLowerCase()}`}>
                    <h3 className="cafeteria-menu-name">Menu {menu}</h3>
                    {choices ? (
                      <ul className="cafeteria-dishes">
                        {choices[menu].map((dish, index) => (
                          <li key={index}>{dish}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cafeteria-no-menu">{week === undefined ? "" : "No menu."}</p>
                    )}
                  </div>
                ))}
              </div>
              {/* Nothing about voting for a day with no menu. */}
              {choices && (
                <>
                  <hr className="cafeteria-divider" />
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
                    <span className="cafeteria-test-label">Test votes</span>
                    <button type="button" className="cafeteria-test-btn cafeteria-menu--a" disabled={testBusy} onClick={() => addTestVote(selected, "A")}>
                      + Menu A
                    </button>
                    <button type="button" className="cafeteria-test-btn cafeteria-menu--b" disabled={testBusy} onClick={() => addTestVote(selected, "B")}>
                      + Menu B
                    </button>
                    {testCount > 0 && (
                      <button type="button" className="cafeteria-test-btn" disabled={testBusy} onClick={() => clearTestVotes(selected)}>
                        {`Remove ${testCount} test ${testCount === 1 ? "vote" : "votes"}`}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
