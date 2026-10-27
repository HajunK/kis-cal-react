// The suggestions this admin has accepted, kept for ACCEPTED_KEEP_MS so a mis-click
// can be checked and the list of what was just done is on the page. Kept on this
// browser only (localStorage): it's a reminder, not data the students' calendars
// read, so nothing in Firestore changes. Each is
//   { id, date, courseName, type, suggestedType, count, emails, lastAddedAt, acceptedAt,
//     assessmentId }
// where type is what it was accepted as (see acceptedType) and assessmentId is the
// school-wide assessment it became (absent in entries kept before Undo existed).

export const ACCEPTED_KEEP_MS = 5 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "acceptedSuggestions";

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.acceptedAt === "number") : [];
  } catch {
    return [];
  }
}

// Newest first, without any older than five days.
export function loadAcceptedSuggestions(now = Date.now()) {
  return read()
    .filter((entry) => now - entry.acceptedAt < ACCEPTED_KEEP_MS)
    .sort((a, b) => b.acceptedAt - a.acceptedAt);
}

// type: what it was accepted as. Accepting the same one again (it was suggested
// anew after being accepted) replaces the earlier entry.
export function recordAcceptedSuggestion(suggestion, type, now = Date.now(), assessmentId = null) {
  const entry = {
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
  };
  const kept = loadAcceptedSuggestions(now).filter((other) => other.id !== entry.id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...kept]));
  } catch {
    // Storage is optional.
  }
  return entry;
}

// Taken out of the list (Undo, or it's no longer wanted there).
export function removeAcceptedSuggestion(id, now = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadAcceptedSuggestions(now).filter((entry) => entry.id !== id)));
  } catch {
    // Storage is optional.
  }
}
