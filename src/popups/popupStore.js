// The one store of the account menu's popups (see store.js), and the openers
// the tabs and the account menu call.

import { createPopupStore } from "./store.js";

export const popupStore = createPopupStore();

export const openSettingsModal = () => popupStore.open("settings");
export const closeSettingsModal = () => popupStore.close("settings");
export const openLoginKeysModal = () => popupStore.open("loginKey");
// focusPeriod opens it with that period's course selected.
export const openMyCoursesModal = (focusPeriod = null) => popupStore.open("myCourses", { focusPeriod });
export const closeMyCoursesModal = () => popupStore.close("myCourses");
export const openGradeProtection = () => popupStore.open("gradeProtection");
