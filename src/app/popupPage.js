// What the account menu's popups (Settings, Login Key, My Courses, Learn
// More) are handed: the student's data and the app's helpers. withToast: the
// tab shows the app's toast (the student tabs); the admin tabs never did, so
// the popups draw their own there.

import { makePopupToast } from "../popups/toast.js";
import {
  APP_DATA_CACHE_PREFIX,
  appData,
  currentUid,
  encKeyStorageKey,
  getDeviceKey,
  pushDataToCloud,
} from "../shell/data.js";
import { firebaseAuth, firestore, googleProvider, hasFirebase } from "../shell/firebase.js";
import { redrawCalendar, redrawDomain } from "../shell/openTab.js";
import { prefsCacheKeyFor } from "../shell/preferences.js";
import { resolveDeviceKey } from "../shell/session.js";
import { showToast, uiIconPath } from "../shell/ui.js";

export function popupPage(withToast) {
  return {
    appData: () => appData,
    uid: () => currentUid,
    // Saves all of appData (see pushDataToCloud).
    save: () => pushDataToCloud(),
    getDeviceKey,
    firestore: () => (hasFirebase() ? firestore() : null),
    currentUser: () => (hasFirebase() ? firebaseAuth().currentUser : null),
    googleProvider,
    appDataCacheKey: (uid) => APP_DATA_CACHE_PREFIX + uid,
    prefsCacheKey: prefsCacheKeyFor,
    encKeyStorageKey,
    // May ask for the login key (see DecryptionPrompt).
    resolveDeviceKey,
    qrcode: () => (typeof window.qrcode === "function" ? window.qrcode : null),
    uiIconPath,
    toast: makePopupToast((message) => {
      if (!withToast) return false;
      showToast(message);
      return true;
    }),
    // My Courses' edits shown live on the tab underneath.
    refreshCalendar: () => redrawCalendar(true, true),
    refreshDomain: () => redrawDomain(true),

    // My Courses' data: the periods' typed courses, their divisions, and the
    // courses hidden from Domain.
    periods: () => appData.periods,
    savePeriods: (periods) => {
      appData.periods = periods;
      pushDataToCloud();
    },
    // Older cached data may not have this field.
    divisions: () => appData.periodDivisions || [],
    saveDivisions: (periodDivisions) => {
      // Picking a later period's division first leaves holes that read as
      // undefined, which Firestore's .set() rejects. Array.from fills every
      // index (.map would skip holes).
      appData.periodDivisions = Array.from({ length: periodDivisions.length }, (_, i) => periodDivisions[i] || "");
      pushDataToCloud();
    },
    hidden: () => appData.hiddenCourses || [],
    saveHidden: (names) => {
      appData.hiddenCourses = names;
      pushDataToCloud();
    },
  };
}
