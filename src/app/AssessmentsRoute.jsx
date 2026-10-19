import { useMemo } from "react";
import { AssessmentsAdmin } from "../admin/AssessmentsAdmin.jsx";
import { makePopupToast } from "../popups/toast.js";
import { deleteField, firebaseAuth, firestore } from "../shell/firebase.js";
import { formatPreferredDate } from "../shell/preferences.js";

// The admin tabs need Firebase, which loads just after the app starts.
//
// Assessments: not in StrictMode, as loading starts real work once (a
// cache-stamp check that can write, a live listener that clears emptied
// suggestions), which StrictMode's practice run would do twice.
export function AssessmentsRoute({ firebaseReady }) {
  const page = useMemo(
    () =>
      firebaseReady && {
        auth: firebaseAuth(),
        db: firestore(),
        deleteField,
        // The admin tabs never showed the student tabs' toast; this is its
        // own.
        toast: makePopupToast(() => false),
        alert: (message) => window.alert(message),
        formatDate: (date) => formatPreferredDate(date),
      },
    [firebaseReady]
  );
  return <div className="page-content" id="assessments-root">{page ? <AssessmentsAdmin page={page} /> : null}</div>;
}
