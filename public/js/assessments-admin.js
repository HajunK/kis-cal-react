// Admin page for the school-wide assessments calendar. The page gating is
// cosmetic; firestore.rules restricts writes to admins. Kept standalone (no
// shared.js), so it carries its own small date helpers.

const ADMIN_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ADMIN_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function adminToISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function adminFromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

let adminAllAssessments = [];
let adminDayTypes = {}; // ISO date -> "A" | "B", absent = unset ("?")
// null both before one is set up and before the fetch resolves;
// adminPeriodTimesFetched tells them apart.
let adminDefaultScheduleTimes = null;
// Its own field rather than in times, which everything else reads by position.
let adminTestingBlockTimes = null;
let adminAcademicSupportTimes = null;
let adminAdvisoryTimes = null;
// ISO date -> that date's own arrangement (see scheduleForDate in
// assessments-shared.js).
let adminDaySchedules = {};
let adminPeriodTimesFetched = false;
// Mirrors SCHEDULE_BLOCKS in assessments-shared.js, which this page doesn't
// load.
const ADMIN_SCHEDULE_BLOCK_LABELS = ["Period 1/5", "Period 2/6", "Lunch", "Period 3/7", "Period 4/8"];
// Which period the class slots (block0, 1, 3, 4) hold on an A day; a B day's
// is 4 more.
const ADMIN_BLOCK_PERIOD_SLOTS = [0, 1, null, 2, 3];
// The Bell Schedule's slots. blockN is times[N]; the others are their own
// fields. Mirrors SCHEDULE_EVENT_KEYS in assessments-shared.js.
const ADMIN_SCHEDULE_EVENT_KEYS = ["testingBlock", "advisory", "block0", "block1", "block2", "block3", "block4", "academicSupport"];
const ADMIN_PERIOD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `period${n}`);
const ADMIN_SCHEDULE_EVENT_LABELS = {
  testingBlock: "Testing Block",
  advisory: "Advisory",
  academicSupport: "Academic Support",
  ...Object.fromEntries(ADMIN_SCHEDULE_BLOCK_LABELS.map((label, index) => [`block${index}`, label])),
  ...Object.fromEntries(ADMIN_PERIOD_KEYS.map((key, index) => [key, `Period ${index + 1}`])),
};

// Seeded the first time a day is marked A or B, so there's a sensible schedule
// without a trip through the Bell Schedule first.
const DEFAULT_SCHEDULE_TIMES = [
  { start: "08:50", end: "10:13" },
  { start: "10:18", end: "11:41" },
  { start: "11:41", end: "12:30" },
  { start: "12:30", end: "13:53" },
  { start: "13:58", end: "15:21" },
];
const DEFAULT_TESTING_BLOCK_TIMES = { start: "08:00", end: "08:50" };
const DEFAULT_ACADEMIC_SUPPORT_TIMES = { start: "15:25", end: "16:00" };
const DEFAULT_ADVISORY_TIMES = { start: "08:20", end: "08:45" };

// An event's normal times, which are also its slot's times.
function adminEventTimes(key) {
  if (key === "testingBlock") return adminTestingBlockTimes || DEFAULT_TESTING_BLOCK_TIMES;
  if (key === "advisory") return adminAdvisoryTimes || DEFAULT_ADVISORY_TIMES;
  if (key === "academicSupport") return adminAcademicSupportTimes || DEFAULT_ACADEMIC_SUPPORT_TIMES;
  const index = Number(key.slice(5));
  return (adminDefaultScheduleTimes && adminDefaultScheduleTimes[index]) || DEFAULT_SCHEDULE_TIMES[index];
}

// Normally the Testing Block is Mondays and Fridays, Advisory the other
// weekdays, and everything else every weekday.
function adminNormallyIncluded(key, weekday) {
  if (key === "testingBlock") return weekday === 1 || weekday === 5;
  if (key === "advisory") return weekday !== 1 && weekday !== 5;
  return true;
}

// What a slot normally holds: itself, except a class slot, which holds the
// day's period, or both ("Period 1/5") on a day not set A or B. Mirrors
// defaultScheduleEvent in assessments-shared.js.
function adminDefaultScheduleEvent(slot, dayType) {
  const periodSlot = slot.startsWith("block") ? ADMIN_BLOCK_PERIOD_SLOTS[Number(slot.slice(5))] : null;
  if (periodSlot === null || (dayType !== "A" && dayType !== "B")) return slot;
  return `period${periodSlot + (dayType === "A" ? 1 : 5)}`;
}

