// Who's signed in and whose data is on screen, from boot.js and auth.js: the
// cached copy shown at once, confirmed against the server, then kept in step
// with changes made elsewhere. Where those reloaded the page (signing in or
// out, another device's change, a reset login key), this puts the new data
// in place (setSession) and the app redraws the open tab from it.
//
// It uses onSnapshot rather than .get() because its metadata says for
// certain whether a value is confirmed by the server or just a local echo.

import { isAdminEmail } from "../core/admins.js";
import { appDataIsEmpty, deepEqual, emptyAppData, normalizeCloudData } from "../core/sync.js";
import {
  appData,
  cacheKeyFor,
  clearLastKnownUid,
  clearOtherCachedAppData,
  currentUid,
  getDeviceKey,
  pushDataToCloud,
  readCachedAppData,
  readLastKnownUid,
  redrawSession,
  resolveDeviceKeyForBoot,
  savesInFlight,
  setSession,
  writeCachedAppData,
  writeLastKnownUid,
} from "./data.js";
import { firebaseAuth, firestore } from "./firebase.js";
import { applyCloudPreferences, preferencesForUser } from "./preferences.js";

// What the app shows about the session: whether there's data to draw yet,
// the signed-in user (null signed out, undefined until known), and whether
// they're an admin (guessed from last time until known).
const ADMIN_TAB_CACHE_KEY = "isAdminGuess";
const readAdminGuess = () => {
  try {
    return localStorage.getItem(ADMIN_TAB_CACHE_KEY) === "true";
  } catch {
    return false;
  }
};
// The account picture shows from last time's at once too (avatar).
const AVATAR_CACHE_KEY = "avatarGuess";
export const AVATAR_IMAGE_KEY = "avatarImage";
const TRANSPARENT_GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const readAvatarGuess = () => {
  try {
    return localStorage.getItem(AVATAR_CACHE_KEY);
  } catch {
    return null;
  }
};
let state = { ready: false, user: undefined, isAdmin: readAdminGuess(), avatar: readAvatarGuess() };
const listeners = new Set();
const update = (changes) => {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
};
export const sessionState = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
};

// Data on screen for uid (null signed out). Without data, the tabs wait.
function show(uid, data) {
  setSession(uid, data || emptyAppData());
  state = { ...state, ready: Boolean(data) };
  redrawSession();
  update({});
}

// The login key prompt (DecryptionPrompt.jsx) answers this.
let keyPrompt = null;
export const keyPromptState = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => keyPrompt,
};
function askForKey(uid, cloud) {
  return new Promise((resolve) => {
    const dismiss = () => {
      keyPrompt = null;
      update({});
    };
    keyPrompt = { uid, cloud, resolve: (key) => (dismiss(), resolve(key)) };
    update({});
  });
}

// For Login Key, which may need to ask too.
export function resolveDeviceKey(uid, cloud) {
  return resolveDeviceKeyForBoot(uid, cloud, askForKey);
}

// Rejects after timeoutMs so a bad connection can't hang the page forever.
function waitForConfirmedUserDoc(uid, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error("Timed out waiting for a confirmed Firestore read"));
    }, timeoutMs);

    const unsubscribe = firestore()
      .collection("users")
      .doc(uid)
      .onSnapshot(
        (snapshot) => {
          if (settled || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve(snapshot);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          reject(error);
        }
      );
  });
}

// A change made elsewhere is put in place once nothing is being typed, which
// would be lost: once the field is left. A hidden tab takes it at once.
let pendingRedraw = null;
function redrawWhenIdle(uid) {
  if (pendingRedraw) return;
  const editing = () => {
    const active = document.activeElement;
    return active && active.matches("input, textarea, select, [contenteditable]");
  };
  const redraw = () => {
    pendingRedraw = null;
    if (uid === currentUid) show(uid, appData);
  };
  if (document.hidden || !editing()) {
    redraw();
    return;
  }
  pendingRedraw = function waitForIdle() {
    setTimeout(() => {
      if (editing()) return;
      document.removeEventListener("focusout", waitForIdle);
      redraw();
    }, 0);
  };
  document.addEventListener("focusout", pendingRedraw);
}

