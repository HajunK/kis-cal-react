import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ENCRYPTED_FIELDS, decryptValueOrThrow, importKeyFromCode } from "../core/crypto.js";
import { APP_DATA_CACHE_PREFIX, storeDeviceKey } from "../shell/data.js";
import { deleteField, firestore } from "../shell/firebase.js";
import { prefsCacheKeyFor } from "../shell/preferences.js";
import { keyPromptState } from "../shell/session.js";

// jsQR is about 257KB, so it's only loaded when the prompt actually runs.
let jsQrLoadPromise = null;
function ensureJsQrLoaded() {
  if (typeof window.jsQR === "function") return Promise.resolve();
  if (jsQrLoadPromise) return jsQrLoadPromise;

  jsQrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/js/vendor/jsQR.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load jsQR"));
    document.head.appendChild(script);
  });
  return jsQrLoadPromise;
}

// Asks for the login key when this device has none and the account has
// encrypted grades (see resolveDeviceKeyForBoot in src/shell/data.js), from
// encryption.js. Deliberately can't be dismissed: carrying on with the wrong
// key would overwrite the real encrypted data with near-empty data.
export function DecryptionPrompt() {
  const prompt = useSyncExternalStore(keyPromptState.subscribe, keyPromptState.get);
  if (!prompt) return null;
  return createPortal(<Prompt key={prompt.uid} prompt={prompt} />, document.body);
}

