// The card row's scrolling, carried over from domain.js unchanged: its own
// scrollbar, the rubber band at either end, and the arrows (and arrow keys)
// that step a card at a time. They work on the row, scrollbar and arrows
// DomainPage renders.

// Reset on every scroll event so the scrollbar stays through a long scroll.
export function initScrollingClass(container) {
  let classesScrollingTimeout = null;
  // Also called by the rubber band, so the scrollbar shows while it stretches.
  container._showScrollbar = (ms = 800) => {
    container.classList.add("classes-container--scrolling");
    clearTimeout(classesScrollingTimeout);
    classesScrollingTimeout = setTimeout(() => {
      container.classList.remove("classes-container--scrolling");
    }, ms);
  };
  container.addEventListener("scroll", () => {
    if (container._buttonScrolling) return;
    container._showScrollbar();
  });
}

// Chrome only rubber-bands the page itself, so the cards' row gets its own.
// Wheel events don't say whether they're fingers or momentum, so the scroll's
// history decides: one still moving the row when it reaches the end is a
// flick arriving, which stops there with a single bounce and has its
// remaining events ignored. One starting at the end is a push, which stretches
// until it turns into momentum (steps that stop growing; trackpads repeat
// whole-pixel values) or stops, then springs back.
const OVERSCROLL_MAX_PX = 90; // approached, never passed, however hard it's pushed
const OVERSCROLL_RESISTANCE = 0.55; // how quickly the pull stiffens, as iOS's
const OVERSCROLL_RELEASE_MS = 50; // no more pushing for this long: spring back
// Critically damped, so it returns as fast as it can without swinging past.
// Position over time from x0 moving at v0: (x0 + (v0 + w * x0) * t) *
// e^(-w * t).
const OVERSCROLL_SPRING_W = 13;
const OVERSCROLL_SETTLE_PX = 0.4; // closer than this to rest: at rest
const OVERSCROLL_VELOCITY_GAP_MS = 100; // a longer gap starts a fresh gesture
const OVERSCROLL_MOMENTUM_STEPS = 3; // steps in a row that didn't grow...
const OVERSCROLL_MOMENTUM_SHRINKS = 2; // ...of which this many shrank: momentum
const OVERSCROLL_ARRIVAL_PUSH = 4; // an arriving flick's bounce: its last step x this, banded
// Past this, the push is spent rather than piling up out of sight.
const OVERSCROLL_LIMIT_SHARE = 0.95;

