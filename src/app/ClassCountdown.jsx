import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { currentUid, loadPeriods } from "../shell/data.js";
import { refreshPrivacyBlur } from "../shell/preferences.js";
import { currentScheduleBlock } from "../shell/schedule.js";
import { loadScheduleData } from "../shell/school.js";
import { CLOSE_POPUPS_EVENT, animateNumberChange } from "../shell/ui.js";
import { closeTodaySchedule, isTodayScheduleOpen, openTodaySchedule, renderTodaySchedule, setCountdownPill } from "./todaySchedule.js";

// The time-left pill in the tab bar, which opens today's schedule (from
// class-countdown.js). Not there until a class first counts down; hidden
// between classes. Its time rolls (animateNumberChange owns that text).
export function ClassCountdown() {
  const pillRef = useRef(null);
  const [pill, setPill] = useState(null); // { hidden, label } once it's been needed

  useEffect(() => {
    let live = true;
    let timer = null;

    const update = () => {
      const current = currentScheduleBlock();
      let label = null;
      if (current) {
        if (current.block.type === "lunch") label = "Lunch";
        else if (current.block.type === "testing") label = "Testing Block";
        else if (current.block.type === "support") label = "Academic Support";
        else if (current.block.type === "advisory") label = "Advisory";
        else {
          // Signed out there are no course names to show, so a class is named by
          // its period; signed in, a period with no course isn't a class.
          const course = (loadPeriods()[current.block.periodIndex] || "").trim();
          label = course || (currentUid ? null : `Period ${current.block.periodIndex + 1}`);
        }
      }
      if (!label) {
        if (pillRef.current) flushSync(() => setPill((last) => last && { ...last, hidden: true }));
        closeTodaySchedule();
        return;
      }

      // A pill reappearing shouldn't roll from a stale number left over from
      // before.
      const wasHidden = !pillRef.current || pillRef.current.hidden;
      flushSync(() => setPill({ hidden: false, label }));
      const el = pillRef.current;

      // Rounded up, so the last minute reads "1m" rather than "0m", and the
      // count never shows less time than is really left.
      const timeText = `${Math.max(1, Math.ceil(current.minutesLeft))}m`;
      // The open schedule's copy reads it from here, as the pill's own may be
      // mid-roll.
      el.dataset.timeText = timeText;
      animateNumberChange(el.querySelector(".class-countdown-time"), timeText, wasHidden ? "instant" : undefined);
      if (isTodayScheduleOpen()) renderTodaySchedule();
    };

    // Just after each second on the clock, rather than every 1000ms from
    // whenever the page loaded: that drifted against the clock's seconds, so
    // the schedule's to-the-second countdown sometimes held a number for two
    // ticks and then skipped one.
    const tick = () => {
      timer = setTimeout(() => {
        update();
        tick();
      }, 1000 - (Date.now() % 1000) + 20);
    };

    // The open schedule folds away when another popup (a pill's details) opens.
    window.addEventListener(CLOSE_POPUPS_EVENT, closeTodaySchedule);

    loadScheduleData(() =>
      // Out of this effect, which can't draw at once.
      queueMicrotask(() => {
        if (!live) return;
        // "During School" blur depends on this data, so it can only be
        // decided now.
        refreshPrivacyBlur();
        update();
        // The callback can fire twice (cache, then fetch); a second timer
        // would double every tick.
        clearTimeout(timer);
        tick();
      })
    );
    return () => {
      live = false;
      window.removeEventListener(CLOSE_POPUPS_EVENT, closeTodaySchedule);
      clearTimeout(timer);
      closeTodaySchedule();
    };
  }, []);

  const attach = (el) => {
    pillRef.current = el;
    setCountdownPill(el);
  };

  if (!pill) return null;
  return (
    <button
      type="button"
      className="class-countdown-pill"
      aria-label="Today's schedule"
      aria-haspopup="dialog"
      hidden={pill.hidden}
      ref={attach}
      onClick={() => (isTodayScheduleOpen() ? closeTodaySchedule() : openTodaySchedule())}
    >
      <svg className="class-countdown-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="class-countdown-time" />
      <span className="class-countdown-sep">·</span>
      <span className="class-countdown-label">{pill.label}</span>
    </button>
  );
}
