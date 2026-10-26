// Today's schedule, which the countdown pill in the tab bar grows into, from
// class-countdown.js unchanged: the panel and its Dynamic Island-like morph
// are built here, in <body>, around the pill ClassCountdown draws.

import { shortCourseName } from "../core/catalog.js";
import { toISODate } from "../core/dates.js";
import { SCHEDULE_BLOCKS } from "../core/schedule.js";
import { courseColorNames } from "../calendar/data.js";
import { loadPeriods } from "../shell/data.js";
import { parseTimeToMinutes } from "../shell/schedule.js";
import { allDayTypes, defaultPeriodTimes, scheduleForDate } from "../shell/school.js";
import { animateNumberChange } from "../shell/ui.js";

let todaySchedulePopup = null;
let classCountdownEl = null;

// The pill the schedule grows out of (ClassCountdown), or null once gone.
export function setCountdownPill(el) {
  classCountdownEl = el;
}

export const isTodayScheduleOpen = () => todaySchedulePopup !== null;

function formatScheduleClock(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}`;
}

// A date's events with their names, the student's course in each period.
// Empty without a bell schedule.
export function scheduleEventsOn(iso) {
  if (!defaultPeriodTimes) return [];
  const periods = loadPeriods();
  const events = [];
  const add = (label, time) => {
    if (time && time.start && time.end) events.push({ label, start: time.start, end: time.end });
  };
  const labels = { testingBlock: "Testing Block", advisory: "Advisory", academicSupport: "Academic Support" };
  scheduleForDate(iso).forEach((event) => {
    if (labels[event.key]) {
      add(labels[event.key], event);
      return;
    }
    if (event.key.startsWith("period")) {
      const periodIndex = Number(event.key.slice(6)) - 1;
      const course = (periods[periodIndex] || "").trim();
      add(course || `Period ${periodIndex + 1}`, event);
      if (course) events[events.length - 1].course = course;
      if (course) events[events.length - 1].short = shortCourseName(course);
      return;
    }
    // Lunch, or on a day not yet set A or B, a class slot showing both of its
    // periods ("Period 1/5").
    add(SCHEDULE_BLOCKS[Number(event.key.slice(5))].label, event);
  });
  return events;
}

// The next weekday with a schedule, up to two weeks out.
function nextScheduleDate(from) {
  for (let offset = 1; offset <= 14; offset++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const iso = toISODate(date);
    if (scheduleEventsOn(iso).length > 0) return { date, iso, offset };
  }
  return null;
}

const TODAY_SCHEDULE_CHEVRON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Today's schedule, or the next school day's (popup._viewingNext): a strip of
// the day's events sized by length, then each one, done, on now or still to
// come. A link at
// the bottom flips between the two days.
export function renderTodaySchedule(popup = todaySchedulePopup) {
  if (!popup) return;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const next = nextScheduleDate(now);
  const viewingNext = Boolean(popup._viewingNext && next);
  const date = viewingNext ? next.date : now;
  const iso = toISODate(date);
  const dayType = allDayTypes[iso];
  const hasType = dayType === "A" || dayType === "B";
  // Another day's events are all still to come.
  const minutesIn = viewingNext ? -Infinity : nowMinutes;

  const events = scheduleEventsOn(iso).map((event) => {
    const start = parseTimeToMinutes(event.start);
    const end = parseTimeToMinutes(event.end);
    const state = minutesIn >= end ? "past" : minutesIn >= start ? "now" : "future";
    return { ...event, startMin: start, endMin: end, state };
  });

  // Rebuilt only when something shown changes (it's called every second), so
  // the time moving in from the pill isn't swapped out from under its
  // animation. The ticking parts are updated after.
  const key = JSON.stringify([iso, events.map((event) => [event.label, event.start, event.end, event.state])]);
  if (popup._renderKey !== key) {
    popup._renderKey = key;
    buildTodaySchedule(popup, { date, hasType, dayType, events, next, viewingNext });
  }
  const current = events.find((event) => event.state === "now");
  if (current) {
    const done = (minutesIn - current.startMin) / (current.endMin - current.startMin);
    popup.querySelector(".today-schedule-segment--now")?.style.setProperty("--done", `${(done * 100).toFixed(2)}%`);
    // To the second here, rolling down like a clock; the pill keeps whole
    // minutes. Set outright when the row is new, rolled after.
    const remaining = popup.querySelector(".today-schedule-remaining-time");
    if (remaining) {
      // Both are whole seconds, so this rounds away float error; ceil turned
      // 2100.0000001 into 2101 and made the count stutter.
      const seconds = Math.max(0, Math.round((current.endMin - minutesIn) * 60));
      const pad = (value) => String(value).padStart(2, "0");
      // "1:02:14", or without the hour once it's 0 ("02:14"). At 1:00:00 to
      // 59:59, the roll shrinks the hour and its colon away and the rest
      // slides over into their place.
      const hours = Math.floor(seconds / 3600);
      const minutesAndSeconds = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
      const text = hours > 0 ? `${hours}:${minutesAndSeconds}` : minutesAndSeconds;
      animateNumberChange(remaining, text, remaining.dataset.rollValue === undefined ? "instant" : "countdown");
    }
  }
}

function buildTodaySchedule(popup, { date, hasType, dayType, events, next, viewingNext }) {
  // The event on now in its course's color, as on the Calendar (see
  // courseColorNames in src/calendar/data.js).
  const current = events.find((event) => event.state === "now");
  const colorName = current && current.course ? courseColorNames().get(current.course) : null;
  if (colorName) popup.style.setProperty("--event-color", `var(--color-${colorName})`);
  else popup.style.removeProperty("--event-color");

  const heading = popup.querySelector(".today-schedule-heading");
  heading.innerHTML = "";
  heading.appendChild(document.createElement("span")).className = "today-schedule-day";
  heading.lastChild.textContent = date.toLocaleDateString("en-US", { weekday: "long" });
  if (hasType) {
    const chip = heading.appendChild(document.createElement("span"));
    chip.className = "today-schedule-type";
    chip.textContent = `${dayType} Day`;
  }

  const strip = popup.querySelector(".today-schedule-strip");
  strip.innerHTML = "";
  events.forEach((event) => {
    const segment = strip.appendChild(document.createElement("span"));
    segment.className = `today-schedule-segment today-schedule-segment--${event.state}`;
    segment.style.flexGrow = String(event.endMin - event.startMin);
  });

  const list = popup.querySelector(".today-schedule-list");
  list.innerHTML = "";
  events.forEach((event) => {
    const row = list.appendChild(document.createElement("li"));
    row.className = `today-schedule-row today-schedule-row--${event.state}`;

    const mark = row.appendChild(document.createElement("span"));
    mark.className = "today-schedule-mark";

    const main = row.appendChild(document.createElement("div"));
    main.className = "today-schedule-main";
    const line = main.appendChild(document.createElement("div"));
    line.className = "today-schedule-line";
    const name = line.appendChild(document.createElement("span"));
    name.className = "today-schedule-name";
    const course = name.appendChild(document.createElement("span"));
    course.textContent = event.label;
    if (event.short) course.dataset.short = event.short;
    const time = line.appendChild(document.createElement("span"));
    time.className = "today-schedule-time";
    time.textContent = `${formatScheduleClock(event.start)} – ${formatScheduleClock(event.end)}`;

    // The pill's time left, under the name.
    if (event.state === "now") {
      const remaining = main.appendChild(document.createElement("div"));
      remaining.className = "today-schedule-remaining";
      remaining.innerHTML = '<span class="today-schedule-remaining-time"></span> left';
    }
  });

  const footer = popup.querySelector(".today-schedule-footer");
  footer.hidden = !next;
  if (next) {
    footer.classList.toggle("today-schedule-footer--back", viewingNext);
    if (viewingNext) {
      footer.innerHTML = `${TODAY_SCHEDULE_CHEVRON}<span>Back to today</span>`;
    } else {
      const nextType = allDayTypes[next.iso];
      const when = next.offset === 1 ? "Tomorrow" : next.date.toLocaleDateString("en-US", { weekday: "long" });
      footer.innerHTML =
        `<span><span class="today-schedule-footer-when">${when}</span>${nextType === "A" || nextType === "B" ? ` · ${nextType} Day` : ""}</span>` +
        TODAY_SCHEDULE_CHEVRON;
    }
  }
  if (popup.isConnected) fitTodayScheduleNames(popup);
}

// Measured, so the popup has to be on the page first.
function fitTodayScheduleNames(popup) {
  popup.querySelectorAll(".today-schedule-name").forEach((name) => {
    const course = name.querySelector("[data-short]");
    if (course && name.scrollWidth > name.clientWidth) course.textContent = course.dataset.short;
  });
}

const TODAY_SCHEDULE_MORPH_MS = 380;
// A little past and back, like the Dynamic Island settling into its new size.
const TODAY_SCHEDULE_SPRING = "cubic-bezier(0.32, 1.08, 0.42, 1)";

// The pill itself grows into the schedule, like the Dynamic Island: a panel
// laid exactly over it springs out from the pill's size to its own, held at
// the pill's right edge and top. Nothing moves across: what the pill showed
// blurs away where it is, and the schedule blurs in. Closing runs it
// backwards.
// Today to the next school day and back: the day's heading, strip and list
// swipe as the Domain date picker's days do between months (SLIDE_MS and the 24px
// shift in src/domain/ScoreDatePicker.jsx): the old day slides away and fades
// (in 0.7 of the time) as the new one slides in from the other side, and the
// window eases to the new day's height, since days have different numbers of
// events. Going to the next day moves left (the new day arrives from the right),
// and back to today does the reverse.
const SCHEDULE_SLIDE_MS = 220;
const SCHEDULE_SLIDE_SHIFT = 24;

function swapScheduleDay(popup) {
  const direction = popup._viewingNext ? -1 : 1;
  const days = popup.querySelector(".today-schedule-days");
  const header = popup.querySelector(".today-schedule-header");
  const heading = popup.querySelector(".today-schedule-heading");
  const current = () => days.querySelector(".today-schedule-pane:not(.today-schedule-pane--leaving)");
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animated = typeof days.animate === "function" && !reduced;

  const before = animated && {
    days: current().cloneNode(true),
    heading: heading.cloneNode(true),
    headingBox: { top: heading.offsetTop, left: heading.offsetLeft, width: heading.getBoundingClientRect().width },
    height: days.offsetHeight,
  };
  popup._viewingNext = !popup._viewingNext;
  renderTodaySchedule(popup);
  if (!before) return;

  const shift = SCHEDULE_SLIDE_SHIFT * direction;
  const slide = (outgoing, incoming) => {
    outgoing
      .animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: `translateX(${-shift}px)` },
        ],
        { duration: SCHEDULE_SLIDE_MS * 0.7, easing: "ease", fill: "forwards" }
      )
      .finished.catch(() => {})
      .finally(() => outgoing.remove());
    incoming.animate(
      [
        { opacity: 0, transform: `translateX(${shift}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: SCHEDULE_SLIDE_MS, easing: "ease" }
    );
  };

  const leavingDay = before.days;
  leavingDay.classList.add("today-schedule-pane--leaving");
  const to = days.offsetHeight;
  days.appendChild(leavingDay);
  if (before.height !== to) days.animate([{ height: `${before.height}px` }, { height: `${to}px` }], { duration: SCHEDULE_SLIDE_MS, easing: "ease" });
  slide(leavingDay, current());

  const leavingHeading = before.heading;
  leavingHeading.classList.add("today-schedule-heading--leaving");
  Object.assign(leavingHeading.style, {
    top: `${before.headingBox.top}px`,
    left: `${before.headingBox.left}px`,
    width: `${before.headingBox.width}px`,
  });
  header.appendChild(leavingHeading);
  slide(leavingHeading, heading);
}