export function initClassesOverscroll(container) {
  // How far scrolling has pushed past the edge, and how far that shows.
  let pushed = 0;
  let shown = 0;
  let releaseTimer = 0;
  let springing = null; // { start, x0, v0, animations }
  let lastTime = 0;
  let lastStep = 0;
  let steady = 0;
  let shrank = 0;
  // So the rest of a flick can't push the row out again after it's sprung
  // back.
  let spentFlick = false;
  let streamMoved = false;

  // Set on each card rather than via a custom property on the row, which
  // every element in every card inherits, restyling them all each frame.
  const show = (px) => {
    shown = px;
    const value = px ? `${-px}px 0` : "";
    for (const child of container.children) child.style.translate = value;
    container._overscrollStretch = px;
    if (container._placeScrollbar) container._placeScrollbar();
    if (px && container._showScrollbar) container._showScrollbar();
  };
  // Diminishing returns, approaching OVERSCROLL_MAX_PX.
  const band = (distance) => {
    const pull = 1 - 1 / ((Math.abs(distance) * OVERSCROLL_RESISTANCE) / OVERSCROLL_MAX_PX + 1);
    return Math.sign(distance) * pull * OVERSCROLL_MAX_PX;
  };
  const springAt = (x0, v0, t) => (x0 + (v0 + OVERSCROLL_SPRING_W * x0) * t) * Math.exp(-OVERSCROLL_SPRING_W * t);
  // Leaves the row where it had got to, so a fresh push carries on from
  // there.
  const stopSpring = () => {
    if (!springing) return;
    const { start, x0, v0, animations } = springing;
    springing = null;
    animations.forEach((animation) => animation.cancel());
    show(springAt(x0, v0, (performance.now() - start) / 1000));
  };
  // The whole path is known up front, so it's handed to the browser as one
  // animation per card, which runs on the compositor: smooth however busy the
  // page is, with no card redrawn. Updating it frame by frame dropped frames
  // while a flick's momentum was still arriving.
  const spring = (x0, v0) => {
    clearTimeout(releaseTimer);
    stopSpring();
    pushed = 0;
    if (!x0 && !v0) {
      show(0);
      return;
    }
    const stretches = [];
    for (let t = 0; ; t += 1 / 120) {
      const x = springAt(x0, v0, t);
      if (Math.abs(x) < OVERSCROLL_SETTLE_PX && t > 1 / OVERSCROLL_SPRING_W) {
        stretches.push(0);
        break;
      }
      stretches.push(x);
    }
    const keyframes = stretches.map((x) => ({ translate: x ? `${-x}px 0` : "0px 0" }));
    const duration = ((keyframes.length - 1) * 1000) / 120;
    show(0); // the animations show the motion; the cards' own value is rest
    const animations = Array.from(container.children, (child) => child.animate(keyframes, { duration, easing: "linear" }));
    const thumb = container._scrollbarThumb;
    if (thumb && container._scrollbarTransform) {
      animations.push(
        thumb.animate(
          stretches.map((x) => ({ transform: container._scrollbarTransform(x) })),
          { duration, easing: "linear" }
        )
      );
      if (container._showScrollbar) container._showScrollbar(duration + 800);
    }
    const current = { start: performance.now(), x0, v0, animations };
    springing = current;
    if (animations[0]) {
      animations[0].finished
        .then(() => {
          if (springing === current) springing = null;
        })
        .catch(() => {});
    }
  };
  // One motion out and back: a critically damped spring starting at rest with
  // speed v peaks at v / (w * e).
  const bump = (peak) => {
    stopSpring();
    spring(shown, (peak - shown) * OVERSCROLL_SPRING_W * Math.E);
  };
  const springBack = () => {
    stopSpring();
    spring(shown, 0);
  };

  container.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const dx = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const now = event.timeStamp || performance.now();
      const dt = now - lastTime;
      const step = Math.abs(dx);
      const sameStream = dt < OVERSCROLL_VELOCITY_GAP_MS && Math.sign(dx) === Math.sign(lastStep);
      if (!sameStream) {
        streamMoved = false;
        spentFlick = false;
      }
      if (sameStream && step <= Math.abs(lastStep)) {
        steady += 1;
        if (step < Math.abs(lastStep)) shrank += 1;
      } else {
        steady = 0;
        shrank = 0;
      }
      lastStep = dx;
      lastTime = now;
      const momentum = steady >= OVERSCROLL_MOMENTUM_STEPS && shrank >= OVERSCROLL_MOMENTUM_SHRINKS;
      if (spentFlick) return;

      const max = container.scrollWidth - container.clientWidth;
      if (max <= 1) return;
      const atStart = container.scrollLeft <= 0.5;
      const atEnd = container.scrollLeft >= max - 0.5;
      const intoEdge = (dx < 0 && atStart) || (dx > 0 && atEnd);
      const stretched = pushed !== 0;
      if (!intoEdge) streamMoved = true;
      if (!stretched && !intoEdge) return;

      // A flick arriving: it stops here with one bounce sized by its speed.
      if (intoEdge && streamMoved && !stretched) {
        spentFlick = true;
        bump(band(Math.sign(dx) * step * OVERSCROLL_ARRIVAL_PUSH));
        return;
      }

      stopSpring();
      const next = pushed + dx;
      if (stretched && Math.sign(next) !== Math.sign(pushed)) {
        pushed = 0;
        show(0);
        return;
      }
      pushed = next;
      show(band(pushed));

      // Otherwise the push would pile up beyond what can be shown, and a
      // scroll back would have to work through it first.
      if (Math.abs(shown) >= OVERSCROLL_MAX_PX * OVERSCROLL_LIMIT_SHARE) {
        spentFlick = true;
        springBack();
        return;
      }

      if (momentum) {
        spentFlick = true;
        springBack();
        return;
      }
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(springBack, OVERSCROLL_RELEASE_MS);
    },
    // Passive so scrolling never waits on this; a cancellable listener made
    // every scroll lag. Nothing needs cancelling, and overscroll-behavior-x
    // keeps the browser's swipe-back out.
    { passive: true }
  );
}

