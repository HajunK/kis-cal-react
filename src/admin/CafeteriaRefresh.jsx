import { useEffect, useMemo, useRef, useState } from "react";

const COOLDOWN_MS = 2 * 60_000;
const RETRY_MS = 35 * 60_000;

export function CafeteriaRefresh({ page, onSuccess }) {
  const ref = useMemo(() => page.db.collection("cafeteriaMenuRefresh").doc("hs"), [page]);
  const [request, setRequest] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const lastSuccess = useRef(undefined);

  useEffect(() => ref.onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const data = snapshot.exists ? snapshot.data() : null;
    const success = data?.status === "succeeded" && data.processedRequestAt?.isEqual(data.requestedAt)
      ? data.processedRequestAt.toMillis()
      : null;
    if (lastSuccess.current !== undefined && success !== null && lastSuccess.current !== success) {
      setError("");
      onSuccess();
    }
    lastSuccess.current = success;
    setNow(Date.now());
    setRequest(data);
  }, () => setError("Refresh status unavailable.")), [ref, onSuccess]);

  const asked = request?.requestedAt;
  const complete = asked && request.processedRequestAt?.isEqual(asked);
  const cooldownEnd = asked ? asked.toMillis() + (complete ? COOLDOWN_MS : RETRY_MS) : 0;
  useEffect(() => {
    if (cooldownEnd <= now) return undefined;
    const id = setTimeout(() => setNow(Date.now()), cooldownEnd - now);
    return () => clearTimeout(id);
  }, [cooldownEnd, now]);

  const busy = Boolean(submitting || (asked && !complete && cooldownEnd > now));
  let status = "";
  if (submitting) status = "Requesting refresh…";
  else if (busy) status = request.runningRequestAt?.isEqual(asked) ? "Refreshing menus…" : "Refresh queued.";
  else if (complete) status = request.status === "succeeded" ? "Menus updated." : "Refresh failed.";
  else if (asked) status = "Refresh timed out.";

  const requestRefresh = async () => {
    setError("");
    setSubmitting(true);
    try {
      await ref.set({ requestedAt: page.serverTimestamp() }, { merge: true });
    } catch (failure) {
      setError(failure.code === "permission-denied" ? "Refresh unavailable. Try again shortly." : "Couldn’t request a refresh.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cafeteria-refresh">
      <button type="button" className="cafeteria-clear-btn cafeteria-refresh-btn"
        disabled={request === undefined || busy || now < cooldownEnd} aria-busy={busy} onClick={requestRefresh}>
        Refresh
      </button>
      <span className="cafeteria-refresh-status" role="status">{error || status}</span>
    </div>
  );
}
