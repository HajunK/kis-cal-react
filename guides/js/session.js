// Who's signed in, for the admin controls. Only an admin's Google account gets
// them (config.js's list is cosmetic; the rules decide what can be written).
// Auth is loaded only for someone who has signed in here before, or presses the
// sign-in link.
import { isAdminEmail } from "./config.js";
import { firebaseWith } from "./firebase.js";

const HINT = "guidesAdmin";
const read = () => {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
};
const remember = (on) => {
  try {
    if (on) localStorage.setItem(HINT, "1");
    else localStorage.removeItem(HINT);
  } catch {
    // Storage is optional.
  }
};

export const maybeAdmin = () => read();

// Tells onChange({ admin, rejected }) now and whenever it changes. rejected: a
// signed-in account that isn't an admin's was just signed out again.
let watching = null;
export function watchAdmin(onChange) {
  if (!watching) {
    watching = firebaseWith("auth").then((firebase) =>
      firebase.auth().onAuthStateChanged((user) => {
        if (user && isAdminEmail(user.email)) {
          remember(true);
          onChange({ admin: true, rejected: false });
        } else if (user) {
          remember(false);
          firebase.auth().signOut();
          onChange({ admin: false, rejected: true });
        } else {
          remember(false);
          onChange({ admin: false, rejected: false });
        }
      })
    );
  }
  return watching;
}

export async function signIn() {
  const firebase = await firebaseWith("auth");
  await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
}

export async function signOut() {
  const firebase = await firebaseWith("auth");
  await firebase.auth().signOut();
}
