import { useState } from "react";
import { WHEEL_DEFAULTS, wheelTuning } from "./wheel.js";

// Sliders for the wheel's settings (see wheelTuning in wheel.js), shown on the Menu page when its
// address ends in ?tune, to find what looks best: each takes effect on the next frame, so
// turn the wheel with the arrows while moving them. The values to keep are shown to copy.
const SETTINGS = [
  { key: "bendRate", label: "Bend rate", min: 0, max: 4, step: 0.1, note: "how soon it bends (0 = only past its edges)" },
  { key: "radius", label: "Radius", min: 150, max: 1200, step: 10, note: "smaller = tighter curve" },
  { key: "pullBack", label: "Pull back", min: 0, max: 400, step: 10, note: "how far it shrinks while moving" },
  { key: "easeOut", label: "Ease-out", min: 0, max: 1, step: 0.05, note: "0 = steady speed (linear), 1 = fast start and long ease-out" },
  { key: "settleMs", label: "Settle (ms)", min: 300, max: 2000, step: 50, note: "applies from the next turn" },
];

export function WheelTuner() {
  const [, redraw] = useState(0);
  const set = (key, value) => {
    wheelTuning[key] = Number(value);
    redraw((n) => n + 1);
  };
  return (
    <div className="wheel-tuner">
      <strong>Wheel tuning</strong>
      {SETTINGS.map(({ key, label, min, max, step, note }) => (
        <label key={key}>
          <span>
            {label}: <b>{wheelTuning[key]}</b>
          </span>
          <input type="range" min={min} max={max} step={step} value={wheelTuning[key]} onChange={(event) => set(key, event.target.value)} />
          <small>{note}</small>
        </label>
      ))}
      <button
        type="button"
        onClick={() => {
          Object.assign(wheelTuning, WHEEL_DEFAULTS);
          redraw((n) => n + 1);
        }}
      >
        Reset
      </button>
      <code>
        {`bendRate: ${wheelTuning.bendRate}, radius: ${wheelTuning.radius}, pullBack: ${wheelTuning.pullBack}, settleMs: ${wheelTuning.settleMs}, easeOut: ${wheelTuning.easeOut}`}
      </code>
    </div>
  );
}
