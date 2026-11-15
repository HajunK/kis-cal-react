import { MenuPage } from "../menu/MenuPage.jsx";

// The Menu tab. The menus are public, so it needs Firebase but no sign-in.
export function MenuRoute({ firebaseReady }) {
  return (
    <div className="page-content" id="menu-root">
      <MenuPage firebaseReady={firebaseReady} />
    </div>
  );
}
