import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { firebaseAuth, firestore, whenFirebaseReady } from "../firebase/legacy.js";
import { ToastProvider } from "../ui/Toast.jsx";
import { PostsAdmin } from "./PostsAdmin.jsx";

// The tab bar, account menu and its popups are still the plain scripts on
// posts.html; this only fills the page's content.
whenFirebaseReady(() => {
  createRoot(document.getElementById("posts-root")).render(
    <StrictMode>
      <ToastProvider>
        <PostsAdmin auth={firebaseAuth()} db={firestore()} />
      </ToastProvider>
    </StrictMode>
  );
});
