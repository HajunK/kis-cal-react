import { useState } from "react";
import { gradeIconPath } from "../core/grades.js";

const SAMPLE_GRADES = [
  { slug: "a", label: "A", score: "94" },
  { slug: "b-plus", label: "B+", score: "89" },
  { slug: "a-minus", label: "A-", score: "91" },
  { slug: "a-plus", label: "A+", score: "100" },
];

const CIPHER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decorative, and long enough to overflow the box so it scrolls rather than
// looking sparse. New each time it opens.
function randomCipherText() {
  const bytes = crypto.getRandomValues(new Uint8Array(250));
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += CIPHER_CHARS[bytes[i] % CIPHER_CHARS.length];
  return text;
}

// The "Only you can see your grades" footer's Learn More popup, on Domain and
// GPA.
export function GradeProtectionPopup({ page }) {
  const [cipher] = useState(randomCipherText);
  return (
    <>
      <button type="button" className="grade-protection-close-btn" aria-label="Close" onClick={page.close}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      <h2 className="grade-protection-title">How Your Grades Are Protected</h2>
      <p className="grade-protection-intro">
        KIS Cal uses{" "}
        <a href="https://en.wikipedia.org/wiki/End-to-end_encryption" target="_blank" rel="noopener noreferrer">
          end-to-end encryption
        </a>{" "}
        to ensure your grades cannot be accessed by any third party, including the app developer.
      </p>

      <h3 className="grade-protection-section-title">Creating Your Account</h3>
      <p className="grade-protection-section-text">
        When you create an account, your browser generates a unique, random <strong>login key</strong> that tells your
        browser how to scramble and unscramble your data so no one else can read it.
      </p>

      <h3 className="grade-protection-section-title">Storing the Key</h3>
      <p className="grade-protection-section-text">
        Your login key is only saved on your device. You can find it in Profile → Login Key.
      </p>

      <div className="grade-protection-compare">
        <div className="grade-protection-compare-column">
          <span className="grade-protection-compare-heading">What you see</span>
          <div className="grade-protection-grades" id="grade-protection-grades">
            {SAMPLE_GRADES.map(({ slug, label, score }) => (
              <div className="grade-protection-grade-row" key={slug}>
                <img className="letter-grade" src={gradeIconPath(slug)} data-slug={slug} alt={label} />
                <span>{score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grade-protection-compare-column">
          <span className="grade-protection-compare-heading">What is stored</span>
          <div className="grade-protection-cipher-box" id="grade-protection-cipher">
            {cipher}
          </div>
          <div className="grade-protection-key-note">
            <img className="grade-protection-key-icon" id="grade-protection-key-icon" alt="" src={page.uiIconPath("key.png")} />
            <span>
              The key that <u>only your device knows</u> is needed to decrypt this data.
            </span>
          </div>
        </div>
      </div>

      <h3 className="grade-protection-section-title">Encrypting Your Grades</h3>
      <p className="grade-protection-section-text">
        When you add or edit a grade, your browser encrypts it before sending it to the database. Only scrambled,
        unreadable data is transmitted or stored.
      </p>

      <h3 className="grade-protection-section-title">Decrypting Your Grades</h3>
      <p className="grade-protection-section-text">
        When you return to view your grades, your browser uses your key to decrypt the database on your device.
      </p>
    </>
  );
}
