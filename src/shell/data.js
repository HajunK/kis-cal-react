// The signed-in student's data, from shared.js and encryption.js: appData,
// its per-user cache on this device, saving it (the grade fields encrypted),
// and this device's key. Everything about the user lives here and in
// Firestore; localStorage only caches it per user for faster loads. Signed
// out, edits stay in memory and are lost on leaving.
//
// Which user and data are on screen is set by session.js (setSession), which
// tells the app to redraw; the tabs read and save through the functions here.

import { ENCRYPTED_FIELDS, encryptAppDataForCloud, generateRawKeyBase64, importRawKey } from "../core/crypto.js";
import { emptyAppData } from "../core/sync.js";
import { firestore, hasFirebase } from "./firebase.js";
import { showSignInToast } from "./ui.js";

export let appData = emptyAppData();
export let currentUid = null;

// What's drawn changes with these (see session.js and AppShell): a new user,
// or data replaced from the cloud. Not on this tab's own saves, which the
// tabs already show.
let sessionVersion = 0;
const sessionListeners = new Set();
export const sessionStore = {
  subscribe(listener) {
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
  },
  version: () => sessionVersion,
};

// The data in place; redrawSession then has the app draw it.
export function setSession(uid, data) {
  currentUid = uid;
  appData = data;
}

export function redrawSession() {
  sessionVersion++;
  sessionListeners.forEach((listener) => listener());
}

export function resetAppData() {
  appData = emptyAppData();
}

export function loadPeriods() {
  return appData.periods;
}

export function loadPeriodDivisions() {
  // Older cached data may not have this field.
  return appData.periodDivisions || [];
}

export function loadHiddenCourses() {
  return appData.hiddenCourses || [];
}

export function saveHiddenCourses(names) {
  appData.hiddenCourses = names;
  pushDataToCloud();
}

export function loadAddedAssessments() {
  return appData.addedAssessments || [];
}

export function saveAddedAssessments(entries) {
  appData.addedAssessments = entries;
  pushDataToCloud();
}

export function loadCompletedTasks() {
  return appData.completedTasks || [];
}

export function saveCompletedTasks(ids) {
  appData.completedTasks = ids;
  pushDataToCloud();
}

// Firestore is the source of truth; the local cache only spares each load a
// network round trip.

export const APP_DATA_CACHE_PREFIX = "cachedAppData_";

export function cacheKeyFor(uid) {
  return `${APP_DATA_CACHE_PREFIX}${uid}`;
}

export function readCachedAppData(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKeyFor(uid)));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedAppData(uid, data) {
  try {
    localStorage.setItem(cacheKeyFor(uid), JSON.stringify(data));
  } catch {
    // The cache is optional.
  }
}

// Keeps only the current user's cache on this device.
export function clearOtherCachedAppData(uid) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(APP_DATA_CACHE_PREFIX) && key !== cacheKeyFor(uid)) {
      localStorage.removeItem(key);
    }
  }
}

// Readable synchronously, unlike Firebase's auth state, so it's used as a
// first guess for instant rendering.
const LAST_UID_KEY = "lastKnownUid";

export function readLastKnownUid() {
  try {
    return localStorage.getItem(LAST_UID_KEY);
  } catch {
    return null;
  }
}

export function writeLastKnownUid(uid) {
  try {
    localStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    // Storage is optional.
  }
}

export function clearLastKnownUid() {
  try {
    localStorage.removeItem(LAST_UID_KEY);
  } catch {
    // Storage is optional.
  }
}

// Saves from this tab still on their way (encrypting, then writing), during
// which a snapshot of the cloud copy is older than this tab's own data (see
// watchUserDocForChanges in session.js).
let cloudWritesInFlight = 0;
export const savesInFlight = () => cloudWritesInFlight;

