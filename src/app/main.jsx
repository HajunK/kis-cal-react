// The stylesheets, in the order the page used to link them (Vite bundles
// them into one file, hashed and minified).
import "../css/tokens.css";
import "../css/base.css";
import "../css/nav.css";
import "../css/controls.css";
import "../css/floating.css";
import "../css/dialogs.css";
import "../css/settings.css";
import "../css/my-courses-popup.css";
import "../css/calendar.css";
import "../css/admin.css";
import "../css/domain.css";
import "../css/domain-scores.css";
import "../css/gpa.css";
import "../css/suggestions.css";
import "../css/grade-protection.css";
import "../css/theme.css";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { dropAcceptedSuggestions } from "../calendar/data.js";
// Applies the saved preferences as it loads, before anything draws.
import "../shell/preferences.js";
import { hasFirebase, whenFirebaseReady } from "../shell/firebase.js";
import { startSchoolData } from "../shell/school.js";
import { showCachedGuess, showWithoutSignIn, startSession } from "../shell/session.js";
import { AppShell } from "./AppShell.jsx";
import { startCalendarDemo } from "./demo.js";

// KIS Cal, one app: the tab bar, the tabs (routes) and the popups. Firebase's
// scripts load just after this, deferred; its parts start once they have.
//
// Not in StrictMode as a whole: starting things up (the session, the tabs'
// timers and saves) does real things once, which StrictMode's practice run
// would do twice. GPA, which was, still is.

const demo = location.pathname.replace(/\/+$/, "") === "/calendar-demo";

let firebaseReady = false;
const firebaseListeners = new Set();
const firebaseStore = {
  subscribe(listener) {
    firebaseListeners.add(listener);
    return () => firebaseListeners.delete(listener);
  },
  get: () => firebaseReady,
};

function App() {
  const ready = useSyncExternalStore(firebaseStore.subscribe, firebaseStore.get);
  return (
    <BrowserRouter>
      <AppShell firebaseReady={ready} demo={demo} />
    </BrowserRouter>
  );
}

// For driving the app from the browser in development, or a build made with
// VITE_DRIVER=1 (the old pages' globals, for the comparison scripts); never in
// a normal build.
if (import.meta.env.DEV || import.meta.env.VITE_DRIVER) {
  Promise.all([import("../shell/data.js"), import("../shell/preferences.js"), import("../shell/openTab.js")]).then(
    ([data, preferences, openTab]) => {
      window.__kis = {
        appData: () => data.appData,
        setPreference: preferences.setPreference,
        getPreferences: preferences.getPreferences,
        redrawDomain: openTab.redrawDomain,
        redrawCalendar: openTab.redrawCalendar,
      };
    }
  );
}

if (demo) startCalendarDemo();
// A returning student's tabs from this device's copy, before Firebase
// answers.
else showCachedGuess();

const root = document.getElementById("app");
flushSync(() => createRoot(root).render(<App />));

if (!demo) {
  whenFirebaseReady(() => {
    if (!hasFirebase()) {
      console.error("[boot] Firebase didn't load; showing this device's data only.");
      showWithoutSignIn();
      return;
    }
    startSchoolData();
    startSession({ onConfirmed: dropAcceptedSuggestions });
    firebaseReady = true;
    firebaseListeners.forEach((listener) => listener());
  });
}