// Its views (the QR scanner, the typed key, the reset warning) swap with
// hand-tuned motion, so it's drawn once and run as before: React draws the
// markup, the code below shows and hides its parts.
function Prompt({ prompt }) {
  const overlayRef = useRef(null);

  useLayoutEffect(() => {
    const { uid, cloud, resolve } = prompt;
    const overlay = overlayRef.current;
    const dialog = overlay.querySelector(".decryption-prompt");
    void dialog.offsetWidth;  // so the entrance transitions
    dialog.classList.add("decryption-prompt--visible");
    overlay.classList.add("decryption-prompt-overlay--visible");

    const cameraBox = overlay.querySelector(".decryption-prompt-camera");
    const video = overlay.querySelector(".decryption-prompt-video");
    const useCodeBtn = overlay.querySelector(".decryption-prompt-use-code-btn");

    const manualBox = overlay.querySelector(".decryption-prompt-manual");
    const input = overlay.querySelector(".decryption-prompt-input");
    const errorEl = overlay.querySelector(".decryption-prompt-error");
    const scanBtn = overlay.querySelector(".decryption-prompt-scan-btn");

    const mainTitle = overlay.querySelector(".decryption-prompt > .decryption-prompt-title");
    const introText = overlay.querySelector(".decryption-prompt > .decryption-prompt-text");
    const resetPrompt = overlay.querySelector(".decryption-prompt-reset-prompt");
    const resetLink = overlay.querySelector(".decryption-prompt-reset-link");
    const resetConfirmBox = overlay.querySelector(".decryption-prompt-reset-confirm");
    const resetCancelBtn = overlay.querySelector(".decryption-prompt-reset-cancel-btn");
    const resetConfirmBtn = overlay.querySelector(".decryption-prompt-reset-confirm-btn");

    const encryptedFieldsPresent = ENCRYPTED_FIELDS.filter((field) => typeof cloud[field] === "string");

    // Checked as it's typed (or pasted, or scanned), so there's no button to
    // press: a key that works opens the grades at once. Only a key that's
    // all there (a whole 32-byte key is 44 characters) and still doesn't
    // work says so; one that's still being typed just waits. Each check
    // carries its own number, so a slow earlier one can't land after a
    // newer one.
    const FULL_KEY_LENGTH = 44;
    let attemptNumber = 0;
    let unlocked = false;

    function attempt() {
      if (unlocked) return;
      const number = ++attemptNumber;
      const typed = input.value.replace(/\s+/g, "");

      importKeyFromCode(input.value)
        .then(({ key, rawBase64 }) =>
          Promise.all(encryptedFieldsPresent.map((field) => decryptValueOrThrow(key, cloud[field]))).then(() => ({
            key,
            rawBase64,
          }))
        )
        .then(({ key, rawBase64 }) => {
          if (number !== attemptNumber || unlocked) return;
          unlocked = true;
          stopScanning();
          storeDeviceKey(uid, key, rawBase64);
          resolve(key);
        })
        .catch(() => {
          if (number !== attemptNumber) return;
          const complete = typed.length >= FULL_KEY_LENGTH;
          errorEl.textContent = "That key doesn't match this account. Check it and try again.";
          errorEl.hidden = !complete;
        });
    }

    const onKeyDown = (event) => {
      if (event.key === "Enter") attempt();
    };
    input.addEventListener("input", attempt);
    input.addEventListener("keydown", onKeyDown);

    // A scanned code goes through the same check as a typed one, so a misread
    // frame just fails and lets the user retry.
    let scanStream = null;
    let scanFrameHandle = null;
    const scanCanvas = document.createElement("canvas");
    const scanCtx = scanCanvas.getContext("2d");

    // Leaves hiding the camera view to the caller, which may fade it out.
    function stopScanning() {
      if (scanFrameHandle) cancelAnimationFrame(scanFrameHandle);
      scanFrameHandle = null;
      if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
      scanStream = null;
    }

    // From one view of the prompt to another: what's leaving fades out, then
    // the dialog eases to the new view's height as it fades and rises in.
    // Straight to the new view when nothing that's leaving is showing.
    let viewSwap = null;
    function swapViews(hideEls, showEls, then) {
      if (viewSwap) viewSwap.cancel();
      const leaving = hideEls.filter((el) => !el.hidden);
      const coming = showEls.filter((el) => el.hidden);
      const finish = () => {
        hideEls.forEach((el) => (el.hidden = true));
        showEls.forEach((el) => (el.hidden = false));
      };
      if (leaving.length === 0 || coming.length === 0) {
        finish();
        if (then) then();
        return;
      }
      const style = getComputedStyle(dialog);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const startHeight = dialog.offsetHeight - padding;
      const fades = leaving.map((el) =>
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in", fill: "forwards" })
      );
      viewSwap = fades[0];
      Promise.all(fades.map((fade) => fade.finished))
        .then(() => {
          viewSwap = null;
          fades.forEach((fade) => fade.cancel());
          finish();
          const endHeight = dialog.offsetHeight - padding;
          dialog.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], {
            duration: 260,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          });
          coming.forEach((el) =>
            el.animate(
              [
                { opacity: 0, transform: "translateY(6px)" },
                { opacity: 1, transform: "none" },
              ],
              { duration: 260, easing: "ease-out" }
            )
          );
          if (then) then();
        })
        .catch(() => {});
    }

    function scanFrame() {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        scanCanvas.width = video.videoWidth;
        scanCanvas.height = video.videoHeight;
        scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
        const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          input.value = code.data;
          stopScanning();
          // Into the typed view, so a misread code can be fixed by hand.
          swapViews([cameraBox], [manualBox]);
          attempt();
          return;
        }
      }
      scanFrameHandle = requestAnimationFrame(scanFrame);
    }

    function showManualEntry() {
      stopScanning();
      swapViews([cameraBox], [manualBox], () => input.focus());
    }

    function showCameraScanning() {
      errorEl.hidden = true;
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        showManualEntry();
        return;
      }
      swapViews([manualBox], [cameraBox]);
      startCamera();
    }

    function startCamera() {
      ensureJsQrLoaded()
        .then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }))
        .then((stream) => {
          if (unlocked) return stream.getTracks().forEach((track) => track.stop());
          scanStream = stream;
          video.srcObject = stream;
          scanFrameHandle = requestAnimationFrame(scanFrame);
        })
        .catch(() => {
          showManualEntry();
        });
    }

    useCodeBtn.addEventListener("click", showManualEntry);
    scanBtn.addEventListener("click", showCameraScanning);

    // Without the code the old data can't be recovered, so resetting is the
    // only other way forward.
    let resetReturnToCamera = false;

    // The warning stands alone, with its own heading in place of the key
    // prompt's.
    function showResetConfirm() {
      resetReturnToCamera = !cameraBox.hidden;
      stopScanning();
      swapViews([mainTitle, introText, cameraBox, manualBox, resetPrompt], [resetConfirmBox]);
    }

    function hideResetConfirm() {
      const view = resetReturnToCamera ? cameraBox : manualBox;
      swapViews([resetConfirmBox], [mainTitle, introText, view, resetPrompt], () => {
        if (resetReturnToCamera) startCamera();
        else input.focus();
      });
    }

    const onReset = () => {
      resetConfirmBtn.disabled = true;
      resetCancelBtn.disabled = true;

      // Only the encrypted fields are cleared (update, not a wholesale set);
      // everything else is readable without the code. With nothing left to
      // decrypt, the next read just makes a fresh key.
      const clearedFields = { lastModified: Date.now() };
      ENCRYPTED_FIELDS.forEach((field) => {
        clearedFields[field] = deleteField();
      });

      firestore()
        .collection("users")
        .doc(uid)
        .update(clearedFields)
        .then(() => {
          localStorage.removeItem(APP_DATA_CACHE_PREFIX + uid);
          localStorage.removeItem(prefsCacheKeyFor(uid));
          // A fresh start, as the cleared caches (preferences among them)
          // are only rebuilt from scratch.
          location.reload();
        })
        .catch((error) => {
          console.error("Failed to clear encrypted data:", error);
          window.alert("Something went wrong. Please try again.");
          resetConfirmBtn.disabled = false;
          resetCancelBtn.disabled = false;
        });
    };

    resetLink.addEventListener("click", showResetConfirm);
    resetCancelBtn.addEventListener("click", hideResetConfirm);
    resetConfirmBtn.addEventListener("click", onReset);

    showCameraScanning();
    return () => {
      stopScanning();
      if (viewSwap) viewSwap.cancel();
    };
  }, [prompt]);

  return (
    <div className="decryption-prompt-overlay" ref={overlayRef}>
      <div className="decryption-prompt">
        <h2 className="decryption-prompt-title">Enter your login key</h2>
        <p className="decryption-prompt-text">Find it in Profile → Login Key on the device you first signed in on.</p>

        <div className="decryption-prompt-camera">
          <video className="decryption-prompt-video" playsInline webkit-playsinline="" muted autoPlay />
          <button type="button" className="decryption-prompt-use-code-btn">
            Use decryption code instead
          </button>
        </div>

        <div className="decryption-prompt-manual" hidden>
          <input
            type="text"
            className="decryption-prompt-input"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="Login Key"
          />
          <p className="decryption-prompt-error" hidden />
          <button type="button" className="decryption-prompt-scan-btn">
            Scan QR code instead
          </button>
        </div>

        <p className="decryption-prompt-reset-prompt">
          Forgot your code?{" "}
          <button type="button" className="decryption-prompt-reset-link">
            Enter grades manually
          </button>
        </p>

        {/* Swapped in for the camera/manual views above, not stacked on top
            of them: there's no way to recover the old encrypted data without
            the code, so this is the only way forward besides finding it. */}
        <div className="decryption-prompt-reset-confirm" hidden>
          <h2 className="decryption-prompt-title">Are you sure?</h2>
          <p className="decryption-prompt-text">
            Your grades can't be opened without your login key, so this deletes them and you start over. Your courses and
            settings stay. This can't be undone.
          </p>
          <div className="decryption-prompt-reset-actions">
            <button type="button" className="decryption-prompt-reset-cancel-btn">
              Cancel
            </button>
            <button type="button" className="decryption-prompt-reset-confirm-btn">
              Clear encrypted grades
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
