// The score lists' scrolling, carried over from domain.js unchanged: the
// blurred copy under each box's label, the thin thumb drawn over its edge,
// and Formatives and Summatives scrolling as one. They work on the list,
// blur and thumb ClassCard renders for each box.

// Re-copied whenever the list changes and realigned on every scroll, in the
// same frame as a linked scroll.
export function attachScoreScrollBlur(box, list, blur) {
  let copy = null;

  const place = () => {
    if (!copy) return;
    copy.style.marginLeft = `${list.offsetLeft}px`;
    copy.style.width = `${list.offsetWidth}px`;
    copy.style.transform = `translateY(${-list.scrollTop}px)`;
  };

  const recopy = () => {
    copy = list.cloneNode(true);
    // A clone gets each input's original markup, not what's been typed since.
    const typed = list.querySelectorAll("input");
    copy.querySelectorAll("input").forEach((input, i) => {
      input.value = typed[i].value;
    });
    blur.replaceChildren(copy);
    place();
  };

  let frame = 0;
  const recopySoon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(recopy);
  };
  new MutationObserver(recopySoon).observe(list, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  list.addEventListener("input", recopySoon);
  // Also after each of its card's draws (see ClassCard).
  list._recopyScoreBlur = recopySoon;
  list._placeScrollBlur = place;
  recopySoon();
}

// Drawn over the list's edge rather than beside it, so appearing never
// narrows the rows.
export function attachScoreScrollThumb(box, list, thumb) {
  const INSET = 2;
  // The list runs into the box's rounded corner; the thumb stops short of it.
  const TRACK_END_GAP = 10;
  const label = box.querySelector(".assessment-label");
  let thumbHeight = 0;
  // The list runs up under the label, so the track starts below it.
  const trackStart = () => Math.max(list.offsetTop, label.offsetTop + label.offsetHeight);
  const trackLength = () => list.offsetTop + list.clientHeight - trackStart() - TRACK_END_GAP;
  const update = () => {
    const overflow = list.scrollHeight - list.clientHeight;
    thumb.hidden = overflow <= 1;
    list._placeScrollBlur?.();
    if (thumb.hidden) return;
    thumbHeight = Math.max(24, (trackLength() * list.clientHeight) / list.scrollHeight);
    const travel = trackLength() - thumbHeight;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${trackStart() + (list.scrollTop / overflow) * travel}px`;
    thumb.style.right = `${box.clientWidth - (list.offsetLeft + list.offsetWidth) + INSET}px`;
  };

  list.addEventListener("scroll", update, { passive: true });
  // Called right after a linked scroll so the thumb moves in the same frame as
  // the rows.
  list._updateScrollThumb = update;
  new ResizeObserver(update).observe(list);
  new MutationObserver(update).observe(list, { childList: true });

  // Row contents sit above the thumb, so presses in its area are caught on
  // the list too.
  const startDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    thumb.setPointerCapture(event.pointerId);
    thumb.classList.add("score-scroll-thumb--dragging");
    const startY = event.clientY;
    const startScroll = list.scrollTop;
    const onMove = (moveEvent) => {
      const travel = trackLength() - thumbHeight;
      if (travel <= 0) return;
      const value = startScroll + ((moveEvent.clientY - startY) * (list.scrollHeight - list.clientHeight)) / travel;
      if (list._setLinkedScroll) list._setLinkedScroll(value);
      else list.scrollTop = value;
    };
    const onUp = () => {
      thumb.classList.remove("score-scroll-thumb--dragging");
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onUp);
      thumb.removeEventListener("pointercancel", onUp);
    };
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onUp);
    thumb.addEventListener("pointercancel", onUp);
  };
  thumb.addEventListener("pointerdown", startDrag);
  list.addEventListener("pointerdown", (event) => {
    if (thumb.hidden) return;
    const rect = thumb.getBoundingClientRect();
    const onThumb =
      event.clientX >= rect.left - 2 && event.clientX <= rect.right + 2 && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!onThumb) return;
    suppressNextClick = true;
    startDrag(event);
  });
  // Clicks on the box focus a row; a drag shouldn't.
  thumb.addEventListener("click", (event) => event.stopPropagation());
  let suppressNextClick = false;
  list.addEventListener(
    "click",
    (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true
  );
}

const WHEEL_LINE_PX = 16;
// Mouse-wheel notches are eased; a trackpad's small steps are applied as they
// come.
const WHEEL_NOTCH_PX = 50;

// Native scrolling moves the list under the cursor off the main thread,
// leaving the other a frame or more behind, so wheel scrolling sets both from
// one handler. Other scrolling (keyboard, focus) is mirrored from scroll
// events.
export function linkScoreListScroll(listA, listB) {
  let position = 0;
  let target = null;
  let frame = 0;

  const maxScroll = () => Math.max(listA.scrollHeight - listA.clientHeight, listB.scrollHeight - listB.clientHeight, 0);

  const setBoth = (value) => {
    position = value;
    listA.scrollTop = value;
    listB.scrollTop = value;
    listA._updateScrollThumb?.();
    listB._updateScrollThumb?.();
    listA._afterLinkedScroll?.();
    listB._afterLinkedScroll?.();
  };

  const stopEasing = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    target = null;
  };

  const easeStep = () => {
    const next = position + (target - position) * 0.3;
    if (Math.abs(target - next) < 0.5) {
      setBoth(target);
      stopEasing();
      return;
    }
    setBoth(next);
    frame = requestAnimationFrame(easeStep);
  };

  const onWheel = (event) => {
    // Pinch-zoom and sideways swipes (scrolling the cards) are left alone.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const list = event.currentTarget;
    const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? list.clientHeight : 1;
    const delta = event.deltaY * unit;
    const from = target !== null ? target : list.scrollTop;
    const to = Math.min(Math.max(from + delta, 0), maxScroll());
    // At the end already: let the page scroll instead.
    if (to === from && target === null) return;
    event.preventDefault();

    if (Math.abs(delta) >= WHEEL_NOTCH_PX) {
      if (target === null) position = list.scrollTop;
      target = to;
      if (!frame) frame = requestAnimationFrame(easeStep);
    } else {
      stopEasing();
      setBoth(to);
    }
  };

  const mirror = (source, other) => {
    if (target !== null || other.scrollTop === source.scrollTop) return;
    position = source.scrollTop;
    other.scrollTop = source.scrollTop;
  };

  [listA, listB].forEach((list) => {
    list.addEventListener("wheel", onWheel, { passive: false });
    list._setLinkedScroll = (value) => {
      stopEasing();
      setBoth(Math.min(Math.max(value, 0), maxScroll()));
    };
  });
  listA.addEventListener("scroll", () => mirror(listA, listB));
  listB.addEventListener("scroll", () => mirror(listB, listA));
}
