// Reading and writing guides (Firestore, the `guides` collection) and their
// pictures (Cloud Storage, under guides/{id}/). The rules are the real gate:
// anyone reads a published guide, only an admin reads a draft or writes.
import { firebaseWith } from "./firebase.js";

const asGuide = (doc) => ({ id: doc.id, ...doc.data() });

// Visitors get what's published; an admin gets everything, drafts too.
export async function loadGuides({ admin }) {
  const firebase = await firebaseWith("firestore");
  const collection = firebase.firestore().collection("guides");
  const snapshot = await (admin ? collection.get() : collection.where("published", "==", true).get());
  return snapshot.docs.map(asGuide);
}

export async function loadGuide(id) {
  const firebase = await firebaseWith("firestore");
  const doc = await firebase.firestore().collection("guides").doc(id).get();
  return doc.exists ? asGuide(doc) : null;
}

export async function saveGuide(guide) {
  const firebase = await firebaseWith("firestore");
  const { id, ...data } = guide;
  await firebase.firestore().collection("guides").doc(id).set(data);
}

// A picture, to Storage; resolves to where it is and its address.
export async function uploadImage(guideId, blob, name) {
  const firebase = await firebaseWith("storage");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `guides/${guideId}/${name}-${Date.now()}.${extension}`;
  const ref = firebase.storage().ref(path);
  await ref.put(blob, { contentType: blob.type, cacheControl: "public,max-age=31536000" });
  return { path, url: await ref.getDownloadURL() };
}

// Pictures nobody uses any more. Best effort: a file that's already gone is fine.
export async function deleteImages(paths) {
  if (paths.length === 0) return;
  const firebase = await firebaseWith("storage");
  await Promise.all(paths.map((path) => firebase.storage().ref(path).delete().catch(() => {})));
}

export async function deleteGuide(guide) {
  const firebase = await firebaseWith("firestore");
  await firebase.firestore().collection("guides").doc(guide.id).delete();
  await deleteImages([guide.thumbnailPath, ...(guide.imagePaths || [])].filter(Boolean));
}