// Saves come in bursts (one change can ask for two), and writing everything
// (the cached copy, then encrypting and sending it) takes a frame or more on a
// slow device, which would hold up the animation a change starts. So the write
// waits SAVE_DELAY_MS, asked for once however many times it's asked, and is made
// at once if the tab is hidden or closed, or before signing out. It carries
// whatever the data is by then, so nothing asked for in the meantime is left
// out.
const SAVE_DELAY_MS = 1000;
let saveTimer = null;
let savingUid = null;

export function pushDataToCloud() {
  if (!currentUid) {
    showSignInToast();
    return;
  }
  // Lets a read that races this write tell its data is newer.
  appData.lastModified = Date.now();
  // Encryption hides data from Firestore, not from this device.
  if (!hasFirebase()) {
    writeCachedAppData(currentUid, appData);
    return;
  }
  // Counted as in flight from now, so a cloud snapshot arriving before the write
  // is made isn't taken for newer data than this tab's own.
  if (saveTimer !== null) return;
  savingUid = currentUid;
  cloudWritesInFlight++;
  saveTimer = setTimeout(flushPendingSave, SAVE_DELAY_MS);
}

// Makes the waiting save now, if there is one.
export function flushPendingSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const uid = savingUid;
  // Not for an account that has since signed out (its data is gone from appData).
  if (uid !== currentUid) {
    cloudWritesInFlight--;
    return;
  }
  writeCachedAppData(uid, appData);

  // Safe as a shallow copy: the encrypted fields are always replaced
  // wholesale, never mutated. Preferences are left out: they save themselves
  // (see setPreference), and this tab's copy in appData isn't kept up to date,
  // so writing it put back whatever they were when the page loaded. Merged, so
  // they're kept rather than dropped; every field written is replaced whole.
  const { preferences, ...snapshot } = appData;
  getDeviceKey(uid)
    .then((key) => encryptAppDataForCloud(snapshot, key))
    .then((encrypted) => firestore().collection("users").doc(uid).set(encrypted, { merge: true }))
    .catch((error) => console.error("Failed to save to Firestore:", error))
    .finally(() => cloudWritesInFlight--);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSave();
  });
  window.addEventListener("pagehide", flushPendingSave);
}

// Grades are encrypted on the device so Firestore only ever holds ciphertext.
// The AES-GCM key is generated per device and account and never leaves this
// browser's localStorage; another device needs the code from Settings, and a
// lost code means the data can't be read. The format itself is
// src/core/crypto.js.

export function encKeyStorageKey(uid) {
  return `encKey_${uid}`;
}

// Cached as a Promise so concurrent callers share one import instead of
// racing.
const deviceKeyCache = {};

export function getDeviceKey(uid) {
  if (deviceKeyCache[uid]) return deviceKeyCache[uid];

  const storageKey = encKeyStorageKey(uid);
  let rawBase64 = localStorage.getItem(storageKey);
  if (!rawBase64) {
    rawBase64 = generateRawKeyBase64();
    localStorage.setItem(storageKey, rawBase64);
  }

  const promise = importRawKey(rawBase64);
  deviceKeyCache[uid] = promise;
  return promise;
}

export function hasStoredDeviceKey(uid) {
  return !!localStorage.getItem(encKeyStorageKey(uid));
}

export function storeDeviceKey(uid, key, rawBase64) {
  localStorage.setItem(encKeyStorageKey(uid), rawBase64);
  deviceKeyCache[uid] = Promise.resolve(key);
}

// Only asks for the login key (askForKey, the shell's prompt) when this
// device has no key and there's encrypted data to unlock.
export function resolveDeviceKeyForBoot(uid, cloud, askForKey) {
  if (hasStoredDeviceKey(uid)) return getDeviceKey(uid);

  const hasExistingEncryptedData = ENCRYPTED_FIELDS.some((field) => typeof cloud[field] === "string");
  if (!hasExistingEncryptedData) return getDeviceKey(uid);

  return askForKey(uid, cloud);
}
