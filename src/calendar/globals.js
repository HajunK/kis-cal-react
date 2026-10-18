import { courseColorNames, dropAcceptedSuggestions } from "./data.js";

// What other pages' plain scripts use from the Calendar's code, as the old
// my-courses.js defined it, on Domain, GPA and the Calendar:
// courseColorNames for the schedule popup's colors (class-countdown.js),
// dropAcceptedSuggestions once boot.js has confirmed data, and
// myCoursesRefreshCalendar (set once the Calendar is up), which My Courses
// and dropAcceptedSuggestions call to redraw it.
window.courseColorNames = courseColorNames;
window.dropAcceptedSuggestions = dropAcceptedSuggestions;
window.myCoursesRefreshCalendar = null;
