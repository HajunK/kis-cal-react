// signInWithPopup uses Google's own account chooser, so nobody types a password
// here.
const TRANSPARENT_GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// Cosmetic only: firestore.rules enforces admin writes.
const ADMIN_EMAILS = ["hajunk105@gmail.com", "hjkim29@kis.ac"];

const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Cached so the admin tabs appear immediately instead of after auth resolves.
const ADMIN_TAB_CACHE_KEY = "isAdminGuess";

let adminTabsUserIsAdmin = false;

function setAdminTabDisplay(isAdmin) {
  adminTabsUserIsAdmin = isAdmin;
  const show = isAdmin && !window.getPreferences().hideAdminTabs;
  document.querySelectorAll(".tab--admin-only").forEach((tab) => {
    // "" would fall back to .tab--admin-only's display: none, so it needs an
    // explicit value.
    tab.style.display = show ? "inline" : "none";
  });
}

window.addEventListener("app:preferences-changed", () => setAdminTabDisplay(adminTabsUserIsAdmin));

try {
  setAdminTabDisplay(localStorage.getItem(ADMIN_TAB_CACHE_KEY) === "true");
} catch (error) {
  // Storage is optional.
}

// Shown right away on every page load while Firebase restores the session.
const AVATAR_CACHE_KEY = "avatarGuess";

// Stored as a data URL so the next page draws it from the first frame instead
// of loading and fading it in on every tab switch.
const AVATAR_IMAGE_KEY = "avatarImage";
// Anything larger isn't worth a share of localStorage.
const AVATAR_IMAGE_MAX_BYTES = 200 * 1024;

function savedAvatarImage(url) {
  try {
    const saved = JSON.parse(localStorage.getItem(AVATAR_IMAGE_KEY));
    return saved && saved.url === url ? saved.data : null;
  } catch {
    return null;
  }
}

// Google's image host allows this; if it ever stops, the picture just loads the
// usual way.
function saveAvatarImage(url) {
  if (!url || url.startsWith("data:") || savedAvatarImage(url)) return;
  fetch(url, { referrerPolicy: "no-referrer" })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => {
      if (!blob || blob.size > AVATAR_IMAGE_MAX_BYTES) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(AVATAR_IMAGE_KEY, JSON.stringify({ url, data: reader.result }));
        } catch {
          // Storage full or disabled: it loads the usual way.
        }
      };
      reader.readAsDataURL(blob);
    })
    .catch(() => {});
}

// data-src keeps the picture's real URL, since src may be the saved copy.
function buildAvatarButton(src) {
  const avatar = document.createElement("img");
  avatar.className = "auth-avatar";
  avatar.dataset.src = src;
  const saved = savedAvatarImage(src);
  if (saved) {
    avatar.src = saved;
    avatar.classList.add("auth-avatar--loaded");
  } else {
    // Google's image host refuses some referrers (localhost included). Set
    // before src so the first request already omits it.
    avatar.referrerPolicy = "no-referrer";
    avatar.src = src;
    const reveal = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => avatar.classList.add("auth-avatar--loaded")));
      saveAvatarImage(src);
    };
    if (avatar.complete && avatar.naturalWidth) reveal();
    else avatar.addEventListener("load", reveal, { once: true });
  }

  const avatarBtn = document.createElement("button");
  avatarBtn.type = "button";
  avatarBtn.className = "auth-avatar-btn";
  avatarBtn.setAttribute("aria-label", "Account menu");
  avatarBtn.appendChild(avatar);
  // Not stopped, so other open menus see the click and close.
  avatarBtn.addEventListener("click", () => {
    if (currentAuthMenu && currentAuthMenu.avatarBtn === avatarBtn) closeAuthMenu();
    else openAuthMenu(avatarBtn);
  });
  return avatarBtn;
}

try {
  const container = document.querySelector(".auth-container");
  const cachedAvatar = localStorage.getItem(AVATAR_CACHE_KEY);
  if (container && cachedAvatar) container.appendChild(buildAvatarButton(cachedAvatar));
} catch (error) {
  // Storage is optional.
}

function updateAdminTabVisibility(user) {
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  try {
    localStorage.setItem(ADMIN_TAB_CACHE_KEY, isAdmin ? "true" : "false");
  } catch (error) {
    // Storage is optional.
  }
  setAdminTabDisplay(isAdmin);
}

