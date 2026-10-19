// The service worker that shows suggestion alerts while no KIS Cal tab is open
// (see src/shell/notifications.js). Firebase Messaging's own handling draws
// the notification the Cloud Function sends and, when it's clicked, opens the
// link the message carries (the Assessments tab).
//
// The same version and (public) settings as src/shell/firebase.js.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC2SPEQKcCtKhHazv9YOOYWOXXNB33EmdI",
  authDomain: "kisj-grade-calculator.firebaseapp.com",
  projectId: "kisj-grade-calculator",
  storageBucket: "kisj-grade-calculator.firebasestorage.app",
  messagingSenderId: "1096495035706",
  appId: "1:1096495035706:web:fb57a52a1d7625dc468c03",
  measurementId: "G-0KESGQV3P4",
});

firebase.messaging();
