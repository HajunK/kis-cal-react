// The guides site's settings. The Firebase values are public identifiers (access
// is enforced by the Security Rules), the same project as the app's.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC2SPEQKcCtKhHazv9YOOYWOXXNB33EmdI",
  authDomain: "kisj-grade-calculator.firebaseapp.com",
  projectId: "kisj-grade-calculator",
  storageBucket: "kisj-grade-calculator.firebasestorage.app",
  messagingSenderId: "1096495035706",
  appId: "1:1096495035706:web:fb57a52a1d7625dc468c03",
};

export const FIREBASE_VERSION = "10.12.2";

// Cosmetic only: it shows or hides the admin controls. firestore.rules and
// storage.rules are the real gate, so keep these in step with them (and with
// ADMIN_EMAILS in src/core/admins.js).
export const ADMIN_EMAILS = ["hajunk105@gmail.com", "hjkim29@kis.ac"];
export const isAdminEmail = (email) => Boolean(email) && ADMIN_EMAILS.includes(email);
