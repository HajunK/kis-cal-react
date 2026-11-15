// The suggestions and reports any admin has dismissed, kept for DISMISSED_KEEP_MS, as
// acceptedSuggestions.js keeps what was accepted: one list for all the admins, in
// Firestore (sharedLog.js). Each is
//   { id, kind, date, courseName, type, count, emails, lastAddedAt, dismissedAt }
// where kind is "suggestion" (declined) or "report" (a report that an assessment is
// wrong, dismissed).

import { createSharedLog } from "./sharedLog.js";

export const DISMISSED_KEEP_MS = 5 * 24 * 60 * 60 * 1000;
const log = createSharedLog({ log: "dismissed", timeField: "dismissedAt", keepMs: DISMISSED_KEEP_MS });

// Newest first, without any older than five days.
export const loadDismissedSuggestions = (now = Date.now()) => log.load(now);

// Follows the shared list; onChange runs when it changes.
export const watchDismissedSuggestions = (db, onChange) => log.watch(db, onChange);

// suggestion: a row of the suggestions list (a suggestion, or a report with kind
// "report"). Dismissing the same one again replaces the earlier entry.
export function recordDismissedSuggestion(suggestion, now = Date.now()) {
  return log.record({
    id: suggestion.id,
    kind: suggestion.kind === "report" ? "report" : "suggestion",
    date: suggestion.date,
    courseName: suggestion.courseName,
    type: suggestion.type,
    count: (suggestion.emails || []).length,
    emails: suggestion.emails || [],
    lastAddedAt: suggestion.lastAddedAt || 0,
    dismissedAt: now,
  });
}

// Taken out of the list (the dismissal didn't go through).
export const removeDismissedSuggestion = (id) => log.remove(id);
