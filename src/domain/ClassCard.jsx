import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { fromISODate } from "../core/dates.js";
import { gradeIconPath } from "../core/grades.js";
import {
  BOX_LABELS,
  cardBoxes,
  cloneCard,
  commitScore,
  focusScore,
  newCard,
  restoreCard,
  revertScore,
  serializeCard,
  setScoreDate,
  toggleFormativeLink,
  typeScore,
  updateTargetHints,
} from "./cardState.js";
import { showFormativeLinkTipOnce } from "./linkTip.js";
import {
  SCORE_INPUT,
  TRANSPARENT_ICON,
  animateFormativeSwap,
  cellInput,
  dissolveScoreIcon,
  endFormativeSwap,
  fadeInCard,
  iconSrc,
  lockGroupsHeight,
  recalculateGroupsForBreakdown,
  repositionFormativeLinkButtons,
  revealDomainScoreBriefly,
  revealScoreRowBriefly,
  rollScoreInput,
  showCardGrades,
  uiIcon,
  updateFractionOverlay,
  updateNextAssessmentLine,
} from "./motion.js";
import { toggleScoreDatePicker } from "./ScoreDatePicker.jsx";
import { attachScoreScrollBlur, attachScoreScrollThumb, linkScoreListScroll } from "./scoreLists.js";
import { openMyCoursesModal } from "../popups/popupStore.js";
import { formatPreferredDate, getPreferences } from "../shell/preferences.js";
import { ROLL_DURATION_MS, attachHoverTooltip } from "../shell/ui.js";

// Label clicks on the icon focus the input too; mousedown, which always comes
// first, records which was clicked, so the whole value is selected.
let scoreFocusViaIcon = null;

