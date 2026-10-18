import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GRADE_SCALE, computeGpa, gradeIconPath, roundToFourDecimals } from "../core/grades.js";
import { flipBadge, hideDescription, revealGpaBriefly, setBadge, settleBadge, slideBadge } from "./badgeMotion.js";
import { buildGpaClasses, classesFromDomain, toSavedGpaClasses } from "./gpaData.js";

// Matches .gpa-grade-dropdown's opacity transition.
const GPA_DROPDOWN_ANIMATION_MS = 180;
// Trackpads fire many tiny events per gesture; the threshold and cooldown make
// one flick move one tier.
const WHEEL_STEP_THRESHOLD = 40;
const WHEEL_COOLDOWN_MS = 120;
const MIN_PASTE_LOADING_MS = 1000; // so it doesn't just flash by, even on a fast fetch
const PASTE_FLIP_STAGGER_MS = 70;
const PASTE_LABEL = "Paste from Domain Tab";
// The numbers' text belongs to animateNumberChange; React never sets it again.
const DASH = { __html: "-" };

// The GPA tab. Its first render is the page's own markup (gpa.html), which it
// hydrates; it fills in once page.ready, when boot.js has the user's data.
// page: { ready, data: () => ({ periods, gpaClasses, domainSnapshot }),
//   saveGpaClasses(classes), fetchDomainSnapshot(), animateNumber(el, text,
//   style), roll: { rollMs, staggerMs } }.
export function GpaPage({ page }) {
  // Each row: { name, slug, label, change }, change saying how its badge
  // moves to this grade ({ id, kind: "set" | "flip" | "slide", ... }).
  const [classes, setClasses] = useState([]);
  const classesRef = useRef(classes);
  const [openRow, setOpenRow] = useState(null);
  const [paste, setPaste] = useState("idle"); // "idle" | "loading" | "done"
  // Restoring on page load shouldn't animate; only live changes after it do.
  const settledRef = useRef(false);
  const descriptionRef = useRef(null);
  const descriptionHiddenRef = useRef(false);
  const summaryRef = useRef(null);
  const [revealCount, setRevealCount] = useState(0);
  const changeIdRef = useRef(0);
  const nextChange = (change) => ({ id: ++changeIdRef.current, ...change });

  const commit = useCallback(
    (next) => {
      classesRef.current = next;
      setClasses(next);
      page.saveGpaClasses(toSavedGpaClasses(next));
    },
    [page]
  );

  // Built in the same render the data arrives in, so the GPA's first values
  // appear at once rather than rolling in after an empty frame.
  const [loaded, setLoaded] = useState(false);
  if (page.ready && !loaded) {
    const { periods, gpaClasses, domainSnapshot } = page.data();
    const built = buildGpaClasses(periods, gpaClasses, domainSnapshot).map((entry) => ({
      ...entry,
      change: nextChange({ kind: "set" }),
    }));
    classesRef.current = built;
    setClasses(built);
    setLoaded(true);
  }

  // Saved straight away, as gpa.js did, and from then on numbers roll.
  useEffect(() => {
    if (!loaded || settledRef.current) return;
    settledRef.current = true;
    page.saveGpaClasses(toSavedGpaClasses(classesRef.current));
  }, [loaded, page]);

  // A click anywhere closes the grade picker; the rows' own clicks stop here.
  useEffect(() => {
    const close = () => setOpenRow(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // After the numbers have started rolling, so it can time itself by them.
  useLayoutEffect(() => {
    if (revealCount > 0 && summaryRef.current) revealGpaBriefly(summaryRef.current, page.roll);
  }, [revealCount, page]);

  // A grade picked, cleared or scrolled to. Picking (not clearing or
  // scrolling) also folds the instructions away, the first time.
  const changeGrade = (index, tier, change, { picked = false } = {}) => {
    const next = classesRef.current.map((entry, i) =>
      i === index ? { ...entry, slug: tier ? tier.slug : null, label: tier ? tier.label : null, change: nextChange(change) } : entry
    );
    setOpenRow(null);
    commit(next);
    setRevealCount((count) => count + 1);
    // Pasting again would do nothing until a grade changes.
    setPaste("idle");
    if (picked && !descriptionHiddenRef.current && descriptionRef.current) {
      descriptionHiddenRef.current = true;
      hideDescription(descriptionRef.current);
    }
  };

  const scrollGrade = (index, direction) => {
    const entry = classesRef.current[index];
    const currentIndex = entry.slug ? GRADE_SCALE.findIndex((tier) => tier.slug === entry.slug) : -1;
    const nextIndex = currentIndex === -1 ? 0 : Math.min(Math.max(currentIndex + direction, 0), GRADE_SCALE.length - 1);
    if (nextIndex === currentIndex) return;
    changeGrade(index, GRADE_SCALE[nextIndex], { kind: "slide", direction });
  };

  // The grades and GPA switch at once; only the badges trail behind, one
  // after another, for effect.
  const pasteFromDomain = () => {
    const startedAt = Date.now();
    setPaste("loading");
    page.fetchDomainSnapshot().then((domainSnapshot) => {
      setTimeout(() => {
        const previous = new Map(classesRef.current.map((entry) => [entry.name, entry]));
        const { periods } = page.data();
        const next = classesFromDomain(periods, domainSnapshot).map((entry, index) => {
          const before = previous.get(entry.name);
          return {
            ...entry,
            change: nextChange({
              kind: "flip",
              delay: index * PASTE_FLIP_STAGGER_MS,
              from: before ? { slug: before.slug, label: before.label } : { slug: null, label: null },
            }),
          };
        });
        setOpenRow(null);
        commit(next);
        setPaste("done");
      }, Math.max(0, MIN_PASTE_LOADING_MS - (Date.now() - startedAt)));
    });
  };

  const gpa = loaded ? computeGpa(classes) : null;
  const unweightedText = gpa && gpa.unweighted !== null ? roundToFourDecimals(gpa.unweighted) : "-";
  const weightedText = gpa && gpa.weighted !== null ? roundToFourDecimals(gpa.weighted) : "-";
  // Before the data is in, the split values show, as the page's markup has.
  const split = gpa ? gpa.hasAp : true;
  const rollStyle = () => (settledRef.current ? "blur" : "instant");

  return (
    <div className="gpa-layout">
      <div className="gpa-card gpa-classes-card">
        <h2 className="gpa-classes-title">Course Grades</h2>
        <p className="gpa-classes-description" ref={descriptionRef}>
          Click or scroll on the circle to set the grade.
        </p>
        <ul className="gpa-class-list">
          {classes.map((entry, index) => (
            <GpaRow
              // The same course can be in two periods.
              key={`${index}:${entry.name}`}
              entry={entry}
              open={openRow === index}
              onToggle={() => setOpenRow((open) => (open === index ? null : index))}
              onCloseAll={() => setOpenRow(null)}
              onPick={(tier) => changeGrade(index, tier, { kind: "flip" }, { picked: true })}
              onClear={() => changeGrade(index, null, { kind: "flip" })}
              onScroll={(direction) => scrollGrade(index, direction)}
            />
          ))}
        </ul>
        <button className="gpa-paste-btn" type="button" disabled={paste !== "idle"} onClick={pasteFromDomain}>
          {paste === "loading" ? (
            <>
              <span className="paste-spinner" />
              Pasting letter grades...
            </>
          ) : paste === "done" ? (
            "Successfully Pasted!"
          ) : (
            PASTE_LABEL
          )}
        </button>
      </div>

      <div className="gpa-card gpa-summary-card" ref={summaryRef}>
        <h2 className="gpa-summary-title">Grade Point Average</h2>
        <div className="gpa-summary-values">
          <div className="gpa-summary-item" hidden={!split}>
            <RollingNumber className="gpa-unweighted" text={gpa && split ? unweightedText : null} rollStyle={rollStyle} animate={page.animateNumber} />
            <span>Unweighted</span>
          </div>
          <div className="gpa-summary-item" hidden={!split}>
            <RollingNumber className="gpa-weighted" text={gpa && split ? weightedText : null} rollStyle={rollStyle} animate={page.animateNumber} />
            <span>Weighted</span>
          </div>
          <div className="gpa-summary-item gpa-summary-item--combined" hidden={split}>
            <RollingNumber className="gpa-combined" text={gpa && !split ? unweightedText : null} rollStyle={rollStyle} animate={page.animateNumber} />
            <span>Unweighted / Weighted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// A GPA value, rolled to each new text by animateNumberChange (shared.js), the
// first time instantly. null leaves it as it is: only the values on show are
// updated, as before.
function RollingNumber({ className, text, rollStyle, animate }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (text !== null) animate(ref.current, text, rollStyle());
    // rollStyle is read when the text changes, not a reason to roll again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate]);
  return <strong ref={ref} className={className} dangerouslySetInnerHTML={DASH} />;
}

function GpaRow({ entry, open, onToggle, onCloseAll, onPick, onClear, onScroll }) {
  const rowRef = useRef(null);
  const btnRef = useRef(null);
  const { slug, label, change } = entry;

  // The badge's contents follow each change in the way it asks: set outright
  // (page load), flipped (a pick, a clear, a paste), or slid (a scroll).
  const shownChangeRef = useRef(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const btn = btnRef.current;
    if (!row || !btn || shownChangeRef.current === change.id) return undefined;
    const first = shownChangeRef.current === null;
    shownChangeRef.current = change.id;
    if (change.kind === "slide" && !first) {
      slideBadge(btn, slug, label, change.direction);
      return undefined;
    }
    if (change.kind !== "flip") {
      setBadge(btn, slug, label);
      return undefined;
    }
    // A paste starts every row over from its grade before, then flips them in
    // turn.
    if (change.from) {
      settleBadge(row, btn);
      setBadge(btn, change.from.slug, change.from.label);
    }
    if (!change.delay) {
      flipBadge(row, btn, slug, label);
      return undefined;
    }
    const timer = setTimeout(() => flipBadge(row, btn, slug, label), change.delay);
    return () => clearTimeout(timer);
  }, [change, slug, label]);

  // Native, so it can stop the page scrolling (React's wheel listener is
  // passive).
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  const onCloseAllRef = useRef(onCloseAll);
  onCloseAllRef.current = onCloseAll;
  useEffect(() => {
    const btn = btnRef.current;
    let wheelAccum = 0;
    let wheelCooldownUntil = 0;
    const onWheel = (event) => {
      event.preventDefault();
      onCloseAllRef.current();
      const now = performance.now();
      wheelAccum += event.deltaY;
      if (now < wheelCooldownUntil || Math.abs(wheelAccum) < WHEEL_STEP_THRESHOLD) return;
      const direction = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      wheelCooldownUntil = now + WHEEL_COOLDOWN_MS;
      onScrollRef.current(direction);
    };
    btn.addEventListener("wheel", onWheel, { passive: false });
    return () => btn.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <li className="gpa-class-row" ref={rowRef} data-slug={slug || ""} data-label={label || ""}>
      <span className="gpa-class-name">{entry.name}</span>
      <button
        type="button"
        className="gpa-grade-badge-btn"
        ref={btnRef}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      />
      <button
        type="button"
        className="gpa-clear-btn"
        aria-label="Remove grade"
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
      >
        <span className="close-icon" aria-hidden="true" />
      </button>
      <GradeDropdown open={open} selectedSlug={slug} onPick={onPick} />
    </li>
  );
}

// The grade picker beside a badge. Opening fills it (it's display: none while
// empty), lays it out, then adds --visible, so it pops out of the badge;
// closing removes --visible and empties it once the fade is done, unless it
// reopens first.
function GradeDropdown({ open, selectedSlug, onPick }) {
  const ref = useRef(null);
  const [entered, setEntered] = useState(false);
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // The options are drawn as they were when it opened: fading out after a
  // pick, the ring stays on the grade it had, rather than jumping to the new
  // one.
  const [openedWith, setOpenedWith] = useState(selectedSlug);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLingering(!open);
    if (open) setOpenedWith(selectedSlug);
  }

  // A layout effect, so the clock starts in the click's own frame, as it did.
  useLayoutEffect(() => {
    if (!lingering) return undefined;
    const timer = setTimeout(() => setLingering(false), GPA_DROPDOWN_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [lingering]);

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const dropdown = ref.current;
    // Otherwise a grade below the fold would open out of sight.
    const grid = dropdown.querySelector(".gpa-grade-grid");
    grid.scrollTop = 0;
    const selected = grid.querySelector(".gpa-grade-option--selected");
    if (selected) {
      const item = selected.parentElement;
      if (item.offsetTop + item.offsetHeight > grid.clientHeight) grid.scrollTop = item.offsetTop - grid.clientHeight / 2 + item.offsetHeight / 2;
    }
    void dropdown.offsetWidth;  // so the entrance transitions
    setEntered(true);
  }, [open]);

  const filled = open || lingering;
  return (
    <div ref={ref} className={`gpa-grade-dropdown${open && entered ? " gpa-grade-dropdown--visible" : ""}`}>
      {filled && (
        // The grid scrolls inside the dropdown so the pointer sticking out of
        // its edge isn't clipped.
        <ul className="gpa-grade-grid">
          {GRADE_SCALE.map((tier) => (
            <li key={tier.slug}>
              <button
                type="button"
                className={`gpa-grade-option${tier.slug === openedWith ? " gpa-grade-option--selected" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onPick(tier);
                }}
              >
                <img src={gradeIconPath(tier.slug)} data-slug={tier.slug} alt={tier.label} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
