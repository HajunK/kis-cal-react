import { createRoot } from "react-dom/client";
import { firebaseAuth, firestore, whenFirebaseReady } from "../firebase/legacy.js";
import { makePopupToast } from "../popups/toast.js";
import { AssessmentsAdmin } from "./AssessmentsAdmin.jsx";

// The Assessments admin page's content, in React, in place of
// assessments-admin.js and suggestions-admin.js. Everything in it is hidden
// until sign-in confirms an admin, so it's simply drawn here rather than
// hydrated; its entrance plays when it's revealed, as before.
//
// Not in StrictMode: loading starts real work once (a cache-stamp check that
// can write, a live listener that clears emptied suggestions), which
// StrictMode's practice run would do twice.
whenFirebaseReady(() => {
  const page = {
    auth: firebaseAuth(),
    db: firestore(),
    deleteField: () => window.firebase.firestore.FieldValue.delete(),
    // This page doesn't load shared.js, so its toast is drawn here.
    toast: makePopupToast(() => false),
    alert: (message) => window.alert(message),
    formatDate: (date) => window.formatPreferredDate(date),
  };
  createRoot(document.getElementById("assessments-root")).render(<AssessmentsAdmin page={page} />);
});