// One Domain card: its course, grade, breakdown and score boxes. Its scores
// are cardState.js's state; what moves (rolls, the Formative swap, the badge)
// is motion.js's, on elements this leaves to it. item comes from DomainPage:
// { id, kind: "real" | "pinned" | "sample", built, hideable, animateIn, rebuilt },
// built being the course it was made for ({ name, hasFinal, matchName,
// periodIndex }).
export function ClassCard({ item, inClass, currentLabel, page }) {
  const { built, kind } = item;
  const { name, hasFinal } = built;
  const periodIndex = built.periodIndex ?? null;
  const elRef = useRef(null);
  const [card, setCard] = useState(() => newCard(hasFinal));
  const cardRef = useRef(card);
  // Final Exam is added once the boxes' height is locked (see
  // lockGroupsHeight).
  const [locked, setLocked] = useState(false);
  // Restoring saved scores on page load shouldn't animate; later changes do.
  const settledRef = useRef(false);
  // The class in session's look comes once the card is built, with all its
  // rows, as it was marked after, so its hints fade in. Not for a pinned
  // copy's own mark or a rebuilt twin's, which came as they were put in place
  // (and so with no fade).
  const [made, setMade] = useState(false);
  const restoredRef = useRef(false);
  const pendingFx = useRef([]);
  const meta = useRef({}).current;

  const drain = () => {
    const fx = pendingFx.current;
    pendingFx.current = [];
    fx.forEach((run) => run());
  };

  const input = (box, row) => cellInput(elRef.current, box, row);

  const ctxFor = (fx, mount = false) => {
    const ctx = {
      prefs: () => getPreferences(),
      focused: (box, row) => {
        const el = input(box, row);
        return Boolean(el) && document.activeElement === el;
      },
      swapping: (row) => Boolean(input("formative", row)?._swap),
      endSwap: (row) => {
        const el = input("formative", row);
        if (el) endFormativeSwap(el);
      },
      after: (run) => fx.push(run),
      first: (run) => fx.unshift(run),
      swap: (row, toLinked, linkedText) => {
        const el = input("formative", row);
        if (!el) return;
        animateFormativeSwap(el, el.nextElementSibling, toLinked, linkedText, () =>
          change((draft) => {
            if (draft.formative[row]) draft.formative[row].original = "";
          })
        );
      },
      showLinkTip: (row) => {
        const el = input("formative", row);
        if (el) showFormativeLinkTipOnce(el);
      },
      // Under Privacy Blur the changed Formative is briefly revealed;
      // otherwise its number rolls.
      formativeChanged: (row, before, after, iconBefore) => {
        const el = input("formative", row);
        if (!el) return;
        if (document.documentElement.dataset.privacyBlur === "true") {
          revealScoreRowBriefly(el.closest("li"));
        } else {
          rollScoreInput(el, before, after);
          dissolveScoreIcon(el.parentElement.querySelector(".letter-grade"), iconSrc(iconBefore));
        }
      },
      // As recalculateCard did: draw the grade, then save the GPA list and
      // the card's scores.
      recalculated: (draft, results) => {
        const settled = settledRef.current;
        fx.push(() => showCardGrades(elRef.current, results, settled));
        page.graded(item.id, results);
        page.persist(item.id, name, serializeCard(draft, name), { mount });
      },
    };
    return ctx;
  };

  // Runs a change on a copy of the card, draws it at once, then plays what it
  // queued (rolls, swaps...), which measure what's drawn.
  const change = (fn) => {
    const draft = cloneCard(cardRef.current);
    const fx = [];
    const result = fn(draft, ctxFor(fx));
    cardRef.current = draft;
    pendingFx.current.push(...fx);
    flushSync(() => setCard(draft));
    drain();
    return result;
  };

  const reposition = () => {
    if (elRef.current) repositionFormativeLinkButtons(elRef.current);
  };

  useLayoutEffect(() => {
    const el = elRef.current;
    page.register(item.id, {
      el,
      meta,
      refreshHints: () => change((draft, ctx) => updateTargetHints(draft, ctx.prefs())),
      updateLine: (matchName, index) => updateNextAssessmentLine(el, matchName, index, meta),
      recalculateGroups: () => recalculateGroupsForBreakdown(el),
    });

    const [formativeList, summativeList] = [...el.querySelectorAll(".assessment-fs-row .score-list:not(.score-blur *)")];
    linkScoreListScroll(formativeList, summativeList);
    formativeList.addEventListener("scroll", reposition);
    summativeList.addEventListener("scroll", reposition);
    // Keeps the buttons in the same frame as a linked scroll rather than a
    // frame behind.
    formativeList._afterLinkedScroll = reposition;

    lockGroupsHeight(el);
    setLocked(true);

    const draft = cloneCard(cardRef.current);
    const fx = [];
    restoreCard(draft, page.savedScores(name), ctxFor(fx, true));
    cardRef.current = draft;
    pendingFx.current.push(...fx);
    setCard(draft);
    // Later recalculations are live changes, not the page-load restore.
    settledRef.current = true;
    el.dataset.settled = "true";
    updateNextAssessmentLine(el, built.matchName, periodIndex, meta);
    page.built(item.id);
    if (item.animateIn) fadeInCard(el);
    restoredRef.current = true;
    return () => page.unregister(item.id);
    // Once, as the card is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    drain();
    reposition();
    // Drawn with its saved rows now (the draw after the one that restored
    // them): styled as it is, then marked.
    if (restoredRef.current === "drawn" && !made) {
      void elRef.current.offsetWidth;
      setMade(true);
    }
    if (restoredRef.current === true) restoredRef.current = "drawn";
    elRef.current.querySelectorAll(".assessment-box > .score-list").forEach((list) => list._recopyScoreBlur?.());
  });

  const handlers = (box, row) => ({
    onMouseDownIcon: (event) => {
      scoreFocusViaIcon = event.currentTarget.parentElement.querySelector(SCORE_INPUT);
    },
    onFocus: (event) => {
      const el = event.currentTarget;
      const viaIcon = scoreFocusViaIcon === el;
      scoreFocusViaIcon = null;
      change((draft, ctx) => {
        if (box === "formative" && focusScore(draft, box, row, ctx)) {
          ctx.first(() => (viaIcon ? el.select() : el.setSelectionRange(el.value.length, el.value.length)));
        } else if (viaIcon) {
          ctx.first(() => el.select());
        }
      });
    },
    onChange: (event) => {
      const el = event.currentTarget;
      const typed = el.value;
      change((draft, ctx) => {
        typeScore(draft, box, row, typed);
        ctx.after(() => updateFractionOverlay(el));
      });
    },
    onBlur: (event) => {
      updateFractionOverlay(event.currentTarget);
      change((draft, ctx) => commitScore(draft, box, row, ctx));
    },
    onKeyDown: (event) => {
      const el = event.currentTarget;
      // Leaving the field commits it. Escape first puts back the last
      // committed value, so nothing changes.
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        if (event.key === "Escape") change((draft) => revertScore(draft, box, row));
        el.blur();
        if (event.key === "Enter") revealDomainScoreBriefly(elRef.current);
        return;
      }
      // Native Tab would land on this row's date button instead of the next
      // score. On the last row, native Tab order is left alone.
      if (event.key === "Tab" && !event.shiftKey) {
        const inputs = [...el.closest(".score-list").querySelectorAll(SCORE_INPUT)];
        const next = inputs[inputs.indexOf(el) + 1];
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.select();
      }
    },
    // Stops the focused score from blurring, which would start the unreveal
    // animation and swallow this click.
    onMouseDownDate: (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleScoreDatePicker(
        event.currentTarget,
        () => cardRef.current[box][row]?.date,
        (iso) => {
          if (!cardRef.current[box][row]) return;
          change((draft) => {
            setScoreDate(draft, box, row, iso);
            page.persist(item.id, name, serializeCard(draft, name), {});
          });
        }
      );
    },
  });

  const toggleLink = (row) => {
    change((draft, ctx) => toggleFormativeLink(draft, row, ctx));
    // The roll can reflow the card while it plays, so the button follows the
    // row for that whole time instead of snapping.
    const trackUntil = performance.now() + ROLL_DURATION_MS + 100;
    const track = () => {
      reposition();
      if (performance.now() < trackUntil) requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
  };

  const marked = (now) => made || item.rebuilt || now;
  const className = `class-card${inClass && marked(kind === "pinned") ? " class-card--in-class" : ""}${
    currentLabel && marked(false) ? " class-card--current-label" : ""
  }`;
  const real = kind === "real" ? "true" : kind === "pinned" ? "pinned" : undefined;

  return (
    <div
      className={className}
      ref={elRef}
      data-card-name={name}
      data-real={real}
      data-period-index={kind === "sample" ? undefined : String(periodIndex)}
      data-pinned={kind === "pinned" ? "true" : undefined}
    >
      {item.hideable ? (
        <button type="button" className="card-hide-btn" aria-label="Hide course" onClick={() => page.hide(item.id, name)}>
          <img className="card-hide-icon" src={uiIcon("hide.png")} alt="" />
        </button>
      ) : null}
      <h2
        className={`class-name${periodIndex !== null ? " class-name--editable" : ""}`}
        onClick={periodIndex !== null ? () => openMyCoursesModal(periodIndex) : undefined}
      >
        {name}
      </h2>
      {/* The grade's text and badge belong to showCardGrades. */}
      <div className="grade-summary">
        <span className="grade-value" data-empty="true">
          --
        </span>
      </div>
      {/* Stacked in one grid cell so switching between them doesn't change
          the height (see setBreakdownState). */}
      <p className="grade-breakdown" data-state="empty">
        <span className="breakdown-empty">No grades yet</span>
        <span className="breakdown-values">
          <BreakdownSegment label="FA" meaning="Formative Average" />{" "}
          <span className="divider">|</span>{" "}
          <BreakdownSegment label="SA" meaning="Summative Average" />{" "}
          <span className="divider">|</span>{" "}
          <BreakdownSegment label="D" meaning="Domain (unrounded)" />
        </span>
        <span className="breakdown-single">
          <span className="breakdown-single-label" /> <span className="breakdown-value">-</span>
        </span>
      </p>
      <div className="assessment-groups">
        {/* Inside .assessment-groups so it takes from the same fixed height
            budget, shrinking the boxes instead of growing every card in the
            row. Its text is updateNextAssessmentLine's. */}
        <p className="next-assessment-line" />
        <div className="assessment-fs-row">
          <ScoreBox box="formative" card={card} handlers={handlers} />
          <ScoreBox box="summative" card={card} handlers={handlers} />
        </div>
        {locked && cardBoxes(card).includes("final") ? <ScoreBox box="final" card={card} handlers={handlers} wide /> : null}
        {/* Here rather than in the scrolling list, so the list's overflow
            doesn't clip them. */}
        {card.formative.map((cell, row) =>
          cell.link ? (
            <LinkButton key={row} row={row} applied={cell.link.applied} card={elRef} onToggle={() => toggleLink(row)} />
          ) : null
        )}
      </div>
    </div>
  );
}

