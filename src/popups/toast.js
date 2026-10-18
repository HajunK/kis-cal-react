// The popups' toast: the page's own (showToast in shared.js) where it has one;
// the admin pages don't load shared.js, so there it's drawn here instead, the
// same way.

const TOAST_VISIBLE_MS = 4000;
let toastEl = null;
let hideTimer = null;

export function makePopupToast(pageToast) {
  return (message) => {
    if (pageToast(message)) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "signin-toast";
      document.body.appendChild(toastEl);
      void toastEl.offsetWidth;  // so the entrance transitions
    }
    toastEl.textContent = message;
    toastEl.classList.add("signin-toast--visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toastEl.classList.remove("signin-toast--visible"), TOAST_VISIBLE_MS);
  };
}
