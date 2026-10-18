// The app's on/off switch (see .toggle-switch in controls.css). Created
// already in its state, so a switch that's on doesn't slide on as it
// appears. Other props go on the checkbox (data-pref, say).
export function ToggleSwitch({ checked, onChange, className = "", ...props }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" className={className} checked={checked} onChange={(event) => onChange(event.target.checked)} {...props} />
      <span className="toggle-slider" />
    </label>
  );
}
