import { startTransition, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Account } from "./Account.jsx";
import { ClassCountdown } from "./ClassCountdown.jsx";

export const TABS = [
  { route: "calendar", label: "Calendar" },
  { route: "domain", label: "Domain" },
  { route: "gpa", label: "GPA" },
  { route: "assessments", label: "Assessments", admin: true },
];

// How long after a tab click its underline still slides over (the old pages
// gave the next page this long to load).
const UNDERLINE_FROM_MS = 3000;

// The bar across the top. active is the open tab's route (the demo's is the
// Calendar). The admin tabs show for admins who haven't hidden them; the
// countdown pill and My Courses only on the student's tabs. reloadLinks: the
// tabs leave the app (the Calendar demo, which has no account).
export function TabBar({ active, showAdminTabs, studentTab, user, avatar, account = true, reloadLinks = false }) {
  const barRef = useRef(null);
  const navigate = useNavigate();
  // Where the open tab's blue bar was when a tab was clicked; the newly open
  // tab's bar slides from there to its own place (transform only, so it
  // stays smooth).
  const fromRef = useRef(null);
  // The tab just clicked, shown as open straight away: the page behind it is
  // only drawn after the bar has been, so a slow tab doesn't hold the slide up.
  const [clicked, setClicked] = useState(null);
  const shown = clicked ?? active;

  const onTabClick = (event, route, isActive) => {
    if (!barRef.current || isActive) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const rect = barRef.current.getBoundingClientRect();
    fromRef.current = { left: rect.left, width: rect.width, at: Date.now() };
    if (reloadLinks) return;
    // The bar is drawn (and starts its slide) first, then the tab opens
    // after the frame it's drawn in.
    event.preventDefault();
    flushSync(() => setClicked(route));
    // A transition, so a tab still being fetched leaves the open one on screen
    // until it arrives instead of blanking the page.
    requestAnimationFrame(() => setTimeout(() => startTransition(() => navigate(`/${route}`)), 0));
  };

  // Once the route has caught up with the click, back to following it.
  useLayoutEffect(() => {
    if (clicked !== null && active === clicked) setClicked(null);
  }, [active, clicked]);

  useLayoutEffect(() => {
    const from = fromRef.current;
    fromRef.current = null;
    const bar = barRef.current;
    if (!bar || !from || !bar.animate || Date.now() - from.at > UNDERLINE_FROM_MS) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = bar.getBoundingClientRect();
    if (!to.width || !from.width) return;
    bar.animate(
      [{ transform: `translateX(${from.left - to.left}px) scaleX(${from.width / to.width})` }, { transform: "none" }],
      { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
  }, [shown]);

  return (
    <nav className="tab-bar">
      {/* Lazy, so the one the theme hides (display: none) is never fetched.
          Its width is set in nav.css, so the tabs beside it are in their places
          before it arrives rather than shifting over when it does. */}
      <img className="tab-bar-logo tab-bar-logo--light" src="/icons/logos/light-logo.png" alt="" loading="lazy" />
      <img className="tab-bar-logo tab-bar-logo--dark" src="/icons/logos/dark-logo.png" alt="" loading="lazy" />
      {TABS.map(({ route, label, admin }) => {
        const isActive = route === shown;
        return (
          <Link
            key={route}
            to={`/${route}`}
            reloadDocument={reloadLinks}
            className={`tab${admin ? " tab--admin-only" : ""}${isActive ? " tab--active" : ""}`}
            // "" would fall back to .tab--admin-only's display: none, so it
            // needs an explicit value.
            style={admin ? { display: showAdminTabs ? "inline" : "none" } : undefined}
            onClick={(event) => onTabClick(event, route, isActive)}
          >
            {label}
            {isActive ? <span className="tab-underline" aria-hidden="true" key={route} ref={barRef} /> : null}
          </Link>
        );
      })}
      {studentTab ? <ClassCountdown /> : null}
      {account ? <Account user={user} avatar={avatar} withCourses={studentTab} /> : <div className="auth-container" />}
    </nav>
  );
}