// Hovering spells out the abbreviation.
function BreakdownSegment({ label, meaning }) {
  const attach = (el) => {
    if (el && !el._tooltip) {
      el._tooltip = true;
      attachHoverTooltip(el, meaning);
    }
  };
  return (
    <span className="breakdown-segment" ref={attach}>
      {`${label} `}
      <span className="breakdown-value">-</span>
    </span>
  );
}

function ScoreBox({ box, card, handlers, wide }) {
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const blurRef = useRef(null);
  const thumbRef = useRef(null);

  useLayoutEffect(() => {
    attachScoreScrollBlur(boxRef.current, listRef.current, blurRef.current);
    attachScoreScrollThumb(boxRef.current, listRef.current, thumbRef.current);
  }, []);

  return (
    <div className={`assessment-box${wide ? " assessment-box--wide" : ""}`} data-base-weight={card.weights[box]} ref={boxRef}>
      <span className="assessment-label">{BOX_LABELS[box]}</span>
      <ul className="score-list" ref={listRef}>
        {card[box].map((cell, row) => (
          <ScoreRow key={row} cell={cell} on={handlers(box, row)} />
        ))}
      </ul>
      <div className="score-blur" aria-hidden="true" inert ref={blurRef} />
      <div className="score-scroll-thumb" hidden ref={thumbRef} />
    </div>
  );
}

