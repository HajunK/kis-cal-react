// The preferences, from preferences.js unchanged. Applied as this module
// loads, so they're in place before anything draws. Signed in, they live in
// the user doc's "preferences" field (written with merge, so nothing else is
// touched); signed out, in localStorage for this device. A change tells the
// app (subscribe) and the tabs (the app:preferences-changed event).

import { firestore, hasFirebase } from "./firebase.js";
import { isDuringSchoolNow, isScheduleReadyForBlur } from "./school.js";
import { refreshGradeIcons, refreshUiIcons } from "./ui.js";

export const DEFAULT_PREFERENCES = {
  appearance: "system", // "light" | "dark" | "system"
  dateFormat: "monthDay", // "monthDay" ("Aug 16") | "numeric" ("8/16") | "dayMonth" ("16 Aug") | "numericEU" ("16/8")
  showBreakdown: true, // the FA/SA/D line on Domain class cards
  showUpcomingAssessments: true, // the "Upcoming ...:" line on Domain class cards
  replaceFormativesByDefault: true, // a newly-qualifying Formative starts linked to its Summative
  privacyBlurMode: "never", // "never" | "school" | "always" — blurs Domain scores until hovered
  courseColors: {}, // typed course name -> color name picked in the Calendar tab's Course Colors
  calendarView: "calendar", // "calendar" | "byClass": the Calendar tab's layout, kept from the last visit
  hideAdminTabs: false,  // admins only: hides the admin tabs (Assessments)
};

const PREFS_CACHE_PREFIX = "prefs_";
export const PREFS_ANON_KEY = "prefs_anon";
const PREFS_LAST_UID_KEY = "lastKnownUid"; // shared with data.js
const APP_DATA_CACHE_PREFIX = "cachedAppData_"; // shared with data.js

export function prefsCacheKeyFor(uid) {
  return PREFS_CACHE_PREFIX + uid;
}

const DATE_FORMAT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatPreferredDate(date, formatOverride) {
  const format = formatOverride || currentPrefs.dateFormat;
  const month = DATE_FORMAT_MONTHS[date.getMonth()];
  const day = date.getDate();
  const monthNum = date.getMonth() + 1;
  switch (format) {
    case "numeric":
      return `${monthNum}/${day}`;
    case "dayMonth":
      return `${day} ${month}`;
    case "numericEU":
      return `${day}/${monthNum}`;
    case "monthDay":
    default:
      return `${month} ${day}`;
  }
}

// modified guards against a stale confirmation fetch overwriting a change just
// made.
function readCachedPrefs(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.prefs && typeof parsed.prefs === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeCachedPrefs(key, prefs, modified) {
  try {
    localStorage.setItem(key, JSON.stringify({ prefs, modified }));
  } catch (error) {
  }
}

function resolveTheme(appearance) {
  if (appearance === "dark") return "dark";
  if (appearance === "light") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Settings re-syncs its controls on this when confirmed preferences arrive or
// revert.
const listeners = new Set();
export function subscribePreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
// key: the one preference changed here, when it's known, so a tab can leave
// alone a change that doesn't touch what it draws (Privacy Blur is all CSS on
// the page, and redrawing every card for it held up the switch in Settings).
function notifyPreferencesChanged(key) {
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("app:preferences-changed", { detail: { key } }));
}

// "school" mode depends on the time of day, so it's re-checked on a timer.
let privacyBlurMode = "never";
let privacyBlurTimer = null;
let privacyBlurChangingTimer = null;
let privacyBlurEvaluated = false;

function evaluatePrivacyBlur() {
  const on =
    privacyBlurMode === "always" ||
    (privacyBlurMode === "school" && isDuringSchoolNow());
  const root = document.documentElement;
  // In During School mode the answer isn't known until the bell schedule has
  // loaded (a moment after the page, from the network), so until then each
  // evaluation still counts as the first: turning on then is the page's
  // starting state, not a change to animate.
  const decided = privacyBlurMode !== "school" || isScheduleReadyForBlur();
  const first = !privacyBlurEvaluated;
  const settle = () => {
    if (!decided || privacyBlurEvaluated) return;
    privacyBlurEvaluated = true;
    // The blur's own eases (hover reveals, school starting or ending) only
    // from here on, once the starting state is on screen.
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("privacy-blur-settled")));
  };
  if (on === (root.dataset.privacyBlur === "true")) {
    settle();
    return;
  }
  // Lets domain.css ease the toggle itself without those transitions catching
  // every other change. Skipped on the first evaluation so the page doesn't
  // animate into its starting state.
  if (privacyBlurEvaluated) {
    root.classList.add("privacy-blur-changing");
    clearTimeout(privacyBlurChangingTimer);
    privacyBlurChangingTimer = setTimeout(() => root.classList.remove("privacy-blur-changing"), 300);
  }
  if (on) root.dataset.privacyBlur = "true";
  else delete root.dataset.privacyBlur;
  if (first) settle();
}
export const refreshPrivacyBlur = evaluatePrivacyBlur;

function applyPrivacyBlur(mode) {
  privacyBlurMode = mode === "school" || mode === "always" ? mode : "never";
  clearInterval(privacyBlurTimer);
  privacyBlurTimer = privacyBlurMode === "school" ? setInterval(evaluatePrivacyBlur, 5000) : null;
  evaluatePrivacyBlur();
}

