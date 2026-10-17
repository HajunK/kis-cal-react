// Dates are stored as local YYYY-MM-DD strings. Not toISOString, which is UTC
// and can land on the wrong day.

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISODate(now = new Date()) {
  return toISODate(now);
}
