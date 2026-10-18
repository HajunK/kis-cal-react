// The Assessments page's reads and writes, as the old assessments-admin.js and
// suggestions-admin.js made them, write for write: every student's Calendar
// reads these collections, so their shapes mustn't change. db is a
// Firestore instance; deleteField is FieldValue.delete.
//   assessments/{id}: { type, date, courseName, createdAt }
//   dayTypes/{iso}: { type: "A" | "B" } (no doc: unset)
//   periodTimes/default: { times, testingBlock, academicSupport, advisory,
//     daySchedules: { [iso]: { slots, included } } }
//   meta/cacheVersions: { assessments, dayTypes, periodTimes } (ms stamps)
//   suggested/{hash}: { date, courseName, type, emails, lastAddedAt }

import { DEFAULT_ACADEMIC_SUPPORT_TIMES, DEFAULT_ADVISORY_TIMES, DEFAULT_SCHEDULE_TIMES, DEFAULT_TESTING_BLOCK_TIMES } from "./bellSchedule.js";

export function fetchAssessments(db) {
  return db
    .collection("assessments")
    .get()
    .then((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

export function fetchDayTypes(db) {
  return db
    .collection("dayTypes")
    .get()
    .then((snapshot) => {
      const dayTypes = {};
      snapshot.docs.forEach((doc) => {
        dayTypes[doc.id] = doc.data().type;
      });
      return dayTypes;
    });
}

// The bell schedule, or null parts where there's none yet.
export function fetchPeriodTimes(db) {
  return db
    .collection("periodTimes")
    .doc("default")
    .get()
    .then((doc) => {
      const data = doc.exists ? doc.data() : null;
      return {
        times: data && Array.isArray(data.times) ? data.times : null,
        testingBlock: (data && data.testingBlock) || null,
        academicSupport: (data && data.academicSupport) || null,
        advisory: (data && data.advisory) || null,
        daySchedules: (data && data.daySchedules) || {},
      };
    });
}

// Students' pages only refetch a collection when its stamp changes (see
// fetchUnlessCached in assessments-shared.js), which keeps the daily read quota
// in hand.
export function bumpCacheVersion(db, key) {
  return db
    .collection("meta")
    .doc("cacheVersions")
    .set({ [key]: Date.now() }, { merge: true })
    .catch((error) => console.error("Failed to update cache version:", error));
}

// Until the first stamp exists, students' pages can't trust their copies and
// fetch everything each time.
export function ensureCacheVersions(db) {
  const ref = db.collection("meta").doc("cacheVersions");
  return ref
    .get()
    .then((doc) => {
      if (doc.exists) return undefined;
      const now = Date.now();
      return ref.set({ assessments: now, dayTypes: now, periodTimes: now }, { merge: true });
    })
    .catch((error) => console.error("Failed to set up cache versions:", error));
}

// value "A" | "B", or null for unset (the doc is deleted).
export function saveDayType(db, iso, value) {
  const doc = db.collection("dayTypes").doc(iso);
  return (value ? doc.set({ type: value }) : doc.delete()).then(() => bumpCacheVersion(db, "dayTypes"));
}

// The first time a day is marked A or B with no schedule yet, so there's a
// sensible one without a trip through the Bell Schedule first.
export function seedDefaultSchedule(db) {
  return db
    .collection("periodTimes")
    .doc("default")
    .set({
      times: DEFAULT_SCHEDULE_TIMES,
      testingBlock: DEFAULT_TESTING_BLOCK_TIMES,
      academicSupport: DEFAULT_ACADEMIC_SUPPORT_TIMES,
      advisory: DEFAULT_ADVISORY_TIMES,
    })
    .then(() => bumpCacheVersion(db, "periodTimes"));
}

// Drops a date's own arrangement, back to its normal schedule.
export function clearDaySchedule(db, iso, deleteField) {
  return db
    .collection("periodTimes")
    .doc("default")
    .set({ daySchedules: { [iso]: deleteField() } }, { merge: true })
    .then(() => bumpCacheVersion(db, "periodTimes"));
}

// The times by slot (schedule), and the date's arrangement (custom, or null
// for its normal one, which is then deleted).
export function saveSchedule(db, iso, schedule, custom, deleteField) {
  return db
    .collection("periodTimes")
    .doc("default")
    .set({ ...schedule, daySchedules: { [iso]: custom || deleteField() } }, { merge: true })
    .then(() => {
      bumpCacheVersion(db, "periodTimes");
    });
}

// Resolves to the new id.
export function addAssessment(db, { type, date, courseName }) {
  return db
    .collection("assessments")
    .add({ type, date, courseName, createdAt: Date.now() })
    .then((ref) => {
      bumpCacheVersion(db, "assessments");
      return ref.id;
    });
}

export function deleteAssessment(db, id) {
  return db
    .collection("assessments")
    .doc(id)
    .delete()
    .then(() => bumpCacheVersion(db, "assessments"));
}

// Live, so a student withdrawing a suggestion updates the list without a
// reload. Students can only remove their own email, never the doc, so emptied
// docs are cleared out here. onChange gets the ones with emails. Returns the
// unsubscribe.
export function watchSuggestions(db, onChange) {
  return db.collection("suggested").onSnapshot(
    (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      docs
        .filter((entry) => (entry.emails || []).length === 0)
        .forEach((entry) => db.collection("suggested").doc(entry.id).delete().catch(() => {}));
      onChange(docs.filter((entry) => (entry.emails || []).length > 0));
    },
    (error) => console.error("Failed to load suggestions:", error)
  );
}

// Added before it's removed from "suggested", so a failure part way never
// loses it. type overrides the suggested type (In-Class or Testing Block for
// a Monday or Friday summative). onAdded(id) runs as soon as the assessment
// exists, before the suggestion is deleted, so the calendar shows it at once.
export function acceptSuggestion(db, suggestion, type, onAdded) {
  return db
    .collection("assessments")
    .add({ type, date: suggestion.date, courseName: suggestion.courseName, createdAt: Date.now() })
    .then((ref) => {
      bumpCacheVersion(db, "assessments");
      onAdded(ref.id);
      return db.collection("suggested").doc(suggestion.id).delete();
    });
}

export function declineSuggestion(db, suggestion) {
  return db.collection("suggested").doc(suggestion.id).delete();
}
