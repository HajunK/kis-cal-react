// Firebase's compat SDK, from Google's CDN (the same version as the app), loaded
// when first needed: a visitor reading guides needs only Firestore; Auth and
// Storage come only for an admin.
import { FIREBASE_CONFIG, FIREBASE_VERSION } from "./config.js";

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
const loading = new Map();

function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          loading.delete(src);
          reject(new Error(`Couldn't load ${src}`));
        };
        document.head.appendChild(script);
      })
    );
  }
  return loading.get(src);
}

// parts: any of "firestore", "auth", "storage". Resolves to the firebase global,
// set up with the project.
export async function firebaseWith(...parts) {
  if (!window.firebase || !window.firebase.initializeApp) await loadScript(`${BASE}firebase-app-compat.js`);
  await Promise.all(parts.filter((part) => typeof window.firebase[part] !== "function").map((part) => loadScript(`${BASE}firebase-${part}-compat.js`)));
  if (window.firebase.apps.length === 0) window.firebase.initializeApp(FIREBASE_CONFIG);
  return window.firebase;
}
