import { CalendarPage } from "../calendar/CalendarPage.jsx";

// The Calendar, from the moment the student's data is ready; drawn afresh
// whenever it's replaced. redraw: this draw replaces one already open, so it
// doesn't rise into view again (data-redraw, read by base.css and calendar.js).
export function CalendarRoute({ ready, redraw = false, adminNotice = false }) {
  // The admin site's, for someone who isn't an admin (or isn't signed in).
  if (adminNotice) return <p className="admin-not-authorized">Sign in with an admin account to see the calendar.</p>;
  return (
    <div className="page-content page-content--fill page-content--calendar" id="calendar-root" data-redraw={redraw ? "true" : undefined}>
      {ready ? <CalendarPage /> : null}
    </div>
  );
}
