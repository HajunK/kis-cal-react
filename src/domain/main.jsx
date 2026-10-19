/* global loadScheduleData */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DomainPage } from "./DomainPage.jsx";

// The Domain tab, in React, in place of domain.js. The page's row, scrollbar,
// arrows and posts are drawn at once (all empty or hidden, as domain.html had
// them); boot.js then starts the cards (initPage in shared.js calls
// initDomainPage) once it has the user's data, in the same frame, as the old
// page built them then.
//
// Not in StrictMode: making a card does real things once (saving, timers,
// listeners), which StrictMode's practice run would do twice.

// Filled in by DomainPage as it draws.
const page = {};

const container = document.getElementById("domain-root");
if (container) {
  flushSync(() => createRoot(container).render(<DomainPage page={page} />));

  // An assessment stops being next when its class ends, a time of day rather
  // than a page load, so it's re-checked periodically.
  const NEXT_ASSESSMENT_CHECK_MS = 30000;

  window.initDomainPage = function initDomainPage() {
    setInterval(() => page.refreshNextAssessmentLines(), NEXT_ASSESSMENT_CHECK_MS);
    // Rather than waiting for the first periodic check.
    if (typeof loadScheduleData === "function") loadScheduleData(() => page.markCardInClassNow());
    // Cards present on page load should just be there.
    page.renderDomainClasses(false);
    // Shown until now: in practice only a perceptible wait right after
    // signing in with nothing cached yet.
    const loading = document.getElementById("domain-loading");
    if (loading) loading.hidden = true;
  };

  // My Courses' edits shown live (see refreshDomain in src/legacy/page.js).
  window.renderDomainClasses = (animate) => page.renderDomainClasses(animate);

  window.addEventListener("app:preferences-changed", () => page.onPreferencesChanged());

  // Posts are fetched once rather than cached and confirmed like
  // assessments; they change rarely enough that a brief delay is fine. Once
  // the page's scripts (Firebase among them) have run: this module runs
  // before them.
  const fetchDomainPosts = () => {
    if (typeof firebase === "undefined" || !window.firebase.firestore) return;
    window.firebase
      .firestore()
      .collection("posts")
      .get()
      .then((snapshot) => page.setPosts(snapshot.docs.map((doc) => doc.data())))
      .catch((error) => console.error("Failed to load posts:", error));
  };
  document.addEventListener("DOMContentLoaded", fetchDomainPosts);
}
