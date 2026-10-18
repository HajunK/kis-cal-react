// The Bell Schedule popup's model and rows, carried over from the old
// assessments-admin.js unchanged, so dragging an event, skipping a slot and
// the rows gliding into place look exactly as they did. React renders the
// popup around the rows; the rows themselves are built and moved here.
//
// sched: { times, testingBlock, academicSupport, advisory, daySchedules }, the
// periodTimes/default doc as loaded (null parts where there's none yet).
// dayTypes: { [iso]: "A" | "B" }.

// Mirrors SCHEDULE_BLOCKS in src/core/schedule.js.
const SCHEDULE_BLOCK_LABELS = ["Period 1/5", "Period 2/6", "Lunch", "Period 3/7", "Period 4/8"];
// Which period the class slots (block0, 1, 3, 4) hold on an A day; a B day's
// is 4 more.
const BLOCK_PERIOD_SLOTS = [0, 1, null, 2, 3];
// The Bell Schedule's slots. blockN is times[N]; the others are their own
// fields. Mirrors SCHEDULE_EVENT_KEYS in src/core/schedule.js.
const SCHEDULE_EVENT_KEYS = ["testingBlock", "advisory", "block0", "block1", "block2", "block3", "block4", "academicSupport"];
const PERIOD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `period${n}`);
const SCHEDULE_EVENT_LABELS = {
  testingBlock: "Testing Block",
  advisory: "Advisory",
  academicSupport: "Academic Support",
  ...Object.fromEntries(SCHEDULE_BLOCK_LABELS.map((label, index) => [`block${index}`, label])),
  ...Object.fromEntries(PERIOD_KEYS.map((key, index) => [key, `Period ${index + 1}`])),
};

// Seeded the first time a day is marked A or B, so there's a sensible schedule
// without a trip through the Bell Schedule first.
export const DEFAULT_SCHEDULE_TIMES = [
  { start: "08:50", end: "10:13" },
  { start: "10:18", end: "11:41" },
  { start: "11:41", end: "12:30" },
  { start: "12:30", end: "13:53" },
  { start: "13:58", end: "15:21" },
];
export const DEFAULT_TESTING_BLOCK_TIMES = { start: "08:00", end: "08:50" };
export const DEFAULT_ACADEMIC_SUPPORT_TIMES = { start: "15:25", end: "16:00" };
export const DEFAULT_ADVISORY_TIMES = { start: "08:20", end: "08:45" };

// An event's normal times, which are also its slot's times.
function eventTimes(key, sched) {
  if (key === "testingBlock") return sched.testingBlock || DEFAULT_TESTING_BLOCK_TIMES;
  if (key === "advisory") return sched.advisory || DEFAULT_ADVISORY_TIMES;
  if (key === "academicSupport") return sched.academicSupport || DEFAULT_ACADEMIC_SUPPORT_TIMES;
  const index = Number(key.slice(5));
  return (sched.times && sched.times[index]) || DEFAULT_SCHEDULE_TIMES[index];
}

// Normally the Testing Block is Mondays and Fridays, Advisory the other
// weekdays, and everything else every weekday.
function normallyIncluded(key, weekday) {
  if (key === "testingBlock") return weekday === 1 || weekday === 5;
  if (key === "advisory") return weekday !== 1 && weekday !== 5;
  return true;
}

// What a slot normally holds: itself, except a class slot, which holds the
// day's period, or both ("Period 1/5") on a day not set A or B.
function defaultScheduleEvent(slot, dayType) {
  const periodSlot = slot.startsWith("block") ? BLOCK_PERIOD_SLOTS[Number(slot.slice(5))] : null;
  if (periodSlot === null || (dayType !== "A" && dayType !== "B")) return slot;
  return `period${periodSlot + (dayType === "A" ? 1 : 5)}`;
}

// Every event a date can hold, in the order the ones it doesn't are listed:
// the day's own slots, then the periods (or, on a day not set A or B, the
// shared class slots).
function scheduleEventOrder(dayType) {
  const shared = SCHEDULE_EVENT_KEYS.filter((key) => !key.startsWith("block") || BLOCK_PERIOD_SLOTS[Number(key.slice(5))] === null);
  const classes = dayType === "A" || dayType === "B" ? PERIOD_KEYS : SCHEDULE_EVENT_KEYS.filter((key) => !shared.includes(key));
  return [...shared, ...classes];
}

