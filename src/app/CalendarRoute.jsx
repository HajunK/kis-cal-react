import { CalendarPage } from "../calendar/CalendarPage.jsx";

// The Calendar, from the moment the student's data is ready; drawn afresh
// whenever it's replaced.
export function CalendarRoute({ ready }) {
  return (
    <div className="page-content page-content--fill page-content--calendar" id="calendar-root">
      {ready ? <CalendarPage /> : null}
    </div>
  );
}
