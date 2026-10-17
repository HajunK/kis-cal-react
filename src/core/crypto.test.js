import { describe, expect, it } from "vitest";
import {
  ENCRYPTED_FIELDS,
  base64ToBytes,
  bytesToBase64,
  decryptValue,
  decryptValueOrThrow,
  encryptAppDataForCloud,
  encryptValue,
  generateRawKeyBase64,
  importKeyFromCode,
  importRawKey,
} from "./crypto.js";

const newKey = () => importRawKey(generateRawKeyBase64());

describe("base64", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("encryptValue / decryptValue", () => {
  it("round-trips a value", async () => {
    const key = await newKey();
    const value = { English: { formative: [90, null], summative: [88] } };
    const stored = await encryptValue(key, value);
    expect(typeof stored).toBe("string");
    expect(stored).not.toContain("English");
    expect(await decryptValue(key, stored, null)).toEqual(value);
  });

  it("stores the 12-byte IV ahead of the ciphertext", async () => {
    const key = await newKey();
    const a = base64ToBytes(await encryptValue(key, [1]));
    const b = base64ToBytes(await encryptValue(key, [1]));
    // A fresh IV each time, so the same value never encrypts the same way.
    expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
  });

  it("falls back with the wrong key, and decryptValueOrThrow rejects", async () => {
    const stored = await encryptValue(await newKey(), [1, 2, 3]);
    const other = await newKey();
    expect(await decryptValue(other, stored, "fallback")).toBe("fallback");
    await expect(decryptValueOrThrow(other, stored)).rejects.toThrow();
  });

  it("passes missing and pre-encryption values through", async () => {
    const key = await newKey();
    expect(await decryptValue(key, undefined, [])).toEqual([]);
    expect(await decryptValue(key, null, {})).toEqual({});
    expect(await decryptValue(key, { plain: true }, null)).toEqual({ plain: true });
    expect(await decryptValue(key, "not base64!", "fallback")).toBe("fallback");
  });
});

describe("encryptAppDataForCloud", () => {
  it("encrypts only the grade fields", async () => {
    const key = await newKey();
    const data = { periods: ["English"], domainScores: { English: {} }, gpaClasses: [], domainSnapshot: [] };
    const encrypted = await encryptAppDataForCloud(data, key);
    expect(encrypted.periods).toEqual(["English"]);
    for (const field of ENCRYPTED_FIELDS) {
      expect(typeof encrypted[field]).toBe("string");
      expect(await decryptValue(key, encrypted[field], null)).toEqual(data[field]);
    }
  });
});

describe("importKeyFromCode", () => {
  it("accepts a key with stray whitespace and opens what it encrypted", async () => {
    const raw = generateRawKeyBase64();
    const stored = await encryptValue(await importRawKey(raw), "secret");
    const spaced = `${raw.slice(0, 10)} \n${raw.slice(10)}`;
    const { key, rawBase64 } = await importKeyFromCode(spaced);
    expect(rawBase64).toBe(raw);
    expect(await decryptValueOrThrow(key, stored)).toBe("secret");
  });

  it("rejects anything that isn't a 32-byte key", async () => {
    await expect(importKeyFromCode("")).rejects.toThrow();
    await expect(importKeyFromCode("abc")).rejects.toThrow();
    await expect(importKeyFromCode(bytesToBase64(new Uint8Array(16)))).rejects.toThrow();
  });
});
