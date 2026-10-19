# KIS Cal

A grade calculator, assessment calendar and GPA tool for KIS students. Grades are
encrypted on each student's device; courses, assessments and the bell schedule
are stored in Firebase.

## Run it

```
npm install
npm run dev        # http://localhost:5173, with the same redirects as Firebase Hosting
npm test           # the tests (Vitest)
npm run build      # into dist/
firebase deploy    # builds first (see predeploy in firebase.json), then deploys dist/ and the Firestore rules
```

## Structure

One page, `index.html`; React Router picks the tab from the path (`/domain`,
`/calendar`, `/gpa`, `/assessments`, `/calendar-demo`), and Firebase
Hosting serves that page for every path.

```
index.html                                The app's one page (theme set before first paint, Firebase's compat SDK; Vite adds the bundled stylesheet)
src/app/                                  The app: main.jsx starts it; AppShell.jsx (routes, popups), TabBar.jsx (tabs and their
                                            sliding underline), Account.jsx (avatar, account menu, sign-in), ClassCountdown.jsx and
                                            todaySchedule.js (the time-left pill and the schedule it opens), DecryptionPrompt.jsx
                                            (the login key prompt), demo.js (the Calendar demo's made-up data)
src/shell/                                What every tab shares, in plain modules:
  session.js                                who's signed in and whose data is shown: the cached copy at once, confirmed from the
                                            server, then kept in step with changes made elsewhere, put in place without a reload
  data.js                                   the student's data (appData), its cache on this device, saving it, the device key
  preferences.js                            the preferences, applied as they change and saved to the account
  school.js                                 the assessments, A/B days and bell schedule, cached and refetched only when changed
  schedule.js, openTab.js                   what's on right now; how the open tab is redrawn from outside
  ui.js                                     the number roll, the toast, hover tooltips, themed icons
  firebase.js                               the Firebase app (and the switch the demo turns it off with)
src/core/                                 Logic with no page access, each with *.test.js beside it:
  catalog.js                                the course list (AP, finals, divisions, short names, combo courses)
  grades.js                                 letter grades, score entry, a Domain card's weighted grade, target scores, GPA
  schedule.js                               the bell schedule and when assessments happen
  crypto.js                                 the encryption format for the grade fields
  sync.js                                   appData's shape and the sync decisions
  dates.js                                  local YYYY-MM-DD dates
  admins.js                                 the admin email list (cosmetic; firestore.rules is the gate)
src/domain/                               The Domain tab: the cards' row (DomainPage.jsx), each card (ClassCard.jsx),
                                            its scores and rules (cardState.js, tested), the date picker; motion.js, scoreLists.js,
                                            pageScroll.js and linkTip.js keep the old animations and scrolling unchanged
src/calendar/                             The Calendar tab: React page and side panel (CalendarPage.jsx), its logic (model.js, tested),
                                            and the grids, Upcoming list and Add popup (calendar.js, classGrid.js, addPopup.js, pills.js)
                                            with their old motion unchanged
src/gpa/                                  The GPA tab; badgeMotion.js keeps the old animations
src/admin/                                The Assessments admin tab (calendar, A/B days, Bell Schedule, Suggestions); bellSchedule.js keeps the old drag code
src/popups/                               The account menu's popups (Settings, Login Key, My Courses) and Learn More
src/ui/                                   Shared React components: Modal, ConfirmDialog, Toast, SegmentedControl, ToggleSwitch
src/test/fakeFirebase.js                  In-memory Firestore and Auth for tests; records every write
src/css/                                  The stylesheets, imported by src/app/main.jsx; Vite bundles them into one minified, hashed file
public/                                   Copied into the build unchanged: fonts/, icons/, grade-icons/, js/vendor/ (QR code libraries)
firebase.json, firestore.rules            Hosting config and the security rules (the real admin gate)
```

A change made on another device (or another tab) is put in place and the open
tab redrawn from it, once nothing is being typed; signing in or out does the
same. Only Settings' "Delete all data" and the login key prompt's reset still
reload, as they clear this device's cached preferences too.

## Data (Firestore)

- `users/{uid}`: one doc per student: periods, divisions, hidden courses, their own
  assessments and completed tasks, preferences, and the encrypted `domainScores`,
  `gpaClasses` and `domainSnapshot`.
- `assessments`, `dayTypes`, `periodTimes/default`: school-wide, readable
  by anyone, written by admins. (`posts` is still there from the removed Posts
  feature; nothing reads it now.)
- `suggested`: assessments students added that the school calendar is missing.
- `meta/cacheVersions`: when each school-wide collection last changed, so pages
  only refetch what changed.

## Suggestion alerts (Mac notifications for admins)

An admin who switches on Settings > "Notify me of new suggestions" gets a
notification on their Mac when a student suggests an assessment, while KIS Cal is
open in that browser (any tab, in the background too; nothing when the browser or
the site is closed).

It watches the `suggested` list the Assessments tab already reads (anyone may read
it), so there's nothing to deploy: no function, no rules change. The choice is
kept per browser. The code is src/shell/notifications.js.