function applyPreferences(prefs) {
  document.documentElement.dataset.theme = resolveTheme(prefs.appearance);
  if (prefs.showBreakdown === false) {
    document.documentElement.dataset.hideBreakdown = "true";
  } else {
    delete document.documentElement.dataset.hideBreakdown;
  }
  if (prefs.showUpcomingAssessments === false) {
    document.documentElement.dataset.hideUpcomingAssessments = "true";
  } else {
    delete document.documentElement.dataset.hideUpcomingAssessments;
  }
  applyPrivacyBlur(prefs.privacyBlurMode);
}

// Keeps "system" appearance in step with the OS while the page is open.
let systemThemeQuery = null;
function onSystemThemeChange() {
  document.documentElement.dataset.theme = resolveTheme("system");
  refreshGradeIcons();
  refreshUiIcons();
}
function watchSystemTheme(appearance) {
  if (systemThemeQuery) {
    systemThemeQuery.removeEventListener("change", onSystemThemeChange);
    systemThemeQuery = null;
  }
  if (appearance !== "system" || !window.matchMedia) return;
  systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeQuery.addEventListener("change", onSystemThemeChange);
}

// The appData cache re-uploads its copy of preferences on every unrelated save,
// so it has to be updated too or it would undo this change.
function syncAppDataCache(uid, prefs, timestamp) {
  try {
    const key = APP_DATA_CACHE_PREFIX + uid;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const cached = JSON.parse(raw);
    cached.preferences = { ...prefs, modified: timestamp };
    cached.lastModified = timestamp;
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
  }
}

let prefsUid = null;
try {
  prefsUid = localStorage.getItem(PREFS_LAST_UID_KEY);
} catch (error) {
  prefsUid = null;
}

// Applied synchronously, before Firebase loads, so the page never flashes the
// wrong theme. appliedPrefsModified lets the confirmation fetch tell newer data
// from stale.
const initialCached = (prefsUid && readCachedPrefs(prefsCacheKeyFor(prefsUid))) || readCachedPrefs(PREFS_ANON_KEY);
let currentPrefs = { ...DEFAULT_PREFERENCES, ...(initialCached ? initialCached.prefs : null) };
let appliedPrefsModified = initialCached ? initialCached.modified || 0 : 0;

applyPreferences(currentPrefs);
watchSystemTheme(currentPrefs.appearance);

export function getPreferences() {
  return { ...currentPrefs };
}

export function setPreference(key, value) {
  currentPrefs = { ...currentPrefs, [key]: value };
  applyPreferences(currentPrefs);
  watchSystemTheme(currentPrefs.appearance);
  refreshGradeIcons();
  refreshUiIcons();
  // So anything depending on a preference reacts to changes made in this tab
  // too, not only ones confirmed from the cloud.
  notifyPreferencesChanged(key);

  if (!prefsUid || !hasFirebase()) {
    writeCachedPrefs(PREFS_ANON_KEY, currentPrefs, Date.now());
    return;
  }

  const timestamp = Date.now();
  appliedPrefsModified = timestamp;
  writeCachedPrefs(prefsCacheKeyFor(prefsUid), currentPrefs, timestamp);
  syncAppDataCache(prefsUid, currentPrefs, timestamp);
  firestore()
    .collection("users")
    .doc(prefsUid)
    .set({ preferences: { ...currentPrefs, modified: timestamp }, lastModified: timestamp }, { merge: true })
    .catch((error) => console.error("Failed to save preferences:", error));
}

// Preferences saved to the cloud, at load or as they change in another tab or
// device (see watchUserDocForChanges in session.js). Ignored unless newer than
// what this tab has, as a read can race this tab's own write.
export function applyCloudPreferences(uid, cloudPrefs) {
  const confirmedModified = cloudPrefs.modified || 0;
  if (uid !== prefsUid || confirmedModified <= appliedPrefsModified) return;

  const { modified, ...rest } = cloudPrefs;
  const confirmed = { ...DEFAULT_PREFERENCES, ...rest };
  appliedPrefsModified = confirmedModified;
  writeCachedPrefs(prefsCacheKeyFor(uid), confirmed, confirmedModified);
  currentPrefs = confirmed;
  applyPreferences(currentPrefs);
  watchSystemTheme(currentPrefs.appearance);
  refreshGradeIcons();
  refreshUiIcons();
  notifyPreferencesChanged();
}

// Signed out: back to this browser's own anonymous preferences. Signed in:
// the account's, confirmed from the server. Called by session.js as sign-in
// changes.
export function preferencesForUser(user) {
  if (!user) {
    prefsUid = null;
    appliedPrefsModified = 0;
    // Back to this browser's own anonymous preferences, not the defaults.
    const anon = readCachedPrefs(PREFS_ANON_KEY);
    currentPrefs = { ...DEFAULT_PREFERENCES, ...(anon ? anon.prefs : null) };
    applyPreferences(currentPrefs);
    watchSystemTheme(currentPrefs.appearance);
    refreshGradeIcons();
    refreshUiIcons();
    notifyPreferencesChanged();
    return;
  }

  prefsUid = user.uid;
  firestore()
    .collection("users")
    .doc(user.uid)
    // A plain .get() right after sign-in can come from Firestore's local cache
    // before the doc has synced, which would look like a user with no
    // preferences.
    .get({ source: "server" })
    .then((snapshot) => {
      const cloud = snapshot.exists ? snapshot.data() : {};
      applyCloudPreferences(user.uid, cloud.preferences || {});
    })
    .catch((error) => console.error("Failed to load preferences:", error));
}