// Every event a date can hold, in the order the ones it doesn't are listed:
// the day's own slots, then the periods (or, on a day not set A or B, the
// shared class slots).
function adminScheduleEventOrder(dayType) {
  const shared = ADMIN_SCHEDULE_EVENT_KEYS.filter(
    (key) => !key.startsWith("block") || ADMIN_BLOCK_PERIOD_SLOTS[Number(key.slice(5))] === null
  );
  const classes =
    dayType === "A" || dayType === "B"
      ? ADMIN_PERIOD_KEYS
      : ADMIN_SCHEDULE_EVENT_KEYS.filter((key) => !shared.includes(key));
  return [...shared, ...classes];
}

// Every slot in time order, with the event a date puts there and whether it
// happens; then whatever no slot holds (normally the other day's periods). Mirrors scheduleForDate in assessments-shared.js, which also drops
// what doesn't happen.
function adminScheduleSlotsFor(iso, custom = adminDaySchedules[iso]) {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  const dayType = adminDayTypes[iso];
  const slots = ADMIN_SCHEDULE_EVENT_KEYS.map((slot) => ({ slot, time: adminEventTimes(slot) }))
    .sort((a, b) => (a.time.start < b.time.start ? -1 : a.time.start > b.time.start ? 1 : 0))
    .map(({ slot }) => {
      const key = (custom && custom.slots && custom.slots[slot]) || adminDefaultScheduleEvent(slot, dayType);
      const included =
        custom && Array.isArray(custom.included) ? custom.included.includes(key) : adminNormallyIncluded(key, weekday);
      return { slot, key, included };
    });
  const placed = new Set(slots.map(({ key }) => key));
  const unplaced = adminScheduleEventOrder(dayType)
    .filter((key) => !placed.has(key))
    .map((key) => ({ slot: null, key, included: false }));
  return [...slots, ...unplaced];
}

function adminDayHasTestingBlock(iso) {
  return adminScheduleSlotsFor(iso).some(({ key, included }) => key === "testingBlock" && included);
}

let adminDisplayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let adminSelectedDate = null; // ISO string, or null before any day is clicked
let adminSelectedType = "In-Class"; // "In-Class" | "Testing Block" | "Formative" | "Reassessment" | "Other"
let adminOtherTypeText = ""; // only used when adminSelectedType === "Other"
let adminSelectedDivision = ""; // "" = none picked / not applicable to the current course
let adminInitialized = false;
let adminToastEl = null;
let adminToastHideTimer = null;
const ADMIN_TOAST_VISIBLE_MS = 4000;

// This page doesn't load shared.js's own toast.
function showAdminToast(message) {
  if (!adminToastEl) {
    adminToastEl = document.createElement("div");
    adminToastEl.className = "signin-toast";
    document.body.appendChild(adminToastEl);
    void adminToastEl.offsetWidth;  // so the entrance transitions
  }

  adminToastEl.textContent = message;
  adminToastEl.classList.add("signin-toast--visible");
  clearTimeout(adminToastHideTimer);
  adminToastHideTimer = setTimeout(() => {
    adminToastEl.classList.remove("signin-toast--visible");
  }, ADMIN_TOAST_VISIBLE_MS);
}

function fetchAdminAssessments(callback) {
  firebase
    .firestore()
    .collection("assessments")
    .get()
    .then((snapshot) => {
      adminAllAssessments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (callback) callback();
    })
    .catch((error) => console.error("Failed to load assessments:", error));
}

function fetchAdminDayTypes(callback) {
  firebase
    .firestore()
    .collection("dayTypes")
    .get()
    .then((snapshot) => {
      adminDayTypes = {};
      snapshot.docs.forEach((doc) => {
        adminDayTypes[doc.id] = doc.data().type;
      });
      if (callback) callback();
    })
    .catch((error) => console.error("Failed to load day types:", error));
}

function fetchAdminPeriodTimes(callback) {
  firebase
    .firestore()
    .collection("periodTimes")
    .doc("default")
    .get()
    .then((doc) => {
      const data = doc.exists ? doc.data() : null;
      adminDefaultScheduleTimes = data && Array.isArray(data.times) ? data.times : null;
      adminTestingBlockTimes = (data && data.testingBlock) || null;
      adminAcademicSupportTimes = (data && data.academicSupport) || null;
      adminAdvisoryTimes = (data && data.advisory) || null;
      adminDaySchedules = (data && data.daySchedules) || {};
      adminPeriodTimesFetched = true;
      if (callback) callback();
    })
    .catch((error) => console.error("Failed to load period times:", error));
}

// Only when there's genuinely no schedule (not just a fetch still in flight),
// and never over an existing one.
function seedDefaultScheduleTimesIfMissing() {
  if (!adminPeriodTimesFetched || adminDefaultScheduleTimes) return;
  adminDefaultScheduleTimes = DEFAULT_SCHEDULE_TIMES;
  firebase
    .firestore()
    .collection("periodTimes")
    .doc("default")
    .set({
      times: DEFAULT_SCHEDULE_TIMES,
      testingBlock: DEFAULT_TESTING_BLOCK_TIMES,
      academicSupport: DEFAULT_ACADEMIC_SUPPORT_TIMES,
      advisory: DEFAULT_ADVISORY_TIMES,
    })
    .then(() => bumpCacheVersion("periodTimes"))
    .catch((error) => {
      console.error("Failed to seed the default bell schedule:", error);
      adminDefaultScheduleTimes = null;
    });
}

