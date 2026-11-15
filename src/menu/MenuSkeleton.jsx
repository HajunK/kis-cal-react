// The Menu tab's frame as it looks before its days are known (the weeks still being read, or the
// tab's code still on its way): the title, the arrows off, the two menus without dishes, and the
// vote bar for a signed-in student. Drawn with the page's own classes, so the real page
// takes its place without anything moving. Eager and tiny, unlike the page itself.
export const Chevron = ({ flip }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`menu-arrow-icon${flip ? " menu-arrow-icon--next" : ""}`}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export function MenuSkeleton({ signedIn = false }) {
  return (
    <>
      <div className="menu-heading">
        <h1 className="menu-title">Lunch menu</h1>
        <button type="button" className="menu-arrow menu-arrow--prev" aria-label="Previous day" disabled>
          <Chevron />
        </button>
        <button type="button" className="menu-arrow menu-arrow--next" aria-label="Next day" disabled>
          <Chevron flip />
        </button>
      </div>
      <div className="menu-stage">
        <div className="menu-cards">
          {["A", "B"].map((section) => (
            <div key={section} className={`menu-card menu-card--${section.toLowerCase()}`} aria-hidden="true">
              <span className="menu-card-heading">Menu {section}</span>
              <ul className="menu-dishes" />
            </div>
          ))}
        </div>
      </div>
      {signedIn ? (
        <div className="menu-votes">
          <div className="menu-votebar" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
}

// The whole route's frame (see MenuRoute.jsx), for while the tab's code is still being fetched.
export function MenuSkeletonRoute({ signedIn }) {
  return (
    <div className="page-content" id="menu-root">
      <div className="menu-page">
        <MenuSkeleton signedIn={signedIn} />
      </div>
    </div>
  );
}
