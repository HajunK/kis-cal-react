import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DomainRoute } from "../domain/DomainRoute.jsx";
import { Popups } from "../popups/Popups.jsx";
import { popupStore } from "../popups/popupStore.js";
import { sessionStore } from "../shell/data.js";
import { switchToInter } from "../shell/inter.js";
import { getPreferences, subscribePreferences } from "../shell/preferences.js";
import { sessionState } from "../shell/session.js";
import { DecryptionPrompt } from "./DecryptionPrompt.jsx";
import { popupPage } from "./popupPage.js";
import { TabBar } from "./TabBar.jsx";

// The tabs other than Domain (the one most visits open) are fetched when
// first needed, so Domain's page isn't held up by their code. The Calendar and
// GPA are fetched in the background once the page is up (prefetchTabs), and
// the admin tab when the account is an admin's.
const loadCalendar = () => import("./CalendarRoute.jsx");
const loadGpa = () => import("../gpa/GpaRoute.jsx");
const loadAssessments = () => import("./AssessmentsRoute.jsx");
const CalendarRoute = lazy(() => loadCalendar().then((m) => ({ default: m.CalendarRoute })));
const GpaRoute = lazy(() => loadGpa().then((m) => ({ default: m.GpaRoute })));
const AssessmentsRoute = lazy(() => loadAssessments().then((m) => ({ default: m.AssessmentsRoute })));

// Which tab a path is. Anything unknown is Domain, as Hosting used to serve
// the Domain page for any path (the old page names, /domain.html, are
// redirected before they get here; see firebase.json).
const ROUTES = ["domain", "calendar", "gpa", "assessments", "calendar-demo"];
const routeOf = (pathname) => {
  const name = pathname.replace(/^\/+|\/+$/g, "");
  return ROUTES.includes(name) ? name : "domain";
};
const STUDENT_TABS = new Set(["domain", "calendar", "gpa", "calendar-demo"]);

// The whole app: the tab bar, the open tab, and the popups over them.
// firebaseReady: Firebase has loaded (the admin tabs wait for it). demo: this
// visit is the Calendar demo, which has no account.
export function AppShell({ firebaseReady, demo }) {
  const location = useLocation();
  const route = routeOf(location.pathname);
  const session = useSyncExternalStore(sessionState.subscribe, sessionState.get);
  // Bumped whenever the data on screen is replaced (sign-in, sign-out, a
  // change made elsewhere): the student's tabs are drawn afresh from it, as
  // the old pages were reloaded.
  const version = useSyncExternalStore(sessionStore.subscribe, sessionStore.version);
  const hideAdminTabs = useSyncExternalStore(subscribePreferences, () => getPreferences().hideAdminTabs);
  const studentTab = STUDENT_TABS.has(route);
  // Inter is made sure of as soon as another tab is drawn, before anything in
  // it measures its text (see inter.js).
  const firstRoute = useRef(route).current;
  if (route !== firstRoute) switchToInter();

  // Domain's page styles hang off the body (its tooltips, say).
  useLayoutEffect(() => {
    document.body.classList.toggle("page-domain", route === "domain");
  }, [route]);

  // Once the page is up, the likely next tabs' code is fetched quietly (an
  // admin's Assessments tab too), so opening one finds it already here.
  const admin = !demo && session.isAdmin;
  useEffect(() => {
    const prefetch = () => {
      if (route !== "calendar" && route !== "calendar-demo") loadCalendar();
      if (route !== "gpa") loadGpa();
      if (admin && route !== "assessments") loadAssessments();
    };
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(prefetch, { timeout: 4000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 1500);
    return () => clearTimeout(timer);
  }, [route, admin]);

  const page = useMemo(() => popupPage(studentTab), [studentTab]);
  const ready = session.ready;

  return (
    <>
      <TabBar
        active={route === "calendar-demo" ? "calendar" : route}
        showAdminTabs={!demo && session.isAdmin && !hideAdminTabs}
        studentTab={studentTab}
        user={session.user}
        avatar={session.avatar}
        account={!demo}
        reloadLinks={demo}
      />
      {/* Nothing shows while a tab is still being fetched, as nothing did while
          the old page loaded. */}
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/domain" replace />} />
        <Route path="/calendar" element={<CalendarRoute key={version} ready={ready} />} />
        <Route path="/calendar-demo" element={<CalendarRoute key={version} ready={ready} />} />
        <Route path="/gpa" element={<GpaRoute key={version} ready={ready} />} />
        <Route path="/assessments" element={<AssessmentsRoute firebaseReady={firebaseReady} />} />
        <Route path="*" element={<DomainRoute key={version} ready={ready} />} />
      </Routes>
      </Suspense>
      <Popups store={popupStore} page={page} />
      <DecryptionPrompt />
    </>
  );
}
