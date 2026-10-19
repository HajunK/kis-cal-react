// Suggestion alerts for admins: a notification on this Mac when a student
// suggests an assessment, while a KIS Cal tab is open (in any tab of the
// browser, in the background or not). It watches the same `suggested` list the
// Assessments tab shows, which anyone may read, so nothing about the project
// needs to change. Per browser: it's switched on in Settings, and the choice is
// kept on this device only.
import { firestore, hasFirebase } from "./firebase.js";

const FLAG = "suggestionAlerts";

export function alertsSupported() {
  return typeof Notification !== "undefined";
}

export function alertsOn() {
  try {
    return alertsSupported() && Notification.permission === "granted" && localStorage.getItem(FLAG) === "on";
  } catch {
    return false;
  }
}

function show(suggestion, id) {
  const when = /^\d{4}-\d{2}-\d{2}$/.test(suggestion.date || "")
    ? new Date(`${suggestion.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : suggestion.date || "";
  const alert = new Notification("New suggestion", {
    body: [suggestion.courseName, suggestion.type, when].filter(Boolean).join(" · "),
    icon: "/icons/logos/page-icon.png",
    tag: `suggestion-${id}`,
  });
  // Brings this tab forward, on the Assessments tab.
  alert.onclick = () => {
    window.focus();
    if (location.pathname !== "/assessments") {
      history.pushState(null, "", "/assessments");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    alert.close();
  };
}

let stopWatching = null;

// Watches for suggestions added from now on, if alerts are on here. What's
// already in the list when it starts is not announced, nor is anything the
// list gives from this device's own copy before the server has answered.
export function startSuggestionAlerts() {
  if (stopWatching || !alertsOn() || !hasFirebase()) return;
  let seen = null;
  stopWatching = firestore()
    .collection("suggested")
    .onSnapshot(
      (snapshot) => {
        if (snapshot.metadata?.fromCache) return;
        const ids = new Set(snapshot.docs.map((doc) => doc.id));
        if (seen === null) {
          seen = ids;
          return;
        }
        // A suggestion that's accepted or declined leaves the list, so the
        // same one suggested again later is announced again.
        seen = new Set([...seen].filter((id) => ids.has(id)));
        snapshot.docs.forEach((doc) => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          show(doc.data(), doc.id);
        });
      },
      (error) => console.error("Suggestion alerts:", error)
    );
}

export function stopSuggestionAlerts() {
  if (stopWatching) stopWatching();
  stopWatching = null;
}

// Asks the browser for permission (so call it from a click), then starts.
// Rejects with "unsupported" or "denied".
export async function turnOnAlerts() {
  if (!alertsSupported()) throw new Error("unsupported");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("denied");
  localStorage.setItem(FLAG, "on");
  startSuggestionAlerts();
}

export function turnOffAlerts() {
  localStorage.removeItem(FLAG);
  stopSuggestionAlerts();
}