// Keeps this tab in step with the cloud copy after it has loaded, so a stale
// tab (another tab of the site, localhost beside the live site, another
// device) never saves over newer data with what it loaded earlier. Preferences
// apply in place. This tab's own saves come back here too, and are skipped as
// they match what it already has.
let stopWatching = null;
function watchUserDocForChanges(uid) {
  if (stopWatching) stopWatching();
  stopWatching = firestore()
    .collection("users")
    .doc(uid)
    .onSnapshot(
      (snapshot) => {
        // Only confirmed server data, and not while this tab's own save is
        // still on its way, when the cloud copy is behind this tab's.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || savesInFlight() > 0) return;
        if (uid !== currentUid) return;
        const cloud = snapshot.exists ? snapshot.data() : {};
        applyCloudPreferences(uid, cloud.preferences || {});
        getDeviceKey(uid)
          .then((key) => normalizeCloudData(cloud, key))
          .then((fresh) => {
            if (uid !== currentUid || savesInFlight() > 0) return;
            const withoutMeta = ({ lastModified, preferences, ...rest }) => rest;
            if (deepEqual(withoutMeta(fresh), withoutMeta(appData))) return;
            // In place now, so saves meanwhile build on it; drawn once idle.
            const next = { ...fresh, preferences: appData.preferences };
            setSession(uid, next);
            writeCachedAppData(uid, next);
            redrawWhenIdle(uid);
          })
          .catch((error) => console.error("[sync] Failed to read a change from the cloud:", error));
      },
      (error) => console.error("[sync] Stopped listening for changes:", error)
    );
}

// Work typed while signed out carries over to a brand-new account on signing
// in (it used to be stashed across the reload; now it's simply kept).
let pendingAnonymousData = null;

// Merged so the rest of the doc is untouched. The local cache is updated too,
// or a later non-merge save would put back a stale email.
function saveEmailToFirestore(user) {
  const timestamp = Date.now();
  try {
    const key = cacheKeyFor(user.uid);
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      cached.email = user.email;
      cached.lastModified = timestamp;
      localStorage.setItem(key, JSON.stringify(cached));
    }
  } catch {
    // Shouldn't block sign-in.
  }
  firestore()
    .collection("users")
    .doc(user.uid)
    .set({ email: user.email, lastModified: timestamp }, { merge: true })
    .catch((error) => console.error("Failed to save email:", error));
}

// The admin tabs show from last time's answer until this one.
function noteAdmin(user) {
  const isAdmin = Boolean(user && isAdminEmail(user.email));
  try {
    localStorage.setItem(ADMIN_TAB_CACHE_KEY, isAdmin ? "true" : "false");
  } catch {
    // Storage is optional.
  }
  return isAdmin;
}

// user.photoURL is copied once when the account is created and never
// updated; the Google provider's entry is refreshed on every sign-in.
function currentPhotoURL(user) {
  const google = (user.providerData || []).find((info) => info && info.providerId === "google.com");
  return (google && google.photoURL) || user.photoURL || "";
}

function noteAvatar(user) {
  const avatar = user ? currentPhotoURL(user) || TRANSPARENT_GIF : null;
  try {
    if (avatar) localStorage.setItem(AVATAR_CACHE_KEY, avatar);
    else {
      // So a shared computer doesn't keep it.
      localStorage.removeItem(AVATAR_CACHE_KEY);
      localStorage.removeItem(AVATAR_IMAGE_KEY);
    }
  } catch {
    // Storage is optional.
  }
  return avatar;
}

