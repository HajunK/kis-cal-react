import { StrictMode, useMemo } from "react";
import { openGradeProtection } from "../popups/popupStore.js";
import { appData, currentUid, getDeviceKey, pushDataToCloud } from "../shell/data.js";
import { firestore, hasFirebase } from "../shell/firebase.js";
import { ROLL_DURATION_MS, ROLL_STAGGER_MS, animateNumberChange } from "../shell/ui.js";
import { fetchLatestDomainSnapshot } from "./gpaData.js";
import { GpaPage } from "./GpaPage.jsx";

// The GPA tab. It fills in once the student's data is ready (ready, from the
// app); the tab is drawn afresh whenever the data is replaced.
export function GpaRoute({ ready }) {
  const page = useMemo(
    () => ({
      ready,
      data: () => ({ periods: appData.periods, gpaClasses: appData.gpaClasses, domainSnapshot: appData.domainSnapshot }),
      saveGpaClasses: (classes) => {
        appData.gpaClasses = classes;
        pushDataToCloud();
      },
      fetchDomainSnapshot: () =>
        fetchLatestDomainSnapshot({ uid: currentUid, db: hasFirebase() ? firestore() : null, appData, getDeviceKey }),
      animateNumber: animateNumberChange,
      roll: { rollMs: ROLL_DURATION_MS, staggerMs: ROLL_STAGGER_MS },
    }),
    [ready]
  );
  return (
    <>
      <div className="page-content" id="gpa-root">
        <StrictMode>
          <GpaPage page={page} />
        </StrictMode>
      </div>
      <p className="page-footer">
        Only you can see your grades.{" "}
        <button type="button" className="page-footer-link" id="grade-protection-learn-more-btn" onClick={openGradeProtection}>
          Learn More
        </button>
      </p>
    </>
  );
}
