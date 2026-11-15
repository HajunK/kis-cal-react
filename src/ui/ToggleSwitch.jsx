import { useEffect, useState } from "react";
import { afterPaint } from "./afterPaint.js";

// The app's on/off switch (see .toggle-switch in controls.css). Created
// already in its state, so a switch that's on doesn't slide on as it
// appears. onChange may return a promise of false to put the switch back.
// Other props go on the checkbox (data-pref, say).
export function ToggleSwitch({ checked, onChange, className = "", ...props }) {
  // Moves at once on a click; onChange's work follows once that frame is drawn.
  const [shown, setShown] = useState(checked);
  useEffect(() => setShown(checked), [checked]);
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        className={className}
        checked={shown}
        onChange={(event) => {
          const next = event.target.checked;
          setShown(next);
          afterPaint(() => {
            // An onChange that settles on false couldn't make the change: back it goes.
            Promise.resolve(onChange(next)).then((result) => result === false && setShown(!next));
          });
        }}
        {...props}
      />
      <span className="toggle-slider" />
    </label>
  );
}