function ScoreRow({ cell, on }) {
  const { icon, target } = cell;
  const iconClass = `letter-grade${icon ? (icon.preview ? " letter-grade--preview" : "") : " letter-grade--empty"}`;
  return (
    <li>
      <label>
        <img
          className={iconClass}
          src={icon ? gradeIconPath(icon.slug) : TRANSPARENT_ICON}
          alt={icon ? icon.label : ""}
          data-slug={icon ? icon.slug : undefined}
          onMouseDown={on.onMouseDownIcon}
        />
        {/* Not a real placeholder, so it can sit further left without
            moving the caret's starting point. */}
        <span className="score-type-hint">{cell.typeHint}</span>
        <input
          className="score-value"
          type="text"
          inputMode="decimal"
          value={cell.value}
          data-raw-value={cell.rawValue}
          data-last-valid={cell.lastValid}
          data-unlinked={cell.unlinked}
          onChange={on.onChange}
          onFocus={on.onFocus}
          onBlur={on.onBlur}
          onKeyDown={on.onKeyDown}
        />
        {/* Only filled when a higher Summative has replaced this Formative.
            Right after the input, which the swap relies on. */}
        <span className="score-original">{cell.original}</span>
        <span className="score-date-label" data-iso-date={cell.date}>
          {cell.date ? formatPreferredDate(fromISODate(cell.date)) : ""}
        </span>
        <button type="button" className="score-date-btn" aria-label="Show date" onMouseDown={on.onMouseDownDate}>
          <img className="score-date-icon" src={uiIcon("date.png")} alt="" />
        </button>
        {/* Not a real placeholder, so it can hold the grade circle. */}
        <span className="score-target" aria-hidden="true">
          {target ? (
            <>
              {`${target.decimals ? target.score.toFixed(1) : target.score} for `}
              <span className="score-target-grade" role="img" aria-label={target.tier.label}>
                <span
                  className="score-target-letter"
                  style={{ "--letter": `url('${new URL(gradeIconPath(target.tier.slug), document.baseURI).href}')` }}
                />
              </span>
            </>
          ) : null}
        </span>
      </label>
    </li>
  );
}

// Says what a click would do; the row's original score shows while it's
// hovered, as the button sits outside the row and CSS :hover on the row
// can't react to it. Placed by repositionFormativeLinkButtons.
function LinkButton({ row, applied, card, onToggle }) {
  const attach = (el) => {
    if (!el) return;
    el._row = row;
    el._label = applied ? "Unlink" : "Link";
    if (!el._tooltip) {
      el._tooltip = true;
      attachHoverTooltip(el, () => el._label);
    }
  };
  const rowEl = () => cellInput(card.current, "formative", row)?.closest("li");
  return (
    <button
      type="button"
      className="formative-link-btn"
      ref={attach}
      // Prevents blurring the focused field, so a click never races the
      // blur-triggered recalculation.
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onMouseEnter={() => rowEl()?.classList.add("force-original")}
      onMouseLeave={() => rowEl()?.classList.remove("force-original")}
    >
      <img className="formative-link-icon" alt="" src={uiIcon(applied ? "unlink.png" : "link.png")} />
    </button>
  );
}
