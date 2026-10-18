// The page's Firebase app, from the compat scripts every page loads (see
// firebase-config.js), so React shares its sign-in with the tab bar and the
// plain scripts. Swapped for the modular SDK once the shell moves to React.

export function firestore() {
  return window.firebase.firestore();
}

export function firebaseAuth() {
  return window.firebase.auth();
}

// Bundled module scripts can run before the deferred Firebase scripts (Vite
// moves them into <head>), and every deferred script has run by
// DOMContentLoaded.
export function whenFirebaseReady(callback) {
  if (window.firebase && window.firebase.apps.length > 0) callback();
  else document.addEventListener("DOMContentLoaded", callback, { once: true });
}
