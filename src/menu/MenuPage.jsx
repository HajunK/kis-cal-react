import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fromISODate, todayISODate } from "../core/dates.js";
import { deleteField, firestore, hasFirebase } from "../shell/firebase.js";
import { sessionState } from "../shell/session.js";
import { scheduledTimeOn } from "../shell/school.js";
import { showToast } from "../shell/ui.js";
import { addDays, choiceDays, menuDocId, mondayOf, openingIndex } from "./menuData.js";
import { agreement, readVotes, saveVote, tally } from "./menuVotes.js";
import { Chevron, MenuSkeleton } from "./MenuSkeleton.jsx";
import { WheelTuner } from "./WheelTuner.jsx";
import { WHEEL_MS, createWheel } from "./wheel.js";

// Korean for now; the menus carry English too (see menuData.js).
const LANGUAGE = "ko";
// Weeks are looked for this far beyond the loaded ones when the arrows run out of days.
const WEEKS_PER_REACH = 3;
const PICK_KEY = "menuPick_";
// How long the text takes to fade in when the days first arrive (see menu.css).
const ARRIVE_MS = 400;

// Weeks already read this visit: week -> its document, or null where there isn't one.
const weekCache = new Map();

function readWeek(monday) {
  if (weekCache.has(monday)) return Promise.resolve(weekCache.get(monday));
  if (!hasFirebase()) return Promise.resolve(null);
  return firestore()
    .collection("cafeteriaMenus")
    .doc(menuDocId(monday))
    .get()
    .then((snapshot) => {
      const week = snapshot.exists ? snapshot.data() : null;
      weekCache.set(monday, week);
      return week;
    })
    .catch((error) => {
      console.error("Failed to load the menu:", error);
      return null;
    });
}

const readPick = (date) => {
  try {
    const value = localStorage.getItem(PICK_KEY + date);
    return value === "A" || value === "B" ? value : null;
  } catch {
    return null;
  }
};

const writePick = (date, pick) => {
  try {
    if (pick) localStorage.setItem(PICK_KEY + date, pick);
    else localStorage.removeItem(PICK_KEY + date);
  } catch {
    // Not kept; it still shows for this visit.
  }
};

// Whether the date's lunch has ended by now: only when the schedule defines a lunch for that
// day (an admin's Bell Schedule, or its usual times) and its end has passed.
function lunchIsOver(iso, now = new Date()) {
  const lunch = scheduledTimeOn(iso, "block2");
  if (!lunch || !lunch.end) return false;
  const [hours, minutes] = lunch.end.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
}

