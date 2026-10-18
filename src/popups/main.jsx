import { createRoot } from "react-dom/client";
import { legacyPage } from "../legacy/page.js";
import { Popups } from "./Popups.jsx";
import { createPopupStore } from "./store.js";
import { makePopupToast } from "./toast.js";

// The account menu's popups (Settings, Login Key, My Courses) and the
// grade-protection Learn More popup, for every page, in place of
// settings-modal.js, grade-protection.js and My Courses' half of
// my-courses.js. They open through the same global names those defined, so
// the account menu (auth.js), Domain's class names and the Calendar's first
// visit open them as before.
//
// Not in StrictMode: opening a popup does real things once (Login Key reads
// the key, which can bring up the key prompt; My Courses corrects stale
// divisions), which StrictMode's practice run would do twice.

const store = createPopupStore();

const page = {
  ...legacyPage,
  toast: makePopupToast(legacyPage.showToast),

  // My Courses' data: the periods' typed courses, their divisions, and the
  // courses hidden from Domain, as shared.js keeps them in appData.
  periods: () => legacyPage.appData().periods,
  savePeriods: (periods) => {
    legacyPage.appData().periods = periods;
    legacyPage.save();
  },
  // Older cached data may not have this field.
  divisions: () => legacyPage.appData().periodDivisions || [],
  saveDivisions: (periodDivisions) => {
    // Picking a later period's division first leaves holes that read as
    // undefined, which Firestore's .set() rejects. Array.from fills every
    // index (.map would skip holes).
    legacyPage.appData().periodDivisions = Array.from({ length: periodDivisions.length }, (_, i) => periodDivisions[i] || "");
    legacyPage.save();
  },
  hidden: () => legacyPage.appData().hiddenCourses || [],
  saveHidden: (names) => {
    legacyPage.appData().hiddenCourses = names;
    legacyPage.save();
  },
};

const container = document.createElement("div");
container.id = "popups-root";
document.body.appendChild(container);
createRoot(container).render(<Popups store={store} page={page} />);

window.openSettingsModal = () => store.open("settings");
window.closeSettingsModal = () => store.close("settings");
window.openLoginKeysModal = () => store.open("loginKey");
// focusPeriod opens it with that period's course selected.
window.openMyCoursesModal = (focusPeriod = null) => store.open("myCourses", { focusPeriod });
window.closeMyCoursesModal = () => store.close("myCourses");

// The "Only you can see your grades" footer, on Domain and GPA.
const learnMore = document.getElementById("grade-protection-learn-more-btn");
if (learnMore) learnMore.addEventListener("click", () => store.open("gradeProtection"));
