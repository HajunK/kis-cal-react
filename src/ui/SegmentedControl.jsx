import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// The app's segmented control (see controls.css): options in a gray pill,
// with one thumb that slides to the active one. On first show the thumb is
// put in place without sliding, and again once Inter has loaded, since the
// fallback font's widths differ. options: [{ value, label }]. Other props go
// on the control (data-pref, say).
export function SegmentedControl({ value, options, onChange, ...props }) {
  // The option shown active: value, except right after a click, when it moves
  // at once (see onClick).
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);
  const thumbRef = useRef(null);
  const optionRefs = useRef(new Map());
  const placedRef = useRef(false);

  const place = (animate) => {
    const thumb = thumbRef.current;
    const active = optionRefs.current.get(shown);
    if (!thumb || !active) return;
    if (!animate) thumb.style.transition = "none";
    thumb.style.left = `${active.offsetLeft}px`;
    thumb.style.width = `${active.offsetWidth}px`;
    if (!animate) {
      void thumb.offsetWidth;  // so the "none" transition applies first
      thumb.style.transition = "";
    }
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
      <span className="segmented-thumb" ref={thumbRef} />
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
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
