// Starts the app; loaded last on every data page. Uses onSnapshot rather than
// .get() because its metadata says for certain whether a value is confirmed by
// the server or just a local echo. Pages are built once, so it only waits for
// one trustworthy snapshot.

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

    const unsubscribe = firebase
      .firestore()
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

// Keeps this tab in step with the cloud copy after it has loaded, so a stale
// tab (another tab of the site, localhost beside the live site, another
// device) never saves over newer data with what it loaded earlier. A change
// made elsewhere is taken in and the page rebuilt from it, by reloading, as
// pages are built once; preferences apply in place. This tab's own saves come
// back here too, and are skipped as they match what it already has.
function watchUserDocForChanges(uid) {
  let reloadQueued = false;
  // Not while something is being typed, which would be lost: once the field
  // is left. A hidden tab reloads at once, unseen.
  const reloadWhenIdle = () => {
    if (reloadQueued) return;
    reloadQueued = true;
    const editing = () => {
      const active = document.activeElement;
      return active && active.matches("input, textarea, select, [contenteditable]");
    };
    if (document.hidden || !editing()) {
      location.reload();
      return;
    }
    document.addEventListener("focusout", function waitForIdle() {
      setTimeout(() => {
        if (editing()) return;
        document.removeEventListener("focusout", waitForIdle);
        location.reload();
      }, 0);
    });
  };

  firebase
    .firestore()
    .collection("users")
    .doc(uid)
    .onSnapshot(
      (snapshot) => {
        // Only confirmed server data, and not while this tab's own save is
        // still on its way, when the cloud copy is behind this tab's.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || cloudWritesInFlight > 0) return;
        if (uid !== currentUid) return;
        const cloud = snapshot.exists ? snapshot.data() : {};
        if (typeof window.applyCloudPreferences === "function") window.applyCloudPreferences(uid, cloud.preferences || {});
        getDeviceKey(uid)
          .then((key) => normalizeCloudData(cloud, key))
          .then((fresh) => {
            if (uid !== currentUid || cloudWritesInFlight > 0) return;
            const withoutMeta = ({ lastModified, preferences, ...rest }) => rest;
            if (deepEqual(withoutMeta(fresh), withoutMeta(appData))) return;
            appData = { ...fresh, preferences: appData.preferences };
            writeCachedAppData(uid, appData);
            reloadWhenIdle();
          })
          .catch((error) => console.error("[sync] Failed to read a change from the cloud:", error));
      },
      (error) => console.error("[sync] Stopped listening for changes:", error)
    );
}

// Every field defaulted, so the rest of the app can assume the full shape.
// Async because the grade fields need decrypting.
function normalizeCloudData(cloud, key) {
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
    // Round-tripped so pushDataToCloud's plain .set() doesn't wipe them.
    preferences: cloud.preferences || {},
    email: cloud.email || "",
    lastModified: cloud.lastModified || 0,
  }));
}

// Signing in reloads the page, so work typed while signed out is stashed here
// to carry over to a brand-new account. Read back once and cleared.
const PENDING_ANONYMOUS_DATA_KEY = "pendingAnonymousData";

function appDataIsEmpty(data) {
  return (
    (data.periods || []).every((name) => !name || name.trim() === "") &&
    (data.domainSnapshot || []).length === 0 &&
    (data.gpaClasses || []).length === 0 &&
    Object.keys(data.domainScores || {}).length === 0 &&
    (data.hiddenCourses || []).length === 0 &&
    (data.addedAssessments || []).length === 0
  );
}

function writePendingAnonymousData(data) {
  try {
    // Only what a signed-out session could have touched.
    const { periods, periodDivisions, hiddenCourses, domainSnapshot, gpaClasses, domainScores } = data;
    localStorage.setItem(
      PENDING_ANONYMOUS_DATA_KEY,
      JSON.stringify({ periods, periodDivisions, hiddenCourses, domainSnapshot, gpaClasses, domainScores })
    );
  } catch (error) {
  }
}

function readAndClearPendingAnonymousData() {
  try {
    const raw = localStorage.getItem(PENDING_ANONYMOUS_DATA_KEY);
    localStorage.removeItem(PENDING_ANONYMOUS_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

const guessedUid = readLastKnownUid();
if (guessedUid) {
  const guessedCache = readCachedAppData(guessedUid);
  if (guessedCache) {
    currentUid = guessedUid;
    appData = guessedCache;
    hasInitializedPage = true;
    initPage();
  }
}

// Firebase restores auth on every page load, so this runs again for a signed-in
// user.
if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged((user) => {
    const resolvedUid = user ? user.uid : null;

    // Dropping this device's cache on sign-out protects shared computers.
    if (!user) {
      if (currentUid) localStorage.removeItem(cacheKeyFor(currentUid));
      clearLastKnownUid();
      currentUid = null;
      resetAppData();
      handleAuthResolved();
      return;
    }

    // Also true when currentUid is null (signing in after a signed-out render).
    // A reload keeps currentUid and appData changing together.
    if (hasInitializedPage && currentUid !== resolvedUid) {
      // Only when signing in, not switching accounts.
      if (!currentUid && !appDataIsEmpty(appData)) {
        writePendingAnonymousData(appData);
      }
      writeLastKnownUid(resolvedUid);
      handleAuthResolved();  // reloads, since the page already rendered
      return;
    }

    currentUid = resolvedUid;
    writeLastKnownUid(resolvedUid);
    clearOtherCachedAppData(resolvedUid);
    const cached = readCachedAppData(resolvedUid);

    // Shown immediately so there's something on screen, but never treated as
    // final.
    if (cached && !hasInitializedPage) {
      appData = cached;
      handleAuthResolved();
    }

    // Well above a normal read (under 5s), so it only triggers on a struggling
    // connection.
    waitForConfirmedUserDoc(resolvedUid, 8000)
      .then((snapshot) => {
        const cloud = snapshot.exists ? snapshot.data() : {};
        // Only prompts for the code when this device lacks the key and there's
        // encrypted data to lose.
        return resolveDeviceKeyForBoot(resolvedUid, cloud).then((key) => normalizeCloudData(cloud, key));
      })
      .then((fresh) => {
        const pending = readAndClearPendingAnonymousData();
        if (pending && appDataIsEmpty(fresh)) {
          appData = { ...fresh, ...pending };
          writeCachedAppData(resolvedUid, appData);
          pushDataToCloud();
          handleAuthResolved();
          return;
        }

        // lastModified is ignored: two writes can land at different times
        // without anything changing. This only skips a redundant re-render.
        const { lastModified: freshModified, ...freshData } = fresh;
        const { lastModified: cachedModified, ...cachedData } = cached || {};
        if (cached && deepEqual(freshData, cachedData)) return;

        appData = fresh;
        writeCachedAppData(resolvedUid, fresh);
        handleAuthResolved();
      })
      // Only safe once appData is the confirmed cloud data.
      .then(() => {
        if (typeof dropAcceptedSuggestions === "function") dropAcceptedSuggestions();
        watchUserDocForChanges(resolvedUid);
      })
      .catch((error) => {
        // Keep a cache render if there was one; otherwise show empty.
        console.error("[boot] Failed to confirm Firestore data:", error);
        if (!cached && !hasInitializedPage) {
          resetAppData();
          // Auth still knows the real email even though the Firestore read
          // failed.
          appData.email = user.email || "";
          handleAuthResolved();
        }
      });
  });
} else {
  if (!hasInitializedPage) initPage();
}
