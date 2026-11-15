// The suggestions any admin has accepted, kept for ACCEPTED_KEEP_MS so a mis-click
// can be checked and the list of what was just done is on the page. One list for all the
// admins, in Firestore (sharedLog.js). Not data the students' calendars read. Each is
//   { id, date, courseName, type, suggestedType, count, emails, lastAddedAt, acceptedAt,
//     assessmentId }
// where type is what it was accepted as (see acceptedType) and assessmentId is the
// school-wide assessment it became (absent in entries kept before Undo existed).

import { createSharedLog } from "./sharedLog.js";

export const ACCEPTED_KEEP_MS = 5 * 24 * 60 * 60 * 1000;
const log = createSharedLog({ log: "accepted", timeField: "acceptedAt", keepMs: ACCEPTED_KEEP_MS });

// Newest first, without any older than five days.
export const loadAcceptedSuggestions = (now = Date.now()) => log.load(now);

// Follows the shared list; onChange runs when it changes.
export const watchAcceptedSuggestions = (db, onChange) => log.watch(db, onChange);

// type: what it was accepted as. Accepting the same one again (it was suggested
// anew after being accepted) replaces the earlier entry.
export function recordAcceptedSuggestion(suggestion, type, now = Date.now(), assessmentId = null) {
  return log.record({
    id: suggestion.id,
    date: suggestion.date,
    courseName: suggestion.courseName,
    type,
    suggestedType: suggestion.type,
    count: (suggestion.emails || []).length,
    emails: suggestion.emails || [],
    lastAddedAt: suggestion.lastAddedAt || 0,
    acceptedAt: now,
    assessmentId,
  });
}

// Taken out of the list (Undo, or it's no longer wanted there).
export const removeAcceptedSuggestion = (id) => log.remove(id);
