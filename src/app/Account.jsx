import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openLoginKeysModal, openMyCoursesModal, openSettingsModal } from "../popups/popupStore.js";
import { firebaseAuth, googleProvider } from "../shell/firebase.js";
import { AVATAR_IMAGE_KEY } from "../shell/session.js";

// The tab bar's right end, from auth.js: the account picture, which opens the
// account menu, or "Sign in with Google" signed out. signInWithPopup uses
// Google's own account chooser, so nobody types a password here.
//
// avatar is the picture's URL (from last time until sign-in answers), null
// signed out; user is undefined until then. withCourses: whether this tab has
// the student's courses to edit (My Courses).
export function Account({ user, avatar, withCourses }) {
  const [menu, setMenu] = useState(null); // { open, id } while drawn
  const buttonRef = useRef(null);
  const closeMenu = useCallback(() => setMenu((last) => last && { ...last, open: false }), []);
  const dropMenu = useCallback(() => setMenu((last) => (last && !last.open ? null : last)), []);

  // A different picture is a different button (it fades in afresh, and the
  // menu closes), as the old one was rebuilt; the same one is kept.
  useEffect(closeMenu, [avatar, closeMenu]);

  if (user === null) return <div className="auth-container"><SignInButton /></div>;
  if (!avatar) return <div className="auth-container" />;
  return (
    <div className="auth-container">
      <AvatarButton
        key={avatar}
        src={avatar}
        alt={user ? user.displayName || user.email || "" : undefined}
        open={Boolean(menu && menu.open)}
        buttonRef={buttonRef}
        // Not stopped, so other open menus see the click and close.
        onClick={() => setMenu((last) => (last && last.open ? { ...last, open: false } : { open: true, id: (last ? last.id : 0) + 1 }))}
      />
      {menu ? (
        <AccountMenu
          key={menu.id}
          open={menu.open}
          anchor={buttonRef}
          withCourses={withCourses}
          onClose={closeMenu}
          onGone={dropMenu}
        />
      ) : null}
    </div>
  );
}

// Stored as a data URL so the next visit draws it from the first frame
// instead of loading and fading it in.
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

// Google's image host allows this; if it ever stops, the picture just loads
// the usual way.
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
function AvatarButton({ src, alt, open, buttonRef, onClick }) {
  const [saved] = useState(() => savedAvatarImage(src));
  const [loaded, setLoaded] = useState(Boolean(saved));
  const imgRef = useRef(null);

  useLayoutEffect(() => {
    if (saved) return undefined;
    const img = imgRef.current;
    let frame = 0;
    const reveal = () => {
      frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setLoaded(true))));
      saveAvatarImage(src);
    };
    if (img.complete && img.naturalWidth) reveal();
    else img.addEventListener("load", reveal, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      img.removeEventListener("load", reveal);
    };
  }, [saved, src]);

  return (
    <button
      type="button"
      className={`auth-avatar-btn${open ? " auth-avatar-btn--open" : ""}`}
      aria-label="Account menu"
      ref={buttonRef}
      onClick={onClick}
    >
      <img
        className={`auth-avatar${loaded ? " auth-avatar--loaded" : ""}`}
        data-src={src}
        // Google's image host refuses some referrers (localhost included).
        referrerPolicy={saved ? undefined : "no-referrer"}
        src={saved || src}
        alt={alt}
        ref={imgRef}
      />
    </button>
  );
}

// Attached to <body> because .tab-bar clips vertical overflow, which would cut
// the menu off. Fades in, and out before it's gone (onGone).
function AccountMenu({ open, anchor, withCourses, onClose, onGone }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    const rect = anchor.current.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    void menu.offsetWidth;  // so the entrance transitions
    menu.classList.add("popup-menu--visible");
  }, [anchor]);

  useLayoutEffect(() => {
    if (open) return undefined;
    ref.current.classList.remove("popup-menu--visible");
    const timer = setTimeout(onGone, 150);
    return () => clearTimeout(timer);
  }, [open, onGone]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if ((anchor.current && anchor.current.contains(event.target)) || ref.current.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchor, onClose]);

  const item = (label, action) => (
    <button
      type="button"
      className="popup-menu-item"
      onClick={() => {
        onClose();
        action();
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="popup-menu" ref={ref}>
      {/* My Courses edits the student's courses, which only their tabs
          have. */}
      {withCourses ? item("My Courses", () => openMyCoursesModal()) : null}
      {item("Settings", openSettingsModal)}
      {item("Login Key", openLoginKeysModal)}
      <div className="popup-menu-divider" />
      {item("Sign out", () => firebaseAuth().signOut())}
    </div>,
    document.body
  );
}

// The official colored mark, the same in both themes.
function SignInButton() {
  return (
    <button
      type="button"
      className="auth-signin-btn"
      onClick={() =>
        firebaseAuth()
          .signInWithPopup(googleProvider())
          .catch((error) => console.error("Google sign-in failed:", error))
      }
    >
      <svg className="auth-signin-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
        <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z" />
        <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z" />
      </svg>
      <span>Sign in with Google</span>
    </button>
  );
}