// Merged so the rest of the doc is untouched. The local cache is updated too,
// or a later non-merge save would put back a stale email.
function saveEmailToFirestore(user) {
  if (typeof firebase === "undefined" || !firebase.firestore) return;
  const timestamp = Date.now();

  try {
    const key = `cachedAppData_${user.uid}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      cached.email = user.email;
      cached.lastModified = timestamp;
      localStorage.setItem(key, JSON.stringify(cached));
    }
  } catch (error) {
    // Shouldn't block sign-in.
  }

  firebase
    .firestore()
    .collection("users")
    .doc(user.uid)
    .set({ email: user.email, lastModified: timestamp }, { merge: true })
    .catch((error) => console.error("Failed to save email:", error));
}

// Attached to <body> because .tab-bar clips vertical overflow, which would cut
// the menu off.
let currentAuthMenu = null;

function positionAuthMenu(avatarBtn, menu) {
  const rect = avatarBtn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
}

// Guarded with typeof since not every page loads the script behind each item.
function buildAuthMenuItem(label, onClick) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "popup-menu-item";
  item.textContent = label;
  item.addEventListener("click", () => {
    closeAuthMenu();
    onClick();
  });
  return item;
}

function openAuthMenu(avatarBtn) {
  closeAuthMenu();

  const menu = document.createElement("div");
  menu.className = "popup-menu";

  if (typeof openMyCoursesModal === "function") {
    menu.appendChild(buildAuthMenuItem("My Courses", openMyCoursesModal));
  }
  if (typeof openSettingsModal === "function") {
    menu.appendChild(buildAuthMenuItem("Settings", openSettingsModal));
  }
  if (typeof openLoginKeysModal === "function") {
    menu.appendChild(buildAuthMenuItem("Login Key", openLoginKeysModal));
  }
  if (menu.children.length > 0) {
    const divider = document.createElement("div");
    divider.className = "popup-menu-divider";
    menu.appendChild(divider);
  }
  menu.appendChild(buildAuthMenuItem("Sign out", () => auth.signOut()));

  document.body.appendChild(menu);
  positionAuthMenu(avatarBtn, menu);
  currentAuthMenu = { avatarBtn, menu };
  avatarBtn.classList.add("auth-avatar-btn--open");

  void menu.offsetWidth;  // so the entrance transitions
  menu.classList.add("popup-menu--visible");
}

function closeAuthMenu() {
  if (!currentAuthMenu) return;
  const { avatarBtn, menu } = currentAuthMenu;
  currentAuthMenu = null;
  avatarBtn.classList.remove("auth-avatar-btn--open");
  menu.classList.remove("popup-menu--visible");
  setTimeout(() => menu.remove(), 150);
}

document.addEventListener("click", (event) => {
  if (!currentAuthMenu) return;
  if (currentAuthMenu.avatarBtn.contains(event.target) || currentAuthMenu.menu.contains(event.target)) return;
  closeAuthMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && currentAuthMenu) closeAuthMenu();
});

// user.photoURL is copied once when the account is created and never updated;
// the Google provider's entry is refreshed on every sign-in.
function currentPhotoURL(user) {
  const google = (user.providerData || []).find((info) => info && info.providerId === "google.com");
  return (google && google.photoURL) || user.photoURL || "";
}

function renderAuthUI(user) {
  updateAdminTabVisibility(user);
  const avatarSrc = user ? currentPhotoURL(user) || TRANSPARENT_GIF : null;
  try {
    if (avatarSrc) localStorage.setItem(AVATAR_CACHE_KEY, avatarSrc);
    else {
      // So a shared computer doesn't keep it.
      localStorage.removeItem(AVATAR_CACHE_KEY);
      localStorage.removeItem(AVATAR_IMAGE_KEY);
    }
  } catch (error) {
    // Storage is optional.
  }

  const container = document.querySelector(".auth-container");
  if (!container) return;
  // Kept rather than rebuilt, so it doesn't fade in a second time.
  const shownAvatar = container.querySelector(".auth-avatar");
  if (user && shownAvatar && shownAvatar.dataset.src === avatarSrc) {
    saveEmailToFirestore(user);
    shownAvatar.alt = user.displayName || user.email || "";
    return;
  }
  container.innerHTML = "";
  closeAuthMenu();

  if (user) {
    saveEmailToFirestore(user);
    const avatarBtn = buildAvatarButton(avatarSrc);
    avatarBtn.querySelector(".auth-avatar").alt = user.displayName || user.email || "";
    container.appendChild(avatarBtn);
  } else {
    const signInBtn = document.createElement("button");
    signInBtn.type = "button";
    signInBtn.className = "auth-signin-btn";
    // The official colored mark, the same in both themes.
    signInBtn.innerHTML =
      '<svg class="auth-signin-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"/>' +
      '<path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"/>' +
      "</svg>" +
      "<span>Sign in with Google</span>";
    signInBtn.addEventListener("click", () => {
      auth.signInWithPopup(googleProvider).catch((error) => {
        console.error("Google sign-in failed:", error);
      });
    });

    container.appendChild(signInBtn);
  }
}

auth.onAuthStateChanged(renderAuthUI);