// What's on screen is for this user: the cache at once if there is one,
// then the server's copy, then changes made elsewhere.
function loadUser(user) {
  const uid = user.uid;
  writeLastKnownUid(uid);
  clearOtherCachedAppData(uid);
  const cached = readCachedAppData(uid);

  // Shown immediately so there's something on screen, but never treated as
  // final.
  if (cached && (!state.ready || currentUid !== uid)) show(uid, cached);
  else if (currentUid !== uid) show(uid, null);

  // Well above a normal read (under 5s), so it only triggers on a struggling
  // connection.
  waitForConfirmedUserDoc(uid, 8000)
    .then((snapshot) => {
      const cloud = snapshot.exists ? snapshot.data() : {};
      // Only prompts for the code when this device lacks the key and there's
      // encrypted data to lose.
      return resolveDeviceKeyForBoot(uid, cloud, askForKey).then((key) => normalizeCloudData(cloud, key));
    })
    .then((fresh) => {
      if (uid !== currentUid) return false;
      const pending = pendingAnonymousData;
      pendingAnonymousData = null;
      if (pending && appDataIsEmpty(fresh)) {
        const merged = { ...fresh, ...pending };
        writeCachedAppData(uid, merged);
        show(uid, merged);
        pushDataToCloud();
        return true;
      }

      // lastModified is ignored: two writes can land at different times
      // without anything changing. This only skips a redundant redraw.
      const { lastModified: freshModified, ...freshData } = fresh;
      const { lastModified: cachedModified, ...cachedData } = cached || {};
      if (cached && state.ready && deepEqual(freshData, cachedData)) return true;

      writeCachedAppData(uid, fresh);
      show(uid, fresh);
      return true;
    })
    // Only safe once appData is the confirmed cloud data.
    .then((confirmed) => {
      if (!confirmed) return;
      dropAcceptedSuggestions();
      watchUserDocForChanges(uid);
    })
    .catch((error) => {
      // Keep a cache render if there was one; otherwise show empty.
      console.error("[boot] Failed to confirm Firestore data:", error);
      if (uid === currentUid && !state.ready) {
        const data = emptyAppData();
        // Auth still knows the real email even though the Firestore read
        // failed.
        data.email = user.email || "";
        show(uid, data);
      }
    });
}

let dropAcceptedSuggestions = () => {};

// Starts it all; called once Firebase is up (see the shell's main.jsx).
// onConfirmed runs once the user's data is confirmed from the server (the
// Calendar's dropAcceptedSuggestions).
export function startSession({ onConfirmed } = {}) {
  if (onConfirmed) dropAcceptedSuggestions = onConfirmed;
  firebaseAuth().onAuthStateChanged((user) => {
    // As preferences.js, auth.js and boot.js each heard it, in that order.
    preferencesForUser(user);
    update({ user, isAdmin: noteAdmin(user), avatar: noteAvatar(user) });
    if (user) saveEmailToFirestore(user);

    if (!user) {
      // Dropping this device's cache on sign-out protects shared computers.
      if (stopWatching) stopWatching();
      stopWatching = null;
      if (currentUid) localStorage.removeItem(cacheKeyFor(currentUid));
      clearLastKnownUid();
      show(null, emptyAppData());
      return;
    }

    // Signing in after a signed-out visit: what was typed carries over to a
    // brand-new account. Not when switching accounts.
    if (state.ready && currentUid === null && !appDataIsEmpty(appData)) {
      const { periods, periodDivisions, hiddenCourses, domainSnapshot, gpaClasses, domainScores } = appData;
      pendingAnonymousData = { periods, periodDivisions, hiddenCourses, domainSnapshot, gpaClasses, domainScores };
    }
    if (stopWatching && currentUid !== user.uid) {
      stopWatching();
      stopWatching = null;
    }
    loadUser(user);
  });
}

// Before Firebase answers: the last user's cached data, so a returning
// student sees their tabs at once.
export function showCachedGuess() {
  const guessedUid = readLastKnownUid();
  const guessedCache = guessedUid ? readCachedAppData(guessedUid) : null;
  if (guessedCache) show(guessedUid, guessedCache);
}

// Without Firebase (the Calendar demo): this data, under its own throwaway
// account.
export function showWithoutFirebase(uid, data) {
  show(uid, data);
  update({ user: null });
}

// Firebase didn't load (blocked by a network filter, say): the tabs show
// what this device has, or the signed-out tabs, as the old pages did, with
// nothing in the account corner (there's no signing in without it).
export function showWithoutSignIn() {
  if (!state.ready) show(null, emptyAppData());
  update({ avatar: null });
}
