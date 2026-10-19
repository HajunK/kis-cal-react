import { useSyncExternalStore } from "react";
import { Modal } from "../ui/Modal.jsx";
import { GradeProtectionPopup } from "./GradeProtectionPopup.jsx";
import { LoginKeyPopup } from "./LoginKeyPopup.jsx";
import { MyCoursesPopup } from "./MyCoursesPopup.jsx";
import { SettingsPopup } from "./SettingsPopup.jsx";

// Each popup's box, with the CSS block it's drawn with: Settings, Login Key
// and My Courses share the settings-modal overlay, card and slide.
const KINDS = {
  settings: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card settings-modal-card", label: "Settings", Content: SettingsPopup },
  loginKey: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card login-keys-card settings-modal-card", label: "Login Key", Content: LoginKeyPopup },
  myCourses: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card my-courses-modal-card settings-modal-card", label: "My Courses", Content: MyCoursesPopup },
  gradeProtection: { name: "grade-protection", dialog: "grade-protection-dialog", className: "grade-protection-dialog", label: "How Your Grades Are Protected", Content: GradeProtectionPopup },
};
const SLOT_OF = { settings: "settings", loginKey: "settings", myCourses: "myCourses", gradeProtection: "gradeProtection" };

// store: see store.js. page: the student's data and the app's helpers (src/app/popupPage.js).
export function Popups({ store, page }) {
  const popups = useSyncExternalStore(store.subscribe, store.get);
  return popups.map(({ id, kind, open, props }) => {
    const { Content, ...box } = KINDS[kind];
    const close = () => store.close(SLOT_OF[kind]);
    return (
      <Modal key={id} open={open} onClose={close} {...box}>
        <Content page={{ ...page, close }} open={open} {...props} />
      </Modal>
    );
  });
}
