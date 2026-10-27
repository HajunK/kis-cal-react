// The school's data every tab shares, from assessments-shared.js unchanged:
// the assessments, A/B days and bell schedule, each shown from this device's
// cache at once and refetched only when an admin change has restamped
// meta/cacheVersions, and the helpers that read them. Each loader calls back
// with the cache, then again once confirmed.

import * as schedule from "../core/schedule.js";
import { cachedCopyIsCurrent } from "../core/sync.js";
import { loadAddedAssessments } from "./data.js";
import { firestore, hasFirebase } from "./firebase.js";

export let allAssessments = [];
// Separate from assessmentsFetchDone so a cache hit can render instantly.
export let assessmentsLoaded = false;
export let assessmentsFetchDone = false;
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
// meta/cacheVersions (see bumpCacheVersion in src/admin). Each load
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
    serverCacheVersionsPromise = firestore()
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
export function loadAssessments(callback) {
  if (assessmentsLoaded) callback(allAssessments);
  if (!assessmentsFetchDone) assessmentsLoadListeners.push(callback);
}

// The assessments are for signed-in students only (see firestore.rules), so a
// visit without a sign-in is refused them. That isn't an error: it goes on without
// any (the bell schedule and day types are still read, and the Calendar has no
// courses to show them against), and signing in reads them again (see
// retryAssessmentsAfterSignIn).
let assessmentsDenied = false;

export function retryAssessmentsAfterSignIn() {
  if (!assessmentsDenied) return;
  assessmentsDenied = false;
  // Not loaded again until they are, so the tabs drawn for this sign-in wait for them.
  assessmentsLoaded = false;
  assessmentsFetchDone = false;
  fetchAssessments();
}

function fetchAssessments() {
  if (!hasFirebase()) return;
  const finish = () => {
    assessmentsLoaded = true;
    assessmentsFetchDone = true;
    assessmentsLoadListeners.splice(0).forEach((callback) => callback(allAssessments));
  };
  fetchUnlessCached("assessments", Boolean(readCachedAssessments()), finish, (version) =>
    firestore()
      .collection("assessments")
      .get()
      .then((snapshot) => {
        allAssessments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        writeCachedAssessments(allAssessments);
        writeLocalCacheVersion("assessments", version);
        finish();
      })
      .catch((error) => {
        if (error && error.code === "permission-denied") {
          assessmentsDenied = true;
          finish();
          return;
        }
        console.error("Failed to load assessments:", error);
      })
  );
}

const cachedAssessments = readCachedAssessments();
if (cachedAssessments) {
  allAssessments = cachedAssessments;
  assessmentsLoaded = true;
}

// A date without an entry is unset ("?") and counts as visible to everyone.
export let allDayTypes = {}; // ISO date -> "A" | "B"
export let dayTypesLoaded = false;
export let dayTypesFetchDone = false;
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

export function loadDayTypes(callback) {
  if (dayTypesLoaded) callback(allDayTypes);
  if (!dayTypesFetchDone) dayTypesLoadListeners.push(callback);
}

