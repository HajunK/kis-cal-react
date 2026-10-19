// The Calendar demo (/calendar-demo): the real Calendar, filled with made-up
// data instead of an account's, from calendar-demo.js. Nothing is read from or
// saved to Firebase. Each visit picks 8 random courses for the 8 periods and
// scatters random formatives, summatives (in class or in the Testing Block)
// and reassessments around the coming weeks.

import { COURSE_CATALOG } from "../core/catalog.js";
import { fromISODate, toISODate } from "../core/dates.js";
import { emptyAppData } from "../core/sync.js";
import { disableFirebase } from "../shell/firebase.js";
import { useDemoSchoolData } from "../shell/school.js";
import { showWithoutFirebase } from "../shell/session.js";

export function startCalendarDemo() {
  disableFirebase();
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const isWeekday = (date) => date.getDay() !== 0 && date.getDay() !== 6;

  // Plain courses only: one with divisions or sections would need one picked.
  const courses = shuffle(
    COURSE_CATALOG.filter((course) => course.weight > 0 && !course.divisions && !course.sections).map((course) => course.name)
  ).slice(0, 8);

  // A and B days alternate on weekdays, from six weeks back to ten ahead.
  const today = new Date();
  const start = addDays(today, -42);
  const dayTypes = {};
  let next = "A";
  for (let day = start; day <= addDays(today, 70); day = addDays(day, 1)) {
    if (!isWeekday(day)) continue;
    dayTypes[toISODate(day)] = next;
    next = next === "A" ? "B" : "A";
  }

  // Periods 1-4 meet on A days, 5-8 on B days.
  const assessments = [];
  courses.forEach((name, periodIndex) => {
    const dayType = periodIndex < 4 ? "A" : "B";
    const meetingDays = Object.keys(dayTypes).filter((iso) => {
      const date = fromISODate(iso);
      return dayTypes[iso] === dayType && date >= addDays(today, -14) && date <= addDays(today, 35);
    });
    shuffle(meetingDays)
      .slice(0, 4 + Math.floor(Math.random() * 4))
      .forEach((iso, index) => {
        const weekday = fromISODate(iso).getDay();
        const roll = Math.random();
        let type = roll < 0.45 ? "Formative" : roll < 0.8 ? "In-Class" : "Reassessment";
        if (type === "In-Class" && (weekday === 1 || weekday === 5) && Math.random() < 0.5) type = "Testing Block";
        assessments.push({ id: `demo_${periodIndex}_${index}`, date: iso, courseName: name, type });
      });
  });

  useDemoSchoolData({
    assessments,
    dayTypes,
    periodTimes: {
      times: [
        { start: "08:50", end: "10:13" },
        { start: "10:18", end: "11:41" },
        { start: "11:41", end: "12:30" },
        { start: "12:30", end: "13:53" },
        { start: "13:58", end: "15:21" },
      ],
      testingBlock: { start: "08:00", end: "08:50" },
      advisory: { start: "08:20", end: "08:45" },
      academicSupport: { start: "15:25", end: "16:00" },
    },
  });

  // Its own throwaway account, so edits on the page (adding an assignment,
  // checking one off) work for the visit without touching a real one.
  const data = emptyAppData();
  data.periods = courses;
  showWithoutFirebase("demo", data);
}