// Sized and placed as a native scrollbar would be.
export function initClassesScrollbar(container, thumb) {
  // A stretch past either end shortens the thumb, as a page's does, keeping
  // it against that end: by as many pixels as the row is stretched (a native
  // thumb's proportional shrink would barely show on a row this much wider
  // than the screen), down to 30% of its length. Scaled rather than resized,
  // so the rubber band's spring can animate it on the compositor along with
  // the cards. The track stops SCROLLBAR_INSET_PX short of either side.
  const SCROLLBAR_INSET_PX = 5;
  const trackWidth = () => container.clientWidth - 2 * SCROLLBAR_INSET_PX;
  // Where browsers can, the thumb follows the scroll through a scroll-driven
  // CSS animation (see .classes-scrollbar-thumb), which the browser runs
  // alongside the scrolling itself. Moved from scroll events, it fell behind
  // on fast scrolls, since those reach this code later than the scrolling
  // happens. Here it only needs its size and travel.
  const scrollDriven = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
  // The stretch's shortening, on top of where the scroll has the thumb.
  const transformFor = (stretch) => {
    const track = trackWidth();
    const total = container.scrollWidth;
    const base = (container.clientWidth / total) * track;
    const at = scrollDriven ? "" : `translateX(${SCROLLBAR_INSET_PX + (container.scrollLeft / total) * track}px) `;
    if (!stretch) return at || "none";
    const width = Math.max(base * 0.3, base - Math.abs(stretch));
    const shift = stretch < 0 ? 0 : base - width;
    return `${at}translateX(${shift}px) scaleX(${width / base})`;
  };
  const place = () => {
    const total = container.scrollWidth;
    if (total <= container.clientWidth + 1) {
      thumb.style.width = "0px";
      return;
    }
    const width = (container.clientWidth / total) * trackWidth();
    thumb.style.width = `${width}px`;
    thumb.style.setProperty("--thumb-from", `${SCROLLBAR_INSET_PX}px`);
    thumb.style.setProperty("--thumb-to", `${SCROLLBAR_INSET_PX + trackWidth() - width}px`);
    thumb.style.transform = transformFor(container._overscrollStretch || 0);
  };
  container._scrollbarThumb = thumb;
  container._scrollbarTransform = transformFor;
  container._placeScrollbar = place;
  if (!scrollDriven) container.addEventListener("scroll", place, { passive: true });
  window.addEventListener("resize", place);
  new MutationObserver(place).observe(container, { childList: true });
  place();

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    thumb.classList.add("classes-scrollbar-thumb--dragging");
    const startX = event.clientX;
    const startScroll = container.scrollLeft;
    const ratio = container.scrollWidth / trackWidth();
    const move = (moveEvent) => {
      container.scrollLeft = startScroll + (moveEvent.clientX - startX) * ratio;
    };
    const end = () => {
      thumb.classList.remove("classes-scrollbar-thumb--dragging");
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", end);
      thumb.removeEventListener("pointercancel", end);
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", end);
  });
}

