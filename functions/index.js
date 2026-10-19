import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { buildMessage, staleTokens } from "./notification.js";

initializeApp();

// When a student suggests an assessment the calendar is missing (a new
// document in `suggested`), every admin device that has switched on
// suggestion alerts in Settings (see adminPushTokens in firestore.rules) gets a
// push. Only reads the suggestion; changes nothing but the device list, from
// which it drops devices the browser no longer has.
//
// Region: the database is in nam5 (US multi-region), which us-central1 serves.
export const notifyAdminsOfSuggestion = onDocumentCreated({ document: "suggested/{suggestionId}", region: "us-central1" }, async (event) => {
  const suggestion = event.data?.data();
  if (!suggestion) return;

  const db = getFirestore();
  const snapshot = await db.collection("adminPushTokens").get();
  if (snapshot.empty) return;
  const devices = snapshot.docs.map((doc) => ({ token: doc.id, ...doc.data() }));

  const { responses } = await getMessaging().sendEach(devices.map((device) => buildMessage(suggestion, device)));

  await Promise.all(staleTokens(devices, responses).map((token) => db.collection("adminPushTokens").doc(token).delete()));
});
