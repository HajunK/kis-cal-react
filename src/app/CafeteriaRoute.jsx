import { useMemo } from "react";
import { CafeteriaAdmin } from "../admin/CafeteriaAdmin.jsx";
import { deleteField, firebaseAuth, firestore } from "../shell/firebase.js";

// The admin site's Cafeteria tab: the votes on the lunch menus. It needs Firebase, which
// loads just after the app starts.
export function CafeteriaRoute({ firebaseReady }) {
  const page = useMemo(() => firebaseReady && { auth: firebaseAuth(), db: firestore(), deleteField }, [firebaseReady]);
  return <div className="page-content" id="cafeteria-root">{page ? <CafeteriaAdmin page={page} /> : null}</div>;
}