// Every slot in time order, with the event a date puts there and whether it
// happens; then whatever no slot holds (normally the other day's periods).
// Mirrors scheduleForDate in src/core/schedule.js, which also drops what
// doesn't happen. custom: the date's own arrangement (default: the saved one;
// null: its normal one).
export function scheduleSlotsFor(iso, sched, dayTypes, custom = sched.daySchedules[iso]) {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  const dayType = dayTypes[iso];
  const slots = SCHEDULE_EVENT_KEYS.map((slot) => ({ slot, time: eventTimes(slot, sched) }))
    .sort((a, b) => (a.time.start < b.time.start ? -1 : a.time.start > b.time.start ? 1 : 0))
    .map(({ slot }) => {
      const key = (custom && custom.slots && custom.slots[slot]) || defaultScheduleEvent(slot, dayType);
      const included = custom && Array.isArray(custom.included) ? custom.included.includes(key) : normallyIncluded(key, weekday);
      return { slot, key, included };
    });
  const placed = new Set(slots.map(({ key }) => key));
  const unplaced = scheduleEventOrder(dayType)
    .filter((key) => !placed.has(key))
    .map((key) => ({ slot: null, key, included: false }));
  return [...slots, ...unplaced];
}

export function dayHasTestingBlock(iso, sched, dayTypes) {
  return scheduleSlotsFor(iso, sched, dayTypes).some(({ key, included }) => key === "testingBlock" && included);
}

// One row per slot, in time order. The times belong to the slot and are the
// same every day; the event in it (grip and name) is this date's and can be
// dragged to another slot. Events no slot holds get a row of their own, with
// no times, below the line.
export function renderScheduleRows(container, slots, sched, dayType) {
  container.innerHTML = "";
  slots.forEach(({ slot, key, included }, index) => {
    const row = document.createElement("div");
    row.className = "admin-schedule-row";
    row.dataset.position = String(index);
    if (slot) {
      const time = eventTimes(slot, sched);
      row.dataset.slot = slot;
      row.innerHTML = `
        <input type="time" class="admin-schedule-time-input" aria-label="Start" />
        <span class="admin-schedule-row-sep">–</span>
        <input type="time" class="admin-schedule-time-input" aria-label="End" />
      `;
      const [startInput, endInput] = row.querySelectorAll(".admin-schedule-time-input");
      startInput.value = time.start || "";
      endInput.value = time.end || "";
    } else {
      row.classList.add("admin-schedule-row--unplaced");
    }
    const event = buildScheduleEvent(key);
    row.prepend(event);
    setScheduleEventIncluded(event, included);
    container.appendChild(row);
  });
  arrangeScheduleRows(container, dayType, false);
}

// What the day has comes first, in time order; what it skips goes below a
// line, like the Calendar's Upcoming list keeps finished tasks under its own,
// then the events it doesn't hold at all. Rows that move glide to their new
// places; fromTops overrides where a row starts from, like one just dropped.
export function arrangeScheduleRows(container, dayType, animate = true, fromTops = new Map()) {
  const rows = [...container.querySelectorAll(".admin-schedule-row")];
  const before = new Map(rows.map((row) => [row, fromTops.get(row) ?? row.getBoundingClientRect().top]));
  let divider = container.querySelector(".admin-schedule-divider");
  if (!divider) {
    divider = document.createElement("div");
    divider.className = "admin-schedule-divider";
    divider.setAttribute("aria-hidden", "true");
  }
  const byPosition = (a, b) => Number(a.dataset.position) - Number(b.dataset.position);
  const unplaced = rows.filter((row) => row.classList.contains("admin-schedule-row--unplaced"));
  const slotted = rows.filter((row) => !unplaced.includes(row)).sort(byPosition);
  const on = slotted.filter((row) => !row.classList.contains("admin-schedule-row--off"));
  const off = slotted.filter((row) => row.classList.contains("admin-schedule-row--off"));
  const order = scheduleEventOrder(dayType);
  const eventOrder = (row) => order.indexOf(row.querySelector(".admin-schedule-event").dataset.key);
  unplaced.sort((a, b) => eventOrder(a) - eventOrder(b));
  // With nothing below the line, says what the space is for.
  let empty = container.querySelector(".admin-schedule-empty");
  if (!empty) {
    empty = document.createElement("p");
    empty.className = "admin-schedule-empty";
    empty.textContent = "Drag here";
  }
  container.append(...on, divider, ...off, ...unplaced, empty);
  empty.hidden = off.length + unplaced.length > 0;
  if (!animate) return;
  rows.forEach((row) => {
    const shift = before.get(row) - row.getBoundingClientRect().top;
    if (!shift) return;
    row.style.transition = "none";
    row.style.transform = `translateY(${shift}px)`;
    void row.offsetWidth;  // so the start position applies before the transition
    row.style.transition = "transform 0.25s ease";
    row.style.transform = "";
    setTimeout(() => (row.style.transition = ""), 260);
  });
}

