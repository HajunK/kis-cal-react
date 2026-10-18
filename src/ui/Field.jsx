// The admin forms' controls (see .admin-add-form in admin.css): a labeled
// field around an input. Extra props go to the input or textarea, ref
// included.

export function Field({ label, children }) {
  return (
    <label className="admin-add-field">
      <span className="admin-add-label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }) {
  return <input type="text" autoComplete="off" className={`posts-input ${className}`.trim()} {...props} />;
}

export function TextArea({ className = "", ...props }) {
  return <textarea className={`posts-input posts-textarea ${className}`.trim()} {...props} />;
}

export function SubmitButton({ children, ...props }) {
  return (
    <button type="submit" className="admin-add-submit-btn" {...props}>
      {children}
    </button>
  );
}
