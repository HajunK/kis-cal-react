import { isAdminSite } from "../app/site.js";

// The app's Firebase: the compat SDK index.html loads from Google's CDN (the
// same version as before), set up here once it has loaded. Its scripts are
// deferred and this app's module can run before them, so everything that
// needs Firebase waits for whenFirebaseReady.

// These values are public identifiers, not secrets: access is enforced by
// Firebase Security Rules.
const firebaseConfig = {
  apiKey: "AIzaSyC2SPEQKcCtKhHazv9YOOYWOXXNB33EmdI",
  authDomain: "kisj-grade-calculator.firebaseapp.com",
  projectId: "kisj-grade-calculator",
  storageBucket: "kisj-grade-calculator.firebasestorage.app",
  messagingSenderId: "1096495035706",
  appId: "1:1096495035706:web:fb57a52a1d7625dc468c03",
  measurementId: "G-0KESGQV3P4",
};

// The Calendar demo turns it off: nothing there may read or write an account.
let disabled = false;
export function disableFirebase() {
  disabled = true;
}

// False without Firebase, or with it off: every read and write checks this.
export const hasFirebase = () => !disabled && typeof window.firebase !== "undefined" && Boolean(window.firebase.firestore);

let analytics = null;

function initialize() {
  if (!hasFirebase() || window.firebase.apps.length !== 0) return;
  window.firebase.initializeApp(firebaseConfig);
  // Google Analytics, on the students' site only: not the admin site (the admins' own use
  // isn't wanted in the numbers), and not the demo (Firebase is off there). It counts the
  // first page view itself; later tabs are logged by logPageView.
  try {
    if (!isAdminSite() && typeof window.firebase.analytics === "function") analytics = window.firebase.analytics();
  } catch (error) {
    console.warn("Analytics is unavailable:", error);
  }
}

// A page view for a tab the student moved to (the app is one page, so Analytics can't see
// the moves itself).
export function logPageView(path) {
  if (analytics) analytics.logEvent("page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
}

// Every deferred script (Firebase's among them) has run by DOMContentLoaded,
// and not before: this module runs while the document is already
// "interactive" but those scripts haven't yet, so readyState can't tell. The
// event is listened for as this module loads, ahead of it.
let contentLoaded = document.readyState === "complete";
const waiting = [];
if (!contentLoaded) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      contentLoaded = true;
      waiting.splice(0).forEach((run) => run());
    },
    { once: true }
  );
}

export function whenFirebaseReady(callback) {
  const run = () => {
    initialize();
    callback();
  };
  if (contentLoaded) run();
  else waiting.push(run);
}

// Refused outright with Firebase off, so nothing in the demo can reach an
// account even by mistake.
const live = () => {
  if (disabled) throw new Error("Firebase is off here (the Calendar demo)");
  return window.firebase;
};
export const firestore = () => live().firestore();
export const firebaseAuth = () => live().auth();
export const deleteField = () => window.firebase.firestore.FieldValue.delete();
export const arrayUnion = (...values) => window.firebase.firestore.FieldValue.arrayUnion(...values);
export const arrayRemove = (...values) => window.firebase.firestore.FieldValue.arrayRemove(...values);
export const googleProvider = () => new window.firebase.auth.GoogleAuthProvider();
