/* global appData, pushDataToCloud, loadPeriods, loadPeriodDivisions, loadHiddenCourses, saveHiddenCourses, showToast, hideToast,
   openMyCoursesModal, currentScheduleBlock */
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ClassCard } from "./ClassCard.jsx";
import { SAMPLE_CARDS, sortPosts, visibleCourseCards } from "./model.js";
import { CARD_HIDE_MS, badgeFor, fadeOutCard } from "./motion.js";
import { initCardScrollButtons, initClassesOverscroll, initClassesScrollbar, initScrollingClass } from "./pageScroll.js";
import { ScoreDatePickers, isScoreDatePickerOpen } from "./ScoreDatePicker.jsx";

// The Domain tab: the row of course cards, its scrollbar and arrows, and the
// admins' posts. The row is kept as a list of what's in it, in order (cards,
// the gray bar after the class in session, the empty-account hint), changed
// the way domain.js changed the page: cards that stay are kept as they are,
// only ones that come or go fade. page (from main.jsx) gets the functions
// the rest of the page calls.
export function DomainPage({ page }) {
  const containerRef = useRef(null);
  const thumbRef = useRef(null);
  const navRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const [, setVersion] = useState(0);
  const [posts, setPosts] = useState([]);
  const model = useRef(null);
  if (!model.current) model.current = { items: [], inClassPeriod: null, nextId: 0, cards: new Map(), syncingTwin: false };
  const m = model.current;

  // The row as drawn after a change. At once where the change came from
  // outside React; within it (a card being made), on its next draw.
  const draw = (sync = true) => {
    if (sync) flushSync(() => setVersion((v) => v + 1));
    else setVersion((v) => v + 1);
  };

  const isCard = (item) => item.type === "card";
  const cardItems = () => m.items.filter(isCard);
  const newCardItem = (kind, entry, extra) => ({
    id: m.nextId++,
    type: "card",
    kind,
    built: entry,
    entry: kind === "sample" ? null : entry,
    hideable: kind === "real",
    animateIn: false,
    currentLabel: false,
    ...extra,
  });
  const remove = (item) => {
    m.items = m.items.filter((other) => other !== item);
  };
  const insertBefore = (item, anchor) => {
    remove(item);
    const index = anchor ? m.items.indexOf(anchor) : -1;
    if (index < 0) m.items.push(item);
    else m.items.splice(index, 0, item);
  };

  // For the GPA tab's "Paste from Domain Tab". Each card's badge as its grade
  // has it now; the pinned copy (see syncPinnedCurrentCard) would list it
  // twice.
  const saveDomainSnapshot = () => {
    appData.domainSnapshot = cardItems()
      .filter((item) => item.kind !== "pinned" && m.cards.has(item.id))
      .map((item) => {
        const { slug, label } = m.cards.get(item.id).badge;
        return { name: item.built.name, slug, label };
      });
    pushDataToCloud();
  };

  const savedScoresKey = (name) => JSON.stringify(appData.domainScores[name] || null);

  // The class in session gets a working copy at the far left, behind a gray
  // bar, so it's easy to reach. Edits to either card rebuild the other (see
  // syncTwinCard).
  const syncPinnedCurrentCard = (periodIndex) => {
    const realCards = cardItems().filter((item) => item.kind === "real");
    const originals = periodIndex === null ? [] : realCards.filter((item) => item.built.periodIndex === periodIndex && item.entry);
    // Already first: no copy, just the bar after it.
    const alreadyFirst = originals.length > 0 && originals.every((item, i) => realCards[i] === item);
    const pinned = cardItems().filter((item) => item.kind === "pinned");
    const oldDivider = m.items.find((item) => item.type === "divider");
    const wanted = alreadyFirst ? [] : originals;
    const same =
      pinned.length === wanted.length &&
      pinned.every((item, i) => item.built.name === wanted[i].built.name) &&
      Boolean(oldDivider) === originals.length > 0 &&
      (!alreadyFirst || m.items[m.items.indexOf(oldDivider) - 1] === originals[originals.length - 1]);
    if (same) return;

    pinned.forEach(remove);
    if (oldDivider) remove(oldDivider);
    cardItems().forEach((item) => (item.currentLabel = false));
    if (originals.length === 0) return;

    const divider = { id: m.nextId++, type: "divider" };
    // Every card for the period is labeled, as a period can hold more than
    // one course (two Korean courses in the same slot, say).
    if (alreadyFirst) {
      m.items.splice(m.items.indexOf(originals[originals.length - 1]) + 1, 0, divider);
      originals.forEach((item) => (item.currentLabel = true));
      return;
    }
    const copies = originals.map((original) => newCardItem("pinned", original.entry, { entry: original.entry, currentLabel: true }));
    m.items = [...copies, divider, ...m.items];
  };

  // That card's target hints stay showing, not just on hover.
  const markCardInClassNow = (sync = true) => {
    const now = typeof currentScheduleBlock === "function" ? currentScheduleBlock() : null;
    m.inClassPeriod = now && now.block.type === "class" ? now.block.periodIndex : null;
    syncPinnedCurrentCard(m.inClassPeriod);
    draw(sync);
  };

  const fadeOutAndRemoveCard = (item) => {
    item.leaving = true;
    const card = m.cards.get(item.id);
    if (card) fadeOutCard(card.el);
    setTimeout(() => {
      if (!m.items.includes(item)) return;
      remove(item);
      draw();
    }, CARD_HIDE_MS);
  };

  // Diffs against what's on screen rather than rebuilding, so unchanged cards
  // never flicker; only cards that appear or disappear fade.
  const renderDomainClasses = (animate) => {
    const desired = visibleCourseCards(loadPeriods(), loadPeriodDivisions(), loadHiddenCourses());
    const realCards = cardItems().filter((item) => item.kind === "real");
    const sampleCards = cardItems().filter((item) => item.kind === "sample");
    const existingByName = new Map(realCards.map((item) => [item.built.name, item]));
    const desiredNames = new Set(desired.map((entry) => entry.name));

    realCards.forEach((item) => {
      if (!desiredNames.has(item.built.name)) fadeOutAndRemoveCard(item);
    });

    if (desired.length === 0) {
      if (sampleCards.length === 0) {
        SAMPLE_CARDS.forEach((entry) => m.items.push(newCardItem("sample", { ...entry, matchName: entry.name, periodIndex: null })));
        m.items.push({ id: m.nextId++, type: "hint" });
      }
      draw();
      return;
    }

    sampleCards.forEach(remove);
    m.items = m.items.filter((item) => item.type !== "hint");

    // Back to front, so each new card goes before the next existing one and
    // period order holds whatever order courses were added in.
    let anchor = null;
    for (let i = desired.length - 1; i >= 0; i--) {
      const entry = desired[i];
      const existing = existingByName.get(entry.name);
      if (existing) {
        existing.entry = entry;
        // A division change can still change which dates it matches.
        const card = m.cards.get(existing.id);
        if (card) card.updateLine(entry.matchName, entry.periodIndex);
        anchor = existing;
        continue;
      }
      const item = newCardItem("real", entry, { animateIn: animate });
      insertBefore(item, anchor);
      anchor = item;
    }
    markCardInClassNow();
  };

  // Skipped when nothing changed, which also stops the rebuilt card's own
  // save bouncing back.
  const syncTwinCard = (id, sync) => {
    if (m.syncingTwin) return;
    if (!cardItems().some((item) => item.kind === "pinned")) return;
    const item = m.items.find((other) => other.id === id);
    if (!item) return;
    const name = item.built.name;
    const key = savedScoresKey(name);
    const card = m.cards.get(id);
    if (card) card.builtFrom = key;
    const twin = cardItems().find((other) => other !== item && other.built.name === name && other.entry);
    // One still being made (the pinned copy is made first, being leftmost)
    // reads the scores just saved anyway.
    const twinCard = twin && m.cards.get(twin.id);
    if (!twinCard || twinCard.builtFrom === undefined || twinCard.builtFrom === key) return;

    const rebuilt = newCardItem(twin.kind, twin.kind === "pinned" ? twin.entry : twin.entry, {
      entry: twin.entry,
      hideable: twin.kind === "real",
      currentLabel: twin.currentLabel,
      rebuilt: true,
    });
    m.items = m.items.map((other) => (other === twin ? rebuilt : other));
    if (!sync) {
      draw(false);
      return;
    }
    m.syncingTwin = true;
    try {
      draw();
    } finally {
      m.syncingTwin = false;
    }
    // The rebuild saved the GPA list while both old and new cards were
    // present.
    saveDomainSnapshot();
  };

  const cardPage = {
    register: (id, card) => m.cards.set(id, { ...card, badge: { slug: null, label: null }, builtFrom: undefined }),
    unregister: (id) => m.cards.delete(id),
    savedScores: (name) => appData.domainScores[name],
    // A sample card has no saved key to compare (see syncTwinCard).
    built: (id) => {
      const item = m.items.find((other) => other.id === id);
      const card = m.cards.get(id);
      if (item && card && item.kind !== "sample") card.builtFrom = savedScoresKey(item.built.name);
    },
    graded: (id, results) => {
      const card = m.cards.get(id);
      if (card) card.badge = badgeFor(results.domain);
      saveDomainSnapshot();
    },
    persist: (id, name, data, { mount } = {}) => {
      const all = appData.domainScores;
      all[name] = data;
      appData.domainScores = all;
      pushDataToCloud();
      syncTwinCard(id, !mount);
    },
    hide: (id, name) => {
      const hidden = loadHiddenCourses();
      if (!hidden.includes(name)) saveHiddenCourses([...hidden, name]);

      const link = document.createElement("button");
      link.type = "button";
      link.className = "toast-link";
      link.textContent = "My Courses";
      link.addEventListener("click", () => {
        hideToast();
        openMyCoursesModal();
      });
      const message = document.createDocumentFragment();
      message.append(`${name} hidden. Show it again in `, link, ".");
      showToast(message);
      const item = m.items.find((other) => other.id === id);
      if (item) fadeOutAndRemoveCard(item);
    },
  };

  // An assessment stops being next when its class ends, a time of day rather
  // than a page load, so it's re-checked periodically.
  const refreshNextAssessmentLines = () => {
    markCardInClassNow();
    if (document.documentElement.dataset.hideUpcomingAssessments === "true") return;
    m.cards.forEach((card) => {
      if (!card.meta.nextAssessmentArgs) return;
      const [name, periodIndex] = card.meta.nextAssessmentArgs;
      const next = window.nearestUpcomingAnyAssessment(name, periodIndex);
      if ((next ? next.id : null) !== card.meta.nextAssessmentId) card.updateLine(name, periodIndex);
    });
  };

  // Settings changes should show at once. What's computed in JS and locked in
  // place (the groups' height, the upcoming line, formatted dates) needs an
  // explicit refresh.
  const onPreferencesChanged = () => {
    m.cards.forEach((card) => card.recalculateGroups());
    renderDomainClasses(false);
    cardItems()
      .filter((item) => item.kind !== "sample" && m.cards.has(item.id))
      .forEach((item) => m.cards.get(item.id).refreshHints());
  };

  Object.assign(page, { renderDomainClasses, markCardInClassNow, refreshNextAssessmentLines, onPreferencesChanged, setPosts });

  useLayoutEffect(() => {
    const container = containerRef.current;
    initScrollingClass(container);
    initCardScrollButtons(container, navRef.current, prevRef.current, nextRef.current, isScoreDatePickerOpen);
    initClassesScrollbar(container, thumbRef.current);
    initClassesOverscroll(container);
  }, []);

  return (
    <>
      <div className="classes-container" data-dynamic="true" ref={containerRef}>
        {m.items.map((item) => {
          if (item.type === "divider") return <div key={item.id} className="domain-current-divider" aria-hidden="true" />;
          if (item.type === "hint") return <EmptyHint key={item.id} />;
          return (
            <ClassCard
              key={item.id}
              item={item}
              inClass={item.kind !== "sample" && (item.built.periodIndex ?? null) === m.inClassPeriod && m.inClassPeriod !== null}
              currentLabel={item.currentLabel}
              page={cardPage}
            />
          );
        })}
      </div>
      <div className="classes-scrollbar" aria-hidden="true">
        <div className="classes-scrollbar-thumb" ref={thumbRef} />
      </div>

      {/* Under the cards' right end: scroll them one card back or forward
          (see initCardScrollButtons). Hidden while they all fit. */}
      <div className="domain-card-nav" id="domain-card-nav" hidden ref={navRef}>
        <button type="button" className="domain-card-nav-btn" id="domain-card-prev" aria-label="Previous class" ref={prevRef}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12 4.5L6.5 10l5.5 5.5" />
          </svg>
        </button>
        <button type="button" className="domain-card-nav-btn" id="domain-card-next" aria-label="Next class" ref={nextRef}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8 4.5l5.5 5.5L8 15.5" />
          </svg>
        </button>
      </div>

      {/* Admin-authored posts (see the Posts admin page), hidden until
          there's something to show. */}
      <div className="domain-posts" id="domain-posts" hidden={posts.length === 0}>
        {sortPosts(posts).map((post, index) => (
          <div className="domain-post-card" key={index}>
            <h3 className="domain-post-title">{post.title}</h3>
            <p className="domain-post-body">{post.body}</p>
            {post.linkUrl ? (
              <a className="domain-post-link" href={post.linkUrl} target="_blank" rel="noopener noreferrer">
                Learn More →
              </a>
            ) : null}
          </div>
        ))}
      </div>
      <ScoreDatePickers />
    </>
  );
}

// My Courses is a popup, so it opens directly.
function EmptyHint() {
  return (
    <p className="domain-empty-hint">
      Start by adding your
      <br />
      courses at{" "}
      <button
        type="button"
        className="domain-empty-hint-link"
        onClick={() => {
          if (typeof openMyCoursesModal === "function") openMyCoursesModal();
        }}
      >
        My Courses
      </button>
    </p>
  );
}
