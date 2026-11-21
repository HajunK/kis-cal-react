import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DomainRoute } from "../domain/DomainRoute.jsx";
import { Popups, loadPopups } from "../popups/Popups.jsx";
import { popupStore } from "../popups/popupStore.js";
import { sessionStore } from "../shell/data.js";
import { hasFirebase, logPageView } from "../shell/firebase.js";
import { startSuggestionAlerts, stopSuggestionAlerts } from "../shell/notifications.js";
import { switchToInter } from "../shell/inter.js";
import { sessionState } from "../shell/session.js";
import { DecryptionPrompt } from "./DecryptionPrompt.jsx";
import { isAdminSite } from "./site.js";
import { MenuSkeletonRoute } from "../menu/MenuSkeleton.jsx";
import { popupPage, loadQrScript } from "./popupPage.js";
import { TabBar } from "./TabBar.jsx";

// The tabs other than Domain (the one most visits open) are fetched when
// first needed, so Domain's page isn't held up by their code. The Calendar and
// GPA are fetched in the background once the page is up (prefetchTabs). The
// Assessments page is the admin site's (site.js), and loads when that site opens.
const loadCalendar = () => import("./CalendarRoute.jsx");
const loadGpa = () => import("../gpa/GpaRoute.jsx");
const loadAssessments = () => import("./AssessmentsRoute.jsx");
const CalendarRoute = lazy(() => loadCalendar().then((m) => ({ default: m.CalendarRoute })));
const GpaRoute = lazy(() => loadGpa().then((m) => ({ default: m.GpaRoute })));
const loadMenu = () => import("./MenuRoute.jsx");
const MenuRoute = lazy(() => loadMenu().then((m) => ({ default: m.MenuRoute })));
const loadCafeteria = () => import("./CafeteriaRoute.jsx");
const CafeteriaRoute = lazy(() => loadCafeteria().then((m) => ({ default: m.CafeteriaRoute })));
const AssessmentsRoute = lazy(() => loadAssessments().then((m) => ({ default: m.AssessmentsRoute })));

// Which tab a path is. Anything unknown is Domain, as Hosting used to serve
// the Domain page for any path (the old page names, /domain.html, are
// redirected before they get here; see firebase.json).
//
// The admin site (admin.kiscal.app, see site.js) has the Assessments and Cafeteria pages and
// nothing else: /cafeteria is the second, every other path there the first, and the student
// site has no path for either.
const ROUTES = ["domain", "calendar", "gpa", "menu", "calendar-demo"];
const routeOf = (pathname, adminSite) => {
  const name = pathname.replace(/^\/+|\/+$/g, "");
  if (adminSite) return name === "cafeteria" || name === "calendar" ? name : "assessments";
  return ROUTES.includes(name) ? name : "domain";
};
// The admin site's Calendar is the student's, drawn from every course (session.js's
// viewAllCourses) with the school's real assessments, and without adding.
const STUDENT_TABS = new Set(["domain", "calendar", "gpa", "menu", "calendar-demo"]);

