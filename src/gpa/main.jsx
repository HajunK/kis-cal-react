import { StrictMode, useSyncExternalStore } from "react";
import { hydrateRoot } from "react-dom/client";
import { legacyPage, removeBlankText } from "../legacy/page.js";
import { fetchLatestDomainSnapshot } from "./gpaData.js";
import { GpaPage } from "./GpaPage.jsx";

// The GPA tab's content, in React; the tab bar and popups around it are still
// the plain scripts. It hydrates gpa.html's own markup rather than replacing
// it, so the cards are on screen from the first paint and their entrance plays
// once, as before. boot.js calls initGpaPage (see initPage in shared.js) once
// it has the user's data.

const basePage = {
  data: () => {
    const appData = legacyPage.appData();
    return { periods: appData.periods, gpaClasses: appData.gpaClasses, domainSnapshot: appData.domainSnapshot };
  },
  saveGpaClasses: (classes) => {
    legacyPage.appData().gpaClasses = classes;
    legacyPage.save();
  },
  fetchDomainSnapshot: () =>
    fetchLatestDomainSnapshot({
      uid: legacyPage.uid(),
      db: legacyPage.firestore(),
      appData: legacyPage.appData(),
      getDeviceKey: legacyPage.getDeviceKey,
    }),
  animateNumber: legacyPage.animateNumberChange,
};
const waitingPage = { ...basePage, ready: false };
let readyPage = null;

// initGpaPage can come before hydration has finished (boot.js renders from the
// cache straight away), and rendering the root then would throw the markup
// away and rebuild it. Read through a store whose hydration value is "not
// ready" instead, React hydrates first and then shows the data.
const listeners = new Set();
const readiness = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  current: () => readyPage !== null,
  hydrating: () => false,
};

window.initGpaPage = function initGpaPage() {
  if (readyPage) return;
  // The roll timing is shared.js's, there by now.
  readyPage = { ...basePage, ready: true, roll: legacyPage.roll() };
  listeners.forEach((listener) => listener());
};

function GpaRoot() {
  const ready = useSyncExternalStore(readiness.subscribe, readiness.current, readiness.hydrating);
  return <GpaPage page={ready ? readyPage : waitingPage} />;
}

const container = document.getElementById("gpa-root");
removeBlankText(container);
hydrateRoot(
  container,
  <StrictMode>
    <GpaRoot />
  </StrictMode>,
  {
    onRecoverableError: (error) => console.error("[gpa] The page's markup didn't match and was rebuilt:", error),
  }
);
