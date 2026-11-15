import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal } from "../ui/Modal.jsx";

// Each popup's code is fetched when first opened, and in the background once
// the page is quiet (loadPopups, called from AppShell), so none of it is in
// the code every page starts with.
const loaders = {
  gradeProtection: () => import("./GradeProtectionPopup.jsx").then((m) => ({ default: m.GradeProtectionPopup })),
  loginKey: () => import("./LoginKeyPopup.jsx").then((m) => ({ default: m.LoginKeyPopup })),
  myCourses: () => import("./MyCoursesPopup.jsx").then((m) => ({ default: m.MyCoursesPopup })),
  settings: () => import("./SettingsPopup.jsx").then((m) => ({ default: m.SettingsPopup })),
};
// Each load is made once, and the component kept here as soon as it arrives.
// Not React.lazy: it suspends the first time it renders even when the code is
// already here, which drew the box empty and filled it in a moment later. A
// popup asked for before its code is here waits to open until it is.
const requests = new Map();
const components = new Map();
const requestLoad = (kind) => {
  if (!requests.has(kind)) {
    requests.set(
      kind,
      loaders[kind]().then((module) => {
        components.set(kind, module.default);
      })
    );
  }
  return requests.get(kind);
};
export const loadPopups = () => Object.keys(loaders).forEach(requestLoad);

// The kind's component once its code has arrived; asking starts the load.
function useLoaded(kind, wanted) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!wanted || components.has(kind)) return undefined;
    let current = true;
    requestLoad(kind).then(() => current && rerender((n) => n + 1));
    return () => {
      current = false;
    };
  }, [kind, wanted]);
  return components.get(kind) || null;
}

// Each popup's box, with the CSS block it's drawn with: Settings, Login Key
// and My Courses share the settings-modal overlay, card and slide.
const KINDS = {
  settings: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card settings-modal-card", label: "Settings" },
  loginKey: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card login-keys-card settings-modal-card", label: "Login Key" },
  myCourses: { name: "settings-modal", dialog: "settings-modal-card", className: "settings-card my-courses-modal-card settings-modal-card", label: "My Courses" },
  gradeProtection: { name: "grade-protection", dialog: "grade-protection-dialog", className: "grade-protection-dialog", label: "How Your Grades Are Protected" },
};
const SLOT_OF = { settings: "settings", loginKey: "settings", myCourses: "myCourses", gradeProtection: "gradeProtection" };

// store: see store.js. page: the student's data and the app's helpers (src/app/popupPage.js).
export function Popups({ store, page }) {
  const popups = useSyncExternalStore(store.subscribe, store.get);
  return popups.map((popup) => <PopupBox key={popup.id} popup={popup} store={store} page={page} />);
}

function PopupBox({ popup: { kind, open, props }, store, page }) {
  const Component = useLoaded(kind, open);
  const box = KINDS[kind];
  const close = () => store.close(SLOT_OF[kind]);
  return (
    <Modal open={open && Boolean(Component)} onClose={close} {...box}>
      {Component && <Component page={{ ...page, close }} open={open} {...props} />}
    </Modal>
  );
}