function buildScheduleEvent(key) {
  const event = document.createElement("div");
  event.className = "admin-schedule-event";
  event.dataset.key = key;
  event.innerHTML = `
    <button type="button" class="admin-schedule-drag" aria-label="Move ${SCHEDULE_EVENT_LABELS[key]}">
      <svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>
    </button>
    <span class="admin-schedule-row-label"></span>
  `;
  event.querySelector(".admin-schedule-row-label").textContent = SCHEDULE_EVENT_LABELS[key];
  return event;
}

// Off means below the line: a slot the day skips, or a period it doesn't hold.
function setScheduleEventIncluded(event, included) {
  event.classList.toggle("admin-schedule-event--off", !included);
  event.closest(".admin-schedule-row")?.classList.toggle("admin-schedule-row--off", !included);
}

// The times by slot, and this date's arrangement.
export function readScheduleRows(container) {
  const schedule = { times: [] };
  const slots = {};
  const included = [];
  container.querySelectorAll(".admin-schedule-row:not(.admin-schedule-row--unplaced)").forEach((row) => {
    const [startInput, endInput] = row.querySelectorAll(".admin-schedule-time-input");
    const time = { start: startInput.value, end: endInput.value };
    const slot = row.dataset.slot;
    if (slot.startsWith("block")) schedule.times[Number(slot.slice(5))] = time;
    else schedule[slot] = time;
    const event = row.querySelector(".admin-schedule-event");
    slots[slot] = event.dataset.key;
    if (!event.classList.contains("admin-schedule-event--off")) included.push(event.dataset.key);
  });
  return { schedule, day: { slots, included } };
}

// null when the date is arranged as normal, so nothing needs storing; else
// only the slots that hold something unusual.
export function customDaySchedule(iso, day, sched, dayTypes) {
  const normal = scheduleSlotsFor(iso, sched, dayTypes, null).filter(({ slot }) => slot);
  const slots = {};
  normal.forEach(({ slot, key }) => {
    if (day.slots[slot] !== key) slots[slot] = day.slots[slot];
  });
  const normalIncluded = normal.filter(({ included }) => included).map(({ key }) => key);
  const sameIncluded = normalIncluded.length === day.included.length && normalIncluded.every((key) => day.included.includes(key));
  return Object.keys(slots).length || !sameIncluded ? { slots, included: day.included } : null;
}

// Every slot needs times except one the day skips.
export function scheduleRowsComplete(container) {
  return [...container.querySelectorAll(".admin-schedule-row:not(.admin-schedule-row--off)")].every((row) =>
    [...row.querySelectorAll(".admin-schedule-time-input")].every((input) => input.value)
  );
}

