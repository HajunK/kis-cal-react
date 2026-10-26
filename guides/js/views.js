// How many different people opened each guide (the `guideViews` collection), with
// no sign-in. A browser gets a random id the first time and keeps it; opening a
// guide for the first time from that browser adds one document, named
// `<guide key>__<that id>`, so the count of a guide's documents is how many
// browsers have read it. The id says nothing about who someone is. firestore.rules
// lets anyone add such a document but never change or read one; only an admin can
// list them, to total them. Nothing here touches any other collection.
import { firebaseWith } from "./firebase.js";
import { guideKeyFromPath } from "./rating.js";
import { maybeAdmin } from "./session.js";

export const VIEWS_COLLECTION = "guideViews";
const VISITOR_KEY = "guidesVisitor";
const COUNTED_KEY = "guidesCounted";

export const viewDocId = (guide, visitor) => `${guide}__${visitor}`;
export const viewData = (guide, now = Date.now()) => ({ guide, at: now });
export const isVisitorId = (value) => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);

function newVisitorId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// This browser's id, made on first use; null when it can't be kept (storage
// blocked), since a new one every visit would count the same person many times.
export function visitorId() {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (isVisitorId(saved)) return saved;
    const made = newVisitorId();
    localStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch {
    return null;
  }
}

function countedGuides() {
  try {
    const list = JSON.parse(localStorage.getItem(COUNTED_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Counts this browser as having read the guide, once. Not for an admin (who is
// only checking the guide), and never an error for the page: a failed write is
// dropped, and tried again on the next visit. A document that is already there
// (storage was cleared) is refused by the rules, which is as it should be.
export async function recordView(guide, { now = Date.now() } = {}) {
  if (!guide || maybeAdmin()) return false;
  const visitor = visitorId();
  if (!visitor) return false;
  const counted = countedGuides();
  if (counted.includes(guide)) return false;
  try {
    const firebase = await firebaseWith("firestore");
    await firebase.firestore().collection(VIEWS_COLLECTION).doc(viewDocId(guide, visitor)).set(viewData(guide, now));
  } catch (error) {
    if (!error || error.code !== "permission-denied") return false;
  }
  try {
    localStorage.setItem(COUNTED_KEY, JSON.stringify(counted.concat(guide)));
  } catch {
    // Storage is optional.
  }
  return true;
}

// For an admin: how many browsers have read each guide, most first.
// [{ guide, views }]. Reads every view document, so it is asked for rather than
// shown on its own.
export async function loadViewCounts() {
  const firebase = await firebaseWith("firestore");
  const snapshot = await firebase.firestore().collection(VIEWS_COLLECTION).get();
  const counts = new Map();
  snapshot.forEach((doc) => {
    const guide = doc.data().guide;
    if (typeof guide === "string") counts.set(guide, (counts.get(guide) || 0) + 1);
  });
  return Array.from(counts, ([guide, views]) => ({ guide, views })).sort((a, b) => b.views - a.views || (a.guide < b.guide ? -1 : 1));
}

// A page that is a guide counts its reader when it opens. Not on a computer's own
// address (a test copy), which would count the person making the guide.
const here = typeof window !== "undefined" && window.location ? window.location.hostname : "";
if (here && here !== "localhost" && here !== "127.0.0.1" && !here.endsWith(".localhost")) {
  const guide = guideKeyFromPath(window.location.pathname);
  if (guide) recordView(guide);
}