// Students' pages only refetch a collection when its stamp changes (see
// fetchUnlessCached in assessments-shared.js), which keeps the daily read quota
// in hand.
function bumpCacheVersion(key) {
  firebase
    .firestore()
    .collection("meta")
    .doc("cacheVersions")
    .set({ [key]: Date.now() }, { merge: true })
    .catch((error) => console.error("Failed to update cache version:", error));
}

// Until the first stamp exists, students' pages can't trust their copies and
// fetch everything each time.
function ensureCacheVersions() {
  const ref = firebase.firestore().collection("meta").doc("cacheVersions");
  ref
    .get()
    .then((doc) => {
      if (doc.exists) return;
      const now = Date.now();
      return ref.set({ assessments: now, dayTypes: now, periodTimes: now }, { merge: true });
    })
    .catch((error) => console.error("Failed to set up cache versions:", error));
}

function setDayType(iso, value) {
  const previous = adminDayTypes[iso] || null;
  if (value) adminDayTypes[iso] = value;
  else delete adminDayTypes[iso];
  renderAdminCalendar();

  const doc = firebase.firestore().collection("dayTypes").doc(iso);
  (value ? doc.set({ type: value }) : doc.delete()).then(() => bumpCacheVersion("dayTypes")).catch((error) => {
    console.error("Failed to save day type:", error);
    alert("Something went wrong saving that day type. Please try again.");
    if (previous) adminDayTypes[iso] = previous;
    else delete adminDayTypes[iso];
    renderAdminCalendar();
  });

  if (value) seedDefaultScheduleTimesIfMissing();
  if (value) resetDaySchedule(iso);
}

// Picking A or B starts the day over on its normal schedule, dropping any
// rearrangement made in the Bell Schedule.
function resetDaySchedule(iso) {
  const previous = adminDaySchedules[iso];
  if (!previous) return;
  delete adminDaySchedules[iso];
  firebase
    .firestore()
    .collection("periodTimes")
    .doc("default")
    .set({ daySchedules: { [iso]: firebase.firestore.FieldValue.delete() } }, { merge: true })
    .then(() => bumpCacheVersion("periodTimes"))
    .catch((error) => {
      console.error("Failed to reset the day's schedule:", error);
      adminDaySchedules[iso] = previous;
    });
}

