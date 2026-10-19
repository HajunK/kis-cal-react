import { useEffect, useState } from "react";
import { isAdminEmail } from "../core/admins.js";
import { ConfirmDialog } from "../ui/ConfirmDialog.jsx";
import { SegmentedControl } from "../ui/SegmentedControl.jsx";
import { ToggleSwitch } from "../ui/ToggleSwitch.jsx";
import { deleteAccount, deleteAllData } from "./accountActions.js";
import { alertsOn, alertsSupported, turnOffAlerts, turnOnAlerts } from "../shell/notifications.js";
import { formatPreferredDate, getPreferences, setPreference } from "../shell/preferences.js";

// getPreferences, kept current as they change here or arrive from
// another tab or device (src/shell/preferences.js announces both).
export function usePreferences() {
  const [prefs, setPrefs] = useState(() => getPreferences());
  useEffect(() => {
    const update = () => setPrefs(getPreferences());
    window.addEventListener("app:preferences-changed", update);
    return () => window.removeEventListener("app:preferences-changed", update);
  }, []);
  return prefs;
}

const APPEARANCE = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];
const DATE_FORMATS = ["monthDay", "numeric", "dayMonth", "numericEU"];
const PRIVACY_BLUR = [
  { value: "never", label: "Never" },
  { value: "school", label: "During School" },
  { value: "always", label: "Always" },
];
const TOGGLES = [
  { pref: "showBreakdown", label: "Display grade breakdown" },
  { pref: "showUpcomingAssessments", label: "Display upcoming assessments" },
  { pref: "replaceFormativesByDefault", label: "Replace formatives by default" },
];

// An admin's own switch for Mac notifications of new suggestions. Per browser
// rather than per account (a preference would follow the account to every
// device): it adds or removes this browser on the list the Cloud Function
// sends to (see src/shell/notifications.js).
function SuggestionAlertsRow({ page }) {
  const [on, setOn] = useState(() => alertsOn());
  const change = (checked) => {
    setOn(checked);
    if (!checked) {
      turnOffAlerts().catch((error) => console.error("Couldn't turn off suggestion alerts:", error));
      return;
    }
    turnOnAlerts(page.currentUser()).catch((error) => {
      setOn(false);
      if (error.message === "denied") page.toast("Allow notifications for this site in your browser's settings first.");
      else {
        console.error("Couldn't turn on suggestion alerts:", error);
        page.toast("Couldn't turn on alerts. Please try again.");
      }
    });
  };
  return (
    <div className="settings-row">
      <span className="settings-label">Notify me of new suggestions</span>
      <ToggleSwitch className="settings-toggle" data-pref="suggestionAlerts" checked={on} onChange={change} />
    </div>
  );
}

// The Settings card, inside its popup. page: see main.jsx.
export function SettingsPopup({ page }) {
  const prefs = usePreferences();
  // Only admins have tabs to hide.
  const [isAdmin] = useState(() => {
    const user = page.currentUser();
    return Boolean(user && isAdminEmail(user.email));
  });
  // Each option is labeled with today's date in that format.
  const [today] = useState(() => new Date());
  const [confirming, setConfirming] = useState(null); // "data" | "account" | null
  // A fresh account dialog each time (an empty email field), still fading out
  // when closed.
  const [accountDialogs, setAccountDialogs] = useState(0);

  const segmented = (pref, options) => (
    <SegmentedControl data-pref={pref} value={prefs[pref]} options={options} onChange={(value) => setPreference(pref, value)} />
  );
  const toggle = (pref, label) => (
    <div className="settings-row" key={pref}>
      <span className="settings-label">{label}</span>
      <ToggleSwitch
        className="settings-toggle"
        data-pref={pref}
        checked={prefs[pref] !== false}
        onChange={(checked) => setPreference(pref, checked)}
      />
    </div>
  );

  const deps = () => ({
    user: page.currentUser(),
    db: page.firestore(),
    googleProvider: page.googleProvider(),
    storage: localStorage,
    keys: { appData: page.appDataCacheKey, prefs: page.prefsCacheKey, encKey: page.encKeyStorageKey },
    alert: (message) => window.alert(message),
    reload: () => location.reload(),
    goTo: (url) => {
      window.location.href = url;
    },
  });
  const currentUserOrWarn = () => {
    const user = page.currentUser();
    if (!user) page.toast("Sign in to the account you want to delete.");
    return user;
  };
  const confirmed = () => {
    const kind = confirming;
    setConfirming(null);
    if (!currentUserOrWarn()) return;
    if (kind === "data") deleteAllData(deps());
    else deleteAccount(deps());
  };

  return (
    <>
      <button type="button" className="settings-modal-close-btn" aria-label="Close" onClick={page.close}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      <h2 className="settings-title">Settings</h2>

      <div className="settings-row">
        <span className="settings-label">Appearance</span>
        {segmented("appearance", APPEARANCE)}
      </div>

      <div className="settings-row">
        <span className="settings-label">Date format</span>
        {segmented(
          "dateFormat",
          DATE_FORMATS.map((format) => ({ value: format, label: formatPreferredDate(today, format) }))
        )}
      </div>

      <div className="settings-row">
        <span className="settings-label">Privacy Blur</span>
        {segmented("privacyBlurMode", PRIVACY_BLUR)}
      </div>

      <div className="settings-divider" />

      {TOGGLES.map(({ pref, label }) => toggle(pref, label))}

      {isAdmin && (
        <>
          <div className="settings-divider" />
          {toggle("hideAdminTabs", "Hide Admins Tabs")}
          {alertsSupported() && <SuggestionAlertsRow page={page} />}
        </>
      )}

      <div className="settings-divider" />

      <div className="settings-danger-row">
        <button type="button" className="settings-danger-btn" id="delete-all-data-btn" onClick={() => setConfirming("data")}>
          Delete all data
        </button>
        <button
          type="button"
          className="settings-danger-btn"
          id="delete-account-btn"
          onClick={() => {
            if (!currentUserOrWarn()) return;
            setAccountDialogs((count) => count + 1);
            setConfirming("account");
          }}
        >
          Delete account
        </button>
      </div>

      <ConfirmDialog
        open={confirming === "data"}
        title="Delete all data?"
        message="Delete all your grades, courses, and GPA data? This can't be undone. You'll stay signed in."
        confirmLabel="Delete all data"
        onConfirm={confirmed}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        key={accountDialogs}
        open={confirming === "account"}
        title="Delete account?"
        message="Permanently delete your account and all of its data? This can't be undone—you'll need to create a new account."
        confirmLabel="Delete account"
        requireEmail={((page.currentUser() && page.currentUser().email) || "").toLowerCase()}
        onConfirm={confirmed}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
