/* global appData, currentUid, pushDataToCloud, getDeviceKey, animateNumberChange, ROLL_DURATION_MS, ROLL_STAGGER_MS,
   googleProvider, APP_DATA_CACHE_PREFIX, prefsCacheKeyFor, encKeyStorageKey, resolveDeviceKeyForBoot, uiIconPath,
   myCoursesRefreshCalendar, renderDomainClasses, qrcode */

// What React pages use from the plain scripts still loaded beside them
// (shared.js, encryption.js...). Their top-level let and const aren't on
// window, but a module shares their global scope, so they're read by name.
// Each is read when called, as those scripts run after this module, and not
// every page loads every script (typeof checks a name that may not exist
// without throwing).

export const legacyPage = {
  appData: () => appData,
  uid: () => currentUid,
  // Saves all of appData (see pushDataToCloud in shared.js).
  save: () => pushDataToCloud(),
  getDeviceKey: (uid) => getDeviceKey(uid),
  animateNumberChange: (element, text, style) => animateNumberChange(element, text, style),
  roll: () => ({ rollMs: ROLL_DURATION_MS, staggerMs: ROLL_STAGGER_MS }),
  firestore: () => (typeof firebase !== "undefined" && window.firebase.firestore ? window.firebase.firestore() : null),
  currentUser: () => (typeof firebase !== "undefined" && window.firebase.auth ? window.firebase.auth().currentUser : null),
  googleProvider: () => googleProvider,

  // The user's data, on pages that have it (shared.js).
  hasUserData: () => typeof appData !== "undefined",

  // localStorage keys, as preferences.js, shared.js and encryption.js name them.
  appDataCacheKey: (uid) => APP_DATA_CACHE_PREFIX + uid,
  prefsCacheKey: (uid) => prefsCacheKeyFor(uid),
  encKeyStorageKey: (uid) => encKeyStorageKey(uid),
  // May ask for the login key (see encryption.js).
  resolveDeviceKey: (uid, cloud) => resolveDeviceKeyForBoot(uid, cloud),
  qrcode: () => (typeof qrcode === "function" ? qrcode : null),
  uiIconPath: (name) => uiIconPath(name),

  // The page's own toast where it has one (shared.js), so two never show.
  // false where it hasn't.
  showToast: (message) => {
    if (typeof window.showToast !== "function") return false;
    window.showToast(message);
    return true;
  },

  // My Courses' edits shown live on the tab underneath: the Calendar
  // (src/calendar) and Domain (src/domain), when it's one of those.
  refreshCalendar: () => {
    if (typeof myCoursesRefreshCalendar !== "undefined" && myCoursesRefreshCalendar) myCoursesRefreshCalendar(true, true);
  },
  refreshDomain: () => {
    if (typeof renderDomainClasses === "function") renderDomainClasses(true);
  },
};

// For hydrating a page's own markup: whitespace-only text between its tags
// (which shows nothing in these flex and block layouts) isn't in React's
// render, so it would count as a mismatch and the markup would be rebuilt,
// replaying its entrance animation.
export function removeBlankText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const blank = [];
  while (walker.nextNode()) if (!walker.currentNode.textContent.trim()) blank.push(walker.currentNode);
  blank.forEach((node) => node.remove());
}
