import { useLayoutEffect, useRef, useState } from "react";
import { openGradeProtection } from "../popups/popupStore.js";
import { onDomainRedraw } from "../shell/openTab.js";
import { loadScheduleData } from "../shell/school.js";
import { DomainPage } from "./DomainPage.jsx";

// An assessment stops being next when its class ends, a time of day rather
// than a page load, so it's re-checked periodically.
const NEXT_ASSESSMENT_CHECK_MS = 30000;

// The Domain tab: its cards, from the moment the student's data is ready (a
// spinner until then). ready comes from the app (see AppShell); the tab is
// drawn afresh whenever the data is replaced.
export function DomainRoute({ ready }) {
  const page = useRef({}).current;
  const [started, setStarted] = useState(false);

  // Drawn in the same frame the data arrives in, as the old page built its
  // cards then: just after this draw (the cards draw at once, which can't be
  // done during one), still before the frame is painted.
  useLayoutEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => page.refreshNextAssessmentLines(), NEXT_ASSESSMENT_CHECK_MS);
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      // Rather than waiting for the first periodic check.
      loadScheduleData(() => live && page.markCardInClassNow());
      // Cards present on arrival should just be there.
      page.renderDomainClasses(false);
      setStarted(true);
    });
    const onPreferencesChanged = () => page.onPreferencesChanged();
    window.addEventListener("app:preferences-changed", onPreferencesChanged);
    // My Courses' edits shown live.
    const unregister = onDomainRedraw((animate) => page.renderDomainClasses(animate));
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("app:preferences-changed", onPreferencesChanged);
      unregister();
    };
  }, [ready, page]);

  return (
    <>
      {/* Shown until the cards are: in practice only a perceptible wait
          right after signing in with nothing cached yet. */}
      <div className="domain-loading" id="domain-loading" hidden={started}>
        <span className="assessment-calendar-spinner" />
      </div>
      <DomainPage page={page} />
      <p className="page-footer">
        Only you can see your grades.{" "}
        <button type="button" className="page-footer-link" id="grade-protection-learn-more-btn" onClick={openGradeProtection}>
          Learn More
        </button>
      </p>
    </>
  );
}
