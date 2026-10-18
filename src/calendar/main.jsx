import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CalendarPage } from "./CalendarPage.jsx";
import "./globals.js";

// The Calendar tab, in React, in place of my-courses.js. boot.js starts it
// (initPage in shared.js calls initMyCoursesPage) once it has the user's
// data. Drawn at once rather than on React's next turn, as the old page built
// itself then, so it's on screen in the same frame.
//
// Not in StrictMode: starting the calendar does real things once (timers,
// listeners, saving away redundant copies), which StrictMode's practice run
// would do twice.
window.initMyCoursesPage = function initMyCoursesPage() {
  const container = document.getElementById("calendar-root");
  if (!container) return;
  flushSync(() => createRoot(container).render(<CalendarPage />));
};
