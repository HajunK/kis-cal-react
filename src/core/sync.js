// The user's data (appData), as kept in users/{uid} and the local cache, and
// the decisions syncing makes about it. The Firestore reads and writes
// themselves stay in the page scripts for now.

import { decryptValue } from "./crypto.js";

// Every field, defaulted. email and preferences are round-tripped so a plain
// save doesn't wipe what the session (the email) and the preferences write there.
export function emptyAppData() {
  return {
    periods: [],
    // Parallel to periods.
    periodDivisions: [],
    // Plain names, not scores, so unencrypted.
    hiddenCourses: [],
    // Course names and dates, not scores, so unencrypted.
    addedAssessments: [],
    completedTasks: [],
    domainSnapshot: [],
    gpaClasses: [],
    domainScores: {},
    preferences: {},
    email: "",
    lastModified: 0,
  };
}

// Map key order isn't preserved by Firestore, but array order matters
// (periods[0] is Period 1).
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) => deepEqual(a[key], b[key]));
}

// Nothing a signed-out session could have typed in, so nothing worth carrying
// over to a new account.
export function appDataIsEmpty(data) {
  return (
    (data.periods || []).every((name) => !name || name.trim() === "") &&
    (data.domainSnapshot || []).length === 0 &&
    (data.gpaClasses || []).length === 0 &&
    Object.keys(data.domainScores || {}).length === 0 &&
    (data.hiddenCourses || []).length === 0 &&
    (data.addedAssessments || []).length === 0
  );
}

// The users/{uid} doc as appData: every field defaulted, so the rest of the
// app can assume the full shape, and the grade fields decrypted with key.
export function normalizeCloudData(cloud, key) {
  return Promise.all([
    decryptValue(key, cloud.domainSnapshot, []),
    decryptValue(key, cloud.gpaClasses, []),
    decryptValue(key, cloud.domainScores, {}),
  ]).then(([domainSnapshot, gpaClasses, domainScores]) => ({
    periods: cloud.periods || [],
    periodDivisions: cloud.periodDivisions || [],
    hiddenCourses: cloud.hiddenCourses || [],
    addedAssessments: cloud.addedAssessments || [],
    completedTasks: cloud.completedTasks || [],
    domainSnapshot,
    gpaClasses,
    domainScores,
    preferences: cloud.preferences || {},
    email: cloud.email || "",
    lastModified: cloud.lastModified || 0,
  }));
}

// Whether a cached school-wide collection can be used instead of refetching
// it: it matches meta/cacheVersions' stamp, or that stamp couldn't be read
// (offline, quota used up), when the cached copy is the best there is.
export function cachedCopyIsCurrent({ hasCache, failed, serverVersion, localVersion }) {
  return hasCache && (failed || (serverVersion != null && serverVersion === localVersion));
}
