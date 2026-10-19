// Suggestion alerts for admins: a push to this Mac when a student suggests an
// assessment, even with no KIS Cal tab open. The Cloud Function
// (functions/index.js) sends it to every device listed in adminPushTokens; this
// is how a device gets on or off that list, and how it shows an alert while a
// tab is open (when Firebase Messaging leaves that to the page).
//
// Firebase Messaging's script is fetched only when it's needed here, so it
// costs nothing for anyone who never turns alerts on.
import { firestore, hasFirebase } from "./firebase.js";

const MESSAGING_SCRIPT = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js";
const WORKER = "/firebase-messaging-sw.js";
// This device's registration, kept so it can be taken off the list later. Per
// browser, as the registration is.
const TOKEN_KEY = "suggestionAlertToken";
const DEVICES = "adminPushTokens";

export function alertsSupported() {
  return typeof Notification !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;
}

// The browser's permission for this site was refused, which only its own
// settings can undo.
export const alertsBlocked = () => alertsSupported() && Notification.permission === "denied";

export function alertsOn() {
  try {
    return alertsSupported() && Notification.permission === "granted" && Boolean(localStorage.getItem(TOKEN_KEY));
  } catch {
    return false;
  }
}

let loading = null;
function loadMessaging() {
  if (typeof window.firebase?.messaging === "function") return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MESSAGING_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Firebase Messaging"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// This browser's registration with Firebase Messaging, made if it has none.
async function registrationToken() {
  await loadMessaging();
  const registration = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  return window.firebase.messaging().getToken({ serviceWorkerRegistration: registration });
}

const saveDevice = (token, user) =>
  firestore()
    .collection(DEVICES)
    .doc(token)
    .set({ uid: user.uid, email: user.email, origin: location.origin, createdAt: Date.now() });

const forgetDevice = (token) => firestore().collection(DEVICES).doc(token).delete();

// Asks the browser for permission (so call it from a click), then adds this
// device to the list. Rejects with "unsupported", "denied" or the error.
export async function turnOnAlerts(user) {
  if (!alertsSupported() || !hasFirebase() || !user) throw new Error("unsupported");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("denied");
  const token = await registrationToken();
  await saveDevice(token, user);
  localStorage.setItem(TOKEN_KEY, token);
}

export async function turnOffAlerts() {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (token && hasFirebase()) await forgetDevice(token).catch(() => {});
  try {
    await loadMessaging();
    await window.firebase.messaging().deleteToken();
  } catch {
    // Already gone, or never made.
  }
}

// Each visit of an admin whose device has alerts on: a registration the browser
// has renewed replaces the old one on the list, and an alert that arrives while
// a KIS Cal tab is open (which Firebase Messaging leaves to the page to show)
// is shown. Returns nothing; errors are only logged, as this is in the
// background.
export async function keepAlertsCurrent(user) {
  if (!alertsOn() || !hasFirebase() || !user) return;
  try {
    const token = await registrationToken();
    const saved = localStorage.getItem(TOKEN_KEY);
    if (token !== saved) {
      await saveDevice(token, user);
      localStorage.setItem(TOKEN_KEY, token);
      if (saved) await forgetDevice(saved).catch(() => {});
    }
    window.firebase.messaging().onMessage((payload) => {
      const { title = "New suggestion", body = "" } = payload.notification || {};
      const alert = new Notification(title, { body, icon: "/icons/logos/page-icon.png", tag: "kiscal-suggestion" });
      alert.onclick = () => {
        window.focus();
        if (location.pathname !== "/assessments") {
          history.pushState(null, "", "/assessments");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        alert.close();
      };
    });
  } catch (error) {
    console.error("Suggestion alerts:", error);
  }
}
