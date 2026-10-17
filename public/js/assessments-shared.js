
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
    if (cachedCopyIsCurrent({ hasCache, failed, serverVersion: version, localVersion: readLocalCacheVersions()[key] })) {
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

// The schedule math lives in src/core/schedule.js and takes the school data
// as arguments; these hand it what this page has loaded, under the names the
// other scripts use.
const {
  SCHEDULE_BLOCKS,
  TESTING_BLOCK_FALLBACK_TIMES,
  ACADEMIC_SUPPORT_FALLBACK_TIMES,
  isReassessment,
  defaultScheduleEvent,
} = KisCore.schedule;

function isAssessmentVisibleForPeriod(entry, periodIndex) {
  return KisCore.schedule.isAssessmentVisibleForPeriod(entry, periodIndex, allDayTypes);
}

function scheduleForDate(iso) {
  return KisCore.schedule.scheduleForDate(iso, allDayTypes, defaultPeriodTimes);
}

function scheduledTimeOn(iso, key) {
  return KisCore.schedule.scheduledTimeOn(iso, key, allDayTypes, defaultPeriodTimes);
}

function academicSupportTimes() {
  return KisCore.schedule.academicSupportTimes(defaultPeriodTimes);
}

// For Privacy Blur's During School mode (see evaluatePrivacyBlur in
// preferences.js).
function isDuringSchoolNow() {
  return KisCore.schedule.isDuringSchool(new Date(), allDayTypes, defaultPeriodTimes);
}

function assessmentEndsAt(entry, periodIndex) {
  return KisCore.schedule.assessmentEndsAt(entry, periodIndex, allDayTypes, defaultPeriodTimes);
}

function assessmentStillUpcoming(entry, periodIndex, now = new Date()) {
  return KisCore.schedule.assessmentStillUpcoming(entry, periodIndex, now, allDayTypes, defaultPeriodTimes);
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
