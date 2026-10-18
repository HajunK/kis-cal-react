// The GPA tab's data: which courses it lists and the grades it saves.
// appData.gpaClasses is [{ name, slug, label }], slug and label null for no
// grade: what every saved GPA list already holds, so the shape mustn't change.

import { expandCourseNames } from "../core/catalog.js";
import { decryptValue } from "../core/crypto.js";

const NO_GRADE = { slug: null, label: null };

// One row per class: the periods' courses, combo courses split into their
// parts (each part has its own grade).
export function currentClassNames(periods) {
  return expandCourseNames((periods || []).map((name) => (name || "").trim()).filter((name) => name !== ""));
}

// A saved grade wins, so a manual override survives a reload; otherwise the
// Domain tab's letter grade, if it has one.
export function buildGpaClasses(periods, saved, domainSnapshot) {
  return currentClassNames(periods).map((name) => {
    const remembered = (saved || []).find((entry) => entry.name === name);
    if (remembered) return remembered;
    const fromDomain = (domainSnapshot || []).find((entry) => entry.name === name);
    return fromDomain || { name, ...NO_GRADE };
  });
}

// What Paste from Domain Tab puts in each row: Domain's grade, or none.
export function classesFromDomain(periods, domainSnapshot) {
  return currentClassNames(periods).map((name) => {
    const fromDomain = (domainSnapshot || []).find((entry) => entry.name === name);
    return fromDomain || { name, ...NO_GRADE };
  });
}

// Exactly { name, slug, label } per row, as gpa.js saved them.
export function toSavedGpaClasses(classes) {
  return classes.map(({ name, slug, label }) => ({ name, slug: slug || null, label: label || null }));
}

// For Paste from Domain Tab: appData's Domain grades could be stale (edited in
// another tab), so the latest are read from the server. A read older than
// what this tab has (it can race another tab's write) is ignored. The cloud
// copy is encrypted, so it's decrypted with this device's key. Like the old
// gpa.js, it updates appData's copy and lastModified to what it read. Never
// rejects: on any failure it falls back to appData's copy.
export function fetchLatestDomainSnapshot({ uid, db, appData, getDeviceKey }) {
  if (!uid || !db) return Promise.resolve(appData.domainSnapshot);
  return db
    .collection("users")
    .doc(uid)
    // Must be the latest, so the local cache won't do.
    .get({ source: "server" })
    .then((snapshot) => {
      const cloud = snapshot.exists ? snapshot.data() : {};
      const fetchedLastModified = cloud.lastModified || 0;
      if (fetchedLastModified < (appData.lastModified || 0)) return appData.domainSnapshot;
      return getDeviceKey(uid)
        .then((key) => decryptValue(key, cloud.domainSnapshot, []))
        .then((domainSnapshot) => {
          appData.domainSnapshot = domainSnapshot;
          appData.lastModified = fetchedLastModified;
          return domainSnapshot;
        });
    })
    .catch((error) => {
      console.error("Failed to fetch the latest Domain scores:", error);
      return appData.domainSnapshot;
    });
}