// One row per slot, in time order. The times belong to the slot and are the
// same every day; the event in it (grip and name) is this date's and can be
// dragged to another slot. Events no slot holds get a row of their own, with
// no times, below the line.
function renderScheduleRows(container, slots) {
  container.innerHTML = "";
  slots.forEach(({ slot, key, included }, index) => {
    const row = document.createElement("div");
    row.className = "admin-schedule-row";
    row.dataset.position = String(index);
    if (slot) {
      const time = adminEventTimes(slot);
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
  arrangeScheduleRows(container, false);
}

// What the day has comes first, in time order; what it skips goes below a
// line, like the Calendar's Upcoming list keeps finished tasks under its own,
// then the events it doesn't hold at all. Rows that move
// glide to their new places; fromTops overrides where a row starts from, like
// one just dropped.
function arrangeScheduleRows(container, animate = true, fromTops = new Map()) {
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
  const order = adminScheduleEventOrder(adminDayTypes[adminSelectedDate]);
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
    <button type="button" class="admin-schedule-drag" aria-label="Move ${ADMIN_SCHEDULE_EVENT_LABELS[key]}">
      <svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>
    </button>
    <span class="admin-schedule-row-label"></span>
  `;
  event.querySelector(".admin-schedule-row-label").textContent = ADMIN_SCHEDULE_EVENT_LABELS[key];
  return event;
}

// Off means below the line: a slot the day skips, or a period it doesn't hold.
function setScheduleEventIncluded(event, included) {
  event.classList.toggle("admin-schedule-event--off", !included);
  event.closest(".admin-schedule-row")?.classList.toggle("admin-schedule-row--off", !included);
}

// The times by slot, and this date's arrangement.
function readScheduleRows(container) {
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
function customDaySchedule(iso, day) {
  const normal = adminScheduleSlotsFor(iso, null).filter(({ slot }) => slot);
  const slots = {};
  normal.forEach(({ slot, key }) => {
    if (day.slots[slot] !== key) slots[slot] = day.slots[slot];
  });
  const normalIncluded = normal.filter(({ included }) => included).map(({ key }) => key);
  const sameIncluded =
    normalIncluded.length === day.included.length && normalIncluded.every((key) => day.included.includes(key));
  return Object.keys(slots).length || !sameIncluded ? { slots, included: day.included } : null;
}

// Every slot needs times except one the day skips.
function scheduleRowsComplete(container) {
  return [...container.querySelectorAll(".admin-schedule-row:not(.admin-schedule-row--off)")].every((row) =>
    [...row.querySelectorAll(".admin-schedule-time-input")].every((input) => input.value)
  );
}

// Drag an event by its grip to another slot: it follows the pointer, the
// events in between slide one slot over, and the times stay put. Dragged below
// the line, the day skips its slot; dragged back above, it returns to it. An
// event no slot holds (another day's period, say), dropped on a slot, takes
// it, swapping the slot's event down. Arrow keys on the grip move, skip and restore a step at a time.
function enableScheduleReorder(container) {
  const onRows = () => [...container.querySelectorAll(".admin-schedule-row:not(.admin-schedule-row--off)")];
  // Puts the events into the day's rows in this order.
  const place = (events) => {
    onRows().forEach((row, index) => row.prepend(events[index]));
  };
  const setSkipped = (event, skipped, droppedTop) => {
    const row = event.closest(".admin-schedule-row");
    setScheduleEventIncluded(event, !skipped);
    arrangeScheduleRows(container, true, droppedTop === undefined ? undefined : new Map([[row, droppedTop]]));
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
    arrangeScheduleRows(container, true, new Map([[targetRow, droppedTop], [sourceRow, displacedTop]]));
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
        else arrangeScheduleRows(container, true, new Map([[draggedRow, droppedTop]]));
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
      arrangeScheduleRows(container, false);
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

// For the selected date. Removal is delayed so the closing transition plays.
let scheduleModalOverlay = null;

function buildScheduleModal() {
  const iso = adminSelectedDate;
  const dateLabel = new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const overlay = document.createElement("div");
  overlay.className = "admin-schedule-overlay";
  overlay.innerHTML = `
    <div class="admin-schedule-dialog">
      <button type="button" class="admin-schedule-close-btn" aria-label="Close">×</button>
      <div class="admin-schedule-heading">
        <h2 class="admin-schedule-title">Bell Schedule</h2>
        <p class="admin-schedule-date"></p>
      </div>
      <div class="admin-schedule-rows"></div>
      <div class="admin-schedule-footer">
        <button type="button" class="admin-schedule-reset-btn">Reset this day</button>
      </div>
      <button type="button" class="admin-schedule-save-btn">Save Schedule</button>
    </div>
  `;
  const dayType = adminDayTypes[iso];
  overlay.querySelector(".admin-schedule-date").textContent =
    dayType === "A" || dayType === "B" ? `${dateLabel} · ${dayType} Day` : dateLabel;
  document.body.appendChild(overlay);

  const rows = overlay.querySelector(".admin-schedule-rows");
  const saveBtn = overlay.querySelector(".admin-schedule-save-btn");
  const resetBtn = overlay.querySelector(".admin-schedule-reset-btn");

  renderScheduleRows(rows, adminScheduleSlotsFor(iso));
  enableScheduleReorder(rows);

  // Only offered while the day differs from normal.
  const syncResetBtn = () => {
    resetBtn.hidden = !customDaySchedule(iso, readScheduleRows(rows).day);
  };
  syncResetBtn();

  // Dropping or moving by keyboard rearranges the events.
  new MutationObserver(syncResetBtn).observe(rows, { childList: true, subtree: true });

  // Keeps any times typed in the meantime.
  resetBtn.addEventListener("click", () => {
    const typed = new Map(
      [...rows.querySelectorAll(".admin-schedule-row[data-slot]")].map((row) => [
        row.dataset.slot,
        [...row.querySelectorAll(".admin-schedule-time-input")].map((input) => input.value),
      ])
    );
    const before = new Map(
      [...rows.querySelectorAll(".admin-schedule-event")].map((event) => [event.dataset.key, event.getBoundingClientRect().top])
    );
    renderScheduleRows(rows, adminScheduleSlotsFor(iso, null));
    rows.querySelectorAll(".admin-schedule-row").forEach((row) => {
      const values = typed.get(row.dataset.slot);
      if (values) row.querySelectorAll(".admin-schedule-time-input").forEach((input, i) => (input.value = values[i]));
    });
    // Each event glides from where it was to its normal place.
    const fromTops = new Map(
      [...rows.querySelectorAll(".admin-schedule-row")].map((row) => [
        row,
        before.get(row.querySelector(".admin-schedule-event").dataset.key),
      ])
    );
    arrangeScheduleRows(rows, true, fromTops);
    syncResetBtn();
  });

  overlay.querySelector(".admin-schedule-close-btn").addEventListener("click", closeScheduleModal);
  overlay.addEventListener("click", (clickEvent) => {
    if (clickEvent.target === overlay) closeScheduleModal();
  });

  saveBtn.addEventListener("click", () => {
    if (!scheduleRowsComplete(rows)) {
      showAdminToast("Fill in every start and end time first.");
      return;
    }
    const { schedule, day } = readScheduleRows(rows);
    const custom = customDaySchedule(iso, day);
    const deleteField = firebase.firestore.FieldValue.delete();
    saveBtn.disabled = true;
    firebase
      .firestore()
      .collection("periodTimes")
      .doc("default")
      .set({ ...schedule, daySchedules: { [iso]: custom || deleteField } }, { merge: true })
      .then(() => {
        bumpCacheVersion("periodTimes");
        adminDefaultScheduleTimes = schedule.times;
        adminTestingBlockTimes = schedule.testingBlock;
        adminAcademicSupportTimes = schedule.academicSupport;
        adminAdvisoryTimes = schedule.advisory;
        if (custom) adminDaySchedules[iso] = custom;
        else delete adminDaySchedules[iso];
        showAdminToast("Schedule saved.");
        closeScheduleModal();
      })
      .catch((error) => {
        console.error("Failed to save schedule:", error);
        showAdminToast("Something went wrong saving the schedule. Please try again.");
        saveBtn.disabled = false;
      });
  });

  return overlay;
}

function openScheduleModal() {
  scheduleModalOverlay = buildScheduleModal();
  const dialog = scheduleModalOverlay.querySelector(".admin-schedule-dialog");
  void dialog.offsetWidth;  // so the entrance transitions
  dialog.classList.add("admin-schedule-dialog--visible");
  scheduleModalOverlay.classList.add("admin-schedule-overlay--visible");
}

function closeScheduleModal() {
  if (!scheduleModalOverlay) return;
  const closingOverlay = scheduleModalOverlay;
  const dialog = closingOverlay.querySelector(".admin-schedule-dialog");
  scheduleModalOverlay = null;
  dialog.classList.remove("admin-schedule-dialog--visible");
  closingOverlay.classList.remove("admin-schedule-overlay--visible");
  setTimeout(() => closingOverlay.remove(), 250);
}

function initScheduleModal() {
  const openBtn = document.getElementById("admin-schedule-open-btn");
  if (!openBtn) return;
  openBtn.addEventListener("click", openScheduleModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && scheduleModalOverlay) closeScheduleModal();
  });
}

// Read-only; the picker lives in the day panel.
function buildDayTypeLabel(iso) {
  const label = document.createElement("span");
  label.className = "assessment-calendar-day-type";
  label.textContent = adminDayTypes[iso] || "";
  return label;
}

let dayTypeToggleContainer = null;
let dayTypeToggleThumb = null;

// Its active option follows the selected day, so it's re-synced whenever the
// panel renders, not only on click.
function setupDayTypeToggle() {
  dayTypeToggleContainer = document.getElementById("admin-day-type-toggle");
  if (!dayTypeToggleContainer) return;

  dayTypeToggleThumb = document.createElement("span");
  dayTypeToggleThumb.className = "segmented-thumb";
  dayTypeToggleContainer.insertBefore(dayTypeToggleThumb, dayTypeToggleContainer.firstChild);

  dayTypeToggleContainer.querySelectorAll(".segmented-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!adminSelectedDate || btn.classList.contains("segmented-option--active")) return;
      setDayType(adminSelectedDate, btn.dataset.value === "?" ? null : btn.dataset.value);
    });
  });
}

// The thumb slides for a change to the same day and jumps when another day is
// picked.
let dayTypeToggleSyncedDate = null;

function syncDayTypeToggle() {
  // Its rows depend on the weekday, so it waits for a day to be selected.
  const scheduleBtn = document.getElementById("admin-schedule-open-btn");
  if (scheduleBtn) scheduleBtn.hidden = !adminSelectedDate;
  if (!dayTypeToggleContainer) return;
  dayTypeToggleContainer.hidden = !adminSelectedDate;
  if (!adminSelectedDate) {
    dayTypeToggleSyncedDate = null;
    return;
  }

  const activeType = adminDayTypes[adminSelectedDate] || "?";
  let activeOption = null;
  dayTypeToggleContainer.querySelectorAll(".segmented-option").forEach((btn) => {
    const isActive = btn.dataset.value === activeType;
    btn.classList.toggle("segmented-option--active", isActive);
    if (isActive) activeOption = btn;
  });
  if (!activeOption) return;

  const animate = dayTypeToggleSyncedDate === adminSelectedDate;
  dayTypeToggleSyncedDate = adminSelectedDate;
  if (!animate) dayTypeToggleThumb.style.transition = "none";
  dayTypeToggleThumb.style.left = `${activeOption.offsetLeft}px`;
  dayTypeToggleThumb.style.width = `${activeOption.offsetWidth}px`;
  if (!animate) {
    void dayTypeToggleThumb.offsetWidth;  // so the "none" transition applies first
    dayTypeToggleThumb.style.transition = "";
  }
}

function deleteAssessment(id) {
  const index = adminAllAssessments.findIndex((entry) => entry.id === id);
  const removed = index === -1 ? null : adminAllAssessments[index];

  // Optimistic, so the list responds at once.
  if (removed) {
    adminAllAssessments.splice(index, 1);
    renderAdminCalendar();
  }

  firebase
    .firestore()
    .collection("assessments")
    .doc(id)
    .delete()
    .then(() => bumpCacheVersion("assessments"))
    .catch((error) => {
      console.error("Failed to delete assessment:", error);
      alert("Something went wrong deleting that assessment. Please try again.");
      // The delete failed, so it comes back.
      if (removed) {
        adminAllAssessments.splice(index, 0, removed);
        renderAdminCalendar();
      }
    });
}

function addAssessment(courseName, type) {
  if (!adminSelectedDate) return;
  firebase
    .firestore()
    .collection("assessments")
    .add({ type, date: adminSelectedDate, courseName, createdAt: Date.now() })
    .then((ref) => {
      bumpCacheVersion("assessments");
      // Pushed into the list directly rather than refetching the whole
      // collection.
      adminAllAssessments.push({ id: ref.id, type, date: adminSelectedDate, courseName, createdAt: Date.now() });
      renderAdminCalendar();
    })
    .catch((error) => {
      console.error("Failed to add assessment:", error);
      alert("Something went wrong adding that assessment. Please try again.");
    });
}

// onCourseChange keeps the division picker in step with what's typed.
function setupAdminCourseDropdown(input, onCourseChange) {
  const dropdown = input.closest(".schedule-field").querySelector(".schedule-dropdown");
  let highlightedIndex = -1;

  function items() {
    return Array.from(dropdown.querySelectorAll(".schedule-dropdown-item"));
  }

  function setHighlighted(index) {
    const all = items();
    all.forEach((item) => item.classList.remove("schedule-dropdown-item--highlighted"));
    highlightedIndex = index;
    if (index < 0 || index >= all.length) return;
    all[index].classList.add("schedule-dropdown-item--highlighted");
    all[index].scrollIntoView({ block: "nearest" });
  }

  function selectItem(item) {
    input.value = item.textContent;
    dropdown.innerHTML = "";
    if (onCourseChange) onCourseChange();
  }

  function renderMatches() {
    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = "";
    highlightedIndex = -1;
    if (query === "") return;

    COURSE_CATALOG.filter((course) => course.name.toLowerCase().includes(query))
      .slice(0, 8)
      .forEach((course) => {
        const item = document.createElement("li");
        item.className = "schedule-dropdown-item";
        item.textContent = course.name;
        item.addEventListener("mousedown", (event) => {
          event.preventDefault();
          selectItem(item);
        });
        dropdown.appendChild(item);
      });
  }

  input.addEventListener("input", () => {
    renderMatches();
    if (onCourseChange) onCourseChange();
  });
  input.addEventListener("focus", renderMatches);
  input.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.innerHTML = "";
    }, 100);
  });

  input.addEventListener("keydown", (event) => {
    // Before the early return, so Escape works even with no matches showing.
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
      return;
    }

    const all = items();
    if (all.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted(highlightedIndex < all.length - 1 ? highlightedIndex + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(highlightedIndex > 0 ? highlightedIndex - 1 : all.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectItem(all[highlightedIndex >= 0 ? highlightedIndex : 0]);
    }
  });
}

// Changing the course invalidates any division already picked.
function syncAdminDivisionPicker(input) {
  const field = document.getElementById("admin-division-field");
  const picker = document.getElementById("admin-division-picker");
  const course = findCourseCatalogEntry(input.value.trim());
  const divisions = course && course.divisions;

  if (!divisions || divisions.length === 0) {
    field.hidden = true;
    picker.innerHTML = "";
    adminSelectedDivision = "";
    return;
  }

  if (!divisions.includes(adminSelectedDivision)) {
    adminSelectedDivision = "";
  }

  field.hidden = false;
  picker.innerHTML = "";
  divisions.forEach((division) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "division-option";
    btn.textContent = division;
    btn.classList.toggle("division-option--selected", division === adminSelectedDivision);
    // mousedown, not click: a click would blur the course input first, which
    // can rebuild this picker before the click lands.
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    btn.addEventListener("click", () => {
      adminSelectedDivision = division;
      picker.querySelectorAll(".division-option").forEach((b) => b.classList.remove("division-option--selected"));
      btn.classList.add("division-option--selected");
    });
    picker.appendChild(btn);
  });
}

// Tracks a local variable rather than a saved preference.
function setupTypeToggle() {
  const container = document.getElementById("admin-type-toggle");
  const options = container.querySelectorAll(".segmented-option");
  const otherInput = document.getElementById("admin-type-other-input");

  const thumb = document.createElement("span");
  thumb.className = "segmented-thumb";
  container.insertBefore(thumb, container.firstChild);

  // No slide on first paint.
  const positionThumb = (option, animate) => {
    if (!animate) thumb.style.transition = "none";
    thumb.style.left = `${option.offsetLeft}px`;
    thumb.style.width = `${option.offsetWidth}px`;
    if (!animate) {
      void thumb.offsetWidth;  // so the "none" transition applies first
      thumb.style.transition = "";
    }
  };

  options.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("segmented-option--active")) return;
      adminSelectedType = btn.dataset.value;
      options.forEach((other) => other.classList.toggle("segmented-option--active", other === btn));
      positionThumb(btn, true);
      syncTestingBlockHighlight();

      otherInput.hidden = adminSelectedType !== "Other";
      if (adminSelectedType === "Other") otherInput.focus();
    });
  });

  otherInput.addEventListener("input", () => {
    adminOtherTypeText = otherInput.value;
  });

  positionThumb(container.querySelector(".segmented-option--active"), false);

  // The first position was measured with the fallback font, whose widths differ
  // from Inter's.
  if (document.fonts) {
    document.fonts.ready.then(() => {
      positionThumb(container.querySelector(".segmented-option--active"), false);
    });
  }
}

// Those are the only days a Testing Block can go on.
function syncTestingBlockHighlight() {
  const grid = document.getElementById("admin-cal-grid");
  if (grid) grid.classList.toggle("admin-cal-grid--testing-block", adminSelectedType === "Testing Block");
}

// Custom "Other" labels sort after these.
const ADMIN_TYPE_SORT_ORDER = ["Testing Block", "In-Class", "Formative", "Reassessment"];

function adminTypeSortRank(type) {
  const index = ADMIN_TYPE_SORT_ORDER.indexOf(type);
  return index === -1 ? ADMIN_TYPE_SORT_ORDER.length : index;
}

function renderDayPanel(entriesForDay) {
  const title = document.getElementById("admin-day-title");
  const list = document.getElementById("admin-day-entries");
  const form = document.getElementById("admin-add-form");

  syncDayTypeToggle();

  if (!adminSelectedDate) {
    title.textContent = "Select a day";
    list.innerHTML = "";
    form.hidden = true;
    return;
  }

  const date = adminFromISODate(adminSelectedDate);
  title.textContent = `${ADMIN_MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  form.hidden = false;

  list.innerHTML = "";
  if (entriesForDay.length === 0) {
    const empty = document.createElement("li");
    empty.className = "admin-day-entry-empty";
    empty.textContent = "Nothing scheduled yet.";
    list.appendChild(empty);
    return;
  }

  // Alphabetical by course within each type.
  const sortedEntries = entriesForDay.slice().sort((a, b) => {
    const rankDiff = adminTypeSortRank(a.type) - adminTypeSortRank(b.type);
    return rankDiff !== 0 ? rankDiff : a.courseName.localeCompare(b.courseName);
  });

  sortedEntries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "admin-day-entry";

    const name = document.createElement("span");
    name.className = "admin-day-entry-name";
    name.textContent = entry.courseName;

    const type = document.createElement("span");
    // Matches how the Calendar tab draws these types.
    const isSummative =
      ["In-Class", "Summative", "Testing Block"].includes(entry.type) || /reassess/i.test(entry.type);
    type.className = `assessment-calendar-entry-type assessment-calendar-entry-type--${isSummative ? "summative" : "formative"}`;
    type.textContent = entry.type;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "admin-day-entry-delete";
    deleteBtn.setAttribute("aria-label", "Delete assessment");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => deleteAssessment(entry.id));

    li.append(name, type, deleteBtn);
    list.appendChild(li);
  });
}

function renderAdminCalendar() {
  const grid = document.getElementById("admin-cal-grid");
  const label = document.getElementById("admin-cal-label");
  const year = adminDisplayedMonth.getFullYear();
  const month = adminDisplayedMonth.getMonth();
  label.textContent = `${ADMIN_MONTH_NAMES[month]} ${year}`;

  const entriesByDate = {};
  adminAllAssessments.forEach((entry) => {
    (entriesByDate[entry.date] = entriesByDate[entry.date] || []).push(entry);
  });

  grid.innerHTML = "";
  syncTestingBlockHighlight();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < firstWeekday; i++) {
    const filler = document.createElement("span");
    filler.className = "assessment-calendar-day assessment-calendar-day--outside";
    grid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = adminToISODate(new Date(year, month, day));
    const dayBtn = document.createElement("button");
    dayBtn.type = "button";
    dayBtn.className = "assessment-calendar-day";
    // Marks the Testing Block days so they can be highlighted as one column.
    const weekday = new Date(year, month, day).getDay();
    if (weekday === 1 || weekday === 5) {
      dayBtn.classList.add("assessment-calendar-day--block-day");
      if (day <= 7) dayBtn.classList.add("assessment-calendar-day--block-day-first");
      if (day + 7 > daysInMonth) dayBtn.classList.add("assessment-calendar-day--block-day-last");
    }

    // Its own span so today's circle fits the number rather than the whole
    // cell.
    const dayNumber = document.createElement("span");
    dayNumber.className = "assessment-calendar-day-number";
    dayNumber.textContent = String(day);
    if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
      dayNumber.classList.add("assessment-calendar-day-number--today");
    }
    dayBtn.appendChild(dayNumber);
    dayBtn.appendChild(buildDayTypeLabel(iso));

    // Every five become one square, like a tally, so a busy day's marks never
    // outgrow the cell.
    if (entriesByDate[iso] && entriesByDate[iso].length > 0) {
      const dots = document.createElement("div");
      dots.className = "assessment-calendar-day-dots";
      const count = entriesByDate[iso].length;
      for (let i = 0; i < Math.floor(count / 5); i++) {
        const square = document.createElement("span");
        square.className = "assessment-calendar-day-dot assessment-calendar-day-dot--five";
        dots.appendChild(square);
      }
      for (let i = 0; i < count % 5; i++) {
        const dot = document.createElement("span");
        dot.className = "assessment-calendar-day-dot";
        dots.appendChild(dot);
      }
      dayBtn.appendChild(dots);
    }
    if (adminSelectedDate === iso) dayBtn.classList.add("assessment-calendar-day--selected");

    dayBtn.addEventListener("click", () => {
      adminSelectedDate = iso;
      renderAdminCalendar();
    });

    grid.appendChild(dayBtn);
  }

  renderDayPanel(entriesByDate[adminSelectedDate] || []);
}

