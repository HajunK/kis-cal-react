// The "Only you can see your grades" footer's Learn More popup, on the
// Domain and GPA tabs. Needs shared.js (for the grade and UI icons).

// Static content, rebuilt on each open like the app's other popups.
function initGradeProtectionModal() {
  const triggerBtn = document.getElementById("grade-protection-learn-more-btn");
  if (!triggerBtn) return;

  let overlay = null;

  const SAMPLE_GRADES = [
    { slug: "a", label: "A", score: "94" },
    { slug: "b-plus", label: "B+", score: "89" },
    { slug: "a-minus", label: "A-", score: "91" },
    { slug: "a-plus", label: "A+", score: "100" },
  ];

  const CIPHER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // Decorative, and long enough to overflow the box so it scrolls rather than
  // looking sparse.
  function randomCipherText() {
    const bytes = crypto.getRandomValues(new Uint8Array(250));
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += CIPHER_CHARS[bytes[i] % CIPHER_CHARS.length];
    return text;
  }

  function buildOverlay() {
    const el = document.createElement("div");
    el.className = "grade-protection-overlay";
    el.innerHTML = `
      <div class="grade-protection-dialog">
        <button type="button" class="grade-protection-close-btn" aria-label="Close"><span class="close-icon" aria-hidden="true"></span></button>
        <h2 class="grade-protection-title">How Your Grades Are Protected</h2>
        <p class="grade-protection-intro">
          KIS Cal uses
          <a href="https://en.wikipedia.org/wiki/End-to-end_encryption" target="_blank" rel="noopener noreferrer"
            >end-to-end encryption</a
          >
          to ensure your grades cannot be accessed by any third party, including the app developer.
        </p>

        <h3 class="grade-protection-section-title">Creating Your Account</h3>
        <p class="grade-protection-section-text">
          When you create an account, your browser generates a unique, random
          <strong>login key</strong> that tells your browser how to scramble and unscramble your
          data so no one else can read it.
        </p>

        <h3 class="grade-protection-section-title">Storing the Key</h3>
        <p class="grade-protection-section-text">
          Your login key is only saved on your device. You can find it in Profile → Login Key.
        </p>

        <div class="grade-protection-compare">
          <div class="grade-protection-compare-column">
            <span class="grade-protection-compare-heading">What you see</span>
            <div class="grade-protection-grades" id="grade-protection-grades"></div>
          </div>
          <div class="grade-protection-compare-column">
            <span class="grade-protection-compare-heading">What is stored</span>
            <div class="grade-protection-cipher-box" id="grade-protection-cipher"></div>
            <div class="grade-protection-key-note">
              <img class="grade-protection-key-icon" id="grade-protection-key-icon" alt="" />
              <span>The key that <u>only your device knows</u> is needed to decrypt this data.</span>
            </div>
          </div>
        </div>

        <h3 class="grade-protection-section-title">Encrypting Your Grades</h3>
        <p class="grade-protection-section-text">
          When you add or edit a grade, your browser encrypts it before sending it to the database. Only
          scrambled, unreadable data is transmitted or stored.
        </p>

        <h3 class="grade-protection-section-title">Decrypting Your Grades</h3>
        <p class="grade-protection-section-text">
          When you return to view your grades, your browser uses your key to decrypt the database on your device.
        </p>
      </div>
    `;
    document.body.appendChild(el);

    const gradesEl = el.querySelector("#grade-protection-grades");
    SAMPLE_GRADES.forEach(({ slug, label, score }) => {
      const row = document.createElement("div");
      row.className = "grade-protection-grade-row";
      const badge = document.createElement("img");
      badge.className = "letter-grade";
      badge.src = gradeIconPath(slug);
      badge.dataset.slug = slug;
      badge.alt = label;
      const scoreEl = document.createElement("span");
      scoreEl.textContent = score;
      row.append(badge, scoreEl);
      gradesEl.appendChild(row);
    });

    el.querySelector("#grade-protection-cipher").textContent = randomCipherText();
    el.querySelector("#grade-protection-key-icon").src = uiIconPath("key.png");

    el.querySelector(".grade-protection-close-btn").addEventListener("click", closeModal);
    el.addEventListener("click", (event) => {
      if (event.target === el) closeModal();
    });

    return el;
  }

  function openModal() {
    overlay = buildOverlay();
    const dialog = overlay.querySelector(".grade-protection-dialog");
    void dialog.offsetWidth;  // so the entrance transitions
    dialog.classList.add("grade-protection-dialog--visible");
    overlay.classList.add("grade-protection-overlay--visible");
  }

  function closeModal() {
    if (!overlay) return;
    const closingOverlay = overlay;
    const dialog = closingOverlay.querySelector(".grade-protection-dialog");
    overlay = null;
    dialog.classList.remove("grade-protection-dialog--visible");
    closingOverlay.classList.remove("grade-protection-overlay--visible");
    setTimeout(() => closingOverlay.remove(), 250);
  }

  triggerBtn.addEventListener("click", openModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay) closeModal();
  });
}

initGradeProtectionModal();
