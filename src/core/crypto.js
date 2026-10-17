// Grades are encrypted on the device so Firestore only ever holds ciphertext:
// AES-GCM, with the 12-byte IV and the ciphertext joined and base64-encoded so
// each value fits in one Firestore string field. Where the key is kept (and
// asked for) is up to the page; this is only the format.

export const ENCRYPTED_FIELDS = ["domainScores", "gpaClasses", "domainSnapshot"];

const IV_BYTES = 12;
const KEY_BYTES = 32;

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateRawKeyBase64() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

export function importRawKey(rawBase64) {
  return crypto.subtle.importKey("raw", base64ToBytes(rawBase64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function encryptValue(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext).then((ciphertext) => {
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return bytesToBase64(combined);
  });
}

// Rejects rather than falling back, so a wrong code can be reported.
export function decryptValueOrThrow(key, stored) {
  const combined = base64ToBytes(stored);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  return crypto.subtle
    .decrypt({ name: "AES-GCM", iv }, key, ciphertext)
    .then((plaintext) => JSON.parse(new TextDecoder().decode(plaintext)));
}

// Null and plain objects (data saved before encryption) pass through rather
// than erroring; the next save rewrites them encrypted. Failures fall back to
// fallbackValue so a bad field can't break the page.
export function decryptValue(key, stored, fallbackValue) {
  if (stored === undefined || stored === null) return Promise.resolve(fallbackValue);
  if (typeof stored !== "string") return Promise.resolve(stored);
  try {
    base64ToBytes(stored);
  } catch {
    return Promise.resolve(fallbackValue);
  }
  return decryptValueOrThrow(key, stored).catch(() => fallbackValue);
}

export function encryptAppDataForCloud(data, key) {
  return Promise.all(ENCRYPTED_FIELDS.map((field) => encryptValue(key, data[field]))).then((encryptedValues) => {
    const encrypted = { ...data };
    ENCRYPTED_FIELDS.forEach((field, i) => {
      encrypted[field] = encryptedValues[i];
    });
    return encrypted;
  });
}

// A typed or scanned login key. Stores nothing: the caller persists the key
// once it's confirmed to work.
export function importKeyFromCode(code) {
  const trimmed = (code || "").replace(/\s+/g, "");
  let bytes;
  try {
    bytes = base64ToBytes(trimmed);
  } catch {
    bytes = null;
  }
  if (!bytes || bytes.length !== KEY_BYTES) {
    return Promise.reject(new Error("That doesn't look like a valid decryption code."));
  }

  const normalizedBase64 = bytesToBase64(bytes);
  return crypto.subtle
    .importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    .then((key) => ({ key, rawBase64: normalizedBase64 }));
}
