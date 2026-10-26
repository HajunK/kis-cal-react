import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { openGradeProtection } from "../popups/popupStore.js";
import { onDomainRedraw } from "../shell/openTab.js";
import { loadScheduleData } from "../shell/school.js";
import { DomainPage } from "./DomainPage.jsx";

// An assessment stops being next when its class ends, a time of day rather
// than a page load, so it's re-checked periodically.
const NEXT_ASSESSMENT_CHECK_MS = 30000;

// The Domain tab: its cards, from the moment the student's data is ready (a
// grayed outlines of them until then). ready comes from the app (see AppShell); the tab is
// drawn afresh whenever the data is replaced. redraw: this draw replaces one
// already open (the one showing the outlines, say), so the cards don't rise into
// view; they just appear.
export function DomainRoute({ ready, redraw = false }) {
  const page = useRef({}).current;
  const [started, setStarted] = useState(false);
  // The outlines were already up from the page's first paint (index.html): this
  // copy takes them over where they are, without arriving again.
  const [fromBoot] = useState(() => document.documentElement.dataset.bootSkeleton === "true");
  useLayoutEffect(() => {
    document.getElementById("boot-skeleton")?.remove();
    delete document.documentElement.dataset.bootSkeleton;
  }, []);

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
      // Taken down in the same frame the cards go up (not a later one, when they
      // showed below the outlines for a moment), so they take the outlines' place.
      flushSync(() => setStarted(true));
    });
    // Not for Privacy Blur: it's the page's CSS, and nothing drawn changes.
    const onPreferencesChanged = (event) => {
      if (event.detail && event.detail.key === "privacyBlurMode") return;
      page.onPreferencesChanged();
    };
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
      {/* Grayed outlines of the cards, in their place, until the real ones
          are: in practice only a perceptible wait right after signing in with
          nothing cached yet. */}
      <div className={`classes-container domain-skeleton${fromBoot ? " domain-skeleton--seamless" : ""}`} aria-hidden="true" hidden={started}>
        {[0, 1, 2, 3, 4].map((card) => (
          <div className="class-card domain-skeleton-card" key={card}>
            <div className="skeleton-line skeleton-line--title">
              <span className="skeleton-bar" />
            </div>
            <div className="skeleton-line skeleton-line--grade">
              <span className="skeleton-bar" />
            </div>
            <div className="skeleton-line skeleton-line--breakdown">
              <span className="skeleton-bar" />
            </div>
            <div className="skeleton-boxes">
              {["Formatives", "Summatives"].map((label) => (
                <div className="skeleton-box" key={label}>
                  <span className="assessment-label">{label}</span>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
                    <span className="skeleton-bar skeleton-bar--row" key={row} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <DomainPage page={page} redraw={redraw} />
      <p className="page-footer">
        Only you can see your grades.{" "}
        <button type="button" className="page-footer-link" id="grade-protection-learn-more-btn" onClick={openGradeProtection}>
          Learn More
        </button>
      </p>
    </>
  );
}
