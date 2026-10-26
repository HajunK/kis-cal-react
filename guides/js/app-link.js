// What every guide page has up in the top-left corner and at the bottom, besides
// the zoom control (zoom.js). Loaded through guide-ui.js.
//
// Top left: the back arrow with "KIS Cal" beside it, one pill-shaped button that
// goes to KIS Cal itself (kiscal.app), not to the guides home (the arrow is the one
// KIS Cal's popups use). Once you are
// signed in, five stars beside it to rate the guide (js/rating.js); you can change
// your rating later.
//
// Bottom: until you are signed in, a "Sign in to KIS Cal" pill (it opens Google's
// sign-in) that rises like a notification when you scroll nearly to the end, and
// goes back down when you scroll up. Signed in, there is no bottom pill at all.
import { guideKeyFromPath, loadMyRating, saveRating, signInWithGoogle, watchSignIn } from "./rating.js";

export const APP_URL = "https://kiscal.app";

const guideKey = guideKeyFromPath(window.location.pathname);
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6-4.9-4.6 6.7-.8z" /></svg>';
const GOOGLE_G =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

// --- Top left: the back arrow, and the stars beside it ---
const topLeft = document.createElement("div");
topLeft.className = "app-top-left";

const link = document.createElement("a");
link.className = "app-link";
link.href = APP_URL;
link.setAttribute("aria-label", "Back to KIS Cal");
link.title = "Back to KIS Cal";
link.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5L6.5 10l5.5 5.5" /></svg><span>KIS Cal</span>';
topLeft.appendChild(link);

const bar = document.createElement("div");
bar.className = "rating-bar";
bar.hidden = true;
bar.innerHTML = '<span class="rating-note" role="status"></span><div class="rating-stars" role="radiogroup" aria-label="Rate this study guide"></div>';
const starsBox = bar.querySelector(".rating-stars");
const note = bar.querySelector(".rating-note");
const stars = [1, 2, 3, 4, 5].map((value) => {
  const star = document.createElement("button");
  star.type = "button";
  star.className = "rating-star";
  star.setAttribute("role", "radio");
  star.setAttribute("aria-label", `${value} out of 5 stars`);
  star.innerHTML = STAR;
  starsBox.appendChild(star);
  return star;
});
topLeft.appendChild(bar);
document.body.appendChild(topLeft);

// Where the admin's Edit button goes: after whatever is up here.
const placeNeighbors = () => document.documentElement.style.setProperty("--top-left-end", `${topLeft.getBoundingClientRect().right + 8}px`);
placeNeighbors();
new ResizeObserver(placeNeighbors).observe(topLeft);

// --- Bottom: the sign in pill ---
const pill = document.createElement("div");
pill.className = "app-pill";
pill.setAttribute("aria-hidden", "true");
pill.inert = true;
pill.innerHTML = `<button type="button" class="app-pill-login">${GOOGLE_G}<span>Sign in to KIS Cal</span></button>`;
const loginButton = pill.querySelector(".app-pill-login");
document.body.appendChild(pill);

// --- State ---
let known = false; // whether who is signed in has been looked up
let user = null;
let rated = 0; // what they rated this guide, or 0 if they haven't
let previewed = 0; // the star hovered, which lights up to it
let sending = false;

const NEAR_BOTTOM = 240; // within this many pixels of the end counts as nearly there
const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - NEAR_BOTTOM;

const drawPill = () => {
  // The pill is for someone who isn't signed in, on a guide, and shows near the
  // end of the page. While it can, the footer keeps clear of the place it rises to.
  const canShow = known && !user && Boolean(guideKey);
  document.documentElement.classList.toggle("has-bottom-pill", canShow);
  const show = canShow && atBottom();
  pill.classList.toggle("app-pill--visible", show);
  pill.inert = !show;
  pill.setAttribute("aria-hidden", String(!show));
};

const drawStars = () => {
  // The bar fades in once who is signed in is known (and out if they sign out).
  if (user && bar.hidden) {
    bar.hidden = false;
    restNote(false); // the label is there as the bar fades in
    void bar.offsetWidth; // so it's laid out at opacity 0 before the fade starts
    bar.classList.add("rating-bar--in");
  } else if (!user && !bar.hidden) {
    bar.classList.remove("rating-bar--in");
    bar.hidden = true;
  }
  const lit = rated || previewed;
  stars.forEach((star, index) => {
    star.classList.toggle("rating-star--on", index < lit);
    star.setAttribute("aria-checked", String(index + 1 === rated));
    // Always open to a click, except while one is being saved.
    star.disabled = sending;
  });
  // A busy cursor over the stars while a rating is being saved.
  bar.classList.toggle("rating-bar--saving", sending);
  bar.title = rated ? `You rated this guide ${rated} out of 5. Click a star to change it.` : "";
};

const draw = () => {
  drawStars();
  drawPill();
};

// The label to the left of the stars: "Rate this guide" until the guide has been
// rated. Then the space it takes shrinks to nothing, and the words go out of view
// from the right edge as the pill closes in on them (changing a rating later
// doesn't bring it back). A rating that can't be saved shows nothing at all.
const REST_LABEL = "Rate this guide";
const setNote = (open, animate = true) => {
  if (!animate) note.style.transition = "none";
  if (open) {
    note.textContent = REST_LABEL;
    // Its own width once open, which the pill's size is animated to (see guides.css).
    note.style.maxWidth = `${note.scrollWidth}px`;
    note.classList.add("rating-note--open");
  } else {
    // The words stay as they are while the width closes over them.
    note.classList.remove("rating-note--open");
    note.style.maxWidth = "0px";
  }
  if (!animate) {
    void note.offsetWidth;
    note.style.transition = "";
  }
};
const restNote = (animate = true) => setNote(!rated, animate);

// Who is signed in is looked up once the page has loaded, so it never holds up
// the guide itself.
const startWatching = () => {
  if (!guideKey) return;
  watchSignIn(async (signedIn) => {
    user = signedIn;
    rated = signedIn ? await loadMyRating(guideKey, signedIn.uid) : 0;
    known = true;
    draw();
  }).catch((error) => {
    console.error("Couldn't check the sign-in:", error);
    known = true;
    draw();
  });
};
if (document.readyState === "complete") startWatching();
else window.addEventListener("load", startWatching, { once: true });

loginButton.addEventListener("click", async () => {
  loginButton.disabled = true;
  try {
    await signInWithGoogle();
  } catch (error) {
    console.error("Couldn't sign in:", error);
  } finally {
    loginButton.disabled = false;
  }
});

stars.forEach((star, index) => {
  const value = index + 1;
  star.addEventListener("mouseenter", () => {
    previewed = value;
    drawStars();
  });
  star.addEventListener("click", async () => {
    if (!guideKey || !user || sending || value === rated) return;
    const before = rated;
    sending = true;
    rated = value; // shown at once; put back below if it can't be saved
    drawStars();
    try {
      await saveRating(guideKey, value, user.uid);
    } catch (error) {
      // Nothing is shown: the stars just go back to what they were.
      console.error("Couldn't save the rating:", error);
      rated = before;
    } finally {
      sending = false;
      drawStars();
      restNote();
    }
  });
});
starsBox.addEventListener("mouseleave", () => {
  previewed = 0;
  drawStars();
});

window.addEventListener("scroll", drawPill, { passive: true });
window.addEventListener("resize", drawPill);
// The page grows and shrinks (pictures load, a level is switched).
new ResizeObserver(drawPill).observe(document.documentElement);