export function openTodaySchedule() {
  if (!classCountdownEl || todaySchedulePopup) return;
  const rect = classCountdownEl.getBoundingClientRect();
  const panel = document.createElement("div");
  panel.className = "today-schedule-panel today-schedule-panel--morphing";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Today's schedule");
  panel.style.top = `${rect.top}px`;
  panel.style.right = `${window.innerWidth - rect.right}px`;
  panel.innerHTML = `
    <div class="today-schedule">
      <div class="today-schedule-header">
        <p class="today-schedule-heading"></p>
      </div>
      <div class="today-schedule-body">
        <div class="today-schedule-days">
          <div class="today-schedule-pane">
            <div class="today-schedule-strip" aria-hidden="true"></div>
            <ol class="today-schedule-list"></ol>
          </div>
        </div>
        <button type="button" class="today-schedule-footer"></button>
      </div>
    </div>
    <div class="today-schedule-pill-ghost" aria-hidden="true">
      ${classCountdownEl.querySelector(".class-countdown-icon").outerHTML}
      <span class="class-countdown-time"></span>
      <span class="class-countdown-sep">·</span>
      <span class="class-countdown-label"></span>
    </div>
  `;
  const popup = panel.querySelector(".today-schedule");
  // The header sits where the pill was, so a click there folds it back up.
  popup.querySelector(".today-schedule-header").addEventListener("click", closeTodaySchedule);
  popup.querySelector(".today-schedule-footer").addEventListener("click", () => swapScheduleDay(popup));
  // The pill as it was, left in place to fade.
  const ghost = panel.querySelector(".today-schedule-pill-ghost");
  ghost.style.height = `${rect.height}px`;
  ghost.querySelector(".class-countdown-time").textContent = classCountdownEl.dataset.timeText;
  ghost.querySelector(".class-countdown-label").textContent = classCountdownEl.querySelector(".class-countdown-label").textContent;
  renderTodaySchedule(popup);
  document.body.appendChild(panel);
  fitTodayScheduleNames(popup);
  todaySchedulePopup = popup;
  classCountdownEl.style.visibility = "hidden";

  const collapsed = { width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${rect.height / 2}px` };
  const open = { width: `${popup.offsetWidth}px`, height: `${popup.offsetHeight}px`, borderRadius: "20px" };
  panel._morph = panel.animate([collapsed, open], { duration: TODAY_SCHEDULE_MORPH_MS, easing: TODAY_SCHEDULE_SPRING });
  void panel.offsetWidth;  // so the shadow transitions in from none
  panel.classList.add("today-schedule-panel--lifted");
  ghost.animate(TODAY_SCHEDULE_OUT, { duration: TODAY_SCHEDULE_MORPH_MS * 0.35, easing: "ease-out", fill: "forwards" });
  popup.animate(TODAY_SCHEDULE_IN, {
    duration: TODAY_SCHEDULE_MORPH_MS * 0.7,
    delay: TODAY_SCHEDULE_MORPH_MS * 0.2,
    easing: "ease-out",
    fill: "backwards",
  });
  // Open, it sizes to its contents, which change with the day shown.
  panel._morph.onfinish = () => panel.classList.remove("today-schedule-panel--morphing");
}

// Blurring and fading where they are, the way the Dynamic Island swaps what
// it shows.
const TODAY_SCHEDULE_OUT = [
  { opacity: 1, filter: "blur(0)", transform: "scale(1)" },
  { opacity: 0, filter: "blur(6px)", transform: "scale(0.96)" },
];
const TODAY_SCHEDULE_IN = [
  { opacity: 0, filter: "blur(8px)", transform: "scale(0.97)" },
  { opacity: 1, filter: "blur(0)", transform: "scale(1)" },
];

// Where the pointer last was, for closeTodaySchedule.
const lastPointer = { x: -1, y: -1 };
document.addEventListener(
  "pointermove",
  (event) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
  },
  { passive: true }
);

export function closeTodaySchedule() {
  if (!todaySchedulePopup) return;
  const popup = todaySchedulePopup;
  const panel = popup.parentElement;
  todaySchedulePopup = null;
  const pill = classCountdownEl;
  const showPill = () => {
    panel.remove();
    if (!pill) return;
    pill.style.visibility = "";
    // With the pointer still over it, its hover ring would flash on as it
    // lands; the ring waits until the pointer leaves and comes back.
    const box = pill.getBoundingClientRect();
    const { x, y } = lastPointer;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      pill.classList.add("class-countdown-pill--settled");
      pill.addEventListener("mouseleave", () => pill.classList.remove("class-countdown-pill--settled"), { once: true });
    }
  };
  // Gone already (the class ended): nothing to shrink back into.
  if (!pill || pill.hidden) return showPill();

  const rect = pill.getBoundingClientRect();
  const from = { width: `${panel.offsetWidth}px`, height: `${panel.offsetHeight}px`, borderRadius: "20px" };
  panel._morph?.cancel();
  panel.classList.add("today-schedule-panel--morphing");
  panel.classList.remove("today-schedule-panel--lifted");
  const to = { width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${rect.height / 2}px` };
  const ghost = panel.querySelector(".today-schedule-pill-ghost");
  ghost.querySelector(".class-countdown-time").textContent = pill.dataset.timeText;
  popup.getAnimations().forEach((animation) => animation.cancel());
  ghost.getAnimations().forEach((animation) => animation.cancel());
  popup.animate([...TODAY_SCHEDULE_IN].reverse(), { duration: TODAY_SCHEDULE_MORPH_MS * 0.4, easing: "ease-in", fill: "forwards" });
  ghost.animate([...TODAY_SCHEDULE_OUT].reverse(), {
    duration: TODAY_SCHEDULE_MORPH_MS * 0.5,
    delay: TODAY_SCHEDULE_MORPH_MS * 0.35,
    easing: "ease-out",
    fill: "both",
  });
  panel.animate([from, to], { duration: TODAY_SCHEDULE_MORPH_MS, easing: TODAY_SCHEDULE_SPRING, fill: "forwards" }).onfinish =
    showPill;
}

// A click outside only closes it: caught on the way down and stopped there,
// so whatever was under the pointer (the Privacy Blur button beside it, say)
// isn't pressed by a click meant to dismiss the schedule.
window.addEventListener(
  "click",
  (event) => {
    if (!todaySchedulePopup) return;
    const path = event.composedPath();
    if (path.includes(todaySchedulePopup.parentElement) || (classCountdownEl && path.includes(classCountdownEl))) return;
    event.stopPropagation();
    event.preventDefault();
    closeTodaySchedule();
  },
  true
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTodaySchedule();
});

window.addEventListener("resize", closeTodaySchedule);