// Drag an event by its grip to another slot: it follows the pointer, the
// events in between slide one slot over, and the times stay put. Dragged below
// the line, the day skips its slot; dragged back above, it returns to it. An
// event no slot holds (another day's period, say), dropped on a slot, takes
// it, swapping the slot's event down. Arrow keys on the grip move, skip and
// restore a step at a time.
export function enableScheduleReorder(container, dayType) {
  const onRows = () => [...container.querySelectorAll(".admin-schedule-row:not(.admin-schedule-row--off)")];
  // Puts the events into the day's rows in this order.
  const place = (events) => {
    onRows().forEach((row, index) => row.prepend(events[index]));
  };
  const setSkipped = (event, skipped, droppedTop) => {
    const row = event.closest(".admin-schedule-row");
    setScheduleEventIncluded(event, !skipped);
    arrangeScheduleRows(container, dayType, true, droppedTop === undefined ? undefined : new Map([[row, droppedTop]]));
  };
  // An unplaced event takes a slot; the slot's event leaves for its row below
  // the line.
  const swapIn = (event, targetRow, droppedTop) => {
    const sourceRow = event.closest(".admin-schedule-row");
    const displaced = targetRow.querySelector(".admin-schedule-event");
    const displacedTop = displaced.getBoundingClientRect().top;
    targetRow.prepend(event);
    sourceRow.prepend(displaced);
    setScheduleEventIncluded(event, true);
    setScheduleEventIncluded(displaced, false);
    arrangeScheduleRows(container, dayType, true, new Map([[targetRow, droppedTop], [sourceRow, displacedTop]]));
  };

  container.addEventListener("keydown", (keyEvent) => {
    const handle = keyEvent.target.closest(".admin-schedule-drag");
    if (!handle || (keyEvent.key !== "ArrowUp" && keyEvent.key !== "ArrowDown")) return;
    keyEvent.preventDefault();
    const dragged = handle.closest(".admin-schedule-event");
    const up = keyEvent.key === "ArrowUp";
    const row = dragged.closest(".admin-schedule-row");
    if (row.classList.contains("admin-schedule-row--unplaced")) {
      // Into the last slot the day uses.
      const rows = onRows();
      if (up && rows.length) swapIn(dragged, rows[rows.length - 1]);
    } else if (dragged.classList.contains("admin-schedule-event--off")) {
      if (up) setSkipped(dragged, false);
    } else {
      const events = onRows().map((r) => r.querySelector(".admin-schedule-event"));
      const from = events.indexOf(dragged);
      const to = from + (up ? -1 : 1);
      if (to >= events.length) setSkipped(dragged, true);
      else if (to >= 0) {
        [events[from], events[to]] = [events[to], events[from]];
        place(events);
      }
    }
    handle.focus();
  });

  container.addEventListener("pointerdown", (downEvent) => {
    const handle = downEvent.target.closest(".admin-schedule-drag");
    if (!handle || downEvent.button !== 0) return;
    downEvent.preventDefault();
    const dragged = handle.closest(".admin-schedule-event");
    const draggedRow = dragged.closest(".admin-schedule-row");
    const unplaced = draggedRow.classList.contains("admin-schedule-row--unplaced");
    const skipped = !unplaced && dragged.classList.contains("admin-schedule-event--off");
    const divider = container.querySelector(".admin-schedule-divider");
    container.classList.add("admin-schedule-rows--dragging");

    const rows = onRows();
    const events = rows.map((row) => row.querySelector(".admin-schedule-event"));
    const from = events.indexOf(dragged);
    const tops = rows.map((row) => row.getBoundingClientRect().top);
    const step = rows.length > 1 ? tops[1] - tops[0] : dragged.offsetHeight + 10;
    const ownTop = dragged.getBoundingClientRect().top;
    const half = dragged.offsetHeight / 2;
    const lineY = divider.getBoundingClientRect().top + divider.offsetHeight / 2;
    const startY = downEvent.clientY;
    let to = from;
    let crossing = false;
    let target = null;

    dragged.classList.add("admin-schedule-event--dragging");
    events.forEach((event) => {
      if (event !== dragged) event.style.transition = "transform 0.15s ease";
    });
    handle.setPointerCapture(downEvent.pointerId);

    const onMove = (moveEvent) => {
      // From the top slot to a little past the line, or back up from below it.
      const minTop = rows.length ? tops[0] : lineY;
      const maxTop = skipped || unplaced ? ownTop : lineY + step / 2;
      const top = Math.max(minTop, Math.min(ownTop + moveEvent.clientY - startY, maxTop));
      dragged.style.transform = `translateY(${top - ownTop}px)`;
      const center = top + half;
      crossing = skipped || unplaced ? center < lineY : center > lineY;
      if (unplaced) {
        // Marks the slot it would take.
        const index = crossing ? Math.max(0, Math.min(rows.length - 1, Math.round((top - tops[0]) / step))) : -1;
        const next = rows[index] || null;
        if (next !== target) {
          target?.classList.remove("admin-schedule-row--swap-target");
          next?.classList.add("admin-schedule-row--swap-target");
          target = next;
        }
        return;
      }
      divider.classList.toggle("admin-schedule-divider--target", crossing);
      if (skipped) return;
      to = crossing ? from : Math.max(0, Math.min(rows.length - 1, from + Math.round((top - ownTop) / step)));
      events.forEach((event, index) => {
        if (event === dragged) return;
        let shift = 0;
        if (from < to && index > from && index <= to) shift = -step;
        if (from > to && index >= to && index < from) shift = step;
        event.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      container.classList.remove("admin-schedule-rows--dragging");
      divider.classList.remove("admin-schedule-divider--target");
      target?.classList.remove("admin-schedule-row--swap-target");
      const droppedTop = dragged.getBoundingClientRect().top;
      [...events, dragged].forEach((event) => {
        event.style.transition = "none";
        event.style.transform = "";
      });
      dragged.classList.remove("admin-schedule-event--dragging");
      setTimeout(() => events.forEach((event) => event !== dragged && (event.style.transition = "")), 0);
      dragged.style.transition = "";

      if (unplaced) {
        if (target) swapIn(dragged, target, droppedTop);
        else arrangeScheduleRows(container, dayType, true, new Map([[draggedRow, droppedTop]]));
        return;
      }
      if (crossing) {
        setSkipped(dragged, !skipped, droppedTop);
        return;
      }
      if (to !== from) {
        const order = events.filter((event) => event !== dragged);
        order.splice(to, 0, dragged);
        place(order);
      }
      // Back into place from where it was dropped.
      arrangeScheduleRows(container, dayType, false);
      dragged.style.transform = `translateY(${droppedTop - dragged.getBoundingClientRect().top}px)`;
      void dragged.offsetWidth;  // so the start position applies before the transition
      dragged.style.transition = "transform 0.15s ease";
      dragged.style.transform = "";
      setTimeout(() => (dragged.style.transition = ""), 160);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}
