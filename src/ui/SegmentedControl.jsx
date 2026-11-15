import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// The app's segmented control (see controls.css): options in a gray pill,
// with one thumb that slides to the active one. On first show the thumb is
// put in place without sliding, and again once Inter has loaded, since the
// fallback font's widths differ. options: [{ value, label }]. Other props go
// on the control (data-pref, say).
// How long the thumb takes to slide (see place), and the beat after it before the
// choice is acted on.
const SLIDE_MS = 200;
const APPLY_AFTER_MS = SLIDE_MS + 30;

export function SegmentedControl({ value, options, onChange, ...props }) {
  // The option shown active: value, except right after a click, when it moves
  // at once (see onClick).
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);
  const thumbRef = useRef(null);
  const optionRefs = useRef(new Map());
  const placedRef = useRef(false);
  const applyTimer = useRef(null);
  // What `place` reads, kept current: it's also called later from the font-ready
  // callback below, set up once at the first draw, and reading `shown` there
  // would be reading the first draw's option, which put the thumb back on it
  // (with no slide) if the fonts finished loading after a click.
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // The slide is a transform animation, which runs on the compositor: left and width are
  // set to where the thumb ends up, and it's moved back to where it was and eased to
  // there. Animating left/width themselves would run on the main thread, where a new
  // theme's restyle holds it up.
  const place = (animate) => {
    const thumb = thumbRef.current;
    const active = optionRefs.current.get(shownRef.current);
    if (!thumb || !active) return;
    const control = thumb.parentElement;
    const before = animate ? thumb.getBoundingClientRect() : null;
    const origin = animate ? control.getBoundingClientRect() : null;
    if (thumb.getAnimations) thumb.getAnimations().forEach((running) => running.cancel());
    const left = active.offsetLeft;
    const width = active.offsetWidth;
    thumb.style.left = `${left}px`;
    thumb.style.width = `${width}px`;
    if (!before || typeof thumb.animate !== "function") return;
    const fromLeft = before.left - origin.left;
    if (Math.abs(fromLeft - left) < 0.5 && Math.abs(before.width - width) < 0.5) return;
    thumb.animate(
      [{ transform: `translateX(${fromLeft - left}px) scaleX(${before.width / width})` }, { transform: "none" }],
      { duration: SLIDE_MS, easing: "ease" }
    );
  };

  useLayoutEffect(() => {
    place(placedRef.current);
    placedRef.current = true;
  });

  useEffect(() => {
    let current = true;
    if (document.fonts) document.fonts.ready.then(() => current && place(false));
    return () => {
      current = false;
    };
    // Only once, when first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="segmented-control" {...props}>
      <span className="segmented-thumb" ref={thumbRef} style={{ transition: "none", transformOrigin: "0 50%" }} />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-option${option.value === shown ? " segmented-option--active" : ""}`}
          data-value={option.value}
          ref={(el) => {
            if (el) optionRefs.current.set(option.value, el);
            else optionRefs.current.delete(option.value);
          }}
          onClick={() => {
            if (option.value === shown) return;
            // Active, and the thumb on its way, before onChange's effects (a
            // new theme, say) reach the page, as it always was: otherwise the
            // option's hover color, which lingers under the sliding thumb,
            // would already be the new theme's.
            flushSync(() => setShown(option.value));
            // The choice itself (a new theme, a redrawn page...) is a burst of
            // style, layout and paint work on the main thread. Run while the
            // thumb is still sliding, it lands mid-slide as one long frame that
            // the animation stutters on (the slide itself runs on the
            // compositor, but the text colors fading with it don't). So it
            // waits for the slide to finish. Clicks in quick succession act on
            // the last one only.
            clearTimeout(applyTimer.current);
            applyTimer.current = setTimeout(() => onChange(option.value), APPLY_AFTER_MS);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
