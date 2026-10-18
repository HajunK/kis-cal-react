// The GPA rows' grade badge and its motion, carried over from gpa.js
// unchanged, so the coin flip, the scroll slide and the instructions folding
// away look exactly as they did. They work on the badge button's children and
// the row's flipping class directly; React renders that button empty and
// leaves its contents to these.

import { gradeIconPath } from "../core/grades.js";

export const GPA_BADGE_TRANSITION_MS = 180;
export const GPA_BADGE_FLIP_HALF_MS = 130;

function createBadgeContent(slug, label) {
  if (!slug) {
    const span = document.createElement("span");
    span.className = "grade-badge--empty";
    return span;
  }
  const img = document.createElement("img");
  img.className = "letter-grade";
  img.src = gradeIconPath(slug);
  img.dataset.slug = slug;
  img.alt = label || "";
  return img;
}

export function setBadge(btn, slug, label) {
  btn.innerHTML = "";
  btn.appendChild(createBadgeContent(slug, label));
}

// The grade swaps while the badge is edge-on and invisible, like a coin flip.
export function flipBadge(row, btn, slug, label) {
  if (!btn.animate) {
    setBadge(btn, slug, label);
    return;
  }
  if (btn._gpaFlip) btn._gpaFlip.cancel();
  row.classList.add("gpa-class-row--flipping");

  const turnAway = btn.animate(
    [{ transform: "perspective(240px) rotateY(0deg)" }, { transform: "perspective(240px) rotateY(90deg)" }],
    { duration: GPA_BADGE_FLIP_HALF_MS, easing: "ease-in" }
  );
  btn._gpaFlip = turnAway;
  turnAway.onfinish = () => {
    setBadge(btn, slug, label);
    btn._gpaFlip = btn.animate(
      [{ transform: "perspective(240px) rotateY(-90deg)" }, { transform: "perspective(240px) rotateY(0deg)" }],
      { duration: GPA_BADGE_FLIP_HALF_MS, easing: "ease-out" }
    );
    btn._gpaFlip.onfinish = () => row.classList.remove("gpa-class-row--flipping");
  };
}

// A scroll step: the old grade slides out as the new one slides in, up or
// down with the scroll.
export function slideBadge(btn, slug, label, direction) {
  // Fast scrolling can call this before the last transition's cleanup; the
  // incoming icon becomes the new starting point.
  if (btn._gpaBadgeCleanup) {
    clearTimeout(btn._gpaBadgeCleanup);
    btn._gpaBadgeCleanup = null;
  }
  while (btn.children.length > 1) btn.firstElementChild.remove();

  const oldContent = btn.firstElementChild;
  const newContent = createBadgeContent(slug, label);

  const exitY = direction > 0 ? "-10px" : "10px";
  const enterY = direction > 0 ? "10px" : "-10px";

  newContent.style.position = "absolute";
  newContent.style.inset = "0";
  newContent.style.opacity = "0";
  newContent.style.transform = `translateY(${enterY})`;
  newContent.style.transition = "none";
  btn.appendChild(newContent);

  // Without inset: 0 it drifts diagonally instead of straight up or down.
  if (oldContent) {
    oldContent.style.position = "absolute";
    oldContent.style.inset = "0";
  }

  void btn.offsetWidth;  // so the "none" transition applies first

  const easing = `transform ${GPA_BADGE_TRANSITION_MS}ms ease, opacity ${GPA_BADGE_TRANSITION_MS}ms ease`;
  newContent.style.transition = easing;
  newContent.style.opacity = "1";
  newContent.style.transform = "translateY(0)";

  if (oldContent) {
    oldContent.style.transition = easing;
    oldContent.style.opacity = "0";
    oldContent.style.transform = `translateY(${exitY})`;
  }

  btn._gpaBadgeCleanup = setTimeout(() => {
    if (oldContent) oldContent.remove();
    newContent.style.position = "";
    newContent.style.inset = "";
    newContent.style.transition = "";
    newContent.style.transform = "";
    newContent.style.opacity = "";
    btn._gpaBadgeCleanup = null;
  }, GPA_BADGE_TRANSITION_MS + 30);
}

// Stops whatever motion the badge is in, for when it's about to be set again
// from scratch (Paste from Domain Tab rebuilt the rows, which did this).
export function settleBadge(row, btn) {
  if (btn._gpaFlip) btn._gpaFlip.cancel();
  btn._gpaFlip = null;
  clearTimeout(btn._gpaBadgeCleanup);
  btn._gpaBadgeCleanup = null;
  row.classList.remove("gpa-class-row--flipping");
}

// The "Click or scroll on the circle" line folds away after the first pick.
export function hideDescription(el) {
  const startHeight = el.getBoundingClientRect().height;
  el.style.height = `${startHeight}px`;
  void el.offsetHeight;  // so the height applies before transitioning
  el.style.transition = "height 0.25s ease, margin-bottom 0.25s ease, opacity 0.25s ease";
  el.style.height = "0px";
  el.style.marginBottom = "0px";
  el.style.opacity = "0";
  el.addEventListener("transitionend", () => { el.hidden = true; }, { once: true });
}

// Under Privacy Blur, changing a course's grade shows the GPA for a moment,
// long enough to see its numbers roll to the new value, then blurs it again.
export const GPA_REVEAL_LINGER_MS = 600;

export function revealGpaBriefly(card, { rollMs, staggerMs }) {
  if (document.documentElement.dataset.privacyBlur !== "true") return;
  clearTimeout(card._gpaRevealTimer);
  card.dataset.revealGpa = "true";
  const digits = Math.max(...[...card.querySelectorAll(".gpa-summary-item strong")].map((el) => (el.dataset.rollValue || el.textContent).length));
  card._gpaRevealTimer = setTimeout(() => {
    delete card.dataset.revealGpa;
  }, rollMs + staggerMs * digits + GPA_REVEAL_LINGER_MS);
}