function fetchDayTypes() {
  if (!hasFirebase()) return;
  const finish = () => {
    dayTypesLoaded = true;
    dayTypesFetchDone = true;
    dayTypesLoadListeners.splice(0).forEach((callback) => callback(allDayTypes));
  };
  fetchUnlessCached("dayTypes", Boolean(readCachedDayTypes()), finish, (version) =>
    firestore()
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
export let defaultPeriodTimes = null; // { times: [{start,end}, ...] } | null
export let periodTimesLoaded = false;
export let periodTimesFetchDone = false;
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

export function loadPeriodTimes(callback) {
  if (periodTimesLoaded) callback(defaultPeriodTimes);
  if (!periodTimesFetchDone) periodTimesLoadListeners.push(callback);
}

function fetchPeriodTimes() {
  if (!hasFirebase()) return;
  const finish = () => {
    periodTimesLoaded = true;
    periodTimesFetchDone = true;
    periodTimesLoadListeners.splice(0).forEach((callback) => callback(defaultPeriodTimes));
  };
  fetchUnlessCached("periodTimes", Boolean(readCachedPeriodTimes()), finish, (version) =>
    firestore()
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

// For Privacy Blur's During School mode (see ./preferences.js): whether it can
// be told yet.
export const isScheduleReadyForBlur = () => periodTimesLoaded;

export function loadScheduleData(callback) {
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
export function loadAssessmentData(callback) {
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
// as arguments; these hand it what this app has loaded.

export function isAssessmentVisibleForPeriod(entry, periodIndex) {
  return schedule.isAssessmentVisibleForPeriod(entry, periodIndex, allDayTypes);
}

export function scheduleForDate(iso) {
  return schedule.scheduleForDate(iso, allDayTypes, defaultPeriodTimes);
}

export function scheduledTimeOn(iso, key) {
  return schedule.scheduledTimeOn(iso, key, allDayTypes, defaultPeriodTimes);
}

export function academicSupportTimes() {
  return schedule.academicSupportTimes(defaultPeriodTimes);
}

// For Privacy Blur's During School mode (see evaluatePrivacyBlur in
// ./preferences.js).
export function isDuringSchoolNow() {
  return schedule.isDuringSchool(new Date(), allDayTypes, defaultPeriodTimes);
}

export function assessmentEndsAt(entry, periodIndex) {
  return schedule.assessmentEndsAt(entry, periodIndex, allDayTypes, defaultPeriodTimes);
}

export function assessmentStillUpcoming(entry, periodIndex, now = new Date()) {
  return schedule.assessmentStillUpcoming(entry, periodIndex, now, allDayTypes, defaultPeriodTimes);
}

export function assessmentsForCourse(courseName, periodIndex) {
  return allAssessments
    .filter((entry) => entry.courseName === courseName && isAssessmentVisibleForPeriod(entry, periodIndex))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function assessmentsForCourses(courseEntries) {
  return allAssessments
    .filter((entry) =>
      courseEntries.some(
        ({ name, periodIndex }) => entry.courseName === name && isAssessmentVisibleForPeriod(entry, periodIndex)
      )
    )
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function nearestUpcomingAssessment(courseName, type, periodIndex) {
  return (
    assessmentsForCourse(courseName, periodIndex).find(
      (entry) => entry.type === type && assessmentStillUpcoming(entry, periodIndex)
    ) || null
  );
}

export function nearestUpcomingAnyAssessment(courseName, periodIndex) {
  const schoolWide =
    assessmentsForCourse(courseName, periodIndex).find((entry) => assessmentStillUpcoming(entry, periodIndex)) || null;

  // The student's own added assessments count too (not assignments). Not every
  // page has them, hence typeof. On a tie the school-wide entry wins.
  const own =
    loadAddedAssessments()
          .filter(
            (entry) =>
              entry.type !== "Assignment" &&
              entry.courseName === courseName &&
              assessmentStillUpcoming(entry, periodIndex)
          )
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;

  if (!own) return schoolWide;
  if (!schoolWide) return own;
  return own.date < schoolWide.date ? own : schoolWide;
}

// Once Firebase is up (see the shell's main.jsx).
export function startSchoolData() {
  fetchAssessments();
  fetchDayTypes();
  fetchPeriodTimes();
}

// The Calendar demo's made-up school, in place of a fetch.
export function useDemoSchoolData({ assessments, dayTypes, periodTimes }) {
  allAssessments = assessments;
  assessmentsLoaded = true;
  assessmentsFetchDone = true;
  allDayTypes = dayTypes;
  dayTypesLoaded = true;
  dayTypesFetchDone = true;
  defaultPeriodTimes = periodTimes;
  periodTimesLoaded = true;
  periodTimesFetchDone = true;
}