function initAdminPage() {
  ensureCacheVersions();
  ADMIN_WEEKDAY_LABELS.forEach((day) => {
    const span = document.createElement("span");
    span.textContent = day;
    document.getElementById("admin-cal-weekdays").appendChild(span);
  });

  const courseInput = document.querySelector(".admin-course-input");
  setupAdminCourseDropdown(courseInput, () => syncAdminDivisionPicker(courseInput));
  setupTypeToggle();
  setupDayTypeToggle();
  initScheduleModal();

  // Only catalog courses can be scheduled. Checked on blur, since partial text
  // while typing is expected.
  courseInput.addEventListener("blur", () => {
    const name = courseInput.value.trim();
    if (name && !findCourseCatalogEntry(name)) {
      showAdminToast("The course you typed does not exist.");
    }
  });

  document.getElementById("admin-cal-prev").addEventListener("click", () => {
    adminDisplayedMonth = new Date(adminDisplayedMonth.getFullYear(), adminDisplayedMonth.getMonth() - 1, 1);
    adminSelectedDate = null;
    renderAdminCalendar();
  });
  document.getElementById("admin-cal-next").addEventListener("click", () => {
    adminDisplayedMonth = new Date(adminDisplayedMonth.getFullYear(), adminDisplayedMonth.getMonth() + 1, 1);
    adminSelectedDate = null;
    renderAdminCalendar();
  });

  document.getElementById("admin-add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector(".admin-course-input");
    const name = input.value.trim();
    if (!name) return;

    const course = findCourseCatalogEntry(name);
    if (!course) {
      showAdminToast("The course you typed does not exist.");
      return;
    }

    if (course.divisions && !adminSelectedDivision) {
      alert("Pick a division first — this course tests on different days for each one.");
      return;
    }

    const otherInput = document.getElementById("admin-type-other-input");
    const otherText = adminOtherTypeText.trim();
    if (adminSelectedType === "Other" && !otherText) {
      alert("Type a label for the custom assessment type first.");
      return;
    }
    const type = adminSelectedType === "Other" ? otherText : adminSelectedType;

    addAssessment(effectiveCourseName(name, adminSelectedDivision), type);
    input.value = "";
    syncAdminDivisionPicker(input);
    otherInput.value = "";
    adminOtherTypeText = "";
  });

  fetchAdminPeriodTimes();
  fetchAdminDayTypes(() =>
    fetchAdminAssessments(() => {
      renderAdminCalendar();
      document.getElementById("admin-cal-loading").hidden = true;
    })
  );
}

// Cosmetic only: firestore.rules is the real gate.
function handleAdminAuthState(user) {
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  document.getElementById("admin-not-authorized").hidden = isAdmin;
  document.getElementById("admin-calendar-layout").hidden = !isAdmin;

  if (isAdmin && !adminInitialized) {
    adminInitialized = true;
    initAdminPage();
  }
}

auth.onAuthStateChanged(handleAdminAuthState);
