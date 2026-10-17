// Grades are encrypted on the device so Firestore only ever holds ciphertext.
// The AES-GCM key is generated per device and account and never leaves this
// browser's localStorage; another device needs the code from Settings, and a
// lost code means the data can't be read. The format itself (and
// ENCRYPTED_FIELDS, encryptValue, decryptValue...) is src/core/crypto.js.

function encKeyStorageKey(uid) {
  return `encKey_${uid}`;
}

// Cached as a Promise so concurrent callers share one import instead of racing.
const deviceKeyCache = {};

function getDeviceKey(uid) {
  if (deviceKeyCache[uid]) return deviceKeyCache[uid];

  const storageKey = encKeyStorageKey(uid);
  let rawBase64 = localStorage.getItem(storageKey);
  if (!rawBase64) {
    rawBase64 = generateRawKeyBase64();
    localStorage.setItem(storageKey, rawBase64);
  }

  const promise = importRawKey(rawBase64);
  deviceKeyCache[uid] = promise;
  return promise;
}

function hasStoredDeviceKey(uid) {
  return !!localStorage.getItem(encKeyStorageKey(uid));
}

// jsQR is about 257KB, so it's only loaded when the prompt actually runs.
let jsQrLoadPromise = null;
function ensureJsQrLoaded() {
  if (typeof jsQR === "function") return Promise.resolve();
  if (jsQrLoadPromise) return jsQrLoadPromise;

  jsQrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/vendor/jsQR.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load jsQR"));
    document.head.appendChild(script);
  });
  return jsQrLoadPromise;
}

function storeDeviceKey(uid, key, rawBase64) {
  localStorage.setItem(encKeyStorageKey(uid), rawBase64);
  deviceKeyCache[uid] = Promise.resolve(key);
}

// Deliberately can't be dismissed: carrying on with the wrong key would
// overwrite the real encrypted data with near-empty data.
function promptForDecryptionCode(uid, cloud) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "decryption-prompt-overlay";
    overlay.innerHTML = `
      <div class="decryption-prompt">
        <h2 class="decryption-prompt-title">Enter your login key</h2>
        <p class="decryption-prompt-text">
          Find it in Profile → Login Key on the device you first signed in on.
        </p>

        <div class="decryption-prompt-camera">
          <video class="decryption-prompt-video" playsinline webkit-playsinline muted autoplay></video>
          <button type="button" class="decryption-prompt-use-code-btn">Use decryption code instead</button>
        </div>

        <div class="decryption-prompt-manual" hidden>
          <input
            type="text"
            class="decryption-prompt-input"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Login Key"
          />
          <p class="decryption-prompt-error" hidden></p>
          <button type="button" class="decryption-prompt-scan-btn">Scan QR code instead</button>
        </div>

        <p class="decryption-prompt-reset-prompt">
          Forgot your code?
          <button type="button" class="decryption-prompt-reset-link">Enter grades manually</button>
        </p>

        <!-- Swapped in for the camera/manual views above, not stacked on top
             of them — there's no way to recover the old encrypted data
             without the code, so this is the only way forward besides
             finding it. -->
        <div class="decryption-prompt-reset-confirm" hidden>
          <h2 class="decryption-prompt-title">Are you sure?</h2>
          <p class="decryption-prompt-text">
            Your grades can't be opened without your login key, so this deletes them and you start over. Your
            courses and settings stay. This can't be undone.
          </p>
          <div class="decryption-prompt-reset-actions">
            <button type="button" class="decryption-prompt-reset-cancel-btn">Cancel</button>
            <button type="button" class="decryption-prompt-reset-confirm-btn">Clear encrypted grades</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

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
          overlay.remove();
          resolve(key);
        })
        .catch(() => {
          if (number !== attemptNumber) return;
          const complete = typed.length >= FULL_KEY_LENGTH;
          errorEl.textContent = "That key doesn't match this account. Check it and try again.";
          errorEl.hidden = !complete;
        });
    }

    input.addEventListener("input", attempt);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") attempt();
    });

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

    // From one view of the prompt to another (the QR scanner, the typed key,
    // the reset warning): what's leaving fades out, then the dialog eases to
    // the new view's height as it fades and rises in. Straight to the new
    // view when nothing that's leaving is showing.
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
        const code = jsQR(imageData.data, imageData.width, imageData.height);
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

    resetLink.addEventListener("click", showResetConfirm);
    resetCancelBtn.addEventListener("click", hideResetConfirm);
    resetConfirmBtn.addEventListener("click", () => {
      resetConfirmBtn.disabled = true;
      resetCancelBtn.disabled = true;

      // Only the encrypted fields are cleared (update, not a wholesale set);
      // everything else is readable without the code. With nothing left to
      // decrypt, the next load just makes a fresh key.
      const clearedFields = { lastModified: Date.now() };
      ENCRYPTED_FIELDS.forEach((field) => {
        clearedFields[field] = firebase.firestore.FieldValue.delete();
      });

      firebase
        .firestore()
        .collection("users")
        .doc(uid)
        .update(clearedFields)
        .then(() => {
          localStorage.removeItem(APP_DATA_CACHE_PREFIX + uid);
          localStorage.removeItem(prefsCacheKeyFor(uid));
          location.reload();
        })
        .catch((error) => {
          console.error("Failed to clear encrypted data:", error);
          alert("Something went wrong. Please try again.");
          resetConfirmBtn.disabled = false;
          resetCancelBtn.disabled = false;
        });
    });

    showCameraScanning();
  });
}

// Only blocks on the prompt when this device has no key and there's encrypted
// data to unlock.
function resolveDeviceKeyForBoot(uid, cloud) {
  if (hasStoredDeviceKey(uid)) return getDeviceKey(uid);

  const hasExistingEncryptedData = ENCRYPTED_FIELDS.some((field) => typeof cloud[field] === "string");
  if (!hasExistingEncryptedData) return getDeviceKey(uid);

  return promptForDecryptionCode(uid, cloud);
}
