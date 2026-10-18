/* global firebase, loadPeriods, loadPeriodDivisions, loadAddedAssessments, saveAddedAssessments, loadCompletedTasks, saveCompletedTasks,
   appData, currentUid, auth, allAssessments, allDayTypes, defaultPeriodTimes, assessmentsLoaded, assessmentsFetchDone,
   loadAssessments, isAssessmentVisibleForPeriod */

// The Calendar's logic (model.js) applied to this page's data: appData
// (shared.js) and the school's assessments, A/B days and bell schedule
// (assessments-shared.js), read by name as those scripts keep them. Same names
// and arguments as the old my-courses.js functions, which the Calendar's
// modules call.

import { todayISODate } from "../core/dates.js";
import {
  acceptedReplacements,
  addableCourseOptions as addableOptions,
  carriedCompletions,
  courseColorNames as colorNamesFor,
  courseColorVars,
  matchEntries,
  normalizeCompletedRecords,
  suggestedAssessmentDocId,
  upcomingClassDays as classDaysFor,
  upcomingDateLabel as dateLabelFor,
  upcomingDueAt as dueAtFor,
  upcomingSortTime as sortTimeFor,
} from "./model.js";

export function myAssessmentMatchEntries() {
  return matchEntries(loadPeriods(), loadPeriodDivisions());
}

export function courseColorNames() {
  return colorNamesFor(loadPeriods(), window.getPreferences().courseColors || {});
}

export function courseColorAssignments() {
  return courseColorVars(courseColorNames());
}

// Ids that no longer exist anywhere are dropped (and the list saved) so it
// doesn't grow forever. Checked against every assessment, not just current
// courses, so dropping a course for a while loses nothing.
export function completedTaskRecords() {
  const records = normalizeCompletedRecords(loadCompletedTasks());
  if (!assessmentsLoaded) return records;
  const known = new Set([...allAssessments, ...loadAddedAssessments()].map((entry) => entry.id));
  const kept = records.filter((record) => known.has(record.id));
  if (kept.length !== records.length) saveCompletedTasks(kept);
  return kept;
}

export function upcomingDueAt(entry, periodIndex) {
  return dueAtFor(entry, periodIndex, allDayTypes, defaultPeriodTimes);
}

export function upcomingSortTime(entry, periodIndex) {
  return sortTimeFor(entry, periodIndex, allDayTypes, defaultPeriodTimes);
}

export function upcomingDateLabel(iso) {
  return dateLabelFor(iso, todayISODate(), window.formatPreferredDate);
}

export function addableCourseOptions() {
  return addableOptions(loadPeriods(), loadPeriodDivisions());
}

export function upcomingClassDays(periodIndex, count) {
  return classDaysFor(periodIndex, count, allDayTypes);
}

// Assessments a student adds are tallied in "suggested" so admins see what
// several students report.
export function logSuggestedAssessment(date, courseName, type) {
  if (!currentUid || typeof firebase === "undefined" || !firebase.firestore) return;
  const email = (auth.currentUser && auth.currentUser.email) || "";
  if (!email) return;
  firebase
    .firestore()
    .collection("suggested")
    .doc(suggestedAssessmentDocId(date, courseName, type))
    .set(
      {
        date,
        courseName,
        type,
        emails: firebase.firestore.FieldValue.arrayUnion(email),
        lastAddedAt: Date.now(),
      },
      { merge: true }
    )
    .catch((error) => console.error("Failed to log suggested assessment:", error));
}

// arrayRemove writes without reading first, so it still works when the daily
// read quota has run out. Emptied docs are cleared by the admin page, since
// students can't delete them. A missing doc (accepted, declined) is ignored.
export function unlogSuggestedAssessment(date, courseName, type) {
  if (!currentUid || typeof firebase === "undefined" || !firebase.firestore) return;
  const email = (auth.currentUser && auth.currentUser.email) || "";
  if (!email) return;
  firebase
    .firestore()
    .collection("suggested")
    .doc(suggestedAssessmentDocId(date, courseName, type))
    .update({ emails: firebase.firestore.FieldValue.arrayRemove(email) })
    .catch((error) => {
      if (error && error.code === "not-found") return;
      console.error("Failed to remove suggested assessment:", error);
    });
}

// Admins can't touch students' data, so each student's app drops its own copy
// once an admin accepts it (see acceptedReplacements), passing on its done
// state. Only on confirmed data, never cache: saving pushes all of appData,
// and stale data would overwrite newer cloud data. boot.js calls it then.
export function dropAcceptedSuggestions() {
  loadAssessments(() => {
    if (!assessmentsFetchDone) return;
    const added = loadAddedAssessments();
    const periodIndexOf = new Map(myAssessmentMatchEntries().matchEntries.map((entry) => [entry.name, entry.periodIndex]));
    const replacedBy = acceptedReplacements(added, allAssessments, periodIndexOf, isAssessmentVisibleForPeriod);
    if (replacedBy.size === 0) return;

    const completed = loadCompletedTasks();
    const carried = carriedCompletions(completed, replacedBy);
    if (carried.length > 0) appData.completedTasks = [...completed, ...carried];
    saveAddedAssessments(added.filter((entry) => !replacedBy.has(entry.id)));
    if (window.myCoursesRefreshCalendar) window.myCoursesRefreshCalendar(true, true);
  });
}
