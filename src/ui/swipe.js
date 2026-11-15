// A sideways swipe over an element: two fingers on a trackpad (a sideways scroll) or
// one on a touch screen. onSwipe(direction) gets 1 for a swipe left (forward, as if
// scrolling right) or -1 for right. Up and down is left to the page's scroll.
//
// A trackpad swipe is a stream of wheel events that carries on as momentum, so it counts
// once and the next only after it has stopped: two months can't be scrolled through by
// accident. It has stopped when the stream goes quiet (QUIET_MS without an event) or
// its momentum has died down to nothing (events under TAIL px), which is cleared there
// and then rather than waited out.

const DISTANCE = 50; // px of travel before a swipe counts
const QUIET_MS = 100;
const TAIL = 4;

// Returns the way to stop listening.
export function onSwipe(element, onSwipe) {
  let travelled = 0;
  let counted = false;
  let quiet = 0;
  const wheel = (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    // Sideways is also the browser's own swipe back and forward.
    event.preventDefault();
    clearTimeout(quiet);
    const stop = () => {
      travelled = 0;
      counted = false;
    };
    // Only the last of the momentum: the swipe is over, and these never add up to one.
    if (Math.abs(event.deltaX) < TAIL) return stop();
    quiet = setTimeout(stop, QUIET_MS);
    if (counted) return;
    travelled += event.deltaX;
    if (Math.abs(travelled) < DISTANCE) return;
    counted = true;
    onSwipe(Math.sign(travelled));
  };

  let from = null;
  const touchStart = (event) => {
    from = event.touches.length === 1 ? event.touches[0] : null;
  };
  const touchEnd = (event) => {
    if (!from) return;
    const dx = event.changedTouches[0].clientX - from.clientX;
    const dy = event.changedTouches[0].clientY - from.clientY;
    from = null;
    if (Math.abs(dx) >= DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(-Math.sign(dx));
  };

  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("touchstart", touchStart, { passive: true });
  element.addEventListener("touchend", touchEnd, { passive: true });
  return () => {
    clearTimeout(quiet);
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("touchstart", touchStart);
    element.removeEventListener("touchend", touchEnd);
  };
}
