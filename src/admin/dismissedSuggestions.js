// The suggestions and reports this admin has dismissed, kept for DISMISSED_KEEP_MS, as
// acceptedSuggestions.js keeps what was accepted: on this browser only
// (localStorage), a reminder that changes nothing in Firestore. Each is
//   { id, kind, date, courseName, type, count, emails, lastAddedAt, dismissedAt }
// where kind is "suggestion" (declined) or "report" (a report that an assessment is
// wrong, dismissed).

export const DISMISSED_KEEP_MS = 5 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "dismissedSuggestions";

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.dismissedAt === "number") : [];
  } catch {
    return [];
  }
}

// Newest first, without any older than five days.
export function loadDismissedSuggestions(now = Date.now()) {
  return read()
    .filter((entry) => now - entry.dismissedAt < DISMISSED_KEEP_MS)
    .sort((a, b) => b.dismissedAt - a.dismissedAt);
}

// suggestion: a row of the suggestions list (a suggestion, or a report with kind
// "report"). Dismissing the same one again replaces the earlier entry.
export function recordDismissedSuggestion(suggestion, now = Date.now()) {
  const entry = {
    id: suggestion.id,
    kind: suggestion.kind === "report" ? "report" : "suggestion",
    date: suggestion.date,
    courseName: suggestion.courseName,
    type: suggestion.type,
    count: (suggestion.emails || []).length,
    emails: suggestion.emails || [],
    lastAddedAt: suggestion.lastAddedAt || 0,
    dismissedAt: now,
  };
  const kept = loadDismissedSuggestions(now).filter((other) => other.id !== entry.id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...kept]));
  } catch {
    // Storage is optional.
  }
  return entry;
}

// Taken out of the list (the dismissal didn't go through).
export function removeDismissedSuggestion(id, now = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadDismissedSuggestions(now).filter((entry) => entry.id !== id)));
  } catch {
    // Storage is optional.
  }
}