// The whole app: the tab bar, the open tab, and the popups over them.
// firebaseReady: Firebase has loaded (the Assessments page waits for it). demo: this
// visit is the Calendar demo, which has no account.
export function AppShell({ firebaseReady, demo }) {
  const location = useLocation();
  const adminSite = useMemo(() => isAdminSite(), []);
  const route = routeOf(location.pathname, adminSite);
  const session = useSyncExternalStore(sessionState.subscribe, sessionState.get);
  // Bumped whenever the data on screen is replaced (sign-in, sign-out, a
  // change made elsewhere): the student's tabs are drawn afresh from it, as
  // the old pages were reloaded.
  const version = useSyncExternalStore(sessionStore.subscribe, sessionStore.version);
  // Whether this draw of the tab replaces one that was already open (the data
  // was replaced under it), as opposed to arriving at the tab: the rise that
  // plays on arriving is skipped for it (see page-enter in base.css, and rise in
  // calendar.js). Kept for as long as that draw lasts.
  const lastDraw = useRef({ route, version, redraw: false });
  if (lastDraw.current.route !== route) lastDraw.current = { route, version, redraw: false };
  else if (lastDraw.current.version !== version) lastDraw.current = { route, version, redraw: true };
  const redraw = lastDraw.current.redraw;
  const studentTab = STUDENT_TABS.has(route) && !adminSite;
  // Inter is made sure of as soon as another tab is drawn, before anything in
  // it measures its text (see inter.js).
  const firstRoute = useRef(route).current;
  if (route !== firstRoute) switchToInter();

  // Each tab moved to is a page view in Analytics (the first, on load, is counted by itself).
  const loggedPath = useRef(location.pathname);
  useEffect(() => {
    if (loggedPath.current === location.pathname) return;
    loggedPath.current = location.pathname;
    logPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (adminSite) document.title = "KIS Cal Admin";
  }, [adminSite]);

  // Domain's page styles hang off the body (its tooltips, say).
  useLayoutEffect(() => {
    document.body.classList.toggle("page-domain", route === "domain");
  }, [route]);

  // Once the page has loaded and gone quiet, the likely next tabs' code (and the popups', and the
  // QR script the Login Key popup draws with) is fetched quietly, so opening one finds it already
  // here. Held back until after the window's load event plus a few idle seconds, so none of it
  // competes with the first paint or counts as part of the page's load. The admin site has no other
  // tab.
  const admin = !demo && session.isAdmin;
  useEffect(() => {
    if (adminSite) return undefined;
    let cancelled = false;
    let timer;
    let idle;
    const prefetch = () => {
      if (cancelled) return;
      if (route !== "calendar" && route !== "calendar-demo") loadCalendar();
      if (route !== "gpa") loadGpa();
      if (route !== "menu") loadMenu();
      loadQrScript();
    };
    // The popups are small and opened often: fetched as soon as the page has
    // loaded, not with the rest.
    const early = () => loadPopups();
    const schedule = () => {
      early();
      timer = setTimeout(() => {
        if (typeof requestIdleCallback === "function") idle = requestIdleCallback(prefetch, { timeout: 4000 });
        else prefetch();
      }, 2500);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      clearTimeout(timer);
      if (idle !== undefined && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
    };
  }, [route, adminSite]);

  // An admin's browser that has suggestion alerts on watches for new
  // suggestions while the app is open.
  useEffect(() => {
    if (!admin || !hasFirebase()) return undefined;
    startSuggestionAlerts();
    return stopSuggestionAlerts;
  }, [admin]);

  const page = useMemo(() => popupPage(studentTab), [studentTab]);
  const ready = session.ready;

  return (
    <>
      <TabBar
        active={route === "calendar-demo" ? "calendar" : route}
        adminSite={adminSite}
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
        <Route path="/" element={<Navigate to={adminSite ? "/assessments" : "/domain"} replace />} />
        <Route
          path="/calendar"
          element={<CalendarRoute key={version} ready={ready && (!adminSite || session.isAdmin)} redraw={redraw} adminNotice={adminSite && session.user !== undefined && !session.isAdmin} />}
        />
        <Route path="/calendar-demo" element={<CalendarRoute key={version} ready={ready} redraw={redraw} />} />
        <Route path="/gpa" element={<GpaRoute key={version} ready={ready} />} />
        {adminSite && <Route path="/cafeteria" element={<CafeteriaRoute firebaseReady={firebaseReady} />} />}
        <Route
          path="/menu"
          element={
            <Suspense fallback={<MenuSkeletonRoute signedIn={Boolean(session.user)} />}>
              <MenuRoute firebaseReady={firebaseReady} />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={adminSite ? <AssessmentsRoute firebaseReady={firebaseReady} /> : <DomainRoute key={version} ready={ready} redraw={redraw} />}
        />
      </Routes>
      </Suspense>
      <Popups store={popupStore} page={page} />
      <DecryptionPrompt />
    </>
  );
}
