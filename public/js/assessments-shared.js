
let allAssessments = [];
// Separate from assessmentsFetchDone so a cache hit can render instantly.
let assessmentsLoaded = false;
let assessmentsFetchDone = false;
const assessmentsLoadListeners = [];

const ASSESSMENTS_CACHE_KEY = "cachedAssessments";

function readCachedAssessments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSESSMENTS_CACHE_KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedAssessments(data) {
  try {
    localStorage.setItem(ASSESSMENTS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage is optional.
  }
}

// Every document read counts against the daily quota on every page load, so
// collections are only refetched when an admin change has restamped
// meta/cacheVersions (see bumpCacheVersion in assessments-admin.js). Each page
// reads that one small doc instead.
const CACHE_VERSIONS_KEY = "cachedVersions";
let serverCacheVersionsPromise = null;

function readLocalCacheVersions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_VERSIONS_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalCacheVersion(key, version) {
  try {
    const versions = readLocalCacheVersions();
    if (version == null) delete versions[key];
    else versions[key] = version;
    localStorage.setItem(CACHE_VERSIONS_KEY, JSON.stringify(versions));
  } catch {
    // Optional: without it, it just fetches.
  }
}

// failed (offline, quota used up) is told apart from missing so a cached copy
// can still be trusted then.
function serverCacheVersions() {
  if (!serverCacheVersionsPromise) {
    serverCacheVersionsPromise = firebase
      .firestore()
      .collection("meta")
      .doc("cacheVersions")
      .get()
      .then((doc) => ({ versions: doc.exists ? doc.data() : null }))
      .catch(() => ({ failed: true }));
  }
  return serverCacheVersionsPromise;
}

function fetchUnlessCached(key, hasCache, useCache, fetchFresh) {
  serverCacheVersions().then(({ versions, failed }) => {
    const version = versions ? versions[key] : null;
    if (hasCache && (failed || (version != null && version === readLocalCacheVersions()[key]))) {
      useCache();
    } else {
      fetchFresh(version);
    }
  });
}

// A cache hit calls back immediately and again once the fetch confirms it.
function loadAssessments(callback) {
  if (assessmentsLoaded) callback(allAssessments);
  if (!assessmentsFetchDone) assessmentsLoadListeners.push(callback);
}

function fetchAssessments() {
  if (typeof firebase === "undefined" || !firebase.firestore) return;
  const finish = () => {
    assessmentsLoaded = true;
    assessmentsFetchDone = true;
    assessmentsLoadListeners.splice(0).forEach((callback) => callback(allAssessments));
  };
  fetchUnlessCached("assessments", Boolean(readCachedAssessments()), finish, (version) =>
    firebase
      .firestore()
      .collection("assessments")
      .get()
      .then((snapshot) => {
        allAssessments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        writeCachedAssessments(allAssessments);
        writeLocalCacheVersion("assessments", version);
        finish();
      })
      .catch((error) => console.error("Failed to load assessments:", error))
  );
}

const cachedAssessments = readCachedAssessments();
if (cachedAssessments) {
  allAssessments = cachedAssessments;
  assessmentsLoaded = true;
}

// A date without an entry is unset ("?") and counts as visible to everyone.
let allDayTypes = {}; // ISO date -> "A" | "B"
let dayTypesLoaded = false;
let dayTypesFetchDone = false;
const dayTypesLoadListeners = [];

const DAY_TYPES_CACHE_KEY = "cachedDayTypes";

function readCachedDayTypes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DAY_TYPES_CACHE_KEY));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedDayTypes(data) {
  try {
    localStorage.setItem(DAY_TYPES_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage is optional.
  }
}

function loadDayTypes(callback) {
  if (dayTypesLoaded) callback(allDayTypes);
  if (!dayTypesFetchDone) dayTypesLoadListeners.push(callback);
}

function fetchDayTypes() {
  if (typeof firebase === "undefined" || !firebase.firestore) return;
  const finish = () => {
    dayTypesLoaded = true;
    dayTypesFetchDone = true;
    dayTypesLoadListeners.splice(0).forEach((callback) => callback(allDayTypes));
  };
  fetchUnlessCached("dayTypes", Boolean(readCachedDayTypes()), finish, (version) =>
    firebase
      .firestore()
      .collection("dayTypes")
      .get()
      .then((snapshot) => {
        allDayTypes = {};
        snapshot.docs.forEach((doc) => {
          allDayTypes[doc.id] = doc.data().type;
        });
        writeCachedDayTypes(allDayTypes);
        writeLocalCacheVersion("dayTypes", version);
        finish();
      })
      .catch((error) => console.error("Failed to load day types:", error))
  );
}

const cachedDayTypes = readCachedDayTypes();
if (cachedDayTypes) {
  allDayTypes = cachedDayTypes;
  dayTypesLoaded = true;
}

// null until loaded, or if no schedule has been set up.
let defaultPeriodTimes = null; // { times: [{start,end}, ...] } | null
let periodTimesLoaded = false;
let periodTimesFetchDone = false;
const periodTimesLoadListeners = [];

const PERIOD_TIMES_CACHE_KEY = "cachedPeriodTimes";

function readCachedPeriodTimes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERIOD_TIMES_CACHE_KEY));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedPeriodTimes(data) {
  try {
    localStorage.setItem(PERIOD_TIMES_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage is optional.
  }
}

function loadPeriodTimes(callback) {
  if (periodTimesLoaded) callback(defaultPeriodTimes);
  if (!periodTimesFetchDone) periodTimesLoadListeners.push(callback);
}

function fetchPeriodTimes() {
  if (typeof firebase === "undefined" || !firebase.firestore) return;
  const finish = () => {
    periodTimesLoaded = true;
    periodTimesFetchDone = true;
    periodTimesLoadListeners.splice(0).forEach((callback) => callback(defaultPeriodTimes));
  };
  fetchUnlessCached("periodTimes", Boolean(readCachedPeriodTimes()), finish, (version) =>
    firebase
      .firestore()
      .collection("periodTimes")
      .doc("default")
      .get()
      .then((doc) => {
        defaultPeriodTimes = doc.exists ? doc.data() : null;
        writeCachedPeriodTimes(defaultPeriodTimes);
        writeLocalCacheVersion("periodTimes", version);
        finish();
      })
      .catch((error) => console.error("Failed to load period times:", error))
  );
}

const cachedPeriodTimes = readCachedPeriodTimes();
if (cachedPeriodTimes) {
  defaultPeriodTimes = cachedPeriodTimes;
  periodTimesLoaded = true;
}

// For Privacy Blur's During School mode (see evaluatePrivacyBlur in
// preferences.js): whether it can be told yet.
window.isScheduleReadyForBlur = () => periodTimesLoaded;

function loadScheduleData(callback) {
  let assessmentsReady = false;
  let dayTypesReady = false;
  let periodTimesReady = false;
  const tryFire = () => {
    if (assessmentsReady && dayTypesReady && periodTimesReady) callback();
  };
  loadAssessments(() => {
    assessmentsReady = true;
    tryFire();
  });
  loadDayTypes(() => {
    dayTypesReady = true;
    tryFire();
  });
  loadPeriodTimes(() => {
    periodTimesReady = true;
    tryFire();
  });
}

// Callers filtering by period need both, or an unfiltered list would flash
// before narrowing.
function loadAssessmentData(callback) {
  let assessmentsReady = false;
  let dayTypesReady = false;
  const tryFire = () => {
    if (assessmentsReady && dayTypesReady) callback();
  };
  loadAssessments(() => {
    assessmentsReady = true;
    tryFire();
  });
  loadDayTypes(() => {
    dayTypesReady = true;
    tryFire();
  });
}

// Not toISOString, which is UTC and can land on the wrong day.
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayISODate() {
  return toISODate(new Date());
}

// Periods 1-4 meet on A days and 5-8 on B days. Unset days, Testing Blocks
// (school-wide) and reassessments (in Academic Support) are visible to every
// period.
function isAssessmentVisibleForPeriod(entry, periodIndex) {
  if (periodIndex == null || entry.type === "Testing Block" || isReassessment(entry)) return true;
  const dayType = allDayTypes[entry.date];
  if (dayType === "A") return periodIndex < 4;
  if (dayType === "B") return periodIndex >= 4;
  return true;
}

// Every A and B day has the same shape; slot maps a block to periodIndex slot
// (A) or slot + 4 (B).
const SCHEDULE_BLOCKS = [
  { type: "class", slot: 0, label: "Period 1/5" },
  { type: "class", slot: 1, label: "Period 2/6" },
  { type: "lunch", label: "Lunch" },
  { type: "class", slot: 2, label: "Period 3/7" },
  { type: "class", slot: 3, label: "Period 4/8" },
];

// The Bell Schedule's slots, whose times are the same every day. blockN is
// SCHEDULE_BLOCKS[N] (and times[N]); the others are their own fields.
const SCHEDULE_EVENT_KEYS = ["testingBlock", "advisory", "block0", "block1", "block2", "block3", "block4", "academicSupport"];

// What a slot normally holds on a date: itself, except a class slot, which
// holds that day's period (period1-4 on an A day, period5-8 on a B day), or
// both ("Period 1/5", its own key) on a day not yet set A or B.
function defaultScheduleEvent(slot, dayType) {
  if (!slot.startsWith("block")) return slot;
  const block = SCHEDULE_BLOCKS[Number(slot.slice(5))];
  if (block.type !== "class" || (dayType !== "A" && dayType !== "B")) return slot;
  return `period${block.slot + (dayType === "A" ? 1 : 5)}`;
}

// An event's normal times, which are also the times of its slot.
function scheduleEventTimes(key) {
  if (!defaultPeriodTimes) return null;
  if (key === "testingBlock") return defaultPeriodTimes.testingBlock || TESTING_BLOCK_FALLBACK_TIMES;
  if (key === "advisory") return defaultPeriodTimes.advisory || null;
  if (key === "academicSupport") return academicSupportTimes();
  return (defaultPeriodTimes.times || [])[Number(key.slice(5))] || null;
}

// A date's schedule: [{ key, start, end }] in time order. Slots and their times
// are the same every day; normally each holds its own event (the day's period
// in a class slot), the Testing Block on Mondays and Fridays and Advisory on
// other weekdays. An admin can rearrange a single date (daySchedules[iso]):
// which event sits in which slot, any period included, and which slots are
// used at all.
function scheduleForDate(iso) {
  const weekday = fromISODate(iso).getDay();
  if (weekday === 0 || weekday === 6 || !defaultPeriodTimes) return [];
  const dayType = allDayTypes[iso];
  const custom = defaultPeriodTimes.daySchedules && defaultPeriodTimes.daySchedules[iso];
  const included = (key) => {
    if (custom && Array.isArray(custom.included)) return custom.included.includes(key);
    if (key === "testingBlock") return weekday === 1 || weekday === 5;
    if (key === "advisory") return weekday !== 1 && weekday !== 5;
    return true;
  };
  return SCHEDULE_EVENT_KEYS.map((slot) => ({ slot, time: scheduleEventTimes(slot) }))
    .filter(({ time }) => time && time.start && time.end)
    .sort((a, b) => (a.time.start < b.time.start ? -1 : a.time.start > b.time.start ? 1 : 0))
    .map(({ slot, time }) => ({
      key: (custom && custom.slots && custom.slots[slot]) || defaultScheduleEvent(slot, dayType),
      start: time.start,
      end: time.end,
    }))
    .filter(({ key }) => included(key));
}

// When an event happens on a date, or null if it doesn't that day.
function scheduledTimeOn(iso, key) {
  return scheduleForDate(iso).find((event) => event.key === key) || null;
}

// Any weekday counts, A/B set or not, since the bell rings the same either way.
function isDuringSchoolNow() {
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  if (!defaultPeriodTimes) return false;

  const events = scheduleForDate(toISODate(now));

  const toMinutes = (hhmm) => {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return hours * 60 + minutes;
  };
  let first = null;
  let last = null;
  events.forEach((time) => {
    if (!time || !time.start || !time.end) return;
    const start = toMinutes(time.start);
    const end = toMinutes(time.end);
    if (first === null || start < first) first = start;
    if (last === null || end > last) last = end;
  });
  if (first === null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return nowMinutes >= first && nowMinutes < last;
}

function assessmentsForCourse(courseName, periodIndex) {
  return allAssessments
    .filter((entry) => entry.courseName === courseName && isAssessmentVisibleForPeriod(entry, periodIndex))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function assessmentsForCourses(courseEntries) {
  return allAssessments
    .filter((entry) =>
      courseEntries.some(
        ({ name, periodIndex }) => entry.courseName === name && isAssessmentVisibleForPeriod(entry, periodIndex)
      )
    )
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Until an admin saves one in the Bell Schedule.
const TESTING_BLOCK_FALLBACK_TIMES = { start: "08:00", end: "08:50" };
// Until an admin saves one in the Bell Schedule.
const ACADEMIC_SUPPORT_FALLBACK_TIMES = { start: "15:25", end: "16:00" };

function academicSupportTimes() {
  return (defaultPeriodTimes && defaultPeriodTimes.academicSupport) || ACADEMIC_SUPPORT_FALLBACK_TIMES;
}

function isReassessment(entry) {
  return /reassess/i.test(entry.type);
}

// null when it can't be told (no schedule, or the class doesn't meet that day);
// it then counts until the day is over.
function assessmentEndsAt(entry, periodIndex) {
  if (!defaultPeriodTimes && !isReassessment(entry)) return null;
  let end = null;
  // Wherever that date's schedule puts the event, falling back to its normal
  // times for the Testing Block and Academic Support.
  if (isReassessment(entry)) {
    end = (scheduledTimeOn(entry.date, "academicSupport") || academicSupportTimes()).end;
  } else if (entry.type === "Testing Block") {
    end = (scheduledTimeOn(entry.date, "testingBlock") || defaultPeriodTimes.testingBlock || TESTING_BLOCK_FALLBACK_TIMES).end;
  } else {
    if (periodIndex === undefined || periodIndex === null) return null;
    // Only on a date the period meets.
    const time = scheduledTimeOn(entry.date, `period${periodIndex + 1}`);
    end = time && time.end;
  }
  if (!end) return null;
  const [hours, minutes] = end.split(":").map(Number);
  const date = fromISODate(entry.date);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function assessmentStillUpcoming(entry, periodIndex, now = new Date()) {
  const today = toISODate(now);
  if (entry.date !== today) return entry.date > today;
  const endsAt = assessmentEndsAt(entry, periodIndex);
  return !endsAt || now < endsAt;
}

function nearestUpcomingAssessment(courseName, type, periodIndex) {
  return (
    assessmentsForCourse(courseName, periodIndex).find(
      (entry) => entry.type === type && assessmentStillUpcoming(entry, periodIndex)
    ) || null
  );
}

function nearestUpcomingAnyAssessment(courseName, periodIndex) {
  const schoolWide =
    assessmentsForCourse(courseName, periodIndex).find((entry) => assessmentStillUpcoming(entry, periodIndex)) || null;

  // The student's own added assessments count too (not assignments). Not every
  // page has them, hence typeof. On a tie the school-wide entry wins.
  const own =
    typeof loadAddedAssessments === "function"
      ? loadAddedAssessments()
          .filter(
            (entry) =>
              entry.type !== "Assignment" &&
              entry.courseName === courseName &&
              assessmentStillUpcoming(entry, periodIndex)
          )
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null
      : null;

  if (!own) return schoolWide;
  if (!schoolWide) return own;
  return own.date < schoolWide.date ? own : schoolWide;
}

fetchAssessments();
fetchDayTypes();
fetchPeriodTimes();
