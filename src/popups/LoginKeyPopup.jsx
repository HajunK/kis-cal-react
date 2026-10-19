import { useEffect, useRef, useState } from "react";

// icons/copy.svg and the app's check (check.png), drawn in the button's color
// through masks (see .settings-copy-glyph and .settings-copy-check).
const COPY_ICON = <span className="settings-copy-icon settings-copy-glyph" aria-hidden="true" />;
const CHECK_ICON = <span className="settings-copy-icon settings-copy-check" aria-hidden="true" />;

// The Login Key card: this device's key as a QR code to scan from another
// device, and as text to copy. Reading it can ask for the key first, when this
// device doesn't have it yet (see resolveDeviceKeyForBoot in src/shell/data.js).
export function LoginKeyPopup({ page }) {
  const [code, setCode] = useState("");
  // Stays a check while the popup is open; it's built fresh, as a copy button
  // again, the next time it opens.
  const [copied, setCopied] = useState(false);

  // Once per opening, even where React runs effects twice to check them, as
  // asking can put up the login-key prompt.
  const requestedRef = useRef(false);
  useEffect(() => {
    const user = page.currentUser();
    const db = page.firestore();
    if (!user || !db || requestedRef.current) return;
    requestedRef.current = true;
    db.collection("users")
      .doc(user.uid)
      // A plain .get() right after sign-in can come from the local cache before
      // the encrypted fields sync, wrongly skipping the decryption prompt.
      .get({ source: "server" })
      .then((snapshot) => page.resolveDeviceKey(user.uid, snapshot.exists ? snapshot.data() : {}))
      .then(() => setCode(localStorage.getItem(page.encKeyStorageKey(user.uid)) || ""))
      .catch((error) => console.error("Failed to load decryption code:", error));
  }, [page]);

  const qrcode = page.qrcode();
  let svg = "";
  if (code && qrcode) {
    const qr = qrcode(0, "M");
    qr.addData(code);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
  }

  return (
    <>
      <button type="button" className="settings-modal-close-btn" aria-label="Close" onClick={page.close}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      <h2 className="settings-title">Login Key</h2>
      {/* An easier way to get the code onto another device than typing it:
          scan this with that device's camera. It fades in once drawn. */}
      <div className="settings-encryption-qr" id="encryption-code-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="settings-encryption-code-row">
        <div className="settings-encryption-code-pill">
          <div className="settings-encryption-code" id="encryption-code" tabIndex={0} role="textbox" aria-readonly="true" aria-label="Login key">
            {code}
          </div>
        </div>
        <button
          type="button"
          className="settings-copy-btn"
          id="copy-encryption-code-btn"
          aria-label={copied ? "Copied" : "Copy"}
          onClick={() => {
            if (!code) return;
            navigator.clipboard.writeText(code).then(() => setCopied(true));
          }}
        >
          {copied ? CHECK_ICON : COPY_ICON}
        </button>
      </div>
      <p className="settings-encryption-hint">
        Save this key somewhere safe. It is necessary when logging in with another device.
      </p>
    </>
  );
}
