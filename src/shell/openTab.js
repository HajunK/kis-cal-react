// The tab on screen, for what redraws it from outside: My Courses, whose
// edits show live underneath, and the Calendar's cleanup of accepted
// suggestions. The Calendar and Domain each register how they redraw while
// they're open (as the old pages' myCoursesRefreshCalendar and
// renderDomainClasses globals did).

let calendar = null;
let domain = null;

// Each returns its unregister.
export function onCalendarRedraw(fn) {
  calendar = fn;
  return () => {
    if (calendar === fn) calendar = null;
  };
}

export function onDomainRedraw(fn) {
  domain = fn;
  return () => {
    if (domain === fn) domain = null;
  };
}

// render(commit, animate), as calendar.js takes them.
export function redrawCalendar(commit, animate) {
  if (calendar) calendar(commit, animate);
}

export function redrawDomain(animate) {
  if (domain) domain(animate);
}
