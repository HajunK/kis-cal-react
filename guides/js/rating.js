// A reader's star rating of a guide, kept in Firestore (the `guideRatings`
// collection). Rating needs a Google sign-in, and each person has one rating per
// guide that they can change: the document is named `<guide key>__<their user id>`,
// so there is room for only one, and firestore.rules lets a signed-in user create
// and replace their own (and nobody else's). Only an admin can read everyone's to
// total them; you can read your own, to see what you gave. Nothing here touches
// any other collection.
import { firebaseWith } from "./firebase.js";
import { keyProblem, normalizeKey } from "./guides.js";

export const RATINGS_COLLECTION = "guideRatings";

export const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

// The guide a page is: the first part of its address, if that is a valid key.
export function guideKeyFromPath(pathname) {
  const first = String(pathname).replace(/^\/+/, "").split("/")[0];
  let key = first;
  try {
    key = decodeURIComponent(first);
  } catch {
    return null;
  }
  key = normalizeKey(key);
  return keyProblem(key) ? null : key;
}

export const ratingDocId = (guide, uid) => `${guide}__${uid}`;
export const ratingData = (guide, rating, now = Date.now()) => ({ guide, rating, updatedAt: now });

// Tells onChange(user) now and whenever the sign-in changes (user is null when
// signed out). Loads Firebase's Auth and Firestore only when called, so a page
// that nobody rates on never pays for them.
export async function watchSignIn(onChange) {
  const firebase = await firebaseWith("auth", "firestore");
  return firebase.auth().onAuthStateChanged((user) => onChange(user || null));
}

// Opens Google's sign-in window. Resolves to the user, or to null if it was closed.
export async function signInWithGoogle() {
  const firebase = await firebaseWith("auth");
  try {
    const result = await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
    return result.user;
  } catch (error) {
    if (error && (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request")) return null;
    throw error;
  }
}

// What this user rated the guide, or 0 if they haven't (or it can't be read).
export async function loadMyRating(guide, uid) {
  try {
    const firebase = await firebaseWith("firestore");
    const doc = await firebase.firestore().collection(RATINGS_COLLECTION).doc(ratingDocId(guide, uid)).get();
    const rating = doc.exists ? doc.data().rating : 0;
    return isRating(rating) ? rating : 0;
  } catch {
    return 0;
  }
}

// Sends the rating, replacing this user's earlier one for the guide if they have
// one. Rejects if it couldn't be saved.
export async function saveRating(guide, rating, uid, { now = Date.now() } = {}) {
  if (!guide) throw new Error("This page isn't a guide.");
  if (!uid) throw new Error("Sign in to rate a guide.");
  if (!isRating(rating)) throw new Error("A rating is a whole number from 1 to 5.");
  const firebase = await firebaseWith("firestore");
  await firebase.firestore().collection(RATINGS_COLLECTION).doc(ratingDocId(guide, uid)).set(ratingData(guide, rating, now));
}