// A day within a day of today by its word ("today"), another day of this week by its weekday
// ("Friday"), else by its date.
const dayName = (iso) => {
  const today = todayISODate();
  if (iso === today) return "today";
  if (iso === addDays(today, 1)) return "tomorrow";
  if (iso === addDays(today, -1)) return "yesterday";
  if (mondayOf(iso) === mondayOf(today)) return fromISODate(iso).toLocaleDateString("en-US", { weekday: "long" });
  return fromISODate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

// The cards for another day, from a copy of the cards as they are: the same markup with that day's
// dishes and pick. For the days a turning wheel passes on its way (see wheel.js).
function cardsForDay(template, day) {
  const element = template.cloneNode(true);
  ["A", "B"].forEach((section) => {
    const card = element.querySelector(`.menu-card--${section.toLowerCase()}`);
    if (!card) return;
    const picked = readPick(day.date) === section;
    card.setAttribute("aria-checked", String(picked));
    const heading = card.querySelector(".menu-card-heading");
    const check = heading.querySelector(".menu-card-check");
    if (check) check.remove();
    if (picked) {
      const mark = document.createElement("span");
      mark.className = "menu-card-check";
      mark.setAttribute("aria-hidden", "true");
      heading.appendChild(mark);
    }
    card.querySelector(".menu-dishes").replaceChildren(
      ...day.choices[section].map((dish) => {
        const item = document.createElement("li");
        item.textContent = dish;
        return item;
      })
    );
  });
  return element;
}

// The ripple of a pick: a circle of the menu's color grows out from where the card was pressed
// (the middle, for the keyboard) to cover it, fading as it goes, and is gone.
const RIPPLE_MS = 700;
function ripple(card, clientX, clientY) {
  const layer = card.querySelector(".menu-card-ripples");
  if (!layer || typeof layer.animate !== "function") return;
  const box = card.getBoundingClientRect();
  const x = clientX === undefined ? box.width / 2 : clientX - box.left;
  const y = clientY === undefined ? box.height / 2 : clientY - box.top;
  // Out to the farthest corner, so it fills the card.
  const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  const wave = document.createElement("span");
  wave.className = "menu-card-ripple";
  Object.assign(wave.style, { left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` });
  layer.appendChild(wave);
  wave
    .animate([{ transform: "scale(0)", opacity: 0.28 }, { transform: "scale(1)", opacity: 0 }], { duration: RIPPLE_MS, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)" })
    .finished.catch(() => {})
    .finally(() => wave.remove());
}

// The Menu tab: the HS lunch's two menus for a day, the arrows moving between days, and a
// pick between them. A signed-in student's pick is a vote (see menuVotes.js) that the bar
// and the lines under the cards count; it's kept on this device too.
export function MenuPage({ firebaseReady }) {
  const today = useMemo(() => todayISODate(), []);
  const session = useSyncExternalStore(sessionState.subscribe, sessionState.get);
  const uid = session.user ? session.user.uid : null;
  const [weeks, setWeeks] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [localPick, setLocalPick] = useState(null);
  // The day's votes, read for one date; null for another day's, or until read.
  const [dayVotes, setDayVotes] = useState(null);
  // False once reading votes has been refused (before the rules for them are published):
  // picks then stay on this device.
  const [votesOpen, setVotesOpen] = useState(true);
  // Beyond which Monday no more days have turned up, either way.
  const reached = useRef({ before: false, after: false });
  const range = useRef(null);
  // True from opening until it's known whether the day opened on has a day either side of it:
  // the arrows wait, disabled, rather than offer one that may turn out to go nowhere.
  const [probing, setProbing] = useState(true);
  const titleRef = useRef(null);
  const cardsRef = useRef(null);
  // The title being left, to fade away once the new one is drawn.
  const titleSwap = useRef(null);
  // The wheel while it's turning ({ controller, startDate, template }), and the days as of the
  // last draw, for it to find the days it passes.
  const wheel = useRef(null);
  const daysRef = useRef([]);

  const days = useMemo(() => choiceDays(Object.values(weeks), LANGUAGE), [weeks]);
  const index = days.findIndex((day) => day.date === selected);
  daysRef.current = days;

  const loadWeeks = useCallback((mondays) => {
    return Promise.all(mondays.map((monday) => readWeek(monday).then((week) => [monday, week]))).then((entries) => {
      setWeeks((current) => ({ ...current, ...Object.fromEntries(entries) }));
      return entries;
    });
  }, []);

  // The weeks around today, and the day to open on.
  useEffect(() => {
    if (!firebaseReady) return undefined;
    let current = true;
    const monday = mondayOf(today);
    range.current = { first: addDays(monday, -7), last: addDays(monday, 7) };
    loadWeeks([range.current.first, monday, range.current.last]).then((entries) => {
      if (!current) return;
      const opened = choiceDays(entries.map(([, week]) => week), LANGUAGE);
      const at = openingIndex(opened, today, lunchIsOver(today));
      if (at !== -1) setSelected(opened[at].date);
      setLoaded(true);
      // The weeks loaded may stop at the day opened on: the next ones that way are read now,
      // so an arrow is only on if there's a day beyond.
      const probes = [];
      if (at === 0) probes.push(reach(-1));
      if (at === opened.length - 1) probes.push(reach(1));
      Promise.all(probes).finally(() => current && setProbing(false));
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseReady, today, loadWeeks]);

  useEffect(() => {
    setLocalPick(selected ? readPick(selected) : null);
  }, [selected]);

  // The day's votes, for a signed-in student.
  useEffect(() => {
    setDayVotes(null);
    if (!selected || !uid || !firebaseReady || !hasFirebase()) return undefined;
    let current = true;
    readVotes(firestore(), selected)
      .then((votes) => current && setDayVotes({ date: selected, votes }))
      .catch((error) => {
        if (!current) return;
        if (error && error.code === "permission-denied") setVotesOpen(false);
        else console.error("Failed to load the votes:", error);
      });
    return () => {
      current = false;
    };
  }, [selected, uid, firebaseReady]);

  // Past the loaded days: the next weeks that way are read, and the arrow goes on if they
  // have any, and stops being offered if not.
  const reach = (direction) => {
    const side = direction < 0 ? "before" : "after";
    if (reached.current[side] || !range.current) return Promise.resolve(null);
    const step = direction * 7;
    const start = direction < 0 ? range.current.first : range.current.last;
    const mondays = Array.from({ length: WEEKS_PER_REACH }, (_, n) => addDays(start, step * (n + 1)));
    range.current = direction < 0 ? { ...range.current, first: mondays[mondays.length - 1] } : { ...range.current, last: mondays[mondays.length - 1] };
    return loadWeeks(mondays).then((entries) => {
      const found = choiceDays(entries.map(([, week]) => week), LANGUAGE);
      if (found.length === 0) reached.current[side] = true;
      return found;
    });
  };

  // Shows another day. The cards go by on the wheel (wheel.js): if it's already turning it's
  // aimed at this day instead, from wherever it is, and the title fades to the new one.
  const show = (date) => {
    const title = titleRef.current;
    const cards = cardsRef.current;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A day the last draw doesn't have yet (weeks just read) is just shown.
    const known = daysRef.current.some((day) => day.date === date);
    if (known && title && cards && typeof cards.animate === "function" && !reduced) {
      const boxOf = (el) => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight });
      titleSwap.current = { title: title.cloneNode(true), box: boxOf(title) };
      if (!wheel.current) {
        const template = cards.cloneNode(true);
        template.style.visibility = "";
        const state = { startDate: selected, template, controller: null };
        const startIndex = () => daysRef.current.findIndex((day) => day.date === state.startDate);
        state.controller = createWheel({
          stage: cards.parentElement,
          cards,
          box: boxOf(cards),
          // The day the wheel began on is the cards as they were; the others are made from them.
          contentAt: (step) => {
            const at = startIndex() + step;
            const day = startIndex() === -1 ? null : daysRef.current[at];
            if (!day) return null;
            return step === 0 ? template : cardsForDay(template, day);
          },
          onSettled: () => {
            wheel.current = null;
          },
        });
        state.startIndex = startIndex;
        wheel.current = state;
      }
      const to = daysRef.current.findIndex((day) => day.date === date);
      wheel.current.controller.goTo(to - wheel.current.startIndex());
    }
    setSelected(date);
  };

  useLayoutEffect(() => {
    const leaving = titleSwap.current;
    titleSwap.current = null;
    if (!leaving || !titleRef.current) return;
    // The title stays where it is, and changes by fading: it isn't on the wheel.
    const title = leaving.title;
    title.setAttribute("aria-hidden", "true");
    Object.assign(title.style, {
      position: "absolute",
      top: `${leaving.box.top}px`,
      left: `${leaving.box.left}px`,
      width: `${leaving.box.width}px`,
      height: `${leaving.box.height}px`,
      margin: "0",
      pointerEvents: "none",
    });
    titleRef.current.parentElement.appendChild(title);
    title
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: WHEEL_MS * 0.5, easing: "ease", fill: "forwards" })
      .finished.catch(() => {})
      .finally(() => title.remove());
    titleRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: WHEEL_MS * 0.5, delay: WHEEL_MS * 0.25, easing: "ease", fill: "backwards" });
  }, [selected]);

  // Leaving the tab ends a turn in progress.
  useEffect(
    () => () => {
      if (wheel.current) wheel.current.controller.end();
    },
    []
  );

  const move = (direction) => {
    const at = index + direction;
    if (days[at]) {
      show(days[at].date);
      return;
    }
    reach(direction).then((found) => {
      if (found && found.length > 0) show(direction < 0 ? found[found.length - 1].date : found[0].date);
    });
  };

  // The left and right arrow keys are the arrow buttons: not while typing somewhere, nor with a
  // modifier held (those are the browser's, for going back and forward), nor where the button
  // has nowhere to go.
  const arrowKeys = useRef(null);
  arrowKeys.current = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    if (!canMove(direction)) return;
    event.preventDefault();
    move(direction);
  };
  useEffect(() => {
    const onKeyDown = (event) => arrowKeys.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const canMove = (direction) => !probing && index !== -1 && (Boolean(days[index + direction]) || !reached.current[direction < 0 ? "before" : "after"]);

  const votes = dayVotes && dayVotes.date === selected ? dayVotes.votes : null;
  // A signed-in student's vote once it's been read (it's theirs, from any device), else what
  // this device kept.
  const pick = votes && uid ? votes[uid] || null : localPick;
  const voting = Boolean(uid) && votesOpen && votes !== null;

  // The days whose results this visit has unlocked by a vote, which stay shown if the vote is
  // taken back. Kept only in memory, so a refresh hides them again until the student chooses.
  const [unlocked, setUnlocked] = useState(() => new Set());
  const showResults = Boolean(pick) || unlocked.has(selected);

  const choose = (section) => {
    const next = pick === section ? null : section;
    const date = selected;
    if (next) setUnlocked((known) => (known.has(date) ? known : new Set(known).add(date)));
    setLocalPick(next);
    writePick(date, next);
    if (!voting) return;
    const before = votes;
    const after = { ...votes };
    if (next) after[uid] = next;
    else delete after[uid];
    setDayVotes({ date, votes: after });
    saveVote(firestore(), date, uid, next, deleteField).catch((error) => {
      console.error("Failed to save the vote:", error);
      setDayVotes((current) => (current && current.date === date ? { date, votes: before } : current));
      showToast("Couldn\u2019t save your pick. Try again.");
    });
  };

  // A click on a card's scrollbar isn't a pick.
  const onCardClick = (event, section) => {
    const list = event.target.closest && event.target.closest(".menu-dishes");
    if (list && event.nativeEvent.offsetX > list.clientWidth && event.target === list) return;
    ripple(event.currentTarget, event.clientX, event.clientY);
    choose(section);
  };

  const day = index === -1 ? null : days[index];
  const titleDay = selected ? ` for ${dayName(selected)}` : "";

  // The first time the days arrive after the empty frame was shown, the text (the
  // dishes, and the day in the title) fades in rather than appearing.
  const skeletonShown = useRef(false);
  const [arriving, setArriving] = useState(false);
  if (!day) skeletonShown.current = true;
  useEffect(() => {
    if (!day || !skeletonShown.current) return undefined;
    skeletonShown.current = false;
    setArriving(true);
    const timer = setTimeout(() => setArriving(false), ARRIVE_MS + 100);
    return () => clearTimeout(timer);
  }, [Boolean(day)]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = tally(votes);
  const summary = voting ? agreement(votes, pick) : null;

  return (
    <div className={`menu-page${arriving ? " menu-page--arriving" : ""}`}>
      {new URLSearchParams(window.location.search).has("tune") ? <WheelTuner /> : null}
      {day ? (
        <>
          <div className="menu-heading">
            <h1 className="menu-title" ref={titleRef}>
              Lunch menu<span className="menu-title-day">{titleDay}</span>
            </h1>
            <button type="button" className="menu-arrow menu-arrow--prev" aria-label="Previous day" disabled={!canMove(-1)} onClick={() => move(-1)}>
              <Chevron />
            </button>
            <button type="button" className="menu-arrow menu-arrow--next" aria-label="Next day" disabled={!canMove(1)} onClick={() => move(1)}>
              <Chevron flip />
            </button>
          </div>
          <div className="menu-stage">
            <div className="menu-cards" role="radiogroup" aria-label="Lunch menu" ref={cardsRef}>
              {["A", "B"].map((section) => (
                <div
                  key={section}
                  role="radio"
                  tabIndex={0}
                  aria-checked={pick === section}
                  className={`menu-card menu-card--${section.toLowerCase()}`}
                  onClick={(event) => onCardClick(event, section)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      ripple(event.currentTarget);
                      choose(section);
                    }
                  }}
                >
                  <span className="menu-card-heading">
                    Menu {section}
                    {pick === section ? <span className="menu-card-check" aria-hidden="true" /> : null}
                  </span>
                  <ul className="menu-dishes" lang={LANGUAGE}>
                    {day.choices[section].map((dish, dishIndex) => (
                      <li key={dishIndex}>{dish}</li>
                    ))}
                  </ul>
                  <span className="menu-card-ripples" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
          {uid && votesOpen ? (
            <div className="menu-votes">
              {/* An empty gray bar from the start; the blue and red grow into it from each end
                  once the student has chosen for that day (and the votes are in), and not
                  before: the results aren't shown until they've picked, and stay shown for
                  the rest of the visit if they take it back. */}
              <div
                className="menu-votebar"
                role="img"
                aria-label={showResults ? `${counts.a} for Menu A, ${counts.b} for Menu B` : "The votes show once you choose a menu"}
              >
                <span className={`menu-votebar-hint${showResults ? " menu-votebar-hint--gone" : ""}`} aria-hidden="true">
                  Choose the menu you want
                </span>
                <span className="menu-votebar-a" style={{ width: showResults && counts.total ? `${(counts.a / counts.total) * 100}%` : "0%" }} />
                <span className="menu-votebar-b" style={{ width: showResults && counts.total ? `${(counts.b / counts.total) * 100}%` : "0%" }} />
              </div>
              {summary ? (
                <p className="menu-votes-text">
                  <strong className={`menu-votes-percent menu-votes-percent--${pick.toLowerCase()}`}>{summary.percent}% of students</strong> agree with you
                  {summary.line ? <span className="menu-votes-line">Expect a {summary.line} line today</span> : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : loaded ? (
        <p className="menu-empty">No menu has been posted yet.</p>
      ) : (
        <MenuSkeleton signedIn={Boolean(uid) && votesOpen} />
      )}
    </div>
  );
}