// At either end the button does nothing rather than wrapping around.
// popupOpen() says whether the arrow keys belong to a popup instead.
export function initCardScrollButtons(container, nav, prev, next, popupOpen) {
  const cardStep = () => {
    const card = container.querySelector(".class-card");
    if (!card) return 0;
    return card.offsetWidth + (parseFloat(getComputedStyle(container).columnGap) || 0);
  };
  const maxScroll = () => container.scrollWidth - container.clientWidth;

  // Still clickable, but with no tint, so it doesn't look like it would do
  // anything.
  const markEnds = () => {
    const now = pendingTarget === null ? container.scrollLeft : pendingTarget;
    prev.classList.toggle("domain-card-nav-btn--at-end", now <= 1);
    next.classList.toggle("domain-card-nav-btn--at-end", now >= maxScroll() - 1);
  };
  const update = () => {
    const overflowing = maxScroll() > 1 && cardStep() > 0;
    nav.hidden = !overflowing;
    if (overflowing) markEnds();
  };

  // Button scrolls don't show the scrollbar. scrollend clears the flag, with
  // a timeout where it isn't supported.
  let buttonScrollTimer = null;
  // A click mid-glide steps on from where the glide is headed, not where the
  // row is, which would land on the same card again.
  let pendingTarget = null;
  const endButtonScroll = () => {
    container._buttonScrolling = false;
    pendingTarget = null;
    clearTimeout(buttonScrollTimer);
  };
  container.addEventListener("scrollend", endButtonScroll);
  const scrollTo = (left) => {
    if (Math.abs(left - container.scrollLeft) < 1) return;
    container._buttonScrolling = true;
    pendingTarget = left;
    clearTimeout(buttonScrollTimer);
    buttonScrollTimer = setTimeout(endButtonScroll, 1500);
    container.scrollTo({ left, behavior: "smooth" });
    markEnds();
  };

  // Measured from each card's own position, so the gray bar after the pinned
  // card doesn't throw the steps off.
  const step = (direction) => {
    const max = maxScroll();
    const now = pendingTarget === null ? container.scrollLeft : pendingTarget;
    if (direction < 0 && now <= 1) return;
    if (direction > 0 && now >= max - 1) return;
    const first = container.querySelector(".class-card");
    if (!first) return;
    const stops = Array.from(container.querySelectorAll(".class-card")).map((card) => card.offsetLeft - first.offsetLeft);
    const target = direction > 0 ? stops.find((left) => left > now + 1) : stops.filter((left) => left < now - 1).pop();
    scrollTo(Math.max(0, Math.min(target === undefined ? (direction > 0 ? max : 0) : target, max)));
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  // Each step joins the glide already under way.
  const KEY_HOLD_DELAY_MS = 300;
  const KEY_HOLD_STEP_MS = 220;
  let heldKey = null;
  let keyHoldTimer = null;
  const startKeyHold = (key) => {
    heldKey = key;
    const direction = key === "ArrowLeft" ? -1 : 1;
    (direction < 0 ? prev : next).classList.add("domain-card-nav-btn--pressed");
    step(direction);
    keyHoldTimer = setTimeout(function repeat() {
      step(direction);
      keyHoldTimer = setTimeout(repeat, KEY_HOLD_STEP_MS);
    }, KEY_HOLD_DELAY_MS);
  };
  const stopKeyHold = () => {
    clearTimeout(keyHoldTimer);
    heldKey = null;
    prev.classList.remove("domain-card-nav-btn--pressed");
    next.classList.remove("domain-card-nav-btn--pressed");
  };

  // Not while the arrows are moving a text cursor or a popup is open.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (nav.hidden) return;
    const target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable]")) return;
    // Every popup's backdrop is a "...-overlay".
    if (popupOpen() || document.querySelector('[class*="-overlay"]')) return;
    event.preventDefault();
    // Auto-repeat fires much faster than a card can glide, and each repeat
    // restarting the glide stuttered, so holding a key steps at its own pace
    // instead.
    if (event.repeat || heldKey) return;
    startKeyHold(event.key);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === heldKey) stopKeyHold();
  });
  window.addEventListener("blur", () => stopKeyHold());

  container.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new MutationObserver(update).observe(container, { childList: true });
  update();
}
