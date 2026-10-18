// Settings' two destructive actions, as the old settings-modal.js did them,
// write for write. deps: { user, db, googleProvider, storage, keys: {
// appData, prefs, encKey } (localStorage key for a uid), alert, reload,
// goTo(url) }.

// A plain (non-merge) set: merge would deep-merge nested maps and leave their
// old contents behind. The email stays, so the account still has it.
export function deleteAllData({ user, db, storage, keys, alert, reload }) {
  return db
    .collection("users")
    .doc(user.uid)
    .set({ email: user.email || "", lastModified: Date.now() })
    .then(() => {
      storage.removeItem(keys.appData(user.uid));
      storage.removeItem(keys.prefs(user.uid));
      alert("All your data has been deleted.");
      reload();
    })
    .catch((error) => {
      console.error("Failed to delete data:", error);
      alert("Something went wrong deleting your data. Please try again.");
    });
}

// Deleting the Auth account needs a recent sign-in, so on failure it re-prompts
// and retries just that step.
export function deleteAccount({ user, db, googleProvider, storage, keys, alert, goTo }) {
  const uid = user.uid;
  return db
    .collection("users")
    .doc(uid)
    .delete()
    .then(() => user.delete())
    .catch((error) => {
      if (error.code === "auth/requires-recent-login") {
        return user.reauthenticateWithPopup(googleProvider).then(() => user.delete());
      }
      throw error;
    })
    .then(() => {
      storage.removeItem(keys.appData(uid));
      storage.removeItem(keys.prefs(uid));
      storage.removeItem(keys.encKey(uid));
      goTo("/domain");
    })
    .catch((error) => {
      console.error("Failed to delete account:", error);
      alert("Something went wrong deleting your account. Please try again.");
    });
}
