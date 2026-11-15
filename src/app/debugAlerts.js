// For a browser whose DevTools are blocked (a school account, say): opening any
// page with ?debug=1 shows each error as an alert instead. Nothing happens
// without it.
if (typeof window !== "undefined" && new URLSearchParams(location.search).has("debug")) {
  const shown = new Set();
  const show = (title, error) => {
    const text = error && error.stack ? error.stack : String(error);
    const message = `${title}\n\n${text}`.split("\n").slice(0, 8).join("\n");
    if (shown.has(message) || shown.size >= 3) return;
    shown.add(message);
    window.alert(message);
  };
  window.addEventListener("error", (event) => show("Error", event.error || event.message));
  // Errors the app catches and only logs show up too.
  const logError = console.error;
  console.error = (...args) => {
    logError(...args);
    show("Logged error", args.map((arg) => (arg && arg.stack) || String(arg)).join(" "));
  };
  window.addEventListener("unhandledrejection", (event) => show("Unhandled promise error", event.reason));
}
